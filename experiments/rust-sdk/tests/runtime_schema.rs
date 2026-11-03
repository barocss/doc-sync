use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn options() -> EditOptions {
    EditOptions::default()
}
fn graphic(root: &str, group: &str, label: &str, mark: &str) -> RuntimeSchema {
    RuntimeSchema::compile(json!({"domain":"graphic","root":root,"marks":[mark],"nodes":{
    root:{"shape":"container","children":[group,label]},
    group:{"shape":"container","children":[group,label],"attrs":{"caption":{"default":"","pattern":"^[^\\u0000-\\u001f\\u007f]{0,12}$"},"position":{"default":{"horizontal":0,"vertical":0},"fields":{"horizontal":{"default":0,"min":-10,"max":10},"vertical":{"default":0,"min":-10,"max":10}}}}},
    label:{"shape":"text","attrs":{"enabled":{"default":true},"tint":{"default":"#aabbcc","pattern":"^#[0-9a-fA-F]{6}$"}}}
}})).unwrap()
}
fn document(root: &str, text: &str, other: &str) -> RuntimeSchema {
    RuntimeSchema::compile(
        json!({"domain":"document","root":root,"marks":["emphasis"],"nodes":{
            root:{"shape":"flow","children":[text,other,"separator"],"default":text},
            text:{"shape":"text","attrs":{"rank":{"default":1,"min":0,"max":4}}},
            other:{"shape":"text","attrs":{"rank":{"default":2,"min":0,"max":4}}},
            "separator":{"shape":"atom","attrs":{"theme":{"default":"red","values":["red","blue"]}}}
        }}),
    )
    .unwrap()
}
fn checkpoint(d: &mut RuntimeDocument) -> String {
    d.checkpoint().unwrap().to_json().unwrap()
}
#[test]
fn renamed_graphic_schemas_coexist_with_fields_text_history_and_restart() {
    let schema = graphic("surface", "folder", "caption", "highlight");
    let second = graphic("drawing", "collection", "annotation", "strong");
    assert_ne!(schema.identity(), second.identity());
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    let mut c = RuntimeDocument::new("C", second).unwrap();
    let (folder, birth) = a
        .insert("folder", None, None, Attributes::new(), options(), 1.)
        .unwrap();
    b.apply_remote(&birth.ops).unwrap();
    let (label, birth) = a
        .insert(
            "caption",
            Some(&folder),
            None,
            Attributes::new(),
            options(),
            2.,
        )
        .unwrap();
    b.apply_remote(&birth.ops).unwrap();
    let text = a
        .insert_label_text_with_marks(
            &label,
            None,
            "A😀",
            Attributes::from([("highlight".into(), json!(true))]),
            options(),
            3.,
        )
        .unwrap();
    b.apply_remote(&text.ops).unwrap();
    let x = a
        .set_field(&folder, "position", "horizontal", json!(3), options(), 4.)
        .unwrap();
    let y = b
        .set_field(&folder, "position", "vertical", json!(5), options(), 4.)
        .unwrap();
    a.apply_remote(&y.ops).unwrap();
    b.apply_remote(&x.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let cp = a.checkpoint().unwrap();
    let mut restored =
        RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&cp.to_json().unwrap()).unwrap())
            .unwrap();
    assert_eq!(a.pending_changes(), restored.pending_changes());
    let ah = a.history_status().unwrap();
    let rh = restored.history_status().unwrap();
    assert_eq!((ah.can_undo, ah.can_redo), (rh.can_undo, rh.can_redo));
    let undo = restored.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(restored.model().unwrap(), b.model().unwrap());
    assert_eq!(
        restored.model().unwrap()["children"][0]["attrs"]["position"],
        json!({"horizontal":0,"vertical":5})
    );
    let redo = restored.redo().unwrap();
    b.apply_remote(&redo.ops).unwrap();
    assert_eq!(restored.model().unwrap(), b.model().unwrap());
    let (_, change) = c
        .insert("annotation", None, None, Attributes::new(), options(), 1.)
        .unwrap();
    assert_eq!(change.ops.len(), 1);
    assert_eq!(c.model().unwrap()["type"], "drawing");
}
#[test]
fn flat_document_runtime_uses_names_defaults_marks_and_atomic_restart() {
    let schema = document("article", "body-line", "title-line");
    let mut a = RuntimeDocument::new("A", schema.clone()).unwrap();
    let mut b = RuntimeDocument::new("B", schema).unwrap();
    assert_eq!(a.model().unwrap()["children"][0]["type"], "body-line");
    let text = a
        .insert_text(
            None,
            "abc",
            Attributes::from([("emphasis".into(), json!(true))]),
            options(),
            1.,
        )
        .unwrap();
    b.apply_remote(&text.ops).unwrap();
    let last = Key::from_ticket(&Ticket {
        lamport: 3,
        actor: "A".into(),
    });
    let (title, change) = a
        .insert_block(
            "title-line",
            Some(&last),
            None,
            Attributes::new(),
            options(),
            2.,
        )
        .unwrap();
    b.apply_remote(&change.ops).unwrap();
    let change = a
        .insert_text(Some(&title), "new", Attributes::new(), options(), 3.)
        .unwrap();
    b.apply_remote(&change.ops).unwrap();
    assert_eq!(a.model().unwrap(), b.model().unwrap());
    let set = a
        .set_attribute(&title, "rank", json!(4), options(), 4.)
        .unwrap();
    b.apply_remote(&set.ops).unwrap();
    let mut restored = RuntimeDocument::restore(&a.checkpoint().unwrap()).unwrap();
    assert_eq!(a.pending_changes(), restored.pending_changes());
    let undo = restored.undo().unwrap();
    b.apply_remote(&undo.ops).unwrap();
    assert_eq!(restored.model().unwrap(), b.model().unwrap());
    let before = checkpoint(&mut restored);
    assert!(restored
        .set_attribute(&title, "rank", json!(5), options(), 5.)
        .is_err());
    assert_eq!(checkpoint(&mut restored), before);
    let mut corrupt: Value = serde_json::from_str(&before).unwrap();
    corrupt["native"]["document"]["manifest"]["nodes"]["title-line"]["attrs"]["rank"]["max"] =
        json!(99);
    assert!(RuntimeCheckpoint::from_json(&corrupt.to_string()).is_err());
    assert_eq!(checkpoint(&mut restored), before);
}
#[test]
fn unsupported_rules_reject_with_paths_and_descriptor_identity_is_stable() {
    let s = document("article", "body", "title");
    let mut legacy = s.manifest().clone();
    legacy.as_object_mut().unwrap().shift_remove("domain");
    assert_eq!(
        RuntimeSchema::compile(legacy).unwrap().identity(),
        s.identity()
    );
    let mut bad = s.manifest().clone();
    bad["nodes"]["title"]["shape"] = json!("grid");
    let err = RuntimeSchema::compile(bad).unwrap_err().0;
    assert!(err.contains("$.nodes.title.shape"), "{err}");
    let mut bad = graphic("surface", "folder", "caption", "mark")
        .manifest()
        .clone();
    bad["nodes"]["caption"]["attrs"]["regex"] = json!({"default":"abc","pattern":"(?<=a)b"});
    assert!(RuntimeSchema::compile(bad)
        .unwrap_err()
        .0
        .contains(".pattern"));
    for value in [
        json!({"root":"missing","marks":[],"nodes":{}}),
        json!({"root":"x","marks":[],"nodes":{"x":{"shape":"flow","children":[],"default":"missing"}}}),
    ] {
        assert!(RuntimeSchema::compile(value).is_err());
    }
}
#[test]
fn invalid_graphic_batch_and_foreign_schema_checkpoint_preserve_history_pending() {
    let mut a =
        RuntimeDocument::new("A", graphic("surface", "folder", "caption", "highlight")).unwrap();
    let (id, _) = a
        .insert("folder", None, None, Attributes::new(), options(), 1.)
        .unwrap();
    let before = checkpoint(&mut a);
    let ticket = a.next_ticket().unwrap();
    let ops = vec![
        Op::Set {
            at: ticket.clone(),
            ids: vec![id.ticket().unwrap()],
            key: "caption".into(),
            value: json!("valid"),
        },
        Op::Set {
            at: Ticket {
                lamport: ticket.lamport + 1,
                actor: ticket.actor,
            },
            ids: vec![id.ticket().unwrap()],
            key: "caption".into(),
            value: json!("too long title"),
        },
    ];
    assert!(a.record(ops, options(), 2.).is_err());
    assert_eq!(checkpoint(&mut a), before);
    let mut other = RuntimeDocument::new("A", graphic("drawing", "group", "text", "bold")).unwrap();
    let cp = other.checkpoint().unwrap();
    assert!(a.restore_checkpoint(&cp).is_err());
    assert_eq!(checkpoint(&mut a), before);
}
