use doc_sync_native_sdk::*;
use serde_json::json;
fn schema() -> RuntimeSchema {
    let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "style":{"default":{"nested":{"source":{"items":[{"x":1}]},"copy":{"x":0},"count":0}},"fields":{
                "nested":{"default":{"source":{"items":[{"x":1}]},"copy":{"x":0},"count":0},"fields":{
                    "source":{"default":{"items":[{"x":1}]},"values":[{"items":[{"x":1}]}]},
                    "copy":{"default":{"x":0},"values":[{"x":0},{"x":1}]},
                    "count":{"default":0}}}}},
            "target":{"default":{"x":1},"values":[{"x":1}]}}}}});
    let source = ReferenceSlot::default(&[
        "nodes", "line", "attrs", "style", "fields", "nested", "fields", "source",
    ])
    .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)]);
    let schema = RuntimeSchema::compile_with_payload_references(
        manifest,
        [ReferenceGroup::new(
            source.clone(),
            [
                source,
                ReferenceSlot::default(&["nodes", "line", "attrs", "target"]),
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
            ],
        )],
    );
    schema.unwrap()
}
fn source(schema: &RuntimeSchema) -> SchemaValue {
    schema
        .field_default_value("line", "style", &["nested", "source"])
        .unwrap()
        .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)])
        .unwrap()
}
fn checkpoint(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
#[test]
fn field_sources_preserve_descriptor_and_payload_paths() {
    let schema = schema();
    let value = source(&schema);
    let slot = ReferenceSlot::default(&[
        "nodes", "line", "attrs", "style", "fields", "nested", "fields", "source",
    ])
    .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)]);
    assert_eq!(value, schema.reference_value_at(&slot).unwrap());
    let enum_value = schema
        .field_enum_value("line", "style", &["nested", "source"], 0)
        .unwrap();
    assert_eq!(enum_value.value(), &json!({"items":[{"x":1}]}));
    let op = value
        .bind(
            Op::Set {
                at: Ticket {
                    lamport: 1,
                    actor: "A".into(),
                },
                ids: vec![],
                key: "target".into(),
                value: value.value().clone(),
            },
            &["value"],
        )
        .unwrap();
    let encoded = serde_json::to_value(op).unwrap();
    assert_eq!(encoded["references"][0]["at"], json!(slot.at));
    assert_eq!(encoded["references"][0]["valuePath"], json!(["items", 0]));
    assert_eq!(encoded["references"][0]["path"], json!(["value"]));
    for path in [
        vec![],
        vec!["nested"],
        vec!["nested", "missing"],
        vec!["nested", "constructor"],
        vec!["nested", "count"],
    ] {
        assert!(schema.field_default_value("line", "style", &path).is_err());
    }
    assert!(schema
        .field_enum_value("line", "style", &["nested", "source"], 5)
        .is_err());
    let at = ["nodes", "line", "attrs", "target"];
    let mut bare_manifest = schema.manifest().clone();
    bare_manifest["nodes"]["line"]["attrs"]["target"]
        .as_object_mut()
        .unwrap()
        .shift_remove("values");
    for legacy in [
        RuntimeSchema::compile(bare_manifest).unwrap(),
        RuntimeSchema::compile_with_default_references(
            schema.manifest().clone(),
            [DefaultReference::new(&at, 0)],
        )
        .unwrap(),
        RuntimeSchema::compile_with_reference_groups(
            schema.manifest().clone(),
            [ReferenceGroup::new(
                ReferenceSlot::default(&at),
                [
                    ReferenceSlot::default(&at),
                    ReferenceSlot::enum_entry(&at, 0),
                ],
            )],
        )
        .unwrap(),
    ] {
        assert!(legacy
            .field_default_value("line", "style", &["nested", "source"])
            .is_err());
        assert!(legacy
            .field_enum_value("line", "style", &["nested", "source"], 0)
            .is_err());
    }
    for format in [
        "doc-sync-runtime-schema-alias-v1",
        "doc-sync-runtime-schema-shared-v2",
    ] {
        let mut old = schema.dto().clone();
        old["format"] = json!(format);
        assert!(RuntimeSchema::compile(old).is_err());
    }
}
#[test]
fn field_copy_checks_provenance_and_target_before_mutation() {
    let schema = schema();
    let mut doc = RuntimeDocument::new("A", schema.clone()).unwrap();
    let (id, _) = doc
        .insert_block(
            "line",
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    let before = checkpoint(&mut doc);
    let mut foreign_dto = schema.dto().clone();
    foreign_dto["manifest"]["nodes"]["line"]["attrs"]["extra"] = json!({"default":0});
    let foreign = RuntimeSchema::compile(foreign_dto).unwrap();
    for (path, value) in [
        (vec!["nested", "copy"], source(&foreign)),
        (vec!["nested", "count"], source(&schema)),
        (vec!["nested"], source(&schema)),
        (vec!["nested", "missing"], source(&schema)),
        (vec!["nested", "constructor"], source(&schema)),
        (vec!["nested"; 65], source(&schema)),
        (vec![], source(&schema)),
        (vec!["nested", "copy"], SchemaValue::json(json!({"x":2}))),
    ] {
        assert!(doc
            .set_runtime_field_path(&id, "style", &path, value, EditOptions::default(), 2.)
            .is_err());
        assert_eq!(checkpoint(&mut doc), before);
    }
    assert!(doc
        .set_runtime_attribute(&id, "target", source(&foreign), EditOptions::default(), 2.)
        .is_err());
    assert_eq!(checkpoint(&mut doc), before);
    let mut changed_graph = schema.dto().clone();
    changed_graph["referenceGroups"][0]["representative"] =
        serde_json::to_value(ReferenceSlot::default(&[
            "nodes", "line", "attrs", "target",
        ]))
        .unwrap();
    let changed_graph = RuntimeSchema::compile(changed_graph).unwrap();
    assert_eq!(schema.manifest(), changed_graph.manifest());
    assert_ne!(schema.identity(), changed_graph.identity());
    assert!(doc
        .set_runtime_attribute(
            &id,
            "target",
            source(&changed_graph),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(checkpoint(&mut doc), before);
    assert!(doc
        .set_runtime_field_path(
            &id,
            "style",
            &["nested", "copy"],
            source(&changed_graph),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(checkpoint(&mut doc), before);
    // A plain equal JSON value satisfies the field's deep-value enum contract.
    let equal_json = doc
        .set_runtime_field_path(
            &id,
            "style",
            &["nested", "copy"],
            SchemaValue::json(json!({"x":1})),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    assert!(matches!(&equal_json.ops[0], Op::Set { value, .. } if value == &json!({"x":1})));
    let change = doc
        .set_runtime_field_path(
            &id,
            "style",
            &["nested", "copy"],
            source(&schema),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    assert!(
        matches!(&change.ops[0], Op::Set { key, value, .. } if key == "$field:[\"style\",\"nested\",\"copy\"]" && value == &json!({"x":1}))
    );
    let before = checkpoint(&mut doc);
    let slot = ReferenceSlot::default(&[
        "nodes", "line", "attrs", "style", "fields", "nested", "fields", "copy",
    ]);
    let mut wire = schema.dto().clone();
    wire["referenceGroups"][0]["slots"][0] = serde_json::to_value(slot).unwrap();
    assert!(RuntimeSchema::compile(wire).is_err());
    assert_eq!(checkpoint(&mut doc), before);
}
fn deep_schema(field_count: usize) -> Result<RuntimeSchema> {
    let mut rule = json!({"default":{"x":1},"values":[{"x":1}]});
    for _ in 0..field_count {
        rule = json!({"default":{"child":rule["default"].clone()},"fields":{"child":rule}});
    }
    let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{"deep":rule}}}});
    let mut at = vec!["nodes", "line", "attrs", "deep"];
    for _ in 0..field_count {
        at.extend(["fields", "child"]);
    }
    RuntimeSchema::compile_with_payload_references(
        manifest,
        [ReferenceGroup::new(
            ReferenceSlot::default(&at),
            [
                ReferenceSlot::default(&at),
                ReferenceSlot::enum_entry(&at, 0),
            ],
        )],
    )
}
#[test]
fn source_depth_also_obeys_whole_schema_json_guard() {
    let schema = deep_schema(60).unwrap();
    let source = schema
        .field_default_value("line", "deep", &vec!["child"; 60])
        .unwrap();
    assert_eq!(source.value(), &json!({"x":1}));
    let canonical = deep_schema(61).unwrap_err();
    assert!(
        canonical.0.contains("maximum JSON depth"),
        "{}",
        canonical.0
    );
    assert!(deep_schema(65).is_err());
    assert!(schema
        .field_default_value("line", "deep", &vec!["child"; 65])
        .is_err());
}
#[test]
fn peer_history_checkpoint_retry_and_ack_preserve_other_fields() {
    // Compile and execute the same complete workflow as both documentation fences.
    sample::main().unwrap();
}
mod sample {
    use doc_sync_native_sdk::*;
    use serde_json::json;
    fn assert_fields(doc: &mut RuntimeDocument, id: &Key, x: u64) -> Result<()> {
        let state = doc.state()?;
        let block = state["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|block| block["marker"] == id.as_str())
            .unwrap();
        assert_eq!(block["attrs"]["style"]["nested"]["count"], json!(7));
        assert_eq!(block["attrs"]["style"]["nested"]["copy"], json!({"x":x}));
        let item = state["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["id"] == json!(id.ticket().unwrap()))
            .unwrap();
        let count = &item["attrs"]["$field:[\"style\",\"nested\",\"count\"]"];
        assert_eq!(count["value"], json!(7));
        assert_eq!(count["at"]["actor"], json!("bob"));
        assert!(state["model"]["children"]
            .as_array()
            .unwrap()
            .iter()
            .any(|child| child["attrs"] == block["attrs"]));
        Ok(())
    }
    pub fn main() -> Result<()> {
        let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "style":{"default":{"nested":{"source":{"items":[{"x":1}]},"copy":{"x":0},"count":0}},"fields":{
                "nested":{"default":{"source":{"items":[{"x":1}]},"copy":{"x":0},"count":0},"fields":{
                    "source":{"default":{"items":[{"x":1}]},"values":[{"items":[{"x":1}]}]},
                    "copy":{"default":{"x":0},"values":[{"x":0},{"x":1}]},
                    "count":{"default":0}}}}},
            "target":{"default":{"x":1},"values":[{"x":1}]}}}}});
        let source = ReferenceSlot::default(&[
            "nodes", "line", "attrs", "style", "fields", "nested", "fields", "source",
        ])
        .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)]);
        let schema = RuntimeSchema::compile_with_payload_references(
            manifest,
            [ReferenceGroup::new(
                source.clone(),
                [
                    source,
                    ReferenceSlot::default(&["nodes", "line", "attrs", "target"]),
                    ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
                ],
            )],
        )?;
        let value = schema
            .field_default_value("line", "style", &["nested", "source"])?
            .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)])?;
        let mut alice = RuntimeDocument::new("alice", schema.clone())?;
        let mut bob = RuntimeDocument::new("bob", schema)?;
        let (id, birth) = alice.insert_block(
            "line",
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            1.,
        )?;
        bob.apply_remote(&birth.ops)?;
        let atomic = alice.set_runtime_attribute(
            &id,
            "target",
            value.clone(),
            EditOptions::default(),
            2.,
        )?;
        bob.apply_remote(&atomic.ops)?;
        let copied = alice.set_runtime_field_path(
            &id,
            "style",
            &["nested", "copy"],
            value,
            EditOptions::default(),
            3.,
        )?;
        assert!(
            matches!(&copied.ops[0], Op::Set { key, .. } if key == "$field:[\"style\",\"nested\",\"copy\"]")
        );
        bob.apply_remote(&copied.ops)?;
        let foreign = bob.set_field_path(
            &id,
            "style",
            &["nested", "count"],
            json!(7),
            EditOptions::default(),
            4.,
        )?;
        alice.apply_remote(&foreign.ops)?;
        assert_fields(&mut alice, &id, 1)?;
        let pending = alice.pending_changes().to_vec();
        let saved = alice.checkpoint()?.to_json()?;
        alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
        assert_eq!(alice.pending_changes(), pending.as_slice());
        for change in &pending {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
        assert_fields(&mut alice, &id, 1)?;
        bob.apply_remote(&alice.undo()?.ops)?;
        assert_eq!(alice.model()?, bob.model()?);
        assert_fields(&mut alice, &id, 0)?;
        bob.apply_remote(&alice.redo()?.ops)?;
        assert_eq!(alice.model()?, bob.model()?);
        assert_fields(&mut alice, &id, 1)?;
        let pending = alice.pending_changes().to_vec();
        alice.acknowledge(&pending)?;
        assert!(alice.pending_changes().is_empty());
        Ok(())
    }
}
