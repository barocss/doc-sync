use doc_sync_native_sdk::{
    Attributes, EditOptions, GraphicCheckpoint, GraphicDocument, GraphicKind, GraphicNode, Key, Op,
    Utf16Text,
};
use serde_json::json;
fn options() -> EditOptions {
    EditOptions::default()
}
fn insert(doc: &mut GraphicDocument, kind: GraphicKind, parent: Option<&Key>, now: f64) -> Key {
    doc.insert(kind, parent, None, Attributes::new(), options(), now)
        .unwrap()
        .0
}
fn deliver(from: &GraphicDocument, to: &mut GraphicDocument) {
    for change in from.pending_changes() {
        to.apply_remote(&change.ops).unwrap();
    }
}
fn find<'a>(node: &'a GraphicNode, id: &Key) -> &'a GraphicNode {
    if &node.id == id {
        return node;
    }
    node.children.iter().find_map(|n| find_opt(n, id)).unwrap()
}
fn find_opt<'a>(node: &'a GraphicNode, id: &Key) -> Option<&'a GraphicNode> {
    if &node.id == id {
        Some(node)
    } else {
        node.children.iter().find_map(|n| find_opt(n, id))
    }
}
#[test]
fn real_empty_containers_stable_ids_and_labels() {
    let mut doc = GraphicDocument::new("A").unwrap();
    let root = doc.model().unwrap();
    assert_eq!(root.node_type, "canvas");
    assert!(root.children.is_empty());
    let frame = insert(&mut doc, GraphicKind::Frame, None, 0.);
    let group = insert(&mut doc, GraphicKind::Group, Some(&frame), 1.);
    let model = doc.model().unwrap();
    assert_eq!(find(&model, &group).node_type, "object-group");
    assert!(find(&model, &group).children.is_empty());
    let label = insert(&mut doc, GraphicKind::Label, Some(&group), 2.);
    doc.insert_label_text(&label, None, Utf16Text(vec![0xD800, 65]), options(), 3.)
        .unwrap();
    let keys = doc.label_text_ids(&label).unwrap();
    assert_eq!(keys.len(), 2);
    doc.delete(&keys[..1], options(), 4.).unwrap();
    assert_eq!(
        find(&doc.model().unwrap(), &label).runs[0].units.0,
        vec![65]
    );
    doc.undo().unwrap();
    assert_eq!(
        find(&doc.model().unwrap(), &label).runs[0].units.0,
        vec![0xD800, 65]
    );
    doc.reparent(&group, None, Some(&frame), options(), 5.)
        .unwrap();
    let model = doc.model().unwrap();
    assert_eq!(model.children[1].id, group);
    assert_eq!(model.children[1].children[0].id, label);
    assert!(model.children[0].children.is_empty());
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap().children.len(), 1);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap().children.len(), 2);
}
#[test]
fn concurrent_fields_selective_undo_and_exact_retry() {
    let mut a = GraphicDocument::new("A").unwrap();
    let object = insert(&mut a, GraphicKind::Rectangle, None, 0.);
    let mut b = GraphicDocument::new("B").unwrap();
    deliver(&a, &mut b);
    a.acknowledge(&a.pending_changes().to_vec()).unwrap();
    let x = a
        .set_field(&object, "transform", "x", json!(42), options(), 1.)
        .unwrap();
    let y = b
        .set_field(&object, "transform", "y", json!(73), options(), 1.)
        .unwrap();
    a.apply_remote(&y.ops).unwrap();
    b.apply_remote(&x.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    a.undo().unwrap();
    assert_eq!(
        find(&a.model().unwrap(), &object).attrs["transform"],
        json!({"x":0,"y":73,"rotation":0,"scale":1})
    );
    let remote = b
        .set_field(&object, "transform", "x", json!(88), options(), 2.)
        .unwrap();
    a.apply_remote(&remote.ops).unwrap();
    let change = a.redo().unwrap();
    assert!(change.ops.is_empty());
    assert_eq!(
        find(&a.model().unwrap(), &object).attrs["transform"]["x"],
        88
    );
    let saved = a.checkpoint().unwrap().to_json().unwrap();
    let checkpoint = GraphicCheckpoint::from_json(&saved).unwrap();
    let mut restored = GraphicDocument::restore(&checkpoint).unwrap();
    let pending = restored.pending_changes().to_vec();
    for c in &pending {
        restored.apply_remote(&c.ops).unwrap();
    }
    assert_eq!(restored.checkpoint().unwrap().to_json().unwrap(), saved);
    assert!(restored.acknowledge(&[remote]).is_err());
    restored.acknowledge(&pending).unwrap();
    assert!(restored.pending_changes().is_empty());
}
#[test]
fn delete_parent_hides_descendants_and_remote_delete_survives_undo() {
    let mut a = GraphicDocument::new("A").unwrap();
    let frame = insert(&mut a, GraphicKind::Frame, None, 0.);
    let child = insert(&mut a, GraphicKind::Ellipse, Some(&frame), 1.);
    let mut b = GraphicDocument::new("B").unwrap();
    deliver(&a, &mut b);
    let local = a.delete(&[frame.clone()], options(), 2.).unwrap();
    let remote = b.delete(&[frame.clone()], options(), 2.).unwrap();
    a.apply_remote(&remote.ops).unwrap();
    a.undo().unwrap();
    assert!(a.model().unwrap().children.is_empty());
    b.apply_remote(&local.ops).unwrap();
    b.apply_remote(&a.pending_changes().last().unwrap().ops)
        .unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    // Hidden descendant remains a stable stored object and can be moved out.
    a.reparent(&child, None, None, options(), 3.).unwrap();
    assert_eq!(a.model().unwrap().children[0].id, child);
}
#[test]
fn concurrent_reparent_cycle_converges_with_shared_placement_rules() {
    let mut a = GraphicDocument::new("A").unwrap();
    let one = insert(&mut a, GraphicKind::Group, None, 0.);
    let two = insert(&mut a, GraphicKind::Group, None, 1.);
    let mut b = GraphicDocument::new("B").unwrap();
    deliver(&a, &mut b);
    let x = a.reparent(&one, Some(&two), None, options(), 2.).unwrap();
    let y = b.reparent(&two, Some(&one), None, options(), 2.).unwrap();
    a.apply_remote(&y.ops).unwrap();
    b.apply_remote(&x.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(a.model().unwrap().children.len(), 1);
}
#[test]
fn schema_bounds_atomic_failure_and_checkpoint_tamper() {
    let mut doc = GraphicDocument::new("A").unwrap();
    let rectangle = insert(&mut doc, GraphicKind::Rectangle, None, 0.);
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    for (key, value) in [
        ("fill", json!("red")),
        ("name", json!("bad\nname")),
        ("opacity", json!(2)),
        ("transform", json!({"x":1})),
        ("$field:[\"transform\",\"scale\"]", json!(0)),
        ("$field:[\"transform\",\"a\"]", json!(1)),
    ] {
        assert!(doc
            .set_attribute(&rectangle, key, value, options(), 1.)
            .is_err());
        assert_eq!(before, doc.checkpoint().unwrap().to_json().unwrap());
    }
    let at = doc.next_ticket().unwrap();
    let bad = Op::Node {
        id: at,
        origin: Key::root().ticket().unwrap(),
        node_type: "path".into(),
        boundary: String::new(),
        attrs: None,
    };
    assert!(doc.record(vec![bad], options(), 1.).is_err());
    assert_eq!(before, doc.checkpoint().unwrap().to_json().unwrap());
    let mut v: serde_json::Value = serde_json::from_str(&before).unwrap();
    v["native"]["document"]["manifest"]["nodes"]["path"] = json!({"shape":"container"});
    assert!(GraphicCheckpoint::from_json(&v.to_string()).is_err());
    let mut v: serde_json::Value = serde_json::from_str(&before).unwrap();
    v["pending"][0]["ops"][0]["attrs"] = json!({"fill":"#000000"});
    assert!(GraphicCheckpoint::from_json(&v.to_string()).is_err());
    let mut v: serde_json::Value = serde_json::from_str(&before).unwrap();
    v["native"]["document"]["clock"] = json!(99);
    assert!(GraphicCheckpoint::from_json(&v.to_string()).is_err());
    let mut attrs = Attributes::new();
    attrs.insert("transform".into(), json!({"x":3,"y":4}));
    let (_, change) = doc
        .insert(GraphicKind::Ellipse, None, None, attrs, options(), 2.)
        .unwrap();
    assert_eq!(change.ops.len(), 3);
}
#[test]
fn same_field_remote_owner_blocks_undo_and_snapshot_keeps_history() {
    let mut a = GraphicDocument::new("A").unwrap();
    let id = insert(&mut a, GraphicKind::Rectangle, None, 0.);
    let mut b = GraphicDocument::new("B").unwrap();
    deliver(&a, &mut b);
    let own = a
        .set_attribute(&id, "fill", json!("#111111"), options(), 1.)
        .unwrap();
    b.apply_remote(&own.ops).unwrap();
    let remote = b
        .set_attribute(&id, "fill", json!("#222222"), options(), 2.)
        .unwrap();
    a.apply_remote(&remote.ops).unwrap();
    let mut restored = GraphicDocument::restore(&a.checkpoint().unwrap()).unwrap();
    assert!(restored.undo().unwrap().ops.is_empty());
    assert_eq!(
        find(&restored.model().unwrap(), &id).attrs["fill"],
        "#222222"
    );
}

#[test]
fn label_anchor_scope_and_unsupported_selection_fail_closed() {
    assert!(GraphicDocument::new("A/B").is_err());
    assert!(GraphicDocument::new("한글").is_err());
    let mut doc = GraphicDocument::new("A").unwrap();
    let one = insert(&mut doc, GraphicKind::Label, None, 0.);
    let two = insert(&mut doc, GraphicKind::Label, None, 1.);
    doc.insert_label_text(&one, None, "x", options(), 2.)
        .unwrap();
    let ids = doc.label_text_ids(&one).unwrap();
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    assert!(doc
        .insert_label_text(&two, Some(&ids[0]), "y", options(), 3.)
        .is_err());
    assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    let mut server = doc_sync_rust_shadow::Server::default();
    let created=server.request(json!({"cmd":"new","replica":"g","actor":"A","schema":doc_sync_rust_shadow::GRAPHIC_SCHEMA,"capabilities":[doc_sync_rust_shadow::GRAPHIC_CAPABILITY]}));
    assert_eq!(created["ok"], true);
    let selection=server.request(json!({"cmd":"selection_capture","replica":"g","schema":doc_sync_rust_shadow::GRAPHIC_SCHEMA,"range":{"anchor":[0,0],"focus":[0,0]}}));
    assert_eq!(selection["ok"], false);
    let bad_manifest=server.request(json!({"cmd":"new","replica":"bad","actor":"B","schema":doc_sync_rust_shadow::GRAPHIC_SCHEMA,"capabilities":[doc_sync_rust_shadow::GRAPHIC_CAPABILITY],"manifest":{"domain":"graphic","root":"canvas","nodes":{"path":{"shape":"container"}}}}));
    assert_eq!(bad_manifest["ok"], false);
}
