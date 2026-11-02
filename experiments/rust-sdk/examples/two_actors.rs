//! Run with `cargo run --manifest-path experiments/rust-sdk/Cargo.toml --example two_actors`.
use doc_sync_native_sdk::{
    Attributes, Checkpoint, Document, EditOptions, Key, ModelNode, ModelRun, Result, SchemaPreset,
};

fn text(node: &ModelNode) -> String {
    let mut output = String::new();
    for run in &node.runs {
        match run {
            ModelRun::Text(text) => output.push_str(&text.units.to_string().expect("example text")),
            ModelRun::Node(node) => output.push_str(&text(node)),
        }
    }
    for child in &node.children {
        output.push_str(&text(child));
    }
    output
}

fn main() -> Result<()> {
    let mut alice = Document::new("alice", SchemaPreset::Text)?;
    let mut bob = Document::new("bob", SchemaPreset::Text)?;
    // Each host sends the returned operations through its own transport.
    let a = alice.insert_text(
        &Key::root(),
        "A",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    let b = bob.insert_text(
        &Key::root(),
        "B",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    alice.apply_remote(&b.ops)?;
    bob.apply_remote(&a.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    println!("converged: {}", text(&alice.model()?));

    // Persist the native document, actor history, and exact unacknowledged queue together.
    let saved_json = alice.checkpoint()?.to_json()?;
    let saved = Checkpoint::from_json(&saved_json)?;
    let mut restarted = Document::restore(&saved)?;
    let retry = restarted.pending_changes().to_vec();
    // A lost acknowledgement can cause the same operations to arrive twice.
    for _ in 0..2 {
        for change in &retry {
            bob.apply_remote(&change.ops)?;
        }
    }
    restarted.acknowledge(&retry)?;
    let undo = restarted.undo()?;
    bob.apply_remote(&undo.ops)?;
    assert_eq!(restarted.model()?, bob.model()?);
    assert_eq!(text(&bob.model()?), "B");
    println!("after alice undo and restart: {}", text(&bob.model()?));
    let redo = restarted.redo()?;
    bob.apply_remote(&redo.ops)?;
    assert_eq!(restarted.model()?, bob.model()?);
    println!("after alice redo: {}", text(&bob.model()?));
    Ok(())
}
