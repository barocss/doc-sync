use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "domain": "graphic", "root": "board", "marks": [],
        "nodes": {
            "board": {"shape": "container", "children": ["card"]},
            "card": {"shape": "atom", "attrs": {
                "title": {"default": "Untitled"},
                "priority": {"default": 0, "min": 0, "max": 5}
            }}
        }
    }))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let (card, birth) = a.insert(
        "card",
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.0,
    )?;
    b.apply_remote(&birth.ops)?;
    let change = a.set_attribute(&card, "priority", json!(3), EditOptions::default(), 2.0)?;
    b.apply_remote(&change.ops)?;
    let saved = a.checkpoint()?.to_json()?;
    let mut restored = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(restored.model()?, b.model()?);
    assert_eq!(restored.pending_changes(), a.pending_changes());

    let schema = SpreadsheetSchema::compile(json!({
        "domain": "spreadsheet", "version": 1,
        "fields": {"score": {"type": "number", "default": 0, "min": 0, "max": 100}}
    }))?;
    let mut sheet = RuntimeSheet::new(RuntimeSheetOptions {
        actor: "A".into(),
        sheet_id: "scores".into(),
        rows: 100,
        columns: 20,
        schema,
    })?;
    assert_eq!(
        sheet.get_cell_value(2, 3, "score")?,
        RuntimeValue::Number(0.0)
    );
    sheet.set_cell(
        2,
        3,
        RuntimeCellPatch::from([("score".into(), RuntimeValue::Number(42.0))]),
    )?;
    let restored = RuntimeSheet::from_state(sheet.checkpoint().to_value())?;
    assert_eq!(
        restored.get_cell_value(2, 3, "score")?,
        RuntimeValue::Number(42.0)
    );
    assert_eq!(restored.pending_changes(), sheet.pending_changes());
    println!("PASS: custom graphic peer/checkpoint; custom sheet defaults/checkpoint");
    Ok(())
}
