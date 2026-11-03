use doc_sync_native_sdk::*;
use serde_json::{json, Value};
use std::io::{self, Read};
fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap()
}
fn opt() -> EditOptions {
    EditOptions::default()
}
fn state(d: &mut RuntimeDocument) -> Result<Value> {
    let h = d.history_status()?;
    Ok(json!({"model":d.model()?,"history":{"canUndo":h.can_undo,"canRedo":h.can_redo}}))
}
fn capture(
    label: &str,
    a: &mut RuntimeDocument,
    b: &mut RuntimeDocument,
    trace: &mut Vec<Value>,
) -> Result<()> {
    trace.push(json!({"label":label,"A":state(a)?,"B":state(b)?}));
    Ok(())
}
fn graphic(v: &Value) -> Result<Value> {
    let schema = RuntimeSchema::compile(v["schema"].clone())?;
    let identity = schema.identity().to_owned();
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let mut trace = vec![];
    capture("empty", &mut a, &mut b, &mut trace)?;
    let (group, _) = a.insert(s(v, "container"), None, None, Attributes::new(), opt(), 1.)?;
    capture("container", &mut a, &mut b, &mut trace)?;
    let (text, _) = a.insert(
        s(v, "text"),
        Some(&group),
        None,
        Attributes::new(),
        opt(),
        2.,
    )?;
    capture("text object", &mut a, &mut b, &mut trace)?;
    a.insert_label_text(&text, None, "A😀", opt(), 3.)?;
    capture("UTF16", &mut a, &mut b, &mut trace)?;
    for c in a.pending_changes() {
        b.apply_remote(&c.ops)?;
    }
    capture("delivery", &mut a, &mut b, &mut trace)?;
    let x = a.set_field(&group, s(v, "attribute"), s(v, "x"), json!(7), opt(), 4.)?;
    capture("A field", &mut a, &mut b, &mut trace)?;
    let y = b.set_field(&group, s(v, "attribute"), s(v, "y"), json!(11), opt(), 5.)?;
    capture("B field", &mut a, &mut b, &mut trace)?;
    a.apply_remote(&y.ops)?;
    b.apply_remote(&x.ops)?;
    capture("merge", &mut a, &mut b, &mut trace)?;
    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    capture("selective undo", &mut a, &mut b, &mut trace)?;
    let redo = a.redo()?;
    b.apply_remote(&redo.ops)?;
    capture("redo", &mut a, &mut b, &mut trace)?;
    let moved = a.reparent(&text, None, Some(&group), opt(), 6.)?;
    b.apply_remote(&moved.ops)?;
    capture("move text", &mut a, &mut b, &mut trace)?;
    let cp = RuntimeCheckpoint::from_json(&a.checkpoint()?.to_json()?)?;
    a = RuntimeDocument::restore(&cp)?;
    capture("restart", &mut a, &mut b, &mut trace)?;
    let before = a.checkpoint()?.to_json()?;
    let rejected = a
        .set_field(&group, s(v, "attribute"), s(v, "x"), json!(101), opt(), 7.)
        .is_err();
    assert!(rejected);
    assert_eq!(before, a.checkpoint()?.to_json()?);
    capture("invalid field atomic", &mut a, &mut b, &mut trace)?;
    for _ in 0..2 {
        for c in a.pending_changes().to_vec() {
            a.apply_remote(&c.ops)?;
            b.apply_remote(&c.ops)?;
        }
    }
    capture("duplicate pending", &mut a, &mut b, &mut trace)?;
    let deleted = a.delete(&[group], opt(), 8.)?;
    b.apply_remote(&deleted.ops)?;
    capture("delete old container", &mut a, &mut b, &mut trace)?;
    Ok(json!({"identity":identity,"trace":trace}))
}
fn document(v: &Value) -> Result<Value> {
    let schema = RuntimeSchema::compile(v["schema"].clone())?;
    let identity = schema.identity().to_owned();
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let mut trace = vec![];
    capture("empty default", &mut a, &mut b, &mut trace)?;
    a.insert_text(None, "abc", Attributes::new(), opt(), 1.)?;
    capture("root text", &mut a, &mut b, &mut trace)?;
    let end = Key::from_ticket(&Ticket {
        lamport: 3,
        actor: "A".into(),
    });
    let (title, _) =
        a.insert_block(s(v, "text"), Some(&end), None, Attributes::new(), opt(), 2.)?;
    capture("new block", &mut a, &mut b, &mut trace)?;
    a.insert_text(Some(&title), "DEF😀", Attributes::new(), opt(), 3.)?;
    capture("block text", &mut a, &mut b, &mut trace)?;
    a.set_attribute(&title, s(v, "field"), json!(4), opt(), 4.)?;
    capture("attribute", &mut a, &mut b, &mut trace)?;
    for c in a.pending_changes() {
        b.apply_remote(&c.ops)?;
    }
    capture("delivery", &mut a, &mut b, &mut trace)?;
    let peer = b.set_attribute(&title, s(v, "field"), json!(4), opt(), 5.)?;
    a.apply_remote(&peer.ops)?;
    capture("foreign same value", &mut a, &mut b, &mut trace)?;
    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    capture("fenced undo", &mut a, &mut b, &mut trace)?;
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&a.checkpoint()?.to_json()?)?)?;
    capture("restart", &mut a, &mut b, &mut trace)?;
    let before = a.checkpoint()?.to_json()?;
    assert!(a
        .set_attribute(&title, s(v, "field"), json!(6), opt(), 6.)
        .is_err());
    assert_eq!(before, a.checkpoint()?.to_json()?);
    capture("invalid attribute atomic", &mut a, &mut b, &mut trace)?;
    let atom_type = v["schema"]["nodes"][v["schema"]["root"].as_str().unwrap()]["children"][2]
        .as_str()
        .unwrap();
    let last_text = Key::from_ticket(&Ticket {
        lamport: 9,
        actor: "A".into(),
    });
    let (atom, birth) = a.insert_block(
        atom_type,
        Some(&last_text),
        None,
        Attributes::new(),
        opt(),
        7.,
    )?;
    b.apply_remote(&birth.ops)?;
    capture("atom", &mut a, &mut b, &mut trace)?;
    let removed = a.delete(&[atom], opt(), 9.)?;
    b.apply_remote(&removed.ops)?;
    capture("delete atom", &mut a, &mut b, &mut trace)?;
    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    capture("undo atom deletion", &mut a, &mut b, &mut trace)?;
    Ok(json!({"identity":identity,"trace":trace}))
}
fn sheet_state(s: &RuntimeSheet) -> Result<Value> {
    Ok(
        json!({"model":s.get_range(RuntimeRange{row:0,column:0,row_count:10,column_count:10,limit:Some(100)})?,"stats":s.stats(),"pending":s.pending_changes(),"checkpoint":s.checkpoint().to_value()}),
    )
}
fn sheet(v: &Value) -> Result<Value> {
    let schema = SpreadsheetSchema::compile(v["schema"].clone())?;
    let identity = schema.identity()?;
    let options = |actor: &str| RuntimeSheetOptions {
        actor: actor.into(),
        sheet_id: "custom".into(),
        rows: 10,
        columns: 10,
        schema: schema.clone(),
    };
    let mut a = RuntimeSheet::new(options("A"))?;
    let mut b = RuntimeSheet::new(options("B"))?;
    let mut trace = vec![];
    macro_rules! cap{($label:expr,$ops:expr)=>{trace.push(json!({"label":$label,"ops":$ops,"A":sheet_state(&a)?,"B":sheet_state(&b)?}));}}
    cap!("empty", Vec::<RuntimeSheetOp>::new());
    let first = a.set_cell(
        1,
        2,
        serde_json::from_value(json!({s(v,"text"):v["textValue"],s(v,"number"):10}))?,
    )?;
    cap!("A write", &first);
    b.receive(&first)?;
    cap!("delivery", Vec::<RuntimeSheetOp>::new());
    let second = a.set_cell(1, 2, serde_json::from_value(json!({s(v,"number"):20}))?)?;
    cap!("A second", &second);
    let peer = b.set_cell(
        1,
        2,
        serde_json::from_value(json!({s(v,"text"):v["textValue"]}))?,
    )?;
    a.receive(&peer)?;
    cap!("foreign same value", &peer);
    let undo = a.undo()?;
    cap!("undo second", &undo);
    let undo = a.undo()?;
    cap!("undo first fenced text", &undo);
    let redo = a.redo()?;
    cap!("redo first", &redo);
    a = RuntimeSheet::from_state(a.checkpoint().to_value())?;
    cap!("restart", Vec::<RuntimeSheetOp>::new());
    let clear = a.set_cell(
        1,
        2,
        serde_json::from_value(json!({s(v,"text"):null,s(v,"number"):null}))?,
    )?;
    cap!("clear", &clear);
    b.receive(a.pending_changes())?;
    cap!("all pending delivery", Vec::<RuntimeSheetOp>::new());
    let before = a.checkpoint().to_value();
    assert!(a
        .set_cell(1, 2, serde_json::from_value(json!({s(v,"number"):101}))?)
        .is_err());
    assert_eq!(a.checkpoint().to_value(), before);
    cap!("invalid atomic", Vec::<RuntimeSheetOp>::new());
    a.acknowledge(&a.pending_changes().to_vec())?;
    cap!("acknowledge", Vec::<RuntimeSheetOp>::new());
    Ok(json!({"identity":identity,"trace":trace}))
}
fn main() -> Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let v: Value = serde_json::from_str(&input)?;
    let output = json!({"graphics":v["graphics"].as_array().unwrap().iter().map(graphic).collect::<Result<Vec<_>>>()?,"documents":v["documents"].as_array().unwrap().iter().map(document).collect::<Result<Vec<_>>>()?,"sheets":v["sheets"].as_array().unwrap().iter().map(sheet).collect::<Result<Vec<_>>>()?});
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}
