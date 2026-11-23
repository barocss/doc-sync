use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn product(name: &str) -> RuntimeSchema {
    let products: Value = serde_json::from_str(include_str!(
        "../../runtime-document-unused/product-schemas.json"
    ))
    .unwrap();
    let schema = RuntimeSchema::compile(products[name].clone()).unwrap();
    assert_eq!(schema.manifest(), &products[name]);
    assert_eq!(
        schema.manifest()["nodes"].as_object().unwrap().len(),
        if name == "word" { 23 } else { 27 }
    );
    schema
}
fn cp(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn paragraph(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text,"marks":{"bold":true}}]})
}
fn container(doc: &mut RuntimeDocument, kind: &str) -> Key {
    doc.insert_block(
        kind,
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.,
    )
    .unwrap()
    .0
}

#[test]
fn original_product_schemas_insert_at_start_middle_and_end() {
    for (name, kind, index) in [
        ("word", "section", 0),
        ("word", "section", 1),
        ("word", "section", 3),
        ("presentation", "slide", 0),
        ("presentation", "slide", 1),
        ("presentation", "slide", 2),
    ] {
        let mut doc = RuntimeDocument::new("A", product(name)).unwrap();
        container(&mut doc, kind);
        let before = doc.model().unwrap();
        let input = if index == 0 {
            json!({"type":"paragraph","runs":[]})
        } else {
            json!({"type":"paragraph","attrs":{"style":{"align":"center","spacing":2,"indent":1}},"runs":[{"text":"P😀","marks":{"italic":true}},{"text":"tail","marks":{"bold":true}}]})
        };
        let (key, change) = doc
            .insert_paragraph_at(&[1, index], input, EditOptions::default(), 2.)
            .unwrap();
        let model = doc.model().unwrap();
        assert_eq!(
            model["children"][1]["children"][index]["type"], "paragraph",
            "{name}/{index}"
        );
        assert!(!change.ops.is_empty());
        assert_eq!(doc.pending_changes().last(), Some(&change));
        if index == 0 {
            assert_eq!(
                key,
                RuntimeDocument::flow_head(Some(&Key::parse("1@A").unwrap())).unwrap()
            );
        }
        doc.undo().unwrap();
        assert_eq!(doc.model().unwrap(), before);
        let saved = doc.checkpoint().unwrap();
        doc = RuntimeDocument::restore(&saved).unwrap();
        doc.redo().unwrap();
        assert_eq!(doc.model().unwrap(), model);
    }
}

#[test]
fn paragraph_boundary_stops_before_required_header() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    let parent = container(&mut doc, "section");
    let head = RuntimeDocument::flow_head(Some(&parent)).unwrap();
    let required = doc.required_node(&head, "header", 0).unwrap();
    let (_, change) = doc
        .insert_paragraph_at(
            &[1, 0],
            json!({"type":"paragraph","runs":[]}),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    assert!(change.ops.iter().any(|op|matches!(op,Op::Node{boundary,..} if boundary==&format!("{}|{}",head.as_str(),required.as_str()))));
}

#[test]
fn nested_model_default_retype_and_reset_tickets_are_retained() {
    for (name, kind) in [("word", "section"), ("presentation", "slide")] {
        let mut doc = RuntimeDocument::new("A", product(name)).unwrap();
        let (_, change) = doc
            .insert_model_at(
                &[1],
                json!({"type":kind,"children":[paragraph("nested😀")]}),
                EditOptions::default(),
                1.,
            )
            .unwrap();
        let model = doc.model().unwrap();
        assert_eq!(model["children"][1]["children"][0]["type"], "paragraph");
        let text = change
            .ops
            .iter()
            .find_map(|op| match op {
                Op::Text { id, .. } => Some(id.lamport),
                _ => None,
            })
            .unwrap();
        assert_eq!(text, if name == "word" { 6 } else { 7 });
        assert!(!change
            .ops
            .iter()
            .any(|op| matches!(op,Op::Set{key,..} if key=="style")));
        doc.undo().unwrap();
        doc.redo().unwrap();
        assert_eq!(doc.model().unwrap(), model);
    }
}

