use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"gallery","marks":[],"nodes":{
        "gallery":{"shape":"flow","children":["image"],"default":"image"},
        "image":{"shape":"text","text":false,"children":["photo"]},
        "photo":{"shape":"inline","attrs":{"src":{"default":""},"alt":{"default":""}}}
    }}))?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let options = EditOptions::default();
    let (image, _) =
        alice.insert_block("image", None, None, Attributes::new(), options.clone(), 1.)?;
    let (photo, _) = alice.insert_inline_at(
        &Key::root(),
        "photo",
        Some(&image),
        Attributes::from([("src".into(), json!("photo.png"))]),
        options.clone(),
        2.,
    )?;
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_text(
            Some(&image),
            "plain text",
            Attributes::new(),
            options.clone(),
            3.,
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let own = alice.set_attribute(&photo, "src", json!("updated.png"), options.clone(), 4.)?;
    let foreign = bob.set_attribute(&photo, "alt", json!("Peer caption"), options, 4.)?;
    alice.apply_remote(&foreign.ops)?;
    bob.apply_remote(&own.ops)?;
    let expected = alice.model()?;
    let saved = alice.checkpoint()?.to_json()?;
    let mut alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    let pending = alice.pending_changes().to_vec();
    for _ in 0..2 {
        for change in &pending {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.undo()?.ops)?;
    assert!(alice.model()?.to_string().contains("Peer caption"));
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!("PASS: inline-only image, peers, undo/redo and checkpoint retry");
    Ok(())
}
