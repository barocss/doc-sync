use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"book","marks":[],"nodes":{
        "book":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{"label":{"default":""}}},
        "spare-text":{"shape":"text"},
        "spare-atom":{"shape":"atom"},
        "spare-grid":{"shape":"grid","children":["spare-row"]},
        "spare-row":{"shape":"row","children":["spare-cell"]},
        "spare-cell":{"shape":"cell","children":["spare-body"]},
        "spare-body":{"shape":"flow","children":["spare-text"],"default":"spare-text"}
    }}))?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let options = EditOptions::default();
    let (line, _) =
        alice.insert_block("line", None, None, Attributes::new(), options.clone(), 1.)?;
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let own = alice.insert_text(Some(&line), "Hello", Attributes::new(), options.clone(), 2.)?;
    let foreign = bob.set_attribute(&line, "label", json!("Peer label"), options.clone(), 2.)?;
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
    assert!(alice.model()?.to_string().contains("Peer label"));
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_block("spare-text", None, None, Attributes::new(), options, 3.)
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!("PASS: unused declarations, placement checks, peers, undo/redo and checkpoint retry");
    Ok(())
}
