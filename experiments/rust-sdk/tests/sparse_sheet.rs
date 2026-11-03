use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn sheet(actor: &str) -> SparseSheet {
    SparseSheet::new(SparseSheetOptions {
        actor: actor.into(),
        sheet_id: "sheet".into(),
        rows: 1_000_000_000,
        columns: 1_000_000,
    })
    .unwrap()
}
fn patch(value: Value) -> SparseCellPatch {
    serde_json::from_value(value).unwrap()
}
fn set(s: &mut SparseSheet, r: u64, c: u64, value: Value) -> Vec<SparseSheetOp> {
    s.set_cell(r, c, patch(value)).unwrap()
}
fn cell(s: &SparseSheet, r: u64, c: u64) -> Value {
    serde_json::to_value(s.get_cell(r, c).unwrap()).unwrap()
}
fn range() -> SparseRange {
    SparseRange {
        row: 0,
        column: 0,
        row_count: 1_000_000_000,
        column_count: 1_000_000,
        limit: None,
    }
}

#[test]
fn huge_implicit_axes_and_reads_stay_sparse() {
    let mut s = sheet("A");
    let before = s.checkpoint();
    assert!(s.get_cell(999_999_999, 999_999).unwrap().is_empty());
    assert!(s.get_range(range()).unwrap().is_empty());
    assert_eq!(s.checkpoint(), before);
    assert!(before.to_json().unwrap().len() < 4096);
    set(
        &mut s,
        999_999_999,
        999_999,
        json!({"value":"far","bold":true}),
    );
    assert_eq!(
        cell(&s, 999_999_999, 999_999),
        json!({"value":"far","bold":true})
    );
    assert_eq!(s.stats().registers, 2);
    assert!(s.checkpoint().to_json().unwrap().len() < 8192);
}

#[test]
fn first_writes_merge_independent_fields_and_ascii_actor_ties() {
    let mut a = sheet("A");
    let mut z = sheet("z");
    let ao = set(&mut a, 7, 9, json!({"fill":"#fff","value":"A"}));
    let zo = set(&mut z, 7, 9, json!({"bold":true,"value":"z"}));
    assert_eq!(ao[0].field, SparseField::Value);
    assert_eq!(ao[1].field, SparseField::Fill);
    a.receive(&zo).unwrap();
    z.receive(&ao).unwrap();
    assert_eq!(
        cell(&a, 7, 9),
        json!({"value":"z","fill":"#fff","bold":true})
    );
    assert_eq!(cell(&a, 7, 9), cell(&z, 7, 9));
}

#[test]
fn sequential_history_links_survive_checkpoint_replay() {
    let mut a = sheet("A");
    set(&mut a, 0, 0, json!({"value":1}));
    set(&mut a, 0, 0, json!({"value":2}));
    let mut b = sheet("B");
    b.receive(a.pending_changes()).unwrap();
    a.receive(&set(&mut b, 0, 0, json!({"bold":true}))).unwrap();
    a.undo().unwrap();
    let saved = SparseSheetCheckpoint::from_json(&a.checkpoint().to_json().unwrap()).unwrap();
    let mut restored = SparseSheet::from_state(saved.to_value()).unwrap();
    for s in [&mut a, &mut restored] {
        assert_eq!(cell(s, 0, 0), json!({"value":1.0,"bold":true}));
        s.undo().unwrap();
        assert_eq!(cell(s, 0, 0), json!({"bold":true}));
        s.redo().unwrap();
        s.redo().unwrap();
        assert_eq!(cell(s, 0, 0), json!({"value":2.0,"bold":true}));
    }
    assert_eq!(a.checkpoint(), restored.checkpoint());
}

#[test]
fn peer_same_value_fences_only_observed_writer() {
    let mut a = sheet("A");
    let mut b = sheet("B");
    b.receive(&set(&mut a, 0, 0, json!({"value":12,"bold":true})))
        .unwrap();
    a.receive(&set(&mut b, 0, 0, json!({"value":12}))).unwrap();
    let undo = a.undo().unwrap();
    assert_eq!(undo.len(), 1);
    assert_eq!(undo[0].field, SparseField::Bold);
    assert_eq!(cell(&a, 0, 0), json!({"value":12.0}));
    a.redo().unwrap();
    assert_eq!(cell(&a, 0, 0), json!({"value":12.0,"bold":true}));
}

