use doc_sync_rust_shadow::{
    Server, NESTED_CAPABILITY, NESTED_SCHEMA, SHAPES_CAPABILITY, SHAPES_FORMAT, SHAPES_SCHEMA,
};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn key(k: &str) -> Value {
    let (n, a) = k.split_once('@').unwrap();
    t(n.parse().unwrap(), a)
}
fn ask(s: &mut Server, mut v: Value) -> Value {
    v["schema"] = json!(SHAPES_SCHEMA);
    v["replica"] = json!("r");
    s.request(v)
}
fn new() -> Server {
    let mut s = Server::default();
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"new","actor":"A","capabilities":[SHAPES_CAPABILITY]})
        )["ok"],
        true
    );
    s
}
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    let v = ask(s, json!({"cmd":"apply","ops":ops}));
    assert_eq!(v["ok"], true, "{v}");
    v["state"].clone()
}
fn node(n: u64, origin: &str, type_: &str) -> Value {
    json!({"t":"node","id":t(n,"A"),"origin":key(origin),"type":type_})
}
fn text(n: u64, a: &str, origin: &str, units: Vec<u16>) -> Value {
    json!({"t":"text","id":t(n,a),"origin":key(origin),"units":units})
}
fn set(n: u64, a: &str, id: &str, k: &str, v: Value) -> Value {
    json!({"t":"set","at":t(n,a),"ids":[key(id)],"key":k,"value":v})
}
fn checkpoint(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"history_export"}))["checkpoint"].clone()
}
fn restore(s: &mut Server, c: Value) -> Value {
    ask(s, json!({"cmd":"history_restore","checkpoint":c}))
}
fn record(s: &mut Server, ops: Vec<Value>) -> Value {
    let v = ask(
        s,
        json!({"cmd":"history_record","ops":ops,"now":1000,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(v["ok"], true, "{v}");
    v
}

fn item(n: u64, origin: &str, attrs: Value) -> Value {
    let mut v = node(n, origin, "list-item");
    v["boundary"] = json!(format!("{origin}|end"));
    v["attrs"] = attrs;
    v
}
fn state(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"state"}))["state"].clone()
}
#[test]
fn v5_identity_is_explicit_and_older_modes_reject_new_shapes() {
    let mut s = new();
    let c = checkpoint(&mut s);
    assert_eq!(c["document"]["format"], SHAPES_FORMAT);
    let mut bad = c.clone();
    bad["document"]["capabilities"] = json!([NESTED_CAPABILITY]);
    assert_eq!(restore(&mut s, bad)["ok"], false);
    assert_eq!(checkpoint(&mut s), c);
    let mut old = Server::default();
    assert_eq!(old.request(json!({"cmd":"new","replica":"r","actor":"A","schema":NESTED_SCHEMA,"capabilities":[NESTED_CAPABILITY]}))["ok"],true);
    for op in [
        item(1, "0@~root", json!({})),
        node(1, "0@~root", "inline-image"),
        text_mark(1, "0@~root", vec![97], json!({"link":"url"})),
        set(1, "A", "0@~root", "$type", json!("list-item")),
    ] {
        assert_eq!(
            old.request(json!({"cmd":"apply","replica":"r","schema":NESTED_SCHEMA,"ops":[op]}))
                ["ok"],
            false
        );
    }
    for type_ in ["list", "inline-hyperlink"] {
        let before = checkpoint(&mut s);
        assert_eq!(
            ask(
                &mut s,
                json!({"cmd":"apply","ops":[node(1,"0@~root",type_)]})
            )["ok"],
            false
        );
        assert_eq!(checkpoint(&mut s), before);
    }
}
fn text_mark(n: u64, origin: &str, units: Vec<u16>, marks: Value) -> Value {
    let mut v = text(n, "A", origin, units);
    v["marks"] = marks;
    v
}
#[test]
fn contiguous_lists_group_by_level_and_kind_and_keep_flat_item_identity() {
    // JSON accepts distinct numeric spellings; JavaScript groups both as 1.
    let mut numbers = new();
    let numeric = apply(
        &mut numbers,
        vec![
            item(1, "0@~root", json!({"level":1.0})),
            item(2, "1@A", json!({"level":1})),
        ],
    );
    assert_eq!(numeric["model"]["children"].as_array().unwrap().len(), 2);
    assert_eq!(
        numeric["model"]["children"][1]["children"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let mut s = new();
    let st = apply(
        &mut s,
        vec![
            item(1, "0@~root", json!({})),
            text(2, "A", "1@A", vec![97]),
            item(3, "2@A", json!({})),
            text(4, "A", "3@A", vec![98]),
            item(5, "4@A", json!({"level":2})),
            item(6, "5@A", json!({"level":2,"listType":"ordered"})),
        ],
    );
    let children = st["model"]["children"].as_array().unwrap();
    assert_eq!(children.len(), 4);
    assert_eq!(children[1]["attrs"], json!({"level":1,"listType":"bullet"}));
    assert_eq!(children[1]["children"].as_array().unwrap().len(), 2);
    assert_eq!(
        children[1]["children"][0]["attrs"],
        json!({"align":"left","meta":null})
    );
    assert_eq!(children[2]["attrs"], json!({"level":2,"listType":"bullet"}));
    assert_eq!(
        children[3]["attrs"],
        json!({"level":2,"listType":"ordered"})
    );
    assert_eq!(st["lines"].as_array().unwrap().len(), 1);
    let merged = apply(
        &mut s,
        vec![
            set(7, "A", "5@A", "level", Value::Null),
            set(8, "A", "6@A", "level", Value::Null),
            set(9, "A", "6@A", "listType", Value::Null),
        ],
    );
    assert_eq!(merged["model"]["children"].as_array().unwrap().len(), 2);
    assert_eq!(
        merged["model"]["children"][1]["children"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
}
#[test]
fn inline_is_one_utf16_slot_with_immutable_birth_and_separate_attributes() {
    let mut s = new();
    let mut image = node(3, "2@A", "inline-image");
    image["attrs"] = json!({"src":"a","meta":{"label":"x"}});
    let st = apply(
        &mut s,
        vec![
            item(1, "0@~root", json!({})),
            text(2, "A", "1@A", vec![0xd800]),
            image,
            text(4, "A", "3@A", vec![0xdc00]),
        ],
    );
    assert_eq!(st["blocks"][1]["textUnits"], json!([0xd800, 65532, 0xdc00]));
    assert_eq!(st["blocks"][1]["chars"], json!(["2@A", "3@A", "4@A"]));
    let runs = &st["model"]["children"][1]["children"][0]["runs"];
    assert_eq!(
        runs[1],
        json!({"type":"inline-image","attrs":{"src":"a","width":0,"decorative":false,"meta":{"label":"x"}}})
    );
    let range = json!({"anchor":[1,0,1],"focus":[1,0,3]});
    let captured = ask(&mut s, json!({"cmd":"selection_capture","range":range}));
    assert_eq!(captured["range"], json!({"anchor":"2@A","focus":"4@A"}));
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"selection_resolve","range":captured["range"]})
        )["range"],
        range
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c.clone())["state"], st);
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"apply","ops":[set(5,"A","3@A","$type",json!("image"))]})
        )["ok"],
        false
    );
    let mut bad = c.clone();
    let i = bad["document"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .position(|x| x["id"] == t(3, "A"))
        .unwrap();
    bad["document"]["items"][i]["node"]["born"] = json!("image");
    assert_eq!(restore(&mut s, bad)["ok"], false);
    assert_eq!(checkpoint(&mut s), c);
}
#[test]
fn string_link_spans_split_at_inline_and_preserve_boolean_runs() {
    let mut s = new();
    let st = apply(
        &mut s,
        vec![
            text_mark(
                1,
                "0@~root",
                vec![97, 98],
                json!({"link":"url","bold":true}),
            ),
            text_mark(3, "2@A", vec![99], json!({"link":"url","italic":true})),
            node(4, "3@A", "inline-image"),
            text_mark(5, "4@A", vec![100], json!({"link":"url"})),
            text_mark(6, "5@A", vec![101], json!({"link":""})),
            text_mark(7, "6@A", vec![102], json!({"link":null,"bold":false})),
        ],
    );
    let runs = &st["model"]["children"][0]["runs"];
    assert_eq!(runs.as_array().unwrap().len(), 4);
    assert_eq!(
        runs[0],
        json!({"type":"inline-hyperlink","attrs":{"url":"url"},"runs":[{"units":[97,98],"marks":{"bold":true}},{"units":[99],"marks":{"italic":true}}]})
    );
    assert_eq!(runs[1]["type"], "inline-image");
    assert_eq!(runs[2]["runs"], json!([{"units":[100],"marks":{}}]));
    assert_eq!(runs[3], json!({"units":[101,102],"marks":{}}));
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["state"], st);
}
#[test]
fn link_and_group_history_preserve_foreign_same_value_ownership() {
    let mut s = new();
    apply(
        &mut s,
        vec![item(1, "0@~root", json!({})), text(2, "A", "1@A", vec![97])],
    );
    record(
        &mut s,
        vec![
            set(3, "A", "2@A", "link", json!("url")),
            set(4, "A", "1@A", "listType", json!("ordered")),
        ],
    );
    apply(
        &mut s,
        vec![
            set(5, "B", "2@A", "link", json!("url")),
            set(6, "B", "1@A", "listType", json!("ordered")),
        ],
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undo["ops"], json!([]));
    assert_eq!(undo["caret"], "before");
    assert_eq!(
        undo["state"]["model"]["children"][1]["attrs"]["listType"],
        "ordered"
    );
    assert_eq!(
        undo["state"]["model"]["children"][1]["children"][0]["runs"][0]["attrs"]["url"],
        "url"
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_redo"}))["ops"], json!([]));
}
#[test]
fn native_link_inverse_uses_exact_prior_values_and_carets_after_restore() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            text_mark(1, "0@~root", vec![97], json!({"link":"old"})),
            text(2, "A", "1@A", vec![98]),
        ],
    );
    record(
        &mut s,
        vec![json!({"t":"set","at":t(3,"A"),"ids":[t(1,"A"),t(2,"A")],"key":"link","value":"new"})],
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        undo["ops"],
        json!([
            set(4, "A", "1@A", "link", json!("old")),
            set(5, "A", "2@A", "link", Value::Null)
        ])
    );
    assert_eq!(undo["caret"], "before");
    let redo = ask(&mut s, json!({"cmd":"history_redo"}));
    assert_eq!(
        redo["ops"],
        json!([{"t":"set","at":t(6,"A"),"ids":[t(1,"A"),t(2,"A")],"key":"link","value":"new"}])
    );
    assert_eq!(redo["caret"], "after");
}
#[test]
fn deletion_hides_nested_group_selections_and_keeps_foreign_span_inline_storage() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node(1, "0@~root", "callout"),
            item(2, "0@1@A/body", json!({})),
            text(3, "A", "2@A", vec![97]),
        ],
    );
    record(
        &mut s,
        vec![json!({"t":"del","at":t(4,"A"),"ids":[t(1,"A")]})],
    );
    let foreign = vec![
        json!({"t":"text","id":t(5,"B"),"origin":t(3,"A"),"units":[98],"marks":{"link":"foreign"}}),
        json!({"t":"node","id":t(6,"B"),"origin":t(5,"B"),"type":"inline-image","attrs":{"src":"foreign"}}),
    ];
    apply(&mut s, foreign.clone());
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
    let h = ask(&mut s, json!({"cmd":"history_state"}))["history"].clone();
    for _ in 0..2 {
        apply(&mut s, foreign.clone());
    }
    assert_eq!(ask(&mut s, json!({"cmd":"history_state"}))["history"], h);
    let anchors = json!({"anchor":"5@B","focus":"6@B"});
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        Value::Null
    );
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        undo["state"]["model"]["children"][1]["children"][1]["children"][0]["runs"][1]["attrs"]
            ["url"],
        "foreign"
    );
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        json!({"anchor":[1,1,0,2],"focus":[1,1,0,3]})
    );
    ask(&mut s, json!({"cmd":"history_redo"}));
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        Value::Null
    );
    assert_eq!(state(&mut s)["counts"]["tokens"], 5);
}
#[test]
fn invalid_value_marks_and_snapshot_birth_registers_are_atomic() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            text_mark(1, "0@~root", vec![97], json!({"link":"old"})),
            node(2, "1@A", "inline-image"),
        ],
    );
    let c = checkpoint(&mut s);
    for value in [json!(true), json!(0), json!([]), json!({"url":"x"})] {
        assert_eq!(
            ask(
                &mut s,
                json!({"cmd":"apply","ops":[set(3,"A","1@A","link",value)]})
            )["ok"],
            false
        );
        assert_eq!(checkpoint(&mut s), c);
    }
    let mut bad = c.clone();
    bad["document"]["items"][1]["birth_marks"]["link"] = json!("forged");
    assert_eq!(restore(&mut s, bad)["ok"], false);
    assert_eq!(checkpoint(&mut s), c);
}
#[test]
fn text_type_history_changes_group_paths_without_changing_token_identity() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            text(1, "A", "0@~root", vec![97]),
            item(2, "1@A", json!({})),
            text(3, "A", "2@A", vec![98]),
        ],
    );
    record(
        &mut s,
        vec![set(4, "A", "0@~root", "$type", json!("list-item"))],
    );
    let anchors = json!({"anchor":"1@A","focus":"3@A"});
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        json!({"anchor":[0,0,1],"focus":[0,1,1]})
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        undo["ops"],
        json!([set(5, "A", "0@~root", "$type", Value::Null)])
    );
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        json!({"anchor":[0,1],"focus":[1,0,1]})
    );
    ask(&mut s, json!({"cmd":"history_redo"}));
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        json!({"anchor":[0,0,1],"focus":[0,1,1]})
    );
}
#[test]
fn covered_cell_group_retains_inline_and_link_but_hides_all_model_positions() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node(1, "0@~root", "table"),
            node(2, "0@1@A/rows", "table-row"),
            node(3, "0@1@A/cols", "col"),
            node(4, "3@A", "col"),
            item(5, "0@1@A/cell:2@A,4@A", json!({})),
            text_mark(6, "5@A", vec![97], json!({"link":"cell"})),
            node(7, "6@A", "inline-image"),
        ],
    );
    let anchors = json!({"anchor":"6@A","focus":"7@A"});
    let visible = json!({"anchor":[1,0,1,0,1,0,1],"focus":[1,0,1,0,1,0,2]});
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        visible
    );
    record(
        &mut s,
        vec![set(
            8,
            "A",
            "1@A",
            "$span:2@A,3@A",
            json!({"row":"2@A","col":"4@A"}),
        )],
    );
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_capture","range":visible}))["range"],
        Value::Null
    );
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        Value::Null
    );
    let st = state(&mut s);
    assert_eq!(
        st["model"]["children"][1]["children"][0]["children"][1]["attrs"]["spanned"],
        true
    );
    assert_eq!(
        st["model"]["children"][1]["children"][0]["children"][1]["children"][0]["children"][1]
            ["children"][0]["runs"][1]["type"],
        "inline-image"
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["state"], st);
    ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_resolve","range":anchors}))["range"],
        visible
    );
}
