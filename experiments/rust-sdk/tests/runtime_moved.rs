use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn product(name: &str) -> RuntimeSchema {
    let products: Value = serde_json::from_str(include_str!(
        "../../runtime-document-unused/product-schemas.json"
    ))
    .unwrap();
    let schema = RuntimeSchema::compile(products[name].clone()).unwrap();
    assert_eq!(schema.manifest(), &products[name]);
    schema
}
fn cp(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn paragraph(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text,"marks":{"bold":true}}]})
}
fn empty_attrs() -> Attributes {
    Attributes::new()
}
fn place(
    doc: &mut RuntimeDocument,
    target: &Key,
    parent: Option<&Key>,
    after: Option<&Key>,
    time: f64,
) -> Change {
    doc.reparent_block(target, parent, after, EditOptions::default(), time)
        .unwrap()
}
fn flow(doc: &mut RuntimeDocument, kind: &str, parent: Option<&Key>, after: Option<&Key>) -> Key {
    doc.insert_block_in(
        kind,
        parent,
        after,
        None,
        empty_attrs(),
        EditOptions::default(),
        1.,
    )
    .unwrap()
    .0
}
fn retained_chars(doc: &mut RuntimeDocument, head: &Key) -> Vec<Value> {
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

#[test]
fn source_projection_read_is_nonmutating_and_keeps_physical_line_order() {
    let schema=RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","box"],"default":"paragraph"},
        "box":{"shape":"flow","children":["paragraph"],"default":"paragraph"},"paragraph":{"shape":"text"}
    }})).unwrap();
    let mut server = doc_sync_rust_shadow::Server::default();
    let base = json!({"replica":"ordered","schema":schema.identity()});
    let mut request = base.clone();
    request["cmd"] = json!("new");
    request["actor"] = json!("A");
    request["runtimeSchema"] = schema.dto().clone();
    assert_eq!(server.request(request)["ok"], true);
    let mut request = base.clone();
    request["cmd"] = json!("apply");
    request["ops"] = json!([
        {"t":"node","id":{"lamport":2,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"type":"box","boundary":""},
        {"t":"node","id":{"lamport":1,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"type":"box","boundary":""}
    ]);
    assert_eq!(server.request(request)["ok"], true);
    let mut request = base.clone();
    request["cmd"] = json!("snapshot");
    let before = server.request(request.clone());
    let mut inspect = base;
    inspect["cmd"] = json!("source_projections");
    let projections = server.request(inspect);
    assert_eq!(projections["ok"], true);
    let lines = projections["projections"]
        .as_array()
        .unwrap()
        .iter()
        .map(|source| source["line"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(lines, vec!["0@~root", "0@2@A/body", "0@1@A/body"]);
    assert_eq!(server.request(request), before);
}

#[test]
fn root_insert_uses_current_placement_writer_and_original_physical_origin() {
    for name in ["word", "presentation"] {
        let mut doc = RuntimeDocument::new("A", product(name)).unwrap();
        let (second, _) = doc
            .insert_paragraph_at(&[1], paragraph("second"), EditOptions::default(), 1.)
            .unwrap();
        let (third, _) = doc
            .insert_paragraph_at(&[2], paragraph("third😀"), EditOptions::default(), 2.)
            .unwrap();
        let movement = place(&mut doc, &third, None, Some(&Key::root()), 3.);
        let winner = match &movement.ops[0] {
            Op::Move { at, .. } => at.clone(),
            _ => panic!(),
        };
        let origin = doc
            .capture_selection(Some(Selection {
                anchor: Position(vec![1, 7]),
                focus: Position(vec![1, 7]),
            }))
            .unwrap()
            .unwrap()
            .anchor
            .ticket()
            .unwrap();
        let before = doc.model().unwrap();
        let (inserted, change) = doc
            .insert_paragraph_at(&[2], paragraph("new"), EditOptions::default(), 4.)
            .unwrap();
        assert!(change
            .ops
            .iter()
            .any(|op| matches!(op,Op::Node{origin:actual,..} if actual==&origin)));
        assert!(change.ops.iter().any(|op|matches!(op,Op::Move{target,after:Some(after),..} if target==&inserted.ticket().unwrap() && after==&winner)));
        assert_eq!(
            doc.model().unwrap()["children"][3]["runs"][0]["units"],
            json!([115, 101, 99, 111, 110, 100])
        );
        doc.undo().unwrap();
        assert_eq!(doc.model().unwrap(), before);
        doc.redo().unwrap();
        assert_eq!(
            doc.model().unwrap()["children"].as_array().unwrap().len(),
            4
        );
        assert_ne!(second, inserted);
    }
}

#[test]
fn moved_flow_body_is_resolved_at_its_new_cross_flow_model_path() {
    for (name, parent_kind, child_kind, text_kind) in [
        ("word", "section", "figure", "caption"),
        ("presentation", "slide", "text-box", "paragraph"),
    ] {
        let mut doc = RuntimeDocument::new("A", product(name)).unwrap();
        let first = flow(&mut doc, parent_kind, None, None);
        let second = flow(&mut doc, parent_kind, None, Some(&first));
        let nested = flow(&mut doc, child_kind, Some(&first), None);
        let second_head = RuntimeDocument::flow_head(Some(&second)).unwrap();
        place(&mut doc, &nested, Some(&second), Some(&second_head), 2.);
        let before = doc.model().unwrap();
        assert_eq!(before["children"][2]["children"][1]["type"], child_kind);
        let (_, change) = doc
            .insert_paragraph_at(
                &[2, 1, 0],
                json!({"type":text_kind,"runs":[{"text":"nested😀"}]}),
                EditOptions::default(),
                3.,
            )
            .unwrap();
        let nested_head = RuntimeDocument::flow_head(Some(&nested)).unwrap();
        assert!(change
            .ops
            .iter()
            .any(|op| matches!(op,Op::Move{parent,..} if parent==&nested_head.ticket().unwrap())));
        let model = doc.model().unwrap();
        assert_eq!(
            model["children"][2]["children"][1]["children"][0]["type"],
            text_kind
        );
        doc.undo().unwrap();
        assert_eq!(doc.model().unwrap(), before);
        let saved = doc.checkpoint().unwrap().to_json().unwrap();
        doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        doc.redo().unwrap();
        assert_eq!(doc.model().unwrap(), model);
    }
}

#[test]
fn retained_undone_movement_still_compiles_a_fresh_fragment_at_zero() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    let section = flow(&mut doc, "section", None, None);
    place(&mut doc, &section, None, None, 2.);
    doc.undo().unwrap();
    assert!(!doc.state().unwrap()["moves"].as_array().unwrap().is_empty());
    let before = doc.model().unwrap();
    let (_, change) = doc
        .insert_paragraph_at(&[0], paragraph("first"), EditOptions::default(), 3.)
        .unwrap();
    assert!(matches!(&change.ops[0],Op::Node{origin,..} if origin.actor.starts_with("~fragment:")));
    assert!(change
        .ops
        .iter()
        .any(|op| matches!(op, Op::Move { after: None, .. })));
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), before);
}

