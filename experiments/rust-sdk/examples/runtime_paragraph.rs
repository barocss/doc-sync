use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"document", "marks":["bold"], "nodes":{
            "document":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
            "section":{"shape":"flow","children":["heading","paragraph","header"],"default":"heading","childRules":{"header":{"min":1,"max":1}}},
            "heading":{"shape":"text"},
            "paragraph":{"shape":"text","attrs":{"style":{
                "default":{"align":"left","spacing":1},
                "fields":{"align":{"default":"left","values":["left","center","right"]},"spacing":{"default":1,"min":0.5,"max":4}}
            }}},
            "header":{"shape":"atom"}
        }
    }))?;
    let mut alice = RuntimeDocument::new("A", schema.clone())?;
    let mut bob = RuntimeDocument::new("B", schema)?;
    let (section, birth) = alice.insert_model_at(
        &[1],
        json!({"type":"section","children":[{"type":"paragraph","runs":[{"text":"First 😀","marks":{"bold":true}}]}]}),
        EditOptions::default(), 1.,
    )?;
    bob.apply_remote(&birth.ops)?;
    let (paragraph, inserted) = alice.insert_paragraph_at(
        &[1, 1],
        json!({"type":"paragraph","attrs":{"style":{"align":"center","spacing":2}},"runs":[{"text":"Second"}]}),
        EditOptions::default(), 2.,
    )?;
    bob.apply_remote(&inserted.ops)?;
    let range = Selection {
        anchor: Position(vec![1, 1, 0]),
        focus: Position(vec![1, 1, 6]),
    };
    let anchors = alice.capture_selection(Some(range.clone()))?;
    assert_eq!(alice.resolve_selection(anchors)?, Some(range));
    let own = alice.set_field_path(
        &paragraph,
        "style",
        &["align"],
        json!("left"),
        EditOptions::default(),
        3.,
    )?;
    bob.apply_remote(&own.ops)?;
    let foreign = bob.set_field_path(
        &paragraph,
        "style",
        &["align"],
        json!("right"),
        EditOptions::default(),
        4.,
    )?;
    alice.apply_remote(&foreign.ops)?;
    let head = RuntimeDocument::flow_head(Some(&section))?;
    let peer = bob.insert_text_at(
        &head,
        Some(&paragraph),
        "Peer ",
        Attributes::new(),
        EditOptions::default(),
        5.,
    )?;
    alice.apply_remote(&peer.ops)?;
    let expected = alice.model()?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    let saved = alice.checkpoint()?.to_json()?;
    alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes().to_vec() {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_paragraph_at(
            &[1, 0],
            json!({"type":"paragraph","runs":[{"text":"invalid","marks":{"unknown":true}}]}),
            EditOptions::default(),
            6.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!(
        "PASS: model paragraphs, default retype, fields, peers, History and own checkpoint retry"
    );
    Ok(())
}
