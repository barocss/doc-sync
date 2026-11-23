use doc_sync_rust_shadow::{Server, SCHEMA};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn setup() -> Server {
    let mut s = Server::default();
    assert_eq!(
        s.request(json!({"cmd":"new","replica":"r","actor":"A","schema":SCHEMA}))["ok"],
        true
    );
    s
}
fn request(s: &mut Server, mut v: Value) -> Value {
    v["replica"] = json!("r");
    s.request(v)
}
fn apply(s: &mut Server, ops: Value) -> Value {
    request(s, json!({"cmd":"apply","schema":SCHEMA,"ops":ops}))
}
#[test]
fn captures_every_utf16_boundary_and_resolves_deleted_anchor_to_left() {
    let mut s = setup();
    assert_eq!(
        request(&mut s, json!({"cmd":"anchor_capture","offset":0}))["anchor"],
        "0@~root"
    );
    apply(
        &mut s,
        json!([{"t":"text","id":t(1,"A"),"origin":t(0,"~root"),"units":[97,0xd83d,0xde00,0xd800,0xdc00]}]),
    );
    for offset in 0..=5 {
        let anchor =
            request(&mut s, json!({"cmd":"anchor_capture","offset":offset}))["anchor"].clone();
        assert_eq!(
            request(&mut s, json!({"cmd":"anchor_resolve","anchor":anchor}))["offset"],
            offset
        );
    }
    apply(
        &mut s,
        json!([{"t":"del","at":t(6,"B"),"ids":[t(2,"A"),t(3,"A"),t(4,"A")]}]),
    );
    for anchor in ["2@A", "3@A", "4@A"] {
        assert_eq!(
            request(
                &mut s,
                json!({"cmd":"anchor_resolve","anchor":anchor,"strict":true})
            )["offset"],
            1
        );
    }
    assert_eq!(
        request(&mut s, json!({"cmd":"anchor_resolve","anchor":"5@A"}))["offset"],
        2
    );
    apply(
        &mut s,
        json!([{"t":"undel","at":t(7,"B"),"ids":[t(2,"A"),t(3,"A"),t(4,"A")],"cancels":[t(6,"B")]}]),
    );
    assert_eq!(
        request(&mut s, json!({"cmd":"anchor_resolve","anchor":"4@A"}))["offset"],
        4
    );
}
#[test]
fn concurrent_insertion_preserves_identity_and_reversed_range_orientation() {
    let mut s = setup();
    apply(
        &mut s,
        json!([{"t":"text","id":t(1,"A"),"origin":t(0,"~root"),"units":[97,98,99]}]),
    );
    let range = request(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[0,3],"focus":[0,1]}}),
    )["range"]
        .clone();
    assert_eq!(range, json!({"anchor":"3@A","focus":"1@A"}));
    apply(
        &mut s,
        json!([{"t":"text","id":t(4,"B"),"origin":t(1,"A"),"units":[120,121]}]),
    );
    assert_eq!(
        request(&mut s, json!({"cmd":"selection_resolve","range":range}))["range"],
        json!({"anchor":[0,5],"focus":[0,1]})
    );
    assert_eq!(
        request(&mut s, json!({"cmd":"anchor_capture","offset":2}))["anchor"],
        "4@B"
    );
}
#[test]
fn strict_selection_missing_and_invalid_paths_return_null_raw_missing_returns_zero() {
    let mut s = setup();
    for range in [
        Value::Null,
        json!({"anchor":[1,0],"focus":[0,0]}),
        json!({"anchor":[0,-1],"focus":[0,0]}),
        json!({"anchor":[0,0.5],"focus":[0,0]}),
        json!({"anchor":[0,1],"focus":[0,0]}),
        json!({"anchor":[0,0,0],"focus":[0,0]}),
    ] {
        assert_eq!(
            request(&mut s, json!({"cmd":"selection_capture","range":range}))["range"],
            Value::Null
        );
    }
    assert_eq!(
        request(&mut s, json!({"cmd":"anchor_resolve","anchor":"missing"}))["offset"],
        0
    );
    assert_eq!(
        request(
            &mut s,
            json!({"cmd":"anchor_resolve","anchor":"missing","strict":true})
        )["offset"],
        Value::Null
    );
    assert_eq!(
        request(
            &mut s,
            json!({"cmd":"selection_resolve","range":{"anchor":"missing","focus":"0@~root"}})
        )["range"],
        Value::Null
    );
    assert_eq!(
        request(&mut s, json!({"cmd":"selection_resolve","range":null}))["range"],
        Value::Null
    );
    for offset in [json!(-1), json!(0.5), json!(1), json!(null), json!("0")] {
        assert_eq!(
            request(&mut s, json!({"cmd":"anchor_capture","offset":offset}))["ok"],
            false
        );
    }
    assert_eq!(request(&mut s, json!({"cmd":"state"}))["state"]["clock"], 0);
}
