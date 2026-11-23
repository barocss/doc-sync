//! Stable grid/row/column IDs select row adjacency and current cell-body edges.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}
fn row(text: &str) -> Value {
    json!({"type":"row","children":[cell(text),cell(text)]})
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","table"],"default":"p"},"p":{"shape":"text"},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let (grid, seed) = doc.insert_model_at(
        &[1],
        json!({"type":"table","children":[row("top"),row("bottom")]}),
        EditOptions::default(),
        1.,
    )?;
    let axes = |kind: &str| {
        seed.ops
            .iter()
            .filter_map(|op| match op.raw_operation() {
                Op::Node { id, node_type, .. } if node_type == kind => Some(Key::from_ticket(id)),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    let rows = axes("row");
    let columns = axes("col");
    let read = doc.read_model_for_edit()?;
    let result = doc.insert_grid_models_relative(
        &read.base,
        &[
            GridModelInsert {
                target: GridModelTarget::BeforeRow(GridRowTarget {
                    grid: grid.clone(),
                    row: rows[1].clone(),
                }),
                model: row("new row"),
            },
            GridModelInsert {
                target: GridModelTarget::InsideCellEnd(GridCellTarget {
                    grid,
                    row: rows[1].clone(),
                    column: columns[1].clone(),
                }),
                model: paragraph("same original cell"),
            },
        ],
        EditOptions::default(),
        2.,
    )?;
    assert!(result.keys[0].as_ref().unwrap().ticket()?.lamport > 0);
    let after = doc.model()?;
    assert_eq!(
        after["children"][1]["children"].as_array().unwrap().len(),
        3
    );
    doc.undo()?;
    assert_eq!(doc.model()?, read.model);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    assert_eq!(doc.model()?, after);
    assert!(doc
        .insert_grid_models_relative(&read.base, &[], EditOptions::default(), 3.)
        .is_err());
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
