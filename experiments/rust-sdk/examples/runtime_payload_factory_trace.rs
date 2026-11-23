//! Emit exact SDK factory payloads and selected reference provenance.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};
use std::io::{self, Read};
fn nested_paths(value: &Value, path: Vec<ValuePathSegment>, out: &mut Vec<Vec<ValuePathSegment>>) {
    if !value.is_object() && !value.is_array() { return; }
    out.push(path.clone());
    match value {
        Value::Object(object) => for (key, child) in object {
            let mut next = path.clone(); next.push(ValuePathSegment::Key(key.clone()));
            nested_paths(child, next, out);
        },
        Value::Array(array) => for (index, child) in array.iter().enumerate() {
            let mut next = path.clone(); next.push(ValuePathSegment::Index(index));
            nested_paths(child, next, out);
        },
        _ => {},
    }
}
fn trace(dto: &Value) -> Result<Value> {
    let schema = RuntimeSchema::compile(dto.clone())?;
    let mut paths: Vec<Vec<String>> = vec![];
    for group in dto["referenceGroups"]
        .as_array()
        .ok_or_else(|| Error("referenceGroups required".into()))?
    {
        for slot in group["slots"]
            .as_array()
            .ok_or_else(|| Error("slots required".into()))?
        {
            let at: Vec<String> = serde_json::from_value(slot["at"].clone())?;
            if !paths.contains(&at) {
                paths.push(at);
            }
        }
    }
    let mut factories = vec![];
    for path in paths {
        let at: Vec<&str> = path.iter().map(String::as_str).collect();
        let descriptor = path
            .iter()
            .fold(schema.manifest(), |value, key| &value[key]);
        let count = descriptor["values"].as_array().map_or(0, Vec::len);
        for index in std::iter::once(None).chain((0..count).map(Some)) {
            let value = schema.reference_value(&at, index)?;
            let mut value_paths = vec![];
            nested_paths(value.value(), vec![], &mut value_paths);
            if value_paths.is_empty() { value_paths.push(vec![]); }
            for value_path in value_paths {
            let value = if value_path.is_empty() { value.clone() } else { value.at_value_path(value_path.clone())? };
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
            if !value_path.is_empty() { factory["valuePath"] = serde_json::to_value(value_path)?; }
            factories.push(factory);
            }
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
