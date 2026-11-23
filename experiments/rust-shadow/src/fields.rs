//! Opt-in collaborative attributes. Each declared leaf owns a separate register.
use super::*;
pub(super) fn safe(s: &str) -> bool {
    !s.is_empty() && !s.starts_with('$') && !matches!(s, "__proto__" | "constructor" | "prototype")
}
pub(super) fn decode(key: &str) -> Option<Vec<String>> {
    let path: Vec<String> = serde_json::from_str(key.strip_prefix("$field:")?).ok()?;
    (path.len() >= 2
        && path.len() <= 64
        && path.iter().all(|s| safe(s))
        && key == format!("$field:{}", json!(path)))
    .then_some(path)
}
pub(super) fn leaf<'a>(attrs: &'a Value, key: &str) -> Option<&'a Value> {
    let path = decode(key)?;
    let mut spec = attrs.get(&path[0])?;
    for part in &path[1..] {
        spec = spec.get("fields")?.get(part)?;
    }
    spec.get("fields").is_none().then_some(spec)
}
pub(super) fn json_ok(value: &Value, depth: usize) -> bool {
    match value {
        Value::Array(a) => depth < 64 && a.iter().all(|v| json_ok(v, depth + 1)),
        Value::Object(o) => depth < 64 && o.iter().all(|(k, v)| safe(k) && json_ok(v, depth + 1)),
        Value::Number(n) => {
            let magnitude = n.as_u64().or_else(|| n.as_i64().map(i64::unsigned_abs));
            magnitude.is_none_or(|n| {
                let bits = 64 - n.leading_zeros();
                bits <= 53 || n & ((1u64 << (bits - 53)) - 1) == 0
            })
        }
        _ => true,
    }
}
fn materialize_branch(
    spec: &Value,
    path: &mut Vec<String>,
    read: &impl Fn(&str) -> Option<Value>,
) -> Value {
    if let Some(fields) = spec["fields"].as_object() {
        let mut out = Map::new();
        for (name, child) in fields {
            path.push(name.clone());
            out.insert(name.clone(), materialize_branch(child, path, read));
            path.pop();
        }
        Value::Object(out)
    } else {
        read(&format!("$field:{}", json!(path)))
            .filter(|v| !v.is_null() && runtime_schema::value_ok(spec, v))
            .unwrap_or_else(|| spec["default"].clone())
    }
}
pub(super) fn materialize(spec: &Value, attr: &str, read: impl Fn(&str) -> Option<Value>) -> Value {
    materialize_branch(spec, &mut vec![attr.into()], &read)
}
