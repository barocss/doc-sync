use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"book","marks":[],
        "markValues":{"link":{"default":"","pattern":r"^(https?://\S+)?$"}},"nodes":{
        "book":{"shape":"flow","children":["line","grid"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "url":{"default":"","pattern":r"^(https?://\S+)?$"},
            "meta":{"default":{"nested":{"url":"","color":""}},"fields":{
                "nested":{"default":{"url":"","color":""},"fields":{
                    "url":{"default":"","pattern":r"^(https?://\S+)?$"},
                    "color":{"default":"","pattern":r"^(#[0-9a-fA-F]{6})?$"}}}}}}},
        "grid":{"shape":"grid","children":["row"]},
        "row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"],"attrs":{
            "color":{"default":"","pattern":r"^(#[0-9a-fA-F]{6})?$"}}},
        "body":{"shape":"flow","children":["line"],"default":"line"}}}))
    .unwrap()
}
fn opt() -> EditOptions {
    EditOptions::default()
}
fn checkpoint(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
fn ops(c: &Change) -> Vec<Op> {
    serde_json::from_str(&serde_json::to_string(&c.ops).unwrap()).unwrap()
}
fn seed(d: &mut RuntimeDocument) -> (Key, Key, Key, Key, Key) {
    let (line, _) = d
        .insert_block("line", None, None, Attributes::new(), opt(), 1.)
        .unwrap();
    let text = d
        .insert_text(Some(&line), "x", Attributes::new(), opt(), 2.)
        .unwrap();
    let token = Key::from_ticket(match &text.ops[0] {
        Op::Text { id, .. } => id,
        _ => panic!(),
    });
    let (grid, rows, cols, _) = d
        .insert_grid_at(
            &Key::root(),
            "grid",
            Some(&token),
            1,
            1,
            Attributes::new(),
            opt(),
            3.,
        )
        .unwrap();
    (line, token, grid, rows[0].clone(), cols[0].clone())
}
fn find<'a>(v: &'a Value, kind: &str) -> Option<&'a Value> {
    if v["type"] == kind {
        return Some(v);
    }
    v["children"].as_array()?.iter().find_map(|v| find(v, kind))
}

#[test]
fn product_patterns_accept_marks_cells_and_nested_leaves() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (line, token, grid, row, col) = seed(&mut d);
    for value in [
        "",
        "http://x",
        "https://example.test/a?q=1",
        "https://한글.example/😀",
        "https://\u{200b}",
    ] {
        d.format_tokens(&[token.clone()], "link", json!(value), opt(), 4.)
            .unwrap();
        d.set_field_path(&line, "meta", &["nested", "url"], json!(value), opt(), 5.)
            .unwrap();
        d.set_attribute(&line, "url", json!(value), opt(), 6.)
            .unwrap();
    }
    for value in ["", "#000000", "#aBcDeF", "#FFFFFF"] {
        d.set_cell_attribute(&grid, &row, &col, "color", json!(value), opt(), 7.)
            .unwrap();
        d.set_field_path(&line, "meta", &["nested", "color"], json!(value), opt(), 8.)
            .unwrap();
    }
    assert_eq!(
        find(&d.model().unwrap(), "cell").unwrap()["attrs"]["color"],
        "#FFFFFF"
    );
    d.format_tokens(&[token], "link", Value::Null, opt(), 9.)
        .unwrap();
    d.set_cell_attribute(&grid, &row, &col, "color", Value::Null, opt(), 10.)
        .unwrap();
    d.set_field_path(&line, "meta", &["nested", "color"], Value::Null, opt(), 11.)
        .unwrap();
    assert!(find(&d.model().unwrap(), "cell").unwrap()["attrs"]
        .get("color")
        .is_none());
}

#[test]
fn invalid_pattern_edits_preserve_clock_history_and_pending() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (line, token, grid, row, col) = seed(&mut d);
    for value in [
        json!("https://"),
        json!("HTTP://x"),
        json!("ftp://x"),
        json!("https://x y"),
        json!("https://x\n"),
        json!("https://x\u{00a0}"),
        json!("https://x\u{feff}"),
        json!(true),
        json!(12),
        json!({}),
    ] {
        let before = checkpoint(&mut d);
        let clock = d.observed_clock().unwrap();
        assert!(d
            .format_tokens(&[token.clone()], "link", value.clone(), opt(), 4.)
            .is_err());
        assert!(d
            .set_field_path(&line, "meta", &["nested", "url"], value.clone(), opt(), 4.)
            .is_err());
        assert!(d.set_attribute(&line, "url", value, opt(), 4.).is_err());
        assert_eq!(d.observed_clock().unwrap(), clock);
        assert_eq!(checkpoint(&mut d), before);
    }
    for value in [
        json!("red"),
        json!("#fff"),
        json!("#1234567"),
        json!("#GG0000"),
        json!("#123456\n"),
        json!(" #123456"),
        json!(false),
    ] {
        let before = checkpoint(&mut d);
        assert!(d
            .set_cell_attribute(&grid, &row, &col, "color", value.clone(), opt(), 4.)
            .is_err());
        assert!(d
            .set_field_path(&line, "meta", &["nested", "color"], value, opt(), 4.)
            .is_err());
        assert_eq!(checkpoint(&mut d), before);
    }
}

