use doc_sync_native_sdk::*;
use serde_json::json;
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box"],"default":"p"},"p":{"shape":"text"},"box":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("catalog-example", schema)?;
    doc.insert_model_at(
        &[1],
        json!({"type":"p","runs":[{"text":"first"}]}),
        EditOptions::default(),
        1.,
    )?;
    let read = doc.read_model_with_catalog()?;
    let paragraph = read
        .catalog
        .blocks
        .iter()
        .find(|block| block.node_type == "p")
        .expect("stored paragraph is discoverable");
    assert_eq!(paragraph.path, vec![1]);
    doc.insert_models_relative(
        &read.base,
        &[RelativeModelInsert {
            target: RelativeModelTarget::After(paragraph.key.clone()),
            model: json!({"type":"p","runs":[{"text":"after discovered ID"}]}),
        }],
        EditOptions::default(),
        2.,
    )?;
    // Every publication consumes the read base. Read again before the next edit.
    assert_ne!(doc.read_model_with_catalog()?.base, read.base);
    println!("catalog-to-command round trip passed");
    Ok(())
}
