use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"book","marks":[],"nodes":{
        "book":{"shape":"flow","children":["line","section"],"default":"line"},
        "line":{"shape":"text","children":["badge"],"attrs":{"meta":fields()}},
        "section":{"shape":"flow","children":["line"],"default":"line","attrs":{"meta":fields()}},
        "badge":{"shape":"inline","attrs":{"meta":fields()}}
    }}))
    .unwrap()
}
fn fields() -> Value {
    json!({"default":{"name":"plain","layout":{"width":0,"mode":"auto"},"data":[]},"fields":{
        "name":{"default":"plain"},"layout":{"default":{"width":0,"mode":"auto"},"fields":{"width":{"default":0,"min":0,"max":100},"mode":{"default":"auto","values":["auto","fixed"]}}},"data":{"default":[]}
    }})
}
fn attrs(v: Value) -> Attributes {
    serde_json::from_value(v).unwrap()
}
fn opt() -> EditOptions {
    EditOptions::default()
}
fn count_kind(v: &Value, kind: &str) -> usize {
    usize::from(v["type"] == kind)
        + ["runs", "children"]
            .iter()
            .map(|key| {
                v[*key].as_array().map_or(0, |items| {
                    items
                        .iter()
                        .map(|item| count_kind(item, kind))
                        .sum::<usize>()
                })
            })
            .sum::<usize>()
}
fn find<'a>(v: &'a Value, kind: &str) -> Option<&'a Value> {
    if v["type"] == kind {
        return Some(v);
    }
    for key in ["runs", "children"] {
        if let Some(items) = v[key].as_array() {
            for item in items {
                if let Some(found) = find(item, kind) {
                    return Some(found);
                }
            }
        }
    }
    None
}
#[test]
fn nested_birth_compiles_independent_leaves_and_materializes_defaults() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (_, change) = d
        .insert_block(
            "section",
            None,
            None,
            attrs(json!({"meta":{"layout":{"width":7},"data":[1,2]}})),
            opt(),
            1.,
        )
        .unwrap();
    assert_eq!(change.ops.len(), 3);
    assert!(matches!(&change.ops[0], Op::Node{attrs:Some(a),..} if a.is_empty()));
    assert!(
        matches!(&change.ops[1], Op::Set{key,..} if key=="$field:[\"meta\",\"layout\",\"width\"]")
    );
    let model = d.model().unwrap();
    assert_eq!(
        find(&model, "section").unwrap()["attrs"]["meta"],
        json!({"name":"plain","layout":{"width":7,"mode":"auto"},"data":[1,2]})
    );
}
#[test]
fn branches_reset_to_leaf_defaults_and_batch_failure_preserves_state() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (id, _) = d
        .insert_block("section", None, None, Attributes::new(), opt(), 1.)
        .unwrap();
    d.set_attributes(
        &id,
        attrs(json!({"meta":{"name":"changed","layout":{"width":9,"mode":"fixed"}}})),
        opt(),
        2.,
    )
    .unwrap();
    let reset = d
        .set_attribute(&id, "meta", json!({"layout":null}), opt(), 3.)
        .unwrap();
    assert_eq!(reset.ops.len(), 2);
    let model = d.model().unwrap();
    assert_eq!(
        find(&model, "section").unwrap()["attrs"]["meta"]["layout"],
        json!({"width":0,"mode":"auto"})
    );
    let before = d.checkpoint().unwrap().to_json().unwrap();
    assert!(d
        .set_attributes(
            &id,
            attrs(json!({"meta":{"name":"valid","layout":{"width":101}}})),
            opt(),
            4.
        )
        .is_err());
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
    assert!(d
        .set_field_path(&id, "meta", &["layout"], json!({"width":2}), opt(), 4.)
        .is_err());
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
}
#[test]
fn independent_peer_leaves_and_same_value_writer_survive_selective_undo() {
    let mut a = RuntimeDocument::new("A", schema()).unwrap();
    let mut b = RuntimeDocument::new("B", schema()).unwrap();
    let (id, birth) = a
        .insert_block("section", None, None, Attributes::new(), opt(), 1.)
        .unwrap();
    b.apply_remote(&birth.ops).unwrap();
    let left = a
        .set_field_path(&id, "meta", &["name"], json!("shared"), opt(), 2.)
        .unwrap();
    let right = b
        .set_field_path(&id, "meta", &["layout", "width"], json!(8), opt(), 2.)
        .unwrap();
    a.apply_remote(&right.ops).unwrap();
    b.apply_remote(&left.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let fence = b
        .set_field_path(&id, "meta", &["name"], json!("shared"), opt(), 3.)
        .unwrap();
    assert_eq!(fence.ops.len(), 1);
    a.apply_remote(&fence.ops).unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    let model = a.model().unwrap();
    let meta = &find(&model, "section").unwrap()["attrs"]["meta"];
    assert_eq!(meta["name"], "shared");
    assert_eq!(meta["layout"]["width"], 8);
    assert_eq!(model, b.model().unwrap());
    let cp = a.checkpoint().unwrap();
    let mut restored = RuntimeDocument::restore(&cp).unwrap();
    assert_eq!(restored.model().unwrap(), model);
    assert_eq!(restored.pending_changes(), a.pending_changes());
}
#[test]
fn semantic_inline_defaults_are_sparse_but_explicit_updates_remain_writers() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (id, birth) = d
        .insert_inline_at(
            &Key::root(),
            "badge",
            None,
            attrs(json!({"meta":{"name":"plain","layout":{"width":0},"data":[]}})),
            opt(),
            1.,
        )
        .unwrap();
    assert_eq!(birth.ops.len(), 1);
    let update = d
        .set_attribute(&id, "meta", json!({"name":"plain"}), opt(), 2.)
        .unwrap();
    assert_eq!(update.ops.len(), 1);
}
#[test]
fn required_keys_match_uri_encoding_and_nested_physical_heads() {
    let head = RuntimeDocument::required_head(&Key::root(), "caption 한", 0).unwrap();
    assert_eq!(head.as_str(), "0@~required:0%40~root:caption%20%ED%95%9C:0");
    let d = RuntimeDocument::new("A", schema()).unwrap();
    assert_eq!(
        d.required_node(&Key::root(), "line", 0).unwrap(),
        RuntimeDocument::required_head(&Key::root(), "line", 0).unwrap()
    );
    let marker = d.required_node(&Key::root(), "section", 0).unwrap();
    assert!(marker.as_str().starts_with("1@~required:"));
    assert!(RuntimeDocument::flow_head(Some(&marker))
        .unwrap()
        .as_str()
        .ends_with("/body"));
}
fn required_schema() -> RuntimeSchema {
    let mut manifest = schema().manifest().clone();
    manifest["nodes"]["book"]["childRules"] =
        json!({"line":{"min":1,"max":1},"section":{"min":1,"max":1}});
    manifest["nodes"]["section"]["childRules"] = json!({"line":{"min":1,"max":1}});
    RuntimeSchema::compile(manifest).unwrap()
}
#[test]
fn required_text_concurrency_selection_and_checkpoint_keep_stable_source_ids() {
    let mut a = RuntimeDocument::new("A", required_schema()).unwrap();
    let mut b = RuntimeDocument::new("B", required_schema()).unwrap();
    let title = RuntimeDocument::required_head(&Key::root(), "line", 0).unwrap();
    let anchors = a
        .capture_selection(Some(Selection {
            anchor: Position(vec![0, 0]),
            focus: Position(vec![0, 0]),
        }))
        .unwrap();
    let left = a
        .insert_text_at(&title, None, "A😀", Attributes::new(), opt(), 1.)
        .unwrap();
    let right = b
        .insert_text_at(&title, None, "B", Attributes::new(), opt(), 1.)
        .unwrap();
    a.apply_remote(&right.ops).unwrap();
    b.apply_remote(&left.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(a.line_token_ids(&title).unwrap().len(), 4);
    assert!(a.resolve_selection(anchors.clone()).unwrap().is_some());
    a.set_attributes(
        &title,
        attrs(json!({"meta":{"layout":{"width":4}}})),
        opt(),
        2.,
    )
    .unwrap();
    let cp = a.checkpoint().unwrap();
    let mut resumed = RuntimeDocument::restore(&cp).unwrap();
    assert_eq!(a.model().unwrap(), resumed.model().unwrap());
    assert_eq!(
        a.resolve_selection(anchors.clone()).unwrap(),
        resumed.resolve_selection(anchors).unwrap()
    );
    let deletion = resumed.delete_block(&title, opt(), 3.).unwrap();
    assert!(
        matches!(&deletion.ops[0],Op::Delete{ids,..} if ids.len()==4 && ids.iter().all(|id| !id.actor.starts_with("~required:")))
    );
    assert!(resumed.line_token_ids(&title).unwrap().is_empty());
    resumed
        .insert_text_at(&title, None, "again", Attributes::new(), opt(), 4.)
        .unwrap();
    assert_eq!(resumed.line_token_ids(&title).unwrap().len(), 5);
}
#[test]
fn required_flow_delete_clears_nested_text_and_keeps_slot_attributes() {
    let mut d = RuntimeDocument::new("A", required_schema()).unwrap();
    let section = d.required_node(&Key::root(), "section", 0).unwrap();
    let body = RuntimeDocument::flow_head(Some(&section)).unwrap();
    let title = RuntimeDocument::required_head(&body, "line", 0).unwrap();
    d.insert_text_at(&title, None, "child", Attributes::new(), opt(), 1.)
        .unwrap();
    d.set_attribute(&section, "meta", json!({"name":"kept"}), opt(), 2.)
        .unwrap();
    let change = d.delete_block(&section, opt(), 3.).unwrap();
    assert!(matches!(&change.ops[0],Op::Delete{ids,..} if ids.len()==5));
    assert!(d.line_token_ids(&title).unwrap().is_empty());
    assert_eq!(
        find(&d.model().unwrap(), "section").unwrap()["attrs"]["meta"]["name"],
        "kept"
    );
    let before = d.observed_clock().unwrap();
    assert!(d.delete_block(&section, opt(), 4.).unwrap().ops.is_empty());
    assert_eq!(d.observed_clock().unwrap(), before);
}
#[test]
fn malformed_nested_wire_batch_and_required_type_change_are_atomic() {
    let mut d = RuntimeDocument::new("A", required_schema()).unwrap();
    let title = RuntimeDocument::required_head(&Key::root(), "line", 0).unwrap();
    let before = d.checkpoint().unwrap().to_json().unwrap();
    let at = d.next_ticket().unwrap();
    let mut second = at.clone();
    second.lamport += 1;
    assert!(d
        .record(
            vec![
                Op::Set {
                    at,
                    ids: vec![title.ticket().unwrap()],
                    key: "$field:[\"meta\",\"name\"]".into(),
                    value: json!("valid")
                },
                Op::Set {
                    at: second,
                    ids: vec![title.ticket().unwrap()],
                    key: "$field:[\"meta\",\"layout\",\"width\"]".into(),
                    value: json!(999)
                }
            ],
            opt(),
            1.
        )
        .is_err());
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
    assert!(d
        .set_attribute(&title, "$type", json!("section"), opt(), 2.)
        .is_err());
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
    let (id, birth) = d
        .insert_block("line", None, Some(&title), Attributes::new(), opt(), 3.)
        .unwrap();
    assert!(
        matches!(&birth.ops[0],Op::Node { boundary,.. } if boundary==&format!("{}|{}|child:{}",Key::root().as_str(),title.as_str(),id.as_str()))
    );
    let before = d.checkpoint().unwrap().to_json().unwrap();
    let at = d.next_ticket().unwrap();
    assert!(d
        .record(
            vec![Op::Node {
                id: at,
                origin: Key::root().ticket().unwrap(),
                node_type: "line".into(),
                boundary: format!(
                    "{}|{}|child:{}",
                    Key::root().as_str(),
                    title.as_str(),
                    id.as_str()
                ),
                attrs: None
            }],
            opt(),
            4.
        )
        .is_err());
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
}
fn mark_schema() -> RuntimeSchema {
    let mut manifest = schema().manifest().clone();
    manifest["markValues"] = json!({"paint":{"default":null,"inherit":true}});
    manifest["nodes"]["line"]["children"] = json!(["badge", "tint"]);
    manifest["nodes"]["tint"] = json!({"shape":"span","mark":"paint","attr":"value"});
    RuntimeSchema::compile(manifest).unwrap()
}
#[test]
fn nullable_atomic_json_marks_keep_writers_and_clear_with_null() {
    let mut a = RuntimeDocument::new("A", mark_schema()).unwrap();
    let mut b = RuntimeDocument::new("B", mark_schema()).unwrap();
    let text = a
        .insert_text(None, "AB", Attributes::new(), opt(), 1.)
        .unwrap();
    b.apply_remote(&text.ops).unwrap();
    let ids = a.line_token_ids(&Key::root()).unwrap();
    let first = a
        .format_span(
            &ids,
            "tint",
            json!({"tone":"warm","levels":[1,2]}),
            opt(),
            2.,
        )
        .unwrap();
    b.apply_remote(&first.ops).unwrap();
    let same = b
        .format_span(
            &ids,
            "tint",
            json!({"tone":"warm","levels":[1,2]}),
            opt(),
            3.,
        )
        .unwrap();
    assert_eq!(same.ops.len(), 1);
    a.apply_remote(&same.ops).unwrap();
    a.undo().unwrap();
    let model = a.model().unwrap();
    assert_eq!(
        count_kind(&model, "tint"),
        2,
        "TS clones composite mark values per UTF-16 token"
    );
    assert_eq!(
        find(&model, "tint").unwrap()["attrs"]["value"],
        json!({"tone":"warm","levels":[1,2]})
    );
    let mut resumed = RuntimeDocument::restore(&a.checkpoint().unwrap()).unwrap();
    assert_eq!(model, resumed.model().unwrap());
    resumed
        .format_span(&ids, "tint", Value::Null, opt(), 4.)
        .unwrap();
    assert!(find(&resumed.model().unwrap(), "tint").is_none());
}
#[test]
fn composite_mark_default_compiles_and_unsafe_json_fails_without_mutation() {
    let mut manifest = mark_schema().manifest().clone();
    manifest["markValues"]["paint"]["default"] = json!({"tone":"plain"});
    assert!(RuntimeSchema::compile(manifest).is_ok());
    let mut d = RuntimeDocument::new("A", mark_schema()).unwrap();
    d.insert_text(None, "x", Attributes::new(), opt(), 1.)
        .unwrap();
    let ids = d.line_token_ids(&Key::root()).unwrap();
    let before = d.checkpoint().unwrap().to_json().unwrap();
    assert!(d
        .format_span(&ids, "tint", json!({"$unsafe":1}), opt(), 2.)
        .is_err());
    assert_eq!(before, d.checkpoint().unwrap().to_json().unwrap());
}

#[test]
fn canonical_nontext_required_right_and_after_anchors_keep_parent_guards() {
    let mut d = RuntimeDocument::new("A", required_schema()).unwrap();
    let section = d.required_node(&Key::root(), "section", 0).unwrap();
    let section_head = RuntimeDocument::required_head(&Key::root(), "section", 0).unwrap();
    let nested_title = RuntimeDocument::required_head(
        &RuntimeDocument::flow_head(Some(&section)).unwrap(),
        "line",
        0,
    )
    .unwrap();
    let before = d.checkpoint().unwrap().to_json().unwrap();
    for right in [
        &section_head,
        &nested_title,
        &RuntimeDocument::required_head(&Key::root(), "line", 1).unwrap(),
    ] {
        assert!(d
            .insert_block("line", None, Some(right), Attributes::new(), opt(), 1.)
            .is_err());
        assert_eq!(before, d.checkpoint().unwrap().to_json().unwrap());
    }
    let (id, birth) = d
        .insert_block("line", None, Some(&section), Attributes::new(), opt(), 2.)
        .unwrap();
    assert!(
        matches!(&birth.ops[0],Op::Node { boundary,.. } if boundary==&format!("{}|{}|child:{}",Key::root().as_str(),section.as_str(),id.as_str()))
    );
    let moved = d
        .reparent_block(&id, None, Some(&section), opt(), 3.)
        .unwrap();
    assert_eq!(moved.ops.len(), 1);
    let mut restored = RuntimeDocument::restore(&d.checkpoint().unwrap()).unwrap();
    assert_eq!(d.model().unwrap(), restored.model().unwrap());
    let before = d.checkpoint().unwrap().to_json().unwrap();
    assert!(d.reparent_block(&section, None, None, opt(), 4.).is_err());
    assert_eq!(before, d.checkpoint().unwrap().to_json().unwrap());
}
