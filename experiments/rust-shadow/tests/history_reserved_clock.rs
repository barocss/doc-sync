use doc_sync_rust_shadow::{Server, SCHEMA};
use serde_json::{json, Value};

fn record(server: &mut Server, ops: Value, clock: Value) -> Value {
    server.request(json!({"cmd":"history_record","replica":"r","schema":SCHEMA,
        "ops":ops,"reservedClock":clock,"options":{"caretBefore":"","caretAfter":""},"now":1}))
}
fn checkpoint(server: &mut Server) -> Value {
    server.request(json!({"cmd":"history_export","replica":"r"}))["checkpoint"].clone()
}

#[test]
fn reserved_clock_survives_empty_record_restore_and_does_not_clear_redo() {
    let mut server = Server::default();
    assert_eq!(
        server.request(json!({"cmd":"new","replica":"r","actor":"A","schema":SCHEMA}))["ok"],
        true
    );
    let ops = json!([{"t":"text","id":{"lamport":1,"actor":"A"},
        "origin":{"lamport":0,"actor":"~root"},"units":[97]}]);
    assert_eq!(record(&mut server, ops, json!(3))["ok"], true);
    assert_eq!(
        server.request(json!({"cmd":"history_undo","replica":"r"}))["ok"],
        true
    );
    let before = checkpoint(&mut server);
    let clock = before["document"]["clock"].as_u64().unwrap() + 3;
    assert_eq!(record(&mut server, json!([]), json!(clock))["ok"], true);
    let after = checkpoint(&mut server);
    assert_eq!(before["history"], after["history"]);
    assert_eq!(after["document"]["clock"], clock);
    assert_eq!(
        server.request(
            json!({"cmd":"history_restore","replica":"restored","schema":SCHEMA,"checkpoint":after})
        )["ok"],
        true
    );
    assert_eq!(
        server.request(json!({"cmd":"state","replica":"restored"}))["state"]["clock"],
        clock
    );
}

#[test]
fn invalid_reserved_clocks_and_post_operation_regression_preserve_checkpoint() {
    let mut server = Server::default();
    assert_eq!(
        server.request(json!({"cmd":"new","replica":"r","actor":"A","schema":SCHEMA}))["ok"],
        true
    );
    assert_eq!(record(&mut server, json!([]), json!(5))["ok"], true);
    let before = checkpoint(&mut server);
    for clock in [
        json!(4),
        json!(-1),
        json!(1.5),
        json!("9"),
        Value::Null,
        json!(9_007_199_254_740_992u64),
    ] {
        assert_eq!(record(&mut server, json!([]), clock)["ok"], false);
        assert_eq!(checkpoint(&mut server), before);
    }
    let ops = json!([{"t":"text","id":{"lamport":6,"actor":"A"},
        "origin":{"lamport":0,"actor":"~root"},"units":[97,98]}]);
    assert_eq!(record(&mut server, ops, json!(6))["ok"], false);
    assert_eq!(checkpoint(&mut server), before);
}

fn runtime_server() -> (Server, String) {
    let descriptor = json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}
    }});
    let identity = doc_sync_rust_shadow::runtime_schema::RuntimeSchema::compile(descriptor.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut server = Server::default();
    assert_eq!(server.request(json!({"cmd":"new","replica":"r","actor":"A","schema":identity,"runtimeSchema":descriptor}))["ok"],true);
    (server, identity)
}
fn runtime_record(server: &mut Server, identity: &str, ops: Value, clock: u64) -> Value {
    server.request(
        json!({"cmd":"history_record","replica":"r","schema":identity,
        "ops":ops,"reservedClock":clock,"options":{"caretBefore":"","caretAfter":""},"now":1}),
    )
}
fn runtime_restore(server: &mut Server, identity: &str) {
    let saved = checkpoint(server);
    assert_eq!(
        server.request(
            json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":saved})
        )["ok"],
        true
    );
    assert_eq!(checkpoint(server), saved);
}

#[test]
fn runtime_reservation_tracks_actual_remote_tickets_and_text_range_ends() {
    for (ticket, units, retained) in [
        (2, vec![97], true),
        (6, vec![97], false),
        (8, vec![97], false),
        (2, vec![97, 98, 99, 100, 101], false),
    ] {
        let (mut server, identity) = runtime_server();
        assert_eq!(
            runtime_record(&mut server, &identity, json!([]), 6)["ok"],
            true
        );
        assert_eq!(server.request(json!({"cmd":"apply","replica":"r","schema":identity,"ops":[{"t":"text","id":{"lamport":ticket,"actor":"B"},"origin":{"lamport":0,"actor":"~root"},"units":units}]}))["ok"],true);
        let saved = checkpoint(&mut server);
        assert_eq!(saved["document"].get("reservedClock").is_some(), retained);
        runtime_restore(&mut server, &identity);
        if retained {
            assert_eq!(
                runtime_record(&mut server, &identity, json!([]), 6)["ok"],
                true
            );
            assert_eq!(checkpoint(&mut server)["document"]["reservedClock"], 6);
            runtime_restore(&mut server, &identity);
        }
    }
}

