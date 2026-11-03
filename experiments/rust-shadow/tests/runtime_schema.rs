use doc_sync_rust_shadow::{
    runtime_schema::{canonical_json, RuntimeSchema},
    Server,
};
use serde_json::{json, Value};
#[test]
fn canonical_schema_json_matches_javascript_number_thresholds_and_utf16_key_order() {
    for (source, expected) in [
        ("1", "1"),
        ("1.0", "1"),
        ("-0.0", "0"),
        ("0.000001", "0.000001"),
        ("1e-7", "1e-7"),
        ("1e20", "100000000000000000000"),
        ("1e21", "1e+21"),
        ("1.23456789e-6", "0.00000123456789"),
        ("9007199254740993", "9007199254740992"),
    ] {
        let v: Value = serde_json::from_str(source).unwrap();
        assert_eq!(canonical_json(&v).unwrap(), expected, "{source}");
    }
    assert_eq!(
        canonical_json(&json!({"\u{e000}":0,"😀":1})).unwrap(),
        "{\"😀\":1,\"\u{e000}\":0}"
    );
}
fn schema() -> Value {
    json!({"root":"article","marks":["emphasis"],"nodes":{"article":{"shape":"flow","children":["line","title","rule"],"default":"line"},"line":{"shape":"text"},"title":{"shape":"text"},"rule":{"shape":"atom"}}})
}
#[test]
fn server_compiles_before_create_and_rejects_identity_swap_atomically() {
    let mut server = Server::default();
    let s = schema();
    let identity = RuntimeSchema::compile(s.clone())
        .unwrap()
        .identity()
        .to_owned();
    assert_eq!(
        server.request(
            json!({"cmd":"new","replica":"a","actor":"A","schema":"wrong","runtimeSchema":s})
        )["ok"],
        false
    );
    assert_eq!(
        server.request(json!({"cmd":"state","replica":"a"}))["ok"],
        false
    );
    assert_eq!(
        server.request(
            json!({"cmd":"new","replica":"a","actor":"A","schema":identity,"runtimeSchema":s})
        )["ok"],
        true
    );
    let snapshot = server.request(json!({"cmd":"snapshot","replica":"a"}))["snapshot"].clone();
    let mut other = schema();
    other["marks"] = json!(["strong"]);
    let other_id = RuntimeSchema::compile(other.clone())
        .unwrap()
        .identity()
        .to_owned();
    let mut changed = snapshot.clone();
    changed["manifest"] = other;
    changed["schema"] = json!(other_id);
    assert_eq!(
        server.request(
            json!({"cmd":"restore","replica":"a","actor":"A","schema":other_id,"snapshot":changed})
        )["ok"],
        false
    );
    assert_eq!(
        server.request(json!({"cmd":"snapshot","replica":"a"}))["snapshot"],
        snapshot
    );
}

#[test]
fn integer_alias_cannot_create_equal_schema_hash_with_different_native_defaults() {
    let mut accepted = schema();
    accepted["nodes"]["line"]["attrs"] = json!({"amount":{"default":9_007_199_254_740_992u64}});
    assert!(RuntimeSchema::compile(accepted.clone()).is_ok());
    let mut rejected = accepted.clone();
    rejected["nodes"]["line"]["attrs"]["amount"]["default"] = json!(9_007_199_254_740_993u64);
    let error = RuntimeSchema::compile(rejected).unwrap_err();
    assert!(
        error.contains("$.nodes.line.attrs.amount.default"),
        "{error}"
    );
    for n in [u64::MAX, i64::MAX as u64] {
        let mut bad = accepted.clone();
        bad["nodes"]["line"]["ui"] = json!({"custom":n});
        assert!(RuntimeSchema::compile(bad).is_err());
    }
}
