//! A process-local read base and strict identity-relative insertion.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box"],"default":"p"},
        "p":{"shape":"text"},"box":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let (anchor, _) = doc.insert_model_at(&[1], paragraph("anchor"), EditOptions::default(), 1.)?;
    let read = doc.read_model_for_edit()?;
    let result = doc.insert_models_relative(
        &read.base,
        &[
            RelativeModelInsert {
                target: RelativeModelTarget::After(anchor.clone()),
                model: paragraph("first"),
            },
            RelativeModelInsert {
                target: RelativeModelTarget::After(anchor),
                model: paragraph("second"),
            },
        ],
        EditOptions::default(),
        2.,
    )?;
    let after = doc.model()?;
    // The successful publication consumes this local base, even for an empty retry.
    assert!(doc
        .insert_models_relative(&read.base, &[], EditOptions::default(), 3.)
        .is_err());
    doc.undo()?;
    assert_eq!(doc.model()?, read.model);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    let fresh = doc.read_model_for_edit()?;
    doc.insert_models_relative(
        &fresh.base,
        &[RelativeModelInsert {
            target: RelativeModelTarget::InsideEnd(FlowTarget::Root),
            model: paragraph("end"),
        }],
        EditOptions::default(),
        4.,
    )?;
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
