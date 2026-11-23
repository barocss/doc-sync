use doc_sync_rust_shadow::{
    runtime_schema::{atomic_value_ok, RuntimeSchema},
    Server,
};
use serde_json::{json, Value};
fn manifest() -> Value {
    json!({"root":"doc","marks":[],"markValues":{"object":{"default":{"tone":"plain"}},"array":{"default":["plain"]},"choice":{"default":null,"values":[{"tone":"warm"},{"tone":"warm"},["x"],["x"],"red",7,true]}},"nodes":{"doc":{"shape":"flow","children":["p","badge"],"default":"p"},"p":{"shape":"text","children":["paint"],"attrs":{"payload":{"default":{"tone":"plain"}},"choice":{"default":null,"values":[{"tone":"warm"},{"tone":"warm"},["x"],["x"],"red",7,true]},"fields":{"default":{"tags":[]},"fields":{"tags":{"default":[],"values":[[],["x"]]}}}}},"badge":{"shape":"atom","attrs":{"choice":{"default":null,"values":[{"tone":"warm"},["x"]]}}},"paint":{"shape":"span","mark":"choice","attr":"paint"}}})
}
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(manifest()).unwrap()
}
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn ask(s: &mut Server, r: &str, mut v: Value) -> Value {
    v["replica"] = json!(r);
    v["schema"] = json!(schema().identity());
    s.request(v)
}
fn new() -> Server {
    let mut s = Server::default();
    for (replica, actor) in [("a", "A"), ("b", "B")] {
        let r = ask(
            &mut s,
            replica,
            json!({"cmd":"new","actor":actor,"runtimeSchema":manifest()}),
        );
        assert_eq!(r["ok"], true, "{r}");
    }
    s
}
fn apply(s: &mut Server, r: &str, ops: Vec<Value>) -> Value {
    let v = ask(s, r, json!({"cmd":"apply","ops":ops}));
    assert_eq!(v["ok"], true, "{v}");
    v["state"].clone()
}
fn text() -> Value {
    json!({"t":"text","id":t(1,"A"),"origin":t(0,"~root"),"units":[0xd83d,0xde00]})
}
fn set(n: u64, a: &str, id: Value, key: &str, value: Value) -> Value {
    json!({"t":"set","at":t(n,a),"ids":[id],"key":key,"value":value})
}
fn reference(op: Value, path: &[&str], at: &[&str], index: Option<usize>) -> Value {
    let s = schema();
    s.reference_operation(
        op,
        vec![(
            path.iter().map(|s| (*s).into()).collect(),
            s.reference_value(at, index).unwrap(),
        )],
    )
    .unwrap()
}
fn token<'a>(state: &'a Value, n: u64, a: &str) -> &'a Value {
    state["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["id"] == t(n, a))
        .unwrap()
}
#[test]
fn atomic_defaults_follow_javascript_object_type_and_field_enums_stay_deep() {
    let s = schema();
    assert!(s
        .validate_attribute("p", "payload", &json!({"tone":"plain"}))
        .is_ok());
    assert!(s
        .validate_attribute("p", "payload", &json!(["also typeof object"]))
        .is_ok());
    assert!(s
        .validate_mark_value("array", &json!({"also":"object"}))
        .is_ok());
    assert!(s.validate_mark_value("object", &json!(["array"])).is_ok());
    assert!(s.validate_attribute("p", "payload", &json!("bad")).is_err());
    assert!(s
        .validate_attribute("p", "choice", &json!({"tone":"warm"}))
        .is_err());
    assert!(s.validate_mark_value("choice", &json!(["x"])).is_err());
    for scalar in [json!("red"), json!(7), json!(true), Value::Null] {
        assert!(s.validate_mark_value("choice", &scalar).is_ok());
    }
    assert!(s
        .validate_attribute("p", "$field:[\"fields\",\"tags\"]", &json!(["x"]))
        .is_ok());
    assert!(!atomic_value_ok(
        &json!({"default":null,"values":[{"x":1}]}),
        &json!({"x":1})
    ));
}
#[test]
fn equal_composite_default_marks_remain_visible_after_per_token_clone() {
    let mut s = new();
    let mut op = text();
    op["marks"] = json!({"object":{"tone":"plain"},"array":["plain"]});
    let state = apply(&mut s, "a", vec![op]);
    let runs = &state["model"]["children"][0]["runs"];
    assert_eq!(
        *runs,
        json!([{"units":[0xd83d,0xde00],"marks":{"object":{"tone":"plain"},"array":["plain"]}}])
    );
    assert_eq!(
        token(&state, 1, "A")["attrs"]["object"]["value"],
        json!({"tone":"plain"})
    );
}
#[test]
fn explicit_enum_refs_admit_but_raw_copies_reject_and_payloads_stay_plain() {
    let mut s = new();
    let mut op = text();
    op["marks"] = json!({"choice":{"tone":"warm"}});
    let before = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    assert_eq!(
        ask(&mut s, "a", json!({"cmd":"apply","ops":[op.clone()]}))["ok"],
        false
    );
    assert_eq!(
        ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"],
        before
    );
    let wrapped = reference(op, &["marks", "choice"], &["markValues", "choice"], Some(1));
    let state = apply(&mut s, "a", vec![wrapped.clone()]);
    let peer = apply(&mut s, "b", vec![wrapped]);
    assert_eq!(state, peer);
    let runs = state["model"]["children"][0]["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 2);
    assert_eq!(runs[0]["attrs"]["paint"], json!({"tone":"warm"}));
    assert_eq!(runs[0]["runs"][0]["units"], json!([0xd83d]));
    assert_eq!(
        token(&state, 2, "A")["attrs"]["choice"]["value"],
        json!({"tone":"warm"})
    );
}
#[test]
fn enum_attr_material_falls_back_without_discarding_raw_register_or_writer() {
    let mut s = new();
    let op = json!({"t":"node","id":t(1,"A"),"origin":t(0,"~root"),"type":"p","boundary":"0@~root|end","attrs":{"choice":["x"]}});
    let op = reference(
        op,
        &["attrs", "choice"],
        &["nodes", "p", "attrs", "choice"],
        Some(2),
    );
    let state = apply(&mut s, "a", vec![op]);
    assert_eq!(
        state["model"]["children"][1]["attrs"]["choice"],
        Value::Null
    );
    assert_eq!(
        token(&state, 1, "A")["attrs"]["choice"],
        json!({"value":["x"],"at":t(1,"A")})
    );
}
#[test]
fn reference_handles_reject_foreign_scope_payload_source_and_unused_wrappers_atomically() {
    let mut s = new();
    apply(&mut s, "a", vec![text()]);
    let valid = reference(
        set(3, "A", t(1, "A"), "choice", json!({"tone":"warm"})),
        &["value"],
        &["markValues", "choice"],
        Some(0),
    );
    let mut cases = vec![];
    let mut v = valid.clone();
    v["references"][0]["schema"] = json!("sha256:foreign");
    cases.push(v);
    let mut v = valid.clone();
    v["references"][0]["at"] = json!(["nodes", "p", "attrs", "choice"]);
    cases.push(v);
    let mut v = valid.clone();
    v["op"]["value"] = json!({"tone":"cold"});
    cases.push(v);
    let mut v = valid.clone();
    v["references"][0]["index"] = json!(100);
    cases.push(v);
    let mut v = valid.clone();
    v["references"][0]["path"] = json!(["notValue"]);
    cases.push(v);
    let mut v = valid.clone();
    v["references"][0]["source"] = json!("copy");
    cases.push(v);
    let mut v = valid.clone();
    v["references"]
        .as_array_mut()
        .unwrap()
        .push(valid["references"][0].clone());
    cases.push(v);
    let before = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    for op in cases {
        let r = ask(&mut s, "a", json!({"cmd":"apply","ops":[op]}));
        assert_eq!(r["ok"], false, "{r}");
        assert_eq!(
            ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"],
            before
        );
    }
}
#[test]
fn concurrent_reference_writes_converge_and_selective_history_keeps_foreign_writer() {
    let mut s = new();
    for r in ["a", "b"] {
        apply(&mut s, r, vec![text()]);
    }
    let a = reference(
        set(3, "A", t(1, "A"), "choice", json!({"tone":"warm"})),
        &["value"],
        &["markValues", "choice"],
        Some(0),
    );
    let b = reference(
        set(3, "B", t(1, "A"), "choice", json!(["x"])),
        &["value"],
        &["markValues", "choice"],
        Some(3),
    );
    let r = ask(
        &mut s,
        "a",
        json!({"cmd":"history_record","ops":[a.clone()],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let sa = apply(&mut s, "a", vec![b.clone()]);
    let sb = apply(&mut s, "b", vec![b, a]);
    assert_eq!(sa, sb);
    let undo = ask(&mut s, "a", json!({"cmd":"history_undo"}));
    assert_eq!(undo["ok"], true, "{undo}");
    assert_eq!(undo["ops"], json!([]));
    assert_eq!(
        token(&undo["state"], 1, "A")["attrs"]["choice"]["at"],
        t(3, "B")
    );
}
#[test]
fn history_redo_keeps_symbolic_admission_and_restore_rebuilds_provenance() {
    let mut s = new();
    apply(&mut s, "a", vec![text()]);
    let op = reference(
        set(3, "A", t(1, "A"), "choice", json!(["x"])),
        &["value"],
        &["markValues", "choice"],
        Some(2),
    );
    let record = ask(
        &mut s,
        "a",
        json!({"cmd":"history_record","ops":[op],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
    );
    assert_eq!(record["ok"], true, "{record}");
    let undo = ask(&mut s, "a", json!({"cmd":"history_undo"}));
    assert_eq!(undo["ok"], true, "{undo}");
    assert_eq!(undo["ops"][0]["value"], Value::Null);
    let checkpoint = ask(&mut s, "a", json!({"cmd":"history_export"}))["checkpoint"].clone();
    let r = ask(
        &mut s,
        "a",
        json!({"cmd":"history_restore","checkpoint":checkpoint}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let redo = ask(&mut s, "a", json!({"cmd":"history_redo"}));
    assert_eq!(redo["ok"], true, "{redo}");
    assert_eq!(redo["ops"][0]["t"], "reference");
    assert_eq!(redo["ops"][0]["op"]["value"], json!(["x"]));
    let raw = token(&redo["state"], 1, "A")["attrs"]["choice"].clone();
    assert_eq!(raw["value"], json!(["x"]));
    assert_eq!(raw["at"], redo["ops"][0]["op"]["at"]);
    let snapshot = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    let state = redo["state"].clone();
    assert_eq!(
        ask(
            &mut s,
            "a",
            json!({"cmd":"restore","actor":"A","snapshot":snapshot})
        )["state"],
        state
    );
}
#[test]
fn composite_enum_default_alias_is_not_inferred_from_equal_json() {
    let mut m = manifest();
    m["markValues"]["choice"]["default"] = json!({"tone":"warm"});
    assert!(RuntimeSchema::compile(m)
        .unwrap_err()
        .contains("default violates constraints"));
    let mut m = manifest();
    m["nodes"]["p"]["attrs"]["payload"]["default"] = json!({"$bad":1});
    assert!(RuntimeSchema::compile(m).is_err());
}
#[test]
fn default_reference_wire_admission_clones_and_journal_tampering_is_rejected() {
    let mut s = new();
    let mut op = text();
    op["marks"] = json!({"object":{"tone":"plain"}});
    let op = reference(op, &["marks", "object"], &["markValues", "object"], None);
    let op: Value = serde_json::from_str(&serde_json::to_string(&op).unwrap()).unwrap();
    let state = apply(&mut s, "a", vec![op.clone()]);
    assert_eq!(
        state["model"]["children"][0]["runs"][0]["marks"]["object"],
        json!({"tone":"plain"})
    );
    let mut snapshot = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    assert_eq!(snapshot["ops"][0], op);
    snapshot["ops"][0]["op"]["marks"]["object"] = json!({"tone":"tampered"});
    let r = ask(
        &mut s,
        "a",
        json!({"cmd":"restore","actor":"A","snapshot":snapshot}),
    );
    assert_eq!(r["ok"], false);
    assert_eq!(ask(&mut s, "a", json!({"cmd":"state"}))["state"], state);
}
#[test]
fn same_json_foreign_schema_reference_does_not_grant_identity() {
    let mut other = manifest();
    other["markValues"]["object"]["inherit"] = json!(true);
    let other = RuntimeSchema::compile(other).unwrap();
    let reference = other
        .reference_value(&["markValues", "choice"], Some(0))
        .unwrap();
    assert!(schema().reference_payload(&reference).is_err());
    let bad = schema().reference_operation(
        set(1, "A", t(0, "~root"), "choice", json!({"tone":"warm"})),
        vec![(vec!["value".into()], reference)],
    );
    assert!(bad.is_err());
    let s = schema();
    let first = s
        .reference_value(&["markValues", "choice"], Some(0))
        .unwrap();
    let second = s
        .reference_value(&["markValues", "choice"], Some(1))
        .unwrap();
    assert_ne!(first, second);
    assert_eq!(
        s.reference_payload(&first).unwrap(),
        s.reference_payload(&second).unwrap()
    );
}
#[test]
fn history_checkpoint_cannot_replace_proven_value_at_its_writer() {
    let mut s = new();
    apply(&mut s, "a", vec![text()]);
    let op = reference(
        set(3, "A", t(1, "A"), "choice", json!({"tone":"warm"})),
        &["value"],
        &["markValues", "choice"],
        Some(0),
    );
    let r = ask(
        &mut s,
        "a",
        json!({"cmd":"history_record","ops":[op],"now":1,"options":{"caretBefore":"a","caretAfter":"b"}}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let original = ask(&mut s, "a", json!({"cmd":"history_export"}))["checkpoint"].clone();
    let mut forged = original.clone();
    forged["history"]["sets"][1]["value"] = json!(["x"]);
    let r = ask(
        &mut s,
        "a",
        json!({"cmd":"history_restore","checkpoint":forged}),
    );
    assert_eq!(r["ok"], false, "{r}");
    assert_eq!(
        ask(&mut s, "a", json!({"cmd":"history_export"}))["checkpoint"],
        original
    );
}
#[test]
fn graphic_atomic_enum_also_requires_explicit_identity_and_keeps_raw_payload() {
    let m = json!({"domain":"graphic","root":"canvas","marks":[],"nodes":{"canvas":{"shape":"container","children":["dot"]},"dot":{"shape":"atom","attrs":{"payload":{"default":[]},"choice":{"default":null,"values":[{"x":1},[2]]}}}}});
    let schema = RuntimeSchema::compile(m.clone()).unwrap();
    let mut s = Server::default();
    let r = s.request(
        json!({"cmd":"new","replica":"g","actor":"A","schema":schema.identity(),"runtimeSchema":m}),
    );
    assert_eq!(r["ok"], true, "{r}");
    let op = json!({"t":"node","id":t(1,"A"),"origin":t(0,"~root"),"type":"dot","boundary":"","attrs":{"payload":{"object":"accepted"},"choice":{"x":1}}});
    let r = s.request(
        json!({"cmd":"apply","replica":"g","schema":schema.identity(),"ops":[op.clone()]}),
    );
    assert_eq!(r["ok"], false, "{r}");
    let op = schema
        .reference_operation(
            op,
            vec![(
                vec!["attrs".into(), "choice".into()],
                schema
                    .reference_value(&["nodes", "dot", "attrs", "choice"], Some(0))
                    .unwrap(),
            )],
        )
        .unwrap();
    let r = s.request(json!({"cmd":"apply","replica":"g","schema":schema.identity(),"ops":[op]}));
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(
        token(&r["state"], 1, "A")["attrs"]["choice"]["value"],
        json!({"x":1})
    );
    assert_eq!(
        r["state"]["model"]["children"][0]["attrs"]["choice"],
        Value::Null
    );
}

#[test]
fn reference_split_birth_keeps_exact_raw_history_undo_and_redo() {
    let manifest = json!({"root":"article","marks":[],"nodes":{"article":{"shape":"flow","children":["line","box"],"default":"line"},"line":{"shape":"text"},"box":{"shape":"flow","children":["caption","box"],"default":"caption"},"caption":{"shape":"text","attrs":{"payload":{"default":{"tone":"plain"}}}}}});
    let schema = RuntimeSchema::compile(manifest.clone()).unwrap();
    let node = json!({"t":"node","id":t(6,"A"),"origin":t(4,"A"),"type":"caption","boundary":"split:{\"into\":\"0@1@A/body\",\"after\":\"0@1@A/body\",\"left\":\"4@A\",\"right\":\"5@A\"}","attrs":{"payload":{"tone":"plain"}}});
    let wrapped = schema
        .reference_operation(
            node.clone(),
            vec![(
                vec!["attrs".into(), "payload".into()],
                schema
                    .reference_value(&["nodes", "caption", "attrs", "payload"], None)
                    .unwrap(),
            )],
        )
        .unwrap();
    let mut traces = vec![];
    for birth in [node, wrapped] {
        let mut server = Server::default();
        let mut trace = vec![];
        for request in [
            json!({"cmd":"new","actor":"A","runtimeSchema":manifest}),
            json!({"cmd":"apply","ops":[{"t":"node","id":t(1,"A"),"origin":t(0,"~root"),"type":"box"},{"t":"node","id":t(2,"A"),"origin":t(1,"A"),"type":"box"},{"t":"text","id":t(3,"A"),"origin":t(0,"1@A/body"),"units":[97,98,99]}]}),
            json!({"cmd":"history_record","ops":[birth,{"t":"move","at":t(7,"A"),"target":t(6,"A"),"parent":t(0,"2@A/body"),"after":null}],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
            json!({"cmd":"history_undo"}),
            json!({"cmd":"history_redo"}),
        ] {
            let mut request = request;
            request["replica"] = json!("r");
            request["schema"] = json!(schema.identity());
            let mut response = server.request(request);
            assert_eq!(response["ok"], true, "{response}");
            // The admission wrapper is the only declared wire difference.
            if let Some(ops) = response["ops"].as_array_mut() {
                for op in ops {
                    if op["t"] == "reference" {
                        *op = op["op"].clone();
                    }
                }
            }
            trace.push(response);
        }
        assert_eq!(trace[3]["ops"][0]["key"], "$join");
        traces.push(trace);
    }
    assert_eq!(traces[0], traces[1]);
}

fn ordered_payload(reverse: bool) -> Value {
    serde_json::from_str(if reverse {
        r#"{"second":{"right":3,"left":2},"first":1}"#
    } else {
        r#"{"first":1,"second":{"left":2,"right":3}}"#
    })
    .unwrap()
}
fn ordered_schema(mark: bool, enumeration: bool, reverse: bool) -> RuntimeSchema {
    let payload = ordered_payload(reverse);
    let spec = if enumeration {
        json!({"default":null,"values":[payload]})
    } else {
        json!({"default":payload})
    };
    let mut manifest = json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}}});
    if mark {
        manifest["markValues"] = json!({"payload":spec});
    } else {
        manifest["nodes"]["p"]["attrs"] = json!({"payload":spec});
    }
    RuntimeSchema::compile(manifest).unwrap()
}
fn ordered_request(
    server: &mut Server,
    replica: &str,
    schema: &RuntimeSchema,
    mut request: Value,
) -> Value {
    request["replica"] = json!(replica);
    request["schema"] = json!(schema.identity());
    let result = server.request(request);
    assert_eq!(result["ok"], true, "{result}");
    result
}
fn reordered_schema_peer_case(mark: bool, enumeration: bool) {
    let a = ordered_schema(mark, enumeration, false);
    let b = ordered_schema(mark, enumeration, true);
    assert_eq!(a.identity(), b.identity());
    assert_ne!(
        serde_json::to_string(a.manifest()).unwrap(),
        serde_json::to_string(b.manifest()).unwrap()
    );
    let mut server = Server::default();
    for (replica, actor, schema) in [("a", "A", &a), ("b", "B", &b)] {
        ordered_request(
            &mut server,
            replica,
            schema,
            json!({"cmd":"new","actor":actor,"runtimeSchema":schema.manifest()}),
        );
    }
    let payload = ordered_payload(false);
    let raw = if mark {
        json!({"t":"text","id":t(1,"A"),"origin":t(0,"~root"),"units":[97],"marks":{"payload":payload}})
    } else {
        set(1, "A", t(0, "~root"), "payload", payload)
    };
    let at: Vec<&str> = if mark {
        vec!["markValues", "payload"]
    } else {
        vec!["nodes", "p", "attrs", "payload"]
    };
    let path: Vec<String> = if mark {
        vec!["marks".into(), "payload".into()]
    } else {
        vec!["value".into()]
    };
    let op = a
        .reference_operation(
            raw,
            vec![(
                path,
                a.reference_value(&at, enumeration.then_some(0)).unwrap(),
            )],
        )
        .unwrap();
    let op: Value = serde_json::from_str(&serde_json::to_string(&op).unwrap()).unwrap();
    for (replica, schema) in [("a", &a), ("b", &b)] {
        let result = ordered_request(
            &mut server,
            replica,
            schema,
            json!({"cmd":"apply","ops":[op.clone()]}),
        );
        let stored = &token(
            &result["state"],
            if mark { 1 } else { 0 },
            if mark { "A" } else { "~root" },
        )["attrs"]["payload"]["value"];
        assert_eq!(
            serde_json::to_string(stored).unwrap(),
            r#"{"first":1,"second":{"left":2,"right":3}}"#
        );
        let snapshot = ordered_request(&mut server, replica, schema, json!({"cmd":"snapshot"}))
            ["snapshot"]
            .clone();
        assert_eq!(snapshot["ops"][0], op);
        let restored = ordered_request(
            &mut server,
            replica,
            schema,
            json!({"cmd":"restore","actor":if replica=="a" {"A"}else{"B"},"snapshot":snapshot}),
        );
        assert_eq!(restored["state"], result["state"]);
    }
}
#[test]
fn reordered_same_identity_mark_enum_reference_keeps_source_payload_order() {
    reordered_schema_peer_case(true, true);
}
#[test]
fn reordered_same_identity_mark_default_reference_keeps_source_payload_order() {
    reordered_schema_peer_case(true, false);
}
#[test]
fn reordered_same_identity_attribute_enum_reference_keeps_source_payload_order() {
    reordered_schema_peer_case(false, true);
}
#[test]
fn reordered_same_identity_attribute_default_reference_keeps_source_payload_order() {
    reordered_schema_peer_case(false, false);
}
#[test]
fn reordered_same_identity_history_undo_redo_and_restore_preserve_source_json_order() {
    let a = ordered_schema(true, true, false);
    let b = ordered_schema(true, true, true);
    assert_eq!(a.identity(), b.identity());
    let mut server = Server::default();
    for (replica, actor, schema) in [("a", "A", &a), ("b", "B", &b)] {
        ordered_request(
            &mut server,
            replica,
            schema,
            json!({"cmd":"new","actor":actor,"runtimeSchema":schema.manifest()}),
        );
        ordered_request(
            &mut server,
            replica,
            schema,
            json!({"cmd":"apply","ops":[text()]}),
        );
    }
    let raw = set(3, "A", t(1, "A"), "payload", ordered_payload(false));
    let op = a
        .reference_operation(
            raw,
            vec![(
                vec!["value".into()],
                a.reference_value(&["markValues", "payload"], Some(0))
                    .unwrap(),
            )],
        )
        .unwrap();
    ordered_request(
        &mut server,
        "a",
        &a,
        json!({"cmd":"history_record","ops":[op.clone()],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
    );
    ordered_request(&mut server, "b", &b, json!({"cmd":"apply","ops":[op]}));
    let mut checkpoint = ordered_request(&mut server, "a", &a, json!({"cmd":"history_export"}))
        ["checkpoint"]
        .clone();
    checkpoint["document"]["manifest"] = b.manifest().clone();
    ordered_request(
        &mut server,
        "a",
        &b,
        json!({"cmd":"history_restore","checkpoint":checkpoint}),
    );
    for command in [
        "history_undo",
        "history_redo",
        "history_undo",
        "history_redo",
    ] {
        let local = ordered_request(&mut server, "a", &b, json!({"cmd":command}));
        let ops: Value =
            serde_json::from_str(&serde_json::to_string(&local["ops"]).unwrap()).unwrap();
        let peer = ordered_request(&mut server, "b", &b, json!({"cmd":"apply","ops":ops}));
        assert_eq!(local["state"], peer["state"]);
        if command == "history_redo" {
            assert_eq!(
                serde_json::to_string(&local["ops"][0]["op"]["value"]).unwrap(),
                r#"{"first":1,"second":{"left":2,"right":3}}"#
            );
            assert_eq!(
                serde_json::to_string(&token(&local["state"], 1, "A")["attrs"]["payload"]["value"])
                    .unwrap(),
                r#"{"first":1,"second":{"left":2,"right":3}}"#
            );
        }
        let checkpoint = ordered_request(&mut server, "a", &b, json!({"cmd":"history_export"}))
            ["checkpoint"]
            .clone();
        let restored = ordered_request(
            &mut server,
            "a",
            &b,
            json!({"cmd":"history_restore","checkpoint":checkpoint}),
        );
        assert_eq!(restored["state"], local["state"]);
    }
}
