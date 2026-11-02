use doc_sync_rust_shadow::{Server, GENERAL_CAPABILITY, GENERAL_FORMAT, GENERAL_SCHEMA, SCHEMA};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn root() -> Value {
    t(0, "~root")
}
fn ask(s: &mut Server, mut v: Value) -> Value {
    v["replica"] = json!("r");
    v["schema"] = json!(GENERAL_SCHEMA);
    s.request(v)
}
fn new() -> Server {
    let mut s = Server::default();
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"new","actor":"A","capabilities":[GENERAL_CAPABILITY]})
        )["ok"],
        true
    );
    s
}
fn op(n: u64, id: Value, key: &str, value: Value) -> Value {
    json!({"t":"set","at":t(n,"A"),"ids":[id],"key":key,"value":value})
}
fn node(n: u64, type_: &str, attrs: Value) -> Value {
    let mut v = json!({"t":"node","id":t(n,"A"),"origin":root(),"type":type_,"attrs":attrs});
    if ["paragraph", "heading"].contains(&type_) {
        v["boundary"] = json!("0@~root|end");
    }
    v
}
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    ask(s, json!({"cmd":"apply","ops":ops}))
}
fn local(s: &mut Server, ops: Vec<Value>) -> Value {
    ask(
        s,
        json!({"cmd":"history_record","ops":ops,"now":1000,"options":{"caretBefore":"before","caretAfter":"after"}}),
    )
}
fn cmd(s: &mut Server, c: &str) -> Value {
    ask(s, json!({"cmd":c}))
}
fn checkpoint(s: &mut Server) -> Value {
    cmd(s, "history_export")["checkpoint"].clone()
}
fn restore(s: &mut Server, c: Value) -> Value {
    ask(s, json!({"cmd":"history_restore","checkpoint":c}))
}
#[test]
fn pinned_general_mode_is_explicit_and_cannot_downgrade() {
    let mut s = new();
    let c = checkpoint(&mut s);
    assert_eq!(c["document"]["format"], GENERAL_FORMAT);
    assert_eq!(c["document"]["capabilities"], json!([GENERAL_CAPABILITY]));
    let mut fresh = Server::default();
    assert_eq!(
        fresh.request(json!({"cmd":"new","replica":"x","actor":"A","schema":GENERAL_SCHEMA}))["ok"],
        false
    );
    assert_eq!(fresh.request(json!({"cmd":"new","replica":"x","actor":"A","schema":SCHEMA,"capabilities":[GENERAL_CAPABILITY]}))["ok"],false);
    let mut corrupt = c.clone();
    corrupt["document"]["format"] = json!("doc-sync-rust-shadow-v2");
    assert_eq!(restore(&mut s, corrupt)["ok"], false);
    assert_eq!(checkpoint(&mut s), c);
    assert_eq!(
        s.request(json!({"cmd":"history_restore","replica":"r","schema":SCHEMA,"checkpoint":c}))
            ["ok"],
        false
    );
}
#[test]
fn text_types_keep_birth_attrs_and_null_resets_born_and_defaults() {
    let mut s = new();
    assert_eq!(
        apply(
            &mut s,
            vec![node(
                1,
                "heading",
                json!({"level":3,"meta":{"nested":[null,true,{"x":"한😀"}]}})
            )]
        )["ok"],
        true
    );
    let r = local(
        &mut s,
        vec![
            op(2, t(1, "A"), "$type", json!("paragraph")),
            op(3, t(1, "A"), "level", json!(6)),
        ],
    );
    assert_eq!(r["ok"], true);
    assert!(r["state"]["blocks"][1]["attrs"].get("level").is_none());
    let r = apply(
        &mut s,
        vec![
            op(4, t(1, "A"), "$type", Value::Null),
            op(5, t(1, "A"), "meta", Value::Null),
        ],
    );
    assert_eq!(r["state"]["blocks"][1]["type"], "heading");
    assert_eq!(r["state"]["blocks"][1]["attrs"]["level"], 6);
    assert_eq!(r["state"]["blocks"][1]["attrs"]["meta"], Value::Null);
    let c = checkpoint(&mut s);
    assert_eq!(c["document"]["items"][1]["node"]["born"], "heading");
    assert_eq!(c["document"]["items"][1]["node"]["birth_attrs"]["level"], 3);
    assert_eq!(restore(&mut s, c)["ok"], true);
}
#[test]
fn atom_virtual_blocks_model_paths_and_raw_positions_are_distinct() {
    let mut s = new();
    let r = apply(
        &mut s,
        vec![
            node(1, "divider", json!({"style":"dots"})),
            node(2, "image", json!({"width":1.5,"decorative":true})),
        ],
    );
    assert_eq!(r["ok"], true);
    assert_eq!(r["state"]["blocks"].as_array().unwrap().len(), 5);
    assert_eq!(r["state"]["model"]["children"].as_array().unwrap().len(), 3);
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"anchor_resolve","anchor":"2@A","strict":true})
        )["paragraph"],
        2
    );
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"selection_resolve","range":{"anchor":"2@A","focus":"1@A"}})
        )["range"],
        json!({"anchor":[1,0],"focus":[2,0]})
    );
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"selection_capture","range":{"anchor":[1,0],"focus":[2,0]}})
        )["range"],
        Value::Null
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
}
#[test]
fn root_attr_history_restores_and_foreign_same_value_fences_undo() {
    let mut s = new();
    assert_eq!(
        local(
            &mut s,
            vec![
                op(1, root(), "$type", json!("heading")),
                op(2, root(), "level", json!(2)),
                op(3, root(), "meta", json!([1, null, true]))
            ]
        )["ok"],
        true
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
    let mut foreign = op(4, root(), "level", json!(2));
    foreign["at"] = t(4, "B");
    assert_eq!(apply(&mut s, vec![foreign])["ok"], true);
    let u = cmd(&mut s, "history_undo");
    assert_eq!(u["ok"], true);
    assert_eq!(u["ops"].as_array().unwrap().len(), 2);
    assert_eq!(u["state"]["items"][0]["attrs"]["level"]["at"], t(4, "B"));
    assert_eq!(u["state"]["blocks"][0]["type"], "paragraph");
    assert_eq!(
        cmd(&mut s, "history_redo")["state"]["blocks"][0]["attrs"]["level"],
        2
    );
}
#[test]
fn json_history_groups_preserve_object_order_but_normalize_number_forms() {
    let mut s = new();
    apply(&mut s, vec![node(1, "paragraph", json!({}))]);
    let za: Value = serde_json::from_str("{\"z\":1,\"a\":2}").unwrap();
    let az: Value = serde_json::from_str("{\"a\":2,\"z\":1}").unwrap();
    apply(
        &mut s,
        vec![
            op(2, root(), "meta", za.clone()),
            op(3, t(1, "A"), "meta", az.clone()),
        ],
    );
    let mut write = op(4, root(), "meta", json!(true));
    write["ids"] = json!([root(), t(1, "A")]);
    assert_eq!(local(&mut s, vec![write])["ok"], true);
    let u = cmd(&mut s, "history_undo");
    assert_eq!(u["ops"].as_array().unwrap().len(), 2);
    assert_eq!(u["ops"][0]["value"].to_string(), za.to_string());
    assert_eq!(u["ops"][1]["value"].to_string(), az.to_string());
    let numeric_a: Value = serde_json::from_str("{\"10\":1.0,\"2\":-0.0,\"a\":1e21}").unwrap();
    let numeric_b: Value =
        serde_json::from_str("{\"2\":0,\"10\":1,\"a\":1000000000000000000000.0}").unwrap();
    apply(
        &mut s,
        vec![
            op(7, root(), "meta", numeric_a),
            op(8, t(1, "A"), "meta", numeric_b),
        ],
    );
    let mut write = op(9, root(), "meta", json!(false));
    write["ids"] = json!([root(), t(1, "A")]);
    assert_eq!(local(&mut s, vec![write])["ok"], true);
    assert_eq!(
        cmd(&mut s, "history_undo")["ops"].as_array().unwrap().len(),
        1
    );
    assert_eq!(
        apply(&mut s, vec![op(11, root(), "level", json!(1.0))])["ok"],
        true
    );
}
#[test]
fn invalid_typed_batches_and_unsupported_metadata_preserve_joint_checkpoint() {
    let mut s = new();
    local(&mut s, vec![op(1, root(), "meta", json!({"valid":true}))]);
    let before = checkpoint(&mut s);
    for bad in [
        op(3, root(), "level", json!(1.5)),
        op(3, root(), "src", json!("bad shape")),
        op(3, root(), "$join", json!({})),
        node(3, "heading", json!({"src":"wrong birth shape"})),
        node(3, "image", json!({"width":-1})),
        node(3, "flow", json!({})),
    ] {
        assert_eq!(
            local(&mut s, vec![op(2, root(), "align", json!("center")), bad])["ok"],
            false
        );
        assert_eq!(checkpoint(&mut s), before);
    }
    assert_eq!(
        apply(
            &mut s,
            vec![json!({"t":"del","at":t(3,"A"),"ids":[root()]})]
        )["ok"],
        false
    );
    assert_eq!(checkpoint(&mut s), before);
}
#[test]
fn corrupted_native_birth_and_history_metadata_reject_atomically() {
    let mut s = new();
    local(
        &mut s,
        vec![
            node(1, "image", json!({"src":"born"})),
            op(2, root(), "level", json!(2)),
        ],
    );
    let c = checkpoint(&mut s);
    let mut corruptions = vec![];
    let mut v = c.clone();
    v["document"]["items"][1]["node"]
        .as_object_mut()
        .unwrap()
        .remove("birth_attrs");
    corruptions.push(v);
    let mut v = c.clone();
    v["document"]["items"][1]["node"]["birth_attrs"]["src"] = json!(5);
    corruptions.push(v);
    let mut v = c.clone();
    v["document"]["items"][1]["attrs"]["$type"]["value"] = json!("divider");
    corruptions.push(v);
    let mut v = c.clone();
    v["document"]["items"][1]["attrs"]["width"] = json!({"value":"not a number","at":t(1,"A")});
    corruptions.push(v);
    let mut v = c.clone();
    v["history"]["sets"][0]["value"] = json!("invalid level");
    corruptions.push(v);
    let mut v = c.clone();
    v["history"]["undo"][0]["steps"][1]["key"] = json!("$join");
    corruptions.push(v);
    for v in corruptions {
        assert_eq!(restore(&mut s, v)["ok"], false);
        assert_eq!(checkpoint(&mut s), c);
    }
    assert_eq!(cmd(&mut s, "history_undo")["ok"], true);
}
#[test]
fn exact_birth_replay_keeps_live_attrs_and_conflicting_birth_is_atomic() {
    let mut s = new();
    let birth = node(1, "heading", json!({"meta":["born",null]}));
    apply(&mut s, vec![birth.clone()]);
    apply(
        &mut s,
        vec![op(2, t(1, "A"), "meta", json!({"current":true}))],
    );
    let c = checkpoint(&mut s);
    assert_eq!(apply(&mut s, vec![birth])["ok"], true);
    assert_eq!(checkpoint(&mut s), c);
    assert_eq!(
        apply(
            &mut s,
            vec![node(1, "heading", json!({"meta":"changed birth"}))]
        )["ok"],
        true
    );
    assert_eq!(checkpoint(&mut s), c);
    assert_eq!(
        apply(&mut s, vec![node(1, "paragraph", json!({}))])["ok"],
        false
    );
    assert_eq!(checkpoint(&mut s), c);
}

#[test]
fn accepted_absent_attr_registers_roundtrip_even_with_older_wire_tickets() {
    let mut s = new();
    assert_eq!(
        apply(&mut s, vec![node(10, "image", json!({}))])["ok"],
        true
    );
    for (at, key, value) in [
        (t(10, "A"), "width", json!(4)),
        (t(2, "B"), "src", json!("older wire")),
    ] {
        let mut write = op(11, t(10, "A"), key, value);
        write["at"] = at;
        assert_eq!(apply(&mut s, vec![write])["ok"], true);
        let c = checkpoint(&mut s);
        assert_eq!(restore(&mut s, c.clone())["ok"], true);
        assert_eq!(checkpoint(&mut s), c);
    }
}
