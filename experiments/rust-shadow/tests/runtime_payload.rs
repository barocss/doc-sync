use doc_sync_rust_shadow::{
    runtime_schema::{
        ReferenceGroup as Group, ReferenceSlot as Slot, RuntimeSchema, ValuePathSegment as Segment,
        PAYLOAD_FORMAT, SHARED_FORMAT,
    },
    Server,
};
use serde_json::{json, Value};

fn mark(key: &str) -> Slot {
    Slot::default(&["markValues", key])
}
fn attr(key: &str) -> Slot {
    Slot::default(&["nodes", "p", "attrs", key])
}
fn child(slot: Slot, key: &str) -> Slot {
    slot.nested([Segment::key(key)])
}
fn ordered(reverse: bool) -> Value {
    serde_json::from_str(if reverse {
        r#"{"z":2,"a":1}"#
    } else {
        r#"{"a":1,"z":2}"#
    })
    .unwrap()
}
fn manifest() -> Value {
    json!({"root":"doc","marks":[],"markValues":{"source":{"default":{"child":ordered(false),"array":[ordered(false)]}},"other":{"default":{"child":ordered(true),"array":[ordered(true)]}},"independent":{"default":{"child":ordered(false),"array":[ordered(false)]}},"ordered":{"default":ordered(true)}},"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text","attrs":{"target":{"default":null,"values":[ordered(false)]},"fallback":{"default":ordered(false)},"container":{"default":{"child":ordered(false)}}}}}})
}
fn groups() -> Vec<Group> {
    let source = child(mark("source"), "child");
    vec![Group::new(
        mark("ordered"),
        [
            mark("ordered"),
            source,
            Slot::enum_entry(&["nodes", "p", "attrs", "target"], 0),
            attr("fallback"),
            child(attr("container"), "child"),
        ],
    )]
}
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile_with_payload_references(manifest(), groups()).unwrap()
}
fn handle(schema: &RuntimeSchema, slot: Slot) -> Value {
    schema.reference_value_at(&slot).unwrap()
}
fn ticket(n: u64, actor: &str) -> Value {
    json!({"lamport":n,"actor":actor})
}
fn set(n: u64, actor: &str, key: &str, value: Value) -> Value {
    json!({"t":"set","at":ticket(n,actor),"ids":[ticket(0,"~root")],"key":key,"value":value})
}
fn bind(schema: &RuntimeSchema, n: u64, actor: &str, key: &str, slot: Slot) -> Value {
    let reference = handle(schema, slot);
    schema
        .reference_operation(
            set(n, actor, key, schema.reference_payload(&reference).unwrap()),
            vec![(vec!["value".into()], reference)],
        )
        .unwrap()
}
fn ask(server: &mut Server, schema: &RuntimeSchema, replica: &str, mut request: Value) -> Value {
    request["schema"] = json!(schema.identity());
    request["replica"] = json!(replica);
    server.request(request)
}
fn ok(server: &mut Server, schema: &RuntimeSchema, replica: &str, request: Value) -> Value {
    let response = ask(server, schema, replica, request);
    assert_eq!(response["ok"], true, "{response}");
    response
}
fn new(schema: &RuntimeSchema) -> Server {
    let mut server = Server::default();
    for (replica, actor) in [("a", "A"), ("b", "B")] {
        ok(
            &mut server,
            schema,
            replica,
            json!({"cmd":"new","actor":actor,"runtimeSchema":schema.dto()}),
        );
    }
    server
}
#[test]
fn nested_handles_keep_source_path_and_target_root_identity() {
    let schema = schema();
    let source = handle(&schema, child(mark("source"), "child"));
    assert_eq!(source["valuePath"], json!(["child"]));
    assert_eq!(
        schema.reference_payload(&source).unwrap().to_string(),
        ordered(true).to_string()
    );
    schema
        .accepts_reference_at(&source, &["nodes", "p", "attrs", "target"])
        .unwrap();
    assert!(!schema
        .is_default_reference_at(&source, &["nodes", "p", "attrs", "target"])
        .unwrap());
    assert!(schema
        .is_default_reference_at(&source, &["nodes", "p", "attrs", "fallback"])
        .unwrap());
    assert!(schema
        .accepts_reference_at(&source, &["markValues", "source"])
        .is_err());
    let root = handle(&schema, mark("source"));
    assert_eq!(
        schema.reference_payload(&root).unwrap()["child"].to_string(),
        ordered(true).to_string()
    );
    assert!(root.get("valuePath").is_none());
}
#[test]
fn nested_groups_resolve_unshared_parent_factories_and_effective_fallback() {
    let schema = schema();
    assert_eq!(
        schema.manifest()["markValues"]["source"]["default"]["child"].to_string(),
        ordered(false).to_string()
    );
    assert_eq!(
        schema.effective_manifest()["markValues"]["source"]["default"]["child"].to_string(),
        ordered(true).to_string()
    );
    let mut server = new(&schema);
    let state = ok(&mut server, &schema, "a", json!({"cmd":"state"}))["state"].clone();
    assert_eq!(
        state["model"]["children"][0]["attrs"]["container"]["child"].to_string(),
        ordered(true).to_string()
    );
    assert_eq!(
        state["model"]["children"][0]["attrs"]["fallback"].to_string(),
        ordered(true).to_string()
    );
}
#[test]
fn shared_parents_imply_shared_descendants_but_children_never_merge_parents() {
    let mut groups = groups();
    groups.push(Group::new(mark("other"), [mark("source"), mark("other")]));
    let schema = RuntimeSchema::compile_with_payload_references(manifest(), groups).unwrap();
    let implied = handle(&schema, child(mark("other"), "child"));
    schema
        .accepts_reference_at(&implied, &["nodes", "p", "attrs", "target"])
        .unwrap();
    assert_eq!(
        schema.reference_payload(&implied).unwrap().to_string(),
        ordered(true).to_string()
    );
    let distinct = handle(&schema, mark("independent"));
    assert!(schema
        .accepts_reference_at(&distinct, &["markValues", "source"])
        .is_err());
    let equal_child = handle(&schema, child(mark("independent"), "child"));
    assert!(schema
        .accepts_reference_at(&equal_child, &["nodes", "p", "attrs", "target"])
        .is_err());
}
#[test]
fn parent_and_nested_representatives_are_order_independent() {
    let mut groups = groups();
    groups.push(Group::new(mark("source"), [mark("source"), mark("other")]));
    let schema =
        RuntimeSchema::compile_with_payload_references(manifest(), groups.clone()).unwrap();
    groups.reverse();
    for group in &mut groups {
        group.slots.reverse();
    }
    let reversed = RuntimeSchema::compile_with_payload_references(manifest(), groups).unwrap();
    assert_eq!(schema.dto(), reversed.dto());
    assert_eq!(schema.identity(), reversed.identity());
    assert_eq!(
        schema.effective_manifest().to_string(),
        reversed.effective_manifest().to_string()
    );
    assert_eq!(
        schema
            .reference_payload(&handle(&schema, mark("other")))
            .unwrap()["child"]
            .to_string(),
        ordered(true).to_string()
    );
}
#[test]
fn shared_array_descendants_accept_numeric_indices_and_reject_string_indices() {
    let source = mark("source").nested([Segment::key("array"), Segment::index(0)]);
    let mut groups = groups();
    groups[0].slots.push(source.clone());
    let schema = RuntimeSchema::compile_with_payload_references(manifest(), groups).unwrap();
    let reference = handle(&schema, source);
    assert_eq!(reference["valuePath"], json!(["array", 0]));
    schema
        .accepts_reference_at(&reference, &["nodes", "p", "attrs", "target"])
        .unwrap();
    let mut bad = reference.clone();
    bad["valuePath"] = json!(["array", "0"]);
    assert!(schema.reference_payload(&bad).is_err());
}
#[test]
fn malformed_payload_paths_and_legacy_nested_paths_fail_closed() {
    let schema = schema();
    for path in [
        json!(["missing"]),
        json!(["child", "a"]),
        json!(["array", 9]),
        json!(["array", -1]),
        json!(["array", 0.5]),
        json!([true]),
        json!(["child", 0]),
    ] {
        let mut dto = schema.dto().clone();
        let group = dto["referenceGroups"]
            .as_array_mut()
            .unwrap()
            .first_mut()
            .unwrap();
        group["representative"]["valuePath"] = path.clone();
        group["slots"][0]["valuePath"] = path;
        assert!(RuntimeSchema::compile(dto).is_err());
    }
    let mut dto = schema.dto().clone();
    dto["format"] = json!(SHARED_FORMAT);
    assert!(RuntimeSchema::compile(dto).is_err());
    let legacy = RuntimeSchema::compile(manifest()).unwrap();
    let mut reference = handle(&legacy, mark("source"));
    reference["valuePath"] = json!(["child"]);
    assert!(legacy.reference_payload(&reference).is_err());
    let mut too_deep = handle(&schema, mark("source"));
    too_deep["valuePath"] = json!(vec!["child"; 65]);
    assert!(schema.reference_payload(&too_deep).is_err());
}
#[test]
fn implicit_overlap_between_explicit_child_groups_is_rejected() {
    let mut groups = groups();
    groups.push(Group::new(mark("source"), [mark("source"), mark("other")]));
    groups.push(Group::new(
        child(mark("other"), "child"),
        [
            child(mark("other"), "child"),
            child(mark("independent"), "child"),
        ],
    ));
    assert!(
        RuntimeSchema::compile_with_payload_references(manifest(), groups)
            .unwrap_err()
            .contains("ambiguous implicit overlap")
    );
}
#[test]
fn same_descriptor_nested_source_does_not_bypass_constrained_root_enum() {
    let mut manifest = manifest();
    manifest["markValues"]["source"]["values"] =
        json!([manifest["markValues"]["source"]["default"].clone()]);
    let mut groups = groups();
    groups.push(Group::new(
        mark("source"),
        [
            mark("source"),
            Slot::enum_entry(&["markValues", "source"], 0),
        ],
    ));
    let schema = RuntimeSchema::compile_with_payload_references(manifest, groups).unwrap();
    let nested = handle(&schema, child(mark("source"), "child"));
    assert!(schema
        .accepts_reference_at(&nested, &["markValues", "source"])
        .is_err());
    assert!(schema.reference_value_at(&mark("source")).is_ok());
}
#[test]
fn unicode_value_paths_sort_by_utf16_and_empty_root_paths_are_omitted() {
    let mut manifest = manifest();
    let object = json!({"\u{e000}":ordered(false),"\u{10000}":ordered(false)});
    manifest["markValues"]["source"]["default"] = object;
    let a = child(mark("source"), "\u{e000}");
    let b = child(mark("source"), "\u{10000}");
    let schema =
        RuntimeSchema::compile_with_payload_references(manifest, [Group::new(a.clone(), [a, b])])
            .unwrap();
    assert_eq!(schema.dto()["format"], PAYLOAD_FORMAT);
    assert_eq!(
        schema.dto()["referenceGroups"][0]["slots"][0]["valuePath"],
        json!(["\u{10000}"])
    );
    let mut dto = schema.dto().clone();
    for group in dto["referenceGroups"].as_array_mut().unwrap() {
        group["slots"].as_array_mut().unwrap().reverse();
    }
    assert_eq!(
        RuntimeSchema::compile(dto).unwrap().identity(),
        schema.identity()
    );
}
#[test]
fn nested_source_history_json_recovery_foreign_fences_and_exact_retry_are_atomic() {
    let schema = schema();
    let mut server = new(&schema);
    let op = bind(&schema, 1, "A", "target", child(mark("source"), "child"));
    let recorded = ok(
        &mut server,
        &schema,
        "a",
        json!({"cmd":"history_record","ops":[op.clone()],"now":1,"options":{"caretBefore":"left","caretAfter":"right"}}),
    );
    ok(
        &mut server,
        &schema,
        "b",
        json!({"cmd":"apply","ops":[op.clone()]}),
    );
    assert_eq!(
        ok(
            &mut server,
            &schema,
            "a",
            json!({"cmd":"apply","ops":[op.clone()]})
        )["state"],
        recorded["state"]
    );
    let undo = ok(&mut server, &schema, "a", json!({"cmd":"history_undo"}));
    ok(
        &mut server,
        &schema,
        "b",
        json!({"cmd":"apply","ops":undo["ops"]}),
    );
    let checkpoint =
        ok(&mut server, &schema, "a", json!({"cmd":"history_export"}))["checkpoint"].clone();
    let checkpoint: Value = serde_json::from_str(&checkpoint.to_string()).unwrap();
    ok(
        &mut server,
        &schema,
        "a",
        json!({"cmd":"history_restore","checkpoint":checkpoint}),
    );
    let redo = ok(&mut server, &schema, "a", json!({"cmd":"history_redo"}));
    assert_eq!(
        redo["ops"][0]["references"][0]["at"],
        json!(["markValues", "source"])
    );
    assert_eq!(
        redo["ops"][0]["references"][0]["valuePath"],
        json!(["child"])
    );
    assert_eq!(redo["ops"][0]["op"]["key"], "target");
    assert_eq!(
        redo["state"],
        ok(
            &mut server,
            &schema,
            "b",
            json!({"cmd":"apply","ops":redo["ops"]})
        )["state"]
    );
    let foreign = bind(&schema, 20, "B", "target", child(mark("source"), "child"));
    let state = ok(
        &mut server,
        &schema,
        "a",
        json!({"cmd":"apply","ops":[foreign]}),
    )["state"]
        .clone();
    assert_eq!(
        ok(&mut server, &schema, "a", json!({"cmd":"history_undo"}))["ops"],
        json!([])
    );
    assert_eq!(
        ok(&mut server, &schema, "a", json!({"cmd":"state"}))["state"],
        state
    );
    let snapshot = ok(&mut server, &schema, "a", json!({"cmd":"snapshot"}))["snapshot"].clone();
    let mut wrong = op;
    wrong["op"]["at"] = ticket(30, "A");
    wrong["references"][0]["schema"] = json!(schema.base_identity());
    assert_eq!(
        ask(
            &mut server,
            &schema,
            "a",
            json!({"cmd":"apply","ops":[wrong]})
        )["ok"],
        false
    );
    assert_eq!(
        ok(&mut server, &schema, "a", json!({"cmd":"snapshot"}))["snapshot"],
        snapshot
    );
    assert_eq!(
        ok(
            &mut server,
            &schema,
            "a",
            json!({"cmd":"restore","actor":"A","snapshot":snapshot})
        )["state"],
        state
    );
}
