use doc_sync_rust_shadow::{
    runtime_schema::{json_identity, RuntimeSchema},
    Server,
};
use serde_json::{json, Value};

fn manifest() -> Value {
    json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box"],"default":"p"},
        "p":{"shape":"text"},
        "box":{"shape":"flow","children":["p"],"default":"p"},
        "unused":{"shape":"text","text":true,"next":"p","attrs":{"label":{"default":"unused"}}},
        "unusedAtom":{"shape":"atom"},
        "unusedFlow":{"shape":"flow","children":["unused","unusedFlow"],"default":"unused","childRules":{}}
    }})
}

fn ticket(key: &str) -> Value {
    let (n, actor) = key.split_once('@').unwrap();
    json!({"lamport":n.parse::<u64>().unwrap(),"actor":actor})
}

fn node(id: &str, origin: &str, kind: &str) -> Value {
    let mut op = json!({"t":"node","id":ticket(id),"origin":ticket(origin),"type":kind,"attrs":{}});
    if matches!(kind, "p" | "unused") {
        op["boundary"] = json!(format!("{origin}|end"));
    }
    op
}

fn ask(server: &mut Server, schema: &RuntimeSchema, mut request: Value) -> Value {
    request["replica"] = json!("r");
    request["schema"] = json!(schema.identity());
    server.request(request)
}

fn new(schema: &RuntimeSchema) -> Server {
    let mut server = Server::default();
    let result = ask(
        &mut server,
        schema,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema.dto()}),
    );
    assert_eq!(result["ok"], true, "{result}");
    server
}

fn assert_rejected(server: &mut Server, schema: &RuntimeSchema, ops: Vec<Value>) {
    let before = ask(server, schema, json!({"cmd":"history_export"}))["checkpoint"].clone();
    let result = ask(server, schema, json!({"cmd":"apply","ops":ops}));
    assert_eq!(result["ok"], false, "{result}");
    assert_eq!(
        ask(server, schema, json!({"cmd":"history_export"}))["checkpoint"],
        before
    );
}

#[test]
fn unused_declarations_keep_identity_dto_snapshot_and_history_checkpoint() {
    let descriptor = manifest();
    let schema = RuntimeSchema::compile(descriptor.clone()).unwrap();
    assert_eq!(schema.identity(), json_identity(&descriptor).unwrap());
    assert_eq!(schema.manifest(), &descriptor);
    assert_eq!(schema.dto(), &descriptor);
    let mut changed = descriptor.clone();
    changed["nodes"]["unused"]["attrs"]["label"]["default"] = json!("changed");
    assert_ne!(
        schema.identity(),
        RuntimeSchema::compile(changed).unwrap().identity()
    );
    let mut server = new(&schema);
    let snapshot = ask(&mut server, &schema, json!({"cmd":"snapshot"}))["snapshot"].clone();
    assert_eq!(snapshot["manifest"], descriptor);
    let checkpoint =
        ask(&mut server, &schema, json!({"cmd":"history_export"}))["checkpoint"].clone();
    assert_eq!(checkpoint["document"]["manifest"], descriptor);
    let mut recovered = Server::default();
    let result = ask(
        &mut recovered,
        &schema,
        json!({"cmd":"history_restore","actor":"A","checkpoint":checkpoint}),
    );
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(
        ask(&mut recovered, &schema, json!({"cmd":"snapshot"}))["snapshot"],
        snapshot
    );
}

#[test]
fn invalid_unused_declarations_still_fail_closed() {
    for (path, value) in [
        ("/nodes/unused/shape", json!("bogus")),
        ("/nodes/unused/next", json!("missing")),
        ("/nodes/unused/text", json!(0)),
        (
            "/nodes/unused/attrs",
            json!({"label":{"default":"x","values":["y"]}}),
        ),
        ("/nodes/unusedFlow/children", json!(["missing"])),
        ("/nodes/unusedFlow/default", json!("missing")),
        (
            "/nodes/unusedFlow/childRules",
            json!({"unusedFlow":{"min":1}}),
        ),
        (
            "/nodes/unusedFlow/childRules",
            json!({"unused":{"min":2,"max":1}}),
        ),
    ] {
        let mut descriptor = manifest();
        *descriptor
            .pointer_mut(path)
            .unwrap_or_else(|| panic!("missing test path {path}")) = value;
        assert!(
            RuntimeSchema::compile(descriptor).is_err(),
            "accepted {path}"
        );
    }
}

#[test]
fn declarations_do_not_grant_root_or_parent_placement() {
    let schema = RuntimeSchema::compile(manifest()).unwrap();
    let mut server = new(&schema);
    for kind in ["unused", "unusedAtom", "unusedFlow"] {
        assert_rejected(&mut server, &schema, vec![node("1@A", "0@~root", kind)]);
        assert_rejected(
            &mut server,
            &schema,
            vec![
                node("1@A", "0@~root", "p"),
                json!({"t":"set","at":ticket("2@A"),"ids":[ticket("1@A")],"key":"$type","value":kind}),
            ],
        );
        assert_rejected(
            &mut server,
            &schema,
            vec![
                node("1@A", "0@~root", "box"),
                node("2@A", "0@1@A/body", kind),
            ],
        );
    }
    let accepted = ask(
        &mut server,
        &schema,
        json!({"cmd":"apply","ops":[node("1@A", "0@~root", "box"), node("2@A", "1@A", "box")]}),
    );
    assert_eq!(accepted["ok"], true, "{accepted}");
    assert_rejected(
        &mut server,
        &schema,
        vec![
            json!({"t":"move","at":ticket("3@A"),"target":ticket("2@A"),"parent":ticket("0@1@A/body"),"after":null}),
        ],
    );
}

