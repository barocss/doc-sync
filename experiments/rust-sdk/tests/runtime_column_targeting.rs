use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box","g"],"default":"p"},"p":{"shape":"text"},
        "box":{"shape":"flow","children":["p","g"],"default":"p"},
        "g":{"shape":"grid","children":["r"]},"r":{"shape":"row","children":["c"]},
        "c":{"shape":"cell","children":["b"],"attrs":{"color":{"default":"none"}}},"b":{"shape":"flow","children":["p","g"],"default":"p"}
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
fn payload(g: &Grid, row: usize, text: &str) -> RowCellPayload {
    RowCellPayload {
        row: g.rows[row].clone(),
        model: cell(text),
    }
}
fn command(g: &Grid, boundary: ColumnBoundary, cells: Vec<RowCellPayload>) -> ColumnInsert {
    ColumnInsert {
        grid: g.key.clone(),
        boundary,
        cells,
    }
}
fn run(
    doc: &mut RuntimeDocument,
    base: &ModelEditBase,
    command: &ColumnInsert,
) -> ModelInsertBatchResult {
    doc.insert_column_relative(base, command, EditOptions::default(), 2.)
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
fn projection(doc: &mut RuntimeDocument, key: &Key) -> Value {
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
fn all_boundaries_create_one_axis_and_preserve_caller_order_partial_rows() {
    for (name, c) in [("start", 0), ("end", 2), ("before", 1), ("after", 1)] {
        let mut doc = RuntimeDocument::new("A", schema()).unwrap();
        let g = add_grid(&mut doc, &[1], 3, 2);
        let read = doc.read_model_for_edit().unwrap();
        let pending = doc.pending_changes().len();
        let boundary = match name {
            "start" => ColumnBoundary::Start,
            "end" => ColumnBoundary::End,
            "before" => ColumnBoundary::Before(g.cols[1].clone()),
            _ => ColumnBoundary::After(g.cols[0].clone()),
        };
        let out = run(
            &mut doc,
            &read.base,
            &command(
                &g,
                boundary,
                vec![payload(&g, 2, "LAST"), payload(&g, 0, "FIRST")],
            ),
        );
        assert_eq!(out.keys.len(), 1);
        let key = out.keys[0].as_ref().unwrap();
        assert!(key.ticket().unwrap().lamport > 0);
        let mut expected = g.cols.iter().map(Key::as_str).collect::<Vec<_>>();
        expected.insert(c, key.as_str());
        let projected = projection(&mut doc, &g.key);
        assert_eq!(projected["cols"], json!(expected));
        assert_eq!(
            projected["rows"],
            json!(g.rows.iter().map(Key::as_str).collect::<Vec<_>>())
        );
        let model = doc.model().unwrap();
        let rows = &model["children"][1]["children"];
        assert_eq!(
            text(&rows[2]["children"][c]["children"][0]["children"][0]),
            "LAST".encode_utf16().collect::<Vec<_>>()
        );
        assert_eq!(
            text(&rows[0]["children"][c]["children"][0]["children"][0]),
            "FIRST".encode_utf16().collect::<Vec<_>>()
        );
        assert!(text(&rows[1]["children"][c]["children"][0]["children"][0]).is_empty());
        let texts = out
            .change
            .ops
            .iter()
            .filter_map(|op| match op.raw_operation() {
                Op::Text { units, .. } => Some(units.0.clone()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(
            texts,
            vec![
                "LAST".encode_utf16().collect::<Vec<_>>(),
                "FIRST".encode_utf16().collect::<Vec<_>>()
            ]
        );
        assert_eq!(doc.pending_changes().len(), pending + 1);
        doc.undo().unwrap();
        assert_eq!(doc.model().unwrap(), read.model);
        doc.redo().unwrap();
        assert_eq!(doc.model().unwrap(), model);
    }
}

#[test]
fn empty_seed_is_real_column_with_no_body_writes_and_projection_preparation_is_allowed() {
    for moved in [false, true] {
        let mut doc = RuntimeDocument::new("A", schema()).unwrap();
        let g = add_grid(&mut doc, &[1], 2, 2);
        if moved {
            doc.reparent_block(&g.key, None, None, EditOptions::default(), 2.)
                .unwrap();
        }
        let read = doc.read_model_for_edit().unwrap();
        let out = run(
            &mut doc,
            &read.base,
            &command(&g, ColumnBoundary::Start, vec![]),
        );
        assert_eq!(out.keys.len(), 1);
        assert!(out.keys[0].is_some());
        assert!(!out
            .change
            .ops
            .iter()
            .any(|op| matches!(op.raw_operation(), Op::Text { .. } | Op::Set { .. })));
        if !moved {
            assert_eq!(out.change.ops.len(), 1);
            assert_eq!(out.clock_after, out.clock_before + 1);
        }
        let model = doc.model().unwrap();
        doc = RuntimeDocument::restore(&doc.checkpoint().unwrap()).unwrap();
        assert_eq!(doc.model().unwrap(), model);
        doc.undo().unwrap();
        assert_eq!(doc.model().unwrap(), read.model);
        doc.redo().unwrap();
        assert_eq!(doc.model().unwrap(), model);
    }
}

#[test]
fn duplicates_wrong_owned_axes_and_later_bad_payload_preserve_redo_and_base() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let a = add_grid(&mut doc, &[1], 2, 2);
    let b = add_grid(&mut doc, &[2], 2, 2);
    doc.insert_model_at(&[3], p("redo"), EditOptions::default(), 1.)
        .unwrap();
    doc.undo().unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    for request in [
        command(
            &a,
            ColumnBoundary::Start,
            vec![payload(&a, 0, "first"), payload(&a, 0, "equal")],
        ),
        command(
            &a,
            ColumnBoundary::Start,
            vec![
                RowCellPayload {
                    row: a.rows[0].clone(),
                    model: json!({"type":"c","children":[]}),
                },
                RowCellPayload {
                    row: a.rows[0].clone(),
                    model: json!({"type":"c","children":[]}),
                },
            ],
        ),
        command(
            &a,
            ColumnBoundary::Before(b.cols[0].clone()),
            vec![payload(&a, 0, "bad")],
        ),
        command(&a, ColumnBoundary::Start, vec![payload(&b, 0, "wrong row")]),
        command(&a, ColumnBoundary::Before(a.rows[0].clone()), vec![]),
        command(&a, ColumnBoundary::After(Key::root()), vec![]),
        command(
            &a,
            ColumnBoundary::Start,
            vec![
                payload(&a, 0, "valid"),
                RowCellPayload {
                    row: a.rows[1].clone(),
                    model: p("wrong type"),
                },
            ],
        ),
    ] {
        assert!(doc
            .insert_column_relative(&read.base, &request, EditOptions::default(), 2.)
            .is_err());
        assert_eq!(cp(&mut doc), before);
    }
    assert!(doc.history_status().unwrap().can_redo);
    run(
        &mut doc,
        &read.base,
        &command(&a, ColumnBoundary::End, vec![]),
    );
}

#[test]
fn nested_payload_columns_do_not_count_as_target_columns_and_spanned_does_not_write_span() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 2, 2);
    let read = doc.read_model_for_edit().unwrap();
    let mut nested = cell("head");
    nested["children"][0]["children"]
        .as_array_mut()
        .unwrap()
        .push(grid(2, 3));
    nested["attrs"] = json!({"spanned":true,"color":"blue"});
    let out = run(
        &mut doc,
        &read.base,
        &command(
            &g,
            ColumnBoundary::Before(g.cols[1].clone()),
            vec![
                RowCellPayload {
                    row: g.rows[1].clone(),
                    model: nested,
                },
                payload(&g, 0, "other"),
            ],
        ),
    );
    assert_eq!(out.keys.len(), 1);
    assert_eq!(
        projection(&mut doc, &g.key)["cols"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        out.change
            .ops
            .iter()
            .filter(|op| matches!(op.raw_operation(),Op::Node{node_type,..} if node_type=="col"))
            .count(),
        4
    );
    assert!(!out
        .change
        .ops
        .iter()
        .any(|op| matches!(op.raw_operation(),Op::Set{key,..} if key.starts_with("$span:"))));
    let model = doc.model().unwrap();
    assert_eq!(
        model["children"][1]["children"][1]["children"][1]["attrs"]["color"],
        "blue"
    );
}

#[test]
fn existing_merge_growth_keeps_covered_payload_and_caller_order_controls_new_overlap() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 3, 2);
    doc.merge_cells(
        &g.key,
        &g.rows[0],
        &g.cols[0],
        &g.rows[2],
        &g.cols[1],
        EditOptions::default(),
        1.,
    )
    .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    run(
        &mut doc,
        &read.base,
        &command(
            &g,
            ColumnBoundary::Before(g.cols[1].clone()),
            vec![payload(&g, 1, "HIDDEN")],
        ),
    );
    let model = doc.model().unwrap();
    let rows = &model["children"][1]["children"];
    assert_eq!(rows[0]["children"][0]["attrs"]["colspan"], 3);
    assert_eq!(rows[1]["children"][1]["attrs"]["spanned"], true);
    assert_eq!(
        text(&rows[1]["children"][1]["children"][0]["children"][0]),
        "HIDDEN".encode_utf16().collect::<Vec<_>>()
    );
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), read.model);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), model);
    for reverse in [false, true] {
        let mut doc = RuntimeDocument::new("A", schema()).unwrap();
        let g = add_grid(&mut doc, &[1], 3, 2);
        let read = doc.read_model_for_edit().unwrap();
        let mut top = payload(&g, 0, "top");
        top.model["attrs"] = json!({"rowspan":3,"colspan":1});
        let mut middle = payload(&g, 1, "middle");
        middle.model["attrs"] = json!({"rowspan":2,"colspan":1});
        let cells = if reverse {
            vec![middle, top]
        } else {
            vec![top, middle]
        };
        run(
            &mut doc,
            &read.base,
            &command(&g, ColumnBoundary::Start, cells),
        );
        let model = doc.model().unwrap();
        let rows = &model["children"][1]["children"];
        if reverse {
            assert_eq!(rows[0]["children"][0]["attrs"]["rowspan"], 3);
            assert_eq!(rows[1]["children"][0]["attrs"]["spanned"], true);
        } else {
            assert_eq!(rows[0]["children"][0]["attrs"].get("rowspan"), None);
            assert_eq!(rows[1]["children"][0]["attrs"]["rowspan"], 2);
        }
    }
}