#[test]
fn presentation_canonical_head_positions_keep_nonempty_foreign_head_and_writer() {
    for index in 0..=2 {
        let mut a = RuntimeDocument::new("A", product("presentation")).unwrap();
        let slide = flow(&mut a, "slide", None, None);
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
        let retained = retained_chars(&mut a, &head);
        assert_eq!(retained.len(), 6);
        let mut b = RuntimeDocument::new("B", product("presentation")).unwrap();
        for change in a.pending_changes() {
            b.apply_remote(&change.ops).unwrap();
        }
        let notes = b.required_node(&head, "notes", 0).unwrap();
        let foreign = place(&mut b, &head, Some(&slide), Some(&notes), 3.);
        a.apply_remote(&foreign.ops).unwrap();
        let writer = a.state().unwrap()["placements"][head.as_str()].clone();
        let before = a.model().unwrap();
        let (_, inserted) = a
            .insert_paragraph_at(&[1, index], paragraph("new😀"), EditOptions::default(), 4.)
            .unwrap();
        b.apply_remote(&inserted.ops).unwrap();
        let expected = a.model().unwrap();
        assert_eq!(expected, b.model().unwrap());
        let expected_types = match index {
            0 => vec!["paragraph", "title", "notes"],
            1 => vec!["title", "paragraph", "notes"],
            _ => vec!["title", "notes", "paragraph"],
        };
        assert_eq!(
            expected["children"][1]["children"]
                .as_array()
                .unwrap()
                .iter()
                .map(|node| node["type"].as_str().unwrap())
                .collect::<Vec<_>>(),
            expected_types
        );
        let undo = a.undo().unwrap();
        b.apply_remote(&undo.ops).unwrap();
        assert_eq!(a.model().unwrap(), before);
        let saved = a.checkpoint().unwrap().to_json().unwrap();
        a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        let redo = a.redo().unwrap();
        b.apply_remote(&redo.ops).unwrap();
        assert_eq!(a.model().unwrap(), expected);
        for doc in [&mut a, &mut b] {
            assert_eq!(retained_chars(doc, &head), retained);
            assert_eq!(doc.state().unwrap()["placements"][head.as_str()], writer);
        }
    }
}

