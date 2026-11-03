use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn options() -> EditOptions {
    EditOptions::default()
}
fn state(doc: &mut GraphicDocument) -> Result<Value> {
    let h = doc.history_status()?;
    Ok(json!({"model":doc.model()?,"history":{"canUndo":h.can_undo,"canRedo":h.can_redo}}))
}
fn capture(
    label: &str,
    a: &mut GraphicDocument,
    b: &mut GraphicDocument,
    trace: &mut Vec<Value>,
) -> Result<()> {
    trace.push(json!({"label":label,"A":state(a)?,"B":state(b)?}));
    Ok(())
}
fn main() -> Result<()> {
    let mut a = GraphicDocument::new("A")?;
    let mut b = GraphicDocument::new("B")?;
    let mut trace = vec![];
    capture("empty", &mut a, &mut b, &mut trace)?;
    let (frame, _) = a.insert(
        GraphicKind::Frame,
        None,
        None,
        Attributes::new(),
        options(),
        1.,
    )?;
    capture("frame", &mut a, &mut b, &mut trace)?;
    let (group, _) = a.insert(
        GraphicKind::Group,
        Some(&frame),
        None,
        Attributes::new(),
        options(),
        2.,
    )?;
    capture("group", &mut a, &mut b, &mut trace)?;
    let (label, _) = a.insert(
        GraphicKind::Label,
        Some(&group),
        None,
        Attributes::new(),
        options(),
        3.,
    )?;
    capture("label", &mut a, &mut b, &mut trace)?;
    a.insert_label_text(&label, None, "A😀", options(), 4.)?;
    capture("text", &mut a, &mut b, &mut trace)?;
    for c in a.pending_changes() {
        b.apply_remote(&c.ops)?;
    }
    capture("initial delivery", &mut a, &mut b, &mut trace)?;
    let x = a.set_field(&frame, "transform", "x", json!(12), options(), 6.)?;
    capture("A x", &mut a, &mut b, &mut trace)?;
    let y = b.set_field(&frame, "transform", "y", json!(34), options(), 7.)?;
    capture("B y", &mut a, &mut b, &mut trace)?;
    a.apply_remote(&y.ops)?;
    b.apply_remote(&x.ops)?;
    capture("exchange fields", &mut a, &mut b, &mut trace)?;
    let undo = a.undo()?;
    capture("undo x", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&undo.ops)?;
    capture("deliver undo", &mut a, &mut b, &mut trace)?;
    let moved = a.reparent(&group, None, Some(&frame), options(), 11.)?;
    capture("move group", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&moved.ops)?;
    capture("deliver move", &mut a, &mut b, &mut trace)?;
    let ids = b.label_text_ids(&label)?;
    let edit = b.insert_label_text(&label, ids.last(), "peer", options(), 13.)?;
    capture("B label edit", &mut a, &mut b, &mut trace)?;
    a.apply_remote(&edit.ops)?;
    capture("deliver text", &mut a, &mut b, &mut trace)?;
    let deleted = a.delete(&[frame.clone()], options(), 15.)?;
    capture("delete frame", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&deleted.ops)?;
    capture("deliver delete", &mut a, &mut b, &mut trace)?;
    a.undo()?;
    capture("undo delete", &mut a, &mut b, &mut trace)?;
    a.redo()?;
    capture("redo delete", &mut a, &mut b, &mut trace)?;
    a = GraphicDocument::restore(&a.checkpoint()?)?;
    let pending = a.pending_changes().to_vec();
    for _ in 0..2 {
        for c in &pending {
            a.apply_remote(&c.ops)?;
        }
    }
    capture("restore exact retry", &mut a, &mut b, &mut trace)?;
    println!("{}", json!(trace));
    Ok(())
}
