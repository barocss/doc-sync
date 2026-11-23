use doc_sync_rust_shadow::runtime_schema::{atomic_value_ok, value_ok, RuntimeSchema};
use serde_json::{json, Value};
use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let request: Value = serde_json::from_str(&input).unwrap();
    let cases: Vec<Value> = request["cases"]
        .as_array()
        .unwrap()
        .iter()
        .map(|case| {
            json!({"name":case["name"],"valueOk":value_ok(&case["spec"],&case["value"]),"atomicValueOk":atomic_value_ok(&case["spec"],&case["value"])})
        })
        .collect();
    let schemas: Vec<Value> = request["schemas"]
        .as_array()
        .unwrap()
        .iter()
        .map(
            |case| match RuntimeSchema::compile(case["schema"].clone()) {
                Ok(_) => json!({"name":case["name"],"rejected":false,"error":null}),
                Err(error) => json!({"name":case["name"],"rejected":true,"error":error}),
            },
        )
        .collect();
    println!("{}", json!({"cases":cases,"schemas":schemas}));
}