#[test]
fn own_record_and_history_travel_clear_consumed_runtime_reservations() {
    let (mut server, identity) = runtime_server();
    let ops = json!([{"t":"text","id":{"lamport":1,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"units":[97]}]);
    assert_eq!(runtime_record(&mut server, &identity, ops, 6)["ok"], true);
    assert_eq!(checkpoint(&mut server)["document"]["reservedClock"], 6);
    runtime_restore(&mut server, &identity);
    assert_eq!(
        server.request(json!({"cmd":"history_undo","replica":"r"}))["ok"],
        true
    );
    assert!(checkpoint(&mut server)["document"]
        .get("reservedClock")
        .is_none());
    runtime_restore(&mut server, &identity);
    assert_eq!(
        runtime_record(&mut server, &identity, json!([]), 12)["ok"],
        true
    );
    assert_eq!(
        server.request(json!({"cmd":"history_redo","replica":"r"}))["ok"],
        true
    );
    assert!(checkpoint(&mut server)["document"]
        .get("reservedClock")
        .is_none());
    runtime_restore(&mut server, &identity);
    assert_eq!(
        runtime_record(&mut server, &identity, json!([]), 20)["ok"],
        true
    );
    let own = json!([{"t":"text","id":{"lamport":21,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"units":[98]}]);
    assert_eq!(runtime_record(&mut server, &identity, own, 21)["ok"], true);
    assert!(checkpoint(&mut server)["document"]
        .get("reservedClock")
        .is_none());
    runtime_restore(&mut server, &identity);
}

#[test]
fn runtime_reserved_clock_restore_keeps_journal_validation_and_is_atomic() {
    let descriptor = json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}
    }});
    let identity = doc_sync_rust_shadow::runtime_schema::RuntimeSchema::compile(descriptor.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut server = Server::default();
    assert_eq!(server.request(json!({"cmd":"new","replica":"r","actor":"A","schema":identity,"runtimeSchema":descriptor}))["ok"],true);
    for ops in [
        json!([]),
        json!([{"t":"text","id":{"lamport":4,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"units":[97]}]),
    ] {
        assert_eq!(server.request(json!({"cmd":"history_record","replica":"r","schema":identity,"ops":ops,"reservedClock":6,"options":{"caretBefore":"","caretAfter":""},"now":1}))["ok"],true);
        let saved = checkpoint(&mut server);
        assert_eq!(
            server.request(
                json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":saved})
            )["ok"],
            true
        );
        assert_eq!(checkpoint(&mut server), saved);
    }
    let before = checkpoint(&mut server);
    assert_eq!(before["document"]["reservedClock"], 6);
    for marker in [
        Value::Null,
        json!(1.5),
        json!("6"),
        json!(4),
        json!(7),
        json!(9_007_199_254_740_992u64),
    ] {
        let mut bad = before.clone();
        bad["document"]["reservedClock"] = marker;
        assert_eq!(
            server.request(
                json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":bad})
            )["ok"],
            false
        );
        assert_eq!(checkpoint(&mut server), before);
    }
    let mut missing = before.clone();
    missing["document"]
        .as_object_mut()
        .unwrap()
        .remove("reservedClock");
    assert_eq!(
        server.request(
            json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":missing})
        )["ok"],
        false
    );
    assert_eq!(checkpoint(&mut server), before);
    let mut redundant = before.clone();
    redundant["document"]["clock"] = json!(4);
    redundant["document"]["reservedClock"] = json!(4);
    assert_eq!(
        server.request(
            json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":redundant})
        )["ok"],
        false
    );
    assert_eq!(checkpoint(&mut server), before);
    for clock in [
        json!(3),
        json!(9_007_199_254_740_992u64),
        json!(-1),
        json!(1.5),
        Value::Null,
    ] {
        let mut bad = before.clone();
        bad["document"]["clock"] = clock;
        assert_eq!(
            server.request(
                json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":bad})
            )["ok"],
            false
        );
        assert_eq!(checkpoint(&mut server), before);
    }
    let mut duplicate = before.clone();
    let op = duplicate["document"]["ops"][0].clone();
    duplicate["document"]["ops"]
        .as_array_mut()
        .unwrap()
        .push(op);
    assert_eq!(
        server.request(
            json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":duplicate})
        )["ok"],
        false
    );
    assert_eq!(checkpoint(&mut server), before);
    let mut altered = before.clone();
    altered["document"]["ops"][0]["origin"] = json!({"lamport":99,"actor":"missing"});
    assert_eq!(
        server.request(
            json!({"cmd":"history_restore","replica":"r","schema":identity,"checkpoint":altered})
        )["ok"],
        false
    );
    assert_eq!(checkpoint(&mut server), before);
}
