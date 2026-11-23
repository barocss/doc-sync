use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn product(name: &str) -> RuntimeSchema {
    let source: Value = serde_json::from_str(include_str!(
        "../../runtime-document-unused/product-schemas.json"
    ))
    .unwrap();
    let schema = RuntimeSchema::compile(source[name].clone()).unwrap();
    assert_eq!(schema.manifest(), &source[name]);
    schema
}
fn cp(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn p(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text,"marks":{"bold":true}}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"cell-body","children":[p(text)]}]})
}
fn table() -> Value {
    json!({"type":"table","children":[{"type":"row","children":[cell("00"),cell("01")]},{"type":"row","children":[cell("10"),cell("11")]}]})
}
fn parent(doc: &mut RuntimeDocument, kind: &str) -> Key {
    doc.insert_model_at(
        &[1],
        json!({"type":kind,"children":[]}),
        EditOptions::default(),
        1.,
    )
    .unwrap()
    .0
}
fn text(node: &Value) -> String {
    let units = node["runs"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|run| run["units"].as_array().into_iter().flatten())
        .map(|v| v.as_u64().unwrap() as u16)
        .collect::<Vec<_>>();
    String::from_utf16_lossy(&units)
}

#[test]
fn group_wrapper_by_inheritance_override_and_member_positions() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    parent(&mut doc, "section");
    let (first,_)=doc.insert_model_at(&[1,0],json!({"type":"list","attrs":{"listType":"numbered"},"children":[{"type":"list-item","runs":[{"text":"A"}]},{"type":"list-item","runs":[{"text":"B"}]}]}),EditOptions::default(),2.).unwrap();
    assert_eq!(
        first,
        RuntimeDocument::flow_head(Some(&Key::parse("1@A").unwrap())).unwrap()
    );
    let model = doc.model().unwrap();
    assert_eq!(
        model["children"][1]["children"][0]["attrs"]["listType"],
        "numbered"
    );
    doc.insert_model_at(
        &[1, 0, 1],
        json!({"type":"list-item","runs":[{"text":"middle"}]}),
        EditOptions::default(),
        3.,
    )
    .unwrap();
    let model = doc.model().unwrap();
    let members = model["children"][1]["children"][0]["children"]
        .as_array()
        .unwrap();
    assert_eq!(
        members.iter().map(text).collect::<Vec<_>>(),
        vec!["A", "middle", "B"]
    );
    let before = doc.model().unwrap();
    doc.insert_model_at(
        &[1, 0, 1],
        json!({"type":"list-item","attrs":{"listType":"bullet"},"runs":[{"text":"split"}]}),
        EditOptions::default(),
        4.,
    )
    .unwrap();
    let model = doc.model().unwrap();
    assert_eq!(
        model["children"][1]["children"][1]["attrs"]["listType"],
        "bullet"
    );
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), before);
    doc.insert_paragraph_at(&[1, 0, 1], p("split paragraph"), EditOptions::default(), 5.)
        .unwrap();
    let model = doc.model().unwrap();
    assert_eq!(model["children"][1]["children"][1]["type"], "paragraph");
    assert_eq!(model["children"][1]["children"][2]["type"], "list");
}

#[test]
fn object_group_keys_preserve_js_property_order_and_required_boundaries() {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","list"],"default":"p"},"p":{"shape":"text"},
        "list":{"shape":"group","children":["item"],"by":["bucket"]},
        "unused":{"shape":"group","children":["item"],"by":["other"]},
        "item":{"shape":"text","attrs":{"bucket":{"default":{}},"other":{"default":0}}}
    }}))
    .unwrap();
    let mut doc = RuntimeDocument::new("A", schema).unwrap();
    for (index, bucket) in [
        r#"{"a":1,"b":2}"#,
        r#"{"b":2,"a":1}"#,
        r#"{"2":"two","1":"one","a":1}"#,
        r#"{"1":"one","2":"two","a":1}"#,
    ]
    .into_iter()
    .enumerate()
    {
        let bucket: Value = serde_json::from_str(bucket).unwrap();
        doc.insert_model_at(&[index+1],json!({"type":"list","attrs":{"bucket":bucket},"children":[{"type":"item","runs":[{"text":"x"}]}]}),EditOptions::default(),index as f64+1.).unwrap();
    }
    let model = doc.model().unwrap();
    assert_eq!(model["children"].as_array().unwrap().len(), 4);
    assert_eq!(
        model["children"][3]["children"].as_array().unwrap().len(),
        2
    );
    let schema=RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","list"],"default":"p","childRules":{"list":{"min":2,"max":4}}},"p":{"shape":"text"},
        "list":{"shape":"group","children":["item"],"by":[]},"item":{"shape":"text"}
    }})).unwrap();
    let mut doc = RuntimeDocument::new("A", schema).unwrap();
    assert_eq!(
        doc.model().unwrap()["children"].as_array().unwrap().len(),
        3
    );
    doc.insert_paragraph_at(
        &[2],
        json!({"type":"p","runs":[{"text":"between"}]}),
        EditOptions::default(),
        1.,
    )
    .unwrap();
    let model = doc.model().unwrap();
    assert_eq!(model["children"][2]["type"], "p");
    assert_eq!(model["children"][3]["type"], "list");
}

