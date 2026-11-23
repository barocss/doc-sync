use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"book","marks":["strong"],"nodes":{
        "book":{"shape":"flow","children":["line","box","matrix"],"default":"line"},
        "box":{"shape":"flow","children":["line","box","matrix"],"default":"line"},
        "line":{"shape":"text"},
        "matrix":{"shape":"grid","children":["band"],"attrs":{"tone":{"default":"plain"}}},
        "band":{"shape":"row","children":["tile"]},
        "tile":{"shape":"cell","children":["body"],"attrs":{"shade":{"default":"white"}}},
        "body":{"shape":"flow","children":["line","box","matrix"],"default":"line"}
    }}))
    .unwrap()
}
fn checkpoint(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn grid(d: &mut RuntimeDocument) -> (Key, Key, Key, Key, Key) {
    let (g, _) = d
        .insert_block(
            "matrix",
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    let (r, _) = d
        .insert_grid_row(
            &g,
            "band",
            None,
            Attributes::new(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    let (r2, _) = d
        .insert_grid_row(
            &g,
            "band",
            Some(&r),
            Attributes::new(),
            EditOptions::default(),
            3.,
        )
        .unwrap();
    let (c, _) = d
        .insert_grid_column(&g, None, EditOptions::default(), 4.)
        .unwrap();
    let (c2, _) = d
        .insert_grid_column(&g, Some(&c), EditOptions::default(), 5.)
        .unwrap();
    (g, r, r2, c, c2)
}
fn find_type<'a>(v: &'a Value, kind: &str) -> Option<&'a Value> {
    if v["type"] == kind {
        return Some(v);
    }
    v["children"]
        .as_array()?
        .iter()
        .find_map(|v| find_type(v, kind))
}
#[test]
fn renamed_grid_cell_content_spans_and_nested_grid() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (g, r, r2, c, c2) = grid(&mut d);
    d.insert_cell_text(
        &g,
        &r,
        &c,
        None,
        "x😀",
        Attributes::new(),
        EditOptions::default(),
        6.,
    )
    .unwrap();
    d.set_cell_attribute(
        &g,
        &r,
        &c,
        "shade",
        json!("blue"),
        EditOptions::default(),
        7.,
    )
    .unwrap();
    let before = d.model().unwrap();
    assert!(find_type(&before, "matrix").is_some());
    assert_eq!(
        find_type(&before, "tile").unwrap()["attrs"]["shade"],
        "blue"
    );
    assert_eq!(
        find_type(find_type(&before, "tile").unwrap(), "line").unwrap()["runs"][0]["units"],
        json!([120, 55357, 56832])
    );
    d.merge_cells(&g, &r, &c, &r2, &c2, EditOptions::default(), 8.)
        .unwrap();
    let merged = d.model().unwrap();
    assert_eq!(find_type(&merged, "tile").unwrap()["attrs"]["colspan"], 2);
    d.split_cell(&g, &r, &c, EditOptions::default(), 9.)
        .unwrap();
    assert_eq!(d.model().unwrap(), before);
    let (nested, _) = d
        .insert_cell_block(
            &g,
            &r2,
            &c2,
            "matrix",
            None,
            None,
            Attributes::new(),
            EditOptions::default(),
            10.,
        )
        .unwrap();
    let (nr, _) = d
        .insert_grid_row(
            &nested,
            "band",
            None,
            Attributes::new(),
            EditOptions::default(),
            11.,
        )
        .unwrap();
    let (nc, _) = d
        .insert_grid_column(&nested, None, EditOptions::default(), 12.)
        .unwrap();
    d.insert_cell_text(
        &nested,
        &nr,
        &nc,
        None,
        "deep",
        Attributes::new(),
        EditOptions::default(),
        13.,
    )
    .unwrap();
    assert!(d.model().unwrap().to_string().contains("100,101,101,112"));
}
#[test]
fn grid_restart_pending_history_and_axis_delete() {
    let mut a = RuntimeDocument::new("A", schema()).unwrap();
    let (g, r, _, c, c2) = grid(&mut a);
    a.insert_cell_text(
        &g,
        &r,
        &c,
        None,
        "retained",
        Attributes::new(),
        EditOptions::default(),
        6.,
    )
    .unwrap();
    let model = a.model().unwrap();
    a.delete(&[c2], EditOptions::default(), 7.).unwrap();
    a.undo().unwrap();
    assert_eq!(a.model().unwrap(), model);
    a.redo().unwrap();
    let model = a.model().unwrap();
    let pending = a.pending_changes().to_vec();
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint(&mut a)).unwrap())
            .unwrap();
    assert_eq!(restored.model().unwrap(), model);
    assert_eq!(restored.pending_changes(), pending);
    let before = checkpoint(&mut restored);
    for change in &pending {
        restored.apply_remote(&change.ops).unwrap();
    }
    assert_eq!(checkpoint(&mut restored), before);
    restored.acknowledge(&pending[..1]).unwrap();
    let mut peer = RuntimeDocument::new("B", schema()).unwrap();
    for change in &pending {
        peer.apply_remote(&change.ops).unwrap();
    }
    assert_eq!(peer.model().unwrap(), model);
}
#[test]
fn grid_invalid_cell_anchor_span_and_attribute_are_atomic() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (g, r, _, c, _) = grid(&mut d);
    let before = checkpoint(&mut d);
    assert!(d
        .insert_cell_text(
            &g,
            &r,
            &c,
            Some(&g),
            "bad",
            Attributes::new(),
            EditOptions::default(),
            6.
        )
        .is_err());
    assert!(d
        .set_cell_attribute(
            &g,
            &r,
            &c,
            "unknown",
            json!(true),
            EditOptions::default(),
            7.
        )
        .is_err());
    assert!(d
        .merge_cells(&g, &r, &c, &c, &r, EditOptions::default(), 8.)
        .is_err());
    assert_eq!(checkpoint(&mut d), before);
}

