use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"root","marks":[],"markValues":{"paint":{"default":{"color":"red"}}},"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","children":["tag"],"attrs":{"payload":{"default":{"x":1}},"list":{"default":[1,2]},"choice":{"default":null,"values":[{"x":1},{"x":1},[1,2]]},"other":{"default":null,"values":[{"x":1}]}}},
        "tag":{"shape":"inline","attrs":{"payload":{"default":{"x":1}}}}
    }})).unwrap()
}
fn snapshot(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn insert(doc: &mut RuntimeDocument) -> Key {
    doc.insert_block(
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
fn raw_composite_defaults_and_distinct_equal_inline_writer() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let (id, _) = doc
        .insert_runtime_inline_at(
            &Key::root(),
            "tag",
            None,
            SchemaAttributes::from([(
                "payload".into(),
                schema.default_value("tag", "payload").unwrap(),
            )]),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    let op = doc.pending_changes().last().unwrap().ops[0].raw_operation();
    assert!(matches!(op,Op::Node{attrs:Some(attrs),..} if attrs.is_empty()));
    let (_, change) = doc
        .insert_inline_at(
            &Key::root(),
            "tag",
            Some(&id),
            Attributes::from([("payload".into(), json!({"x":1}))]),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    assert!(
        matches!(&change.ops[0],Op::Node{attrs:Some(attrs),..} if attrs.contains_key("payload"))
    );
}
#[test]
fn enum_reference_admission_rejects_equal_json_and_foreign_descriptor_atomically() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let id = insert(&mut doc);
    let before = snapshot(&mut doc);
    assert!(doc
        .set_attribute(&id, "choice", json!({"x":1}), EditOptions::default(), 2.)
        .is_err());
    assert_eq!(snapshot(&mut doc), before);
    let wrong = schema.enum_value("line", "other", 0).unwrap();
    assert!(doc
        .set_runtime_attribute(&id, "choice", wrong, EditOptions::default(), 2.)
        .is_err());
    assert_eq!(snapshot(&mut doc), before);
    for index in 0..3 {
        let value = schema.enum_value("line", "choice", index).unwrap();
        doc.set_runtime_attribute(
            &id,
            "choice",
            value,
            EditOptions::default(),
            index as f64 + 3.,
        )
        .unwrap();
    }
    let state = doc.state().unwrap();
    let found = state["lines"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|line| line["items"].as_array().unwrap())
        .find(|item| item["id"] == json!(id.ticket().unwrap()))
        .unwrap();
    assert_eq!(found["attrs"]["choice"]["value"], json!([1, 2]));
}
#[test]
fn concurrent_references_restart_retry_history_and_ack() {
    let schema = schema();
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema.clone()).unwrap();
    let id = insert(&mut a);
    b.apply_remote(&a.pending_changes()[0].ops).unwrap();
    let ca = a
        .set_runtime_attribute(
            &id,
            "choice",
            schema.enum_value("line", "choice", 0).unwrap(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    let cb = b
        .set_runtime_attribute(
            &id,
            "choice",
            schema.enum_value("line", "choice", 2).unwrap(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    a.apply_remote(&cb.ops).unwrap();
    b.apply_remote(&ca.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let checkpoint = RuntimeCheckpoint::from_json(&snapshot(&mut a)).unwrap();
    let mut restored = RuntimeDocument::restore(&checkpoint).unwrap();
    assert_eq!(a.pending_changes(), restored.pending_changes());
    let before = snapshot(&mut restored);
    restored.apply_remote(&ca.ops).unwrap();
    restored.apply_remote(&cb.ops).unwrap();
    assert_eq!(snapshot(&mut restored), before);
    let undo = restored.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(restored.model().unwrap(), b.model().unwrap());
    let redo = restored.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(restored.model().unwrap(), b.model().unwrap());
    let pending = restored.pending_changes().to_vec();
    restored.acknowledge(&pending).unwrap();
    assert!(restored.pending_changes().is_empty());
}
#[test]
fn mark_default_reference_is_omitted_but_equal_json_is_stored() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let reference = schema
        .reference_value(&["markValues", "paint"], None)
        .unwrap();
    let first = doc
        .insert_runtime_text_at(
            &Key::root(),
            None,
            "a",
            SchemaAttributes::from([("paint".into(), reference)]),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    assert!(matches!(first.ops[0].raw_operation(),Op::Text{marks,..} if marks.is_empty()));
    let change = doc
        .insert_runtime_text_at(
            &Key::root(),
            None,
            "b",
            SchemaAttributes::from([("paint".into(), SchemaValue::json(json!({"color":"red"})))]),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    assert!(
        matches!(change.ops[0].raw_operation(),Op::Text{marks,..} if marks.contains_key("paint"))
    );
    RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&snapshot(&mut doc)).unwrap()).unwrap();
}
#[test]
fn reference_handle_payload_and_schema_ownership_are_checked() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let id = insert(&mut doc);
    let value = schema.enum_value("line", "choice", 0).unwrap();
    let before = snapshot(&mut doc);
    let op = Op::Set {
        at: doc.next_ticket().unwrap(),
        ids: vec![id.ticket().unwrap()],
        key: "choice".into(),
        value: json!({"x":2}),
    };
    assert!(doc
        .record(
            vec![value.bind(op, &["value"]).unwrap()],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(snapshot(&mut doc), before);
    let mut foreign: Value = schema.manifest().clone();
    foreign["nodes"]["line"]["attrs"]["extra"] = json!({"default":false});
    let foreign = RuntimeSchema::compile(foreign).unwrap();
    assert!(doc
        .set_runtime_attribute(
            &id,
            "choice",
            foreign.enum_value("line", "choice", 0).unwrap(),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(snapshot(&mut doc), before);
}
#[test]
fn malformed_reference_envelopes_reject_without_checkpoint_mutation() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let id = insert(&mut doc);
    let reference = schema.enum_value("line", "choice", 0).unwrap();
    let op = Op::Set {
        at: doc.next_ticket().unwrap(),
        ids: vec![id.ticket().unwrap()],
        key: "choice".into(),
        value: reference.value().clone(),
    };
    let valid = serde_json::to_value(reference.bind(op, &["value"]).unwrap()).unwrap();
    let before = snapshot(&mut doc);
    for case in [
        "schema",
        "at",
        "index",
        "path",
        "payload",
        "format",
        "empty",
        "duplicate",
    ] {
        let mut bad = valid.clone();
        match case {
            "schema" => bad["references"][0]["schema"] = json!("unknown"),
            "at" => bad["references"][0]["at"] = json!(["nodes", "missing", "attrs", "choice"]),
            "index" => bad["references"][0]["index"] = json!(999),
            "path" => bad["references"][0]["path"] = json!(["attrs", "choice"]),
            "payload" => bad["op"]["value"] = json!({"x":2}),
            "format" => bad["format"] = json!("unknown"),
            "empty" => bad["references"] = json!([]),
            _ => {
                let reference = bad["references"][0].clone();
                bad["references"].as_array_mut().unwrap().push(reference);
            }
        }
        let bad: Op = serde_json::from_value(bad).unwrap();
        assert!(
            doc.record(vec![bad], EditOptions::default(), 2.).is_err(),
            "{case}"
        );
        assert_eq!(snapshot(&mut doc), before, "{case}");
    }
}
#[test]
fn multi_reference_birth_keeps_both_descriptors_across_restart() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let (_, change) = doc
        .insert_runtime_block(
            "line",
            None,
            None,
            SchemaAttributes::from([
                (
                    "choice".into(),
                    schema.enum_value("line", "choice", 2).unwrap(),
                ),
                (
                    "other".into(),
                    schema.enum_value("line", "other", 0).unwrap(),
                ),
            ]),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    assert!(matches!(&change.ops[0],Op::Reference{references,..} if references.len()==2));
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&snapshot(&mut doc)).unwrap())
            .unwrap();
    assert_eq!(doc.pending_changes(), restored.pending_changes());
    assert_eq!(snapshot(&mut doc), snapshot(&mut restored));
}
#[test]
fn fixed_graphic_rejects_runtime_reference_atomically() {
    let schema = schema();
    let mut doc = GraphicDocument::new("A").unwrap();
    let (id, _) = doc
        .insert(
            GraphicKind::Frame,
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    let reference = schema.enum_value("line", "choice", 0).unwrap();
    let op = Op::Set {
        at: doc.next_ticket().unwrap(),
        ids: vec![id.ticket().unwrap()],
        key: "name".into(),
        value: reference.value().clone(),
    };
    assert!(doc
        .record(
            vec![reference.bind(op, &["value"]).unwrap()],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
}