#[test]
fn original_tables_fill_rows_then_columns_then_cell_bodies() {
    for (name, kind) in [("word", "section"), ("presentation", "slide")] {
        let mut doc = RuntimeDocument::new("A", product(name)).unwrap();
        parent(&mut doc, kind);
        let before = doc.model().unwrap();
        let (_, change) = doc
            .insert_model_at(&[1, 1], table(), EditOptions::default(), 2.)
            .unwrap();
        let births = change
            .ops
            .iter()
            .filter_map(|op| match op {
                Op::Node { node_type, .. } => Some(node_type.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(&births[..5], &["table", "row", "row", "col", "col"]);
        let model = doc.model().unwrap();
        let grid = &model["children"][1]["children"][1];
        assert_eq!(
            text(&grid["children"][1]["children"][1]["children"][0]["children"][0]),
            "11"
        );
        doc.undo().unwrap();
        assert_eq!(doc.model().unwrap(), before);
        let saved = cp(&mut doc);
        doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
        doc.redo().unwrap();
        assert_eq!(doc.model().unwrap(), model);
    }
}

#[test]
fn cell_field_ticket_order_is_not_rewritten_to_monotonic_order() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    parent(&mut doc, "section");
    let mut grid = table();
    let attrs = grid["children"][0]["children"][0].as_object_mut().unwrap();
    attrs.insert(
        "attrs".into(),
        json!({"properties":{"label":"owned","complete":true},"backgroundColor":"#aabbcc"}),
    );
    let (_, change) = doc
        .insert_model_at(&[1, 1], grid, EditOptions::default(), 2.)
        .unwrap();
    let clocks = change
        .ops
        .iter()
        .map(|op| match op.raw_operation() {
            Op::Node { id, .. } | Op::Text { id, .. } => id.lamport,
            Op::Set { at, .. }
            | Op::Move { at, .. }
            | Op::Delete { at, .. }
            | Op::Undelete { at, .. } => at.lamport,
            _ => unreachable!(),
        })
        .collect::<Vec<_>>();
    assert!(clocks.windows(2).any(|pair| pair[0] > pair[1]));
    let expected = doc.model().unwrap();
    let saved = cp(&mut doc);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved).unwrap()).unwrap();
    doc.undo().unwrap();
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), expected);
}

#[test]
fn row_and_cell_models_return_axes_and_fill_only_the_selected_row() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    parent(&mut doc, "section");
    doc.insert_model_at(&[1, 1], table(), EditOptions::default(), 2.)
        .unwrap();
    let (row, _) = doc
        .insert_model_at(
            &[1, 1, 1],
            json!({"type":"row","children":[cell("new0"),cell("new1"),cell("dropped")]}),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    let (col, _) = doc
        .insert_model_at(&[1, 1, 0, 1], cell("column"), EditOptions::default(), 4.)
        .unwrap();
    let state = doc.state().unwrap();
    let projection = state["projections"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|source| source["blocks"].as_array().unwrap())
        .find(|block| block["kind"] == "grid")
        .unwrap();
    assert!(projection["rows"]
        .as_array()
        .unwrap()
        .iter()
        .any(|id| id == row.as_str()));
    assert!(projection["cols"]
        .as_array()
        .unwrap()
        .iter()
        .any(|id| id == col.as_str()));
    let model = doc.model().unwrap();
    let rows = model["children"][1]["children"][1]["children"]
        .as_array()
        .unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0]["children"].as_array().unwrap().len(), 3);
    assert_eq!(
        text(&rows[0]["children"][1]["children"][0]["children"][0]),
        "column"
    );
    assert_eq!(
        text(&rows[1]["children"][1]["children"][0]["children"][0]),
        ""
    );
}