#[test]
fn source_virtual_text_promotes_before_projected_model_insertion() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    let section = flow(&mut doc, "section", None, None);
    let gap = doc
        .insert_text_at(
            &Key::root(),
            Some(&section),
            "gap😀",
            empty_attrs(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    place(&mut doc, &section, None, Some(&Key::root()), 3.);
    let (_, inserted) = doc
        .insert_paragraph_at(&[1], paragraph("new"), EditOptions::default(), 4.)
        .unwrap();
    let first = match &gap.ops[0] {
        Op::Text { id, .. } => Key::from_ticket(id),
        _ => panic!(),
    };
    assert!(
        matches!(&inserted.ops[0],Op::Node{boundary,..} if boundary==&format!("virtual:{}|{}",section.as_str(),first.as_str()))
    );
    assert!(doc.model().unwrap().to_string().contains("paragraph"));
    let before = cp(&mut doc);
    assert!(doc
        .insert_paragraph_at(
            &[1],
            json!({"type":"paragraph","runs":[{"text":"x","marks":{"unknown":true}}]}),
            EditOptions::default(),
            5.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn moved_insert_history_checkpoint_retry_preserves_other_actor_updates() {
    let mut a = RuntimeDocument::new("A", product("word")).unwrap();
    let section = flow(&mut a, "section", None, None);
    let head = RuntimeDocument::flow_head(Some(&section)).unwrap();
    let (existing, _) = a
        .insert_paragraph_at(&[1, 1], paragraph("existing"), EditOptions::default(), 2.)
        .unwrap();
    let mut b = RuntimeDocument::new("B", product("word")).unwrap();
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let foreign = place(&mut b, &existing, Some(&section), None, 3.);
    a.apply_remote(&foreign.ops).unwrap();
    let (_, own) = a
        .insert_paragraph_at(&[1, 1], paragraph("own😀"), EditOptions::default(), 4.)
        .unwrap();
    b.apply_remote(&own.ops).unwrap();
    let peer = b
        .set_field_path(
            &existing,
            "style",
            &["align"],
            json!("right"),
            EditOptions::default(),
            5.,
        )
        .unwrap();
    a.apply_remote(&peer.ops).unwrap();
    let text = b
        .insert_text_at(
            &head,
            Some(&existing),
            "peer😀",
            empty_attrs(),
            EditOptions::default(),
            6.,
        )
        .unwrap();
    a.apply_remote(&text.ops).unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let before = cp(&mut a);
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&before).unwrap()).unwrap();
    for _ in 0..2 {
        for change in a.pending_changes().to_vec() {
            a.apply_remote(&change.ops).unwrap();
            b.apply_remote(&change.ops).unwrap();
        }
    }
    assert_eq!(cp(&mut a), before);
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let pending = a.pending_changes().to_vec();
    a.acknowledge(&pending).unwrap();
    assert!(a.pending_changes().is_empty());
    let before = cp(&mut a);
    for node in [
        json!({"type":"table","children":[]}),
        json!({"type":"list","children":[]}),
        json!({"type":"paragraph","attrs":{"style":{"align":"invalid"}},"runs":[]}),
    ] {
        assert!(a
            .insert_model_at(&[1, 0], node, EditOptions::default(), 7.)
            .is_err());
        assert_eq!(cp(&mut a), before);
    }
}

#[test]
fn stale_pending_birth_survives_anchor_reparent_and_delete_before_delivery() {
    for delete in [false, true] {
        let mut a = RuntimeDocument::new("A", product("word")).unwrap();
        let left = flow(&mut a, "section", None, None);
        let right = flow(&mut a, "section", None, Some(&left));
        let (existing, _) = a
            .insert_paragraph_at(&[1, 1], paragraph("existing"), EditOptions::default(), 2.)
            .unwrap();
        let right_head = RuntimeDocument::flow_head(Some(&right)).unwrap();
        place(&mut a, &existing, Some(&right), Some(&right_head), 3.);
        let mut b = RuntimeDocument::new("B", product("word")).unwrap();
        for change in a.pending_changes() {
            b.apply_remote(&change.ops).unwrap();
        }
        let (_, pending) = a
            .insert_paragraph_at(&[2, 2], paragraph("pending😀"), EditOptions::default(), 4.)
            .unwrap();
        let relocated = place(&mut b, &existing, Some(&left), None, 5.);
        let deleted = if delete {
            Some(
                b.delete_block(&existing, EditOptions::default(), 6.)
                    .unwrap(),
            )
        } else {
            None
        };
        b.apply_remote(&pending.ops).unwrap();
        a.apply_remote(&relocated.ops).unwrap();
        if let Some(deleted) = deleted {
            a.apply_remote(&deleted.ops).unwrap();
        }
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        assert_eq!(
            a.state().unwrap()["placements"],
            b.state().unwrap()["placements"]
        );
        let saved = cp(&mut a);
        a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        let undo = a.undo().unwrap();
        b.apply_remote(&undo.ops).unwrap();
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        let redo = a.redo().unwrap();
        b.apply_remote(&redo.ops).unwrap();
        assert_eq!(a.model().unwrap(), b.model().unwrap());
    }
}

#[test]
fn movement_boundaries_keep_known_opaque_anchors_and_reject_bad_references() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    let left = flow(&mut doc, "section", None, None);
    let right = flow(&mut doc, "section", None, Some(&left));
    let left_head = RuntimeDocument::flow_head(Some(&left)).unwrap();
    let right_head = RuntimeDocument::flow_head(Some(&right)).unwrap();
    let id = doc.next_ticket().unwrap();
    let known = Op::Node {
        id: id.clone(),
        origin: left_head.ticket().unwrap(),
        node_type: "paragraph".into(),
        boundary: format!("{}|{}", left_head.as_str(), right_head.as_str()),
        attrs: None,
    };
    // A right boundary records an observed token. Its later ownership is not
    // an admission rule in a movement-enabled wire document.
    doc.record(vec![known], EditOptions::default(), 2.).unwrap();
    let before = cp(&mut doc);
    let id = doc.next_ticket().unwrap();
    for boundary in [
        format!("{}|999@unknown", left_head.as_str()),
        format!("{}|{}", left_head.as_str(), Key::from_ticket(&id).as_str()),
        format!("0@~root|{}", right_head.as_str()),
        format!(
            "{}|{}|child:999@bad",
            left_head.as_str(),
            right_head.as_str()
        ),
    ] {
        assert!(doc
            .record(
                vec![Op::Node {
                    id: id.clone(),
                    origin: left_head.ticket().unwrap(),
                    node_type: "paragraph".into(),
                    boundary,
                    attrs: None
                }],
                EditOptions::default(),
                3.
            )
            .is_err());
        assert_eq!(cp(&mut doc), before);
    }
}

#[test]
fn multiple_virtual_promotions_sort_eligible_lines_in_utf16_order() {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":["bold"],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","box"],"default":"paragraph"},
        "box":{"shape":"flow","children":["paragraph","divider"],"default":"paragraph"},
        "paragraph":{"shape":"text"},"divider":{"shape":"atom"}
    }}))
    .unwrap();
    let mut doc = RuntimeDocument::new("A", schema).unwrap();
    let parents = [Key::parse("2@Z").unwrap(), Key::parse("10@Y").unwrap()];
    for parent in &parents {
        doc.apply_remote(&[Op::Node {
            id: parent.ticket().unwrap(),
            origin: Key::root().ticket().unwrap(),
            node_type: "box".into(),
            boundary: String::new(),
            attrs: None,
        }])
        .unwrap();
    }
    let mut expected = vec![];
    for parent in &parents {
        let mut after = None;
        for text in ["a", "b"] {
            let (divider, _) = doc
                .insert_block_in(
                    "divider",
                    Some(parent),
                    after.as_ref(),
                    None,
                    empty_attrs(),
                    EditOptions::default(),
                    1.,
                )
                .unwrap();
            let inserted = doc
                .insert_text_in(
                    Some(parent),
                    Some(&divider),
                    text,
                    empty_attrs(),
                    EditOptions::default(),
                    2.,
                )
                .unwrap();
            let first = match &inserted.ops[0] {
                Op::Text { id, .. } => Key::from_ticket(id),
                _ => panic!(),
            };
            expected.push((
                RuntimeDocument::flow_head(Some(parent))
                    .unwrap()
                    .as_str()
                    .to_owned(),
                format!("virtual:{}|{}", divider.as_str(), first.as_str()),
            ));
            after = Some(first);
        }
    }
    expected.sort_by(|left, right| left.0.encode_utf16().cmp(right.0.encode_utf16()));
    place(&mut doc, &parents[0], None, Some(&Key::root()), 3.);
    let before = doc.model().unwrap();
    let (_, inserted) = doc
        .insert_paragraph_at(&[0], paragraph("new"), EditOptions::default(), 4.)
        .unwrap();
    for (op, (_, boundary)) in inserted.ops.iter().zip(&expected) {
        assert!(matches!(op,Op::Node{boundary:actual,..} if actual==boundary));
    }
    let after = doc.model().unwrap();
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), before);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), after);
}

