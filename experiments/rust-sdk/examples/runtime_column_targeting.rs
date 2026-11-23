//! One stable column boundary and caller-ordered row payloads.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
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
        json!({"type":"table","children":[
            {"type":"row","children":[cell("00"),cell("01")]},
            {"type":"row","children":[cell("10"),cell("11")]}
        ]}),
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
    let result = doc.insert_column_relative(
        &read.base,
        &ColumnInsert {
            grid: grid.clone(),
            boundary: ColumnBoundary::Before(columns[1].clone()),
            cells: vec![
                RowCellPayload {
                    row: rows[1].clone(),
                    model: cell("new bottom"),
                },
                RowCellPayload {
                    row: rows[0].clone(),
                    model: cell("new top"),
                },
            ],
        },
        EditOptions::default(),
        2.,
    )?;
    assert_eq!(result.keys.len(), 1);
    let column = result.keys[0].clone().unwrap();
    assert!(column.ticket()?.lamport > 0);
    let after = doc.model()?;
    assert_eq!(
        after["children"][1]["children"][0]["children"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    doc.undo()?;
    assert_eq!(doc.model()?, read.model);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    let fresh = doc.read_model_for_edit()?;
    doc.insert_grid_models_relative(
        &fresh.base,
        &[GridModelInsert {
            target: GridModelTarget::InsideCellEnd(GridCellTarget {
                grid,
                row: rows[0].clone(),
                column,
            }),
            model: paragraph("later body edit"),
        }],
        EditOptions::default(),
        3.,
    )?;
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