#[test]
fn fresh_calls_create_distinct_columns_and_returned_key_supports_owned_cell_target() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 2, 2);
    let firstbase = doc.read_model_for_edit().unwrap();
    let first = run(
        &mut doc,
        &firstbase.base,
        &command(&g, ColumnBoundary::Before(g.cols[1].clone()), vec![]),
    );
    let before = cp(&mut doc);
    assert!(doc
        .insert_column_relative(
            &firstbase.base,
            &command(&g, ColumnBoundary::End, vec![]),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let fresh = doc.read_model_for_edit().unwrap();
    let second = run(
        &mut doc,
        &fresh.base,
        &command(&g, ColumnBoundary::Before(g.cols[1].clone()), vec![]),
    );
    assert_ne!(first.keys, second.keys);
    assert_eq!(
        projection(&mut doc, &g.key)["cols"],
        json!([
            g.cols[0].as_str(),
            first.keys[0].as_ref().unwrap().as_str(),
            second.keys[0].as_ref().unwrap().as_str(),
            g.cols[1].as_str()
        ])
    );
    let fresh = doc.read_model_for_edit().unwrap();
    let col = first.keys[0].clone().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_models_relative(
            &fresh.base,
            &[RelativeModelInsert {
                target: RelativeModelTarget::Before(col.clone()),
                model: p("bad")
            }],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    doc.insert_grid_models_relative(
        &fresh.base,
        &[GridModelInsert {
            target: GridModelTarget::InsideCellStart(GridCellTarget {
                grid: g.key,
                row: g.rows[0].clone(),
                column: col,
            }),
            model: p("typed"),
        }],
        EditOptions::default(),
        2.,
    )
    .unwrap();
}

#[test]
fn stale_peer_axes_and_hidden_or_deleted_owners_never_fall_back() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let outer = add_grid(&mut doc, &[1], 2, 2);
    let nested = add_grid(&mut doc, &[1, 0, 1, 0, 1], 1, 1);
    let read = doc.read_model_for_edit().unwrap();
    let clock = doc.observed_clock().unwrap();
    doc.apply_remote(&[Op::Delete {
        at: Ticket {
            lamport: 1,
            actor: "low".into(),
        },
        ids: vec![outer.cols[1].ticket().unwrap()],
    }])
    .unwrap();
    assert_eq!(doc.observed_clock().unwrap(), clock);
    let before = cp(&mut doc);
    assert!(doc
        .insert_column_relative(
            &read.base,
            &command(&outer, ColumnBoundary::Start, vec![]),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let fresh = doc.read_model_for_edit().unwrap();
    assert!(doc
        .insert_column_relative(
            &fresh.base,
            &command(&nested, ColumnBoundary::Start, vec![]),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let g = add_grid(&mut doc, &[2], 1, 1);
    raw_delete(&mut doc, &g.key);
    let fresh = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_column_relative(
            &fresh.base,
            &command(&g, ColumnBoundary::Start, vec![]),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let g = add_grid(&mut doc, &[2], 1, 1);
    raw_delete(&mut doc, &g.cols[0]);
    let fresh = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_column_relative(
            &fresh.base,
            &command(&g, ColumnBoundary::Start, vec![]),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn clock_exhaustion_after_column_birth_leaves_redo_checkpoint_and_base_intact() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let g = add_grid(&mut doc, &[1], 1, 1);
    doc.insert_model_at(&[2], p("redo"), EditOptions::default(), 1.)
        .unwrap();
    doc.undo().unwrap();
    let mut saved: Value = serde_json::from_str(&cp(&mut doc)).unwrap();
    let reserved = 9_007_199_254_740_990u64;
    saved["native"]["document"]["clock"] = json!(reserved);
    saved["native"]["document"]["reservedClock"] = json!(reserved);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved.to_string()).unwrap())
        .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_column_relative(
            &read.base,
            &command(&g, ColumnBoundary::End, vec![payload(&g, 0, "late text")]),
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    assert!(doc.history_status().unwrap().can_redo);
    let out = run(
        &mut doc,
        &read.base,
        &command(&g, ColumnBoundary::End, vec![]),
    );
    assert_eq!(out.clock_after, reserved + 1);
}

#[test]
fn foreign_tokens_hidden_by_axis_undo_survive_both_actor_orders_checkpoint_and_retry() {
    for peer_undo_first in [false, true] {
        let mut a = RuntimeDocument::new("A", schema()).unwrap();
        let g = add_grid(&mut a, &[1], 2, 2);
        let mut b = RuntimeDocument::new("B", schema()).unwrap();
        for change in a.pending_changes() {
            b.apply_remote(&change.ops).unwrap();
        }
        let read = a.read_model_for_edit().unwrap();
        let inserted = run(
            &mut a,
            &read.base,
            &command(&g, ColumnBoundary::End, vec![]),
        );
        let column = inserted.keys[0].clone().unwrap();
        b.apply_remote(&inserted.change.ops).unwrap();
        let foreign = b
            .insert_cell_text(
                &g.key,
                &g.rows[0],
                &column,
                None,
                "FOREIGN",
                Attributes::new(),
                EditOptions::default(),
                3.,
            )
            .unwrap();
        let mut foreign_ids = vec![];
        for op in &foreign.ops {
            if let Op::Text { id, units, .. } = op.raw_operation() {
                for offset in 0..units.0.len() {
                    foreign_ids.push(Ticket {
                        lamport: id.lamport + offset as u64,
                        actor: id.actor.clone(),
                    });
                }
            }
        }
        assert_eq!(foreign_ids.len(), 7);
        a.apply_remote(&foreign.ops).unwrap();
        let visible = a.model().unwrap();
        if peer_undo_first {
            let undo = b.undo().unwrap();
            a.apply_remote(&undo.ops).unwrap();
        }
        let undo = a.undo().unwrap();
        b.apply_remote(&undo.ops).unwrap();
        let hidden = a.state().unwrap();
        for id in &foreign_ids {
            let token = hidden["items"]
                .as_array()
                .unwrap()
                .iter()
                .find(|token| token["id"] == json!(id))
                .unwrap();
            assert_eq!(token["visible"], !peer_undo_first);
            assert!(token["dels"]
                .as_array()
                .unwrap()
                .iter()
                .all(|stamp| !stamp.as_str().unwrap().ends_with("@A")));
            assert!(!undo.ops.iter().any(
                |op| matches!(op.raw_operation(), Op::Delete { ids, .. } if ids.contains(id))
            ));
        }
        if !peer_undo_first {
            let undo = b.undo().unwrap();
            a.apply_remote(&undo.ops).unwrap();
        }
        a = RuntimeDocument::restore(&a.checkpoint().unwrap()).unwrap();
        b = RuntimeDocument::restore(&b.checkpoint().unwrap()).unwrap();
        let redo = b.redo().unwrap();
        a.apply_remote(&redo.ops).unwrap();
        let redo = a.redo().unwrap();
        b.apply_remote(&redo.ops).unwrap();
        assert_eq!(a.model().unwrap(), visible);
        assert_eq!(b.model().unwrap(), visible);
        let before = cp(&mut a);
        a.apply_remote(&inserted.change.ops).unwrap();
        a.apply_remote(&foreign.ops).unwrap();
        assert_eq!(cp(&mut a), before);
    }
}
