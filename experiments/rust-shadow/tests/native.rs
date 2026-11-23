use doc_sync_rust_shadow::{Server, SCHEMA, SCHEMA_MANIFEST};
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn ticket(n: u64, actor: &str) -> Value {
    json!({"lamport":n,"actor":actor})
}
fn root() -> Value {
    ticket(0, "~root")
}
fn text(n: u64, actor: &str, origin: Value, units: &[u16]) -> Value {
    json!({"t":"text","id":ticket(n,actor),"origin":origin,"units":units})
}
fn new(server: &mut Server, name: &str) -> Value {
    let r=server.request(json!({"cmd":"new","replica":name,"actor":name,"schema":SCHEMA,"manifest":serde_json::from_str::<Value>(SCHEMA_MANIFEST).unwrap()}));
    assert_eq!(r["ok"], true);
    r["state"].clone()
}
fn apply(server: &mut Server, name: &str, ops: Vec<Value>) -> Value {
    server.request(json!({"cmd":"apply","replica":name,"schema":SCHEMA,"ops":ops}))
}
fn state(server: &mut Server, name: &str) -> Value {
    server.request(json!({"cmd":"state","replica":name}))["state"].clone()
}
fn snapshot(server: &mut Server, name: &str) -> Value {
    server.request(json!({"cmd":"snapshot","replica":name}))["snapshot"].clone()
}
fn restore(server: &mut Server, name: &str, snap: Value) -> Value {
    server.request(json!({"cmd":"restore","replica":name,"schema":SCHEMA,"snapshot":snap}))
}
fn visible_units(state: &Value) -> Vec<u16> {
    state["items"]
        .as_array()
        .unwrap()
        .iter()
        .skip(1)
        .filter(|v| v["visible"] == true)
        .map(|v| v["unit"].as_u64().unwrap() as u16)
        .collect()
}

#[test]
fn concurrent_insertions_and_exact_linear_scan() {
    let mut s = Server::default();
    new(&mut s, "a");
    new(&mut s, "b");
    let a = text(1, "A", root(), &[97, 98]);
    let b = text(1, "B", root(), &[120, 121]);
    assert_eq!(apply(&mut s, "a", vec![a.clone(), b.clone()])["ok"], true);
    assert_eq!(apply(&mut s, "b", vec![b, a])["ok"], true);
    assert_eq!(state(&mut s, "a"), state(&mut s, "b"));
    assert_eq!(visible_units(&state(&mut s, "a")), vec![120, 121, 97, 98]);
    // Legal apply() tickets need not be newer than their causal origin.
    // This case distinguishes the actual linear scan from subtree-based RGA.
    new(&mut s, "scan");
    let r = apply(
        &mut s,
        "scan",
        vec![
            text(5, "A", root(), &[65]),
            text(1, "C", ticket(5, "A"), &[67]),
            text(3, "B", root(), &[66]),
        ],
    );
    assert_eq!(r["ok"], true);
    assert_eq!(visible_units(&r["state"]), vec![65, 66, 67]);
}

#[test]
fn deletion_ownership_and_undel_before_del() {
    let mut s = Server::default();
    new(&mut s, "a");
    let id = ticket(1, "A");
    let r = apply(
        &mut s,
        "a",
        vec![
            text(1, "A", root(), &[65]),
            json!({"t":"del","at":ticket(2,"A"),"ids":[id.clone()]}),
            json!({"t":"del","at":ticket(2,"B"),"ids":[id.clone()]}),
            json!({"t":"undel","at":ticket(3,"A"),"ids":[id.clone()],"cancels":[ticket(2,"A")]}),
        ],
    );
    assert!(visible_units(&r["state"]).is_empty());
    let r = apply(
        &mut s,
        "a",
        vec![
            json!({"t":"undel","at":ticket(4,"B"),"ids":[id.clone()],"cancels":[ticket(2,"B"),ticket(100,"future")]}),
            json!({"t":"del","at":ticket(100,"future"),"ids":[id]}),
        ],
    );
    assert_eq!(visible_units(&r["state"]), vec![65]);
    // Future cancellation refs alone do not advance the clock.
    new(&mut s, "early");
    let r = apply(
        &mut s,
        "early",
        vec![
            text(1, "A", root(), &[65]),
            json!({"t":"undel","at":ticket(2,"A"),"ids":[ticket(1,"A")],"cancels":[ticket(100,"future")]}),
        ],
    );
    assert_eq!(r["state"]["clock"], 2);
    let snap = snapshot(&mut s, "early");
    assert_eq!(restore(&mut s, "early", snap)["ok"], true);
}

