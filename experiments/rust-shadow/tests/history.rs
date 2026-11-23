use doc_sync_rust_shadow::{Server, SCHEMA};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn text(n: u64, a: &str, origin: Value, units: Vec<u16>) -> Value {
    json!({"t":"text","id":t(n,a),"origin":origin,"units":units})
}
fn set(n: u64, a: &str, ids: Vec<Value>, key: &str, value: Value) -> Value {
    json!({"t":"set","at":t(n,a),"ids":ids,"key":key,"value":value})
}
fn new() -> Server {
    let mut s = Server::default();
    assert_eq!(
        s.request(json!({"cmd":"new","replica":"r","actor":"A","schema":SCHEMA}))["ok"],
        true
    );
    s
}
fn command(s: &mut Server, cmd: &str) -> Value {
    s.request(json!({"cmd":cmd,"replica":"r"}))
}
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    s.request(json!({"cmd":"apply","replica":"r","schema":SCHEMA,"ops":ops}))
}
fn record(
    s: &mut Server,
    ops: Vec<Value>,
    now: f64,
    before: &str,
    after: &str,
    typing: bool,
) -> Value {
    s.request(json!({"cmd":"history_record","replica":"r","schema":SCHEMA,"ops":ops,"now":now,"options":{"caretBefore":before,"caretAfter":after,"typing":typing}}))
}
fn local(s: &mut Server, ops: Vec<Value>) -> Value {
    record(s, ops, 1000.0, "before", "after", false)
}
fn seed(s: &mut Server) {
    assert_eq!(
        apply(s, vec![text(1, "A", t(0, "~root"), vec![97, 98, 99])])["ok"],
        true
    );
}
fn checkpoint(s: &mut Server) -> Value {
    command(s, "history_export")["checkpoint"].clone()
}
fn restore(s: &mut Server, checkpoint: Value) -> Value {
    s.request(
        json!({"cmd":"history_restore","replica":"r","schema":SCHEMA,"checkpoint":checkpoint}),
    )
}

