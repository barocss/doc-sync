use doc_sync_rust_shadow::{runtime_schema::RuntimeSchema, Server};
use serde_json::{json, Value};
fn schema() -> Value {
    json!({"root":"article","marks":["emphasis"],"nodes":{
        "article":{"shape":"flow","children":["line","title","box","rule"],"default":"line"},
        "line":{"shape":"text","attrs":{"align":{"default":"left","values":["left","right"]}}},
        "title":{"shape":"text","next":"line"},
        "box":{"shape":"flow","children":["caption","box","rule"],"default":"caption","attrs":{"tone":{"default":"info"}}},
        "caption":{"shape":"text","next":"caption","attrs":{"align":{"default":"right"}}},
        "rule":{"shape":"atom"}
    }})
}
#[test]
fn recursive_document_descriptor_compiles_without_preset_names() {
    RuntimeSchema::compile(schema()).unwrap();
}
fn ask(s: &mut Server, mut request: Value) -> Value {
    request["replica"] = json!("r");
    request["schema"] = json!(RuntimeSchema::compile(schema()).unwrap().identity());
    s.request(request)
}
fn new() -> Server {
    let mut s = Server::default();
    let result = ask(
        &mut s,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema()}),
    );
    assert_eq!(result["ok"], true, "{result}");
    s
}
fn ticket(key: &str) -> Value {
    let (n, actor) = key.split_once('@').unwrap();
    json!({"lamport":n.parse::<u64>().unwrap(),"actor":actor})
}
fn node(id: &str, origin: &str, kind: &str) -> Value {
    let mut op = json!({"t":"node","id":ticket(id),"origin":ticket(origin),"type":kind});
    if schema()["nodes"][kind]["shape"] == "text" {
        op["boundary"] = json!(format!("{origin}|end"));
    }
    op
}
fn text(id: &str, origin: &str, units: &[u16]) -> Value {
    json!({"t":"text","id":ticket(id),"origin":ticket(origin),"units":units,"marks":{"emphasis":true}})
}
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    let result = ask(s, json!({"cmd":"apply","ops":ops}));
    assert_eq!(result["ok"], true, "{result}");
    result["state"].clone()
}
fn checkpoint(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"history_export"}))["checkpoint"].clone()
}
fn model(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"state"}))["state"]["model"].clone()
}
#[test]
fn recursive_bodies_keep_distinct_defaults_and_empty_text_projection() {
    let mut s = new();
    assert_eq!(
        model(&mut s),
        json!({"type":"article","children":[{"type":"line","attrs":{"align":"left"},"runs":[]}]})
    );
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "box"),
            node("2@A", "0@1@A/body", "box"),
        ],
    );
    let m = model(&mut s);
    assert_eq!(m["children"][1]["type"], "box");
    assert_eq!(
        m["children"][1]["children"][0],
        json!({"type":"caption","attrs":{"align":"right"},"runs":[]})
    );
    assert_eq!(
        m["children"][1]["children"][1]["children"][0]["type"],
        "caption"
    );
    let state = apply(
        &mut s,
        vec![text("3@A", "0@2@A/body", &[0xd83d, 0xde00, 0xd800])],
    );
    assert_eq!(
        state["model"]["children"][1]["children"][1]["children"][0]["runs"][0],
        json!({"units":[0xd83d,0xde00,0xd800],"marks":{"emphasis":true}})
    );
    assert!(state["lines"]
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["key"] == "0@2@A/body"));
}
#[test]
fn virtual_text_after_atom_uses_containing_flow_default() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "box"),
            node("2@A", "0@1@A/body", "rule"),
            text("3@A", "2@A", &[120]),
        ],
    );
    let m = model(&mut s);
    assert_eq!(
        m["children"][1]["children"][2],
        json!({"type":"caption","attrs":{"align":"right"},"runs":[{"units":[120],"marks":{"emphasis":true}}]})
    );
}
#[test]
fn parent_children_and_type_writes_reject_whole_batches_atomically() {
    let mut s = new();
    apply(&mut s, vec![node("1@A", "0@~root", "box")]);
    for bad in [
        node("3@A", "0@1@A/body", "line"),
        json!({"t":"set","at":ticket("3@A"),"ids":[ticket("0@1@A/body")],"key":"$type","value":"title"}),
        json!({"t":"text","id":ticket("3@A"),"origin":ticket("0@1@A/body"),"units":[120],"marks":{"bold":true}}),
        node("3@A", "0@1@A/body", "article"),
    ] {
        let before = checkpoint(&mut s);
        let result = ask(
            &mut s,
            json!({"cmd":"history_record","ops":[text("2@A", "0@1@A/body", &[97]),bad],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
        );
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(checkpoint(&mut s), before);
    }
}
#[test]
fn move_destination_checks_birth_type_and_preserves_foreign_writer_through_undo_restore() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "box"),
            node("2@A", "1@A", "box"),
            node("3@A", "2@A", "title"),
        ],
    );
    let before = checkpoint(&mut s);
    let rejected = ask(
        &mut s,
        json!({"cmd":"apply","ops":[{"t":"move","at":ticket("4@A"),"target":ticket("3@A"),"parent":ticket("0@1@A/body"),"after":null}]}),
    );
    assert_eq!(rejected["ok"], false, "{rejected}");
    assert_eq!(checkpoint(&mut s), before);
    let recorded = ask(
        &mut s,
        json!({"cmd":"history_record","ops":[{"t":"move","at":ticket("5@A"),"target":ticket("2@A"),"parent":ticket("0@1@A/body"),"after":null}],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(recorded["ok"], true, "{recorded}");
    apply(
        &mut s,
        vec![
            text("6@B", "0@2@A/body", &[98]),
            json!({"t":"set","at":ticket("7@B"),"ids":[ticket("2@A")],"key":"tone","value":"foreign"}),
        ],
    );
    let saved = checkpoint(&mut s);
    let restored = ask(
        &mut s,
        json!({"cmd":"history_restore","actor":"A","checkpoint":saved}),
    );
    assert_eq!(restored["ok"], true, "{restored}");
    let undone = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undone["ok"], true, "{undone}");
    let m = model(&mut s);
    assert_eq!(m["children"][2]["attrs"]["tone"], "foreign");
    assert_eq!(
        m["children"][2]["children"][0]["runs"][0]["units"],
        json!([98])
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_redo"}))["ok"], true);
    assert_eq!(
        model(&mut s)["children"][1]["children"][1]["attrs"]["tone"],
        "foreign"
    );
}
#[test]
fn checkpoints_and_nested_selection_restore_without_reconstructing_visible_model() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "box"),
            text("2@A", "0@1@A/body", &[97, 98]),
        ],
    );
    let captured = ask(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[1,0,1],"focus":[1,0,2]}}),
    );
    assert_eq!(captured["range"], json!({"anchor":"2@A","focus":"3@A"}));
    let saved = checkpoint(&mut s);
    let original = model(&mut s);
    for mutate in ["clock", "identity", "operation", "extra"] {
        let mut corrupt = saved.clone();
        match mutate {
            "clock" => corrupt["document"]["clock"] = json!(999),
            "identity" => {
                corrupt["document"]["manifest"]["nodes"]["box"]["default"] = json!("line")
            }
            "operation" => corrupt["document"]["ops"][1]["marks"] = json!({"bold":true}),
            _ => corrupt["document"]["unexpected"] = json!(true),
        }
        assert_eq!(
            ask(
                &mut s,
                json!({"cmd":"history_restore","actor":"A","checkpoint":corrupt})
            )["ok"],
            false
        );
        assert_eq!(checkpoint(&mut s), saved);
    }
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(model(&mut s), original);
    let resolved = ask(
        &mut s,
        json!({"cmd":"selection_resolve","range":captured["range"]}),
    );
    assert_eq!(resolved["range"], json!({"anchor":[1,0,1],"focus":[1,0,2]}));
}
#[test]
fn unsupported_nested_rules_fail_closed_with_paths() {
    for (rule, value) in [
        ("childRules", json!({"caption":{"min":2,"max":1}})),
        ("group", json!("wrapper")),
        ("computed", json!(true)),
    ] {
        let mut bad = schema();
        bad["nodes"]["box"][rule] = value;
        let error = RuntimeSchema::compile(bad).unwrap_err();
        assert!(error.contains(&format!("$.nodes.box.{rule}")), "{error}");
    }
    for shape in ["grid", "row", "cell", "group", "inline", "span"] {
        let mut bad = schema();
        bad["nodes"]["box"]["shape"] = json!(shape);
        let path = match shape {
            "grid" => "$.nodes.box.default",
            "row" | "cell" | "inline" | "span" => "$.nodes.article.children",
            "group" => "$.nodes.box.attrs",
            _ => "$.nodes.box.shape",
        };
        let error = RuntimeSchema::compile(bad).unwrap_err();
        assert!(error.contains(path), "{shape}: {error}");
    }
}
#[test]
fn concurrent_nested_placement_cycles_converge_and_restore() {
    let mut a = new();
    let mut b = new();
    let seed = vec![node("1@A", "0@~root", "box"), node("2@A", "1@A", "box")];
    apply(&mut a, seed.clone());
    apply(&mut b, seed);
    let x = json!({"t":"move","at":ticket("3@X"),"target":ticket("1@A"),"parent":ticket("0@2@A/body"),"after":null});
    let y = json!({"t":"move","at":ticket("3@Y"),"target":ticket("2@A"),"parent":ticket("0@1@A/body"),"after":null});
    apply(&mut a, vec![x.clone(), y.clone()]);
    apply(&mut b, vec![y, x]);
    assert_eq!(model(&mut a), model(&mut b));
    let saved = checkpoint(&mut a);
    assert_eq!(
        ask(
            &mut a,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(model(&mut a), model(&mut b));
}
#[test]
fn deleted_flow_and_selective_attribute_undo_keep_foreign_nested_edits() {
    let mut s = new();
    apply(&mut s, vec![node("1@A", "0@~root", "box")]);
    let recorded = ask(
        &mut s,
        json!({"cmd":"history_record","ops":[{"t":"set","at":ticket("2@A"),"ids":[ticket("1@A")],"key":"tone","value":"local"}],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(recorded["ok"], true, "{recorded}");
    apply(
        &mut s,
        vec![
            json!({"t":"set","at":ticket("3@B"),"ids":[ticket("1@A")],"key":"tone","value":"foreign"}),
        ],
    );
    let undone = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undone["ok"], true, "{undone}");
    assert_eq!(undone["ops"], json!([]));
    let deleted = ask(
        &mut s,
        json!({"cmd":"history_record","ops":[{"t":"del","at":ticket("4@A"),"ids":[ticket("1@A")]}],"now":2,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(deleted["ok"], true, "{deleted}");
    apply(&mut s, vec![text("5@B", "0@1@A/body", &[120])]);
    let saved = checkpoint(&mut s);
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_undo"}))["ok"], true);
    let m = model(&mut s);
    assert_eq!(m["children"][1]["attrs"]["tone"], "foreign");
    assert_eq!(
        m["children"][1]["children"][0]["runs"][0]["units"],
        json!([120])
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_redo"}))["ok"], true);
    assert_eq!(model(&mut s)["children"].as_array().unwrap().len(), 1);
}
#[test]
fn logical_nested_split_undo_keeps_foreign_text_and_exact_history_after_restore() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "box"),
            node("2@A", "1@A", "box"),
            text("3@A", "0@1@A/body", &[97, 98, 99]),
        ],
    );
    let split = vec![
        json!({"t":"node","id":ticket("6@A"),"origin":ticket("4@A"),"type":"caption","boundary":"split:{\"into\":\"0@1@A/body\",\"after\":\"0@1@A/body\",\"left\":\"4@A\",\"right\":\"5@A\"}"}),
        json!({"t":"move","at":ticket("7@A"),"target":ticket("6@A"),"parent":ticket("0@2@A/body"),"after":null}),
    ];
    let recorded = ask(
        &mut s,
        json!({"cmd":"history_record","ops":split,"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(recorded["ok"], true, "{recorded}");
    apply(&mut s, vec![text("8@B", "5@A", &[120])]);
    let undone = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undone["ok"], true, "{undone}");
    assert_eq!(undone["ops"][0]["key"], "$join");
    assert_eq!(
        model(&mut s)["children"][1]["children"][0]["runs"][0]["units"],
        json!([97, 98, 99, 120])
    );
    let saved = checkpoint(&mut s);
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"history_restore","actor":"A","checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(ask(&mut s, json!({"cmd":"history_redo"}))["ok"], true);
    let state = ask(&mut s, json!({"cmd":"state"}));
    assert!(state["state"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|i| i["id"] == ticket("8@B") && i["visible"] == true));
}
#[test]
fn runtime_placements_expose_accepted_writer_and_skip_cycle_rejected_latest_log() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node("1@A", "0@~root", "box"),
            node("2@A", "1@A", "box"),
            node("3@A", "2@A", "box"),
        ],
    );
    let first = apply(
        &mut s,
        vec![
            json!({"t":"move","at":ticket("4@A"),"target":ticket("2@A"),"parent":ticket("0@1@A/body"),"after":null}),
        ],
    );
    assert_eq!(first["placements"]["2@A"]["at"], ticket("4@A"));
    let cyclic = apply(
        &mut s,
        vec![
            json!({"t":"move","at":ticket("5@A"),"target":ticket("1@A"),"parent":ticket("0@2@A/body"),"after":null}),
        ],
    );
    assert_eq!(cyclic["placements"]["1@A"]["at"], ticket("1@A"));
    let moved = apply(
        &mut s,
        vec![
            json!({"t":"move","at":ticket("6@A"),"target":ticket("3@A"),"parent":ticket("0@1@A/body"),"after":first["placements"]["2@A"]["at"]}),
        ],
    );
    assert_eq!(moved["placements"]["3@A"]["parent"], "0@1@A/body");
}