#[test]
fn two_actors_nested_fields_text_history_selection_and_checkpoint_retry() {
    let schema = product("word");
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    container(&mut a, "section");
    let (key, _) = a
        .insert_paragraph_at(&[1, 0], paragraph("local😀"), EditOptions::default(), 2.)
        .unwrap();
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let range = Selection {
        anchor: Position(vec![1, 0, 0]),
        focus: Position(vec![1, 0, 7]),
    };
    let anchors = a.capture_selection(Some(range.clone())).unwrap();
    assert_eq!(a.resolve_selection(anchors.clone()).unwrap(), Some(range));
    let own = a
        .set_field_path(
            &key,
            "style",
            &["align"],
            json!("center"),
            EditOptions {
                caret_before: key.as_str().into(),
                caret_after: key.as_str().into(),
                typing: false,
            },
            3.,
        )
        .unwrap();
    b.apply_remote(&own.ops).unwrap();
    let peer = b
        .set_field_path(
            &key,
            "style",
            &["align"],
            json!("right"),
            EditOptions::default(),
            4.,
        )
        .unwrap();
    a.apply_remote(&peer.ops).unwrap();
    let head = RuntimeDocument::flow_head(Some(&Key::parse("1@A").unwrap())).unwrap();
    let text = b
        .insert_text_at(
            &head,
            Some(&key),
            "peer😀",
            Attributes::new(),
            EditOptions::default(),
            5.,
        )
        .unwrap();
    a.apply_remote(&text.ops).unwrap();
    let expected = a.model().unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(a.model().unwrap(), expected);
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(undo.caret, Some(key.as_str().into()));
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&cp(&mut a)).unwrap()).unwrap();
    let before = cp(&mut a);
    for _ in 0..2 {
        for change in a.pending_changes().to_vec() {
            a.apply_remote(&change.ops).unwrap();
            b.apply_remote(&change.ops).unwrap();
        }
    }
    assert_eq!(cp(&mut a), before);
    assert!(a.resolve_selection(anchors).unwrap().is_some());
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(a.model().unwrap(), expected);
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let pending = a.pending_changes().to_vec();
    a.acknowledge(&pending).unwrap();
    assert!(a.pending_changes().is_empty());
}

#[test]
fn inline_span_nullable_marks_and_utf16_runs() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    container(&mut doc, "section");
    let (_,change)=doc.insert_paragraph_at(&[1,1],json!({"type":"paragraph","runs":[{"text":"😀","marks":{"bold":false,"color":null,"fontSize":12}},{"type":"link","attrs":{"url":"https://example.com"},"runs":[{"text":"link"}]},{"type":"mention","attrs":{"id":"user-1"}}]}),EditOptions::default(),2.).unwrap();
    assert!(change
        .ops
        .iter()
        .any(|op| matches!(op,Op::Text{units,marks,..} if units.0.len()==2 && marks.is_empty())));
    assert!(change.ops.iter().any(|op|matches!(op,Op::Text{marks,..} if marks.get("link")==Some(&json!("https://example.com")))));
    assert!(change
        .ops
        .iter()
        .any(|op| matches!(op,Op::Node{node_type,..} if node_type=="mention")));
}

