use doc_sync_rust_shadow::{
    runtime_schema::{ReferenceGroup, ReferenceSlot, RuntimeSchema, SHARED_FORMAT},
    Server,
};
use serde_json::{json, Value};

fn ordered(reverse: bool) -> Value {
    serde_json::from_str(if reverse {
        r#"{"b":{"y":2,"x":1},"a":0}"#
    } else {
        r#"{"a":0,"b":{"x":1,"y":2}}"#
    })
    .unwrap()
}
fn slot(at: &[&str], index: Option<usize>) -> ReferenceSlot {
    match index {
        Some(index) => ReferenceSlot::enum_entry(at, index),
        None => ReferenceSlot::default(at),
    }
}
fn manifest() -> Value {
    let a = ordered(false);
    let b = ordered(true);
    json!({"root":"doc","marks":[],"markValues":{
        "ink":{"default":a,"values":[a,a]},"spare":{"default":null,"values":[a]}},
        "nodes":{"doc":{"shape":"flow","children":["p","h","box","dot"],"default":"p"},
        "p":{"shape":"text","attrs":{"tone":{"default":a,"values":[a,a]},"free":{"default":{}}}},
        "h":{"shape":"text","attrs":{"shade":{"default":null,"values":[a,a]}}},
        "box":{"shape":"flow","children":["p"],"default":"p","attrs":{"frame":{"default":a}}},
        "dot":{"shape":"atom","attrs":{"source":{"default":null,"values":[a,b]}}}}})
}
fn groups() -> Vec<ReferenceGroup> {
    let representative = slot(&["nodes", "dot", "attrs", "source"], Some(1));
    vec![
        ReferenceGroup::new(
            representative.clone(),
            [
                representative,
                slot(&["markValues", "ink"], None),
                slot(&["markValues", "ink"], Some(0)),
                slot(&["nodes", "p", "attrs", "tone"], None),
                slot(&["nodes", "p", "attrs", "tone"], Some(0)),
                slot(&["nodes", "h", "attrs", "shade"], Some(0)),
                slot(&["nodes", "box", "attrs", "frame"], None),
            ],
        ),
        ReferenceGroup::new(
            slot(&["markValues", "spare"], Some(0)),
            [
                slot(&["markValues", "spare"], Some(0)),
                slot(&["nodes", "dot", "attrs", "source"], Some(0)),
            ],
        ),
    ]
}
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile_with_reference_groups(manifest(), groups()).unwrap()
}
fn t(n: u64, actor: &str) -> Value {
    json!({"lamport":n,"actor":actor})
}
fn ask(server: &mut Server, replica: &str, mut request: Value) -> Value {
    request["replica"] = json!(replica);
    request["schema"] = json!(schema().identity());
    server.request(request)
}
fn ok(server: &mut Server, replica: &str, request: Value) -> Value {
    let response = ask(server, replica, request);
    assert_eq!(response["ok"], true, "{response}");
    response
}
fn new() -> Server {
    let mut server = Server::default();
    for (replica, actor) in [("a", "A"), ("b", "B")] {
        ok(
            &mut server,
            replica,
            json!({"cmd":"new","actor":actor,"runtimeSchema":schema().dto()}),
        );
    }
    server
}
fn text() -> Value {
    json!({"t":"text","id":t(1,"A"),"origin":t(0,"~root"),"units":[97]})
}
fn set(n: u64, actor: &str, id: Value, key: &str, value: Value) -> Value {
    json!({"t":"set","at":t(n,actor),"ids":[id],"key":key,"value":value})
}
fn bind(op: Value, path: &[&str], at: &[&str], index: Option<usize>) -> Value {
    let schema = schema();
    schema
        .reference_operation(
            op,
            vec![(
                path.iter().map(|s| (*s).into()).collect(),
                schema.reference_value(at, index).unwrap(),
            )],
        )
        .unwrap()
}
fn source() -> &'static [&'static str] {
    &["nodes", "dot", "attrs", "source"]
}
fn apply(server: &mut Server, replica: &str, ops: Vec<Value>) -> Value {
    ok(server, replica, json!({"cmd":"apply","ops":ops}))["state"].clone()
}
#[test]
fn shared_graph_identity_and_representative_order_are_explicit_and_canonical() {
    let schema = schema();
    assert_eq!(schema.manifest(), &manifest());
    assert_eq!(schema.dto()["format"], SHARED_FORMAT);
    assert_ne!(schema.identity(), schema.base_identity());
    let mut reordered = schema.dto().clone();
    reordered["manifest"]["domain"] = json!("document");
    reordered["referenceGroups"]
        .as_array_mut()
        .unwrap()
        .reverse();
    for group in reordered["referenceGroups"].as_array_mut().unwrap() {
        group["slots"].as_array_mut().unwrap().reverse();
    }
    let reordered = RuntimeSchema::compile(reordered).unwrap();
    assert_eq!(reordered.identity(), schema.identity());
    assert_eq!(
        reordered.dto()["referenceGroups"],
        schema.dto()["referenceGroups"]
    );
    let mut groups = groups();
    groups[0].representative = slot(&["markValues", "ink"], None);
    let other = RuntimeSchema::compile_with_reference_groups(manifest(), groups).unwrap();
    assert_ne!(other.identity(), schema.identity());
    assert_eq!(other.base_identity(), schema.base_identity());
    for group in groups_for(&schema) {
        for slot in group.slots {
            let at = slot.at.iter().map(String::as_str).collect::<Vec<_>>();
            let handle = schema.reference_value(&at, slot.index).unwrap();
            assert_eq!(handle["at"], json!(slot.at));
            assert_eq!(handle["source"], slot.source);
            assert_eq!(
                schema.reference_payload(&handle).unwrap().to_string(),
                if group.representative.index == Some(1) {
                    ordered(true)
                } else {
                    ordered(false)
                }
                .to_string()
            );
        }
    }
}
fn groups_for(schema: &RuntimeSchema) -> Vec<ReferenceGroup> {
    serde_json::from_value(schema.dto()["referenceGroups"].clone()).unwrap()
}
#[test]
fn target_aware_admission_uses_declared_identity_without_deep_equal_promotion() {
    let schema = schema();
    let handle = schema.reference_value(source(), Some(1)).unwrap();
    for at in [
        &["markValues", "ink"][..],
        &["nodes", "p", "attrs", "tone"][..],
        &["nodes", "h", "attrs", "shade"][..],
        &["nodes", "box", "attrs", "frame"][..],
    ] {
        schema.accepts_reference_at(&handle, at).unwrap();
    }
    assert!(schema
        .is_default_reference_at(&handle, &["markValues", "ink"])
        .unwrap());
    assert!(!schema
        .is_default_reference_at(&handle, &["nodes", "h", "attrs", "shade"])
        .unwrap());
    assert!(schema
        .accepts_reference_at(&handle, &["nodes", "p", "attrs", "free"])
        .is_err());
    assert!(schema
        .accepts_reference_at(&handle, &["markValues", "spare"])
        .is_err());
    let unlisted = schema
        .reference_value(&["markValues", "ink"], Some(1))
        .unwrap();
    assert!(schema
        .accepts_reference_at(&unlisted, &["markValues", "ink"])
        .is_ok());
    assert!(schema
        .accepts_reference_at(&unlisted, &["nodes", "p", "attrs", "tone"])
        .is_err());
    assert!(!schema.is_default_reference(&unlisted).unwrap());
    let enum_only = schema.reference_value(source(), Some(0)).unwrap();
    assert!(schema
        .accepts_reference_at(&enum_only, &["markValues", "spare"])
        .is_ok());
    assert!(schema
        .accepts_reference_at(&enum_only, &["markValues", "ink"])
        .is_err());
}
#[test]
fn malformed_or_overlapping_groups_fail_closed_without_replacing_existing_state() {
    let mut server = new();
    apply(&mut server, "a", vec![text()]);
    let before = ok(&mut server, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    for case in [
        "empty",
        "singleton",
        "representative",
        "duplicate",
        "overlap",
        "payload",
        "scalar",
        "index",
        "source",
        "extra",
        "field",
        "computed",
        "ownDefault",
    ] {
        let mut dto = schema().dto().clone();
        // Canonical group ordering is immaterial: find the large shared class.
        let index = dto["referenceGroups"]
            .as_array()
            .unwrap()
            .iter()
            .position(|g| g["slots"].as_array().unwrap().len() > 2)
            .unwrap();
        let group = &mut dto["referenceGroups"][index];
        match case {
            "empty" => dto["referenceGroups"] = json!([]),
            "singleton" => group["slots"] = json!([group["representative"].clone()]),
            "representative" => {
                group["representative"] =
                    json!({"at":["markValues","spare"],"source":"enum","index":0})
            }
            "duplicate" => {
                let member = group["slots"][0].clone();
                group["slots"].as_array_mut().unwrap().push(member);
            }
            "overlap" => {
                let duplicate = group.clone();
                dto["referenceGroups"]
                    .as_array_mut()
                    .unwrap()
                    .push(duplicate);
            }
            "payload" => {
                dto["manifest"]["nodes"]["box"]["attrs"]["frame"]["default"] =
                    json!({"different":true})
            }
            "scalar" => dto["manifest"]["nodes"]["box"]["attrs"]["frame"]["default"] = json!(1),
            "index" => group["slots"][0]["index"] = json!(999),
            "source" => group["slots"][0]["source"] = json!("copy"),
            "extra" => group["extra"] = json!(true),
            "field" => dto["manifest"]["nodes"]["box"]["attrs"]["frame"]["fields"] = json!({}),
            "computed" => {
                dto["manifest"]["nodes"]["box"]["attrs"]["frame"]["computed"] = json!(true)
            }
            _ => {
                group["slots"].as_array_mut().unwrap().retain(|s| {
                    !(s["at"] == json!(["markValues", "ink"]) && s["source"] == "enum")
                });
            }
        }
        assert!(RuntimeSchema::compile(dto.clone()).is_err(), "{case}");
        let response = ask(
            &mut server,
            "a",
            json!({"cmd":"new","actor":"A","runtimeSchema":dto}),
        );
        assert_eq!(response["ok"], false, "{case}: {response}");
        assert_eq!(
            ok(&mut server, "a", json!({"cmd":"snapshot"}))["snapshot"],
            before,
            "{case}"
        );
    }
}
#[test]
fn cross_key_node_mark_and_attribute_births_roundtrip_json_and_keep_source_metadata() {
    let mut server = new();
    let mut birth = text();
    birth["marks"] = json!({"ink":ordered(false)});
    let mark = bind(birth, &["marks", "ink"], source(), Some(1));
    let node = bind(
        json!({"t":"node","id":t(2,"A"),"origin":t(0,"~root"),"type":"box","attrs":{"frame":ordered(false)}}),
        &["attrs", "frame"],
        &["markValues", "ink"],
        Some(0),
    );
    let attribute = bind(
        set(3, "A", t(0, "~root"), "tone", ordered(false)),
        &["value"],
        source(),
        Some(1),
    );
    for op in [mark, node, attribute] {
        let wire = serde_json::from_str(&serde_json::to_string(&op).unwrap()).unwrap();
        let a = apply(&mut server, "a", vec![wire]);
        let b = apply(&mut server, "b", vec![op.clone()]);
        assert_eq!(a, b);
        let snapshot = ok(&mut server, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
        assert_eq!(snapshot["ops"].as_array().unwrap().last().unwrap(), &op);
        assert_eq!(
            ok(
                &mut server,
                "a",
                json!({"cmd":"restore","actor":"A","snapshot":snapshot})
            )["state"],
            a
        );
    }
}
#[test]
fn unlisted_wrong_target_and_conflicting_source_reject_atomically_but_exact_retry_is_noop() {
    let mut server = new();
    apply(
        &mut server,
        "a",
        vec![
            text(),
            json!({"t":"node","id":t(2,"A"),"origin":t(0,"~root"),"type":"dot"}),
        ],
    );
    let valid = bind(
        set(3, "A", t(1, "A"), "ink", ordered(true)),
        &["value"],
        source(),
        Some(1),
    );
    let state = apply(&mut server, "a", vec![valid.clone()]);
    assert_eq!(apply(&mut server, "a", vec![valid.clone()]), state);
    let before = ok(&mut server, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    for case in ["source", "graph", "raw", "type", "key", "birth"] {
        let mut bad = valid.clone();
        bad["op"]["at"] = t(4, "A");
        match case {
            "source" => {
                bad["op"]["at"] = t(3, "A");
                bad["references"][0]["at"] = json!(["markValues", "ink"]);
                bad["references"][0]["index"] = json!(0);
            }
            "graph" => bad["references"][0]["schema"] = json!(schema().base_identity()),
            "raw" => bad = bad["op"].clone(),
            "type" => {
                bad["op"]["ids"] = json!([t(2, "A")]);
                bad["op"]["key"] = json!("tone");
            }
            "key" => bad["op"]["key"] = json!("free"),
            _ => {
                bad["op"] = json!({"t":"node","id":t(4,"A"),"origin":t(0,"~root"),"type":"p","attrs":{"free":ordered(true)}});
                bad["references"][0]["path"] = json!(["attrs", "free"]);
            }
        }
        let response = ask(&mut server, "a", json!({"cmd":"apply","ops":[bad]}));
        assert_eq!(response["ok"], false, "{case}: {response}");
        assert_eq!(
            ok(&mut server, "a", json!({"cmd":"snapshot"}))["snapshot"],
            before,
            "{case}"
        );
    }
}
#[test]
fn effective_fallback_and_factory_order_follow_representative_but_raw_payload_keeps_its_order() {
    let schema = schema();
    assert_eq!(
        schema.manifest()["nodes"]["p"]["attrs"]["tone"]["default"].to_string(),
        ordered(false).to_string()
    );
    assert_eq!(
        schema.effective_manifest()["nodes"]["p"]["attrs"]["tone"]["default"].to_string(),
        ordered(true).to_string()
    );
    let mut server = new();
    let state = ok(&mut server, "a", json!({"cmd":"state"}))["state"].clone();
    assert_eq!(
        state["model"]["children"][0]["attrs"]["tone"].to_string(),
        ordered(true).to_string()
    );
    for (n, value) in [(1, ordered(false)), (2, Value::Null)] {
        let raw = set(n, "A", t(0, "~root"), "tone", value.clone());
        let op = if value.is_null() {
            raw
        } else {
            bind(raw, &["value"], source(), Some(1))
        };
        let state = apply(&mut server, "a", vec![op]);
        assert_eq!(
            state["model"]["children"][0]["attrs"]["tone"].to_string(),
            ordered(true).to_string()
        );
        assert_eq!(
            state["items"][0]["attrs"]["tone"]["value"].to_string(),
            value.to_string()
        );
    }
}
#[test]
fn history_rebuilds_cross_key_source_provenance_and_foreign_writer_fences() {
    let mut server = new();
    for replica in ["a", "b"] {
        apply(&mut server, replica, vec![text()]);
    }
    let op = bind(
        set(2, "A", t(1, "A"), "ink", ordered(true)),
        &["value"],
        source(),
        Some(1),
    );
    ok(
        &mut server,
        "a",
        json!({"cmd":"history_record","ops":[op.clone()],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
    );
    apply(&mut server, "b", vec![op]);
    let undo = ok(&mut server, "a", json!({"cmd":"history_undo"}));
    apply(&mut server, "b", undo["ops"].as_array().unwrap().clone());
    let checkpoint = ok(&mut server, "a", json!({"cmd":"history_export"}))["checkpoint"].clone();
    ok(
        &mut server,
        "a",
        json!({"cmd":"history_restore","checkpoint":checkpoint.clone()}),
    );
    let redo = ok(&mut server, "a", json!({"cmd":"history_redo"}));
    assert_eq!(redo["ops"][0]["references"][0]["at"], json!(source()));
    assert_eq!(redo["ops"][0]["references"][0]["index"], 1);
    assert_eq!(redo["ops"][0]["op"]["key"], "ink");
    assert_eq!(
        redo["state"],
        apply(&mut server, "b", redo["ops"].as_array().unwrap().clone())
    );
    let foreign = bind(
        set(9, "B", t(1, "A"), "ink", ordered(false)),
        &["value"],
        &["markValues", "ink"],
        Some(1),
    );
    let state = apply(&mut server, "a", vec![foreign.clone()]);
    assert_eq!(state, apply(&mut server, "b", vec![foreign]));
    let undo = ok(&mut server, "a", json!({"cmd":"history_undo"}));
    assert_eq!(undo["ops"], json!([]));
    assert_eq!(undo["state"], state);
    let before = ok(&mut server, "a", json!({"cmd":"history_export"}))["checkpoint"].clone();
    let mut forged = before.clone();
    let groups = forged["document"]["manifest"]["referenceGroups"]
        .as_array_mut()
        .unwrap();
    let group = groups
        .iter_mut()
        .find(|g| g["slots"].as_array().unwrap().len() > 2)
        .unwrap();
    group["representative"] = json!({"at":["markValues","ink"],"source":"default"});
    assert_eq!(
        ask(
            &mut server,
            "a",
            json!({"cmd":"history_restore","checkpoint":forged})
        )["ok"],
        false
    );
    assert_eq!(
        ok(&mut server, "a", json!({"cmd":"history_export"}))["checkpoint"],
        before
    );
}

#[test]
fn nested_array_shared_slots_bind_across_descriptors_with_exact_representative_order() {
    let a: Value = serde_json::from_str(r#"[{"a":1,"b":[{"x":2,"y":3}]}]"#).unwrap();
    let b: Value = serde_json::from_str(r#"[{"b":[{"y":3,"x":2}],"a":1}]"#).unwrap();
    let manifest = json!({"root":"doc","marks":[],"markValues":{"array":{"default":a}},"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text","attrs":{"target":{"default":b,"values":[a]}}}}});
    let representative = slot(&["nodes", "p", "attrs", "target"], None);
    let schema = RuntimeSchema::compile_with_reference_groups(
        manifest.clone(),
        [ReferenceGroup::new(
            representative.clone(),
            [
                representative,
                slot(&["nodes", "p", "attrs", "target"], Some(0)),
                slot(&["markValues", "array"], None),
            ],
        )],
    )
    .unwrap();
    let source = schema
        .reference_value(&["markValues", "array"], None)
        .unwrap();
    assert_eq!(
        schema.reference_payload(&source).unwrap().to_string(),
        b.to_string()
    );
    assert!(schema
        .is_default_reference_at(&source, &["nodes", "p", "attrs", "target"])
        .unwrap());
    let mut server = Server::default();
    let request = |server: &mut Server, mut value: Value| {
        value["replica"] = json!("r");
        value["schema"] = json!(schema.identity());
        let response = server.request(value);
        assert_eq!(response["ok"], true, "{response}");
        response
    };
    let state = request(
        &mut server,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema.dto()}),
    );
    assert_eq!(
        state["state"]["model"]["children"][0]["attrs"]["target"].to_string(),
        b.to_string()
    );
    let op = schema
        .reference_operation(
            set(1, "A", t(0, "~root"), "target", a.clone()),
            vec![(vec!["value".into()], source)],
        )
        .unwrap();
    let state = request(&mut server, json!({"cmd":"apply","ops":[op.clone()]}));
    assert_eq!(
        state["state"]["items"][0]["attrs"]["target"]["value"].to_string(),
        a.to_string()
    );
    assert_eq!(
        state["state"]["model"]["children"][0]["attrs"]["target"].to_string(),
        b.to_string()
    );
    let saved = request(&mut server, json!({"cmd":"snapshot"}))["snapshot"].clone();
    assert_eq!(saved["manifest"], schema.dto().clone());
    assert_eq!(
        request(
            &mut server,
            json!({"cmd":"restore","actor":"A","snapshot":saved})
        )["state"],
        state["state"]
    );
}
#[test]
fn text_candidate_admission_survives_type_changes_without_retargeting_source_provenance() {
    let mut server = new();
    let op = bind(
        set(1, "A", t(0, "~root"), "shade", ordered(false)),
        &["value"],
        source(),
        Some(1),
    );
    let state = apply(&mut server, "a", vec![op]);
    assert_eq!(state["items"][0]["attrs"]["shade"]["value"], ordered(false));
    assert_eq!(state["model"]["children"][0]["type"], "p");
    let state = apply(
        &mut server,
        "a",
        vec![set(2, "A", t(0, "~root"), "$type", json!("h"))],
    );
    assert_eq!(state["model"]["children"][0]["type"], "h");
    assert_eq!(state["model"]["children"][0]["attrs"]["shade"], Value::Null);
    let op = bind(
        set(3, "A", t(0, "~root"), "tone", ordered(false)),
        &["value"],
        source(),
        Some(1),
    );
    let state = apply(&mut server, "a", vec![op]);
    assert_eq!(state["model"]["children"][0]["type"], "h");
    assert_eq!(state["items"][0]["attrs"]["tone"]["value"], ordered(false));
    let snapshot = ok(&mut server, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    assert_eq!(snapshot["ops"][2]["references"][0]["at"], json!(source()));
}
