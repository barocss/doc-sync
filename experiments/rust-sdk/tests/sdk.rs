use doc_sync_native_sdk::*;
use serde_json::json;
fn options() -> EditOptions {
    EditOptions::default()
}
fn text(doc: &mut Document) -> Vec<u16> {
    fn walk(node: &ModelNode, out: &mut Vec<u16>) {
        for run in &node.runs {
            match run {
                ModelRun::Text(ModelText { units, .. }) => out.extend(&units.0),
                ModelRun::Node(n) => walk(n, out),
            }
        }
        for child in &node.children {
            walk(child, out);
        }
    }
    let mut units = vec![];
    walk(&doc.model().unwrap(), &mut units);
    units
}
fn insert(doc: &mut Document, s: &str) -> Change {
    doc.insert_text(&Key::root(), s, Attributes::new(), options(), 0.0)
        .unwrap()
}
fn ticket(n: u64, actor: &str) -> Ticket {
    Ticket {
        lamport: n,
        actor: actor.into(),
    }
}
fn node(id: Ticket, origin: Ticket, kind: &str) -> Op {
    Op::Node {
        id,
        origin,
        node_type: kind.into(),
        boundary: String::new(),
        attrs: None,
    }
}
#[test]
fn two_actors_concurrent_insert_and_independent_undo_redo() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let mut b = Document::new("B", SchemaPreset::Text).unwrap();
    let ac = insert(&mut a, "a");
    let bc = insert(&mut b, "b");
    a.apply_remote(&bc.ops).unwrap();
    b.apply_remote(&ac.ops).unwrap();
    assert_eq!(text(&mut a), text(&mut b));
    assert_eq!(text(&mut a).len(), 2);
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(text(&mut a), vec![b'b' as u16]);
    assert_eq!(text(&mut a), text(&mut b));
    let redo = a.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(text(&mut a), text(&mut b));
    assert_eq!(text(&mut a).len(), 2);
    let undo_b = b.undo().unwrap();
    a.apply_remote(&undo_b.ops).unwrap();
    assert_eq!(text(&mut a), vec![b'a' as u16]);
}
#[test]
fn foreign_same_value_mark_fences_own_undo() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let mut b = Document::new("B", SchemaPreset::Text).unwrap();
    let c = insert(&mut a, "x");
    b.apply_remote(&c.ops).unwrap();
    let id = ticket(1, "A");
    let own = a
        .set_mark(vec![id.clone()], Mark::Bold(Some(true)), options(), 10.0)
        .unwrap();
    b.apply_remote(&own.ops).unwrap();
    let foreign = b
        .set_mark(vec![id], Mark::Bold(Some(true)), options(), 20.0)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert!(undo.ops.is_empty());
    match &a.model().unwrap().children[0].runs[0] {
        ModelRun::Text(ModelText { marks, .. }) => assert_eq!(marks["bold"], true),
        _ => panic!(),
    }
}
#[test]
fn foreign_delete_remains_after_own_delete_undo() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let c = insert(&mut a, "x");
    let mut b = Document::new("B", SchemaPreset::Text).unwrap();
    b.apply_remote(&c.ops).unwrap();
    let own = a
        .delete_text(vec![ticket(1, "A")], options(), 10.0)
        .unwrap();
    let foreign = b
        .delete_text(vec![ticket(1, "A")], options(), 10.0)
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    b.apply_remote(&own.ops).unwrap();
    let undo = a.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert!(text(&mut a).is_empty());
    assert_eq!(text(&mut a), text(&mut b));
}
#[test]
fn utf16_unpaired_units_and_reversed_selection_survive_restart() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let units = Utf16Text(vec![0xD800, 0x61, 0xDC00, 0xD83D, 0xDE00]);
    assert!(units.to_string().is_err());
    a.insert_text(
        &Key::root(),
        units.clone(),
        Attributes::new(),
        options(),
        0.0,
    )
    .unwrap();
    assert_eq!(text(&mut a), units.0);
    let range = Selection {
        anchor: Position(vec![0, 5]),
        focus: Position(vec![0, 1]),
    };
    let captured = a.capture_selection(Some(range.clone())).unwrap();
    assert_eq!(
        a.resolve_selection(captured.clone()).unwrap(),
        Some(range.clone())
    );
    let cp = Checkpoint::from_json(&a.checkpoint().unwrap().to_json().unwrap()).unwrap();
    let mut restored = Document::restore(&cp).unwrap();
    assert_eq!(text(&mut restored), units.0);
    assert_eq!(restored.resolve_selection(captured).unwrap(), Some(range));
    assert_eq!(a.capture_selection(None).unwrap(), None);
    assert_eq!(
        a.resolve_anchor(&Key::parse("999@missing").unwrap())
            .unwrap(),
        None
    );
}
#[test]
fn errors_preserve_native_history_pending_and_clock() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    insert(&mut a, "x");
    let before = a.checkpoint().unwrap().to_json().unwrap();
    let ops = vec![
        Op::Text {
            id: ticket(2, "A"),
            origin: ticket(1, "A"),
            units: "y".into(),
            marks: Attributes::new(),
        },
        Op::Set {
            at: ticket(3, "A"),
            ids: vec![ticket(1, "A")],
            key: "bold".into(),
            value: json!("invalid"),
        },
    ];
    assert!(a.record(ops.clone(), options(), 10.0).is_err());
    assert_eq!(a.checkpoint().unwrap().to_json().unwrap(), before);
    assert!(a.apply_remote(&ops).is_err());
    assert_eq!(a.checkpoint().unwrap().to_json().unwrap(), before);
    assert!(a
        .insert_text(&Key::root(), "", Attributes::new(), options(), 0.0)
        .is_err());
    assert!(a.record(vec![], options(), f64::NAN).is_err());
    assert_eq!(a.checkpoint().unwrap().to_json().unwrap(), before);
}
#[test]
fn observed_foreign_clock_allocates_fresh_own_ticket_and_replay_does_not_record() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let remote = Op::Text {
        id: ticket(100, "B"),
        origin: Key::root().ticket().unwrap(),
        units: "hi".into(),
        marks: Attributes::new(),
    };
    a.apply_remote(&[remote.clone()]).unwrap();
    a.apply_remote(&[remote]).unwrap();
    assert!(!a.history_status().unwrap().can_undo);
    assert!(a.pending_changes().is_empty());
    let c = insert(&mut a, "a");
    match &c.ops[0] {
        Op::Text { id, .. } => assert_eq!(id, &ticket(102, "A")),
        _ => panic!(),
    }
    assert!(a.record(c.ops.clone(), options(), 1.0).is_err());
    a.apply_remote(&c.ops).unwrap();
    assert_eq!(a.pending_changes().len(), 1);
}
#[test]
fn coupled_checkpoint_preserves_pending_exact_replay_twice_and_history() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let c = insert(&mut a, "hello");
    let mark = a
        .set_mark(
            vec![ticket(1, "A")],
            Mark::Italic(Some(true)),
            options(),
            10.0,
        )
        .unwrap();
    let cp = Checkpoint::from_json(&a.checkpoint().unwrap().to_json().unwrap()).unwrap();
    let mut restarted = Document::restore(&cp).unwrap();
    let before = restarted.checkpoint().unwrap().to_json().unwrap();
    for _ in 0..2 {
        restarted.apply_remote(&c.ops).unwrap();
        restarted.apply_remote(&mark.ops).unwrap();
    }
    assert_eq!(restarted.checkpoint().unwrap().to_json().unwrap(), before);
    let mut peer = Document::new("B", SchemaPreset::Text).unwrap();
    for _ in 0..2 {
        for pending in restarted.pending_changes() {
            peer.apply_remote(&pending.ops).unwrap();
        }
    }
    assert_eq!(peer.model().unwrap(), restarted.model().unwrap());
    let undo = restarted.undo().unwrap();
    peer.apply_remote(&undo.ops).unwrap();
    assert_eq!(peer.model().unwrap(), restarted.model().unwrap());
    assert!(restarted.acknowledge(&[mark]).is_err());
    restarted.acknowledge(&[c]).unwrap();
    assert_eq!(restarted.pending_changes().len(), 2);
}
#[test]
fn checkpoint_rejects_actor_schema_and_pending_confusion_atomically() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    insert(&mut a, "a");
    let cp = a.checkpoint().unwrap();
    let before = cp.to_json().unwrap();
    let mut b = Document::new("B", SchemaPreset::Text).unwrap();
    assert!(b.restore_checkpoint(&cp).is_err());
    assert!(text(&mut b).is_empty());
    for (field, value) in [
        ("actor", json!("B")),
        ("preset", json!("Paragraphs")),
        ("version", json!(2)),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad[field] = value;
        assert!(Checkpoint::from_json(&bad.to_string()).is_err());
        let unchecked: Checkpoint = serde_json::from_value(bad).unwrap();
        assert!(a.restore_checkpoint(&unchecked).is_err());
        assert_eq!(a.checkpoint().unwrap().to_json().unwrap(), before);
    }
    let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
    bad["pending"][0]["ops"][0]["id"]["actor"] = json!("B");
    assert!(Checkpoint::from_json(&bad.to_string()).is_err());
}
#[test]
fn all_six_presets_restore_without_silent_conversion() {
    for preset in [
        SchemaPreset::Text,
        SchemaPreset::Paragraphs,
        SchemaPreset::Blocks,
        SchemaPreset::Nested,
        SchemaPreset::Shapes,
        SchemaPreset::Movement,
    ] {
        let mut doc = Document::new("A", preset).unwrap();
        insert(&mut doc, "x");
        let checkpoint =
            Checkpoint::from_json(&doc.checkpoint().unwrap().to_json().unwrap()).unwrap();
        let mut restored = Document::restore(&checkpoint).unwrap();
        assert_eq!(restored.preset(), preset);
        assert_eq!(doc.model().unwrap(), restored.model().unwrap());
        assert_eq!(text(&mut restored), vec![120]);
    }
    assert!(serde_json::from_str::<SchemaPreset>("\"custom\"").is_err());
}
#[test]
fn typed_block_birth_move_and_history_are_native() {
    let mut doc = Document::new("A", SchemaPreset::Movement).unwrap();
    let root = Key::root().ticket().unwrap();
    let birth = doc
        .record(
            vec![
                node(ticket(1, "A"), root.clone(), "callout"),
                node(ticket(2, "A"), ticket(1, "A"), "image"),
            ],
            options(),
            0.0,
        )
        .unwrap();
    assert_eq!(birth.ops.len(), 2);
    let op = Op::Move {
        at: doc.next_ticket().unwrap(),
        target: ticket(2, "A"),
        parent: Key::parse("0@1@A/body").unwrap().ticket().unwrap(),
        after: None,
    };
    let change = doc.record(vec![op.clone()], options(), 10.0).unwrap();
    assert_eq!(change.ops, vec![op]);
    fn contains(n: &ModelNode, ty: &str) -> bool {
        n.node_type == ty || n.children.iter().any(|c| contains(c, ty))
    }
    let model = doc.model().unwrap();
    let callout = model
        .children
        .iter()
        .find(|n| n.node_type == "callout")
        .unwrap();
    assert!(contains(callout, "image"));
    let undo = doc.undo().unwrap();
    assert!(matches!(&undo.ops[0], Op::Move { .. }));
    let cp = doc.checkpoint().unwrap();
    let mut restored = Document::restore(&cp).unwrap();
    let redo = restored.redo().unwrap();
    assert!(matches!(&redo.ops[0], Op::Move { .. }));
}