#[test]
fn malformed_unsupported_or_late_invalid_insertions_preserve_exact_checkpoint() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    container(&mut doc, "section");
    let before = cp(&mut doc);
    for node in [
        json!({"runs":[]}),
        json!({"type":"paragraph","runs":"wrong"}),
        json!({"type":"paragraph","attrs":{"style":{"align":"bad"}},"runs":[]}),
        json!({"type":"paragraph","runs":[{"text":"valid"},{"text":"bad","marks":{"link":"invalid"}}]}),
        json!({"type":"table","children":[]}),
        json!({"type":"list","children":[]}),
        json!({"type":"section","children":[paragraph("valid"),{"type":"unknown"}]}),
    ] {
        assert!(
            doc.insert_model_at(&[1, 0], node.clone(), EditOptions::default(), 2.)
                .is_err(),
            "{node}"
        );
        assert_eq!(cp(&mut doc), before);
    }
    assert!(doc
        .insert_paragraph_at(&[1, 99], paragraph("bad"), EditOptions::default(), 2.)
        .is_err());
    assert!(doc
        .insert_paragraph_at(&[1, 0, 0], paragraph("bad"), EditOptions::default(), 2.)
        .is_err());
    assert!(doc
        .insert_paragraph_at(&[1, 0], paragraph("bad"), EditOptions::default(), f64::NAN)
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn moved_documents_use_logical_insertion_and_physical_api_stays_explicit() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    let parent = container(&mut doc, "section");
    let (other, _) = doc
        .insert_block(
            "section",
            Some(&parent),
            None,
            Attributes::new(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    doc.reparent_block(&other, None, Some(&parent), EditOptions::default(), 3.)
        .unwrap();
    let before = cp(&mut doc);
    let (_,change)=doc.insert_paragraph_at(&[1,0],paragraph("moved"),EditOptions::default(),4.).unwrap();
    assert!(change.ops.iter().any(|op|matches!(op,Op::Move{parent:destination,..} if destination==&RuntimeDocument::flow_head(Some(&parent)).unwrap().ticket().unwrap())));
    doc.undo().unwrap();
    let restored=RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&before).unwrap()).unwrap();
    assert_eq!(doc.model().unwrap(), {let mut restored=restored;restored.model().unwrap()});
}

