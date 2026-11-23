//! Schema-owned nested values retain their source path across delivery and restore.
use doc_sync_native_sdk::*;
use serde_json::json;
fn main() -> Result<()> {
    let manifest=json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "source":{"default":{"items":[{"x":1}]}},
            "target":{"default":{"x":1},"values":[{"x":1}]}}}}});
    let path=vec![ValuePathSegment::key("items"),ValuePathSegment::index(0)];
    let source=ReferenceSlot::default(&["nodes","line","attrs","source"]).at_value_path(path.clone());
    let schema=RuntimeSchema::compile_with_payload_references(manifest,[ReferenceGroup::new(source.clone(),[
        source,ReferenceSlot::default(&["nodes","line","attrs","target"]),
        ReferenceSlot::enum_entry(&["nodes","line","attrs","target"],0),
    ])])?;
    let value=schema.default_value("line","source")?.at_value_path(path)?;
    let mut alice=RuntimeDocument::new("alice",schema.clone())?;
    let mut bob=RuntimeDocument::new("bob",schema)?;
    let (id,birth)=alice.insert_runtime_block("line",None,None,SchemaAttributes::from([("target".into(),value.clone())]),EditOptions::default(),1.)?;
    bob.apply_remote(&birth.ops)?;
    let change=alice.set_runtime_attribute(&id,"target",value,EditOptions::default(),2.)?;
    bob.apply_remote(&change.ops)?;
    let checkpoint=alice.checkpoint()?.to_json()?;
    let mut alice=RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint)?)?;
    bob.apply_remote(&change.ops)?;
    bob.apply_remote(&alice.undo()?.ops)?;
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?,bob.model()?);
    let pending=alice.pending_changes().to_vec(); alice.acknowledge(&pending)?;
    Ok(())
}