#[test]
fn cell_body_group_paths_and_foreign_register_survive_undo_and_retry() {
    let schema = product("word");
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    parent(&mut a, "section");
    let (grid, _) = a
        .insert_model_at(&[1, 1], table(), EditOptions::default(), 2.)
        .unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    let (member,own)=a.insert_model_at(&[1,1,0,0,0,1],json!({"type":"list","attrs":{"listType":"numbered"},"children":[{"type":"list-item","runs":[{"text":"item😀"}]}]}),EditOptions::default(),3.).unwrap();
    b.apply_remote(&own.ops).unwrap();
    let foreign = b
        .set_attribute(&grid, "header", json!(true), EditOptions::default(), 4.)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    let foreign_member = b
        .set_attribute(&member, "level", json!(2), EditOptions::default(), 5.)
        .unwrap();
    a.apply_remote(&foreign_member.ops).unwrap();
    let state = b.state().unwrap();
    let view = state["projections"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|source| source["blocks"].as_array().unwrap())
        .find(|block| block["marker"] == grid.as_str())
        .unwrap();
    let row = Key::parse(view["rows"][0].as_str().unwrap()).unwrap();
    let col = Key::parse(view["cols"][1].as_str().unwrap()).unwrap();
    let moved = b
        .reparent_block_to_cell(&member, &grid, &row, &col, None, EditOptions::default(), 6.)
        .unwrap();
    a.apply_remote(&moved.ops).unwrap();
    let writer = a.state().unwrap()["placements"][member.as_str()].clone();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(
        a.model().unwrap()["children"][1]["children"][1]["attrs"]["header"],
        true
    );
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
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    assert_eq!(a.state().unwrap()["placements"][member.as_str()], writer);
}

#[test]
fn ragged_spans_covered_body_and_nested_grid_paths_keep_hidden_data() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    parent(&mut doc, "section");
    let mut input = table();
    input["children"][0]["children"][0]["attrs"] = json!({"rowspan":2.0,"colspan":1e100});
    input["children"][1]["children"]
        .as_array_mut()
        .unwrap()
        .pop();
    doc.insert_model_at(&[1, 1], input, EditOptions::default(), 2.)
        .unwrap();
    let before = doc.model().unwrap();
    assert_eq!(
        before["children"][1]["children"][1]["children"][0]["children"][0]["attrs"]["rowspan"],
        2
    );
    assert_eq!(
        before["children"][1]["children"][1]["children"][0]["children"][0]["attrs"]["colspan"],
        2
    );
    assert_eq!(
        before["children"][1]["children"][1]["children"][1]["children"][0]["attrs"]["spanned"],
        true
    );
    doc.insert_paragraph_at(
        &[1, 1, 1, 0, 0, 1],
        p("covered😀"),
        EditOptions::default(),
        3.,
    )
    .unwrap();
    let model = doc.model().unwrap();
    assert_eq!(
        text(
            &model["children"][1]["children"][1]["children"][1]["children"][0]["children"][0]
                ["children"][1]
        ),
        "covered😀"
    );
    let position = Position(vec![1, 1, 1, 0, 0, 1, 0]);
    let anchors = doc
        .capture_selection(Some(Selection {
            anchor: position.clone(),
            focus: Position(vec![1, 1, 1, 0, 0, 1, 9]),
        }))
        .unwrap()
        .unwrap();
    assert_ne!(anchors.anchor, anchors.focus);
    assert_eq!(
        doc.resolve_selection(Some(anchors)).unwrap(),
        Some(Selection {
            anchor: Position(vec![1, 1, 0, 0, 0, 0, 0]),
            focus: Position(vec![1, 1, 0, 0, 0, 0, 0]),
        })
    );
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), before);
    let saved = cp(&mut doc);
    for value in [json!(1.5), json!("2"), json!(0), json!(-1)] {
        let mut invalid = cell("bad");
        invalid["attrs"] = json!({"rowspan":value});
        assert!(doc
            .insert_model_at(&[1, 1, 0, 1], invalid, EditOptions::default(), 4.)
            .is_err());
        assert_eq!(cp(&mut doc), saved);
    }
    let schema=RuntimeSchema::compile(json!({"root":"doc","marks":["bold"],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","table"],"default":"paragraph"},"paragraph":{"shape":"text"},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},"cell":{"shape":"cell","children":["cell-body"]},
        "cell-body":{"shape":"flow","children":["paragraph","table"],"default":"paragraph"}
    }})).unwrap();
    let mut doc = RuntimeDocument::new("A", schema).unwrap();
    let inner = json!({"type":"table","children":[{"type":"row","children":[cell("inner")]}]});
    let outer = json!({"type":"table","children":[{"type":"row","children":[{"type":"cell","children":[{"type":"cell-body","children":[inner]}]}]}]});
    let (grid, _) = doc
        .insert_model_at(&[1], outer, EditOptions::default(), 1.)
        .unwrap();
    doc.reparent_block(&grid, None, Some(&Key::root()), EditOptions::default(), 2.)
        .unwrap();
    let before = doc.model().unwrap();
    doc.insert_paragraph_at(
        &[1, 0, 0, 0, 1, 0, 0, 0, 1],
        p("nested"),
        EditOptions::default(),
        3.,
    )
    .unwrap();
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), before);
}