#[test]
fn multiple_structured_branches_and_trailing_reserved_tickets_fail_closed() {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
        "section":{"shape":"flow","children":["paragraph"],"default":"paragraph"},
        "paragraph":{"shape":"text","children":["chip"],"attrs":{
            "first":{"default":{"value":0},"fields":{"value":{"default":0}}},
            "second":{"default":{"value":0},"fields":{"value":{"default":0}}}
        }},
        "chip":{"shape":"inline","attrs":{
            "first":{"default":{"value":0},"fields":{"value":{"default":0}}},
            "second":{"default":{"value":0},"fields":{"value":{"default":0}}}
        }}
    }}))
    .unwrap();
    let mut doc = RuntimeDocument::new("A", schema).unwrap();
    let before = cp(&mut doc);
    assert!(doc.insert_paragraph_at(&[1],json!({"type":"paragraph","attrs":{"second":{"value":2},"first":{"value":1}},"runs":[]}),EditOptions::default(),1.).is_err());
    assert_eq!(cp(&mut doc), before);
    assert!(doc.insert_paragraph_at(&[1],json!({"type":"paragraph","runs":[{"type":"chip","attrs":{"second":{"value":2},"first":{"value":1}}}]}),EditOptions::default(),1.).is_err());
    assert_eq!(cp(&mut doc), before);
    // Empty structured patches reserve coarse tickets in the TypeScript edit
    // compiler. A final reservation has no wire operation to retain its clock.
    let mut single = doc.schema().manifest().clone();
    single["nodes"]["paragraph"]["attrs"]
        .as_object_mut()
        .unwrap()
        .shift_remove("second");
    let mut doc = RuntimeDocument::new("A", RuntimeSchema::compile(single).unwrap()).unwrap();
    let before = cp(&mut doc);
    assert!(doc.insert_model_at(&[1],json!({"type":"section","children":[{"type":"paragraph","attrs":{"first":{}},"runs":[]}]}),EditOptions::default(),1.).is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn required_gap_insertion_keeps_lower_clock_concurrent_foreign_head_placement() {
    let schema = product("word");
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    let section = container(&mut a, "section");
    let (other, _) = a
        .insert_block(
            "section",
            Some(&section),
            None,
            Attributes::new(),
            EditOptions::default(),
            1.5,
        )
        .unwrap();
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let head = RuntimeDocument::flow_head(Some(&section)).unwrap();
    let foreign_at = b.next_ticket().unwrap();
    let foreign = b
        .record(
            vec![Op::Move {
                at: foreign_at.clone(),
                target: head.ticket().unwrap(),
                parent: head.ticket().unwrap(),
                after: None,
            }],
            EditOptions::default(),
            2.,
        )
        .unwrap();
    let (paragraph, inserted) = a
        .insert_paragraph_at(&[1, 3], paragraph("own😀"), EditOptions::default(), 3.)
        .unwrap();
    assert!(inserted
        .ops
        .iter()
        .filter_map(|op| match op {
            Op::Move { target, .. } => Some(target),
            _ => None,
        })
        .all(|target| target == &paragraph.ticket().unwrap()));
    assert!(inserted
        .ops
        .iter()
        .any(|op| matches!(op,Op::Move{at,..} if at.lamport>foreign_at.lamport)));
    a.apply_remote(&foreign.ops).unwrap();
    b.apply_remote(&inserted.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(
        a.state().unwrap()["placements"][head.as_str()]["at"],
        json!(foreign_at)
    );
    let saved = a.checkpoint().unwrap().to_json().unwrap();
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(
        a.model().unwrap()["children"][1]["children"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        a.state().unwrap()["placements"][head.as_str()]["at"],
        json!(foreign_at)
    );
    let saved = a.checkpoint().unwrap().to_json().unwrap();
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(
        a.model().unwrap()["children"][1]["children"][3]["type"],
        "paragraph"
    );
    assert_eq!(
        a.state().unwrap()["placements"][head.as_str()]["at"],
        json!(foreign_at)
    );
    // Placement references still require the same logical parent and a real marker.
    let before = cp(&mut a);
    let at = a.next_ticket().unwrap();
    let forged = Ticket {
        lamport: 99,
        actor: RuntimeDocument::required_head(&head, "footer", 0)
            .unwrap()
            .ticket()
            .unwrap()
            .actor,
    };
    assert!(a
        .record(
            vec![Op::Move {
                at,
                target: paragraph.ticket().unwrap(),
                parent: head.ticket().unwrap(),
                after: Some(forged)
            }],
            EditOptions::default(),
            4.
        )
        .is_err());
    assert_eq!(cp(&mut a), before);
    let at = a.next_ticket().unwrap();
    let other_head = RuntimeDocument::flow_head(Some(&other)).unwrap();
    let other_footer = a.required_node(&other_head, "footer", 0).unwrap();
    assert!(a
        .record(
            vec![Op::Move {
                at,
                target: paragraph.ticket().unwrap(),
                parent: head.ticket().unwrap(),
                after: Some(other_footer.ticket().unwrap())
            }],
            EditOptions::default(),
            5.
        )
        .is_err());
    assert_eq!(cp(&mut a), before);
    presentation_foreign_nonempty_title_keeps_storage_and_writer();
    synthetic_group_defaults_omit_empty_group_attributes();
}

fn synthetic_group_defaults_omit_empty_group_attributes() {
    for max in [0, 1] {
        let schema=RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
            "doc":{"shape":"flow","children":["group","note"],"default":"item","childRules":{"group":{"max":max}}},
            "group":{"shape":"group","children":["item"],"by":[]},
            "item":{"shape":"text","attrs":{"label":{"default":"default"}}},
            "note":{"shape":"atom"}
        }})).unwrap();
        let mut doc = RuntimeDocument::new("A", schema).unwrap();
        let (note, _) = doc
            .insert_block(
                "note",
                None,
                None,
                Attributes::new(),
                EditOptions::default(),
                1.,
            )
            .unwrap();
        let at = doc.next_ticket().unwrap();
        doc.record(
            vec![Op::Move {
                at,
                target: Key::root().ticket().unwrap(),
                parent: Key::root().ticket().unwrap(),
                after: Some(note.ticket().unwrap()),
            }],
            EditOptions::default(),
            2.,
        )
        .unwrap();
        let expected = if max == 0 {
            json!([{"type":"note"}])
        } else {
            json!([{"type":"group","children":[{"type":"item","attrs":{"label":"default"},"runs":[]}]},{"type":"note"}])
        };
        assert_eq!(doc.model().unwrap()["children"], expected);
    }
}

