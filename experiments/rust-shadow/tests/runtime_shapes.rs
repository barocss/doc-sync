use doc_sync_rust_shadow::{runtime_schema::RuntimeSchema, Server};
use serde_json::{json, Value};
fn schema() -> Value {
    json!({"root":"book","marks":["emphasis"],"markValues":{"target":{"default":"","inherit":false},"score":{"default":0,"min":0},"note":{"default":null}},"nodes":{
        "book":{"shape":"flow","children":["line","stack","box","matrix"],"default":"line"},
        "line":{"shape":"text","children":["badge","reference"],"attrs":{"label":{"default":""}}},
        "entry":{"shape":"text","children":["badge","reference"],"attrs":{"depth":{"default":1},"style":{"default":"bullet"},"label":{"default":""}}},
        "stack":{"shape":"group","children":["entry"],"by":["depth","style"]},
        "bundle":{"shape":"group","children":["entry"],"by":["style"]},
        "box":{"shape":"flow","children":["line","bundle","box"],"default":"line"},
        "badge":{"shape":"inline","attrs":{"label":{"default":""},"width":{"default":0,"min":0}}},
        "reference":{"shape":"span","mark":"target","attr":"href"},
        "matrix":{"shape":"grid","children":["band"]},"band":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["line","bundle"],"default":"line"}
    }})
}
fn ticket(key: &str) -> Value {
    let (n, a) = key.split_once('@').unwrap();
    json!({"lamport":n.parse::<u64>().unwrap(),"actor":a})
}
fn ask(s: &mut Server, mut r: Value) -> Value {
    r["replica"] = json!("r");
    r["schema"] = json!(RuntimeSchema::compile(schema()).unwrap().identity());
    s.request(r)
}
fn new() -> Server {
    let mut s = Server::default();
    let r = ask(
        &mut s,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema()}),
    );
    assert_eq!(r["ok"], true, "{r}");
    s
}
fn node(id: &str, origin: &str, kind: &str, attrs: Value) -> Value {
    let mut v =
        json!({"t":"node","id":ticket(id),"origin":ticket(origin),"type":kind,"attrs":attrs});
    if schema()["nodes"][kind]["shape"] == "text" {
        v["boundary"] = json!(format!("{origin}|end"));
    }
    v
}
fn text(id: &str, origin: &str, units: Value, marks: Value) -> Value {
    json!({"t":"text","id":ticket(id),"origin":ticket(origin),"units":units,"marks":marks})
}
fn set(id: &str, target: &str, key: &str, value: Value) -> Value {
    json!({"t":"set","at":ticket(id),"ids":[ticket(target)],"key":key,"value":value})
}
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    let r = ask(s, json!({"cmd":"apply","ops":ops}));
    assert_eq!(r["ok"], true, "{r}");
    r["state"].clone()
}
fn record(s: &mut Server, ops: Vec<Value>) -> Value {
    let r = ask(
        s,
        json!({"cmd":"history_record","ops":ops,"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(r["ok"], true, "{r}");
    r
}
#[test]
fn arbitrary_shapes_compile_and_groups_follow_each_flow_context() {
    let mut s = new();
    let state = apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "entry", json!({})),
            node("2@A", "1@A", "entry", json!({"depth":2})),
            node("3@A", "2@A", "box", json!({})),
            node("4@A", "0@3@A/body", "entry", json!({})),
            node("5@A", "4@A", "entry", json!({"depth":2})),
        ],
    );
    let children = &state["model"]["children"];
    assert_eq!(children[1]["type"], "stack");
    assert_eq!(children[2]["attrs"], json!({"depth":2,"style":"bullet"}));
    assert_eq!(children[1]["children"][0]["attrs"], json!({"label":""}));
    let group = &children[3]["children"][1];
    assert_eq!(group["type"], "bundle");
    assert_eq!(group["attrs"], json!({"style":"bullet"}));
    assert_eq!(group["children"].as_array().unwrap().len(), 2);
    assert_eq!(group["children"][1]["attrs"]["depth"], 2);
}
#[test]
fn inline_atoms_split_spans_and_keep_utf16_selection_positions() {
    let mut s = new();
    let state = apply(
        &mut s,
        vec![
            text(
                "1@A",
                "0@~root",
                json!([0xd83d, 0xde00]),
                json!({"target":"same","emphasis":true}),
            ),
            node("3@A", "2@A", "badge", json!({"label":"x"})),
            text("4@A", "3@A", json!([0xd800]), json!({"target":"same"})),
        ],
    );
    assert_eq!(
        state["model"]["children"][0]["runs"],
        json!([{"type":"reference","attrs":{"href":"same"},"runs":[{"units":[0xd83d,0xde00],"marks":{"emphasis":true}}]},{"type":"badge","attrs":{"label":"x","width":0}},{"type":"reference","attrs":{"href":"same"},"runs":[{"units":[0xd800],"marks":{}}]}])
    );
    let captured = ask(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[0,2],"focus":[0,4]}}),
    );
    assert_eq!(captured["ok"], true, "{captured}");
    let resolved = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":captured["range"]}),
    );
    assert_eq!(resolved["range"], json!({"anchor":[0,2],"focus":[0,4]}));
    apply(
        &mut s,
        vec![json!({"t":"del","at":ticket("5@A"),"ids":[ticket("3@A")]})],
    );
    let runs = ask(&mut s, json!({"cmd":"state"}))["state"]["model"]["children"][0]["runs"].clone();
    assert_eq!(runs.as_array().unwrap().len(), 1);
    assert_eq!(runs[0]["runs"].as_array().unwrap().len(), 2);
}
#[test]
fn scalar_value_marks_history_keeps_foreign_writers_and_restores() {
    let mut s = new();
    apply(
        &mut s,
        vec![text(
            "1@A",
            "0@~root",
            json!([97, 98, 99]),
            json!({"score":2,"note":"n"}),
        )],
    );
    record(
        &mut s,
        vec![
            set("4@A", "1@A", "target", json!("local")),
            set("5@A", "2@A", "target", json!("local")),
        ],
    );
    apply(&mut s, vec![set("6@B", "2@A", "target", json!("foreign"))]);
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undo["ok"], true, "{undo}");
    assert_eq!(
        undo["state"]["model"]["children"][0]["runs"][1]["attrs"]["href"],
        "foreign"
    );
    let redo = ask(&mut s, json!({"cmd":"history_redo"}));
    assert_eq!(redo["ok"], true, "{redo}");
    assert_eq!(
        redo["state"]["model"]["children"][0]["runs"][0]["attrs"]["href"],
        "local"
    );
    assert_eq!(
        redo["state"]["model"]["children"][0]["runs"][1]["attrs"]["href"],
        "foreign"
    );
    let cp = ask(&mut s, json!({"cmd":"history_export"}))["checkpoint"].clone();
    let restored = ask(&mut s, json!({"cmd":"history_restore","checkpoint":cp}));
    assert_eq!(restored["ok"], true, "{restored}");
    assert_eq!(restored["state"], redo["state"]);
}
#[test]
fn invalid_derived_births_and_structured_marks_fail_atomically() {
    let mut s = new();
    let before = ask(&mut s, json!({"cmd":"snapshot"}))["snapshot"].clone();
    for op in [
        node("1@A", "0@~root", "stack", json!({})),
        node("1@A", "0@~root", "reference", json!({})),
        text("1@A", "0@~root", json!([97]), json!({"note":{"$bad":1}})),
        set("1@A", "0@~root", "target", json!("node")),
    ] {
        let r = ask(&mut s, json!({"cmd":"apply","ops":[op]}));
        assert_eq!(r["ok"], false, "{r}");
        assert_eq!(ask(&mut s, json!({"cmd":"snapshot"}))["snapshot"], before);
    }
    let mut bad = schema();
    bad["markValues"]["target"]["fields"] = json!({"x":{"default":""}});
    assert!(RuntimeSchema::compile(bad)
        .unwrap_err()
        .contains("$.markValues.target"));
}
#[test]
fn groups_inline_and_spans_project_in_grid_cell_body() {
    let mut s = new();
    let st = apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "matrix", json!({})),
            node("2@A", "0@1@A/rows", "band", json!({})),
            node("3@A", "0@1@A/cols", "col", json!({})),
            node("4@A", "0@1@A/cell:2@A,3@A", "entry", json!({})),
            text("5@A", "4@A", json!([97]), json!({"target":"cell"})),
            node("6@A", "5@A", "badge", json!({"label":"cell"})),
        ],
    );
    let group =
        &st["model"]["children"][1]["children"][0]["children"][0]["children"][0]["children"][1];
    assert_eq!(group["type"], "bundle");
    assert_eq!(group["children"][0]["runs"][0]["attrs"]["href"], "cell");
    assert_eq!(group["children"][0]["runs"][1]["type"], "badge");
}
fn custom(s: &mut Server, manifest: &Value, mut request: Value) -> Value {
    request["replica"] = json!("r");
    request["schema"] = json!(RuntimeSchema::compile(manifest.clone()).unwrap().identity());
    s.request(request)
}
fn minimal() -> Value {
    json!({"root":"root","marks":["on"],"markValues":{"target":{"default":null},"second":{"default":""},"score":{"default":0},"enabled":{"default":false}},"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text","children":["later","earlier","chip"]},"earlier":{"shape":"span","mark":"target","attr":"destination"},"later":{"shape":"span","mark":"second","attr":"color"},"chip":{"shape":"inline"}}})
}
#[test]
fn flat_root_value_marks_use_schema_span_order_scalar_equality_and_resets() {
    let mut manifest = minimal();
    let mut s = Server::default();
    let r = custom(
        &mut s,
        &manifest,
        json!({"cmd":"new","actor":"A","runtimeSchema":manifest}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let r = custom(
        &mut s,
        &manifest,
        json!({"cmd":"apply","ops":[text("1@A","0@~root",json!([97]),json!({"target":0,"second":"red","score":2,"enabled":true})),text("2@A","1@A",json!([98]),json!({"target":0.0,"second":"blue"})),text("3@A","2@A",json!([99]),json!({"target":false})),node("4@A","3@A","chip",json!({})),text("5@A","4@A",json!([100]),json!({"target":""})),text("6@A","5@A",json!([101]),json!({"target":null,"score":0,"enabled":false,"second":""}))]}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let runs = &r["state"]["model"]["children"][0]["runs"];
    assert_eq!(runs.as_array().unwrap().len(), 5);
    assert_eq!(runs[0]["type"], "earlier");
    assert_eq!(runs[0]["runs"].as_array().unwrap().len(), 2);
    assert_eq!(
        runs[0]["runs"][0]["marks"],
        json!({"second":"red","score":2,"enabled":true})
    );
    assert_eq!(runs[1]["attrs"]["destination"], false);
    assert_eq!(runs[2], json!({"type":"chip"}));
    assert_eq!(runs[3]["attrs"]["destination"], "");
    assert_eq!(runs[4], json!({"units":[101],"marks":{}}));
    let r = custom(
        &mut s,
        &manifest,
        json!({"cmd":"apply","ops":[set("7@A","1@A","target",Value::Null),set("8@A","1@A","second",Value::Null),set("9@A","1@A","score",Value::Null),set("10@A","1@A","enabled",Value::Null)]}),
    );
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(
        r["state"]["model"]["children"][0]["runs"][0],
        json!({"units":[97],"marks":{}})
    );
    // Descriptor declaration order decides the first wrapper; text child order does not.
    let earlier = manifest["nodes"]
        .as_object_mut()
        .unwrap()
        .shift_remove("earlier")
        .unwrap();
    manifest["nodes"]["earlier"] = earlier;
    let mut other = Server::default();
    assert_eq!(
        custom(
            &mut other,
            &manifest,
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest})
        )["ok"],
        true
    );
    let r = custom(
        &mut other,
        &manifest,
        json!({"cmd":"apply","ops":[text("1@A","0@~root",json!([97]),json!({"target":0,"second":"red"}))]}),
    );
    assert_eq!(
        r["state"]["model"]["children"][0]["runs"][0]["type"],
        "later"
    );
    assert_eq!(
        r["state"]["model"]["children"][0]["runs"][0]["runs"][0]["marks"],
        json!({"target":0})
    );
}
#[test]
fn flat_group_default_and_inline_only_schemas_activate_native_projection() {
    for manifest in [
        json!({"root":"root","marks":[],"nodes":{"root":{"shape":"flow","children":["collection"],"default":"entry"},"collection":{"shape":"group","children":["entry"],"by":[]},"entry":{"shape":"text"}}}),
        json!({"root":"root","marks":[],"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text","children":["chip"]},"chip":{"shape":"inline"}}}),
    ] {
        let mut s = Server::default();
        let r = custom(
            &mut s,
            &manifest,
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest}),
        );
        assert_eq!(r["ok"], true, "{r}");
        if manifest["nodes"].get("collection").is_some() {
            assert_eq!(
                r["state"]["model"]["children"],
                json!([{"type":"collection","children":[{"type":"entry","runs":[]}]}])
            );
            let captured = custom(
                &mut s,
                &manifest,
                json!({"cmd":"selection_capture","range":{"anchor":[0,0,0],"focus":[0,0,0]}}),
            );
            assert_eq!(captured["ok"], true, "{captured}");
        } else {
            let r = custom(
                &mut s,
                &manifest,
                json!({"cmd":"apply","ops":[node("1@A","0@~root","chip",json!({}))]}),
            );
            assert_eq!(r["ok"], true, "{r}");
            assert_eq!(
                r["state"]["model"]["children"][0]["runs"],
                json!([{"type":"chip"}])
            )
        }
    }
}
#[test]
fn value_marks_without_span_project_scalar_values_and_reject_types_and_ranges() {
    let manifest = json!({"root":"root","marks":[],"markValues":{"amount":{"default":0,"min":0,"max":3},"free":{"default":null}},"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text"}}});
    let mut s = Server::default();
    assert_eq!(
        custom(
            &mut s,
            &manifest,
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest})
        )["ok"],
        true
    );
    let r = custom(
        &mut s,
        &manifest,
        json!({"cmd":"apply","ops":[text("1@A","0@~root",json!([97]),json!({"amount":2,"free":false}))]}),
    );
    assert_eq!(
        r["state"]["model"]["children"][0]["runs"],
        json!([{"units":[97],"marks":{"amount":2,"free":false}}])
    );
    for (key, v) in [
        ("amount", json!(4)),
        ("amount", json!("2")),
        ("free", json!([{"$bad":1}])),
        ("free", json!({"$bad":1})),
    ] {
        let r = custom(
            &mut s,
            &manifest,
            json!({"cmd":"apply","ops":[set("2@A","1@A",key,v)]}),
        );
        assert_eq!(r["ok"], false, "{r}");
    }
}
#[test]
fn group_and_inline_own_history_does_not_overwrite_foreign_writers() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "entry", json!({})),
            node("2@A", "1@A", "entry", json!({})),
            node("3@A", "2@A", "badge", json!({"label":"born"})),
        ],
    );
    record(
        &mut s,
        vec![
            set("4@A", "2@A", "depth", json!(2)),
            set("5@A", "3@A", "label", json!("local")),
        ],
    );
    apply(&mut s, vec![set("6@B", "3@A", "label", json!("foreign"))]);
    let captured = ask(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[2,0,0],"focus":[2,0,1]}}),
    );
    assert_eq!(captured["ok"], true, "{captured}");
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undo["ok"], true, "{undo}");
    let group = &undo["state"]["model"]["children"][1];
    assert_eq!(group["children"].as_array().unwrap().len(), 2);
    assert_eq!(group["children"][1]["runs"][0]["attrs"]["label"], "foreign");
    let resolved = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":captured["range"]}),
    );
    assert_eq!(resolved["range"], json!({"anchor":[1,1,0],"focus":[1,1,1]}));
    let redo = ask(&mut s, json!({"cmd":"history_redo"}));
    assert_eq!(redo["ok"], true, "{redo}");
    assert_eq!(
        redo["state"]["model"]["children"][2]["children"][0]["runs"][0]["attrs"]["label"],
        "foreign"
    );
}
#[test]
fn scalar_numeric_marks_merge_runs_using_javascript_number_equality() {
    let manifest = json!({"root":"root","marks":[],"markValues":{"amount":{"default":null}},"nodes":{"root":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text"}}});
    let mut s = Server::default();
    assert_eq!(
        custom(
            &mut s,
            &manifest,
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest})
        )["ok"],
        true
    );
    let r = custom(
        &mut s,
        &manifest,
        json!({"cmd":"apply","ops":[text("1@A","0@~root",json!([97]),json!({"amount":1})),text("2@A","1@A",json!([98]),json!({"amount":1.0}))]}),
    );
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(
        r["state"]["model"]["children"][0]["runs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn moved_text_keeps_arbitrary_inline_positions_and_span_projection() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "entry", json!({})),
            text("2@A", "1@A", json!([97]), json!({"target":"moved"})),
            node("3@A", "2@A", "badge", json!({"label":"kept"})),
            node("4@A", "3@A", "box", json!({})),
        ],
    );
    let captured = ask(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[1,0,1],"focus":[1,0,2]}}),
    );
    assert_eq!(captured["ok"], true, "{captured}");
    let state = apply(
        &mut s,
        vec![
            json!({"t":"move","at":ticket("5@A"),"target":ticket("1@A"),"parent":ticket("0@4@A/body"),"after":null}),
        ],
    );
    assert!(state["placements"].get("3@A").is_none(), "{state}");
    let entry = &state["model"]["children"][1]["children"][0]["children"][0];
    assert_eq!(entry["runs"][0]["attrs"]["href"], "moved");
    assert_eq!(entry["runs"][1]["attrs"]["label"], "kept");
    let resolved = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":captured["range"]}),
    );
    assert_eq!(
        resolved["range"],
        json!({"anchor":[1,0,0,1],"focus":[1,0,0,2]})
    );
}