#[test]
fn grouped_grid_helper_derives_each_chain_and_restores_two_peer_state() {
    let schema=RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","first","second"],"default":"p"},
        "p":{"shape":"text"},
        "first":{"shape":"grid","children":["r1"]},"r1":{"shape":"row","children":["c1"]},"c1":{"shape":"cell","children":["b1"]},
        "b1":{"shape":"flow","children":["p","second"],"default":"p"},
        "second":{"shape":"grid","children":["r2"]},"r2":{"shape":"row","children":["c2"]},"c2":{"shape":"cell","children":["b2"]},
        "b2":{"shape":"flow","children":["p"],"default":"p"}
    }})).unwrap();
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    let (g, rows, cols, change) = a
        .insert_grid_at(
            &Key::root(),
            "first",
            None,
            2,
            3,
            Attributes::new(),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    assert_eq!(change.ops.len(), 6);
    assert!(matches!(&change.ops[1],Op::Node {node_type,..} if node_type=="r1"));
    let head = RuntimeDocument::cell_head(&g, &rows[0], &cols[0]).unwrap();
    let (nested, nr, nc, change) = a
        .insert_grid_at(
            &head,
            "second",
            None,
            3,
            1,
            Attributes::new(),
            EditOptions::default(),
            2.,
        )
        .unwrap();
    assert_eq!(change.ops.len(), 5);
    assert!(matches!(&change.ops[1],Op::Node {node_type,..} if node_type=="r2"));
    a.insert_cell_text(
        &nested,
        &nr[0],
        &nc[0],
        None,
        "x😀",
        Attributes::new(),
        EditOptions::default(),
        3.,
    )
    .unwrap();
    fn text_path(v: &Value, path: Vec<u64>) -> Option<Vec<u64>> {
        if v["runs"][0]["units"] == json!([120, 55357, 56832]) {
            return Some(path);
        }
        v["children"]
            .as_array()?
            .iter()
            .enumerate()
            .find_map(|(i, v)| {
                let mut child = path.clone();
                child.push(i as u64);
                text_path(v, child)
            })
    }
    let mut start = text_path(&a.model().unwrap(), vec![]).unwrap();
    start.push(0);
    let mut end = start.clone();
    *end.last_mut().unwrap() = 3;
    let range = Selection {
        anchor: Position(start),
        focus: Position(end),
    };
    let anchors = a.capture_selection(Some(range.clone())).unwrap();
    assert_eq!(a.resolve_selection(anchors).unwrap(), Some(range));
    for change in a.pending_changes() {
        b.apply_remote(&change.ops).unwrap();
    }
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let moved = a
        .reparent_block(
            &nested,
            None,
            Some(&Key::root()),
            EditOptions::default(),
            4.,
        )
        .unwrap();
    b.apply_remote(&moved.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
}

#[test]
fn grouped_grid_rejects_dimension_overflow_without_mutation() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let before = checkpoint(&mut d);
    for (rows, cols) in [
        (usize::MAX, 1),
        (1, usize::MAX),
        (usize::MAX, usize::MAX),
        (9_007_199_254_740_991usize, 1),
    ] {
        assert!(d
            .insert_grid_at(
                &Key::root(),
                "matrix",
                None,
                rows,
                cols,
                Attributes::new(),
                EditOptions::default(),
                1.
            )
            .is_err());
        assert_eq!(checkpoint(&mut d), before);
    }
}