#[test]
fn invalid_actor_and_unsupported_schema_features_fail_closed() {
    assert!(Document::new("", SchemaPreset::Text).is_err());
    assert!(Document::new("~root", SchemaPreset::Text).is_err());
    let mut doc = Document::new("A", SchemaPreset::Text).unwrap();
    insert(&mut doc, "x");
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    assert!(doc
        .set_mark(
            vec![ticket(1, "A")],
            Mark::Link(Some("https://example.com".into())),
            options(),
            10.0
        )
        .is_err());
    assert!(doc
        .record(
            vec![node(ticket(2, "A"), Key::root().ticket().unwrap(), "image")],
            options(),
            10.0
        )
        .is_err());
    assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
}

#[test]
fn malformed_native_checkpoint_and_unsent_pending_do_not_replace_document() {
    let mut doc = Document::new("A", SchemaPreset::Text).unwrap();
    insert(&mut doc, "x");
    let before = doc.checkpoint().unwrap().to_json().unwrap();
    let valid: serde_json::Value = serde_json::from_str(&before).unwrap();
    let mut history = valid.clone();
    history["native"]["history"] = json!({"invalid":true});
    let mut replay = valid.clone();
    replay["pending"][0]["ops"][0]["units"] = json!([121]);
    let mut missing = valid;
    missing["pending"][0]["ops"][0]["id"]["lamport"] = json!(2);
    for bad in [history, replay, missing] {
        assert!(Checkpoint::from_json(&bad.to_string()).is_err());
        let unchecked: Checkpoint = serde_json::from_value(bad).unwrap();
        assert!(doc.restore_checkpoint(&unchecked).is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    }
}

#[test]
fn checkpoint_restart_preserves_foreign_history_ownership() {
    let mut a = Document::new("A", SchemaPreset::Text).unwrap();
    let mut b = Document::new("B", SchemaPreset::Text).unwrap();
    let insertion = insert(&mut a, "x");
    b.apply_remote(&insertion.ops).unwrap();
    let local = a
        .set_mark(
            vec![ticket(1, "A")],
            Mark::Bold(Some(true)),
            options(),
            10.0,
        )
        .unwrap();
    b.apply_remote(&local.ops).unwrap();
    let foreign = b
        .set_mark(
            vec![ticket(1, "A")],
            Mark::Bold(Some(true)),
            options(),
            20.0,
        )
        .unwrap();
    a.apply_remote(&foreign.ops).unwrap();
    let cp = Checkpoint::from_json(&a.checkpoint().unwrap().to_json().unwrap()).unwrap();
    let mut restarted = Document::restore(&cp).unwrap();
    let pending = restarted.pending_changes().to_vec();
    for change in pending {
        restarted.apply_remote(&change.ops).unwrap();
        b.apply_remote(&change.ops).unwrap();
    }
    assert!(restarted.undo().unwrap().ops.is_empty());
    assert_eq!(restarted.model().unwrap(), b.model().unwrap());
    let insertion_undo = restarted.undo().unwrap();
    b.apply_remote(&insertion_undo.ops).unwrap();
    assert!(text(&mut restarted).is_empty());
    assert_eq!(restarted.model().unwrap(), b.model().unwrap());
}