#[test]
fn clear_retains_tombstones_and_shuffled_duplicate_delivery_is_exact() {
    let mut a = sheet("A");
    let old = set(
        &mut a,
        5,
        6,
        json!({"value":5,"formula":"=5","fill":"red","bold":true,"numberFormat":"0"}),
    );
    let clear = set(
        &mut a,
        5,
        6,
        json!({"value":null,"formula":null,"fill":null,"bold":null,"numberFormat":null}),
    );
    let mut b = sheet("B");
    let mut shuffled = clear.clone();
    shuffled.extend(old.clone());
    shuffled.extend(clear);
    b.receive(&shuffled).unwrap();
    assert_eq!(cell(&b, 5, 6), json!({}));
    assert_eq!(b.stats().registers, 5);
    assert!(b.get_range(range()).unwrap().is_empty());
    let before = b.checkpoint();
    b.receive(&old).unwrap();
    assert_eq!(b.checkpoint(), before);
    a.undo().unwrap();
    assert_eq!(
        cell(&a, 5, 6),
        json!({"value":5.0,"formula":"=5","fill":"red","bold":true,"numberFormat":"0"})
    );
}

#[test]
fn malformed_json_envelopes_do_not_commit_the_valid_prefix() {
    let op = set(&mut sheet("source"), 2, 3, json!({"value":"valid"}))[0].clone();
    let mutations = vec![
        json!({}),
        json!({"row":-1}),
        json!({"column":0.5}),
        json!({"sheetId":"other"}),
        json!({"field":"unknown"}),
        json!({"value":{}}),
        json!({"field":"bold","value":"true"}),
        json!({"at":{"actor":"~root","lamport":1}}),
        json!({"at":{"actor":"x@y","lamport":1}}),
        json!({"at":{"actor":"p","lamport":0}}),
        json!({"at":{"actor":"p","lamport":9_007_199_254_740_992u64}}),
    ];
    let mut target = sheet("target");
    let before = target.checkpoint();
    for mutation in mutations {
        let mut bad = serde_json::to_value(&op).unwrap();
        if mutation == json!({}) {
            bad.as_object_mut().unwrap().remove("value");
        } else {
            for (k, v) in mutation.as_object().unwrap() {
                bad[k] = v.clone();
            }
        }
        assert!(
            target.receive_json(&json!([op, bad]).to_string()).is_err(),
            "{bad}"
        );
        assert_eq!(target.checkpoint(), before);
    }
    let mut extra = serde_json::to_value(&op).unwrap();
    extra["surprise"] = json!(1);
    assert!(target
        .receive_json(&json!([op, extra]).to_string())
        .is_err());
    assert_eq!(target.checkpoint(), before);
}

#[test]
fn losing_ids_and_in_batch_conflicts_are_retained_and_atomic() {
    let mut a = sheet("A");
    let old = set(&mut a, 0, 0, json!({"value":1}));
    let newer = set(&mut a, 0, 0, json!({"value":2}));
    let mut b = sheet("B");
    let mut batch = newer;
    batch.extend(old.clone());
    b.receive(&batch).unwrap();
    let before = b.checkpoint();
    let mut bad = old[0].clone();
    bad.value = SparseValue::Number(99.0);
    assert!(b.receive(&[bad.clone()]).is_err());
    assert_eq!(b.checkpoint(), before);
    let mut fresh = sheet("fresh");
    assert!(fresh.receive(&[old[0].clone(), bad]).is_err());
    assert_eq!(fresh.stats().retained_ops, 0);
    assert_eq!(fresh.stats().clock, 0);
}

#[test]
fn same_actor_forks_and_invalid_typed_values_fail_atomically() {
    let op = set(&mut sheet("A"), 0, 0, json!({"value":1}));
    let mut a = sheet("A");
    let before = a.checkpoint();
    assert!(a.receive(&op).is_err());
    for value in [
        SparseValue::Number(f64::NAN),
        SparseValue::Number(f64::INFINITY),
    ] {
        assert!(a
            .set_cell(0, 0, [(SparseField::Value, value)].into())
            .is_err());
    }
    assert!(a
        .set_cell(
            0,
            0,
            [(SparseField::Bold, SparseValue::Text("true".into()))].into()
        )
        .is_err());
    assert!(a.set_cell(u64::MAX, 0, patch(json!({"value":1}))).is_err());
    assert_eq!(a.checkpoint(), before);
}

#[test]
fn pending_acknowledgement_is_an_exact_prefix_and_reads_are_owned() {
    let mut a = sheet("A");
    let first = set(&mut a, 0, 0, json!({"value":1}));
    let second = set(&mut a, 0, 1, json!({"value":2}));
    let before = a.checkpoint();
    assert!(a.acknowledge(&second).is_err());
    let mut altered = first.clone();
    altered[0].row = 9;
    assert!(a.acknowledge(&altered).is_err());
    let mut detached = a.get_cell(0, 0).unwrap();
    detached.clear();
    assert_eq!(a.checkpoint(), before);
    a.acknowledge(&first).unwrap();
    assert_eq!(a.pending_changes(), second);
    a.acknowledge(&second).unwrap();
    assert!(a.pending_changes().is_empty());
}

