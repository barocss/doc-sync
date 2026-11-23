//! Validate the two product patterns through the native SDK.
use doc_sync_native_sdk::*;
use serde_json::json;
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"book","marks":[],
        "markValues":{"link":{"default":"","pattern":r"^(https?://\S+)?$"}},"nodes":{
        "book":{"shape":"flow","children":["line","grid"],"default":"line"},
        "line":{"shape":"text","attrs":{"meta":{"default":{"url":""},"fields":{
            "url":{"default":"","pattern":r"^(https?://\S+)?$"}}}}},
        "grid":{"shape":"grid","children":["row"]},
        "row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"],"attrs":{
            "color":{"default":"","pattern":r"^(#[0-9a-fA-F]{6})?$"}}},
        "body":{"shape":"flow","children":["line"],"default":"line"}}}))?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let (line, _) = alice.insert_block(
        "line",
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.,
    )?;
    let text = alice.insert_text(
        Some(&line),
        "link",
        Attributes::from([("link".into(), json!("https://example.test"))]),
        EditOptions::default(),
        2.,
    )?;
    let token = Key::from_ticket(match &text.ops[0] {
        Op::Text { id, .. } => id,
        _ => unreachable!(),
    });
    let (grid, rows, cols, _) = alice.insert_grid_at(
        &Key::root(),
        "grid",
        Some(&token),
        1,
        1,
        Attributes::new(),
        EditOptions::default(),
        3.,
    )?;
    alice.set_cell_attribute(
        &grid,
        &rows[0],
        &cols[0],
        "color",
        json!("#aBc123"),
        EditOptions::default(),
        4.,
    )?;
    alice.set_field_path(
        &line,
        "meta",
        &["url"],
        json!("https://example.test/path"),
        EditOptions::default(),
        5.,
    )?;
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .format_tokens(
            &[token],
            "link",
            json!("https://bad path"),
            EditOptions::default(),
            6.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let mut alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&before)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes() {
            bob.apply_remote(&change.ops)?;
        }
    }
    bob.apply_remote(&alice.undo()?.ops)?;
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    Ok(())
}
