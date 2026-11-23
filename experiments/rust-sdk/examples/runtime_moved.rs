use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"document","marks":["bold"],"nodes":{
            "document":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
            "section":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
            "paragraph":{"shape":"text","attrs":{"style":{
                "default":{"align":"left"},
                "fields":{"align":{"default":"left","values":["left","center","right"]}}
            }}}
        }
    }))?;
    let mut alice = RuntimeDocument::new("A", schema.clone())?;
    let mut bob = RuntimeDocument::new("B", schema)?;
    let (section, _) = alice.insert_model_at(
        &[1],
        json!({"type":"section","children":[{"type":"paragraph","runs":[{"text":"First"}]}]}),
        EditOptions::default(),
        1.,
    )?;
    let (second, _) = alice.insert_paragraph_at(
        &[1, 1],
        json!({"type":"paragraph","runs":[{"text":"Second"}]}),
        EditOptions::default(),
        2.,
    )?;
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let movement = bob.reparent_block(&second, Some(&section), None, EditOptions::default(), 3.)?;
    alice.apply_remote(&movement.ops)?;
    let original_writer = alice.state()?["placements"][second.as_str()].clone();
    let (_, inserted) = alice.insert_paragraph_at(
        &[1, 1],
        json!({"type":"paragraph","attrs":{"style":{"align":"center"}},"runs":[{"text":"New😀","marks":{"bold":true}}]}),
        EditOptions::default(), 4.,
    )?;
    bob.apply_remote(&inserted.ops)?;
    let range = Selection {
        anchor: Position(vec![1, 1, 0]),
        focus: Position(vec![1, 1, 5]),
    };
    let anchors = alice.capture_selection(Some(range.clone()))?;
    assert_eq!(
        alice.resolve_selection(anchors.clone())?,
        Some(range.clone())
    );
    let foreign = bob.set_field_path(
        &second,
        "style",
        &["align"],
        json!("right"),
        EditOptions::default(),
        5.,
    )?;
    alice.apply_remote(&foreign.ops)?;
    let head = RuntimeDocument::flow_head(Some(&section))?;
    let text = bob.insert_text_at(
        &head,
        Some(&second),
        "Peer ",
        Attributes::new(),
        EditOptions::default(),
        6.,
    )?;
    alice.apply_remote(&text.ops)?;
    let expected = alice.model()?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(
        alice.model()?["children"][1]["children"][0]["attrs"]["style"]["align"],
        "right"
    );
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
    assert_eq!(alice.resolve_selection(anchors)?, Some(range));
    assert_eq!(
        alice.state()?["placements"][second.as_str()],
        original_writer
    );
    let (_, nested) = alice.insert_model_at(
        &[0],
        json!({"type":"section","children":[{"type":"paragraph","runs":[{"text":"Nested"}]}]}),
        EditOptions::default(),
        7.,
    )?;
    bob.apply_remote(&nested.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_paragraph_at(
            &[0, 0],
            json!({"type":"paragraph","runs":[{"text":"x","marks":{"unknown":true}}]}),
            EditOptions::default(),
            8.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!(
        "PASS: moved model insertion, foreign writers, selection, History and own checkpoint retry"
    );
    Ok(())
}