fn plain(node: &Value) -> String {
    let units = node["runs"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|run| run["units"].as_array().into_iter().flatten())
        .map(|unit| unit.as_u64().unwrap() as u16)
        .collect::<Vec<_>>();
    String::from_utf16_lossy(&units)
}

fn reused_boundary_doc(name: &str, cross_flow: bool) -> (RuntimeDocument, Key, Key) {
    let mut doc = RuntimeDocument::new("A", product(name)).unwrap();
    doc.insert_text_at(
        &Key::root(),
        None,
        "ROOT😀",
        empty_attrs(),
        EditOptions::default(),
        1.,
    )
    .unwrap();
    let parent = if cross_flow {
        Some(
            doc.insert_model_at(
                &[1],
                json!({"type":if name=="word"{"section"}else{"slide"},"children":[]}),
                EditOptions::default(),
                2.,
            )
            .unwrap()
            .0,
        )
    } else {
        None
    };
    let offset = usize::from(cross_flow);
    let (one, _) = doc
        .insert_paragraph_at(&[1 + offset], paragraph("ONE"), EditOptions::default(), 3.)
        .unwrap();
    let (two, _) = doc
        .insert_paragraph_at(&[2 + offset], paragraph("TWO"), EditOptions::default(), 4.)
        .unwrap();
    let head = parent
        .as_ref()
        .map(|parent| RuntimeDocument::flow_head(Some(parent)).unwrap());
    place(&mut doc, &two, parent.as_ref(), head.as_ref(), 5.);
    doc.undo().unwrap();
    doc.redo().unwrap();
    (doc, one, two)
}