#[test]
fn lww_inverse_wire_and_foreign_mark_survives_delivery_order() {
    let mut s = Server::default();
    new(&mut s, "a");
    let id = ticket(1, "A");
    // TS History produces inverse writes. Rust independently applies them;
    // it does not decide which writes belong in a history inverse.
    let r = apply(
        &mut s,
        "a",
        vec![
            text(1, "A", root(), &[65]),
            json!({"t":"set","at":ticket(2,"A"),"ids":[id.clone()],"key":"bold","value":true}),
            json!({"t":"set","at":ticket(4,"foreign"),"ids":[id.clone()],"key":"bold","value":true}),
            json!({"t":"set","at":ticket(3,"A"),"ids":[id.clone()],"key":"bold","value":null}),
        ],
    );
    assert_eq!(
        r["state"]["items"][1]["attrs"]["bold"],
        json!({"value":true,"at":ticket(4,"foreign")})
    );
    let r = apply(
        &mut s,
        "a",
        vec![json!({"t":"set","at":ticket(5,"A"),"ids":[id],"key":"bold","value":null})],
    );
    assert_eq!(
        r["state"]["items"][1]["attrs"]["bold"]["value"],
        Value::Null
    );
    assert_eq!(
        r["state"]["model"]["children"][0]["runs"][0]["marks"],
        json!({})
    );
}

#[test]
fn utf16_units_and_js_actor_order_are_preserved() {
    let mut s = Server::default();
    new(&mut s, "a");
    let id = ticket(1, "A");
    let r = apply(
        &mut s,
        "a",
        vec![
            text(1, "A", root(), &[0xd83d, 0xde00, 0xd800, 0xdc00, 0x0301]),
            json!({"t":"set","at":ticket(10,"\u{e000}"),"ids":[id.clone()],"key":"bold","value":true}),
            json!({"t":"set","at":ticket(10,"😀"),"ids":[id.clone()],"key":"bold","value":false}),
            json!({"t":"del","at":ticket(11,"\u{e000}"),"ids":[id.clone()]}),
            json!({"t":"del","at":ticket(11,"😀"),"ids":[id]}),
        ],
    );
    assert_eq!(r["ok"], true);
    assert_eq!(r["state"]["items"][1]["unit"], 0xd83d);
    assert_eq!(r["state"]["items"][1]["attrs"]["bold"]["value"], true);
    assert_eq!(
        r["state"]["items"][1]["dels"],
        json!(["11@😀", "11@\u{e000}"])
    );
    let snap = snapshot(&mut s, "a");
    assert_eq!(restore(&mut s, "a", snap)["state"], r["state"]);
}

#[test]
fn duplicates_do_not_reset_changed_marks_and_conflicting_birth_rejects() {
    let mut s = Server::default();
    new(&mut s, "a");
    let mut birth = text(1, "A", root(), &[65]);
    birth["marks"] = json!({"bold":true});
    assert_eq!(apply(&mut s, "a", vec![birth.clone()])["ok"], true);
    assert_eq!(
        apply(
            &mut s,
            "a",
            vec![
                json!({"t":"set","at":ticket(2,"A"),"ids":[ticket(1,"A")],"key":"bold","value":false})
            ]
        )["ok"],
        true
    );
    birth["marks"] = json!({"italic":true});
    let before = state(&mut s, "a");
    assert_eq!(apply(&mut s, "a", vec![birth])["state"], before);
    assert_eq!(
        apply(&mut s, "a", vec![text(1, "A", root(), &[66])])["ok"],
        false
    );
    assert_eq!(state(&mut s, "a"), before);
}

#[test]
fn missing_mutation_targets_are_ignored_not_buffered() {
    let mut s = Server::default();
    new(&mut s, "a");
    let r = apply(
        &mut s,
        "a",
        vec![
            json!({"t":"del","at":ticket(4,"A"),"ids":[ticket(1,"B")]}),
            json!({"t":"set","at":ticket(5,"A"),"ids":[ticket(1,"B")],"key":"italic","value":true}),
            json!({"t":"undel","at":ticket(6,"A"),"ids":[ticket(1,"B")],"cancels":[ticket(4,"A")]}),
            text(1, "B", root(), &[66]),
        ],
    );
    assert_eq!(r["state"]["clock"], 6);
    assert_eq!(visible_units(&r["state"]), vec![66]);
    assert_eq!(r["state"]["items"][1]["attrs"], json!({}));
    assert_eq!(r["state"]["items"][1]["dels"], json!([]));
}

