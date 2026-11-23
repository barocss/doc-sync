use doc_sync_rust_shadow::{
    runtime_schema::{validate_attribute, RuntimeSchema},
    Server,
};
use serde_json::{json, Value};
fn fields() -> Value {
    json!({"default":{"label":"plain","layout":{"width":0,"mode":"auto"},"tags":[]},"fields":{"label":{"default":"plain"},"layout":{"default":{"width":0,"mode":"auto"},"fields":{"width":{"default":0,"min":0,"max":100},"mode":{"default":"auto"}}},"tags":{"default":[]}}})
}
fn schema() -> Value {
    json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["p","title","box","list","rule","table"],"default":"p","childRules":{"title":{"min":1,"max":1},"box":{"min":1,"max":1},"list":{"min":1,"max":2},"rule":{"min":1,"max":1},"table":{"min":1,"max":1}}},"p":{"shape":"text"},"title":{"shape":"text","attrs":{"meta":fields()}},"box":{"shape":"flow","children":["p","title"],"default":"p","childRules":{"title":{"min":1}}},"list":{"shape":"group","children":["item"],"by":[]},"item":{"shape":"text"},"rule":{"shape":"atom"},"table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},"cell":{"shape":"cell","children":["body"],"attrs":{"meta":fields()}},"body":{"shape":"flow","children":["p"],"default":"p"}}})
}
fn t(s: &str) -> Value {
    let (n, a) = s.split_once('@').unwrap();
    json!({"lamport":n.parse::<u64>().unwrap(),"actor":a})
}
fn ask(s: &mut Server, cmd: Value) -> Value {
    let mut c = cmd;
    c["replica"] = json!("r");
    c["schema"] = json!(RuntimeSchema::compile(schema()).unwrap().identity());
    s.request(c)
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
fn key(kind: &str) -> String {
    format!("0@~required:0%40~root:{kind}:0")
}
#[test]
fn required_genesis_has_exact_addresses_shapes_and_nested_closure() {
    let mut s = new();
    let state = ask(&mut s, json!({"cmd":"state"}))["state"].clone();
    let children = state["model"]["children"].as_array().unwrap();
    assert_eq!(
        children
            .iter()
            .map(|n| n["type"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec!["p", "title", "box", "list", "rule", "table"]
    );
    let lines = state["lines"].as_array().unwrap();
    assert!(lines.iter().any(|l| l["key"] == key("title")));
    assert!(lines.iter().any(
        |l| l["key"] == "0@~required:0%401%40~required%3A0%2540~root%3Abox%3A0%2Fbody:title:0"
    ));
    assert_eq!(state["clock"], 0);
    assert_eq!(children[5]["children"].as_array().unwrap().len(), 1);
}
#[test]
fn nested_leaf_registers_converge_reset_and_restore_without_losing_writer() {
    let mut a = new();
    let mut b = new();
    let head = key("title");
    let left = json!({"t":"set","at":t("1@A"),"ids":[t(&head)],"key":"$field:[\"meta\",\"label\"]","value":"left"});
    let right = json!({"t":"set","at":t("1@B"),"ids":[t(&head)],"key":"$field:[\"meta\",\"layout\",\"width\"]","value":17});
    let x = apply(&mut a, vec![left.clone(), right.clone()]);
    let y = apply(&mut b, vec![right, left]);
    assert_eq!(x["model"], y["model"]);
    assert_eq!(
        x["model"]["children"][1]["attrs"]["meta"]["layout"]["width"],
        17
    );
    let reset = json!({"t":"set","at":t("2@A"),"ids":[t(&head)],"key":"$field:[\"meta\",\"layout\",\"width\"]","value":null});
    let state = apply(&mut a, vec![reset]);
    assert_eq!(
        state["model"]["children"][1]["attrs"]["meta"]["layout"]["width"],
        0
    );
    assert_eq!(
        state["model"]["children"][1]["attrs"]["meta"]["label"],
        "left"
    );
    let snap = ask(&mut a, json!({"cmd":"snapshot"}))["snapshot"].clone();
    let restored = ask(&mut b, json!({"cmd":"restore","actor":"B","snapshot":snap}));
    assert_eq!(restored["ok"], true, "{restored}");
    assert_eq!(ask(&mut b, json!({"cmd":"state"}))["state"], state);
}
#[test]
fn required_typing_is_concurrent_and_physical_maximum_hides_fallback_until_delete() {
    let mut a = new();
    let head = key("title");
    let state = apply(
        &mut a,
        vec![
            json!({"t":"text","id":t("1@A"),"origin":t(&head),"units":[65]}),
            json!({"t":"text","id":t("1@B"),"origin":t(&head),"units":[66]}),
        ],
    );
    assert_eq!(
        state["model"]["children"][1]["runs"][0]["units"],
        json!([66, 65])
    );
    let state = apply(
        &mut a,
        vec![
            json!({"t":"node","id":t("2@A"),"origin":t("0@~root"),"type":"title","boundary":"0@~root|end"}),
        ],
    );
    assert_eq!(
        state["model"]["children"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|n| n["type"] == "title")
            .count(),
        1
    );
    assert_eq!(state["model"]["children"][1]["runs"], json!([]));
    let state = apply(
        &mut a,
        vec![json!({"t":"del","at":t("3@A"),"ids":[t("2@A")]})],
    );
    assert_eq!(
        state["model"]["children"][1]["runs"][0]["units"],
        json!([66, 65])
    );
    let before = ask(&mut a, json!({"cmd":"snapshot"}))["snapshot"].clone();
    let bad = ask(
        &mut a,
        json!({"cmd":"apply","ops":[{"t":"del","at":t("4@A"),"ids":[t(&head)]}]}),
    );
    assert_eq!(bad["ok"], false);
    assert_eq!(ask(&mut a, json!({"cmd":"snapshot"}))["snapshot"], before);
}
#[test]
fn field_validation_and_required_cycles_fail_closed() {
    let s = schema();
    assert!(validate_attribute(
        &s,
        "title",
        "$field:[\"meta\",\"layout\",\"width\"]",
        &json!(10)
    )
    .is_ok());
    for v in [json!(101), json!("bad")] {
        assert!(
            validate_attribute(&s, "title", "$field:[\"meta\",\"layout\",\"width\"]", &v).is_err()
        );
    }
    assert!(validate_attribute(&s, "title", "meta", &json!({"label":"bad"})).is_err());
    let mut cycle = schema();
    cycle["nodes"]["box"]["children"] = json!(["p", "title", "box"]);
    cycle["nodes"]["box"]["childRules"]["box"] = json!({"min":1});
    assert!(RuntimeSchema::compile(cycle)
        .unwrap_err()
        .contains("required child cycle"));
    let mut marks = schema();
    marks["markValues"] = json!({"paint":fields()});
    assert!(RuntimeSchema::compile(marks)
        .unwrap_err()
        .contains("$.markValues.paint.fields"));
}
#[test]
fn nullable_composite_mark_values_keep_span_identity_and_plain_json_order() {
    let schema = json!({"root":"doc","marks":[],"markValues":{"paint":{"default":null},"raw":{"default":null}},"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text","children":["tint"]},"tint":{"shape":"span","mark":"paint","attr":"value"}}});
    let identity = RuntimeSchema::compile(schema.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut server = Server::default();
    assert_eq!(
        server.request(
            json!({"cmd":"new","replica":"r","actor":"A","schema":identity,"runtimeSchema":schema})
        )["ok"],
        true
    );
    let r=server.request(json!({"cmd":"apply","replica":"r","schema":identity,"ops":[{"t":"text","id":t("1@A"),"origin":t("0@~root"),"units":[0xd83d,0xde00],"marks":{"paint":{"tone":"warm"}}},{"t":"text","id":t("3@A"),"origin":t("2@A"),"units":[97],"marks":{"raw":{"a":1,"b":2}}},{"t":"text","id":t("4@A"),"origin":t("3@A"),"units":[98],"marks":{"raw":{"b":2,"a":1}}}]}));
    assert_eq!(r["ok"], true, "{r}");
    let runs = r["state"]["model"]["children"][0]["runs"]
        .as_array()
        .unwrap();
    assert_eq!(runs.len(), 4);
    assert_eq!(runs[0]["runs"][0]["units"], json!([0xd83d]));
    assert_eq!(runs[1]["runs"][0]["units"], json!([0xde00]));
    assert_eq!(runs[2]["units"], json!([97]));
    assert_eq!(runs[3]["units"], json!([98]));
    let snapshot = server.request(json!({"cmd":"snapshot","replica":"r","schema":identity}))
        ["snapshot"]
        .clone();
    assert_eq!(
        server.request(
            json!({"cmd":"restore","replica":"r","schema":identity,"actor":"A","snapshot":snapshot})
        )["ok"],
        true
    );
}
#[test]
fn structured_cell_registers_materialize_and_reset_independent_defaults() {
    let mut s = new();
    let owner = "1@~required:0%40~root:table:0";
    let row = "2@~required:0%40~root:table:0";
    let col = "3@~required:0%40~root:table:0";
    let key = format!("$cell:{row},{col}|$field:[\"meta\",\"layout\",\"width\"]");
    let state = apply(
        &mut s,
        vec![json!({"t":"set","at":t("4@A"),"ids":[t(owner)],"key":key,"value":7})],
    );
    assert_eq!(
        state["model"]["children"][5]["children"][0]["children"][0]["attrs"]["meta"]["layout"]
            ["width"],
        7
    );
    let state = apply(
        &mut s,
        vec![json!({"t":"set","at":t("5@A"),"ids":[t(owner)],"key":key,"value":null})],
    );
    assert_eq!(
        state["model"]["children"][5]["children"][0]["children"][0]["attrs"]["meta"],
        fields()["default"]
    );
}
#[test]
fn required_model_selection_uses_parent_paths_and_hides_superseded_slot() {
    let mut s = new();
    let capture = ask(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[1,0],"focus":[1,0]}}),
    );
    assert_eq!(
        capture["range"],
        json!({"anchor":key("title"),"focus":key("title")})
    );
    let resolved = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":capture["range"]}),
    );
    assert_eq!(resolved["range"], json!({"anchor":[1,0],"focus":[1,0]}));
    let _ = apply(
        &mut s,
        vec![
            json!({"t":"node","id":t("1@A"),"origin":t("0@~root"),"type":"title","boundary":"0@~root|end"}),
        ],
    );
    let resolved = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":capture["range"]}),
    );
    assert!(resolved["range"].is_null());
}
#[test]
fn moving_authored_rule_child_reveals_required_slot_and_preserves_private_edits() {
    let mut s = new();
    let title = key("title");
    let box_body = "0@1@~required:0%40~root:box:0/body";
    let _ = apply(
        &mut s,
        vec![
            json!({"t":"text","id":t("1@A"),"origin":t(&title),"units":[82]}),
            json!({"t":"node","id":t("2@A"),"origin":t("0@~root"),"type":"title","boundary":"0@~root|end"}),
            json!({"t":"text","id":t("3@A"),"origin":t("2@A"),"units":[80]}),
        ],
    );
    let state = apply(
        &mut s,
        vec![json!({"t":"move","at":t("4@A"),"target":t("2@A"),"parent":t(box_body),"after":null})],
    );
    assert_eq!(
        state["model"]["children"][1]["runs"][0]["units"],
        json!([82])
    );
    assert!(
        state["model"]["children"][2]["children"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["type"] == "title" && n["runs"][0]["units"] == json!([80])),
        "{}",
        state["model"]
    );
    let result = ask(
        &mut s,
        json!({"cmd":"apply","ops":[{"t":"move","at":t("5@A"),"target":t(&title),"parent":t(box_body),"after":null}]}),
    );
    assert_eq!(result["ok"], false);
}
#[test]
fn group_rules_count_contiguous_units_and_keep_required_slots_separate() {
    let mut manifest = schema();
    manifest["nodes"]["doc"]["childRules"]["list"] = json!({"min":2,"max":2});
    manifest["nodes"]["list"]["by"] = json!(["level"]);
    manifest["nodes"]["item"]["attrs"] = json!({"level":{"default":0}});
    let identity = RuntimeSchema::compile(manifest.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut server = Server::default();
    let ask = |server: &mut Server, mut request: Value| {
        request["replica"] = json!("r");
        request["schema"] = json!(identity);
        server.request(request)
    };
    let r = ask(
        &mut server,
        json!({"cmd":"new","actor":"A","runtimeSchema":manifest}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let initial = ask(&mut server, json!({"cmd":"state"}))["state"]["model"].clone();
    assert_eq!(
        initial["children"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|n| n["type"] == "list")
            .count(),
        2
    );
    let ops=(1..=3).map(|n|json!({"t":"node","id":t(&format!("{n}@A")),"origin":t("0@~root"),"type":"item","boundary":format!("0@~root|{}",n),"attrs":{"level":n}})).collect::<Vec<_>>();
    // Distinct immutable split boundaries require known right endpoints. Insert with independent end origins instead.
    let ops = ops
        .into_iter()
        .enumerate()
        .map(|(i, mut op)| {
            let origin = if i == 0 {
                "0@~root".to_string()
            } else {
                format!("{}@A", i)
            };
            op["origin"] = t(&origin);
            op["boundary"] = json!(format!("{origin}|end"));
            op
        })
        .collect::<Vec<_>>();
    let r = ask(&mut server, json!({"cmd":"apply","ops":ops}));
    assert_eq!(r["ok"], true, "{r}");
    let groups = r["state"]["model"]["children"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["type"] == "list")
        .collect::<Vec<_>>();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0]["attrs"]["level"], 1);
    assert_eq!(groups[1]["attrs"]["level"], 2);
    let r = ask(
        &mut server,
        json!({"cmd":"apply","ops":[{"t":"del","at":t("4@A"),"ids":[t("1@A")]}]}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let groups = r["state"]["model"]["children"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["type"] == "list")
        .collect::<Vec<_>>();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0]["attrs"]["level"], 2);
    assert_eq!(groups[1]["attrs"]["level"], 3);
}
#[test]
fn constrained_boundaries_keep_concurrent_children_distinct_and_promote_overflow() {
    let mut s = new();
    let right = key("title");
    let ops=["A","B"].into_iter().map(|actor|{let id=format!("1@{actor}");json!({"t":"node","id":t(&id),"origin":t("0@~root"),"type":"title","boundary":format!("0@~root|{right}|child:{id}")})}).collect();
    let state = apply(&mut s, ops);
    assert_eq!(state["blocks"][1]["marker"], "1@B");
    let state = apply(
        &mut s,
        vec![json!({"t":"del","at":t("2@A"),"ids":[t("1@B")]})],
    );
    assert_eq!(state["blocks"][1]["marker"], "1@A");
    let snap = ask(&mut s, json!({"cmd":"snapshot"}))["snapshot"].clone();
    let result = ask(
        &mut s,
        json!({"cmd":"apply","ops":[{"t":"node","id":t("3@A"),"origin":t("0@~root"),"type":"title","boundary":format!("0@~root|{right}|child:3@B")}]}),
    );
    assert_eq!(result["ok"], false);
    assert_eq!(ask(&mut s, json!({"cmd":"snapshot"}))["snapshot"], snap);
}
#[test]
fn flat_fields_alone_activate_projection_history_and_own_restore() {
    let manifest = json!({"root":"flat","marks":[],"nodes":{"flat":{"shape":"flow","children":["line"],"default":"line"},"line":{"shape":"text","attrs":{"meta":fields()}}}});
    let identity = RuntimeSchema::compile(manifest.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut server = Server::default();
    let ask = |server: &mut Server, mut request: Value| {
        request["replica"] = json!("r");
        request["schema"] = json!(identity);
        server.request(request)
    };
    assert_eq!(
        ask(
            &mut server,
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest})
        )["ok"],
        true
    );
    let r = ask(
        &mut server,
        json!({"cmd":"history_record","now":1,"options":{"caretBefore":"before","caretAfter":"after"},"ops":[{"t":"set","at":t("1@A"),"ids":[t("0@~root")],"key":"$field:[\"meta\",\"layout\",\"width\"]","value":13}]}),
    );
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(
        r["state"]["model"]["children"][0]["attrs"]["meta"]["layout"]["width"],
        13
    );
    let checkpoint = ask(&mut server, json!({"cmd":"history_export"}))["checkpoint"].clone();
    assert_eq!(
        ask(
            &mut server,
            json!({"cmd":"history_restore","actor":"A","checkpoint":checkpoint})
        )["ok"],
        true
    );
    let r = ask(&mut server, json!({"cmd":"history_undo"}));
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(
        r["state"]["model"]["children"][0]["attrs"]["meta"]["layout"]["width"],
        0
    );
    let r = ask(&mut server, json!({"cmd":"history_redo"}));
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(
        r["state"]["model"]["children"][0]["attrs"]["meta"]["layout"]["width"],
        13
    );
}
#[test]
fn authored_move_after_required_anchor_keeps_exact_placement_and_parent_order() {
    let mut s = new();
    let rule = t("1@~required:0%40~root:rule:0");
    let _ = apply(
        &mut s,
        vec![
            json!({"t":"node","id":t("1@A"),"origin":t("0@~root"),"type":"p","boundary":"0@~root|end"}),
            json!({"t":"text","id":t("2@A"),"origin":t("1@A"),"units":[77]}),
        ],
    );
    let state = apply(
        &mut s,
        vec![
            json!({"t":"move","at":t("3@A"),"target":t("1@A"),"parent":t("0@~root"),"after":rule}),
        ],
    );
    assert_eq!(
        state["placements"]["1@A"]["after"],
        "1@~required:0%40~root:rule:0"
    );
    assert_eq!(
        state["placements"]["1@~required:0%40~root:rule:0"]["parent"],
        "0@~root"
    );
    let children = state["model"]["children"].as_array().unwrap();
    let rule_index = children.iter().position(|n| n["type"] == "rule").unwrap();
    assert_eq!(children[rule_index + 1]["runs"][0]["units"], json!([77]));
    let captured = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":{"anchor":"2@A","focus":key("title")}}),
    );
    assert_eq!(captured["range"]["anchor"], json!([rule_index + 1, 1]));
    assert_eq!(
        captured["range"]["focus"],
        json!([
            children.iter().position(|n| n["type"] == "title").unwrap(),
            0
        ]),
        "{}",
        state["model"]
    );
}
#[test]
fn required_gap_reads_keep_nonempty_text_attrs_and_redo_after_joint_restore() {
    let manifest = json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["p","rule"],"default":"p","childRules":{"rule":{"min":1,"max":1}}},"p":{"shape":"text","attrs":{"label":{"default":""}}},"rule":{"shape":"atom"}}});
    let identity = RuntimeSchema::compile(manifest.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut server = Server::default();
    let ask = |server: &mut Server, mut request: Value| {
        request["replica"] = json!("r");
        request["schema"] = json!(identity);
        server.request(request)
    };
    assert_eq!(
        ask(
            &mut server,
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest})
        )["ok"],
        true
    );
    let result = ask(
        &mut server,
        json!({"cmd":"apply","ops":[{"t":"text","id":t("1@A"),"origin":t("0@~root"),"units":[114,111,111,116]},{"t":"node","id":t("5@A"),"origin":t("4@A"),"type":"p","boundary":"4@A|1@~required:0%40~root:rule:0","attrs":{"label":"kept"}},{"t":"text","id":t("6@A"),"origin":t("5@A"),"units":[99,111,110,116,101,110,116]}]}),
    );
    assert_eq!(result["ok"], true, "{result}");
    let moved = ask(
        &mut server,
        json!({"cmd":"history_record","now":1,"options":{"caretBefore":"before","caretAfter":"after"},"ops":[{"t":"move","at":t("13@A"),"target":t("5@A"),"parent":t("0@~root"),"after":t("1@~required:0%40~root:rule:0")}]}),
    );
    assert_eq!(moved["ok"], true, "{moved}");
    let checkpoint = ask(&mut server, json!({"cmd":"history_export"}))["checkpoint"].clone();
    assert_eq!(
        ask(
            &mut server,
            json!({"cmd":"history_restore","actor":"A","checkpoint":checkpoint})
        )["ok"],
        true
    );
    for (command, after_rule) in [
        ("state", true),
        ("history_undo", false),
        ("history_redo", true),
    ] {
        let result = ask(&mut server, json!({"cmd":command}));
        assert_eq!(result["ok"], true, "{result}");
        let model = result["state"]["model"].clone();
        let children = model["children"].as_array().unwrap();
        let index = children
            .iter()
            .position(|node| node["attrs"]["label"] == "kept")
            .expect("authored content remains visible");
        assert_eq!(
            children[index]["runs"][0]["units"],
            json!([99, 111, 110, 116, 101, 110, 116])
        );
        let rule = children
            .iter()
            .position(|node| node["type"] == "rule")
            .unwrap();
        assert_eq!(index > rule, after_rule);
        for _ in 0..3 {
            assert_eq!(
                ask(&mut server, json!({"cmd":"state"}))["state"]["model"],
                model
            );
        }
    }
}
