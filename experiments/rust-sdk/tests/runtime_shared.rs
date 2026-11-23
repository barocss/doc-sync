use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn manifest() -> Value {
    json!({"root":"root","marks":[],"markValues":{
        "ink":{"default":{"x":1},"values":[{"x":1},{"x":1}]},
        "paint":{"default":{"x":1},"values":[{"x":1},{"x":1}]}},"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","children":["tag"],"attrs":{
            "source":{"default":{"x":1},"values":[{"x":1},{"x":1}]},
            "target":{"default":{"x":1},"values":[{"x":1},{"x":1}]},
            "other":{"default":null,"values":[{"x":1}]}}},
        "tag":{"shape":"inline","attrs":{"token":{"default":{"x":1},"values":[{"x":1},{"x":1}]}}}}})
}
fn groups() -> Vec<ReferenceGroup> {
    vec![ReferenceGroup::new(
        ReferenceSlot::default(&["nodes", "line", "attrs", "source"]),
        [
            ReferenceSlot::default(&["nodes", "line", "attrs", "source"]),
            ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "source"], 0),
            ReferenceSlot::default(&["nodes", "line", "attrs", "target"]),
            ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
            ReferenceSlot::default(&["nodes", "tag", "attrs", "token"]),
            ReferenceSlot::enum_entry(&["nodes", "tag", "attrs", "token"], 0),
            ReferenceSlot::default(&["markValues", "paint"]),
            ReferenceSlot::enum_entry(&["markValues", "paint"], 0),
            ReferenceSlot::default(&["markValues", "ink"]),
            ReferenceSlot::enum_entry(&["markValues", "ink"], 0),
        ],
    )]
}
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile_with_reference_groups(manifest(), groups()).unwrap()
}
fn attrs(key: &str, value: SchemaValue) -> SchemaAttributes {
    SchemaAttributes::from([(key.into(), value)])
}
fn snapshot(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn json_ops(change: &Change) -> Vec<Op> {
    serde_json::from_str(&serde_json::to_string(&change.ops).unwrap()).unwrap()
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
fn shared_builders_roundtrip_and_keep_manifest_identity_separate() {
    let s = schema();
    assert_eq!(s.manifest(), &manifest());
    assert_eq!(s.dto()["format"], "doc-sync-runtime-schema-shared-v2");
    assert_ne!(s.identity(), s.base_identity());
    let legacy = RuntimeSchema::compile_with_default_references(
        manifest(),
        [
            DefaultReference::new(&["nodes", "line", "attrs", "source"], 0),
            DefaultReference::new(&["nodes", "line", "attrs", "target"], 0),
            DefaultReference::new(&["nodes", "tag", "attrs", "token"], 0),
            DefaultReference::new(&["markValues", "paint"], 0),
            DefaultReference::new(&["markValues", "ink"], 0),
        ],
    )
    .unwrap();
    assert_eq!(s.base_identity(), legacy.base_identity());
    let restored: RuntimeSchema = serde_json::from_value(s.dto().clone()).unwrap();
    assert_eq!(restored, s);
    assert_eq!(serde_json::to_value(&s).unwrap(), *s.dto());
    assert_eq!(legacy.with_reference_groups(groups()).unwrap(), s);
}

#[test]
fn source_handles_omit_only_actual_target_defaults_and_retain_source_metadata() {
    let s = schema();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let source = s.enum_value("line", "source", 0).unwrap();
    let (id, birth) = d
        .insert_runtime_block(
            "line",
            None,
            None,
            attrs("target", source.clone()),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    assert!(matches!(&birth.ops[0], Op::Node{attrs:Some(a), ..} if a.is_empty()));
    let update = d
        .set_runtime_attribute(&id, "target", source.clone(), EditOptions::default(), 2.)
        .unwrap();
    assert!(
        matches!(&update.ops[0], Op::Reference{references, op, ..} if references[0]["at"] == json!(["nodes","line","attrs","source"]) && references[0]["source"] == "enum" && references[0]["index"] == 0 && matches!(op.as_ref(),Op::Set{key,..} if key == "target"))
    );
    let (_, inline) = d
        .insert_runtime_inline_at(
            &Key::root(),
            "tag",
            Some(&id),
            attrs("token", source.clone()),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    assert!(matches!(&inline.ops[0], Op::Node{attrs:Some(a),..} if a.is_empty()));
    let text = d
        .insert_runtime_text_at(
            &Key::root(),
            None,
            "x",
            attrs("paint", source),
            EditOptions::default(),
            4.,
        )
        .unwrap();
    assert!(matches!(&text.ops[0], Op::Text{marks,..} if marks.is_empty()));
    let mark = s.reference_value(&["markValues", "ink"], Some(0)).unwrap();
    let update = d
        .set_runtime_attributes(
            &id,
            attrs("target", mark.clone()),
            EditOptions::default(),
            5.,
        )
        .unwrap();
    assert!(
        matches!(&update.ops[0],Op::Reference{references,..} if references[0]["at"] == json!(["markValues","ink"]))
    );
    let token = Key::from_ticket(match text.ops[0].raw_operation() {
        Op::Text { id, .. } => id,
        _ => panic!(),
    });
    let format = d
        .format_runtime_tokens(&[token], "paint", mark, EditOptions::default(), 6.)
        .unwrap();
    assert!(
        matches!(&format.ops[0],Op::Reference{references,..} if references[0]["at"] == json!(["markValues","ink"]))
    );
}

#[test]
fn wrong_target_unshared_equal_slot_and_foreign_graph_fail_atomically() {
    let s = schema();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let id = insert(&mut d);
    let before = snapshot(&mut d);
    let mut foreign_dto = s.dto().clone();
    foreign_dto["referenceGroups"][0]["representative"] =
        json!({"at":["nodes","line","attrs","target"],"source":"default"});
    let foreign = RuntimeSchema::compile(foreign_dto).unwrap();
    for (target, value) in [
        ("other", s.enum_value("line", "source", 0).unwrap()),
        ("target", s.enum_value("line", "source", 1).unwrap()),
        ("target", foreign.enum_value("line", "source", 0).unwrap()),
    ] {
        assert!(d
            .set_runtime_attribute(&id, target, value.clone(), EditOptions::default(), 2.)
            .is_err());
        assert_eq!(snapshot(&mut d), before);
        assert!(d
            .insert_runtime_block(
                "line",
                None,
                None,
                attrs(target, value),
                EditOptions::default(),
                2.
            )
            .is_err());
        assert_eq!(snapshot(&mut d), before);
    }
    let same_descriptor = d
        .set_runtime_attribute(
            &id,
            "target",
            s.enum_value("line", "target", 1).unwrap(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    assert!(
        matches!(&same_descriptor.ops[0],Op::Reference{references,..} if references[0]["index"]==1)
    );
}

#[test]
fn concurrent_cross_attribute_writers_text_delete_format_and_recovery_converge() {
    let s = schema();
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s.clone()).unwrap();
    let id = insert(&mut a);
    b.apply_remote(&json_ops(&a.pending_changes()[0])).unwrap();
    let own = a
        .set_runtime_attribute(
            &id,
            "target",
            s.enum_value("line", "source", 0).unwrap(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    let foreign = b
        .set_runtime_attribute(
            &id,
            "target",
            s.enum_value("line", "target", 1).unwrap(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    a.apply_remote(&json_ops(&foreign)).unwrap();
    b.apply_remote(&json_ops(&own)).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let left = a
        .insert_runtime_text_at(
            &Key::root(),
            Some(&id),
            "ab",
            SchemaAttributes::new(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    let right = b
        .insert_runtime_text_at(
            &Key::root(),
            Some(&id),
            "Z",
            SchemaAttributes::new(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    a.apply_remote(&json_ops(&right)).unwrap();
    b.apply_remote(&json_ops(&left)).unwrap();
    let token = Key::from_ticket(match left.ops[0].raw_operation() {
        Op::Text { id, .. } => id,
        _ => panic!(),
    });
    let format = a
        .format_runtime_tokens(
            &[token],
            "paint",
            s.default_value("line", "source").unwrap(),
            EditOptions::default(),
            4.,
        )
        .unwrap();
    b.apply_remote(&json_ops(&format)).unwrap();
    let deletion = a.delete_block(&id, EditOptions::default(), 5.).unwrap();
    b.apply_remote(&json_ops(&deletion)).unwrap();
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&snapshot(&mut a)).unwrap())
            .unwrap();
    assert_eq!(a.pending_changes(), restored.pending_changes());
    let before = snapshot(&mut restored);
    for change in restored.pending_changes().to_vec() {
        restored.apply_remote(&json_ops(&change)).unwrap();
    }
    restored.apply_remote(&json_ops(&foreign)).unwrap();
    assert_eq!(snapshot(&mut restored), before);
    let foreign_writer = match foreign.ops[0].raw_operation() {
        Op::Set { at, .. } => json!(at),
        _ => panic!(),
    };
    // Undo reaches the local same-value writer. The foreign winner must survive.
    for redo in [false, false, false, false, true, true, true, true] {
        let change = if redo {
            restored.redo().unwrap()
        } else {
            restored.undo().unwrap()
        };
        b.apply_remote(&json_ops(&change)).unwrap();
        assert_eq!(restored.model().unwrap(), b.model().unwrap());
        let state = restored.state().unwrap();
        let item = state["lines"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|line| line["items"].as_array().unwrap())
            .find(|item| item["id"] == json!(id.ticket().unwrap()))
            .unwrap();
        assert_eq!(item["attrs"]["target"]["at"], foreign_writer);
    }
    let pending = restored.pending_changes().to_vec();
    restored.acknowledge(&pending).unwrap();
    let restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&snapshot(&mut restored)).unwrap())
            .unwrap();
    assert!(restored.pending_changes().is_empty());
}

#[test]
fn enum_only_shared_group_retains_birth_writer_when_target_default_is_distinct() {
    let mut m = manifest();
    m["nodes"]["line"]["attrs"]["source"]["default"] = Value::Null;
    m["nodes"]["line"]["attrs"]["target"]["default"] = Value::Null;
    m["nodes"]["line"]["attrs"]["other"]["default"] = Value::Null;
    m["nodes"]["tag"]["attrs"]["token"]["default"] = Value::Null;
    m["markValues"]["paint"]["default"] = Value::Null;
    m["markValues"]["ink"]["default"] = Value::Null;
    let source = ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "source"], 0);
    let s = RuntimeSchema::compile_with_reference_groups(
        m,
        [ReferenceGroup::new(
            source.clone(),
            [
                source,
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
            ],
        )],
    )
    .unwrap();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let (_, birth) = d
        .insert_runtime_block(
            "line",
            None,
            None,
            attrs("target", s.enum_value("line", "source", 0).unwrap()),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    assert!(
        matches!(&birth.ops[0],Op::Reference{op,references,..} if references[0]["at"] == json!(["nodes","line","attrs","source"]) && matches!(op.as_ref(),Op::Node{attrs:Some(a),..} if a["target"]==json!({"x":1})))
    );
}

#[test]
fn explicit_representative_controls_payload_order_and_member_order_does_not_change_identity() {
    let m: Value=serde_json::from_str(r#"{"root":"root","marks":[],"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text","attrs":{"source":{"default":{"b":2,"a":1},"values":[{"a":1,"b":2}]},"target":{"default":{"a":1,"b":2},"values":[{"a":1,"b":2}]}}}}}"#).unwrap();
    let source = ReferenceSlot::default(&["nodes", "line", "attrs", "source"]);
    let target = ReferenceSlot::default(&["nodes", "line", "attrs", "target"]);
    let source_enum = ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "source"], 0);
    let target_enum = ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0);
    let slots = [
        source.clone(),
        source_enum.clone(),
        target.clone(),
        target_enum.clone(),
    ];
    let s = RuntimeSchema::compile_with_reference_groups(
        m.clone(),
        [ReferenceGroup::new(source.clone(), slots.clone())],
    )
    .unwrap();
    let reversed = RuntimeSchema::compile_with_reference_groups(
        m.clone(),
        [ReferenceGroup::new(source, slots.into_iter().rev())],
    )
    .unwrap();
    assert_eq!(s.identity(), reversed.identity());
    let other = RuntimeSchema::compile_with_reference_groups(
        m,
        [ReferenceGroup::new(
            target.clone(),
            [
                target,
                source_enum,
                target_enum,
                ReferenceSlot::default(&["nodes", "line", "attrs", "source"]),
            ],
        )],
    )
    .unwrap();
    assert_ne!(s.identity(), other.identity());
    assert_eq!(
        serde_json::to_string(&s.manifest()["nodes"]["line"]["attrs"]["target"]["default"])
            .unwrap(),
        r#"{"a":1,"b":2}"#
    );
    assert_eq!(
        serde_json::to_string(
            &s.effective_manifest()["nodes"]["line"]["attrs"]["target"]["default"]
        )
        .unwrap(),
        r#"{"b":2,"a":1}"#
    );
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let id = insert(&mut d);
    for mode in 0..3 {
        if mode == 1 {
            d.set_attribute(&id, "target", Value::Null, EditOptions::default(), 2.)
                .unwrap();
        } else if mode == 2 {
            d.set_runtime_attribute(
                &id,
                "target",
                s.enum_value("line", "source", 0).unwrap(),
                EditOptions::default(),
                3.,
            )
            .unwrap();
        }
        let model = serde_json::to_string(&d.model().unwrap()).unwrap();
        assert!(model.contains(r#"{"b":2,"a":1}"#), "mode {mode}: {model}");
        assert!(!model.contains(r#"{"a":1,"b":2}"#), "mode {mode}: {model}");
    }
    for (key, index) in [
        ("source", None),
        ("source", Some(0)),
        ("target", None),
        ("target", Some(0)),
    ] {
        let v = s
            .reference_value(&["nodes", "line", "attrs", key], index)
            .unwrap();
        assert_eq!(
            serde_json::to_string(v.value()).unwrap(),
            r#"{"b":2,"a":1}"#
        );
    }
}

#[test]
fn invalid_shared_graph_dtos_reject_without_changing_document() {
    let s = schema();
    let mut d = RuntimeDocument::new("A", s.clone()).unwrap();
    let before = snapshot(&mut d);
    for case in [
        "version",
        "empty",
        "singleton",
        "duplicate",
        "overlap",
        "missing-representative",
        "missing-slot",
        "unequal",
        "scalar",
        "unknown",
    ] {
        let mut dto = s.dto().clone();
        match case {
            "version" => dto["format"] = json!("doc-sync-runtime-schema-shared-v3"),
            "empty" => dto["referenceGroups"] = json!([]),
            "singleton" => {
                dto["referenceGroups"][0]["slots"] =
                    json!([dto["referenceGroups"][0]["representative"].clone()]);
            }
            "duplicate" => {
                let slot = dto["referenceGroups"][0]["slots"][0].clone();
                dto["referenceGroups"][0]["slots"]
                    .as_array_mut()
                    .unwrap()
                    .push(slot);
            }
            "overlap" => {
                let group = dto["referenceGroups"][0].clone();
                dto["referenceGroups"].as_array_mut().unwrap().push(group);
            }
            "missing-representative" => {
                dto["referenceGroups"][0]["representative"] =
                    json!({"at":["nodes","line","attrs","other"],"source":"default"})
            }
            "missing-slot" => {
                dto["referenceGroups"][0]["slots"][0]["at"] =
                    json!(["nodes", "missing", "attrs", "source"])
            }
            "unequal" => {
                dto["manifest"]["nodes"]["line"]["attrs"]["source"]["default"] = json!({"x":2})
            }
            "scalar" => dto["manifest"]["nodes"]["line"]["attrs"]["source"]["default"] = json!(1),
            _ => dto["referenceGroups"][0]["extra"] = json!(true),
        }
        assert!(RuntimeSchema::compile(dto).is_err(), "{case}");
        assert_eq!(snapshot(&mut d), before);
    }
}

#[test]
fn multiple_groups_canonicalize_order_without_merging_equal_objects() {
    let paths: &[&[&str]] = &[
        &["nodes", "line", "attrs", "source"],
        &["nodes", "line", "attrs", "target"],
        &["nodes", "tag", "attrs", "token"],
        &["markValues", "paint"],
        &["markValues", "ink"],
    ];
    let separate = RuntimeSchema::compile_with_reference_groups(
        manifest(),
        paths.iter().map(|path| {
            let representative = ReferenceSlot::default(path);
            ReferenceGroup::new(
                representative.clone(),
                [representative, ReferenceSlot::enum_entry(path, 0)],
            )
        }),
    )
    .unwrap();
    let mut reordered = separate.dto().clone();
    reordered["referenceGroups"]
        .as_array_mut()
        .unwrap()
        .reverse();
    for group in reordered["referenceGroups"].as_array_mut().unwrap() {
        group["slots"].as_array_mut().unwrap().reverse();
    }
    assert_eq!(
        RuntimeSchema::compile(reordered).unwrap().identity(),
        separate.identity()
    );
    assert_ne!(separate.identity(), schema().identity());
    let mut document = RuntimeDocument::new("A", separate.clone()).unwrap();
    let before = snapshot(&mut document);
    assert!(document
        .insert_runtime_block(
            "line",
            None,
            None,
            attrs("target", separate.enum_value("line", "source", 0).unwrap()),
            EditOptions::default(),
            1.
        )
        .is_err());
    assert_eq!(snapshot(&mut document), before);
}
