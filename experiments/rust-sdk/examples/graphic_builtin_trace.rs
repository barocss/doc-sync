use doc_sync_native_sdk::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
fn opts() -> EditOptions {
    EditOptions::default()
}
fn attrs(v: Value) -> Attributes {
    serde_json::from_value(v).unwrap()
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
    let mut a = GraphicDocument::with_preset("A", GraphicPreset::Builtins)?;
    let mut b = GraphicDocument::with_preset("B", GraphicPreset::Builtins)?;
    let mut trace = vec![];
    let mut ids = BTreeMap::new();
    macro_rules! add {
        ($name:expr,$kind:expr,$parent:expr,$attrs:expr) => {{
            let (key, _) = a.insert($kind, $parent, None, attrs($attrs), opts(), 0.)?;
            ids.insert($name, key.as_str().to_owned());
            capture($name, &mut a, &mut b, &mut trace)?;
            key
        }};
    }
    capture("empty", &mut a, &mut b, &mut trace)?;
    let path = add!(
        "path",
        GraphicKind::Path,
        None,
        json!({"name":"Vector","closed":true})
    );
    let v1 = add!("vertex1", GraphicKind::Vertex, Some(&path), json!({"x":10}));
    let v2 = add!("vertex2", GraphicKind::Vertex, Some(&path), json!({"y":20}));
    let _segment = add!(
        "segment",
        GraphicKind::Segment,
        Some(&path),
        json!({"from":v1.as_str(),"to":v2.as_str(),"kind":"cubic"})
    );
    let paint = add!(
        "paint",
        GraphicKind::Paint,
        Some(&path),
        json!({"kind":"linear-gradient","start":{"x":2}})
    );
    let stop = add!(
        "stop",
        GraphicKind::GradientStop,
        Some(&paint),
        json!({"offset":0.25,"color":"#11223344"})
    );
    let component = add!(
        "component",
        GraphicKind::Component,
        None,
        json!({"name":"Component","transform":{"a":-2,"c":0.5}})
    );
    let rectangle = add!(
        "rectangle",
        GraphicKind::Rectangle,
        Some(&component),
        json!({"cornerRadius":8})
    );
    let instance = add!(
        "instance",
        GraphicKind::Instance,
        None,
        json!({"componentId":component.as_str()})
    );
    let _override = add!(
        "override",
        GraphicKind::InstanceOverride,
        Some(&instance),
        json!({"targetId":rectangle.as_str(),"assignment":{"property":"opacity","value":0.5}})
    );
    let frame = add!(
        "frame",
        GraphicKind::Frame,
        None,
        json!({"layout":{"mode":"horizontal","gap":12}})
    );
    let boolean = add!(
        "boolean",
        GraphicKind::Boolean,
        None,
        json!({"operation":"subtract"})
    );
    let _source = add!(
        "source",
        GraphicKind::SourceRef,
        Some(&boolean),
        json!({"targetId":path.as_str()})
    );
    let label = add!(
        "label",
        GraphicKind::Label,
        Some(&frame),
        json!({"fontSize":24})
    );
    a.insert_label_text_with_marks(
        &label,
        None,
        Utf16Text(vec![0xD800, 65, 0xDC00]),
        attrs(json!({"bold":true})),
        opts(),
        1.,
    )?;
    capture("text", &mut a, &mut b, &mut trace)?;
    for c in a.pending_changes() {
        b.apply_remote(&c.ops)?;
    }
    capture("initial delivery", &mut a, &mut b, &mut trace)?;
    let x = a.set_attribute(&v1, "x", json!(30), opts(), 2.)?;
    capture("A vertex x", &mut a, &mut b, &mut trace)?;
    let y = b.set_attribute(&v1, "y", json!(40), opts(), 2.)?;
    capture("B vertex y", &mut a, &mut b, &mut trace)?;
    a.apply_remote(&y.ops)?;
    b.apply_remote(&x.ops)?;
    capture("exchange vertex", &mut a, &mut b, &mut trace)?;
    let x = a.set_field(&v1, "handleOut", "x", json!(7), opts(), 3.)?;
    capture("A handle x", &mut a, &mut b, &mut trace)?;
    let y = b.set_field(&v1, "handleOut", "y", json!(8), opts(), 3.)?;
    capture("B handle y", &mut a, &mut b, &mut trace)?;
    a.apply_remote(&y.ops)?;
    b.apply_remote(&x.ops)?;
    capture("exchange handle", &mut a, &mut b, &mut trace)?;
    let color = a.set_attribute(&stop, "color", json!("#55667788"), opts(), 4.)?;
    capture("A stop color", &mut a, &mut b, &mut trace)?;
    let offset = b.set_attribute(&stop, "offset", json!(0.75), opts(), 4.)?;
    capture("B stop offset", &mut a, &mut b, &mut trace)?;
    a.apply_remote(&offset.ops)?;
    b.apply_remote(&color.ops)?;
    capture("exchange gradient", &mut a, &mut b, &mut trace)?;
    let undo = a.undo()?;
    capture("undo color", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&undo.ops)?;
    capture("deliver undo", &mut a, &mut b, &mut trace)?;
    let moved = a.reparent(&component, Some(&frame), None, opts(), 5.)?;
    capture("move component", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&moved.ops)?;
    capture("deliver move", &mut a, &mut b, &mut trace)?;
    let deleted = a.delete(&[component.clone()], opts(), 6.)?;
    capture("delete component", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&deleted.ops)?;
    capture("deliver delete", &mut a, &mut b, &mut trace)?;
    let undo = a.undo()?;
    capture("undo delete", &mut a, &mut b, &mut trace)?;
    b.apply_remote(&undo.ops)?;
    capture("deliver restore", &mut a, &mut b, &mut trace)?;
    a = GraphicDocument::restore(&a.checkpoint()?)?;
    let pending = a.pending_changes().to_vec();
    for _ in 0..2 {
        for c in &pending {
            a.apply_remote(&c.ops)?;
        }
    }
    capture("restart exact retry", &mut a, &mut b, &mut trace)?;
    println!("{}", json!({"ids":ids,"trace":trace}));
    Ok(())
}
