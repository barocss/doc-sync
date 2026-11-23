use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "source":{"default":{"x":1},"values":[{"x":1}]},
            "target":{"default":{"x":1},"values":[{"x":1},{"x":1}]}
        }}
    }});
    let source = ReferenceSlot::default(&["nodes", "line", "attrs", "source"]);
    let schema = RuntimeSchema::compile_with_reference_groups(
        manifest,
        [ReferenceGroup::new(
            source.clone(),
            [
                source,
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "source"], 0),
                ReferenceSlot::default(&["nodes", "line", "attrs", "target"]),
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
            ],
        )],
    )?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema.clone())?;
    let (id, birth) = a.insert_runtime_block(
        "line",
        None,
        None,
        SchemaAttributes::from([("target".into(), schema.enum_value("line", "source", 0)?)]),
        EditOptions::default(),
        1.,
    )?;
    assert!(
        matches!(birth.ops[0].raw_operation(), Op::Node { attrs: Some(attrs), .. } if attrs.is_empty())
    );
    let birth: Change = serde_json::from_str(&serde_json::to_string(&birth)?)?;
    b.apply_remote(&birth.ops)?;
    let update = a.set_runtime_attribute(
        &id,
        "target",
        schema.enum_value("line", "source", 0)?,
        EditOptions::default(),
        2.,
    )?;
    assert!(
        matches!(&update.ops[0], Op::Reference { references, .. } if references[0]["at"] == json!(["nodes","line","attrs","source"]))
    );
    let update: Change = serde_json::from_str(&serde_json::to_string(&update)?)?;
    b.apply_remote(&update.ops)?;
    let saved = a.checkpoint()?.to_json()?;
    let mut restored = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(restored.schema().dto(), schema.dto());
    for change in restored.pending_changes().to_vec() {
        restored.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.checkpoint()?.to_json()?, saved);
    for change in [restored.undo()?, restored.redo()?] {
        b.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.model()?, b.model()?);
    let pending = restored.pending_changes().to_vec();
    restored.acknowledge(&pending)?;
    assert!(restored.pending_changes().is_empty());
    println!("PASS: cross-attribute shared object, JSON peers, restore, retry, undo/redo, ACK");
    Ok(())
}
