use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","list","table"],"default":"paragraph"},
        "paragraph":{"shape":"text"},"list":{"shape":"group","children":["item"],"by":[]},"item":{"shape":"text"},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["cell-body"]},
        "cell-body":{"shape":"flow","children":["paragraph"],"default":"paragraph"}
    }})).unwrap()
}
fn p(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"cell-body","children":[p(text)]}]})
}
fn grid() -> Value {
    json!({"type":"table","children":[{"type":"row","children":[cell("")]},{"type":"row","children":[cell("")]}]})
}
fn insert(at: &[usize], model: Value) -> ModelInsert {
    ModelInsert {
        at: at.into(),
        model,
    }
}
fn cp(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn batch(doc: &mut RuntimeDocument, commands: &[ModelInsert]) -> ModelInsertBatchResult {
    doc.insert_models_batch(commands, EditOptions::default(), 10.)
        .unwrap()
}
fn projected(doc: &mut RuntimeDocument) {
    doc.reparent_block(&Key::root(), None, None, EditOptions::default(), 1.)
        .unwrap();
}

#[test]
fn evolving_multirow_batch_is_one_change_and_one_history_action() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let before = doc.model().unwrap();
    let out = batch(
        &mut doc,
        &[
            insert(&[1], grid()),
            insert(&[1, 0, 1], cell("A")),
            insert(&[1, 1, 1], cell("B")),
            insert(&[1, 0, 1, 0, 1], p("C")),
        ],
    );
    assert_eq!(out.keys[1], out.keys[2]);
    assert_eq!(
        out.change
            .ops
            .iter()
            .filter(
                |op| matches!(op.raw_operation(), Op::Node {node_type,..} if node_type == "col")
            )
            .count(),
        2
    );
    assert_eq!(doc.pending_changes(), &[out.change.clone()]);
    let model = doc.model().unwrap();
    assert_eq!(
        model["children"][1]["children"][0]["children"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        model["children"][1]["children"][1]["children"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), before);
    assert!(!doc.history_status().unwrap().can_undo);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), model);
}

#[test]
fn later_failure_preserves_history_pending_clock_and_model() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    batch(&mut doc, &[insert(&[1], p("seed"))]);
    doc.undo().unwrap();
    let before = cp(&mut doc);
    for bad in [
        insert(&[999, 0], p("bad")),
        insert(&[], p("bad")),
        insert(&[0], json!({"type":"unknown"})),
    ] {
        assert!(doc
            .insert_models_batch(&[insert(&[1], grid()), bad], EditOptions::default(), 2.)
            .is_err());
        assert_eq!(cp(&mut doc), before);
    }
}

#[test]
fn empty_groups_and_grids_report_no_key_with_exact_preparation_behavior() {
    for projection in [false, true] {
        for index in [0, 1] {
            for model in [
                json!({"type":"list","children":[]}),
                json!({"type":"table","children":[]}),
                json!({"type":"table","children":[{"type":"row","children":[]}]}),
            ] {
                let mut doc = RuntimeDocument::new("A", schema()).unwrap();
                if projection {
                    projected(&mut doc);
                }
                let is_group = model["type"] == "list";
                let before = doc.model().unwrap();
                let out = batch(&mut doc, &[insert(&[index], model)]);
                assert_eq!(out.keys, vec![None]);
                let prepared = index == 0 && !is_group;
                assert_eq!(out.clock_after - out.clock_before, u64::from(prepared));
                assert_eq!(out.change.ops.len(), usize::from(prepared && !projection));
                assert_eq!(doc.model().unwrap() == before, !prepared || projection);
            }
        }
    }
}

