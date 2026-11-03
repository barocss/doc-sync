//! Independent native authoring. TypeScript operations and expected states are not inputs.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn sheet(actor: &str) -> Result<SparseSheet> {
    SparseSheet::new(SparseSheetOptions {
        actor: actor.into(),
        sheet_id: "trace-sheet".into(),
        rows: 1_000_000_000,
        columns: 1_000_000,
    })
}
fn set(s: &mut SparseSheet, row: u64, column: u64, value: Value) -> Result<Vec<SparseSheetOp>> {
    s.set_cell(row, column, serde_json::from_value(value)?)
}
fn state(s: &SparseSheet) -> Result<Value> {
    let checkpoint = s.checkpoint().to_value();
    Ok(
        json!({"model":s.get_range(SparseRange {row:0,column:0,row_count:1_000_000_000,column_count:1_000_000,limit:Some(100)})?,
        "stats":s.stats(),"pending":s.pending_changes(),"history":{"undo":checkpoint["checkpoint"]["undo"],"redo":checkpoint["checkpoint"]["redo"]},
        "checkpoint":checkpoint}),
    )
}
fn capture(
    trace: &mut Vec<Value>,
    label: &str,
    a: &SparseSheet,
    b: &SparseSheet,
    ops: &[SparseSheetOp],
) -> Result<()> {
    trace.push(json!({"label":label,"ops":ops,"A":state(a)?,"B":state(b)?}));
    Ok(())
}
fn main() -> Result<()> {
    let mut a = sheet("A")?;
    let mut b = sheet("B")?;
    let mut trace = vec![];
    capture(&mut trace, "empty implicit axes", &a, &b, &[])?;
    let first_a = set(&mut a, 7, 9, json!({"value":"A","fill":"#fff"}))?;
    capture(&mut trace, "A concurrent first write", &a, &b, &first_a)?;
    let first_b = set(&mut b, 7, 9, json!({"value":"B","bold":true}))?;
    capture(&mut trace, "B concurrent first write", &a, &b, &first_b)?;
    a.receive(&first_b)?;
    capture(&mut trace, "A receives B first write", &a, &b, &[])?;
    b.receive(&first_a)?;
    capture(&mut trace, "B receives A first write", &a, &b, &[])?;
    let one = set(&mut a, 7, 9, json!({"value":1}))?;
    capture(&mut trace, "A value one", &a, &b, &one)?;
    let two = set(&mut a, 7, 9, json!({"value":2}))?;
    capture(&mut trace, "A value two", &a, &b, &two)?;
    let mut delivery = two.clone();
    delivery.extend(one);
    delivery.extend(first_a);
    delivery.extend(two);
    b.receive(&delivery)?;
    capture(&mut trace, "B shuffled duplicate delivery", &a, &b, &[])?;
    let format = set(&mut b, 7, 9, json!({"numberFormat":"0.00"}))?;
    capture(&mut trace, "B independent format", &a, &b, &format)?;
    a.receive(&format)?;
    capture(&mut trace, "A receives independent format", &a, &b, &[])?;
    for (label, undo) in [
        ("A undo two", true),
        ("A undo one", true),
        ("A redo one", false),
        ("A redo two", false),
    ] {
        let ops = if undo { a.undo()? } else { a.redo()? };
        capture(&mut trace, label, &a, &b, &ops)?;
    }
    let pending = a.pending_changes().to_vec();
    b.receive(&pending)?;
    capture(&mut trace, "B receives history operations", &a, &b, &[])?;
    let same = set(&mut b, 7, 9, json!({"value":2}))?;
    capture(&mut trace, "B same value writer", &a, &b, &same)?;
    a.receive(&same)?;
    capture(&mut trace, "A receives same value writer", &a, &b, &[])?;
    let fenced = a.undo()?;
    capture(&mut trace, "A undo fenced value", &a, &b, &fenced)?;
    let clear = set(
        &mut a,
        7,
        9,
        json!({"value":null,"formula":null,"fill":null,"bold":null,"numberFormat":null}),
    )?;
    capture(&mut trace, "A clears all fields", &a, &b, &clear)?;
    let mut clear_delivery = clear.clone();
    clear_delivery.extend(pending.iter().rev().cloned());
    clear_delivery.extend(clear);
    b.receive(&clear_delivery)?;
    capture(&mut trace, "B clear before old writes", &a, &b, &[])?;
    let ops = a.undo()?;
    capture(&mut trace, "A undo clear", &a, &b, &ops)?;
    let checkpoint = SparseSheetCheckpoint::from_json(&a.checkpoint().to_json()?)?;
    a = SparseSheet::from_state(checkpoint.to_value())?;
    capture(&mut trace, "A coupled restart with redo", &a, &b, &[])?;
    let ops = a.redo()?;
    capture(&mut trace, "A redo clear after restart", &a, &b, &ops)?;
    let formula = set(
        &mut a,
        999_999_999,
        999_999,
        json!({"value":7,"formula":"=A1+1","bold":false}),
    )?;
    capture(&mut trace, "A far static formula string", &a, &b, &formula)?;
    let prefix = a.pending_changes()[..2].to_vec();
    a.acknowledge(&prefix)?;
    capture(
        &mut trace,
        "A exact pending prefix acknowledgement",
        &a,
        &b,
        &[],
    )?;
    a = SparseSheet::from_state(a.checkpoint().to_value())?;
    let retry = a.pending_changes().to_vec();
    for _ in 0..2 {
        let mut shuffled = retry.clone();
        shuffled.reverse();
        a.receive(&shuffled)?;
        b.receive(&shuffled)?;
    }
    capture(
        &mut trace,
        "A restart and duplicate shuffled pending retry twice",
        &a,
        &b,
        &[],
    )?;
    let ops = a.undo()?;
    capture(&mut trace, "A undo far write after restart", &a, &b, &ops)?;
    b.receive(&ops)?;
    capture(&mut trace, "B receives far undo", &a, &b, &[])?;
    let ops = a.redo()?;
    capture(&mut trace, "A redo far write", &a, &b, &ops)?;
    b.receive(&ops)?;
    capture(&mut trace, "B receives far redo", &a, &b, &[])?;
    let prefix = a.pending_changes().to_vec();
    a.acknowledge(&prefix)?;
    capture(&mut trace, "A acknowledges remaining pending", &a, &b, &[])?;
    println!("{}", serde_json::to_string(&trace)?);
    Ok(())
}