#[test]
fn invalid_raw_batch_rejects_valid_prefix_for_local_and_remote() {
    let mut d = RuntimeDocument::new("A", schema()).unwrap();
    let (line, token, grid, row, col) = seed(&mut d);
    for (target, key, value) in [
        (
            token.ticket().unwrap(),
            "link".to_owned(),
            json!("https://bad path"),
        ),
        (
            grid.ticket().unwrap(),
            format!("$cell:{},{}|color", row.as_str(), col.as_str()),
            json!("#xyz123"),
        ),
        (
            line.ticket().unwrap(),
            "$field:[\"meta\",\"nested\",\"url\"]".to_owned(),
            json!("https://"),
        ),
    ] {
        let before = checkpoint(&mut d);
        let at = d.next_ticket().unwrap();
        let mut next = at.clone();
        next.lamport += 1;
        let batch = vec![
            Op::Set {
                at,
                ids: vec![line.ticket().unwrap()],
                key: "url".into(),
                value: json!("https://valid.test"),
            },
            Op::Set {
                at: next,
                ids: vec![target],
                key,
                value,
            },
        ];
        assert!(d.record(batch.clone(), opt(), 4.).is_err());
        assert_eq!(checkpoint(&mut d), before);
        assert!(d.apply_remote(&batch).is_err());
        assert_eq!(checkpoint(&mut d), before);
    }
}

#[test]
fn concurrent_pattern_writers_survive_own_history_restore_and_pending_retry() {
    let s = schema();
    let mut a = RuntimeDocument::new("A", s.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", s).unwrap();
    let (line, token, grid, row, col) = seed(&mut a);
    for change in a.pending_changes().to_vec() {
        b.apply_remote(&ops(&change)).unwrap();
    }
    let own = [
        a.format_tokens(
            &[token.clone()],
            "link",
            json!("https://alice.test"),
            opt(),
            4.,
        )
        .unwrap(),
        a.set_cell_attribute(&grid, &row, &col, "color", json!("#123456"), opt(), 5.)
            .unwrap(),
        a.set_field_path(
            &line,
            "meta",
            &["nested", "url"],
            json!("https://alice.test"),
            opt(),
            6.,
        )
        .unwrap(),
    ];
    let foreign = [
        b.format_tokens(&[token], "link", json!("https://bob.test"), opt(), 4.)
            .unwrap(),
        b.set_cell_attribute(&grid, &row, &col, "color", json!("#abcdef"), opt(), 5.)
            .unwrap(),
        b.set_field_path(
            &line,
            "meta",
            &["nested", "url"],
            json!("https://bob.test"),
            opt(),
            6.,
        )
        .unwrap(),
    ];
    for change in &own {
        b.apply_remote(&ops(change)).unwrap();
    }
    for change in &foreign {
        a.apply_remote(&ops(change)).unwrap();
    }
    let expected = a.model().unwrap();
    assert_eq!(expected, b.model().unwrap());
    let pending = a.pending_changes().to_vec();
    let before = checkpoint(&mut a);
    let mut a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&before).unwrap()).unwrap();
    assert_eq!(a.pending_changes(), pending);
    for _ in 0..2 {
        for change in &pending {
            a.apply_remote(&ops(change)).unwrap();
            b.apply_remote(&ops(change)).unwrap();
        }
    }
    assert_eq!(checkpoint(&mut a), before);
    for redo in [false, false, false, true, true, true] {
        let change = if redo {
            a.redo().unwrap()
        } else {
            a.undo().unwrap()
        };
        b.apply_remote(&ops(&change)).unwrap();
        assert_eq!(a.model().unwrap(), expected);
        assert_eq!(a.model().unwrap(), b.model().unwrap());
    }
    let pending = a.pending_changes().to_vec();
    a.acknowledge(&pending).unwrap();
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint(&mut a)).unwrap())
            .unwrap();
    assert!(restored.pending_changes().is_empty());
    assert_eq!(restored.model().unwrap(), expected);
}
