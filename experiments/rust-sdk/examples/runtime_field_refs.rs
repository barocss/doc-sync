//! Field descriptor sources and payload paths stay separate from field targets.
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
fn main() -> Result<()> {
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
    let atomic =
        alice.set_runtime_attribute(&id, "target", value.clone(), EditOptions::default(), 2.)?;
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
