use doc_sync_rust_shadow::{runtime_schema::RuntimeSchema, Server};
use serde_json::{json, Value};

fn manifest() -> Value {
    json!({"root":"doc","marks":["bold"],"nodes":{
        "doc":{"shape":"flow","children":["off","on","box","table"],"default":"off"},
        "off":{"shape":"text","text":false,"next":"on","children":["badge"]},
        "on":{"shape":"text","text":true},"badge":{"shape":"inline"},
        "box":{"shape":"flow","children":["off"],"default":"off"},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["off"],"default":"off"}
    }})
}
fn t(key: &str) -> Value {
    let (n, a) = key.split_once('@').unwrap();
    json!({"lamport":n.parse::<u64>().unwrap(),"actor":a})
}
fn text(id: &str, origin: &str) -> Value {
    json!({"t":"text","id":t(id),"origin":t(origin),"units":[120],"marks":{}})
}
fn node(id: &str, origin: &str, kind: &str) -> Value {
    let mut op = json!({"t":"node","id":t(id),"origin":t(origin),"type":kind,"attrs":{}});
    if kind == "off" || kind == "on" {
        op["boundary"] = json!(format!("{origin}|end"));
    }
    op
}
fn set(id: &str, target: &str, kind: &str) -> Value {
    json!({"t":"set","at":t(id),"ids":[t(target)],"key":"$type","value":kind})
}
fn ask(s: &mut Server, schema: &RuntimeSchema, mut req: Value) -> Value {
    req["schema"] = json!(schema.identity());
    req["replica"] = json!("r");
    s.request(req)
}
fn new(m: Value) -> (Server, RuntimeSchema) {
    let schema = RuntimeSchema::compile(m).unwrap();
    let mut s = Server::default();
    let r = ask(
        &mut s,
        &schema,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema.dto()}),
    );
    assert_eq!(r["ok"], true, "{r}");
    (s, schema)
}
fn apply(s: &mut Server, schema: &RuntimeSchema, ops: Vec<Value>) -> Value {
    let r = ask(s, schema, json!({"cmd":"apply","ops":ops}));
    assert_eq!(r["ok"], true, "{r}");
    r["state"].clone()
}
fn rejected(s: &mut Server, schema: &RuntimeSchema, ops: Vec<Value>) {
    let before = ask(s, schema, json!({"cmd":"snapshot"}))["snapshot"].clone();
    let r = ask(s, schema, json!({"cmd":"apply","ops":ops}));
    assert_eq!(r["ok"], false, "{r}");
    assert_eq!(
        ask(s, schema, json!({"cmd":"snapshot"}))["snapshot"],
        before
    );
}

#[test]
fn boolean_flags_are_admitted_and_other_flag_types_fail_closed() {
    for value in [json!(false), json!(true)] {
        let mut m = manifest();
        m["nodes"]["off"]["text"] = value;
        assert!(RuntimeSchema::compile(m).is_ok());
    }
    for value in [
        Value::Null,
        json!(0),
        json!(1),
        json!("false"),
        json!([]),
        json!({}),
    ] {
        let mut m = manifest();
        m["nodes"]["off"]["text"] = value;
        assert!(RuntimeSchema::compile(m).is_err());
    }
    let mut m = manifest();
    m["nodes"]["box"]["text"] = json!(false);
    assert!(RuntimeSchema::compile(m).is_err());
}

#[test]
fn flat_flow_admission_uses_any_stored_text_spec_and_preserves_false_default() {
    let m = json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["off","on"],"default":"off"},"off":{"shape":"text","text":false,"next":"on"},"on":{"shape":"text"}}});
    let (mut s, schema) = new(m.clone());
    let state = apply(&mut s, &schema, vec![text("1@A", "0@~root")]);
    assert_eq!(
        state["model"]["children"][0],
        json!({"type":"off","attrs":{},"runs":[{"units":[120],"marks":{}}]})
    );
    apply(
        &mut s,
        &schema,
        vec![
            set("2@A", "0@~root", "on"),
            set("3@A", "0@~root", "off"),
            text("4@B", "1@A"),
        ],
    );
    let mut allfalse = m;
    allfalse["nodes"]["on"]["text"] = json!(false);
    let (mut blocked, bs) = new(allfalse);
    rejected(
        &mut blocked,
        &bs,
        vec![set("1@A", "0@~root", "on"), text("2@A", "0@~root")],
    );
}