#[test]
fn covered_cell_ranges_follow_current_placement_and_restore_after_split() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    let section = parent(&mut doc, "section");
    let (grid, change) = doc
        .insert_model_at(&[1, 1], table(), EditOptions::default(), 2.)
        .unwrap();
    let axes = |kind: &str| {
        change
            .ops
            .iter()
            .filter_map(|op| match op {
                Op::Node { id, node_type, .. } if node_type == kind => Some(Key::from_ticket(id)),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    let rows = axes("row");
    let cols = axes("col");
    assert_eq!(rows.len(), 2);
    assert_eq!(cols.len(), 2);
    let (paragraph, _) = doc
        .insert_paragraph_at(&[1, 1, 0, 1, 0, 1], p("X😀Y"), EditOptions::default(), 3.)
        .unwrap();
    let range = Selection {
        anchor: Position(vec![1, 1, 0, 1, 0, 1, 4]),
        focus: Position(vec![1, 1, 0, 1, 0, 1, 0]),
    };
    let anchors = doc.capture_selection(Some(range.clone())).unwrap().unwrap();
    assert_eq!(anchors.focus, paragraph);
    doc.merge_cells(
        &grid,
        &rows[0],
        &cols[0],
        &rows[0],
        &cols[1],
        EditOptions::default(),
        4.,
    )
    .unwrap();
    assert_eq!(
        doc.capture_selection(Some(range.clone())).unwrap(),
        Some(anchors.clone())
    );
    let clamped = Some(Selection {
        anchor: Position(vec![1, 1, 0, 0, 0, 0, 0]),
        focus: Position(vec![1, 1, 0, 0, 0, 0, 0]),
    });
    assert_eq!(
        doc.resolve_selection(Some(anchors.clone())).unwrap(),
        clamped
    );
    doc = RuntimeDocument::restore(&doc.checkpoint().unwrap()).unwrap();
    assert_eq!(
        doc.resolve_selection(Some(anchors.clone())).unwrap(),
        clamped
    );
    doc.split_cell(&grid, &rows[0], &cols[0], EditOptions::default(), 5.)
        .unwrap();
    assert_eq!(
        doc.resolve_selection(Some(anchors.clone())).unwrap(),
        Some(range)
    );
    doc.merge_cells(
        &grid,
        &rows[0],
        &cols[0],
        &rows[0],
        &cols[1],
        EditOptions::default(),
        6.,
    )
    .unwrap();
    doc.reparent_block(&paragraph, Some(&section), None, EditOptions::default(), 7.)
        .unwrap();
    let outside = doc
        .resolve_selection(Some(anchors.clone()))
        .unwrap()
        .unwrap();
    assert_eq!(outside.focus.0.len(), 3);
    doc.reparent_block_to_cell(
        &paragraph,
        &grid,
        &rows[0],
        &cols[1],
        None,
        EditOptions::default(),
        8.,
    )
    .unwrap();
    assert_eq!(
        doc.resolve_selection(Some(anchors.clone())).unwrap(),
        clamped
    );
    doc.delete(&[cols[1].clone()], EditOptions::default(), 9.)
        .unwrap();
    assert_eq!(doc.resolve_selection(Some(anchors.clone())).unwrap(), None);
    doc.undo().unwrap();
    doc.delete_block(&grid, EditOptions::default(), 10.)
        .unwrap();
    assert_eq!(doc.resolve_selection(Some(anchors)).unwrap(), None);
}

#[test]
fn empty_structures_bad_roles_and_nonzero_cell_body_selectors_are_atomic() {
    let mut doc = RuntimeDocument::new("A", product("word")).unwrap();
    parent(&mut doc, "section");
    doc.insert_model_at(&[1, 1], table(), EditOptions::default(), 2.)
        .unwrap();
    let before = cp(&mut doc);
    for input in [
        json!({"type":"list","children":[]}),
        json!({"type":"table","children":[]}),
        json!({"type":"table","children":[{"type":"row","children":[]}]}),
        json!({"type":"table","children":[{"type":"paragraph"}]}),
        json!({"type":"list","attrs":{"unknown":true},"children":[{"type":"list-item","runs":[]}]}),
        json!({"type":"cell","attrs":{"rowspan":-1},"children":[]}),
    ] {
        assert!(doc
            .insert_model_at(&[1, 1], input, EditOptions::default(), 3.)
            .is_err());
        assert_eq!(cp(&mut doc), before);
    }
    assert!(doc
        .insert_model_at(&[1, 1, 0, 0, 1, 0], p("bad"), EditOptions::default(), 3.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
}
