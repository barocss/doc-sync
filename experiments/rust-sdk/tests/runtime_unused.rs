use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn manifest() -> Value {
    json!({"root":"book","marks":[],"nodes":{
        "book":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{"label":{"default":""}}},
        "spare-text":{"shape":"text"},"spare-atom":{"shape":"atom"},
        "spare-grid":{"shape":"grid","children":["spare-row"]},
        "spare-row":{"shape":"row","children":["spare-cell"]},
        "spare-cell":{"shape":"cell","children":["spare-body"]},
        "spare-body":{"shape":"flow","children":["spare-text"],"default":"spare-text"},
        "spare-box":{"shape":"flow","children":["spare-text","spare-box"],"default":"spare-text"}
    }})
}
fn checkpoint(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn history_tuple(d: &mut RuntimeDocument) -> (bool, bool, Vec<String>) {
    let h = d.history_status().unwrap();
    (h.can_undo, h.can_redo, h.pins)
}
#[test]
fn keeps_valid_unused_text_atom_grid_and_disconnected_subgraph() {
    let manifest = manifest();
    let schema = RuntimeSchema::compile(manifest.clone()).unwrap();
    assert_eq!(schema.manifest(), &manifest);
    assert_eq!(schema.effective_manifest(), &manifest);
    let restored: RuntimeSchema = serde_json::from_value(schema.dto().clone()).unwrap();
    assert_eq!(restored, schema);
    let mut d = RuntimeDocument::new("A", schema).unwrap();
    assert_eq!(d.model().unwrap()["children"][0]["type"], "line");
}
#[test]
fn validates_unused_declarations_and_missing_references() {
    let cases = [
        json!({"shape":"not-supported"}),
        json!({"shape":"text","children":["missing"]}),
        json!({"shape":"flow","children":["spare-text"],"default":"missing"}),
        json!({"shape":"row","children":["missing"]}),
        json!({"shape":"atom","attrs":{"bad":{"default":1,"min":2}}}),
        json!({"shape":"span","mark":"missing","attr":"href"}),
    ];
    for invalid in cases {
        let mut value = manifest();
        value["nodes"]["invalid-unused"] = invalid.clone();
        assert!(RuntimeSchema::compile(value).is_err(), "{invalid}");
    }
}
#[test]
fn rejects_wrong_parent_forged_birth_and_type_batch_atomically() {
    let mut d = RuntimeDocument::new("A", RuntimeSchema::compile(manifest()).unwrap()).unwrap();
    let (line, _) = d
        .insert_block(
            "line",
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    let before = checkpoint(&mut d);
    let clock = d.observed_clock().unwrap();
    let history = history_tuple(&mut d);
    let pending = d.pending_changes().to_vec();
    for kind in ["spare-text", "spare-atom", "spare-grid", "spare-box"] {
        assert!(d
            .insert_block(
                kind,
                None,
                None,
                Attributes::new(),
                EditOptions::default(),
                2.
            )
            .is_err());
        let mut birth = pending[0]
            .ops
            .iter()
            .find(|op| matches!(op, Op::Node { .. }))
            .unwrap()
            .clone();
        let next = d.next_ticket().unwrap();
        if let Op::Node { id, node_type, .. } = &mut birth {
            *id = next;
            *node_type = kind.into();
        }
        assert!(d
            .record(vec![birth.clone()], EditOptions::default(), 2.)
            .is_err());
        assert!(d.apply_remote(&[birth]).is_err());
        let at = d.next_ticket().unwrap();
        let mut invalid_at = at.clone();
        invalid_at.lamport += 1;
        let batch = vec![
            Op::Set {
                at,
                ids: vec![line.ticket().unwrap()],
                key: "label".into(),
                value: json!("valid-prefix"),
            },
            Op::Set {
                at: invalid_at,
                ids: vec![line.ticket().unwrap()],
                key: "$type".into(),
                value: json!(kind),
            },
        ];
        assert!(d.record(batch.clone(), EditOptions::default(), 3.).is_err());
        assert!(d.apply_remote(&batch).is_err());
        assert_eq!(d.observed_clock().unwrap(), clock);
        assert_eq!(history_tuple(&mut d), history);
        assert_eq!(d.pending_changes(), pending);
        assert_eq!(checkpoint(&mut d), before);
    }
}

#[test]
fn original_word_and_presentation_preserve_concurrent_peer_edits_through_restore() {
    let originals: Value = serde_json::from_str(include_str!(
        "../../runtime-document-unused/product-schemas.json"
    ))
    .unwrap();
    for (name, unused) in [("word", "divider"), ("presentation", "heading1")] {
        let schema = RuntimeSchema::compile(originals[name].clone()).unwrap();
        assert_eq!(schema.manifest(), &originals[name]);
        let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
        let mut b = RuntimeDocument::new("B", schema).unwrap();
        let options = EditOptions::default();
        let (line, _) = a
            .insert_block(
                "paragraph",
                None,
                None,
                Attributes::new(),
                options.clone(),
                1.,
            )
            .unwrap();
        for change in a.pending_changes() {
            b.apply_remote(&change.ops).unwrap();
        }
        let own = a
            .insert_text(
                Some(&line),
                "local😀",
                Attributes::new(),
                EditOptions {
                    caret_before: "before".into(),
                    caret_after: "after".into(),
                    typing: false,
                },
                2.,
            )
            .unwrap();
        let foreign = b
            .set_field_path(
                &line,
                "style",
                &["align"],
                json!("right"),
                options.clone(),
                2.,
            )
            .unwrap();
        a.apply_remote(&foreign.ops).unwrap();
        b.apply_remote(&own.ops).unwrap();
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        let expected = a.model().unwrap();
        let saved = checkpoint(&mut a);
        let pending = a.pending_changes().to_vec();
        let mut a =
            RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        assert_eq!(a.pending_changes(), pending);
        for _ in 0..2 {
            for change in &pending {
                a.apply_remote(&change.ops).unwrap();
                b.apply_remote(&change.ops).unwrap();
            }
        }
        assert_eq!(checkpoint(&mut a), saved);
        let undo = a.undo().unwrap();
        assert_eq!(undo.caret.as_deref(), Some("before"));
        b.apply_remote(&undo.ops).unwrap();
        assert!(a.model().unwrap().to_string().contains("right"));
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        let redo = a.redo().unwrap();
        assert_eq!(redo.caret.as_deref(), Some("after"));
        b.apply_remote(&redo.ops).unwrap();
        assert_eq!(a.model().unwrap(), expected);
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        let before = checkpoint(&mut a);
        assert!(a
            .insert_block(unused, None, None, Attributes::new(), options, 3.)
            .is_err());
        assert_eq!(checkpoint(&mut a), before);
        let pending = a.pending_changes().to_vec();
        a.acknowledge(&pending).unwrap();
        let mut a =
            RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint(&mut a)).unwrap())
                .unwrap();
        assert!(a.pending_changes().is_empty());
        assert_eq!(a.model().unwrap(), expected);
    }
}