#[test]
fn nested_flow_cells_and_inline_nodes_use_flow_rules_without_marker_filter() {
    let (mut s, schema) = new(manifest());
    let state = apply(
        &mut s,
        &schema,
        vec![
            node("1@A", "0@~root", "off"),
            node("2@A", "1@A", "badge"),
            text("3@A", "2@A"),
            node("4@A", "3@A", "box"),
            node("5@A", "4@A", "table"),
            node("6@A", "0@5@A/rows", "row"),
            node("7@A", "0@5@A/cols", "col"),
        ],
    );
    assert_eq!(state["model"]["children"][1]["type"], "off");
    assert_eq!(
        state["model"]["children"][1]["runs"],
        json!([{"type":"badge"},{"units":[120],"marks":{}}])
    );
    rejected(
        &mut s,
        &schema,
        vec![node("8@A", "0@4@A/body", "badge"), text("9@A", "8@A")],
    );
    rejected(&mut s, &schema, vec![text("8@A", "0@5@A/cell:6@A,7@A")]);
    apply(&mut s, &schema, vec![node("8@A", "0@4@A/body", "badge")]);
}

#[test]
fn group_members_determine_admission_for_each_flow() {
    let mut m = manifest();
    m["nodes"]["doc"]["children"] = json!(["stack", "box", "table"]);
    m["nodes"]["doc"]["default"] = json!("off");
    m["nodes"]["stack"] = json!({"shape":"group","children":["off","on"],"by":[]});
    let (mut s, schema) = new(m.clone());
    apply(
        &mut s,
        &schema,
        vec![node("1@A", "0@~root", "off"), text("2@A", "1@A")],
    );
    m["nodes"]["on"]["text"] = json!(false);
    let (mut s, schema) = new(m);
    rejected(&mut s, &schema, vec![text("1@A", "0@~root")]);
}

#[test]
fn false_type_change_retains_foreign_text_through_history_and_recovery() {
    let (mut s, schema) = new(manifest());
    apply(
        &mut s,
        &schema,
        vec![node("1@A", "0@~root", "on"), text("2@B", "1@A")],
    );
    let record = ask(
        &mut s,
        &schema,
        json!({"cmd":"history_record","ops":[set("3@A","1@A","off")],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(record["ok"], true, "{record}");
    apply(&mut s, &schema, vec![text("4@B", "2@B")]);
    let checkpoint = ask(&mut s, &schema, json!({"cmd":"history_export"}))["checkpoint"].clone();
    assert_eq!(
        ask(
            &mut s,
            &schema,
            json!({"cmd":"history_restore","actor":"A","checkpoint":checkpoint})
        )["ok"],
        true
    );
    let undone = ask(&mut s, &schema, json!({"cmd":"history_undo"}));
    assert_eq!(undone["ok"], true, "{undone}");
    assert_eq!(undone["state"]["model"]["children"][1]["type"], "on");
    let redone = ask(&mut s, &schema, json!({"cmd":"history_redo"}));
    assert_eq!(redone["ok"], true, "{redone}");
    assert_eq!(redone["state"]["model"]["children"][1]["type"], "off");
    assert_eq!(
        redone["state"]["model"]["children"][1]["runs"][0]["units"],
        json!([120, 120])
    );
}

#[test]
fn graphic_text_flag_uses_immutable_birth_spec() {
    let m = json!({"domain":"graphic","root":"canvas","marks":[],"nodes":{"canvas":{"shape":"container","children":["off","on"]},"off":{"shape":"text","text":false},"on":{"shape":"text"}}});
    let (mut s, schema) = new(m);
    let mut off = node("1@A", "0@~root", "off");
    off["boundary"] = json!("");
    let mut on = node("2@A", "1@A", "on");
    on["boundary"] = json!("");
    apply(&mut s, &schema, vec![off, on]);
    rejected(&mut s, &schema, vec![text("3@A", "0@1@A/text")]);
    apply(&mut s, &schema, vec![text("3@A", "0@2@A/text")]);
}