#[test]
fn root_end_after_move_undo_redo_preserves_the_old_source_class() {
    for name in ["word", "presentation"] {
        for cross_flow in [false, true] {
            let (mut doc, _, two) = reused_boundary_doc(name, cross_flow);
            let writer = doc.state().unwrap()["placements"][two.as_str()].clone();
            let before = doc.model().unwrap();
            let index = before["children"].as_array().unwrap().len();
            let (_, inserted) = doc
                .insert_paragraph_at(&[index], paragraph("NEW😀"), EditOptions::default(), 6.)
                .unwrap();
            assert!(inserted.ops.iter().any(|op|matches!(op,Op::Node{boundary,..} if boundary.ends_with(&format!("|{}",two.as_str())))));
            let expected = doc.model().unwrap();
            assert_eq!(
                &expected["children"].as_array().unwrap()[..index],
                before["children"].as_array().unwrap()
            );
            assert_eq!(plain(&expected["children"][index]), "NEW😀");
            doc.undo().unwrap();
            assert_eq!(doc.model().unwrap(), before);
            let saved = cp(&mut doc);
            doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
            doc.redo().unwrap();
            assert_eq!(doc.model().unwrap(), expected);
            assert_eq!(doc.state().unwrap()["placements"][two.as_str()], writer);
        }
    }
}

