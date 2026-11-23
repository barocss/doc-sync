use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn manifest() -> Value {
    json!({"root":"root","marks":[],"markValues":{"paint":{"default":{"x":1},"values":[{"x":1},{"x":1},{"x":2}]}},"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","children":["tag"],"attrs":{"choice":{"default":{"x":1},"values":[{"x":1},{"x":1},{"x":2}]}}},
        "tag":{"shape":"inline","attrs":{"choice":{"default":{"x":1},"values":[{"x":1},{"x":1}]}}}
    }})
}
fn edges(index: usize) -> Vec<DefaultReference> {
    vec![
        DefaultReference::new(&["nodes", "line", "attrs", "choice"], index),
        DefaultReference::new(&["nodes", "tag", "attrs", "choice"], index),
        DefaultReference::new(&["markValues", "paint"], index),
    ]
}
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile_with_default_references(manifest(), edges(0)).unwrap()
}
fn snapshot(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn attrs(v: SchemaValue) -> SchemaAttributes {
    SchemaAttributes::from([("choice".into(), v)])
}
fn insert(d: &mut RuntimeDocument) -> Key {
    d.insert_block(
        "line",
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.,
    )
    .unwrap()
    .0
}
#[test]
fn dto_roundtrip_identity_preserves_graph_and_legacy_wire() {
    let s = schema();
    assert_eq!(s.manifest(), &manifest());
    assert_eq!(serde_json::to_value(&s).unwrap(), *s.dto());
    let restored: RuntimeSchema = serde_json::from_value(s.dto().clone()).unwrap();
    assert_eq!(restored.identity(), s.identity());
    let mut reordered = edges(0);
    reordered.reverse();
    assert_eq!(
        RuntimeSchema::compile_with_default_references(manifest(), reordered)
            .unwrap()
            .identity(),
        s.identity()
    );
    fn reorder_object_keys(value: &Value) -> Value {
        match value {
            Value::Object(object) => Value::Object(
                object
                    .iter()
                    .rev()
                    .map(|(k, v)| (k.clone(), reorder_object_keys(v)))
                    .collect(),
            ),
            Value::Array(array) => Value::Array(array.iter().map(reorder_object_keys).collect()),
            other => other.clone(),
        }
    }
    assert_eq!(
        RuntimeSchema::compile(reorder_object_keys(s.dto()))
            .unwrap()
            .identity(),
        s.identity()
    );
    assert_ne!(
        RuntimeSchema::compile_with_default_references(manifest(), edges(1))
            .unwrap()
            .identity(),
        s.identity()
    );
    let bare = json!({"root":"root","marks":[],"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text"}}});
    let legacy = RuntimeSchema::compile(bare.clone()).unwrap();
    assert_eq!(serde_json::to_value(&legacy).unwrap(), bare);
}
#[test]
fn explicit_alias_birth_omits_both_handles_but_distinct_enum_keeps_provenance() {
    let s = schema();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    for value in [
        s.default_value("line", "choice").unwrap(),
        s.enum_value("line", "choice", 0).unwrap(),
    ] {
        let (_, c) = d
            .insert_runtime_block("line", None, None, attrs(value), EditOptions::default(), 1.)
            .unwrap();
        assert!(matches!(&c.ops[0],Op::Node{attrs:Some(a),..} if a.is_empty()));
    }
    let (_, c) = d
        .insert_runtime_block(
            "line",
            None,
            None,
            attrs(s.enum_value("line", "choice", 1).unwrap()),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    assert!(matches!(&c.ops[0],Op::Reference{references,..} if references[0]["index"]==1));
    let (_, c) = d
        .insert_runtime_inline_at(
            &Key::root(),
            "tag",
            None,
            attrs(s.enum_value("tag", "choice", 0).unwrap()),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    assert!(matches!(&c.ops[0],Op::Node{attrs:Some(a),..} if a.is_empty()));
    for index in [None, Some(0), Some(1)] {
        let v = s.reference_value(&["markValues", "paint"], index).unwrap();
        let c = d
            .insert_runtime_text_at(
                &Key::root(),
                None,
                "x",
                SchemaAttributes::from([("paint".into(), v)]),
                EditOptions::default(),
                4.,
            )
            .unwrap();
        assert_eq!(
            matches!(&c.ops[0],Op::Text{marks,..} if marks.is_empty()),
            index != Some(1)
        );
    }
}
#[test]
fn foreign_alias_graph_equal_json_and_bad_payload_are_atomic() {
    let s = schema();
    let foreign = RuntimeSchema::compile_with_default_references(manifest(), edges(1)).unwrap();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let id = insert(&mut d);
    let before = snapshot(&mut d);
    for v in [
        foreign.enum_value("line", "choice", 0).unwrap(),
        SchemaValue::json(json!({"x":1})),
    ] {
        assert!(d
            .set_runtime_attribute(&id, "choice", v, EditOptions::default(), 2.)
            .is_err());
        assert_eq!(snapshot(&mut d), before);
    }
    let v = s.enum_value("line", "choice", 0).unwrap();
    let op = Op::Set {
        at: d.next_ticket().unwrap(),
        ids: vec![id.ticket().unwrap()],
        key: "choice".into(),
        value: json!({"x":2}),
    };
    assert!(d
        .record(
            vec![v.bind(op, &["value"]).unwrap()],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(snapshot(&mut d), before);
}
#[test]
fn invalid_alias_dtos_reject_without_changing_existing_document() {
    let s = schema();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let before = snapshot(&mut d);
    for case in [
        "empty",
        "duplicate",
        "mismatch",
        "missing",
        "unknown",
        "scalar",
    ] {
        let mut v = s.dto().clone();
        match case {
            "empty" => v["defaultReferences"] = json!([]),
            "duplicate" => {
                let edge = v["defaultReferences"][0].clone();
                v["defaultReferences"].as_array_mut().unwrap().push(edge);
            }
            "mismatch" => v["defaultReferences"][0]["enumIndex"] = json!(2),
            "missing" => {
                v["defaultReferences"][0]["at"] = json!(["nodes", "missing", "attrs", "choice"])
            }
            "unknown" => v["extra"] = json!(true),
            _ => {
                v["manifest"]["nodes"]["line"]["attrs"]["choice"] =
                    json!({"default":1,"values":[1]});
            }
        }
        assert!(RuntimeSchema::compile(v).is_err(), "{case}");
        assert_eq!(snapshot(&mut d), before);
    }
}
#[test]
fn alias_writers_delete_format_history_restart_retry_ack_converge() {
    let s = schema();
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s.clone()).unwrap();
    let id = insert(&mut a);
    b.apply_remote(&a.pending_changes()[0].ops).unwrap();
    let text = a
        .insert_runtime_text_at(
            &Key::root(),
            Some(&id),
            "x",
            SchemaAttributes::new(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    b.apply_remote(&text.ops).unwrap();
    let token = match text.ops[0].raw_operation() {
        Op::Text { id, .. } => Key::from_ticket(id),
        _ => panic!(),
    };
    let own = a
        .set_runtime_attribute(
            &id,
            "choice",
            s.enum_value("line", "choice", 0).unwrap(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    let remote = b
        .set_runtime_attribute(
            &id,
            "choice",
            s.enum_value("line", "choice", 1).unwrap(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    a.apply_remote(&remote.ops).unwrap();
    b.apply_remote(&own.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let format = a
        .format_runtime_tokens(
            &[token],
            "paint",
            s.reference_value(&["markValues", "paint"], Some(0))
                .unwrap(),
            EditOptions::default(),
            4.,
        )
        .unwrap();
    b.apply_remote(&format.ops).unwrap();
    let deletion = a.delete_block(&id, EditOptions::default(), 5.).unwrap();
    b.apply_remote(&deletion.ops).unwrap();
    let checkpoint = RuntimeCheckpoint::from_json(&snapshot(&mut a)).unwrap();
    let mut restored = RuntimeDocument::restore(&checkpoint).unwrap();
    assert_eq!(a.pending_changes(), restored.pending_changes());
    let before = snapshot(&mut restored);
    for c in restored.pending_changes().to_vec() {
        restored.apply_remote(&c.ops).unwrap();
    }
    restored.apply_remote(&remote.ops).unwrap();
    assert_eq!(snapshot(&mut restored), before);
    for redo in [false, true, false, false, true, true] {
        let c = if redo {
            restored.redo().unwrap()
        } else {
            restored.undo().unwrap()
        };
        b.apply_remote(&c.ops).unwrap();
        assert_eq!(restored.model().unwrap(), b.model().unwrap());
    }
    let pending = restored.pending_changes().to_vec();
    restored.acknowledge(&pending).unwrap();
    assert!(restored.pending_changes().is_empty());
    let restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&snapshot(&mut restored)).unwrap())
            .unwrap();
    assert!(restored.pending_changes().is_empty());
}
#[test]
fn multiple_explicit_edges_share_default_without_merging_unlinked_slots() {
    let mut m = manifest();
    m["markValues"]["paint"]["values"] = json!([{"x":1},{"x":1},{"x":1}]);
    let s = RuntimeSchema::compile_with_default_references(
        m,
        [
            DefaultReference::new(&["markValues", "paint"], 0),
            DefaultReference::new(&["markValues", "paint"], 1),
            DefaultReference::new(&["nodes", "line", "attrs", "choice"], 0),
            DefaultReference::new(&["nodes", "tag", "attrs", "choice"], 0),
        ],
    )
    .unwrap();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    for index in 0..3 {
        let c = d
            .insert_runtime_text_at(
                &Key::root(),
                None,
                "x",
                SchemaAttributes::from([(
                    "paint".into(),
                    s.reference_value(&["markValues", "paint"], Some(index))
                        .unwrap(),
                )]),
                EditOptions::default(),
                1.,
            )
            .unwrap();
        assert_eq!(
            matches!(&c.ops[0],Op::Text{marks,..} if marks.is_empty()),
            index < 2
        );
    }
}

#[test]
fn linked_enum_uses_default_payload_order_and_keeps_selected_slot_provenance() {
    let m: Value = serde_json::from_str(r#"{"root":"root","marks":[],"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text","attrs":{"choice":{"default":{"a":1,"b":2},"values":[{"b":2,"a":1},{"b":2,"a":1}]}}}}}"#).unwrap();
    let s = RuntimeSchema::compile_with_default_references(
        m,
        [DefaultReference::new(
            &["nodes", "line", "attrs", "choice"],
            0,
        )],
    )
    .unwrap();
    let default = s.default_value("line", "choice").unwrap();
    let linked = s.enum_value("line", "choice", 0).unwrap();
    let distinct = s.enum_value("line", "choice", 1).unwrap();
    assert_eq!(
        serde_json::to_string(default.value()).unwrap(),
        "{\"a\":1,\"b\":2}"
    );
    assert_eq!(
        serde_json::to_string(linked.value()).unwrap(),
        serde_json::to_string(default.value()).unwrap()
    );
    assert_eq!(
        serde_json::to_string(distinct.value()).unwrap(),
        "{\"b\":2,\"a\":1}"
    );
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s.clone()).unwrap();
    let id = insert(&mut a);
    b.apply_remote(&a.pending_changes()[0].ops).unwrap();
    let change = a
        .set_runtime_attribute(&id, "choice", linked, EditOptions::default(), 2.)
        .unwrap();
    let encoded = serde_json::to_string(&change).unwrap();
    assert!(encoded.contains("\"value\":{\"a\":1,\"b\":2}"));
    assert!(
        matches!(&change.ops[0], Op::Reference { references, .. } if references[0]["source"] == "enum" && references[0]["index"] == 0)
    );
    let change: Change = serde_json::from_str(&encoded).unwrap();
    b.apply_remote(&change.ops).unwrap();
    let saved = snapshot(&mut a);
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    assert_eq!(snapshot(&mut restored), saved);
    assert_eq!(
        serde_json::to_string(
            restored
                .schema()
                .enum_value("line", "choice", 0)
                .unwrap()
                .value()
        )
        .unwrap(),
        "{\"a\":1,\"b\":2}"
    );
    for change in [restored.undo().unwrap(), restored.redo().unwrap()] {
        let change: Change =
            serde_json::from_str(&serde_json::to_string(&change).unwrap()).unwrap();
        b.apply_remote(&change.ops).unwrap();
    }
    assert_eq!(restored.model().unwrap(), b.model().unwrap());
    assert!(snapshot(&mut restored).contains("\"value\":{\"a\":1,\"b\":2}"));
}