#[test]
fn generated_utf16_existence_inverses_preserve_foreign_deletion_and_pins() {
    let mut s = new();
    local(
        &mut s,
        vec![text(1, "A", t(0, "~root"), vec![0xd83d, 0xde00])],
    );
    apply(
        &mut s,
        vec![json!({"t":"del","at":t(3,"B"),"ids":[t(1,"A")]})],
    );
    let r = command(&mut s, "history_undo");
    assert_eq!(
        r["ops"],
        json!([{"t":"del","at":t(4,"A"),"ids":[t(1,"A"),t(2,"A")]}])
    );
    assert_eq!(r["status"]["pins"], json!(["4@A"]));
    let pin = s.request(json!({"cmd":"history_pin","replica":"r","sequences":{"4@A":12}}));
    assert_eq!(pin["pin"], 12);
    let r = command(&mut s, "history_redo");
    assert_eq!(
        r["ops"],
        json!([{"t":"undel","at":t(5,"A"),"ids":[t(1,"A"),t(2,"A")],"cancels":[t(4,"A")]}])
    );
    assert_eq!(r["state"]["items"][1]["visible"], false);
    assert_eq!(r["state"]["items"][2]["visible"], true);
    assert_eq!(r["status"]["pins"], json!([]));
}
#[test]
fn shared_states_generate_exact_sequential_formatting_inverses() {
    let mut s = new();
    seed(&mut s);
    local(
        &mut s,
        vec![set(4, "A", vec![t(1, "A")], "bold", json!(true))],
    );
    local(
        &mut s,
        vec![set(5, "A", vec![t(1, "A")], "bold", json!(false))],
    );
    assert_eq!(
        command(&mut s, "history_undo")["ops"],
        json!([set(6, "A", vec![t(1, "A")], "bold", json!(true))])
    );
    let saved = checkpoint(&mut s);
    assert_eq!(restore(&mut s, saved)["ok"], true);
    assert_eq!(
        command(&mut s, "history_undo")["ops"],
        json!([set(7, "A", vec![t(1, "A")], "bold", Value::Null)])
    );
    assert_eq!(
        command(&mut s, "history_redo")["ops"],
        json!([set(8, "A", vec![t(1, "A")], "bold", json!(true))])
    );
    assert_eq!(
        command(&mut s, "history_redo")["ops"],
        json!([set(9, "A", vec![t(1, "A")], "bold", json!(false))])
    );
}
#[test]
fn prior_value_groups_follow_first_target_order_and_exact_clocks() {
    let mut s = new();
    seed(&mut s);
    apply(
        &mut s,
        vec![
            set(4, "B", vec![t(1, "A")], "bold", json!(true)),
            set(5, "B", vec![t(2, "A")], "bold", json!(false)),
        ],
    );
    local(
        &mut s,
        vec![set(
            6,
            "A",
            vec![t(2, "A"), t(3, "A"), t(1, "A")],
            "bold",
            json!(true),
        )],
    );
    let r = command(&mut s, "history_undo");
    assert_eq!(
        r["ops"],
        json!([
            set(7, "A", vec![t(2, "A")], "bold", json!(false)),
            set(8, "A", vec![t(3, "A")], "bold", Value::Null),
            set(9, "A", vec![t(1, "A")], "bold", json!(true))
        ])
    );
    assert_eq!(r["state"]["clock"], 9);
}
#[test]
fn foreign_same_value_and_same_actor_unrecorded_write_fence_ownership() {
    for actor in ["B", "A"] {
        let mut s = new();
        seed(&mut s);
        local(
            &mut s,
            vec![set(
                4,
                "A",
                vec![t(1, "A"), t(2, "A")],
                "italic",
                json!(true),
            )],
        );
        apply(
            &mut s,
            vec![set(5, actor, vec![t(1, "A")], "italic", json!(true))],
        );
        let r = command(&mut s, "history_undo");
        assert_eq!(
            r["ops"],
            json!([set(6, "A", vec![t(2, "A")], "italic", Value::Null)])
        );
        apply(
            &mut s,
            vec![set(7, "B", vec![t(2, "A")], "italic", json!(false))],
        );
        let r = command(&mut s, "history_redo");
        assert_eq!(r["ops"], json!([]));
        assert_eq!(r["caret"], "after");
        assert_eq!(r["state"]["clock"], 7);
    }
}
#[test]
fn local_batch_captures_each_prior_and_undo_reverses_step_order() {
    let mut s = new();
    seed(&mut s);
    local(
        &mut s,
        vec![
            set(4, "A", vec![t(1, "A")], "bold", json!(true)),
            set(5, "A", vec![t(1, "A")], "bold", json!(false)),
        ],
    );
    assert_eq!(
        command(&mut s, "history_undo")["ops"],
        json!([
            set(6, "A", vec![t(1, "A")], "bold", json!(true)),
            set(7, "A", vec![t(1, "A")], "bold", Value::Null)
        ])
    );
    assert_eq!(
        command(&mut s, "history_redo")["ops"],
        json!([
            set(8, "A", vec![t(1, "A")], "bold", json!(true)),
            set(9, "A", vec![t(1, "A")], "bold", json!(false))
        ])
    );
}
#[test]
fn typing_boundaries_empty_and_undel_records_keep_redo() {
    let mut s = new();
    record(
        &mut s,
        vec![text(1, "A", t(0, "~root"), vec![97])],
        1000.0,
        "0",
        "1",
        true,
    );
    let r = record(
        &mut s,
        vec![text(2, "A", t(1, "A"), vec![98])],
        2499.0,
        "1",
        "2",
        true,
    );
    assert_eq!(r["history"]["undo"].as_array().unwrap().len(), 1);
    let r = record(
        &mut s,
        vec![text(3, "A", t(2, "A"), vec![99])],
        3999.0,
        "2",
        "3",
        true,
    );
    assert_eq!(r["history"]["undo"].as_array().unwrap().len(), 2);
    command(&mut s, "history_undo");
    assert_eq!(local(&mut s, vec![])["status"]["canRedo"], true);
    assert_eq!(
        local(
            &mut s,
            vec![json!({"t":"undel","at":t(5,"A"),"ids":[t(3,"A")],"cancels":[]})]
        )["status"]["canRedo"],
        true
    );
    let r = command(&mut s, "history_undo");
    assert_eq!(r["caret"], "0");
    assert_eq!(r["ops"].as_array().unwrap().len(), 2);
}
#[test]
fn depth_eviction_and_redo_branch_release_shared_state_counts() {
    let mut s = new();
    seed(&mut s);
    for n in 4..109 {
        assert_eq!(
            local(
                &mut s,
                vec![set(n, "A", vec![t(1, "A")], "bold", json!(n % 2 == 0))]
            )["ok"],
            true
        );
    }
    let r = command(&mut s, "history_state");
    assert_eq!(r["history"]["undo"].as_array().unwrap().len(), 100);
    assert_eq!(r["history"]["sets"].as_array().unwrap().len(), 101);
    command(&mut s, "history_undo");
    let r = local(
        &mut s,
        vec![set(110, "A", vec![t(1, "A")], "bold", Value::Null)],
    );
    assert_eq!(r["status"]["canRedo"], false);
    assert_eq!(r["history"]["sets"].as_array().unwrap().len(), 101);
    assert_eq!(
        command(&mut s, "history_clear")["history"]["sets"],
        json!([])
    );
}
#[test]
fn invalid_record_restore_and_clock_exhaustion_leave_doc_and_history_unchanged() {
    let mut s = new();
    seed(&mut s);
    local(
        &mut s,
        vec![set(4, "A", vec![t(1, "A")], "bold", json!(true))],
    );
    let saved = checkpoint(&mut s);
    let r = local(
        &mut s,
        vec![
            set(5, "A", vec![t(1, "A")], "bold", json!(false)),
            set(6, "A", vec![t(1, "A")], "unsupported", json!(true)),
        ],
    );
    assert_eq!(r["ok"], false);
    assert_eq!(checkpoint(&mut s), saved);
    let mut corruptions = vec![];
    let mut c = saved.clone();
    c["history"]["sets"][0]["users"] = json!(999);
    corruptions.push(c);
    let mut c = saved.clone();
    c["history"]["undo"][0]["steps"][0]["targets"][0]["after"] = json!(99);
    corruptions.push(c);
    let mut c = saved.clone();
    c["history"]["currentSets"][0][1] = json!(99);
    corruptions.push(c);
    let mut c = saved.clone();
    c["actor"] = json!("B");
    corruptions.push(c);
    let mut c = saved.clone();
    c["document"]["clock"] = json!(0);
    corruptions.push(c);
    for c in corruptions {
        assert_eq!(restore(&mut s, c)["ok"], false);
        assert_eq!(checkpoint(&mut s), saved);
    }
    apply(
        &mut s,
        vec![set(
            9_007_199_254_740_991,
            "B",
            vec![t(2, "A")],
            "bold",
            json!(true),
        )],
    );
    let exhausted = checkpoint(&mut s);
    assert_eq!(command(&mut s, "history_undo")["ok"], false);
    assert_eq!(checkpoint(&mut s), exhausted);
}
#[test]
fn plain_document_restore_clears_old_history() {
    let mut s = new();
    seed(&mut s);
    local(
        &mut s,
        vec![set(4, "A", vec![t(1, "A")], "bold", json!(true))],
    );
    let snapshot = command(&mut s, "snapshot")["snapshot"].clone();
    assert_eq!(
        s.request(json!({"cmd":"restore","replica":"r","schema":SCHEMA,"snapshot":snapshot}))["ok"],
        true
    );
    assert_eq!(command(&mut s, "history_undo")["caret"], Value::Null);
}
#[test]
fn repeated_local_op_tickets_and_overlapping_births_reject_atomically_but_remote_replay_works() {
    let mut s = new();
    seed(&mut s);
    let saved = checkpoint(&mut s);
    let op = set(4, "A", vec![t(1, "A")], "bold", json!(true));
    assert_eq!(local(&mut s, vec![op.clone(), op.clone()])["ok"], false);
    assert_eq!(checkpoint(&mut s), saved);
    assert_eq!(
        local(
            &mut s,
            vec![
                text(4, "A", t(3, "A"), vec![100, 101]),
                set(5, "A", vec![t(1, "A")], "bold", json!(true))
            ]
        )["ok"],
        false
    );
    assert_eq!(checkpoint(&mut s), saved);
    assert_eq!(apply(&mut s, vec![op.clone(), op])["ok"], true);
}
#[test]
fn checkpoint_rejects_cross_slot_alias_future_ticket_and_foreign_owner() {
    let mut s = new();
    seed(&mut s);
    local(
        &mut s,
        vec![set(4, "A", vec![t(1, "A"), t(2, "A")], "bold", json!(true))],
    );
    let saved = checkpoint(&mut s);
    let mut bads = vec![];
    let mut c = saved.clone();
    c["history"]["currentSets"][0][1] = c["history"]["currentSets"][1][1].clone();
    bads.push(c);
    let mut c = saved.clone();
    c["history"]["sets"][1]["at"] = t(99, "A");
    bads.push(c);
    let mut c = saved.clone();
    c["history"]["sets"][1]["at"] = t(4, "B");
    bads.push(c);
    let mut c = saved.clone();
    c["history"]["sets"][0]["at"] = Value::Null;
    bads.push(c);
    let mut c = saved.clone();
    c["history"]["undo"][0]["steps"][0]["targets"][0]["id"] = t(99, "missing");
    c["history"]["undo"][0]["steps"][0]["targets"][0]["slot"] = json!("[\"99@missing\",\"bold\"]");
    bads.push(c);
    for bad in bads {
        assert_eq!(restore(&mut s, bad)["ok"], false);
        assert_eq!(checkpoint(&mut s), saved);
    }
}
