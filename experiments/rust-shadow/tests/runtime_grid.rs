use doc_sync_rust_shadow::{runtime_schema::RuntimeSchema, Server};
use serde_json::{json, Value};
fn schema() -> Value {
    json!({"root":"book","marks":["em"],"nodes":{
        "book":{"shape":"flow","children":["line","box","matrix"],"default":"line"},
        "line":{"shape":"text"},"caption":{"shape":"text","attrs":{"align":{"default":"right"}}},
        "box":{"shape":"flow","children":["line","matrix","box"],"default":"line"},
        "matrix":{"shape":"grid","children":["band"],"attrs":{"name":{"default":""}}},
        "band":{"shape":"row","children":["entry"]},
        "entry":{"shape":"cell","children":["contents"],"attrs":{"shade":{"default":""},"colspan":{"default":1,"computed":true},"rowspan":{"default":1,"computed":true},"spanned":{"default":false,"computed":true}}},
        "contents":{"shape":"flow","children":["caption","box","matrix"],"default":"caption"}
    }})
}
fn t(key: &str) -> Value {
    let (n, a) = key.split_once('@').unwrap();
    json!({"lamport":n.parse::<u64>().unwrap(),"actor":a})
}
fn node(id: &str, origin: &str, kind: &str) -> Value {
    json!({"t":"node","id":t(id),"origin":t(origin),"type":kind})
}
fn text(id: &str, origin: &str, units: Vec<u16>) -> Value {
    json!({"t":"text","id":t(id),"origin":t(origin),"units":units,"marks":{"em":true}})
}
fn set(id: &str, target: &str, key: &str, value: Value) -> Value {
    json!({"t":"set","at":t(id),"ids":[t(target)],"key":key,"value":value})
}
fn ask(s: &mut Server, mut v: Value) -> Value {
    v["replica"] = json!("r");
    v["schema"] = json!(RuntimeSchema::compile(schema()).unwrap().identity());
    s.request(v)
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
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    let r = ask(s, json!({"cmd":"apply","ops":ops}));
    assert_eq!(r["ok"], true, "{r}");
    r["state"].clone()
}
fn cp(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"history_export"}))["checkpoint"].clone()
}
fn seed() -> Vec<Value> {
    vec![
        node("1@A", "0@~root", "matrix"),
        node("2@A", "0@1@A/rows", "band"),
        node("3@A", "2@A", "band"),
        node("4@A", "0@1@A/cols", "col"),
        node("5@A", "4@A", "col"),
    ]
}
fn model(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"state"}))["state"]["model"].clone()
}
#[test]
fn arbitrary_grid_chain_and_nested_defaults_project_without_preset_names() {
    let mut s = new();
    let state = apply(&mut s, seed());
    let grid = &state["model"]["children"][1];
    assert_eq!(grid["type"], "matrix");
    assert_eq!(grid["children"][0]["type"], "band");
    assert_eq!(
        grid["children"][0]["children"][0],
        json!({"type":"entry","children":[{"type":"contents","children":[{"type":"caption","attrs":{"align":"right"},"runs":[]}]}]})
    );
    apply(
        &mut s,
        vec![
            node("6@A", "0@1@A/cell:2@A,4@A", "box"),
            node("7@A", "0@6@A/body", "matrix"),
            node("8@A", "0@7@A/rows", "band"),
            node("9@A", "0@7@A/cols", "col"),
            text("10@A", "0@7@A/cell:8@A,9@A", vec![0xd83d, 0xde00, 0xd800]),
        ],
    );
    let m = model(&mut s);
    assert_eq!(
        m["children"][1]["children"][0]["children"][0]["children"][0]["children"][1]["children"][1]
            ["type"],
        "matrix"
    );
    let saved = cp(&mut s);
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(model(&mut s), m);
}
#[test]
fn grid_descriptors_reject_invalid_chains_and_unknown_computed_rules() {
    RuntimeSchema::compile(schema()).unwrap();
    for (kind, children) in [
        ("matrix", json!([])),
        ("matrix", json!(["band", "line"])),
        ("band", json!(["line"])),
        ("entry", json!(["matrix"])),
    ] {
        let mut bad = schema();
        bad["nodes"][kind]["children"] = children;
        assert!(RuntimeSchema::compile(bad)
            .unwrap_err()
            .contains(&format!("$.nodes.{kind}.children")));
    }
    for (kind, key, spec) in [
        ("matrix", "name", json!({"default":"","computed":true})),
        ("entry", "colspan", json!({"default":2,"computed":true})),
        ("entry", "custom", json!({"default":false,"computed":true})),
    ] {
        let mut bad = schema();
        bad["nodes"][kind]["attrs"][key] = spec;
        assert!(RuntimeSchema::compile(bad).is_err());
    }
    let mut bad = schema();
    bad["nodes"]["book"]["children"] = json!(["line", "box", "matrix", "band"]);
    assert!(RuntimeSchema::compile(bad).is_err());
}
#[test]
fn cell_writes_and_merge_keep_hidden_text_and_restore_history() {
    let mut s = new();
    apply(&mut s, seed());
    apply(
        &mut s,
        vec![
            text("6@B", "0@1@A/cell:3@A,5@A", vec![120]),
            set("7@A", "1@A", "$cell:2@A,4@A|shade", json!("blue")),
        ],
    );
    let merged = ask(
        &mut s,
        json!({"cmd":"history_record","ops":[set("8@A","1@A","$span:2@A,4@A",json!({"row":"3@A","col":"5@A"}))],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(merged["ok"], true, "{merged}");
    let m = model(&mut s);
    assert_eq!(
        m["children"][1]["children"][0]["children"][0]["attrs"],
        json!({"colspan":2,"rowspan":2,"shade":"blue"})
    );
    assert_eq!(
        m["children"][1]["children"][1]["children"][1]["attrs"]["spanned"],
        true
    );
    assert_eq!(
        m["children"][1]["children"][1]["children"][1]["children"][0]["children"][0]["runs"][0]
            ["units"],
        json!([120])
    );
    apply(
        &mut s,
        vec![
            text("9@B", "6@B", vec![121]),
            set("10@B", "1@A", "$cell:2@A,4@A|shade", json!("red")),
        ],
    );
    let saved = cp(&mut s);
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_undo"}))["ok"], true);
    let u = model(&mut s);
    assert_eq!(
        u["children"][1]["children"][0]["children"][0]["attrs"],
        json!({"shade":"red"})
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_redo"}))["ok"], true);
    assert_eq!(
        model(&mut s)["children"][1]["children"][1]["children"][1]["children"][0]["children"][0]
            ["runs"][0]["units"],
        json!([120, 121])
    );
}
#[test]
fn invalid_grid_batches_leave_document_and_history_unchanged() {
    let mut s = new();
    apply(&mut s, seed());
    for bad in [
        node("21@A", "0@1@A/rows", "entry"),
        node("21@A", "0@1@A/cols", "band"),
        node("21@A", "0@1@A/cell:2@A,4@A", "line"),
        text("21@A", "0@1@A/rows", vec![120]),
        set("21@A", "1@A", "$cell:2@A,4@A|colspan", json!(2)),
        set(
            "21@A",
            "1@A",
            "$span:2@A,4@A",
            json!({"row":"2@A","col":"2@A"}),
        ),
    ] {
        let before = cp(&mut s);
        let r = ask(
            &mut s,
            json!({"cmd":"history_record","ops":[text("20@A","0@1@A/cell:2@A,4@A",vec![97]),bad],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
        );
        assert_eq!(r["ok"], false, "{r}");
        assert_eq!(cp(&mut s), before);
    }
}

#[test]
fn multiple_grid_chains_use_their_own_wrappers_and_defaults() {
    let mut manifest = schema();
    manifest["nodes"]["book"]["children"]
        .as_array_mut()
        .unwrap()
        .push(json!("ledger"));
    manifest["nodes"]["ledger"] = json!({"shape":"grid","children":["record"]});
    manifest["nodes"]["record"] = json!({"shape":"row","children":["field"]});
    manifest["nodes"]["field"] = json!({"shape":"cell","children":["value"],"attrs":{"colspan":{"default":1,"min":1,"computed":true}}});
    manifest["nodes"]["value"] = json!({"shape":"flow","children":["line"],"default":"line"});
    let identity = RuntimeSchema::compile(manifest.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut s = Server::default();
    assert_eq!(s.request(json!({"cmd":"new","replica":"r","actor":"A","runtimeSchema":manifest,"schema":identity}))["ok"],true);
    let mut ops = seed();
    ops.extend([
        node("6@A", "1@A", "ledger"),
        node("7@A", "0@6@A/rows", "record"),
        node("8@A", "0@6@A/cols", "col"),
    ]);
    let r = s.request(json!({"cmd":"apply","replica":"r","schema":identity,"ops":ops}));
    assert_eq!(r["ok"], true, "{r}");
    let children = &r["state"]["model"]["children"];
    assert_eq!(
        children[1]["children"][0]["children"][0]["children"][0]["type"],
        "contents"
    );
    assert_eq!(
        children[2]["children"][0]["children"][0],
        json!({"type":"field","children":[{"type":"value","children":[{"type":"line","runs":[]}]}]})
    );
    for (origin, kind) in [
        ("0@1@A/rows", "record"),
        ("0@6@A/rows", "band"),
        ("0@6@A/cell:7@A,8@A", "caption"),
    ] {
        assert_eq!(s.request(json!({"cmd":"apply","replica":"r","schema":identity,"ops":[node("9@A",origin,kind)]}))["ok"],false);
    }
}
#[test]
fn concurrent_axis_and_cell_writes_converge_and_axis_undo_recovers_foreign_text() {
    let mut a = new();
    let mut b = new();
    apply(&mut a, seed());
    apply(&mut b, seed());
    let x = vec![
        node("6@X", "2@A", "band"),
        set("7@X", "1@A", "$cell:2@A,4@A|shade", json!("x")),
    ];
    let y = vec![
        node("6@Y", "2@A", "band"),
        set("7@Y", "1@A", "$cell:2@A,4@A|shade", json!("y")),
    ];
    apply(&mut a, x.clone());
    apply(&mut a, y.clone());
    apply(&mut b, y);
    apply(&mut b, x);
    assert_eq!(model(&mut a), model(&mut b));
    let recorded = ask(
        &mut a,
        json!({"cmd":"history_record","ops":[{"t":"del","at":t("8@A"),"ids":[t("6@X")]}],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(recorded["ok"], true, "{recorded}");
    apply(&mut a, vec![text("9@B", "0@1@A/cell:6@X,4@A", vec![122])]);
    let saved = cp(&mut a);
    assert_eq!(
        ask(
            &mut a,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(ask(&mut a, json!({"cmd":"history_undo"}))["ok"], true);
    let state = ask(&mut a, json!({"cmd":"state"}));
    assert!(state["state"]["model"].to_string().contains("122"));
    assert_eq!(ask(&mut a, json!({"cmd":"history_redo"}))["ok"], true);
    assert!(!model(&mut a).to_string().contains("122"));
    assert!(ask(&mut a, json!({"cmd":"state"}))["state"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|i| i["id"] == t("9@B")));
}
#[test]
fn grid_cell_selection_and_checkpoint_corruption_are_atomic() {
    let mut s = new();
    apply(&mut s, seed());
    apply(
        &mut s,
        vec![text("6@B", "0@1@A/cell:2@A,4@A", vec![97, 98])],
    );
    let range = json!({"anchor":[1,0,0,0,0,1],"focus":[1,0,0,0,0,2]});
    let captured = ask(&mut s, json!({"cmd":"selection_capture","range":range}));
    assert_eq!(captured["range"], json!({"anchor":"6@B","focus":"7@B"}));
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"selection_resolve","range":captured["range"]})
        )["range"],
        range
    );
    let good = cp(&mut s);
    let mut bad = good.clone();
    bad["document"]["ops"][1]["type"] = json!("entry");
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"history_restore","actor":"A","checkpoint":bad})
        )["ok"],
        false
    );
    assert_eq!(cp(&mut s), good);
    for kind in ["band", "contents"] {
        let mut bad = schema();
        bad["nodes"][kind]["attrs"] = json!({"ignored":{"default":"x"}});
        assert!(RuntimeSchema::compile(bad)
            .unwrap_err()
            .contains(&format!("$.nodes.{kind}.attrs")));
    }
}