#[test]
fn trailing_reservations_restore_and_clock_only_preserves_redo_and_pending() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    projected(&mut doc);
    let out = batch(
        &mut doc,
        &[
            insert(&[1], p("A")),
            insert(&[0], json!({"type":"table","children":[]})),
        ],
    );
    let max = out
        .change
        .ops
        .iter()
        .map(|op| match op.raw_operation() {
            Op::Node { id, .. } | Op::Text { id, .. } => id.lamport,
            Op::Set { at, .. }
            | Op::Delete { at, .. }
            | Op::Undelete { at, .. }
            | Op::Move { at, .. } => at.lamport,
            _ => unreachable!(),
        })
        .max()
        .unwrap();
    assert_eq!(out.clock_after, max + 1);
    let saved: Value = serde_json::from_str(&cp(&mut doc)).unwrap();
    assert_eq!(
        saved["native"]["document"]["reservedClock"],
        out.clock_after
    );
    doc = RuntimeDocument::restore(&doc.checkpoint().unwrap()).unwrap();
    assert_eq!(doc.observed_clock().unwrap(), out.clock_after);
    assert_eq!(doc.next_ticket().unwrap().lamport, out.clock_after + 1);
    doc.undo().unwrap();
    let before: Value = serde_json::from_str(&cp(&mut doc)).unwrap();
    assert!(before["native"]["document"].get("reservedClock").is_none());
    let noop = batch(&mut doc, &[]);
    assert!(noop.change.ops.is_empty());
    assert_eq!(noop.clock_before, noop.clock_after);
    let reserved = batch(
        &mut doc,
        &[insert(&[0], json!({"type":"table","children":[]}))],
    );
    assert!(reserved.change.ops.is_empty());
    assert_eq!(reserved.clock_after, reserved.clock_before + 1);
    let after: Value = serde_json::from_str(&cp(&mut doc)).unwrap();
    assert_eq!(before["native"]["history"], after["native"]["history"]);
    assert_eq!(before["pending"], after["pending"]);
    assert_eq!(
        after["native"]["document"]["reservedClock"],
        reserved.clock_after
    );
    assert!(doc.history_status().unwrap().can_redo);
}

#[test]
fn column_memo_survives_intervening_insert_but_same_row_allocates_again() {
    for same_row in [false, true] {
        let mut doc = RuntimeDocument::new("A", schema()).unwrap();
        batch(&mut doc, &[insert(&[1], grid())]);
        let out = batch(
            &mut doc,
            &[
                insert(&[1, 0, 1], cell("A")),
                insert(&[2], p("between")),
                insert(&[1, usize::from(!same_row), 1], cell("B")),
            ],
        );
        assert_eq!(
            out.change
                .ops
                .iter()
                .filter(
                    |op| matches!(op.raw_operation(),Op::Node{node_type,..} if node_type=="col")
                )
                .count(),
            if same_row { 2 } else { 1 }
        );
    }
}

#[test]
fn foreign_text_survives_batch_undo_and_redo() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let out = batch(
        &mut doc,
        &[
            insert(&[1], grid()),
            insert(&[1, 0, 1], cell("A")),
            insert(&[1, 1, 1], cell("B")),
        ],
    );
    let mut peer = RuntimeDocument::new("B", schema()).unwrap();
    peer.apply_remote(&out.change.ops).unwrap();
    let foreign = peer
        .insert_text_at(
            &Key::root(),
            None,
            "FOREIGN",
            Attributes::new(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    doc.apply_remote(&foreign.ops).unwrap();
    let with_foreign = doc.model().unwrap();
    doc.undo().unwrap();
    assert_eq!(
        doc.model().unwrap()["children"][0]["runs"][0]["units"],
        json!([70, 79, 82, 69, 73, 71, 78])
    );
    assert!(!doc.history_status().unwrap().can_undo);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), with_foreign);
}

#[test]
fn presentation_empty_group_normalizes_before_stored_child_admission() {
    let products: Value = serde_json::from_str(include_str!(
        "../../runtime-document-unused/product-schemas.json"
    ))
    .unwrap();
    let schema = RuntimeSchema::compile(products["presentation"].clone()).unwrap();
    let mut doc = RuntimeDocument::new("A", schema).unwrap();
    doc.insert_model_at(
        &[1],
        json!({"type":"slide","children":[]}),
        EditOptions::default(),
        1.,
    )
    .unwrap();
    let before = cp(&mut doc);
    let empty = json!({"type":"list","children":[]});
    let result = batch(&mut doc, &[insert(&[1, 0], empty.clone())]);
    assert_eq!(result.keys, vec![None]);
    assert!(result.change.ops.is_empty());
    assert_eq!(result.clock_before, result.clock_after);
    assert_eq!(cp(&mut doc), before);
    assert!(doc
        .insert_models_batch(
            &[insert(&[1, 999], empty.clone())],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    assert!(doc
        .insert_model_at(&[1, 0], empty, EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
}
