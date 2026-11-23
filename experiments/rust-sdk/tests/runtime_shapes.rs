use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"book","marks":["bold"],"markValues":{"url":{"default":"","inherit":false}},"nodes":{
        "book":{"shape":"flow","children":["line","list","box","grid"],"default":"line"},
        "box":{"shape":"flow","children":["line","list","box","grid"],"default":"line"},
        "line":{"shape":"text","children":["badge","link"]},
        "list":{"shape":"group","children":["entry"],"by":["depth"]},
        "entry":{"shape":"text","children":["badge","link"],"attrs":{"depth":{"default":0}}},
        "badge":{"shape":"inline","attrs":{"label":{"default":""}}},
        "link":{"shape":"span","mark":"url","attr":"href"},
        "grid":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["line","list"],"default":"line"}
    }})).unwrap()
}
#[test]
fn compiles_group_inline_span() {
    let mut manifest = schema().manifest().clone();
    manifest["nodes"]["entry"]["attrs"]["optional"] = json!({"default":null});
    let mut d = RuntimeDocument::new("A", RuntimeSchema::compile(manifest).unwrap()).unwrap();
    let attrs: Attributes = serde_json::from_value(json!({"depth":0.0,"optional":null})).unwrap();
    let (entry, change) = d
        .insert_group_member_at(&Key::root(), "list", "entry", None, None, attrs, opts(), 1.)
        .unwrap();
    let Op::Node {
        attrs: Some(attrs), ..
    } = &change.ops[0]
    else {
        panic!("node expected")
    };
    assert!(
        attrs.is_empty(),
        "default birth attributes must not create registers: {attrs:?}"
    );
    let attrs: Attributes = serde_json::from_value(json!({"label":""})).unwrap();
    let (_, change) = d
        .insert_inline_at(&Key::root(), "badge", Some(&entry), attrs, opts(), 2.)
        .unwrap();
    let Op::Node {
        attrs: Some(attrs), ..
    } = &change.ops[0]
    else {
        panic!("node expected")
    };
    assert!(attrs.is_empty());
    let attrs: Attributes =
        serde_json::from_value(json!({"depth":2,"optional":"explicit"})).unwrap();
    let (_, change) = d
        .insert_group_member_at(
            &Key::root(),
            "list",
            "entry",
            Some(&entry),
            None,
            attrs.clone(),
            opts(),
            3.,
        )
        .unwrap();
    let Op::Node {
        attrs: Some(stored),
        ..
    } = &change.ops[0]
    else {
        panic!("node expected")
    };
    assert_eq!(*stored, attrs);
}
fn opts() -> EditOptions {
    EditOptions::default()
}
fn nodes<'a>(v: &'a Value, kind: &str, out: &mut Vec<&'a Value>) {
    if v["type"] == kind {
        out.push(v);
    }
    if let Some(children) = v["runs"].as_array() {
        for c in children {
            nodes(c, kind, out);
        }
    }
    if let Some(children) = v["children"].as_array() {
        for c in children {
            nodes(c, kind, out);
        }
    }
}
fn find(v: &Value, kind: &str) -> Vec<Value> {
    let mut out = vec![];
    nodes(v, kind, &mut out);
    out.into_iter().cloned().collect()
}
fn cp(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
#[test]
fn group_members_attributes_split_and_selective_history() {
    let mut a = RuntimeDocument::new("A", schema()).unwrap();
    let mut b = RuntimeDocument::new("B", schema()).unwrap();
    let head = Key::root();
    let (one, _) = a
        .insert_group_member_at(
            &head,
            "list",
            "entry",
            None,
            None,
            Attributes::new(),
            opts(),
            1.,
        )
        .unwrap();
    a.insert_text_at(&head, Some(&one), "first", Attributes::new(), opts(), 2.)
        .unwrap();
    let last = a.line_token_ids(&head).unwrap().last().unwrap().clone();
    let (two, _) = a
        .insert_group_member_at(
            &head,
            "list",
            "entry",
            Some(&last),
            None,
            Attributes::new(),
            opts(),
            3.,
        )
        .unwrap();
    a.insert_text_at(&head, Some(&two), "second", Attributes::new(), opts(), 4.)
        .unwrap();
    assert_eq!(find(&a.model().unwrap(), "list").len(), 1);
    for c in a.pending_changes().to_vec() {
        b.apply_remote(&c.ops).unwrap();
    }
    a.set_group_attribute(
        &[one.clone(), two.clone()],
        "list",
        "depth",
        json!(1),
        opts(),
        5.,
    )
    .unwrap();
    let foreign = b
        .set_attribute(&two, "depth", json!(2), opts(), 6.)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    a.undo().unwrap();
    let model = a.model().unwrap();

    assert_eq!(find(&model, "list")[0]["attrs"]["depth"], 0);
    assert_eq!(find(&model, "list")[1]["attrs"]["depth"], 2);
    assert_eq!(find(&model, "list").len(), 2);
    a.redo().unwrap();
    assert_eq!(find(&a.model().unwrap(), "list")[0]["attrs"]["depth"], 1);
    let saved = cp(&mut a);
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    assert_eq!(cp(&mut restored), saved);
    let mut manifest = schema().manifest().clone();
    manifest["nodes"]["book"]["children"]
        .as_array_mut()
        .unwrap()
        .push(json!("queue"));
    manifest["nodes"]["queue"] = json!({"shape":"group","children":["task"],"by":["depth"]});
    manifest["nodes"]["task"] = json!({"shape":"text","attrs":{"depth":{"default":0}}});
    let schema = RuntimeSchema::compile(manifest).unwrap();
    let mut a = RuntimeDocument::new("C", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("D", schema).unwrap();
    let (item, _) = a
        .insert_group_member_at(
            &Key::root(),
            "list",
            "entry",
            None,
            None,
            Attributes::new(),
            opts(),
            1.,
        )
        .unwrap();
    a.set_attribute(&item, "$type", json!("task"), opts(), 2.)
        .unwrap();
    for change in a.pending_changes().to_vec() {
        b.apply_remote(&change.ops).unwrap();
    }
    a.set_group_attribute(&[item.clone()], "queue", "depth", json!(2), opts(), 3.)
        .unwrap();
    let foreign = b
        .set_group_attribute(&[item.clone()], "queue", "depth", json!(2), opts(), 3.)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    a.undo().unwrap();
    a.redo().unwrap();
    assert_eq!(find(&a.model().unwrap(), "queue")[0]["attrs"]["depth"], 2);
    let saved = cp(&mut a);
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    for change in a.pending_changes().to_vec() {
        restored.apply_remote(&change.ops).unwrap();
    }
    assert_eq!(cp(&mut restored), saved);
    let before = cp(&mut a);
    assert!(a
        .set_attribute(&item, "$type", json!("invalid"), opts(), 4.)
        .is_err());
    assert!(a
        .set_group_attribute(&[item.clone()], "list", "depth", json!(1), opts(), 4.)
        .is_err());
    assert!(a
        .set_group_attribute(&[Key::root()], "queue", "depth", json!(1), opts(), 4.)
        .is_err());
    assert_eq!(cp(&mut a), before);
    a.set_attribute(&item, "$type", Value::Null, opts(), 5.)
        .unwrap();
    a.set_group_attribute(&[item], "list", "depth", json!(3), opts(), 6.)
        .unwrap();
    assert_eq!(find(&a.model().unwrap(), "list")[0]["attrs"]["depth"], 3);
}
#[test]
fn inline_tokens_scalar_spans_delete_and_restore() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let head = Key::root();
    d.insert_text_at(&head, None, "a😀", Attributes::new(), opts(), 1.)
        .unwrap();
    let chars = d.line_token_ids(&head).unwrap();
    assert_eq!(chars.len(), 3);
    let (badge, _) = d
        .insert_inline_at(
            &head,
            "badge",
            Some(&chars[2]),
            Attributes::new(),
            opts(),
            2.,
        )
        .unwrap();
    assert!(d.line_token_ids(&head).unwrap().contains(&badge));
    d.set_attribute(&badge, "label", json!("ok"), opts(), 3.)
        .unwrap();
    d.format_span(&chars, "link", json!("https://a"), opts(), 4.)
        .unwrap();
    let model = d.model().unwrap();
    assert_eq!(find(&model, "link")[0]["attrs"]["href"], "https://a");
    assert_eq!(find(&model, "badge")[0]["attrs"]["label"], "ok");
    d.format_tokens(&[chars[0].clone()], "url", Value::Null, opts(), 5.)
        .unwrap();
    d.undo().unwrap();
    assert_eq!(
        find(&d.model().unwrap(), "link")[0]["attrs"]["href"],
        "https://a"
    );
    d.delete(&[badge.clone()], opts(), 6.).unwrap();
    assert!(!d.line_token_ids(&head).unwrap().contains(&badge));
    d.undo().unwrap();
    assert!(d.line_token_ids(&head).unwrap().contains(&badge));
    d.redo().unwrap();
    assert!(!d.line_token_ids(&head).unwrap().contains(&badge));
}
#[test]
fn invalid_shapes_are_atomic_and_keep_pending() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let head = Key::root();
    d.insert_text_at(&head, None, "x", Attributes::new(), opts(), 1.)
        .unwrap();
    let ids = d.line_token_ids(&head).unwrap();
    let before = cp(&mut d);
    assert!(d
        .insert_inline_at(&head, "line", None, Attributes::new(), opts(), 2.)
        .is_err());
    assert!(d
        .insert_group_member_at(
            &head,
            "list",
            "line",
            None,
            None,
            Attributes::new(),
            opts(),
            2.
        )
        .is_err());
    assert!(d
        .format_span(&ids, "badge", json!("x"), opts(), 2.)
        .is_err());
    assert!(d
        .format_tokens(&ids, "url", json!({"bad":true}), opts(), 2.)
        .is_err());
    assert!(d
        .format_tokens(&ids, "bold", json!("bad"), opts(), 2.)
        .is_err());
    assert!(d
        .set_group_attribute(&ids, "list", "depth", json!(2), opts(), 2.)
        .is_err());
    assert!(d
        .insert_text_at(&head, None, "bad", Attributes::new(), opts(), f64::NAN)
        .is_err());
    for attrs in [json!({"unknown":null}), json!({"depth":"bad"})] {
        assert!(d
            .insert_group_member_at(
                &head,
                "list",
                "entry",
                None,
                None,
                serde_json::from_value(attrs).unwrap(),
                opts(),
                2.
            )
            .is_err());
    }
    for attrs in [json!({"unknown":null}), json!({"label":false})] {
        assert!(d
            .insert_inline_at(
                &head,
                "badge",
                None,
                serde_json::from_value(attrs).unwrap(),
                opts(),
                2.
            )
            .is_err());
    }
    assert_eq!(cp(&mut d), before);
}
#[test]
fn nested_and_cell_source_paths_keep_selection() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (box_, _) = d
        .insert_block("box", None, None, Attributes::new(), opts(), 1.)
        .unwrap();
    let head = RuntimeDocument::flow_head(Some(&box_)).unwrap();
    let (member, _) = d
        .insert_group_member_at(
            &head,
            "list",
            "entry",
            None,
            None,
            Attributes::new(),
            opts(),
            2.,
        )
        .unwrap();
    d.insert_text_at(&head, Some(&member), "xy", Attributes::new(), opts(), 3.)
        .unwrap();

    let range = Some(Selection {
        anchor: Position(vec![1, 1, 0, 1]),
        focus: Position(vec![1, 1, 0, 2]),
    });
    let stable = d.capture_selection(range.clone()).unwrap();
    assert_eq!(d.resolve_selection(stable.clone()).unwrap(), range);
    let (grid, rows, cols, _) = d
        .insert_grid_at(
            &Key::root(),
            "grid",
            Some(&box_),
            1,
            1,
            Attributes::new(),
            opts(),
            4.,
        )
        .unwrap();
    let cell = RuntimeDocument::cell_head(&grid, &rows[0], &cols[0]).unwrap();
    let (entry, _) = d
        .insert_group_member_at(
            &cell,
            "list",
            "entry",
            None,
            None,
            Attributes::new(),
            opts(),
            5.,
        )
        .unwrap();
    d.insert_text_at(&cell, Some(&entry), "cell", Attributes::new(), opts(), 6.)
        .unwrap();
    let ids = d.line_token_ids(&cell).unwrap();
    d.format_span(&ids, "link", json!("ref"), opts(), 7.)
        .unwrap();
    let (inline, _) = d
        .insert_inline_at(&cell, "badge", ids.last(), Attributes::new(), opts(), 8.)
        .unwrap();
    assert!(d.line_token_ids(&cell).unwrap().contains(&inline));
    assert_eq!(d.resolve_selection(stable).unwrap(), range);
    assert_eq!(
        find(&d.model().unwrap(), "link").last().unwrap()["attrs"]["href"],
        "ref"
    );
}
#[test]
fn plain_text_inherits_only_declared_marks_and_keeps_defaults_sparse() {
    let mut manifest = schema().manifest().clone();
    manifest["markValues"]["color"] = json!({"default":0,"inherit":true});
    let mut d = RuntimeDocument::new("A", RuntimeSchema::compile(manifest).unwrap()).unwrap();
    let head = Key::root();
    d.insert_text_at(
        &head,
        None,
        "a",
        serde_json::from_value(json!({"bold":true,"url":"ref","color":7})).unwrap(),
        opts(),
        1.,
    )
    .unwrap();
    let first = d.line_token_ids(&head).unwrap()[0].clone();
    let change = d
        .insert_inherited_text_at(&head, Some(&first), "b", opts(), 2.)
        .unwrap();
    let Op::Text { marks, .. } = &change.ops[0] else {
        panic!("text operation expected")
    };
    assert_eq!(marks.get("bold"), Some(&json!(true)));
    assert_eq!(marks.get("color"), Some(&json!(7)));
    assert!(!marks.contains_key("url"));
    let last = d.line_token_ids(&head).unwrap().last().unwrap().clone();
    let (inline, _) = d
        .insert_inline_at(&head, "badge", Some(&last), Attributes::new(), opts(), 3.)
        .unwrap();
    let change = d
        .insert_inherited_text_at(&head, Some(&inline), "c", opts(), 4.)
        .unwrap();
    let Op::Text { marks, .. } = &change.ops[0] else {
        panic!("text operation expected")
    };
    assert!(marks.is_empty());
}
#[test]
fn scalar_value_marks_accept_false_zero_empty_and_clear_to_default() {
    let mut manifest = schema().manifest().clone();
    manifest["markValues"]["url"]["default"] = Value::Null;
    let mut d = RuntimeDocument::new("A", RuntimeSchema::compile(manifest).unwrap()).unwrap();
    let head = Key::root();
    d.insert_text_at(&head, None, "x", Attributes::new(), opts(), 1.)
        .unwrap();
    let ids = d.line_token_ids(&head).unwrap();
    for (i, value) in [
        json!(false),
        json!(0),
        json!(""),
        Value::Null,
        json!("again"),
    ]
    .into_iter()
    .enumerate()
    {
        d.format_span(&ids, "link", value.clone(), opts(), (i + 2) as f64)
            .unwrap();
        let spans = find(&d.model().unwrap(), "link");
        if value.is_null() {
            assert!(spans.is_empty());
        } else {
            assert_eq!(spans[0]["attrs"]["href"], value);
        }
    }
    d.undo().unwrap();
    assert!(find(&d.model().unwrap(), "link").is_empty());
    d.redo().unwrap();
    assert_eq!(
        find(&d.model().unwrap(), "link")[0]["attrs"]["href"],
        "again"
    );
    let mut peer = RuntimeDocument::new("B", d.schema().clone()).unwrap();
    for change in d.pending_changes().to_vec() {
        peer.apply_remote(&change.ops).unwrap();
    }
    let foreign = peer
        .format_span(&ids, "link", json!("foreign"), opts(), 20.)
        .unwrap();
    d.apply_remote(&foreign.ops).unwrap();
    d.undo().unwrap();
    assert_eq!(
        find(&d.model().unwrap(), "link")[0]["attrs"]["href"],
        "foreign"
    );
    let own = d
        .format_span(&ids, "link", json!("same"), opts(), 21.)
        .unwrap();
    peer.apply_remote(&own.ops).unwrap();
    let same_value = peer
        .format_span(&ids, "link", json!("same"), opts(), 22.)
        .unwrap();
    assert!(!same_value.ops.is_empty());
    d.apply_remote(&same_value.ops).unwrap();
    d.undo().unwrap();
    assert_eq!(
        find(&d.model().unwrap(), "link")[0]["attrs"]["href"],
        "same"
    );
}
