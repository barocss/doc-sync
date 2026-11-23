use doc_sync_rust_shadow::{
    Server, MOVE_CAPABILITY, MOVE_FORMAT, MOVE_SCHEMA, SHAPES_CAPABILITY, SHAPES_SCHEMA,
};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn k(key: &str) -> Value {
    let (n, a) = key.split_once('@').unwrap();
    t(n.parse().unwrap(), a)
}
fn ask(s: &mut Server, mut v: Value) -> Value {
    v["schema"] = json!(MOVE_SCHEMA);
    v["replica"] = json!("r");
    s.request(v)
}
fn new() -> Server {
    let mut s = Server::default();
    assert_eq!(
        ask(
            &mut s,
            json!({"cmd":"new","actor":"A","capabilities":[MOVE_CAPABILITY]})
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
fn mv(n: u64, a: &str, target: &str, parent: &str, after: Option<&str>) -> Value {
    json!({"t":"move","at":t(n,a),"target":k(target),"parent":k(parent),"after":after.map(k)})
}
fn node(n: u64, origin: &str, type_: &str) -> Value {
    json!({"t":"node","id":t(n,"A"),"origin":k(origin),"type":type_})
}
fn seed(s: &mut Server) {
    apply(
        s,
        vec![
            json!({"t":"text","id":t(1,"A"),"origin":k("0@~root"),"units":[97,98,99]}),
            node(5, "3@A", "callout"),
            node(6, "5@A", "callout"),
        ],
    );
}
fn record(s: &mut Server, ops: Vec<Value>) -> Value {
    let v = ask(
        s,
        json!({"cmd":"history_record","ops":ops,"now":1000,"options":{"caretBefore":"before","caretAfter":"after"}}),
    );
    assert_eq!(v["ok"], true, "{v}");
    v
}
fn export(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"history_export"}))["checkpoint"].clone()
}
fn state(s: &mut Server) -> Value {
    ask(s, json!({"cmd":"state"}))["state"].clone()
}
fn split() -> Vec<Value> {
    vec![
        json!({"t":"node","id":t(20,"A"),"origin":t(2,"A"),"type":"paragraph","boundary":"split:{\"into\":\"0@~root\",\"after\":\"0@~root\",\"left\":\"2@A\",\"right\":\"3@A\"}"}),
        mv(21, "A", "20@A", "0@5@A/body", Some("10@A")),
    ]
}
#[test]
fn explicit_v6_uses_unchanged_manifest_and_mandatory_move_log() {
    let mut s = new();
    let c = export(&mut s);
    assert_eq!(c["document"]["format"], MOVE_FORMAT);
    assert_eq!(c["document"]["moves"], json!([]));
    let mut c = c;
    c["document"].as_object_mut().unwrap().remove("moves");
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":c}))["ok"],
        false
    );
    let mut old = Server::default();
    assert_eq!(old.request(json!({"cmd":"new","replica":"r","actor":"A","schema":SHAPES_SCHEMA,"capabilities":[SHAPES_CAPABILITY]}))["ok"],true);
    assert_eq!(old.request(json!({"cmd":"apply","replica":"r","schema":SHAPES_SCHEMA,"ops":[mv(1,"A","0@~root","0@~root",None)]}))["ok"],false);
}
#[test]
fn move_keeps_authored_physical_tokens_and_replays_idempotently() {
    let mut s = new();
    seed(&mut s);
    let before = state(&mut s);
    let op = mv(10, "A", "0@~root", "0@5@A/body", Some("0@5@A/body"));
    let moved = apply(&mut s, vec![op.clone()]);
    for token in before["items"].as_array().unwrap() {
        assert!(moved["items"].as_array().unwrap().contains(token));
    }
    assert_eq!(apply(&mut s, vec![op]), moved);
    assert_eq!(moved["moves"].as_array().unwrap().len(), 1);
}
#[test]
fn conflicting_move_stamp_and_invalid_destination_are_atomic() {
    let mut s = new();
    seed(&mut s);
    apply(&mut s, vec![mv(10, "A", "5@A", "0@6@A/body", None)]);
    let before = export(&mut s);
    for op in [
        mv(10, "A", "6@A", "0@~root", None),
        mv(11, "A", "1@A", "0@~root", None),
        mv(12, "A", "6@A", "1@A", None),
    ] {
        assert_eq!(ask(&mut s, json!({"cmd":"apply","ops":[op]}))["ok"], false);
        assert_eq!(export(&mut s), before);
    }
}
#[test]
fn concurrent_cycles_replay_in_total_ticket_order() {
    let mut a = new();
    let mut b = new();
    seed(&mut a);
    seed(&mut b);
    let x = mv(10, "X", "5@A", "0@6@A/body", None);
    let y = mv(10, "Y", "6@A", "0@5@A/body", None);
    apply(&mut a, vec![x.clone(), y.clone()]);
    apply(&mut b, vec![y, x]);
    assert_eq!(state(&mut a), state(&mut b));
    assert_eq!(state(&mut a)["moves"].as_array().unwrap().len(), 2);
}
#[test]
fn native_move_inverse_restores_shared_ownership_through_checkpoint() {
    let mut s = new();
    seed(&mut s);
    record(&mut s, vec![mv(10, "A", "5@A", "0@6@A/body", None)]);
    record(&mut s, vec![mv(11, "A", "5@A", "0@~root", Some("6@A"))]);
    let c = export(&mut s);
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":c}))["ok"],
        true
    );
    let first = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        first["ops"],
        json!([mv(12, "A", "5@A", "0@6@A/body", None)])
    );
    let second = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(second["ops"].as_array().unwrap().len(), 1);
    assert_eq!(second["caret"], "before");
}
#[test]
fn same_actor_unrecorded_move_fences_owned_inverse() {
    let mut s = new();
    seed(&mut s);
    record(&mut s, vec![mv(10, "A", "5@A", "0@6@A/body", None)]);
    apply(&mut s, vec![mv(11, "A", "5@A", "0@6@A/body", None)]);
    assert_eq!(ask(&mut s, json!({"cmd":"history_undo"}))["ops"], json!([]));
}
#[test]
fn logical_split_undo_uses_join_and_retains_foreign_text() {
    let mut s = new();
    seed(&mut s);
    record(
        &mut s,
        vec![mv(10, "A", "0@~root", "0@5@A/body", Some("0@5@A/body"))],
    );
    record(&mut s, split());
    apply(
        &mut s,
        vec![json!({"t":"text","id":t(25,"B"),"origin":t(3,"A"),"units":[88]})],
    );
    let undone = ask(&mut s, json!({"cmd":"history_undo"}));
    assert_eq!(
        undone["ops"],
        json!([{"t":"set","at":t(26,"A"),"ids":[t(20,"A")],"key":"$join","value":{"into":"0@~root","after":"0@~root"}}])
    );
    assert!(undone["state"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|i| i["id"] == t(25, "B") && i["visible"] == true));
    let c = export(&mut s);
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":c}))["ok"],
        true
    );
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_redo"}))["ops"][0]["value"],
        Value::Null
    );
}
#[test]
fn foreign_tail_move_fences_logical_split_undo() {
    let mut s = new();
    seed(&mut s);
    record(
        &mut s,
        vec![mv(10, "A", "0@~root", "0@5@A/body", Some("0@5@A/body"))],
    );
    record(&mut s, split());
    apply(&mut s, vec![mv(25, "B", "20@A", "0@6@A/body", None)]);
    assert_eq!(ask(&mut s, json!({"cmd":"history_undo"}))["ops"], json!([]));
}
#[test]
fn checkpoint_rejects_placement_alias_and_split_state_corruption() {
    let mut s = new();
    seed(&mut s);
    record(
        &mut s,
        vec![mv(10, "A", "0@~root", "0@5@A/body", Some("0@5@A/body"))],
    );
    record(&mut s, split());
    let good = export(&mut s);
    let mut bad = good.clone();
    bad["history"]["currentMoves"][0][0] = json!("999@missing");
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":bad}))["ok"],
        false
    );
    let mut bad = good.clone();
    bad["history"]["moves"][1]["parent"] = k("0@~root");
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":bad}))["ok"],
        false
    );
    let mut bad = good.clone();
    bad["history"]["sets"][0]["value"] = json!({"into":"0@6@A/body","after":"0@6@A/body"});
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":bad}))["ok"],
        false
    );
    assert_eq!(export(&mut s), good);
}
#[test]
fn private_text_storage_preserves_utf16_and_snapshot_membership() {
    let mut s = new();
    seed(&mut s);
    apply(&mut s, vec![mv(10, "A", "0@~root", "0@5@A/body", None)]);
    let gap = "0@~text:0%40~root:";
    apply(
        &mut s,
        vec![json!({"t":"text","id":t(11,"A"),"origin":k(gap),"units":[0xd83d,0xde00,0xd800]})],
    );
    let before = state(&mut s);
    let c = export(&mut s);
    let restored = ask(&mut s, json!({"cmd":"history_restore","checkpoint":c}));
    assert_eq!(restored["ok"], true, "{restored}");
    assert_eq!(restored["state"], before);
}
#[test]
fn hidden_ownerless_private_gap_resolves_to_root_start_without_mutation() {
    for nonempty in [false, true] {
        let mut s = new();
        seed(&mut s);
        apply(&mut s, vec![mv(10, "A", "0@~root", "0@5@A/body", None)]);
        let gap = "0@~text:0%40~root:";
        apply(
            &mut s,
            vec![
                json!({"t":"node","id":t(20,"A"),"origin":k(gap),"type":"paragraph","boundary":format!("{gap}|end")}),
                mv(21, "A", "20@A", "0@~root", None),
            ],
        );
        if nonempty {
            apply(
                &mut s,
                vec![
                    json!({"t":"text","id":t(22,"A"),"origin":k("20@A"),"units":[0xd83d,0xde00,0xd800]}),
                ],
            );
        }
        let before = export(&mut s);
        assert_eq!(
            ask(
                &mut s,
                json!({"cmd":"anchor_resolve","anchor":gap,"strict":true})
            ),
            json!({"ok":true,"paragraph":0,"offset":0})
        );
        assert_eq!(
            ask(
                &mut s,
                json!({"cmd":"selection_resolve","range":{"anchor":gap,"focus":gap}})
            )["range"],
            Value::Null
        );
        assert_eq!(export(&mut s), before);
    }
}
#[test]
fn current_move_cannot_alias_unrecorded_birth_ownership() {
    let mut s = new();
    seed(&mut s);
    record(&mut s, vec![mv(10, "A", "0@~root", "0@5@A/body", None)]);
    let good = export(&mut s);
    let mut bad = good.clone();
    bad["history"]["currentMoves"][0][1] = json!(0);
    assert_eq!(
        ask(&mut s, json!({"cmd":"history_restore","checkpoint":bad}))["ok"],
        false
    );
    assert_eq!(export(&mut s), good);
}
#[test]
fn split_ownership_survives_discarded_redo_branch() {
    let mut s = new();
    seed(&mut s);
    record(
        &mut s,
        vec![mv(10, "A", "0@~root", "0@5@A/body", Some("0@5@A/body"))],
    );
    record(&mut s, split());
    assert_eq!(ask(&mut s, json!({"cmd":"history_undo"}))["ok"], true);
    record(
        &mut s,
        vec![json!({"t":"text","id":t(30,"A"),"origin":t(1,"A"),"units":[88]})],
    );
    let good = export(&mut s);
    let restored = ask(
        &mut s,
        json!({"cmd":"history_restore","checkpoint":good.clone()}),
    );
    assert_eq!(restored["ok"], true, "{restored}");
    assert_eq!(export(&mut s), good);
}
#[test]
fn deleting_moved_marker_does_not_reattach_its_text_to_previous_block() {
    let mut s = new();
    apply(
        &mut s,
        vec![
            json!({"t":"text","id":t(1,"A"),"origin":k("0@~root"),"units":[97]}),
            json!({"t":"node","id":t(2,"A"),"origin":t(1,"A"),"type":"paragraph","boundary":"1@A|end"}),
            json!({"t":"text","id":t(3,"A"),"origin":t(2,"A"),"units":[98]}),
        ],
    );
    apply(&mut s, vec![mv(10, "A", "2@A", "0@~root", None)]);
    let result = apply(
        &mut s,
        vec![json!({"t":"del","at":t(11,"B"),"ids":[t(2,"A")]})],
    );
    assert_eq!(result["blocks"][0]["textUnits"], json!([97]));
    assert_eq!(result["counts"]["tokens"], 3);
}
#[test]
fn movement_actor_validation_rejects_invalid_batches_atomically() {
    let mut s = new();
    seed(&mut s);
    let good = export(&mut s);
    for actor in ["bad:actor", "한", "a/b"] {
        assert_eq!(
            ask(
                &mut s,
                json!({"cmd":"apply","ops":[mv(10,actor,"5@A","0@~root",None)]})
            )["ok"],
            false
        );
        assert_eq!(export(&mut s), good);
    }
}