#[test]
fn unsupported_and_malformed_batches_fail_atomically() {
    let mut s = Server::default();
    let before = new(&mut s, "a");
    let invalid = vec![
        json!({"t":"node","id":ticket(2,"A"),"origin":root(),"type":"paragraph"}),
        json!({"t":"move"}),
        json!({"t":"gc"}),
        json!({"t":"text","id":ticket(2,"A"),"origin":root(),"text":"x"}),
        text(2, "A", ticket(99, "missing"), &[1]),
        json!({"t":"text","id":ticket(2,"A"),"origin":root(),"units":[65536]}),
        json!({"t":"set","at":ticket(2,"A"),"ids":[ticket(1,"A")],"key":"underline","value":true}),
        json!({"t":"set","at":ticket(2,"A"),"ids":[root()],"key":"bold","value":true}),
        json!({"t":"text","id":ticket(9_007_199_254_740_991,"A"),"origin":root(),"units":[1,2]}),
        json!({"t":"text","id":{"lamport":1.5,"actor":"A"},"origin":root(),"units":[1]}),
    ];
    for op in invalid {
        let response = apply(&mut s, "a", vec![text(1, "A", root(), &[65]), op]);
        assert_eq!(response["ok"], false, "{response}");
        assert_eq!(state(&mut s, "a"), before);
    }
    for schema in [json!("unknown"), json!(null), json!(3)] {
        let response = s.request(
            json!({"cmd":"apply","replica":"a","schema":schema,"ops":[text(1,"A",root(),&[65])]}),
        );
        assert_eq!(response["ok"], false);
        assert_eq!(state(&mut s, "a"), before);
    }
    let response = s.request(
        json!({"cmd":"apply","replica":"a","schema":SCHEMA,"manifest":{"root":"changed"},"ops":[]}),
    );
    assert_eq!(response["ok"], false);
    assert_eq!(state(&mut s, "a"), before);
}

#[test]
fn native_snapshot_validates_and_restore_is_atomic() {
    let mut s = Server::default();
    new(&mut s, "a");
    let mut birth = text(1, "A", root(), &[65, 66]);
    birth["marks"] = json!({"bold":true});
    assert_eq!(
        apply(
            &mut s,
            "a",
            vec![
                birth,
                json!({"t":"del","at":ticket(4,"B"),"ids":[ticket(1,"A")]})
            ]
        )["ok"],
        true
    );
    let before = state(&mut s, "a");
    let snap = snapshot(&mut s, "a");
    let mut corruptions = vec![];
    let mut bad = snap.clone();
    bad["clock"] = json!(0);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["format"] = json!("future");
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["schema"] = json!("future");
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["manifest"]["marks"] = json!(["bold"]);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][1]["unit"] = json!(65536);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][1]["origin"] = json!("99@missing");
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][1]["dels"] = json!(["01@A"]);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][1]["attrs"]["bold"]["value"] = json!(false);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][0]["attrs"] = json!({"bold":{"at":ticket(1,"A"),"value":true}});
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"]
        .as_array_mut()
        .unwrap()
        .push(snap["items"][1].clone());
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"].as_array_mut().unwrap().swap(1, 2);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["moves"] = json!([]);
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][1]["attrs"]["bold"]
        .as_object_mut()
        .unwrap()
        .remove("value");
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][0].as_object_mut().unwrap().remove("origin");
    corruptions.push(bad);
    let mut bad = snap.clone();
    bad["items"][0].as_object_mut().unwrap().remove("unit");
    corruptions.push(bad);
    for bad in corruptions {
        let response = restore(&mut s, "a", bad);
        assert_eq!(response["ok"], false, "{response}");
        assert_eq!(state(&mut s, "a"), before);
    }
    assert_eq!(restore(&mut s, "a", snap)["state"], before);
}

fn run_process(requests: &[Value]) -> Vec<Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_doc-sync-rust-shadow"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    {
        let mut stdin = child.stdin.take().unwrap();
        for request in requests {
            writeln!(stdin, "{request}").unwrap();
        }
    }
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}
#[test]
fn snapshot_restart_uses_fresh_native_process_and_continues_applying() {
    let responses = run_process(&[
        json!({"cmd":"new","replica":"a","actor":"A","schema":SCHEMA}),
        json!({"cmd":"apply","replica":"a","schema":SCHEMA,"ops":[text(1,"A",root(),&[0xd800,65])]}),
        json!({"cmd":"snapshot","replica":"a"}),
    ]);
    let restored = run_process(&[
        json!({"cmd":"restore","replica":"b","actor":"B","schema":SCHEMA,"snapshot":responses[2]["snapshot"]}),
        json!({"cmd":"apply","replica":"b","schema":SCHEMA,"ops":[text(3,"B",ticket(2,"A"),&[66])]}),
    ]);
    assert_eq!(restored[0]["state"], responses[1]["state"]);
    assert_eq!(visible_units(&restored[1]["state"]), vec![0xd800, 65, 66]);
}