#[test]
fn disconnected_grid_group_and_inline_graphs_compile_without_placement_access() {
    let mut descriptor = manifest();
    let nodes = descriptor["nodes"].as_object_mut().unwrap();
    nodes.insert(
        "unusedTable".into(),
        json!({"shape":"grid","children":["unusedRow"]}),
    );
    nodes.insert(
        "unusedRow".into(),
        json!({"shape":"row","children":["unusedCell"]}),
    );
    nodes.insert(
        "unusedCell".into(),
        json!({"shape":"cell","children":["unusedBody"]}),
    );
    nodes.insert(
        "unusedBody".into(),
        json!({"shape":"flow","children":["unused"],"default":"unused"}),
    );
    nodes.insert(
        "unusedGroup".into(),
        json!({"shape":"group","children":["unused"],"by":["label"]}),
    );
    nodes.insert("unusedInline".into(), json!({"shape":"inline"}));
    nodes["unused"]["children"] = json!(["unusedInline"]);
    let schema = RuntimeSchema::compile(descriptor.clone()).unwrap();
    let mut server = new(&schema);
    assert_rejected(
        &mut server,
        &schema,
        vec![node("1@A", "0@~root", "unusedTable")],
    );
    descriptor["nodes"]["unusedRow"]["children"] = json!(["p"]);
    assert!(RuntimeSchema::compile(descriptor).is_err());
}

fn active_history_models(descriptor: Value) -> Vec<Value> {
    let schema = RuntimeSchema::compile(descriptor).unwrap();
    let mut server = new(&schema);
    let mut models =
        vec![ask(&mut server, &schema, json!({"cmd":"state"}))["state"]["model"].clone()];
    for request in [
        json!({"cmd":"history_record","ops":[{"t":"text","id":ticket("1@A"),"origin":ticket("0@~root"),"units":[65],"marks":{}}],"now":1,"options":{"caretBefore":"before","caretAfter":"after"}}),
        json!({"cmd":"apply","ops":[{"t":"text","id":ticket("1@B"),"origin":ticket("0@~root"),"units":[66],"marks":{}}]}),
        json!({"cmd":"history_undo"}),
        json!({"cmd":"history_redo"}),
    ] {
        let result = ask(&mut server, &schema, request);
        assert_eq!(result["ok"], true, "{result}");
        models.push(ask(&mut server, &schema, json!({"cmd":"state"}))["state"]["model"].clone());
    }
    let checkpoint =
        ask(&mut server, &schema, json!({"cmd":"history_export"}))["checkpoint"].clone();
    let mut restored = Server::default();
    let result = ask(
        &mut restored,
        &schema,
        json!({"cmd":"history_restore","actor":"A","checkpoint":checkpoint}),
    );
    assert_eq!(result["ok"], true, "{result}");
    models.push(ask(&mut restored, &schema, json!({"cmd":"state"}))["state"]["model"].clone());
    models
}

#[test]
fn unused_graphs_preserve_active_flat_flow_material_and_history() {
    let base = json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}}});
    assert!(!RuntimeSchema::compile(base.clone())
        .unwrap()
        .is_nested_document());
    let mut extended = base.clone();
    for (name, node) in manifest()["nodes"].as_object().unwrap() {
        if !matches!(name.as_str(), "doc" | "p" | "box") {
            extended["nodes"][name] = node.clone();
        }
    }
    extended["nodes"]["unusedGroup"] =
        json!({"shape":"group","children":["unused"],"by":["label"]});
    extended["nodes"]["unusedTable"] = json!({"shape":"grid","children":["unusedRow"]});
    extended["nodes"]["unusedRow"] = json!({"shape":"row","children":["unusedCell"]});
    extended["nodes"]["unusedCell"] = json!({"shape":"cell","children":["unusedBody"]});
    extended["nodes"]["unusedBody"] =
        json!({"shape":"flow","children":["unused"],"default":"unused"});
    assert!(!RuntimeSchema::compile(extended.clone())
        .unwrap()
        .is_nested_document());
    assert_eq!(active_history_models(base), active_history_models(extended));
}

#[test]
fn flat_registry_does_not_grant_unused_leaf_placement() {
    let descriptor = json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"},"unused":{"shape":"text"},"unusedAtom":{"shape":"atom"}}});
    let schema = RuntimeSchema::compile(descriptor).unwrap();
    assert!(!schema.is_nested_document());
    let mut server = new(&schema);
    for kind in ["unused", "unusedAtom"] {
        assert_rejected(&mut server, &schema, vec![node("1@A", "0@~root", kind)]);
        assert_rejected(
            &mut server,
            &schema,
            vec![
                json!({"t":"set","at":ticket("1@A"),"ids":[ticket("0@~root")],"key":"$type","value":kind}),
            ],
        );
    }
}
