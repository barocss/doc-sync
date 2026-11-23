use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box","list","table"],"default":"p"},
        "p":{"shape":"text"},"box":{"shape":"flow","children":["p","box","list","table"],"default":"p"},
        "list":{"shape":"group","children":["item"],"by":["bucket"]},
        "item":{"shape":"text","attrs":{"bucket":{"default":"plain"}}},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["p"],"default":"p"}
    }})).unwrap()
}
fn p(s: &str) -> Value {
    json!({"type":"p","runs":[{"text":s}]})
}

fn add(doc: &mut RuntimeDocument, at: &[usize], model: Value) -> Key {
    doc.insert_model_at(at, model, EditOptions::default(), 1.)
        .unwrap()
        .0
}
fn at<'a>(mut node: &'a Value, path: &[usize]) -> &'a Value {
    for i in path {
        node = &node["children"][*i];
    }
    node
}
fn check_paths(read: &ModelCatalogRead) {
    for b in &read.catalog.blocks {
        assert_eq!(at(&read.model, &b.path)["type"], b.node_type);
        assert!(b.key.ticket().unwrap().lamport > 0);
    }
    for g in &read.catalog.grids {
        for c in &g.cells {
            assert_eq!(c.target.grid, g.grid);
            assert!(g.rows.contains(&c.target.row));
            assert!(g.columns.contains(&c.target.column));
            assert_eq!(at(&read.model, &c.body_path)["type"], "body");
        }
    }
}
fn table() -> Value {
    json!({"type":"table","children":(0..2).map(|_|json!({"type":"row","children":(0..2).map(|_|json!({"type":"cell","children":[{"type":"body","children":[p("cell")]}]})).collect::<Vec<_>>()})).collect::<Vec<_>>()})
}
#[test]
fn empty_and_stored_default_and_read_purity() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let before = d.checkpoint().unwrap().to_json().unwrap();
    let empty = d.read_model_with_catalog().unwrap();
    assert!(empty.catalog.blocks.is_empty());
    assert!(empty.catalog.grids.is_empty());
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
    let k = add(&mut d, &[1], p("stored"));
    let before = d.checkpoint().unwrap().to_json().unwrap();
    let a = d.read_model_with_catalog().unwrap();
    let b = d.read_model_with_catalog().unwrap();
    assert_eq!(a.base, b.base);
    assert_eq!(a.catalog, b.catalog);
    assert_eq!(a.model, b.model);
    assert_eq!(d.checkpoint().unwrap().to_json().unwrap(), before);
    check_paths(&a);
    assert_eq!(a.catalog.blocks.len(), 1);
    assert_eq!(a.catalog.blocks[0].key, k);
    assert_eq!(a.catalog.blocks[0].path, vec![1]);
    d.insert_models_relative(
        &a.base,
        &[RelativeModelInsert {
            target: RelativeModelTarget::After(k),
            model: p("next"),
        }],
        EditOptions::default(),
        2.,
    )
    .unwrap();
}
#[test]
fn group_members_and_moved_flow_paths() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let a = add(&mut d, &[1], json!({"type":"box","children":[]}));
    let _stored = add(&mut d, &[1, 1], p("inside"));
    let b = add(&mut d, &[2], json!({"type":"box","children":[]}));
    let r = d.read_model_with_catalog().unwrap();
    let inner = r
        .catalog
        .blocks
        .iter()
        .find(|n| n.path.starts_with(&[1]) && n.key != a)
        .unwrap()
        .key
        .clone();
    d.reparent_block(&inner, Some(&b), None, EditOptions::default(), 2.)
        .unwrap();
    add(
        &mut d,
        &[3],
        json!({"type":"list","children":[{"type":"item","runs":[{"text":"one"}]},{"type":"item","runs":[{"text":"two"}]}]}),
    );
    let r = d.read_model_with_catalog().unwrap();
    check_paths(&r);
    assert!(r
        .catalog
        .blocks
        .iter()
        .find(|n| n.key == inner)
        .unwrap()
        .path
        .starts_with(&[2]));
    assert_eq!(
        r.catalog
            .blocks
            .iter()
            .filter(|n| n.node_type == "item" && n.path.len() == 2)
            .count(),
        2
    );
    assert!(!r.catalog.blocks.iter().any(|n| n.node_type == "list"));
    assert!(r
        .catalog
        .blocks
        .iter()
        .filter(|n| n.node_type == "box")
        .all(|n| n.inside_flow));
}
#[test]
fn owned_grid_catalog_drives_column_and_cell_commands() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let key = add(&mut d, &[1], table());
    add(&mut d, &[2], table());
    let r = d.read_model_with_catalog().unwrap();
    check_paths(&r);
    let g = r.catalog.grids.iter().find(|g| g.grid == key).unwrap();
    assert_eq!(g.rows.len(), 2);
    assert_eq!(g.columns.len(), 2);
    assert_eq!(g.cells.len(), 4);
    let rows = g.rows.clone();
    let result = d
        .insert_column_relative(
            &r.base,
            &ColumnInsert {
                grid: key.clone(),
                boundary: ColumnBoundary::Before(g.columns[0].clone()),
                cells: vec![],
            },
            EditOptions::default(),
            2.,
        )
        .unwrap();
    let r = d.read_model_with_catalog().unwrap();
    let g = r.catalog.grids.iter().find(|g| g.grid == key).unwrap();
    assert_eq!(g.rows, rows);
    assert_eq!(g.columns[0], result.keys[0].clone().unwrap());
    d.insert_grid_models_relative(
        &r.base,
        &[GridModelInsert {
            target: GridModelTarget::InsideCellEnd(g.cells[0].target.clone()),
            model: p("round trip"),
        }],
        EditOptions::default(),
        3.,
    )
    .unwrap();
}
#[test]
fn merged_covered_descendants_and_deleted_grid_are_absent() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let key = add(&mut d, &[1], table());
    let mut stored = vec![];
    for row in 0..2 {
        for col in 0..2 {
            stored.push(add(&mut d, &[1, row, col, 0, 1], p("stored")));
        }
    }
    let r = d.read_model_with_catalog().unwrap();
    assert_eq!(
        r.catalog.blocks.iter().filter(|b| b.path.len() > 1).count(),
        4
    );
    let g = &r.catalog.grids[0];
    d.merge_cells(
        &key,
        &g.rows[0],
        &g.columns[0],
        &g.rows[1],
        &g.columns[1],
        EditOptions::default(),
        2.,
    )
    .unwrap();
    let r = d.read_model_with_catalog().unwrap();
    check_paths(&r);
    assert_eq!(r.catalog.grids[0].cells.len(), 1);
    assert_eq!(
        r.catalog.blocks.iter().filter(|b| b.path.len() > 1).count(),
        1
    );
    assert!(r.catalog.blocks.iter().any(|b| b.key == stored[0]));
    assert!(stored[1..]
        .iter()
        .all(|key| !r.catalog.blocks.iter().any(|b| &b.key == key)));
    let at = d.next_ticket().unwrap();
    d.record(
        vec![Op::Delete {
            at,
            ids: vec![key.ticket().unwrap()],
        }],
        EditOptions::default(),
        3.,
    )
    .unwrap();
    let r = d.read_model_with_catalog().unwrap();
    assert!(r.catalog.grids.is_empty());
    assert!(!r
        .catalog
        .blocks
        .iter()
        .any(|b| b.key == key || b.path.len() > 1));
}
#[test]
fn lower_clock_remote_edit_and_restore_invalidate_base() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    add(&mut d, &[1], p(&"x".repeat(100)));
    let r = d.read_model_with_catalog().unwrap();
    let clock = d.observed_clock().unwrap();
    d.apply_remote(&[Op::Text {
        id: Ticket {
            lamport: 1,
            actor: "B".into(),
        },
        origin: Key::root().ticket().unwrap(),
        units: Utf16Text::from("foreign"),
        marks: Attributes::new(),
    }])
    .unwrap();
    assert_eq!(d.observed_clock().unwrap(), clock);
    assert!(d
        .insert_models_relative(&r.base, &[], EditOptions::default(), 2.)
        .is_err());
    let fresh = d.read_model_with_catalog().unwrap();
    d = RuntimeDocument::restore(&d.checkpoint().unwrap()).unwrap();
    assert!(d
        .insert_models_relative(&fresh.base, &[], EditOptions::default(), 2.)
        .is_err());
    check_paths(&d.read_model_with_catalog().unwrap());
}
