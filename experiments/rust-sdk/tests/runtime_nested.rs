use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn schema(root: &str, flow: &str, text: &str) -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":root,"marks":["strong"],"nodes":{
        root:{"shape":"flow","children":[flow,text,"root-only"],"default":text},
        flow:{"shape":"flow","children":[flow,"nested-line","rule"],"default":"nested-line","attrs":{"rank":{"default":1,"min":0,"max":5}}},
        text:{"shape":"text"},"nested-line":{"shape":"text","attrs":{"level":{"default":2,"min":0,"max":5}}},
        "rule":{"shape":"atom"},"root-only":{"shape":"atom"}
    }})).unwrap()
}
fn cp(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn block(d: &mut RuntimeDocument, kind: &str, parent: Option<&Key>, time: f64) -> (Key, Change) {
    d.insert_block_in(
        kind,
        parent,
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        time,
    )
    .unwrap()
}
fn deep(d: &mut RuntimeDocument, flow: &str) -> (Key, Key) {
    let (outer, _) = block(d, flow, None, 1.);
    let (inner, _) = block(d, flow, Some(&outer), 2.);
    (outer, inner)
}
#[test]
fn renamed_schemas_keep_per_flow_defaults_and_two_level_empty_bodies() {
    for (root, flow, text) in [
        ("article", "section", "line"),
        ("notebook", "panel", "prose"),
    ] {
        let mut d = RuntimeDocument::new("A", schema(root, flow, text)).unwrap();
        assert_eq!(d.model().unwrap()["children"][0]["type"], text);
        let (_, inner) = deep(&mut d, flow);
        let model = d.model().unwrap();
        assert_eq!(model["type"], root);
        let outer_index = model["children"]
            .as_array()
            .unwrap()
            .iter()
            .position(|n| n["type"] == flow)
            .unwrap();
        let outer = &model["children"][outer_index];
        let inner_index = outer["children"]
            .as_array()
            .unwrap()
            .iter()
            .position(|n| n["type"] == flow)
            .unwrap();
        let inner_model = &outer["children"][inner_index];
        assert_eq!(inner_model["children"][0]["type"], "nested-line");
        d.insert_text_in(
            Some(&inner),
            None,
            "x😀",
            Attributes::new(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
        assert_eq!(d.flow_text_ids(Some(&inner)).unwrap().len(), 3);
        let range = Selection {
            anchor: Position(vec![outer_index as u64, inner_index as u64, 0, 0]),
            focus: Position(vec![outer_index as u64, inner_index as u64, 0, 3]),
        };
        let anchors = d.capture_selection(Some(range.clone())).unwrap();
        assert!(anchors.is_some());
        assert_eq!(d.resolve_selection(anchors).unwrap(), Some(range));
    }
}
#[test]
fn nested_undo_redo_preserves_foreign_register_and_remote_text() {
    let s = schema("article", "section", "line");
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s).unwrap();
    let (outer, inner) = deep(&mut a, "section");
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let own = a
        .set_attribute(&outer, "rank", json!(3), EditOptions::default(), 3.)
        .unwrap();
    b.apply_remote(&own.ops).unwrap();
    let peer = b
        .set_attribute(&outer, "rank", json!(3), EditOptions::default(), 4.)
        .unwrap();
    a.apply_remote(&peer.ops).unwrap();
    let text = b
        .insert_text_in(
            Some(&inner),
            None,
            "peer😀",
            Attributes::new(),
            EditOptions::default(),
            5.,
        )
        .unwrap();
    a.apply_remote(&text.ops).unwrap();
    let expected = a.model().unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(a.model().unwrap(), expected);
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(a.model().unwrap(), expected);
}
#[test]
fn restart_retries_pending_exactly_and_acknowledges_prefix() {
    let mut a = RuntimeDocument::new("A", schema("article", "section", "line")).unwrap();
    let (_, inner) = deep(&mut a, "section");
    a.insert_text_in(
        Some(&inner),
        None,
        "restart",
        Attributes::new(),
        EditOptions::default(),
        3.,
    )
    .unwrap();
    let saved = RuntimeCheckpoint::from_json(&cp(&mut a)).unwrap();
    let mut restored = RuntimeDocument::restore(&saved).unwrap();
    assert_eq!(restored.pending_changes(), a.pending_changes());
    let before = cp(&mut restored);
    for _ in 0..2 {
        for change in restored.pending_changes().to_vec() {
            restored.apply_remote(&change.ops).unwrap();
        }
    }
    assert_eq!(cp(&mut restored), before);
    let prefix = restored.pending_changes()[..1].to_vec();
    restored.acknowledge(&prefix).unwrap();
    let after = cp(&mut restored);
    assert!(restored.acknowledge(&prefix).is_err());
    assert_eq!(cp(&mut restored), after);
    let undo = restored.undo().unwrap();
    assert!(!undo.ops.is_empty());
    let redo = restored.redo().unwrap();
    assert!(!redo.ops.is_empty());
    assert_eq!(restored.model().unwrap(), a.model().unwrap());
}
#[test]
fn invalid_nested_parent_type_batch_and_checkpoint_are_atomic() {
    let mut a = RuntimeDocument::new("A", schema("article", "section", "line")).unwrap();
    let (outer, inner) = deep(&mut a, "section");
    let before = cp(&mut a);
    assert!(a
        .insert_block_in(
            "root-only",
            Some(&inner),
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            3.
        )
        .is_err());
    assert_eq!(cp(&mut a), before);
    assert!(a
        .insert_text_in(
            Some(&Key::parse("999@missing").unwrap()),
            None,
            "bad",
            Attributes::new(),
            EditOptions::default(),
            3.
        )
        .is_err());
    assert_eq!(cp(&mut a), before);
    assert!(a
        .insert_text_in(
            Some(&inner),
            Some(&outer),
            "bad",
            Attributes::new(),
            EditOptions::default(),
            3.
        )
        .is_err());
    assert_eq!(cp(&mut a), before);
    let at = a.next_ticket().unwrap();
    assert!(a
        .record(
            vec![
                Op::Set {
                    at: at.clone(),
                    ids: vec![outer.ticket().unwrap()],
                    key: "rank".into(),
                    value: json!(2)
                },
                Op::Set {
                    at: Ticket {
                        lamport: at.lamport + 1,
                        actor: at.actor
                    },
                    ids: vec![inner.ticket().unwrap()],
                    key: "rank".into(),
                    value: json!(99)
                }
            ],
            EditOptions::default(),
            4.
        )
        .is_err());
    assert_eq!(cp(&mut a), before);
    let mut corrupt: Value = serde_json::from_str(&before).unwrap();
    corrupt["native"]["document"]["schema"] = json!("wrong");
    assert!(RuntimeCheckpoint::from_json(&corrupt.to_string()).is_err());
    assert_eq!(cp(&mut a), before);
}
#[test]
fn own_nested_deletion_undo_does_not_cancel_foreign_deletion() {
    let s = schema("article", "section", "line");
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s).unwrap();
    let (_, inner) = deep(&mut a, "section");
    let text = a
        .insert_text_in(
            Some(&inner),
            None,
            "AB",
            Attributes::new(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let ids = a.flow_text_ids(Some(&inner)).unwrap();
    assert_eq!(text.ops.len(), 1);
    let own = a.delete(&ids, EditOptions::default(), 4.).unwrap();
    let foreign = b.delete(&ids[..1], EditOptions::default(), 4.).unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    b.apply_remote(&own.ops).unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(a.flow_text_ids(Some(&inner)).unwrap(), ids[1..]);
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert!(a.flow_text_ids(Some(&inner)).unwrap().is_empty());
    assert_eq!(a.model().unwrap(), b.model().unwrap());
}
#[test]
fn two_runtime_documents_coexist_and_move_a_populated_subtree() {
    let first = schema("article", "section", "line");
    let second = schema("notebook", "panel", "prose");
    assert_ne!(first.identity(), second.identity());
    let mut a = RuntimeDocument::new("A", first).unwrap();
    let mut other = RuntimeDocument::new("A", second).unwrap();
    let other_before = cp(&mut other);
    let (outer, inner) = deep(&mut a, "section");
    a.insert_text_in(
        Some(&inner),
        None,
        "retained😀",
        Attributes::new(),
        EditOptions::default(),
        3.,
    )
    .unwrap();
    let ids = a.flow_text_ids(Some(&inner)).unwrap();
    let moved = a
        .reparent_block(&inner, None, Some(&outer), EditOptions::default(), 4.)
        .unwrap();
    assert!(!moved.ops.is_empty());
    assert_eq!(a.flow_text_ids(Some(&inner)).unwrap(), ids);
    let model_after = a.model().unwrap();
    a.undo().unwrap();
    a.redo().unwrap();
    assert_eq!(a.model().unwrap(), model_after);
    assert_eq!(cp(&mut other), other_before);
    assert!(other.restore_checkpoint(&a.checkpoint().unwrap()).is_err());
    assert_eq!(cp(&mut other), other_before);
}
#[test]
fn move_after_a_previously_moved_block_uses_its_current_placement() {
    let mut d = RuntimeDocument::new("A", schema("article", "section", "line")).unwrap();
    let (outer, inner) = deep(&mut d, "section");
    let (sibling, _) = block(&mut d, "section", Some(&outer), 3.);
    d.reparent_block(&inner, None, Some(&outer), EditOptions::default(), 4.)
        .unwrap();
    d.reparent_block(&sibling, None, Some(&inner), EditOptions::default(), 5.)
        .unwrap();
    let model = d.model().unwrap();
    let visible = model["children"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["type"] == "section")
        .count();
    assert_eq!(visible, 3);
    let saved = RuntimeCheckpoint::from_json(&cp(&mut d)).unwrap();
    let mut restored = RuntimeDocument::restore(&saved).unwrap();
    assert_eq!(restored.model().unwrap(), model);
    restored.undo().unwrap();
    restored.redo().unwrap();
    assert_eq!(restored.model().unwrap(), model);
}