#[test]
fn concurrent_same_gap_births_share_one_fence_and_keep_foreign_text() {
    for name in ["word", "presentation"] {
        let (mut a, _, two) = reused_boundary_doc(name, false);
        let mut b = RuntimeDocument::new("B", product(name)).unwrap();
        for change in a.pending_changes() {
            b.apply_remote(&change.ops).unwrap();
        }
        let writer = a.state().unwrap()["placements"][two.as_str()].clone();
        let (_, own) = a
            .insert_paragraph_at(&[3], paragraph("LEFT"), EditOptions::default(), 6.)
            .unwrap();
        let (_, peer) = b
            .insert_paragraph_at(&[3], paragraph("RIGHT"), EditOptions::default(), 6.)
            .unwrap();
        let boundary = |change: &Change| {
            change
                .ops
                .iter()
                .find_map(|op| match op {
                    Op::Node { boundary, .. } => Some(boundary.clone()),
                    _ => None,
                })
                .unwrap()
        };
        assert_eq!(boundary(&own), boundary(&peer));
        assert!(boundary(&own).ends_with(&format!("|{}", two.as_str())));
        a.apply_remote(&peer.ops).unwrap();
        b.apply_remote(&own.ops).unwrap();
        let expected = a.model().unwrap();
        assert_eq!(expected, b.model().unwrap());
        assert_eq!(expected["children"].as_array().unwrap().len(), 4);
        assert_eq!(plain(&expected["children"][0]), "TWO");
        let merged = plain(&expected["children"][3]);
        assert!(merged.contains("LEFT") && merged.contains("RIGHT"));
        let undo = a.undo().unwrap();
        b.apply_remote(&undo.ops).unwrap();
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        assert_eq!(plain(&a.model().unwrap()["children"][3]), "RIGHT");
        let saved = cp(&mut a);
        a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        for _ in 0..2 {
            for change in a.pending_changes().to_vec() {
                a.apply_remote(&change.ops).unwrap();
                b.apply_remote(&change.ops).unwrap();
            }
        }
        assert_eq!(cp(&mut a), saved);
        let redo = a.redo().unwrap();
        b.apply_remote(&redo.ops).unwrap();
        assert_eq!(a.model().unwrap(), expected);
        assert_eq!(a.model().unwrap(), b.model().unwrap());
        assert_eq!(a.state().unwrap()["placements"][two.as_str()], writer);
    }
}

#[test]
fn repeated_moved_away_reuse_selects_the_next_existing_primary_fence() {
    for name in ["word", "presentation"] {
        let (mut doc, _, mut fence) = reused_boundary_doc(name, false);
        for generation in 0..3 {
            let before = doc.model().unwrap();
            let index = before["children"].as_array().unwrap().len();
            let (inserted, change) = doc
                .insert_paragraph_at(
                    &[index],
                    paragraph(&format!("GEN{generation}")),
                    EditOptions::default(),
                    7. + generation as f64,
                )
                .unwrap();
            assert!(
                matches!(&change.ops[0],Op::Node{boundary,..} if boundary.ends_with(&format!("|{}",fence.as_str())))
            );
            assert_eq!(change.ops.len(), 3);
            assert_eq!(
                &doc.model().unwrap()["children"].as_array().unwrap()[..index],
                before["children"].as_array().unwrap()
            );
            place(&mut doc, &inserted, None, None, 10. + generation as f64);
            fence = inserted;
        }
    }
}
