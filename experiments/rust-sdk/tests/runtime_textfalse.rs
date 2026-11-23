use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn schema(mixed: bool) -> RuntimeSchema {
    let mut dto = json!({"root":"book","marks":[],"nodes":{
        "book":{"shape":"flow","children":if mixed {json!(["line","image"])} else {json!(["image"])},"default":if mixed {"line"} else {"image"}},
        "line":{"shape":"text","children":["badge"]},
        "image":{"shape":"text","text":false,"children":["badge"],"attrs":{"src":{"default":""}}},
        "badge":{"shape":"inline","attrs":{"label":{"default":""}}}
    }});
    if !mixed {
        dto["nodes"].as_object_mut().unwrap().remove("line");
    }
    RuntimeSchema::compile(dto).unwrap()
}
fn opt() -> EditOptions {
    EditOptions::default()
}
fn checkpoint(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn has_units(value: &Value, text: &str) -> bool {
    match value {
        Value::Object(fields) => {
            fields.get("units") == Some(&json!(text.encode_utf16().collect::<Vec<_>>()))
                || fields.values().any(|v| has_units(v, text))
        }
        Value::Array(items) => items.iter().any(|v| has_units(v, text)),
        _ => false,
    }
}
fn change_type(d: &mut RuntimeDocument, id: &Key, kind: &str, now: f64) -> Change {
    let at = d.next_ticket().unwrap();
    d.record(
        vec![Op::Set {
            at,
            ids: vec![id.ticket().unwrap()],
            key: "$type".into(),
            value: json!(kind),
        }],
        opt(),
        now,
    )
    .unwrap()
}

#[test]
fn inline_only_flow_has_default_block_and_rejects_plain_text_atomically() {
    let mut d = RuntimeDocument::new("A", schema(false)).unwrap();
    assert_eq!(d.model().unwrap()["children"][0]["type"], "image");
    let (image, _) = d
        .insert_block("image", None, None, Attributes::new(), opt(), 1.)
        .unwrap();
    let (_, badge) = d
        .insert_inline_at(
            &Key::root(),
            "badge",
            Some(&image),
            Attributes::from([("label".into(), json!("photo"))]),
            opt(),
            2.,
        )
        .unwrap();
    assert_eq!(badge.ops.len(), 1);
    let before = checkpoint(&mut d);
    let clock = d.observed_clock().unwrap();
    assert!(d
        .insert_text(Some(&image), "blocked", Attributes::new(), opt(), 3.)
        .is_err());
    let raw = vec![Op::Text {
        id: d.next_ticket().unwrap(),
        origin: image.ticket().unwrap(),
        units: "blocked".into(),
        marks: Attributes::new(),
    }];
    assert!(d.apply_remote(&raw).is_err());
    assert!(d.record(raw, opt(), 3.).is_err());
    let at = d.next_ticket().unwrap();
    let mut text_at = at.clone();
    text_at.lamport += 1;
    let batch = vec![
        Op::Set {
            at,
            ids: vec![image.ticket().unwrap()],
            key: "src".into(),
            value: json!("valid-prefix.png"),
        },
        Op::Text {
            id: text_at,
            origin: image.ticket().unwrap(),
            units: "blocked".into(),
            marks: Attributes::new(),
        },
    ];
    assert!(d.record(batch.clone(), opt(), 4.).is_err());
    assert!(d.apply_remote(&batch).is_err());
    assert_eq!(d.observed_clock().unwrap(), clock);
    assert_eq!(checkpoint(&mut d), before);
}

#[test]
fn mixed_flow_preserves_stored_characters_across_type_changes() {
    let mut d = RuntimeDocument::new("A", schema(true)).unwrap();
    let (image, _) = d
        .insert_block("image", None, None, Attributes::new(), opt(), 1.)
        .unwrap();
    d.insert_text(Some(&image), "kept😀", Attributes::new(), opt(), 2.)
        .unwrap();
    let (_, _) = d
        .insert_inline_at(
            &Key::root(),
            "badge",
            Some(&image),
            Attributes::new(),
            opt(),
            3.,
        )
        .unwrap();
    assert!(has_units(&d.model().unwrap(), "kept😀"));
    assert_eq!(d.flow_text_ids(None).unwrap().len(), 6);
    change_type(&mut d, &image, "line", 4.);
    assert!(has_units(&d.model().unwrap(), "kept😀"));
    change_type(&mut d, &image, "image", 5.);
    assert!(has_units(&d.model().unwrap(), "kept😀"));
    d.undo().unwrap();
    assert!(has_units(&d.model().unwrap(), "kept😀"));
    d.redo().unwrap();
    assert!(has_units(&d.model().unwrap(), "kept😀"));
}

#[test]
fn peers_keep_foreign_inline_writes_carets_and_pending_after_json_restore() {
    let s = schema(true);
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s).unwrap();
    let (image, _) = a
        .insert_block("image", None, None, Attributes::new(), opt(), 1.)
        .unwrap();
    let (badge, _) = a
        .insert_inline_at(
            &Key::root(),
            "badge",
            Some(&image),
            Attributes::new(),
            opt(),
            2.,
        )
        .unwrap();
    for c in a.pending_changes() {
        b.apply_remote(&c.ops).unwrap();
    }
    let own = a
        .set_attribute(
            &image,
            "src",
            json!("own.png"),
            EditOptions {
                caret_before: "before-image".into(),
                caret_after: "after-image".into(),
                typing: false,
            },
            3.,
        )
        .unwrap();
    let foreign = b
        .set_attribute(&badge, "label", json!("peer photo"), opt(), 3.)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    b.apply_remote(&own.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let model = a.model().unwrap();
    let index = model["children"]
        .as_array()
        .unwrap()
        .iter()
        .position(|v| v["type"] == "image")
        .unwrap() as u64;
    let range = Selection {
        anchor: Position(vec![index, 0]),
        focus: Position(vec![index, 1]),
    };
    let anchors = a.capture_selection(Some(range.clone())).unwrap();
    assert_eq!(a.resolve_selection(anchors).unwrap(), Some(range));
    let saved = checkpoint(&mut a);
    let pending = a.pending_changes().to_vec();
    let mut a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    assert_eq!(a.pending_changes(), pending);
    for _ in 0..2 {
        for c in &pending {
            a.apply_remote(&c.ops).unwrap();
            b.apply_remote(&c.ops).unwrap();
        }
    }
    assert_eq!(checkpoint(&mut a), saved);
    let undo = a.undo().unwrap();
    assert_eq!(undo.caret.as_deref(), Some("before-image"));
    b.apply_remote(&undo.ops).unwrap();
    assert!(a.model().unwrap().to_string().contains("peer photo"));
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let redo = a.redo().unwrap();
    assert_eq!(redo.caret.as_deref(), Some("after-image"));
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(a.model().unwrap(), model);
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let pending = a.pending_changes().to_vec();
    a.acknowledge(&pending).unwrap();
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint(&mut a)).unwrap())
            .unwrap();
    assert!(restored.pending_changes().is_empty());
    assert_eq!(restored.model().unwrap(), model);
}
