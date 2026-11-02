//! Fixed SDK-authored trace. No TypeScript state, operations, or inverses are inputs.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn id(n: u64, actor: &str) -> Ticket {
    Ticket {
        lamport: n,
        actor: actor.into(),
    }
}
fn options() -> EditOptions {
    EditOptions::default()
}
fn state(doc: &mut Document) -> Result<Value> {
    let status = doc.history_status()?;
    Ok(
        json!({"model":doc.model()?, "history":{"canUndo":status.can_undo,"canRedo":status.can_redo},
        "pending":doc.pending_changes().iter().map(|c|&c.ops).collect::<Vec<_>>()}),
    )
}
fn capture(
    label: &str,
    a: &mut Document,
    b: &mut Document,
    ops: &[Op],
    trace: &mut Vec<Value>,
) -> Result<()> {
    trace.push(json!({"label":label,"ops":ops,"A":state(a)?,"B":state(b)?}));
    Ok(())
}
fn main() -> Result<()> {
    let mut a = Document::new("A", SchemaPreset::Text)?;
    let mut b = Document::new("B", SchemaPreset::Text)?;
    let mut trace = vec![];
    let mut marks = Attributes::new();
    marks.insert("italic".into(), json!(true));
    let ac = a.insert_text(
        &Key::root(),
        Utf16Text(vec![0xd800, 0x61, 0xdc00]),
        marks,
        options(),
        1.0,
    )?;
    capture(
        "A insert isolated UTF16 explicit italic",
        &mut a,
        &mut b,
        &ac.ops,
        &mut trace,
    )?;
    let bc = b.insert_text(&Key::root(), "B", Attributes::new(), options(), 2.0)?;
    capture(
        "B concurrent insert explicit empty marks",
        &mut a,
        &mut b,
        &bc.ops,
        &mut trace,
    )?;
    a.apply_remote(&bc.ops)?;
    capture("A apply B insert", &mut a, &mut b, &[], &mut trace)?;
    b.apply_remote(&ac.ops)?;
    capture("B apply A insert", &mut a, &mut b, &[], &mut trace)?;
    let am = a.set_mark(vec![id(1, "A")], Mark::Bold(Some(true)), options(), 5.0)?;
    capture("A bold first A unit", &mut a, &mut b, &am.ops, &mut trace)?;
    b.apply_remote(&am.ops)?;
    capture("B apply A mark", &mut a, &mut b, &[], &mut trace)?;
    let bm = b.set_mark(vec![id(1, "A")], Mark::Bold(Some(true)), options(), 7.0)?;
    capture(
        "B same value foreign mark",
        &mut a,
        &mut b,
        &bm.ops,
        &mut trace,
    )?;
    a.apply_remote(&bm.ops)?;
    capture("A apply B mark", &mut a, &mut b, &[], &mut trace)?;
    let u = a.undo()?;
    capture("A undo fenced mark", &mut a, &mut b, &u.ops, &mut trace)?;
    let ad = a.delete_text(vec![id(2, "A")], options(), 10.0)?;
    capture(
        "A delete middle A unit",
        &mut a,
        &mut b,
        &ad.ops,
        &mut trace,
    )?;
    let bd = b.delete_text(vec![id(2, "A")], options(), 11.0)?;
    capture(
        "B concurrent delete same unit",
        &mut a,
        &mut b,
        &bd.ops,
        &mut trace,
    )?;
    a.apply_remote(&bd.ops)?;
    capture("A apply B delete", &mut a, &mut b, &[], &mut trace)?;
    b.apply_remote(&ad.ops)?;
    capture("B apply A delete", &mut a, &mut b, &[], &mut trace)?;
    let checkpoint = Checkpoint::from_json(&a.checkpoint()?.to_json()?)?;
    a = Document::restore(&checkpoint)?;
    let retry = a.pending_changes().to_vec();
    for _ in 0..2 {
        for change in &retry {
            a.apply_remote(&change.ops)?;
            b.apply_remote(&change.ops)?;
        }
    }
    capture(
        "A restart and exact pending retry twice to A and B",
        &mut a,
        &mut b,
        &[],
        &mut trace,
    )?;
    let u = a.undo()?;
    capture(
        "A undo own deletion foreign remains",
        &mut a,
        &mut b,
        &u.ops,
        &mut trace,
    )?;
    b.apply_remote(&u.ops)?;
    capture("B apply A undelete", &mut a, &mut b, &[], &mut trace)?;
    let r = a.redo()?;
    capture("A redo own deletion", &mut a, &mut b, &r.ops, &mut trace)?;
    b.apply_remote(&r.ops)?;
    capture("B apply A redo", &mut a, &mut b, &[], &mut trace)?;
    let u = b.undo()?;
    capture(
        "B undo own deletion A remains",
        &mut a,
        &mut b,
        &u.ops,
        &mut trace,
    )?;
    a.apply_remote(&u.ops)?;
    capture("A apply B undelete", &mut a, &mut b, &[], &mut trace)?;
    println!("{}", serde_json::to_string(&trace)?);
    Ok(())
}
