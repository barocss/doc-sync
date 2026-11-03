use doc_sync_native_sdk::{Attributes, EditOptions, GraphicDocument, GraphicKind};
use serde_json::json;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut a = GraphicDocument::new("A")?;
    let mut b = GraphicDocument::new("B")?;
    let (frame, _) = a.insert(
        GraphicKind::Frame,
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        0.,
    )?;
    let (label, _) = a.insert(
        GraphicKind::Label,
        Some(&frame),
        None,
        Attributes::new(),
        EditOptions::default(),
        1.,
    )?;
    a.insert_label_text(&label, None, "Native graphic", EditOptions::default(), 2.)?;
    for change in a.pending_changes() {
        b.apply_remote(&change.ops)?;
    }
    b.set_field(
        &frame,
        "transform",
        "x",
        json!(120),
        EditOptions::default(),
        3.,
    )?;
    for change in b.pending_changes() {
        a.apply_remote(&change.ops)?;
    }
    assert_eq!(a.model()?, b.model()?);
    let checkpoint = a.checkpoint()?.to_json()?;
    println!("{}", serde_json::to_string_pretty(&a.model()?)?);
    println!("checkpoint bytes: {}", checkpoint.len());
    Ok(())
}
