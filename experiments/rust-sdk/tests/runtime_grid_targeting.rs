use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box","g"],"default":"p"},"p":{"shape":"text"},
        "box":{"shape":"flow","children":["p","g"],"default":"p"},
        "g":{"shape":"grid","children":["r"]},"r":{"shape":"row","children":["c"]},
        "c":{"shape":"cell","children":["b"]},"b":{"shape":"flow","children":["p","g"],"default":"p"}
    }})).unwrap()
}
fn p(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"c","children":[{"type":"b","children":[p(text)]}]})
}
fn row(text: &str, width: usize) -> Value {
    json!({"type":"r","children":(0..width).map(|_|cell(text)).collect::<Vec<_>>()})
}
fn grid(rows: usize, cols: usize) -> Value {
    json!({"type":"g","children":(0..rows).map(|n|row(&format!("R{n}"),cols)).collect::<Vec<_>>()})
}
struct Grid {
    key: Key,
    rows: Vec<Key>,
    cols: Vec<Key>,
}
fn add_grid(doc: &mut RuntimeDocument, at: &[usize], rows: usize, cols: usize) -> Grid {
    let (key, change) = doc
        .insert_model_at(at, grid(rows, cols), EditOptions::default(), 1.)
        .unwrap();
    let ids = |kind: &str| {
        change
            .ops
            .iter()
            .filter_map(|op| match op.raw_operation() {
                Op::Node { id, node_type, .. } if node_type == kind => Some(Key::from_ticket(id)),
                _ => None,
            })
            .collect()
    };
    Grid {
        key,
        rows: ids("r"),
        cols: ids("col"),
    }
}
fn rt(grid: &Grid, row: usize) -> GridRowTarget {
    GridRowTarget {
        grid: grid.key.clone(),
        row: grid.rows[row].clone(),
    }
}
fn ct(grid: &Grid, row: usize, col: usize) -> GridCellTarget {
    GridCellTarget {
        grid: grid.key.clone(),
        row: grid.rows[row].clone(),
        column: grid.cols[col].clone(),
    }
}
fn command(target: GridModelTarget, model: Value) -> GridModelInsert {
    GridModelInsert { target, model }
}
fn run(
    doc: &mut RuntimeDocument,
    base: &ModelEditBase,
    commands: &[GridModelInsert],
) -> ModelInsertBatchResult {
    doc.insert_grid_models_relative(base, commands, EditOptions::default(), 2.)
        .unwrap()
}
fn cp(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn text(node: &Value) -> Vec<u16> {
    node["runs"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|run| run["units"].as_array().into_iter().flatten())
        .map(|n| n.as_u64().unwrap() as u16)
        .collect()
}
fn grid_projection(doc: &mut RuntimeDocument, key: &Key) -> Value {
    doc.state().unwrap()["projections"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|source| source["blocks"].as_array().unwrap())
        .find(|block| block["marker"] == key.as_str())
        .unwrap()
        .clone()
}
fn raw_delete(doc: &mut RuntimeDocument, key: &Key) {
    let at = doc.next_ticket().unwrap();
    doc.record(
        vec![Op::Delete {
            at,
            ids: vec![key.ticket().unwrap()],
        }],
        EditOptions::default(),
        3.,
    )
    .unwrap();
}

#[test]
fn sequential_row_ids_and_cell_tuples_share_one_history_change() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 2, 2);
    let read = doc.read_model_for_edit().unwrap();
    let pending = doc.pending_changes().len();
    let out = run(
        &mut doc,
        &read.base,
        &[
            command(GridModelTarget::BeforeRow(rt(&g, 1)), row("X", 3)),
            command(GridModelTarget::AfterRow(rt(&g, 0)), row("Y", 2)),
            command(GridModelTarget::InsideCellEnd(ct(&g, 1, 1)), p("tail")),
            command(GridModelTarget::AfterRow(rt(&g, 0)), row("Z", 2)),
        ],
    );
    let expected = vec![
        g.rows[0].as_str().to_owned(),
        out.keys[3].as_ref().unwrap().as_str().into(),
        out.keys[1].as_ref().unwrap().as_str().into(),
        out.keys[0].as_ref().unwrap().as_str().into(),
        g.rows[1].as_str().into(),
    ];
    let projection = grid_projection(&mut doc, &g.key);
    assert_eq!(projection["rows"], json!(expected));
    assert_eq!(
        projection["cols"],
        json!(g.cols.iter().map(Key::as_str).collect::<Vec<_>>())
    );
    let model = doc.model().unwrap();
    assert_eq!(
        model["children"][1]["children"][3]["children"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        text(&model["children"][1]["children"][4]["children"][1]["children"][0]["children"][1]),
        "tail".encode_utf16().collect::<Vec<_>>()
    );
    assert_eq!(doc.pending_changes().len(), pending + 1);
    assert_eq!(doc.pending_changes().last(), Some(&out.change));
    assert!(out.keys[0].as_ref().unwrap().ticket().unwrap().lamport > 0);
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), read.model);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), model);
}

