//! One native insert-only batch, shared columns, checkpoint restore and undo.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}
fn insert(at: &[usize], model: Value) -> ModelInsert {
    ModelInsert {
        at: at.into(),
        model,
    }
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","table"],"default":"paragraph"},
        "paragraph":{"shape":"text"},"table":{"shape":"grid","children":["row"]},
        "row":{"shape":"row","children":["cell"]},"cell":{"shape":"cell","children":["body"]},
        "body":{"shape":"flow","children":["paragraph"],"default":"paragraph"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let before = doc.model()?;
    let table = json!({"type":"table","children":[
        {"type":"row","children":[cell("top")]},
        {"type":"row","children":[cell("bottom")]}
    ]});
    let result = doc.insert_models_batch(
        &[
            insert(&[1], table),
            insert(&[1, 0, 1], cell("new top")),
            insert(&[1, 1, 1], cell("new bottom")),
            insert(&[1, 0, 1, 0, 1], paragraph("second block")),
        ],
        EditOptions::default(),
        1.,
    )?;
    assert_eq!(result.keys[1], result.keys[2]);
    assert_eq!(doc.pending_changes(), &[result.change.clone()]);
    let after = doc.model()?;
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    doc.undo()?;
    assert_eq!(doc.model()?, before);
    assert!(!doc.history_status()?.can_undo);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
