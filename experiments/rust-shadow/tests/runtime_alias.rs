use doc_sync_rust_shadow::{runtime_schema::RuntimeSchema, Server};
use serde_json::{json, Value};

fn manifest() -> Value {
    json!({"root":"doc","marks":[],"markValues":{"choice":{"default":{"tone":"warm","n":1},"values":[{"tone":"warm","n":1},{"tone":"warm","n":1},["cold"]]},"array":{"default":["x"],"values":[["x"],["x"]]}},"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text","attrs":{"choice":{"default":{"tone":"warm","n":1},"values":[{"tone":"warm","n":1},{"tone":"warm","n":1},["cold"]]}}}}})
}
fn dto() -> Value {
    json!({"format":"doc-sync-runtime-schema-alias-v1","manifest":manifest(),"defaultReferences":[{"at":["markValues","choice"],"enumIndex":0},{"at":["markValues","array"],"enumIndex":1},{"at":["nodes","p","attrs","choice"],"enumIndex":0}]})
}
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(dto()).unwrap()
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
    for (r, a) in [("a", "A"), ("b", "B")] {
        let v = ask(
            &mut s,
            r,
            json!({"cmd":"new","actor":a,"runtimeSchema":dto()}),
        );
        assert_eq!(v["ok"], true, "{v}");
    }
    s
}
fn apply(s: &mut Server, r: &str, ops: Vec<Value>) -> Value {
    let v = ask(s, r, json!({"cmd":"apply","ops":ops}));
    assert_eq!(v["ok"], true, "{v}");
    v["state"].clone()
}
fn text() -> Value {
    json!({"t":"text","id":t(1,"A"),"origin":t(0,"~root"),"units":[97]})
}
fn reference(op: Value, at: &[&str], index: Option<usize>) -> Value {
    let s = schema();
    s.reference_operation(
        op,
        vec![(vec!["value".into()], s.reference_value(at, index).unwrap())],
    )
    .unwrap()
}
fn set(n: u64, a: &str, v: Value) -> Value {
    json!({"t":"set","at":t(n,a),"ids":[t(1,"A")],"key":"choice","value":v})
}
#[test]
fn alias_dto_admits_shared_default_but_bare_equal_copy_rejects() {
    assert!(RuntimeSchema::compile(manifest()).is_err());
    let s = schema();
    assert_eq!(s.manifest(), &manifest());
    assert!(s
        .validate_mark_value("choice", &json!({"tone":"warm","n":1}))
        .is_err());
    assert!(s.reference_value(&["markValues", "choice"], None).is_ok());
    assert!(s
        .reference_value(&["markValues", "choice"], Some(1))
        .is_ok());
}
#[test]
fn alias_identity_normalizes_domain_edge_order_but_retains_exact_graph() {
    let s = schema();
    let mut reordered = dto();
    reordered["manifest"]["domain"] = json!("document");
    reordered["defaultReferences"]
        .as_array_mut()
        .unwrap()
        .reverse();
    assert_eq!(
        RuntimeSchema::compile(reordered).unwrap().identity(),
        s.identity()
    );
    let mut other = dto();
    other["defaultReferences"][0]["enumIndex"] = json!(1);
    let other = RuntimeSchema::compile(other).unwrap();
    assert_ne!(other.identity(), s.identity());
    assert_eq!(other.base_identity(), s.base_identity());
    assert_ne!(s.identity(), s.base_identity());
    let mut both = dto();
    both["defaultReferences"]
        .as_array_mut()
        .unwrap()
        .push(json!({"at":["markValues","choice"],"enumIndex":1}));
    let both = RuntimeSchema::compile(both).unwrap();
    for i in 0..2 {
        assert!(both
            .is_default_reference(
                &both
                    .reference_value(&["markValues", "choice"], Some(i))
                    .unwrap()
            )
            .unwrap());
    }
    assert!(!s
        .is_default_reference(
            &s.reference_value(&["markValues", "choice"], Some(1))
                .unwrap()
        )
        .unwrap());
    assert!(s
        .is_default_reference(
            &s.reference_value(&["markValues", "choice"], Some(0))
                .unwrap()
        )
        .unwrap());
    assert!(s
        .is_default_reference(
            &s.reference_value(&["markValues", "array"], Some(1))
                .unwrap()
        )
        .unwrap());
}
#[test]
fn malformed_alias_schemas_cannot_replace_existing_replica() {
    let mut s = new();
    apply(&mut s, "a", vec![text()]);
    let before = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    let mut cases = vec![];
    for key in [
        "format",
        "at",
        "index",
        "payload",
        "missing",
        "scalar",
        "computed",
        "fields",
        "duplicate",
        "empty",
        "extra",
        "edgeExtra",
        "negative",
        "fractional",
        "unlinked",
    ] {
        let mut v = dto();
        match key {
            "format" => v["format"] = json!("other"),
            "at" => v["defaultReferences"][0]["at"] = json!(["markValues", "choice", "default"]),
            "index" => v["defaultReferences"][0]["enumIndex"] = json!(99),
            "payload" => v["manifest"]["markValues"]["choice"]["default"] = json!({"tone":"wrong"}),
            "missing" => {
                v["manifest"]["markValues"]["choice"]
                    .as_object_mut()
                    .unwrap()
                    .shift_remove("default");
            }
            "scalar" => v["manifest"]["markValues"]["choice"] = json!({"default":1,"values":[1]}),
            "computed" => v["manifest"]["markValues"]["choice"]["computed"] = json!(true),
            "fields" => v["manifest"]["markValues"]["choice"]["fields"] = json!({}),
            "duplicate" => {
                let edge = v["defaultReferences"][0].clone();
                v["defaultReferences"].as_array_mut().unwrap().push(edge);
            }
            "empty" => v["defaultReferences"] = json!([]),
            "extra" => v["extra"] = json!(true),
            "edgeExtra" => v["defaultReferences"][0]["source"] = json!("default"),
            "negative" => v["defaultReferences"][0]["enumIndex"] = json!(-1),
            "fractional" => v["defaultReferences"][0]["enumIndex"] = json!(0.5),
            _ => {
                v["defaultReferences"].as_array_mut().unwrap().remove(0);
            }
        }
        cases.push((key, v));
    }
    for (key, dto) in cases {
        assert!(RuntimeSchema::compile(dto.clone()).is_err(), "{key}");
        let r = ask(
            &mut s,
            "a",
            json!({"cmd":"new","actor":"A","runtimeSchema":dto}),
        );
        assert_eq!(r["ok"], false, "{key}: {r}");
        assert_eq!(
            ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"],
            before,
            "{key}"
        );
    }
}
#[test]
fn shared_refs_cross_json_peers_and_checkpoint_replay_with_plain_register_values() {
    let mut s = new();
    for r in ["a", "b"] {
        apply(&mut s, r, vec![text()]);
    }
    for (n, index) in [(2, None), (3, Some(0)), (4, Some(1))] {
        let op = reference(
            set(n, "A", json!({"n":1,"tone":"warm"})),
            &["markValues", "choice"],
            index,
        );
        let json = serde_json::to_string(&op).unwrap();
        let wire = serde_json::from_str(&json).unwrap();
        let a = apply(&mut s, "a", vec![wire]);
        let b = apply(&mut s, "b", vec![op.clone()]);
        assert_eq!(a, b);
        assert_eq!(
            a["items"][1]["attrs"]["choice"]["value"],
            json!({"n":1,"tone":"warm"})
        );
        let snapshot = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
        assert_eq!(
            snapshot["manifest"]["format"],
            "doc-sync-runtime-schema-alias-v1"
        );
        assert_eq!(snapshot["ops"][n as usize - 1], op);
        let restored = ask(
            &mut s,
            "a",
            json!({"cmd":"restore","actor":"A","snapshot":snapshot}),
        );
        assert_eq!(restored["ok"], true, "{restored}");
        assert_eq!(restored["state"], a);
    }
    let before = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    let bad = set(5, "A", json!({"tone":"warm","n":1}));
    assert_eq!(
        ask(&mut s, "a", json!({"cmd":"apply","ops":[bad]}))["ok"],
        false
    );
    let mut changed = before.clone();
    changed["manifest"]["defaultReferences"][1]["enumIndex"] = json!(1);
    assert_eq!(
        ask(
            &mut s,
            "a",
            json!({"cmd":"restore","actor":"A","snapshot":changed})
        )["ok"],
        false
    );
    assert_eq!(
        ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"],
        before
    );
}
#[test]
fn alias_reference_constraints_and_exact_writer_provenance_reject_atomically() {
    let mut s = new();
    apply(&mut s, "a", vec![text()]);
    let valid = reference(
        set(2, "A", json!({"tone":"warm","n":1})),
        &["markValues", "choice"],
        Some(0),
    );
    apply(&mut s, "a", vec![valid.clone()]);
    let before = ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    for key in [
        "schema",
        "payload",
        "index",
        "source",
        "duplicate",
        "metadata",
    ] {
        let mut op = valid.clone();
        if key != "metadata" {
            op["op"]["at"] = t(3, "A");
        }
        match key {
            "schema" => op["references"][0]["schema"] = json!(schema().base_identity()),
            "payload" => op["op"]["value"] = json!({"tone":"cold"}),
            "index" => op["references"][0]["index"] = json!(9),
            "source" => op["references"][0]["source"] = json!("default"),
            "duplicate" => {
                let r = op["references"][0].clone();
                op["references"].as_array_mut().unwrap().push(r);
            }
            _ => {
                op["references"][0]["source"] = json!("default");
                op["references"][0]
                    .as_object_mut()
                    .unwrap()
                    .shift_remove("index");
            }
        }
        let r = ask(&mut s, "a", json!({"cmd":"apply","ops":[op]}));
        assert_eq!(r["ok"], false, "{key}: {r}");
        assert_eq!(
            ask(&mut s, "a", json!({"cmd":"snapshot"}))["snapshot"],
            before,
            "{key}"
        );
    }
}
#[test]
fn alias_history_replays_selected_index_and_foreign_writer_survives_undo() {
    let mut s = new();
    for r in ["a", "b"] {
        apply(&mut s, r, vec![text()]);
    }
    let a = reference(
        set(2, "A", json!({"tone":"warm","n":1})),
        &["markValues", "choice"],
        Some(0),
    );
    let record = ask(
        &mut s,
        "a",
        json!({"cmd":"history_record","ops":[a.clone()],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
    );
    assert_eq!(record["ok"], true, "{record}");
    apply(&mut s, "b", vec![a]);
    let undo = ask(&mut s, "a", json!({"cmd":"history_undo"}));
    assert_eq!(undo["ok"], true, "{undo}");
    apply(&mut s, "b", undo["ops"].as_array().unwrap().clone());
    let checkpoint = ask(&mut s, "a", json!({"cmd":"history_export"}))["checkpoint"].clone();
    let restore = ask(
        &mut s,
        "a",
        json!({"cmd":"history_restore","checkpoint":checkpoint}),
    );
    assert_eq!(restore["ok"], true, "{restore}");
    let redo = ask(&mut s, "a", json!({"cmd":"history_redo"}));
    assert_eq!(redo["ok"], true, "{redo}");
    assert_eq!(redo["ops"][0]["references"][0]["index"], 0);
    assert_eq!(
        redo["state"],
        apply(&mut s, "b", redo["ops"].as_array().unwrap().clone())
    );
    let b = reference(
        set(9, "B", json!({"tone":"warm","n":1})),
        &["markValues", "choice"],
        Some(1),
    );
    let state = apply(&mut s, "a", vec![b.clone()]);
    assert_eq!(state, apply(&mut s, "b", vec![b]));
    let undo = ask(&mut s, "a", json!({"cmd":"history_undo"}));
    assert_eq!(undo["ok"], true, "{undo}");
    assert_eq!(undo["ops"], json!([]));
    assert_eq!(undo["state"], state);
}
#[test]
fn reordered_same_identity_schema_binds_payload_without_reordering_raw_json() {
    let mut m: Value = serde_json::from_str(&manifest().to_string()).unwrap();
    let v: Value = serde_json::from_str("{\"n\":1,\"tone\":\"warm\"}").unwrap();
    m["markValues"]["choice"]["default"] = v.clone();
    m["markValues"]["choice"]["values"][0] = v;
    let mut d = dto();
    d["manifest"] = m;
    let reordered = RuntimeSchema::compile(d.clone()).unwrap();
    assert_eq!(reordered.identity(), schema().identity());
    let mut s = Server::default();
    assert_eq!(
        ask(
            &mut s,
            "a",
            json!({"cmd":"new","actor":"A","runtimeSchema":dto()})
        )["ok"],
        true
    );
    let created = ask(
        &mut s,
        "b",
        json!({"cmd":"new","actor":"B","runtimeSchema":d}),
    );
    assert_eq!(created["ok"], true, "{created}");
    for r in ["a", "b"] {
        apply(&mut s, r, vec![text()]);
    }
    let v: Value = serde_json::from_str("{\"n\":1,\"tone\":\"warm\"}").unwrap();
    let op = reference(set(2, "A", v), &["markValues", "choice"], Some(0));
    let a = apply(&mut s, "a", vec![op.clone()]);
    let b = apply(&mut s, "b", vec![op]);
    assert_eq!(a, b);
    assert_eq!(
        a["items"][1]["attrs"]["choice"]["value"].to_string(),
        "{\"n\":1,\"tone\":\"warm\"}"
    );
}

#[test]
fn linked_enum_factory_uses_shared_default_order_at_every_nested_object() {
    // JSON.stringify of a single JS object has this same order through each alias.
    for (default_json, choice_json) in [
        (r#"{"a":1,"b":2}"#, r#"{"b":2,"a":1}"#),
        (
            r#"[{"a":1,"b":2},{"nested":[{"x":3,"y":4}],"tail":5}]"#,
            r#"[{"b":2,"a":1},{"tail":5,"nested":[{"y":4,"x":3}]}]"#,
        ),
        (
            r#"{"outer":[{"a":1,"b":2}],"other":{"x":3,"y":4}}"#,
            r#"{"other":{"y":4,"x":3},"outer":[{"b":2,"a":1}]}"#,
        ),
    ] {
        let default: Value = serde_json::from_str(default_json).unwrap();
        let choice: Value = serde_json::from_str(choice_json).unwrap();
        let descriptor = json!({"default":default,"values":[choice,choice,choice]});
        let manifest = json!({"root":"doc","marks":[],"markValues":{"paint":descriptor},"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text","attrs":{"choice":descriptor}}}});
        let dto = json!({"format":"doc-sync-runtime-schema-alias-v1","manifest":manifest,"defaultReferences":[{"at":["markValues","paint"],"enumIndex":0},{"at":["markValues","paint"],"enumIndex":1},{"at":["nodes","p","attrs","choice"],"enumIndex":0},{"at":["nodes","p","attrs","choice"],"enumIndex":1}]});
        let schema = RuntimeSchema::compile(dto).unwrap();
        for path in [
            &["markValues", "paint"][..],
            &["nodes", "p", "attrs", "choice"][..],
        ] {
            assert_eq!(
                schema
                    .reference_payload(&schema.reference_value(path, None).unwrap())
                    .unwrap()
                    .to_string(),
                default_json
            );
            for index in 0..3 {
                let reference = schema.reference_value(path, Some(index)).unwrap();
                assert_eq!(reference["source"], "enum");
                assert_eq!(reference["index"], index);
                assert_eq!(
                    schema.reference_payload(&reference).unwrap().to_string(),
                    if index < 2 { default_json } else { choice_json }
                );
            }
        }
    }
}
#[test]
fn linked_enum_history_redo_preserves_shared_payload_serialized_order_and_selected_index() {
    let default: Value = serde_json::from_str(r#"[{"a":1,"b":2}]"#).unwrap();
    let choice: Value = serde_json::from_str(r#"[{"b":2,"a":1}]"#).unwrap();
    let schema=RuntimeSchema::compile(json!({"format":"doc-sync-runtime-schema-alias-v1","manifest":{"root":"doc","marks":[],"markValues":{"paint":{"default":default,"values":[choice,choice]}},"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}}},"defaultReferences":[{"at":["markValues","paint"],"enumIndex":0},{"at":["markValues","paint"],"enumIndex":1}]})).unwrap();
    let mut server = Server::default();
    let request = |server: &mut Server, mut value: Value| {
        value["replica"] = json!("a");
        value["schema"] = json!(schema.identity());
        let r = server.request(value);
        assert_eq!(r["ok"], true, "{r}");
        r
    };
    request(
        &mut server,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema.dto()}),
    );
    request(&mut server, json!({"cmd":"apply","ops":[text()]}));
    let handle = schema
        .reference_value(&["markValues", "paint"], Some(1))
        .unwrap();
    let payload = schema.reference_payload(&handle).unwrap();
    assert_eq!(payload.to_string(), r#"[{"a":1,"b":2}]"#);
    let op = schema
        .reference_operation(
            json!({"t":"set","at":t(2,"A"),"ids":[t(1,"A")],"key":"paint","value":payload}),
            vec![(vec!["value".into()], handle)],
        )
        .unwrap();
    request(
        &mut server,
        json!({"cmd":"history_record","ops":[op],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
    );
    request(&mut server, json!({"cmd":"history_undo"}));
    let checkpoint = request(&mut server, json!({"cmd":"history_export"}))["checkpoint"].clone();
    request(
        &mut server,
        json!({"cmd":"history_restore","checkpoint":checkpoint}),
    );
    let redo = request(&mut server, json!({"cmd":"history_redo"}));
    assert_eq!(
        redo["ops"][0]["op"]["value"].to_string(),
        r#"[{"a":1,"b":2}]"#
    );
    assert_eq!(redo["ops"][0]["references"][0]["source"], "enum");
    assert_eq!(redo["ops"][0]["references"][0]["index"], 1);
    let snapshot = request(&mut server, json!({"cmd":"snapshot"}))["snapshot"].clone();
    assert_eq!(
        snapshot["ops"].as_array().unwrap().last().unwrap()["op"]["value"].to_string(),
        r#"[{"a":1,"b":2}]"#
    );
}