#[test]
fn ownership_kind_missing_and_later_failure_are_atomic_and_keep_base_usable() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let a = add_grid(&mut doc, &[1], 2, 2);
    let b = add_grid(&mut doc, &[2], 2, 2);
    let missing = Key::parse("999@missing").unwrap();
    for target in [
        GridModelTarget::BeforeRow(GridRowTarget {
            grid: a.key.clone(),
            row: b.rows[0].clone(),
        }),
        GridModelTarget::InsideCellEnd(GridCellTarget {
            grid: a.key.clone(),
            row: a.rows[0].clone(),
            column: b.cols[0].clone(),
        }),
        GridModelTarget::BeforeRow(GridRowTarget {
            grid: a.key.clone(),
            row: a.cols[0].clone(),
        }),
        GridModelTarget::BeforeRow(GridRowTarget {
            grid: Key::root(),
            row: a.rows[0].clone(),
        }),
        GridModelTarget::BeforeRow(GridRowTarget {
            grid: a.key.clone(),
            row: missing,
        }),
    ] {
        let read = doc.read_model_for_edit().unwrap();
        let before = cp(&mut doc);
        assert!(doc
            .insert_grid_models_relative(
                &read.base,
                &[
                    command(GridModelTarget::BeforeRow(rt(&a, 0)), row("candidate", 2)),
                    command(target, row("bad", 2))
                ],
                EditOptions::default(),
                2.
            )
            .is_err());
        assert_eq!(cp(&mut doc), before);
        run(&mut doc, &read.base, &[]);
    }
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_models_relative(
            &read.base,
            &[RelativeModelInsert {
                target: RelativeModelTarget::Before(a.rows[0].clone()),
                model: p("bad")
            }],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    assert!(doc
        .reparent_block(&a.rows[0], None, None, EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
    run(
        &mut doc,
        &read.base,
        &[command(
            GridModelTarget::InsideCellStart(ct(&a, 0, 0)),
            p("valid"),
        )],
    );
}

#[test]
fn current_covered_cells_reject_but_anchor_and_row_span_growth_keep_payload() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 2, 2);
    doc.merge_cells(
        &g.key,
        &g.rows[0],
        &g.cols[0],
        &g.rows[1],
        &g.cols[1],
        EditOptions::default(),
        2.,
    )
    .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(
            &read.base,
            &[command(
                GridModelTarget::InsideCellEnd(ct(&g, 1, 1)),
                p("bad")
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    run(
        &mut doc,
        &read.base,
        &[command(
            GridModelTarget::InsideCellEnd(ct(&g, 0, 0)),
            p("anchor"),
        )],
    );
    let read = doc.read_model_for_edit().unwrap();
    let payload = row("retained", 2);
    let out = run(
        &mut doc,
        &read.base,
        &[command(GridModelTarget::BeforeRow(rt(&g, 1)), payload)],
    );
    let model = doc.model().unwrap();
    let rows = &model["children"][1]["children"];
    assert_eq!(rows[0]["children"][0]["attrs"]["rowspan"], 3);
    assert_eq!(rows[1]["children"][0]["attrs"]["spanned"], true);
    assert_eq!(
        text(&rows[1]["children"][0]["children"][0]["children"][0]),
        "retained".encode_utf16().collect::<Vec<_>>()
    );
    let newrow = out.keys[0].clone().unwrap();
    let read2 = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(
            &read2.base,
            &[command(
                GridModelTarget::InsideCellStart(GridCellTarget {
                    grid: g.key.clone(),
                    row: newrow,
                    column: g.cols[0].clone()
                }),
                p("bad")
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), read.model);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), model);
}

#[test]
fn peer_axes_consume_base_even_below_max_and_fresh_tuples_keep_original_row() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 2, 2);
    let mut peer = RuntimeDocument::new("B", schema()).unwrap();
    for change in doc.pending_changes() {
        peer.apply_remote(&change.ops).unwrap();
    }
    let read = doc.read_model_for_edit().unwrap();
    let peerbase = peer.read_model_for_edit().unwrap();
    let out = run(
        &mut peer,
        &peerbase.base,
        &[command(
            GridModelTarget::BeforeRow(rt(&g, 0)),
            row("peer", 2),
        )],
    );
    doc.apply_remote(&out.change.ops).unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(&read.base, &[], EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let fresh = doc.read_model_for_edit().unwrap();
    run(
        &mut doc,
        &fresh.base,
        &[command(
            GridModelTarget::InsideCellEnd(ct(&g, 0, 1)),
            p("original row"),
        )],
    );
    let model = doc.model().unwrap();
    assert_eq!(
        text(&model["children"][1]["children"][1]["children"][1]["children"][0]["children"][1]),
        "original row".encode_utf16().collect::<Vec<_>>()
    );
    let fresh = doc.read_model_for_edit().unwrap();
    let clock = doc.observed_clock().unwrap();
    doc.apply_remote(&[Op::Delete {
        at: Ticket {
            lamport: 1,
            actor: "lower".into(),
        },
        ids: vec![g.cols[1].ticket().unwrap()],
    }])
    .unwrap();
    assert_eq!(doc.observed_clock().unwrap(), clock);
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(&fresh.base, &[], EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let fresh = doc.read_model_for_edit().unwrap();
    assert!(doc
        .insert_grid_models_relative(
            &fresh.base,
            &[command(
                GridModelTarget::InsideCellEnd(ct(&g, 0, 1)),
                p("deleted col")
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn nested_covered_deleted_and_last_axis_hidden_grids_reject_live_descendants() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let outer = add_grid(&mut doc, &[1], 2, 2);
    let inner = add_grid(&mut doc, &[1, 0, 1, 0, 1], 1, 1);
    let read = doc.read_model_for_edit().unwrap();
    run(
        &mut doc,
        &read.base,
        &[command(
            GridModelTarget::AfterRow(rt(&inner, 0)),
            row("nested", 1),
        )],
    );
    doc.merge_cells(
        &outer.key,
        &outer.rows[0],
        &outer.cols[0],
        &outer.rows[1],
        &outer.cols[1],
        EditOptions::default(),
        3.,
    )
    .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(
            &read.base,
            &[command(
                GridModelTarget::BeforeRow(rt(&inner, 0)),
                row("bad", 1)
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let g = add_grid(&mut doc, &[2], 1, 1);
    raw_delete(&mut doc, &g.key);
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(
            &read.base,
            &[command(
                GridModelTarget::BeforeRow(rt(&g, 0)),
                row("bad", 1)
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let g = add_grid(&mut doc, &[2], 1, 1);
    raw_delete(&mut doc, &g.cols[0]);
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(
            &read.base,
            &[command(
                GridModelTarget::BeforeRow(rt(&g, 0)),
                row("bad", 1)
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn empty_result_head_restore_retry_foreign_edit_and_rollback_guards() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 1, 1);
    let read = doc.read_model_for_edit().unwrap();
    let saved = doc.checkpoint().unwrap();
    let out = run(
        &mut doc,
        &read.base,
        &[
            command(GridModelTarget::InsideCellStart(ct(&g, 0, 0)), p("start")),
            command(GridModelTarget::AfterRow(rt(&g, 0)), row("new", 1)),
        ],
    );
    assert_eq!(
        out.keys[0],
        Some(RuntimeDocument::cell_head(&g.key, &g.rows[0], &g.cols[0]).unwrap())
    );
    let mut peer = RuntimeDocument::new("B", schema()).unwrap();
    for change in doc.pending_changes() {
        peer.apply_remote(&change.ops).unwrap();
    }
    let foreign = peer
        .insert_text_at(
            &Key::root(),
            None,
            "FOREIGN",
            Attributes::new(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    doc.apply_remote(&foreign.ops).unwrap();
    let with_foreign = doc.model().unwrap();
    doc = RuntimeDocument::restore(&doc.checkpoint().unwrap()).unwrap();
    doc.undo().unwrap();
    assert_eq!(
        text(&doc.model().unwrap()["children"][0]),
        "FOREIGN".encode_utf16().collect::<Vec<_>>()
    );
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), with_foreign);
    let before = cp(&mut doc);
    doc.apply_remote(&out.change.ops).unwrap();
    assert_eq!(cp(&mut doc), before);
    doc.restore_checkpoint(&saved).unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(&read.base, &[], EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let fresh = doc.read_model_for_edit().unwrap();
    let out = run(&mut doc, &fresh.base, &[]);
    assert!(out.change.ops.is_empty());
    assert!(doc
        .insert_grid_models_relative(&fresh.base, &[], EditOptions::default(), 2.)
        .is_err());
}

#[test]
fn span_and_spanned_row_payload_keeps_existing_numeric_row_normalization() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 2, 2);
    doc.merge_cells(
        &g.key,
        &g.rows[0],
        &g.cols[0],
        &g.rows[1],
        &g.cols[1],
        EditOptions::default(),
        2.,
    )
    .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let mut numeric = RuntimeDocument::restore(&doc.checkpoint().unwrap()).unwrap();
    let mut payload = row("retained span", 3);
    payload["children"][0]["attrs"] = json!({"rowspan":2,"colspan":1,"spanned":true});
    let expected = numeric
        .insert_models_batch(
            &[ModelInsert {
                at: vec![1, 1],
                model: payload.clone(),
            }],
            EditOptions::default(),
            2.,
        )
        .unwrap();
    let actual = run(
        &mut doc,
        &read.base,
        &[command(GridModelTarget::BeforeRow(rt(&g, 1)), payload)],
    );
    assert_eq!(actual, expected);
    assert_eq!(doc.model().unwrap(), numeric.model().unwrap());
    assert_eq!(cp(&mut doc), cp(&mut numeric));
    assert_eq!(
        doc.model().unwrap()["children"][1]["children"][1]["children"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn normalized_empty_cell_body_result_reserves_clock_and_restores_without_fake_key() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 1, 1);
    doc.reparent_block(&g.key, None, None, EditOptions::default(), 2.)
        .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let out = run(
        &mut doc,
        &read.base,
        &[command(
            GridModelTarget::InsideCellStart(ct(&g, 0, 0)),
            json!({"type":"g","children":[]}),
        )],
    );
    assert_eq!(out.keys, vec![None]);
    assert!(out.change.ops.is_empty());
    assert_eq!(out.clock_after, out.clock_before + 1);
    assert_eq!(doc.model().unwrap(), read.model);
    let saved = doc.checkpoint().unwrap();
    doc = RuntimeDocument::restore(&saved).unwrap();
    assert_eq!(doc.observed_clock().unwrap(), out.clock_after);
    assert_eq!(
        doc.checkpoint().unwrap().to_json().unwrap(),
        saved.to_json().unwrap()
    );
    assert!(doc
        .insert_grid_models_relative(&read.base, &[], EditOptions::default(), 2.)
        .is_err());
}

#[test]
fn cardinality_hidden_grid_and_moved_grid_follow_current_ancestry_only() {
    let mut descriptor = schema().manifest().clone();
    descriptor["nodes"]["doc"]["childRules"] = json!({"g":{"max":1}});
    let mut doc = RuntimeDocument::new("A", RuntimeSchema::compile(descriptor).unwrap()).unwrap();
    let visible = add_grid(&mut doc, &[1], 1, 1);
    let hidden = add_grid(&mut doc, &[2], 1, 1);
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(
            &read.base,
            &[command(
                GridModelTarget::BeforeRow(rt(&hidden, 0)),
                row("bad", 1)
            )],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let owner = doc
        .insert_model_at(
            &[2],
            json!({"type":"box","children":[]}),
            EditOptions::default(),
            2.,
        )
        .unwrap()
        .0;
    let old = doc.read_model_for_edit().unwrap();
    doc.reparent_block(&visible.key, Some(&owner), None, EditOptions::default(), 3.)
        .unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_grid_models_relative(&old.base, &[], EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let fresh = doc.read_model_for_edit().unwrap();
    run(
        &mut doc,
        &fresh.base,
        &[command(
            GridModelTarget::AfterRow(rt(&visible, 0)),
            row("followed", 1),
        )],
    );
    let model = doc.model().unwrap();
    let owner = model["children"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| node["type"] == "box")
        .unwrap();
    let moved = owner["children"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| node["type"] == "g")
        .unwrap();
    assert_eq!(moved["children"].as_array().unwrap().len(), 2);
    assert_eq!(
        text(&moved["children"][1]["children"][0]["children"][0]["children"][0]),
        "followed".encode_utf16().collect::<Vec<_>>()
    );
}