fn presentation_foreign_nonempty_title_keeps_storage_and_writer() {
    let schema = product("presentation");
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    let slide = container(&mut a, "slide");
    let head = RuntimeDocument::flow_head(Some(&slide)).unwrap();
    a.insert_text_at(
        &head,
        Some(&head),
        "HEAD😀",
        Attributes::from([("bold".into(), json!(true))]),
        EditOptions::default(),
        2.,
    )
    .unwrap();
    let retained = retained_head_chars(&mut a, &head);
    assert_eq!(retained.len(), 6);
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let notes = b.required_node(&head, "notes", 0).unwrap();
    let foreign_at = b.next_ticket().unwrap();
    let foreign = b
        .record(
            vec![Op::Move {
                at: foreign_at.clone(),
                target: head.ticket().unwrap(),
                parent: head.ticket().unwrap(),
                after: Some(notes.ticket().unwrap()),
            }],
            EditOptions::default(),
            3.,
        )
        .unwrap();
    let raw = b.state().unwrap();
    let projection = raw["projections"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["line"] == head.as_str())
        .unwrap();
    assert_eq!(projection["blocks"][0]["type"], "notes");
    assert_eq!(projection["blocks"][1]["type"], "title");
    assert_eq!(
        projection["blocks"][1]["textUnits"],
        json!([72, 69, 65, 68, 55357, 56832])
    );
    let model = b.model().unwrap();
    assert_eq!(
        model["children"][1]["children"][0],
        json!({"type":"title","runs":[]})
    );
    assert_eq!(model["children"][1]["children"][1]["type"], "notes");
    assert_eq!(retained_head_chars(&mut b, &head), retained);
    let (inserted_id, inserted) = a
        .insert_paragraph_at(&[1, 2], paragraph("own😀"), EditOptions::default(), 4.)
        .unwrap();
    assert!(inserted
        .ops
        .iter()
        .filter_map(|op| match op {
            Op::Move { target, .. } => Some(target),
            _ => None,
        })
        .all(|target| target == &inserted_id.ticket().unwrap()));
    a.apply_remote(&foreign.ops).unwrap();
    b.apply_remote(&inserted.ops).unwrap();
    let expected = a.model().unwrap();
    assert_eq!(expected, b.model().unwrap());
    assert_eq!(expected["children"][1]["children"][2]["type"], "paragraph");
    assert_eq!(
        expected["children"][1]["children"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|node| node["type"] == "title")
            .count(),
        1
    );
    for undo in [true, false] {
        let saved = a.checkpoint().unwrap().to_json().unwrap();
        a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        let change = if undo {
            a.undo().unwrap()
        } else {
            a.redo().unwrap()
        };
        b.apply_remote(&change.ops).unwrap();
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        for doc in [&mut a, &mut b] {
            assert_eq!(retained_head_chars(doc, &head), retained);
            assert_eq!(
                doc.state().unwrap()["placements"][head.as_str()]["at"],
                json!(foreign_at)
            );
            assert_eq!(
                doc.model().unwrap()["children"][1]["children"][0],
                json!({"type":"title","runs":[]})
            );
        }
        assert_eq!(
            a.model().unwrap()["children"][1]["children"]
                .as_array()
                .unwrap()
                .len(),
            if undo { 2 } else { 3 }
        );
    }
    assert_eq!(a.model().unwrap(), expected);
}

fn retained_head_chars(doc: &mut RuntimeDocument, head: &Key) -> Vec<Value> {
    doc.state().unwrap()["lines"]
        .as_array()
        .unwrap()
        .iter()
        .find(|line| line["key"] == head.as_str())
        .unwrap()["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["kind"] == "char")
        .cloned()
        .collect()
}
