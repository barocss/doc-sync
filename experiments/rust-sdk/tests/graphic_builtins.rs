use doc_sync_native_sdk::{
    Attributes, EditOptions, GraphicCheckpoint, GraphicDocument, GraphicKind as K, GraphicNode,
    GraphicPreset, Key, Op, Ticket, Utf16Text,
};
use serde_json::{json, Value};
fn opts() -> EditOptions {
    EditOptions::default()
}
fn new(actor: &str) -> GraphicDocument {
    GraphicDocument::with_preset(actor, GraphicPreset::Builtins).unwrap()
}
fn attrs(values: Value) -> Attributes {
    serde_json::from_value(values).unwrap()
}
fn insert(doc: &mut GraphicDocument, kind: K, parent: Option<&Key>, values: Value) -> Key {
    doc.insert(kind, parent, None, attrs(values), opts(), 0.)
        .unwrap()
        .0
}
fn find<'a>(n: &'a GraphicNode, id: &Key) -> Option<&'a GraphicNode> {
    if &n.id == id {
        Some(n)
    } else {
        n.children.iter().find_map(|n| find(n, id))
    }
}
fn deliver(from: &GraphicDocument, to: &mut GraphicDocument) {
    for c in from.pending_changes() {
        to.apply_remote(&c.ops).unwrap();
    }
}
#[test]
fn complete_manifest_admits_seventeen_declared_nodes_and_shape_specific_children() {
    let mut doc = new("A");
    assert_eq!(doc.preset(), GraphicPreset::Builtins);
    assert_eq!(
        GraphicPreset::Builtins.manifest()["nodes"]
            .as_object()
            .unwrap()
            .len(),
        17
    );
    let frame = insert(
        &mut doc,
        K::Frame,
        None,
        json!({"layout":{"mode":"horizontal","gap":12}}),
    );
    let component = insert(&mut doc, K::Component, Some(&frame), json!({}));
    let rectangle = insert(
        &mut doc,
        K::Rectangle,
        Some(&component),
        json!({"cornerRadius":8,"transform":{"a":-2,"c":0.5,"e":12}}),
    );
    let ellipse = insert(&mut doc, K::Ellipse, Some(&component), json!({}));
    let group = insert(&mut doc, K::Group, Some(&component), json!({}));
    let label = insert(&mut doc, K::Label, Some(&group), json!({"fontSize":24}));
    let path = insert(
        &mut doc,
        K::Path,
        Some(&frame),
        json!({"closed":true,"fillRule":"evenodd"}),
    );
    let v1 = insert(
        &mut doc,
        K::Vertex,
        Some(&path),
        json!({"x":1,"handleOut":{"x":4}}),
    );
    let v2 = insert(&mut doc, K::Vertex, Some(&path), json!({"y":2}));
    let segment = insert(
        &mut doc,
        K::Segment,
        Some(&path),
        json!({"from":v1.as_str(),"to":v2.as_str(),"kind":"cubic"}),
    );
    let paint = insert(
        &mut doc,
        K::Paint,
        Some(&rectangle),
        json!({"kind":"linear-gradient","color":"#AABBCC88","imageTransform":{"a":0,"d":0}}),
    );
    insert(
        &mut doc,
        K::GradientStop,
        Some(&paint),
        json!({"offset":0.5,"color":"#223344"}),
    );
    let stroke = insert(
        &mut doc,
        K::Stroke,
        Some(&ellipse),
        json!({"width":4,"cap":"round"}),
    );
    insert(
        &mut doc,
        K::GradientStop,
        Some(&stroke),
        json!({"offset":1}),
    );
    let instance = insert(
        &mut doc,
        K::Instance,
        Some(&frame),
        json!({"componentId":component.as_str()}),
    );
    insert(
        &mut doc,
        K::InstanceOverride,
        Some(&instance),
        json!({"targetId":rectangle.as_str(),"assignment":{"property":"opacity","value":0.5}}),
    );
    let boolean = insert(
        &mut doc,
        K::Boolean,
        Some(&frame),
        json!({"operation":"subtract"}),
    );
    insert(
        &mut doc,
        K::SourceRef,
        Some(&boolean),
        json!({"targetId":path.as_str()}),
    );
    let mut marks = Attributes::new();
    marks.insert("bold".into(), json!(true));
    doc.insert_label_text_with_marks(&label, None, Utf16Text(vec![0xD800, 65]), marks, opts(), 0.)
        .unwrap();
    let model = doc.model().unwrap();
    assert_eq!(find(&model, &label).unwrap().runs[0].marks["bold"], true);
    assert_eq!(find(&model, &segment).unwrap().attrs["from"], v1.as_str());
    assert_eq!(
        find(&model, &rectangle).unwrap().attrs["transform"]["a"],
        -2
    );
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    for (kind, parent) in [
        (K::Vertex, None),
        (K::Rectangle, Some(&path)),
        (K::Vertex, Some(&rectangle)),
        (K::GradientStop, Some(&frame)),
        (K::Paint, Some(&label)),
    ] {
        assert!(doc
            .insert(kind, parent, None, Attributes::new(), opts(), 0.)
            .is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    }
}
#[test]
fn independent_vertex_handle_gradient_fields_merge_and_selective_undo() {
    let mut a = new("A");
    let path = insert(&mut a, K::Path, None, json!({}));
    let vertex = insert(&mut a, K::Vertex, Some(&path), json!({}));
    let paint = insert(
        &mut a,
        K::Paint,
        Some(&path),
        json!({"kind":"linear-gradient"}),
    );
    let stop = insert(&mut a, K::GradientStop, Some(&paint), json!({}));
    let mut b = new("B");
    deliver(&a, &mut b);
    let x = a
        .set_attribute(&vertex, "x", json!(10), opts(), 1.)
        .unwrap();
    let y = b
        .set_attribute(&vertex, "y", json!(20), opts(), 1.)
        .unwrap();
    a.apply_remote(&y.ops).unwrap();
    b.apply_remote(&x.ops).unwrap();
    let hx = a
        .set_field(&vertex, "handleOut", "x", json!(30), opts(), 2.)
        .unwrap();
    let hy = b
        .set_field(&vertex, "handleOut", "y", json!(40), opts(), 2.)
        .unwrap();
    a.apply_remote(&hy.ops).unwrap();
    b.apply_remote(&hx.ops).unwrap();
    let color = a
        .set_attribute(&stop, "color", json!("#11223344"), opts(), 3.)
        .unwrap();
    let offset = b
        .set_attribute(&stop, "offset", json!(0.75), opts(), 3.)
        .unwrap();
    a.apply_remote(&offset.ops).unwrap();
    b.apply_remote(&color.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    a.undo().unwrap();
    let model = a.model().unwrap();
    let stop = find(&model, &stop).unwrap();
    assert_eq!(stop.attrs["color"], "#000000");
    assert_eq!(stop.attrs["offset"], 0.75);
    let undone = a.undo().unwrap();
    b.apply_remote(&undone.ops).unwrap();
    assert_eq!(
        find(&a.model().unwrap(), &vertex).unwrap().attrs["handleOut"],
        json!({"x":0,"y":40})
    );
    let foreign = b
        .set_field(&vertex, "handleOut", "x", json!(99), opts(), 4.)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    assert!(a.redo().unwrap().ops.is_empty());
    assert_eq!(
        find(&a.model().unwrap(), &vertex).unwrap().attrs["handleOut"]["x"],
        99
    );
}
#[test]
fn stable_refs_survive_target_move_delete_undo_and_restart_retry() {
    let mut doc = new("A");
    let frame = insert(&mut doc, K::Frame, None, json!({}));
    let component = insert(&mut doc, K::Component, None, json!({}));
    let rectangle = insert(&mut doc, K::Rectangle, Some(&component), json!({}));
    let instance = insert(
        &mut doc,
        K::Instance,
        None,
        json!({"componentId":component.as_str()}),
    );
    let override_id = insert(
        &mut doc,
        K::InstanceOverride,
        Some(&instance),
        json!({"targetId":rectangle.as_str(),"assignment":{"property":"transform.a","value":2}}),
    );
    let boolean = insert(&mut doc, K::Boolean, None, json!({}));
    let source = insert(
        &mut doc,
        K::SourceRef,
        Some(&boolean),
        json!({"targetId":"999@absent"}),
    );
    doc.reparent(&component, Some(&frame), None, opts(), 1.)
        .unwrap();
    doc.delete(&[component.clone()], opts(), 2.).unwrap();
    let model = doc.model().unwrap();
    assert!(find(&model, &component).is_none());
    assert_eq!(
        find(&model, &instance).unwrap().attrs["componentId"],
        component.as_str()
    );
    assert_eq!(
        find(&model, &override_id).unwrap().attrs["targetId"],
        rectangle.as_str()
    );
    assert_eq!(
        find(&model, &source).unwrap().attrs["targetId"],
        "999@absent"
    );
    doc.undo().unwrap();
    assert!(find(&doc.model().unwrap(), &component).is_some());
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    let checkpoint = GraphicCheckpoint::from_json(&before).unwrap();
    let mut restored = GraphicDocument::restore(&checkpoint).unwrap();
    let pending = restored.pending_changes().to_vec();
    for _ in 0..2 {
        for c in &pending {
            restored.apply_remote(&c.ops).unwrap();
        }
    }
    assert_eq!(restored.checkpoint().unwrap().to_json().unwrap(), before);
    restored.redo().unwrap();
    assert!(find(&restored.model().unwrap(), &component).is_none());
    let mut classic = GraphicDocument::new("A").unwrap();
    assert!(classic.restore_checkpoint(&checkpoint).is_err());
}
#[test]
fn invalid_fields_refs_manifest_actor_and_batch_are_atomic() {
    let mut doc = new("A");
    let path = insert(&mut doc, K::Path, None, json!({}));
    let vertex = insert(&mut doc, K::Vertex, Some(&path), json!({}));
    let paint = insert(&mut doc, K::Paint, Some(&path), json!({}));
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    for (target, key, value) in [
        (&vertex, "unknown", json!(0)),
        (&vertex, "x", json!(1000001)),
        (&vertex, "handleIn", json!({"x":4})),
        (&paint, "color", json!("#12345")),
        (&paint, "kind", json!("invalid")),
        (&paint, "imageRef", json!("bad\nref")),
        (&path, "fillRule", json!("winding")),
    ] {
        assert!(doc.set_attribute(target, key, value, opts(), 0.).is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    }
    for reference in ["0@peer", "1@bad\npeer", "12345678901234567@peer"] {
        assert!(doc
            .insert(
                K::Segment,
                Some(&path),
                None,
                attrs(json!({"from":reference})),
                opts(),
                0.
            )
            .is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    }
    let mut checkpoint: Value = serde_json::from_str(&before).unwrap();
    checkpoint["native"]["document"]["manifest"]["nodes"]["vertex"]["attrs"]["z"] =
        json!({"default":0});
    assert!(GraphicCheckpoint::from_json(&checkpoint.to_string()).is_err());
    let mut checkpoint: Value = serde_json::from_str(&before).unwrap();
    checkpoint["preset"] = json!("Canvas");
    assert!(GraphicCheckpoint::from_json(&checkpoint.to_string()).is_err());
    let at = doc.next_ticket().unwrap();
    let good = Op::Set {
        at: at.clone(),
        ids: vec![vertex.ticket().unwrap()],
        key: "x".into(),
        value: json!(5),
    };
    let bad = Op::Set {
        at: Ticket {
            lamport: at.lamport + 1,
            actor: "peer/invalid".into(),
        },
        ids: vec![vertex.ticket().unwrap()],
        key: "y".into(),
        value: json!(6),
    };
    assert!(doc.apply_remote(&[good, bad]).is_err());
    assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    let mut classic = GraphicDocument::new("C").unwrap();
    assert!(classic
        .insert(K::Path, None, None, Attributes::new(), opts(), 0.)
        .is_err());
}
#[test]
fn classic_legacy_checkpoint_and_utf16_mark_history_stay_supported() {
    let mut classic = GraphicDocument::new("C").unwrap();
    let _ = insert(&mut classic, K::Frame, None, json!({}));
    let mut legacy: Value =
        serde_json::from_str(&classic.checkpoint().unwrap().to_json().unwrap()).unwrap();
    legacy.as_object_mut().unwrap().remove("preset");
    assert!(GraphicCheckpoint::from_json(&legacy.to_string()).is_ok());
    let mut a = new("A");
    let label = insert(&mut a, K::Label, None, json!({}));
    let mut marks = Attributes::new();
    marks.insert("italic".into(), json!(true));
    a.insert_label_text_with_marks(
        &label,
        None,
        Utf16Text(vec![0xD800, 0x61, 0xDC00]),
        marks,
        opts(),
        0.,
    )
    .unwrap();
    let ids = a.label_text_ids(&label).unwrap();
    a.set_attribute(&ids[1], "bold", json!(true), opts(), 1.)
        .unwrap();
    assert_eq!(find(&a.model().unwrap(), &label).unwrap().runs.len(), 3);
    a.undo().unwrap();
    let mut restored = GraphicDocument::restore(&a.checkpoint().unwrap()).unwrap();
    let model = restored.model().unwrap();
    assert_eq!(
        find(&model, &label).unwrap().runs[0].units.0,
        vec![0xD800, 0x61, 0xDC00]
    );
    assert_eq!(find(&model, &label).unwrap().runs[0].marks["italic"], true);
    restored.redo().unwrap();
    assert_eq!(
        find(&restored.model().unwrap(), &label).unwrap().runs.len(),
        3
    );
}

#[test]
fn inbound_actor_profile_rejects_node_text_move_and_allows_exact_retry() {
    for preset in [GraphicPreset::Canvas, GraphicPreset::Builtins] {
        let mut doc = GraphicDocument::with_preset("A", preset).unwrap();
        let label = insert(&mut doc, K::Label, None, json!({}));
        let before = doc.checkpoint().unwrap().to_json().unwrap();
        let actor = |clock| Ticket {
            lamport: clock,
            actor: "peer/invalid".into(),
        };
        let root = Key::root().ticket().unwrap();
        let attacks = vec![
            Op::Node {
                id: actor(100),
                origin: root.clone(),
                node_type: "rectangle".into(),
                boundary: String::new(),
                attrs: None,
            },
            Op::Text {
                id: actor(101),
                origin: Key::parse(format!("0@{}/text", label.as_str()))
                    .unwrap()
                    .ticket()
                    .unwrap(),
                units: Utf16Text::from("x"),
                marks: Attributes::new(),
            },
            Op::Move {
                at: actor(102),
                target: label.ticket().unwrap(),
                parent: root,
                after: None,
            },
        ];
        for attack in attacks {
            assert!(doc.apply_remote(&[attack]).is_err());
            assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
        }
    }
}
#[test]
fn override_assignment_is_one_typed_atomic_register_under_concurrency() {
    let mut a = new("A");
    let instance = insert(
        &mut a,
        K::Instance,
        None,
        json!({"componentId":"999@dangling"}),
    );
    let id = insert(&mut a, K::InstanceOverride, Some(&instance), json!({}));
    let mut b = new("B");
    deliver(&a, &mut b);
    let one = a
        .set_attribute(
            &id,
            "assignment",
            json!({"property":"transform.e","value":500}),
            opts(),
            1.,
        )
        .unwrap();
    let two = b
        .set_attribute(
            &id,
            "assignment",
            json!({"property":"opacity","value":0.5}),
            opts(),
            1.,
        )
        .unwrap();
    a.apply_remote(&two.ops).unwrap();
    b.apply_remote(&one.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(
        find(&a.model().unwrap(), &id).unwrap().attrs["assignment"],
        json!({"property":"opacity","value":0.5})
    );
    let before = a.checkpoint().unwrap().to_json().unwrap();
    for value in [
        json!({"property":"opacity","value":500}),
        json!({"property":"visible","value":1}),
        json!({"property":"name","value":"bad\nname"}),
        json!({"property":"transform.a","value":null}),
        json!({"property":"name","value":"ok","extra":true}),
    ] {
        assert!(a
            .set_attribute(&id, "assignment", value, opts(), 2.)
            .is_err());
        assert_eq!(a.checkpoint().unwrap().to_json().unwrap(), before);
    }
    a.set_attribute(&id, "assignment", Value::Null, opts(), 3.)
        .unwrap();
    assert_eq!(
        find(&a.model().unwrap(), &id).unwrap().attrs["assignment"],
        json!({"property":"name","value":""})
    );
    a.undo().unwrap();
    assert_eq!(
        find(&a.model().unwrap(), &id).unwrap().attrs["assignment"],
        json!({"property":"opacity","value":0.5})
    );
}