#[test]
fn malformed_checkpoint_model_history_pending_and_journal_do_not_replace_live_state() {
    let mut a = sheet("A");
    set(&mut a, 0, 0, json!({"value":1,"bold":true}));
    set(&mut a, 0, 0, json!({"value":2}));
    a.undo().unwrap();
    let before = a.checkpoint();
    for pointer in [
        "/checkpoint/clock",
        "/checkpoint/pending/0/value",
        "/checkpoint/undo/0/0/before/value",
        "/checkpoint/redo/0/0/after/at/lamport",
        "/checkpoint/registers/0/1/value",
        "/journal/0/ops/0/value",
        "/options/actor",
    ] {
        let mut bad = before.to_value();
        *bad.pointer_mut(pointer).unwrap() = json!("forged");
        assert!(SparseSheet::from_state(bad.clone()).is_err(), "{pointer}");
        assert!(a.restore_state(bad).is_err());
        assert_eq!(a.checkpoint(), before);
    }
    let mut bad = before.to_value();
    bad["checkpoint"]["pending"]
        .as_array_mut()
        .unwrap()
        .reverse();
    assert!(a.restore_state(bad).is_err());
    assert_eq!(a.checkpoint(), before);
    let mut other = sheet("other");
    assert!(other.restore_checkpoint(&before).is_err());
}

#[test]
fn restart_retry_twice_and_history_continue_exactly() {
    let mut a = sheet("A");
    set(&mut a, 0, 0, json!({"value":"one"}));
    set(&mut a, 0, 0, json!({"value":"two"}));
    a.undo().unwrap();
    let mut restored = SparseSheet::from_state(a.checkpoint().to_value()).unwrap();
    let mut peer = sheet("peer");
    let pending = restored.pending_changes().to_vec();
    let before = restored.checkpoint();
    for _ in 0..2 {
        restored.receive(&pending).unwrap();
        peer.receive(&pending).unwrap();
    }
    assert_eq!(restored.checkpoint(), before);
    restored.redo().unwrap();
    a.redo().unwrap();
    assert_eq!(restored.checkpoint(), a.checkpoint());
    restored.undo().unwrap();
    restored.undo().unwrap();
    assert_eq!(cell(&restored, 0, 0), json!({}));
}

#[test]
fn sparse_range_is_ordered_bounded_and_read_only() {
    let mut s = sheet("A");
    for r in [999_999_999, 20, 0] {
        set(&mut s, r, 0, json!({"value":"v"}));
    }
    let before = s.checkpoint();
    let entries = s.get_range(range()).unwrap();
    assert_eq!(
        entries.iter().map(|e| e.row).collect::<Vec<_>>(),
        vec![0, 20, 999_999_999]
    );
    let mut bounded = range();
    bounded.limit = Some(2);
    assert!(s.get_range(bounded).is_err());
    let mut outside = range();
    outside.row_count = u64::MAX;
    assert!(s.get_range(outside).is_err());
    assert_eq!(s.checkpoint(), before);
}

#[test]
fn maximum_observed_clock_blocks_authoring_and_history_without_mutation() {
    let mut a = sheet("A");
    set(&mut a, 0, 0, json!({"value":1,"bold":true}));
    let mut op = set(&mut sheet("peer"), 0, 1, json!({"value":"last"}))[0].clone();
    op.at.lamport = 9_007_199_254_740_991;
    a.receive(&[op]).unwrap();
    let before = a.checkpoint();
    assert!(a.set_cell(0, 2, patch(json!({"value":1}))).is_err());
    assert!(a.undo().is_err());
    assert_eq!(a.checkpoint(), before);
}

#[test]
fn actor_and_extent_admission_match_ascii_profile() {
    for actor in ["", "~root", "x@y", "한글"] {
        assert!(SparseSheet::new(SparseSheetOptions {
            actor: actor.into(),
            sheet_id: "s".into(),
            rows: 1,
            columns: 1
        })
        .is_err());
    }
    for rows in [0, 9_007_199_254_740_992, u64::MAX] {
        assert!(SparseSheet::new(SparseSheetOptions {
            actor: "A".into(),
            sheet_id: "s".into(),
            rows,
            columns: 1
        })
        .is_err());
    }
}
