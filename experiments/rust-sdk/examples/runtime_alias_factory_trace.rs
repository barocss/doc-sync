//! Emit exact SDK factory payloads and selected reference provenance.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};
use std::io::{self, Read};
fn trace(dto: &Value) -> Result<Value> {
    let schema = RuntimeSchema::compile(dto.clone())?;
    let mut paths: Vec<Vec<String>> = vec![];
    for edge in dto["defaultReferences"]
        .as_array()
        .ok_or_else(|| Error("defaultReferences required".into()))?
    {
        let at: Vec<String> = serde_json::from_value(edge["at"].clone())?;
        if !paths.contains(&at) {
            paths.push(at);
        }
    }
    let mut factories = vec![];
    for path in paths {
        let at: Vec<&str> = path.iter().map(String::as_str).collect();
        let descriptor = path
            .iter()
            .fold(schema.manifest(), |value, key| &value[key]);
        let count = descriptor["values"]
            .as_array()
            .ok_or_else(|| Error("enum values required".into()))?
            .len();
        for index in std::iter::once(None).chain((0..count).map(Some)) {
            let value = schema.reference_value(&at, index)?;
            let operation = value.bind(
                Op::Set {
                    at: Ticket {
                        lamport: 1,
                        actor: "factory".into(),
                    },
                    ids: vec![],
                    key: "factory".into(),
                    value: value.value().clone(),
                },
                &["value"],
            )?;
            let encoded = serde_json::to_value(operation)?;
            let mut factory = json!({"at":path,"source":if index.is_some(){"enum"}else{"default"},"value":value.value(),"reference":encoded["references"][0]});
            if let Some(index) = index {
                factory["index"] = json!(index);
            }
            factories.push(factory);
        }
    }
    Ok(json!({"identity":schema.identity(),"descriptor":schema.dto(),"factories":factories}))
}
fn main() -> Result<()> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| Error(error.to_string()))?;
    let input: Value = serde_json::from_str(&input)?;
    let schemas = input["schemas"]
        .as_array()
        .ok_or_else(|| Error("schemas required".into()))?
        .iter()
        .map(trace)
        .collect::<Result<Vec<_>>>()?;
    println!("{}", json!({"schemas":schemas}));
    Ok(())
}
