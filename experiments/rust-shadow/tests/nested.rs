use doc_sync_rust_shadow::{Server, NESTED_CAPABILITY, NESTED_FORMAT, NESTED_SCHEMA};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn key(k: &str) -> Value {
    let (n, a) = k.split_once('@').unwrap();
    t(n.parse().unwrap(), a)
}
fn ask(s: &mut Server, mut v: Value) -> Value {
    v["schema"] = json!(NESTED_SCHEMA);
    v["replica"] = json!("r");
    s.request(v)
}
fn new() -> Server {
    let mut s = Server::default();
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"new","actor":"A","capabilities":[NESTED_CAPABILITY]})
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
fn grid(s: &mut Server) -> Value {
    apply(
        s,
        vec![
            node(1, "0@~root", "table"),
            node(2, "0@1@A/rows", "table-row"),
            node(3, "2@A", "table-row"),
            node(4, "0@1@A/cols", "col"),
            node(5, "4@A", "col"),
        ],
    )
}
fn cell_units(state: &Value, r: usize, c: usize) -> Value {
    state["model"]["children"][1]["children"][r]["children"][c]["children"][0]["children"][0]
        ["runs"]
        .clone()
}
#[test]
fn nested_mode_and_v4_are_explicit_and_bound_to_exact_manifest() {
    let mut s = new();
    let c = checkpoint(&mut s);
    assert_eq!(c["document"]["format"], NESTED_FORMAT);
    let mut bad = c.clone();
    bad["document"]["capabilities"] = json!(["general-blocks-attrs-v1"]);
    assert_eq!(restore(&mut s, bad)["ok"], false);
    assert_eq!(checkpoint(&mut s), c);
    let mut fresh = Server::default();
    assert_eq!(
        fresh.request(json!({"cmd":"new","schema":NESTED_SCHEMA,"actor":"A","replica":"x"}))["ok"],
        false
    );
}
#[test]
fn physical_recursive_slots_have_deterministic_heads_and_no_genesis_clock_cost() {
    let mut s = new();
    let state = apply(
        &mut s,
        vec![
            node(1, "0@~root", "callout"),
            node(2, "0@1@A/body", "callout"),
            text(3, "A", "0@2@A/body", vec![0xd83d, 0xde00, 0xd800]),
        ],
    );
    assert_eq!(state["clock"], 5);
    assert_eq!(
        state["model"]["children"][1]["children"][1]["children"][0]["runs"][0]["units"],
        json!([0xd83d, 0xde00, 0xd800])
    );
    let lines = state["lines"].as_array().unwrap();
    assert_eq!(lines.len(), 3);
    let l = lines.iter().find(|l| l["key"] == "0@2@A/body").unwrap();
    assert_eq!(l["owner"], "2@A");
    assert_eq!(l["items"][0]["born"], "");
    assert_eq!(l["items"][0]["attrs"], json!({}));
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["state"], state);
}
#[test]
fn span_hides_selection_but_preserves_full_grid_cell_text_and_attrs() {
    let mut s = new();
    grid(&mut s);
    let state = apply(
        &mut s,
        vec![
            text(6, "A", "0@1@A/cell:2@A,5@A", vec![72, 73]),
            set(8, "A", "1@A", "$cell:2@A,5@A|background", json!("blue")),
            set(
                9,
                "A",
                "1@A",
                "$span:2@A,4@A",
                json!({"row":"3@A","col":"5@A"}),
            ),
        ],
    );
    assert_eq!(
        cell_units(&state, 0, 1),
        json!([{"units":[72,73],"marks":{}}])
    );
    let a = &state["model"]["children"][1]["children"][0]["children"][1]["attrs"];
    assert_eq!(*a, json!({"spanned":true,"background":"blue"}));
    let range = json!({"anchor":[1,0,1,0,0,1],"focus":[1,0,1,0,0,2]});
    assert_eq!(
        ask(&mut s, json!({"cmd":"selection_capture","range":range}))["range"],
        Value::Null
    );
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"selection_resolve","range":{"anchor":"6@A","focus":"7@A"}})
        )["range"],
        Value::Null
    );
    let raw = ask(
        &mut s,
        json!({"cmd":"anchor_resolve","anchor":"7@A","strict":true}),
    );
    assert_eq!(raw["line"], "0@1@A/cell:2@A,4@A");
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["state"], state);
    let split = apply(
        &mut s,
        vec![set(10, "A", "1@A", "$span:2@A,4@A", Value::Null)],
    );
    assert_eq!(cell_units(&split, 0, 1), cell_units(&state, 0, 1));
}
#[test]
fn equal_ticket_overlapping_span_priority_retains_attribute_insertion_order() {
    let mut s = new();
    grid(&mut s);
    let state = apply(
        &mut s,
        vec![
            set(
                20,
                "B",
                "1@A",
                "$span:2@A,5@A",
                json!({"row":"3@A","col":"5@A"}),
            ),
            set(
                20,
                "B",
                "1@A",
                "$span:2@A,4@A",
                json!({"row":"3@A","col":"5@A"}),
            ),
        ],
    );
    assert_eq!(state["blocks"][1]["spans"], json!({"0,1":[2,1]}));
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["state"], state);
}
#[test]
fn deleted_ancestor_keeps_foreign_child_edit_and_own_history_restores_it() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node(1, "0@~root", "callout"),
            text(2, "A", "0@1@A/body", vec![97]),
        ],
    );
    record(
        &mut s,
        vec![json!({"t":"del","at":t(3,"A"),"ids":[t(1,"A")]})],
    );
    let state = apply(&mut s, vec![text(4, "B", "2@A", vec![98])]);
    assert_eq!(state["model"]["children"].as_array().unwrap().len(), 1);
    let restored = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        restored["ops"],
        json!([{"t":"undel","at":t(5,"A"),"ids":[t(1,"A")],"cancels":[t(3,"A")]}])
    );
    assert_eq!(
        restored["state"]["model"]["children"][1]["children"][0]["runs"],
        json!([{"units":[97,98],"marks":{}}])
    );
}
#[test]
fn cell_same_value_foreign_write_blocks_local_undo_after_joint_restore() {
    let mut s = new();
    grid(&mut s);
    record(
        &mut s,
        vec![set(
            6,
            "A",
            "1@A",
            "$cell:2@A,4@A|background",
            json!("blue"),
        )],
    );
    apply(
        &mut s,
        vec![set(
            7,
            "B",
            "1@A",
            "$cell:2@A,4@A|background",
            json!("blue"),
        )],
    );
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["ok"], true);
    let undo = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(undo["ops"], json!([]));
    assert_eq!(
        undo["state"]["model"]["children"][1]["children"][0]["children"][0]["attrs"]["background"],
        "blue"
    );
}
#[test]
fn edited_derived_head_and_birth_marks_roundtrip() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            node(1, "0@~root", "callout"),
            json!({"t":"text","id":t(2,"A"),"origin":key("0@1@A/body"),"units":[65],"marks":{"italic":true,"bold":true}}),
        ],
    );
    record(
        &mut s,
        vec![
            set(3, "A", "0@1@A/body", "$type", json!("heading")),
            set(4, "A", "0@1@A/body", "level", json!(3)),
        ],
    );
    let c = checkpoint(&mut s);
    let before = ask(&mut s, json!({"cmd":"state"}));
    assert_eq!(restore(&mut s, c)["state"], before["state"]);
}
#[test]
fn corrupt_line_membership_birth_metadata_and_joint_writer_fail_atomically() {
    let mut s = new();
    grid(&mut s);
    record(
        &mut s,
        vec![set(6, "A", "0@~root", "align", json!("right"))],
    );
    let c = checkpoint(&mut s);
    for case in 0..7 {
        let mut bad = c.clone();
        match case {
            0 => bad["document"]["lines"][0]["ids"] = json!(["0@~root", "1@A", "4@A"]),
            1 => bad["document"]["items"][1]["node"]["type_at"] = t(99, "A"),
            2 => bad["document"]["items"][0]["attrs"]["align"]["value"] = json!("center"),
            3 => bad["document"]["items"][1]["birth_marks"] = json!({"bold":true}),
            4 => bad["document"]["attr_order"]["1@A"] = json!([]),
            5 => bad["document"]["items"][0]["attrs"]["align"]["at"] = t(99, "B"),
            _ => bad["document"]["manifest"]["nodes"]["callout"]["children"] = json!(["paragraph"]),
        };
        assert_eq!(restore(&mut s, bad)["ok"], false, "case {case}");
        assert_eq!(checkpoint(&mut s), c, "case {case}");
    }
}
#[test]
fn cross_grid_axes_unsupported_shapes_and_head_deletions_reject_whole_batch() {
    let mut s = new();
    grid(&mut s);
    let c = checkpoint(&mut s);
    let cases = vec![
        json!({"t":"del","at":t(6,"A"),"ids":[key("0@1@A/cell:2@A,4@A")]}),
        node(6, "0@1@A/rows", "col"),
        text(6, "A", "0@1@A/cols", vec![65]),
        set(
            6,
            "A",
            "1@A",
            "$span:2@A,4@A",
            json!({"row":"3@A","col":"9@other"}),
        ),
        set(6, "A", "1@A", "$join", Value::Null),
    ];
    for op in cases {
        assert_eq!(ask(&mut s, json!({"cmd":"apply","ops":[op]}))["ok"], false);
        assert_eq!(checkpoint(&mut s), c);
    }
}

#[test]
fn canonical_slot_closure_retains_deleted_axis_intersections_without_clock_ticks() {
    let mut s = new();
    grid(&mut s);
    let state = apply(
        &mut s,
        vec![
            json!({"t":"del","at":t(6,"A"),"ids":[t(3,"A")]}),
            node(7, "5@A", "col"),
            node(8, "3@A", "table-row"),
        ],
    );
    assert_eq!(state["clock"], 8);
    let lines = state["lines"].as_array().unwrap();
    assert_eq!(lines.len(), 12); // root, two axes, nine physical intersections.
    assert!(lines.iter().any(|l| l["key"] == "0@1@A/cell:3@A,7@A"));
    assert_eq!(state["blocks"][1]["rows"], json!(["2@A", "8@A"]));
    assert_eq!(state["blocks"][1]["cols"], json!(["4@A", "5@A", "7@A"]));
    let c = checkpoint(&mut s);
    assert_eq!(restore(&mut s, c)["state"], state);
}
