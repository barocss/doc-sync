//! Owned, validated JSON schemas. The supported native subset is explicit and
//! checked before storage is created. No callbacks or executable schema data.
use super::*;
use sha2::{Digest, Sha256};
pub const RUNTIME_FORMAT: &str = "doc-sync-runtime-schema-native-v1";
/// Native symbolic reference admission. The enclosed operation remains plain JSON.
pub const ALIAS_FORMAT: &str = "doc-sync-runtime-schema-alias-v1";
pub const SHARED_FORMAT: &str = "doc-sync-runtime-schema-shared-v2";
pub const PAYLOAD_FORMAT: &str = "doc-sync-runtime-schema-payload-v3";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(untagged)]
pub enum ValuePathSegment { Key(String), Index(usize) }
impl ValuePathSegment {
    pub fn key(key: impl Into<String>) -> Self { Self::Key(key.into()) }
    pub fn index(index: usize) -> Self { Self::Index(index) }
}


/// One schema-owned atomic object or array. The slot remains the source
/// provenance even when a declared shared identity admits it at another target.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(deny_unknown_fields)]
pub struct ReferenceSlot {
    pub at: Vec<String>,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index: Option<usize>,
    #[serde(default, rename = "valuePath", skip_serializing_if = "Vec::is_empty")]
    pub value_path: Vec<ValuePathSegment>,
}
impl ReferenceSlot {
    pub fn default(at: &[&str]) -> Self {
        Self {
            at: at.iter().map(|s| (*s).into()).collect(),
            source: "default".into(),
            index: None,
            value_path: vec![],
        }
    }
    pub fn enum_entry(at: &[&str], index: usize) -> Self {
        Self {
            at: at.iter().map(|s| (*s).into()).collect(),
            source: "enum".into(),
            index: Some(index),
            value_path: vec![],
        }
    }
    pub fn at_value_path(mut self, path: impl IntoIterator<Item = ValuePathSegment>) -> Self {
        self.value_path.extend(path); self
    }
    pub fn with_value_path(self, path: impl IntoIterator<Item = ValuePathSegment>) -> Self { self.at_value_path(path) }
    pub fn nested(self, path: impl IntoIterator<Item = ValuePathSegment>) -> Self { self.at_value_path(path) }
    pub(crate) fn payload<'a>(&self, manifest: &'a Value) -> Result<&'a Value> {
        let spec = descriptor_at(manifest, &self.at)?;
        let root: Result<&Value> = match (self.source.as_str(), self.index) {
            ("default", None) => spec
                .get("default")
                .ok_or("runtime reference default required".into()),
            ("enum", Some(index)) => spec
                .get("values")
                .and_then(Value::as_array)
                .and_then(|a| a.get(index))
                .ok_or("runtime reference enum index out of range".into()),
            _ => Err("invalid runtime reference source".into()),
        };
        let mut value = root?;
        if self.value_path.len() > 64 { return Err("runtime payload path exceeds maximum depth".into()); }
        for segment in &self.value_path {
            value = match segment {
                ValuePathSegment::Key(key) => value.as_object().and_then(|o| o.get(key)),
                ValuePathSegment::Index(index) => value.as_array().and_then(|a| a.get(*index)),
            }.ok_or("invalid runtime payload path")?;
        }
        Ok(value)
    }
}
/// An explicit identity class. Its representative selects the shared payload's
/// insertion order and must also occur in the complete slots list.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ReferenceGroup {
    pub representative: ReferenceSlot,
    pub slots: Vec<ReferenceSlot>,
}
impl ReferenceGroup {
    pub fn new(
        representative: ReferenceSlot,
        slots: impl IntoIterator<Item = ReferenceSlot>,
    ) -> Self {
        Self {
            representative,
            slots: slots.into_iter().collect(),
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SharedDescriptor {
    format: String,
    manifest: Value,
    reference_groups: Vec<ReferenceGroup>,
}
#[derive(Clone, Debug)]
pub(crate) struct SharedIdentity {
    pub payload: Option<Value>,
    pub representative: ReferenceSlot,
    pub targets: BTreeMap<String, BTreeSet<Vec<String>>>,
}

/// A declared same-descriptor default-to-enum identity edge.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DefaultReference {
    pub at: Vec<String>,
    pub enum_index: usize,
}
impl DefaultReference {
    pub fn new(at: &[&str], enum_index: usize) -> Self {
        Self {
            at: at.iter().map(|s| (*s).into()).collect(),
            enum_index,
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AliasDescriptor {
    format: String,
    manifest: Value,
    default_references: Vec<DefaultReference>,
}

pub const REFERENCE_FORMAT: &str = "doc-sync-runtime-reference-op-v1";
#[derive(Clone, Debug)]
pub struct RuntimeSchema {
    manifest: Value,
    effective_manifest: Value,
    identity: String,
    base_identity: String,
    graphic: bool,
    descriptor: Value,
    default_aliases: BTreeMap<Vec<String>, BTreeSet<usize>>,
    pub(crate) shared_slots: BTreeMap<ReferenceSlot, usize>,
    pub(crate) shared_groups: Vec<SharedIdentity>,
}
pub(crate) fn safe_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && !matches!(s, "__proto__" | "prototype" | "constructor" | "col")
        && s.bytes().enumerate().all(|(i, b)| {
            b.is_ascii_alphanumeric() && (i > 0 || !b.is_ascii_digit())
                || b == b'_'
                || i > 0 && b".-".contains(&b)
        })
}
fn unsupported<T>(path: &str, reason: &str) -> Result<T> {
    Err(format!("UnsupportedSchema at {path}: {reason}"))
}
fn keys(value: &Value, allowed: &[&str], path: &str) -> Result<()> {
    let obj = value
        .as_object()
        .ok_or_else(|| format!("UnsupportedSchema at {path}: object required"))?;
    for key in obj.keys() {
        if !allowed.contains(&key.as_str()) {
            return unsupported(&format!("{path}.{key}"), "unsupported rule");
        }
    }
    Ok(())
}
fn number_json(n: &serde_json::Number) -> String {
    if n.as_f64() == Some(0.0) {
        return "0".into();
    }
    let raw = serde_json::Number::from_f64(n.as_f64().unwrap())
        .unwrap()
        .to_string();
    let (negative, s) = if let Some(s) = raw.strip_prefix('-') {
        (true, s)
    } else {
        (false, raw.as_str())
    };
    let (mantissa, exp) = s
        .split_once(['e', 'E'])
        .map(|(m, e)| (m, e.parse::<i32>().unwrap()))
        .unwrap_or((s, 0));
    let decimal = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let mut digits = mantissa.replace('.', "");
    let mut point = decimal + exp;
    while digits.starts_with('0') && digits.len() > 1 {
        digits.remove(0);
        point -= 1;
    }
    while digits.ends_with('0') && digits.len() > 1 {
        digits.pop();
    }
    let sign = if negative { "-" } else { "" };
    if point > 0 && point <= 21 {
        if point as usize >= digits.len() {
            format!(
                "{sign}{digits}{}",
                "0".repeat(point as usize - digits.len())
            )
        } else {
            format!(
                "{sign}{}.{}",
                &digits[..point as usize],
                &digits[point as usize..]
            )
        }
    } else if point <= 0 && point > -6 {
        format!("{sign}0.{}{digits}", "0".repeat((-point) as usize))
    } else {
        let e = point - 1;
        let rest = if digits.len() > 1 {
            format!(".{}", &digits[1..])
        } else {
            String::new()
        };
        format!(
            "{sign}{}{rest}e{}{e}",
            &digits[..1],
            if e >= 0 { "+" } else { "" }
        )
    }
}
// JSON integer tokens retain exact u64/i64 values in serde_json. Reject an
// integer that JavaScript would round, before retaining any descriptor rules.
// Other JSON number tokens are already represented as f64 in both runtimes.
fn check_integer_precision(v: &Value, path: &str) -> Result<()> {
    match v {
        Value::Number(n) => {
            let magnitude = n.as_u64().or_else(|| n.as_i64().map(i64::unsigned_abs));
            if let Some(n) = magnitude {
                let bits = 64 - n.leading_zeros();
                if bits > 53 && n & ((1u64 << (bits - 53)) - 1) != 0 {
                    return unsupported(
                        path,
                        "integer is not exactly representable by JavaScript Number",
                    );
                }
            }
        }
        Value::Object(o) => {
            for (k, v) in o {
                check_integer_precision(v, &format!("{path}.{k}"))?;
            }
        }
        Value::Array(a) => {
            for (i, v) in a.iter().enumerate() {
                check_integer_precision(v, &format!("{path}[{i}]"))?;
            }
        }
        _ => {}
    }
    Ok(())
}
/// Same sorted JSON and SHA-256 identity as TypeScript schemaVersion().
/// Explicit document domain is omitted only for identity calculation.
pub fn canonical_json(v: &Value) -> Result<String> {
    fn visit(v: &Value, depth: usize) -> Result<String> {
        if depth > 128 {
            return unsupported("$", "maximum JSON depth exceeded");
        }
        Ok(match v {
            Value::Object(o) => {
                let mut names = o.keys().collect::<Vec<_>>();
                names.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
                format!(
                    "{{{}}}",
                    names
                        .into_iter()
                        .map(|k| Ok(format!(
                            "{}:{}",
                            serde_json::to_string(k).unwrap(),
                            visit(&o[k], depth + 1)?
                        )))
                        .collect::<Result<Vec<_>>>()?
                        .join(",")
                )
            }
            Value::Array(a) => format!(
                "[{}]",
                a.iter()
                    .map(|x| visit(x, depth + 1))
                    .collect::<Result<Vec<_>>>()?
                    .join(",")
            ),
            Value::Number(n) => number_json(n),
            _ => v.to_string(),
        })
    }
    visit(v, 0)
}
pub fn json_identity(v: &Value) -> Result<String> {
    Ok(format!(
        "sha256:{:x}",
        Sha256::digest(canonical_json(v)?.as_bytes())
    ))
}
fn attr(spec: &Value, path: &str, structured: bool, default_aliased: bool) -> Result<()> {
    attr_depth(spec, path, structured, 1, default_aliased)
}
fn attr_depth(
    spec: &Value,
    path: &str,
    structured: bool,
    depth: usize,
    default_aliased: bool,
) -> Result<()> {
    if depth > 64 {
        return unsupported(path, "field path exceeds 64 segments");
    }
    keys(
        spec,
        &[
            "default", "values", "min", "max", "pattern", "fields", "inherit", "computed",
        ],
        path,
    )?;
    if !spec.as_object().unwrap().contains_key("default") {
        return unsupported(path, "default required");
    }
    if spec.get("computed").is_some_and(|v| v != false) {
        return unsupported(
            &format!("{path}.computed"),
            if depth > 1 {
                "collaborative fields cannot be computed"
            } else {
                "computed attributes are unavailable"
            },
        );
    }
    for flag in ["inherit", "computed"] {
        if spec.get(flag).is_some_and(|v| !v.is_boolean()) {
            return unsupported(&format!("{path}.{flag}"), "boolean required");
        }
    }
    if let Some(fs) = spec.get("fields") {
        if !structured {
            return unsupported(
                &format!("{path}.fields"),
                "fields are unavailable at this position",
            );
        }
        if ["values", "min", "max", "pattern"]
            .iter()
            .any(|k| spec.get(*k).is_some())
        {
            return unsupported(path, "branch constraints belong on leaf fields");
        }
        keys(spec, &["default", "fields", "inherit", "computed"], path)?;
        let fields = fs
            .as_object()
            .ok_or_else(|| format!("UnsupportedSchema at {path}.fields: object required"))?;
        let defaults = spec["default"]
            .as_object()
            .ok_or_else(|| format!("UnsupportedSchema at {path}.default: object required"))?;
        if fields.len() != defaults.len() {
            return unsupported(path, "field defaults must have exactly the declared keys");
        }
        for (name, spec) in fields {
            if !fields::safe(name) {
                return unsupported(&format!("{path}.fields.{name}"), "safe field name required");
            }
            attr_depth(
                spec,
                &format!("{path}.fields.{name}"),
                true,
                depth + 1,
                false,
            )?;
            if defaults.get(name) != spec.get("default") {
                return unsupported(
                    &format!("{path}.default"),
                    "branch default must equal declared child defaults",
                );
            }
        }
        return Ok(());
    }
    let default = &spec["default"];
    if !fields::json_ok(default, 0) {
        return unsupported(path, "unsafe field JSON default");
    }
    if let Some(values) = spec.get("values") {
        if structured && depth > 1 {
            if values
                .as_array()
                .is_none_or(|a| !a.iter().all(|v| fields::json_ok(v, 0)))
            {
                return unsupported(path, "safe JSON values required");
            }
        } else if values
            .as_array()
            .is_none_or(|a| a.is_empty() || a.iter().any(|v| v.is_null() || !fields::json_ok(v, 0)))
        {
            return unsupported(
                &format!("{path}.values"),
                "nonempty safe JSON list required",
            );
        }
    }
    for bound in ["min", "max"] {
        if let Some(v) = spec.get(bound) {
            if !v.is_number() || !default.is_number() {
                return unsupported(
                    &format!("{path}.{bound}"),
                    "number default and bound required",
                );
            }
        }
    }
    if spec["min"]
        .as_f64()
        .zip(spec["max"].as_f64())
        .is_some_and(|(a, b)| a > b)
    {
        return unsupported(path, "minimum exceeds maximum");
    }
    if let Some(pattern) = spec.get("pattern") {
        if !default.is_string() || pattern.as_str().is_none_or(|p| !pattern_supported(p)) {
            return unsupported(
                &format!("{path}.pattern"),
                "pattern is outside the shared native grammar",
            );
        }
    }
    if !(if depth > 1 {
        value_ok(spec, default)
    } else {
        default_aliased || atomic_value_ok(spec, default)
    }) {
        return unsupported(&format!("{path}.default"), "default violates constraints");
    }
    Ok(())
}
// Computed cell values come from native span projection, never stored writes.
fn computed_cell_attr(key: &str, spec: &Value) -> bool {
    match key {
        "colspan" | "rowspan" => {
            *spec == json!({"default": 1, "computed": true})
                || *spec == json!({"default": 1, "min": 1, "computed": true})
        }
        "spanned" => *spec == json!({"default": false, "computed": true}),
        _ => false,
    }
}
const OPTIONAL_LINK_PATTERN: &str = r"^(https?://\S+)?$";
const OPTIONAL_COLOR_PATTERN: &str = "^(#[0-9a-fA-F]{6})?$";

// ECMAScript WhiteSpace + LineTerminator, not Rust's Unicode White_Space.
// In particular BOM is whitespace here; NEL (U+0085) is not.
fn ecmascript_whitespace(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
        | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
        | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn optional_link_ok(s: &str) -> bool {
    s.is_empty()
        || s.strip_prefix("http://")
            .or_else(|| s.strip_prefix("https://"))
            .is_some_and(|suffix| !suffix.is_empty() && !suffix.chars().any(ecmascript_whitespace))
}

fn optional_color_ok(s: &str) -> bool {
    s.is_empty()
        || s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}

fn pattern_supported(p: &str) -> bool {
    p == OPTIONAL_LINK_PATTERN
        || p == OPTIONAL_COLOR_PATTERN
        || p == "^[a-z]*$"
        || p == "^#[0-9a-fA-F]{6}$"
        || p == "^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$"
        || p.strip_prefix("^[^\\u0000-\\u001f\\u007f]{0,")
            .and_then(|x| x.strip_suffix("}$"))
            .is_some_and(|n| n.parse::<usize>().is_ok_and(|n| n <= 1_000_000))
        || p.strip_prefix('^')
            .and_then(|x| x.strip_suffix('$'))
            .is_some_and(|s| {
                s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b" _-".contains(&b))
            })
}
/// Check JSON data against an already validated attribute or leaf specification.
pub fn value_ok(spec: &Value, v: &Value) -> bool {
    if !(if spec["default"].is_array() {
        v.is_null() || v.is_array()
    } else if spec["default"].is_object() {
        v.is_null() || v.is_object()
    } else {
        general::attr_ok(spec, v)
    }) {
        return false;
    }
    if v.is_null() {
        return true;
    }
    if !fields::json_ok(v, 0)
        || spec["values"].as_array().is_some_and(|a| {
            !a.iter()
                .any(|x| x == v || x.is_number() && v.is_number() && x.as_f64() == v.as_f64())
        })
    {
        return false;
    }
    let Some(p) = spec["pattern"].as_str() else {
        return true;
    };
    let Some(s) = v.as_str() else {
        return false;
    };
    if p == OPTIONAL_LINK_PATTERN {
        return optional_link_ok(s);
    }
    if p == OPTIONAL_COLOR_PATTERN {
        return optional_color_ok(s);
    }
    if p == "^[a-z]*$" {
        return s.bytes().all(|b| b.is_ascii_lowercase());
    }
    if p.starts_with("^#") {
        return (s.len() == 7 || p.contains("{2}") && s.len() == 9)
            && s.starts_with('#')
            && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit);
    }
    if let Some(n) = p
        .strip_prefix("^[^\\u0000-\\u001f\\u007f]{0,")
        .and_then(|x| x.strip_suffix("}$"))
        .and_then(|n| n.parse::<usize>().ok())
    {
        return s.encode_utf16().count() <= n && !s.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}');
    }
    p.strip_prefix('^').and_then(|x| x.strip_suffix('$')) == Some(s)
}
/// Atomic enums use JS identity. Parsed JSON composites have no schema identity.
/// Structured field leaves deliberately keep the separate deep-value contract.
pub fn atomic_value_ok(spec: &Value, v: &Value) -> bool {
    if v.is_null() {
        return true;
    }
    if (v.is_object() || v.is_array()) && spec.get("values").is_some() {
        return false;
    }
    if spec["default"].is_object() || spec["default"].is_array() {
        // JavaScript typeof treats both arrays and records as objects.
        return (v.is_object() || v.is_array()) && fields::json_ok(v, 0);
    }
    value_ok(spec, v)
}
pub fn validate_attribute(manifest: &Value, name: &str, key: &str, value: &Value) -> Result<()> {
    let attrs = &manifest["nodes"][name]["attrs"];
    let spec = if key.starts_with("$field:") {
        fields::leaf(attrs, key)
    } else {
        attrs.get(key).filter(|s| s.get("fields").is_none())
    };
    if spec.is_some_and(|s| {
        s["computed"] != true
            && if key.starts_with("$field:") {
                value_ok(s, value)
            } else {
                atomic_value_ok(s, value)
            }
    }) {
        Ok(())
    } else {
        Err(format!("invalid runtime attribute {name}.{key}"))
    }
}
pub fn validate_mark_value(manifest: &Value, key: &str, value: &Value) -> Result<()> {
    if let Some(spec) = manifest["markValues"].get(key) {
        if atomic_value_ok(spec, value) {
            return Ok(());
        }
    } else if manifest["marks"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m == key)
        && (value.is_null() || value.is_boolean())
    {
        return Ok(());
    }
    Err(format!("invalid runtime mark value {key}"))
}

/// Field descriptors use explicit `fields` edges. Payload `valuePath` never
/// resolves schema descriptors and cannot cross a collaborative branch.
pub(crate) fn field_descriptor_path(at: &[String]) -> bool { at.len() > 4 }
pub(crate) fn descriptor_at<'a>(manifest: &'a Value, at: &[String]) -> Result<&'a Value> {
    let spec = match at {
        [marks, key] if marks == "markValues" => manifest["markValues"].get(key),
        [nodes, name, attrs, key, tail @ ..] if nodes == "nodes" && attrs == "attrs" => {
            if tail.len() % 2 != 0 || tail.len() / 2 + 1 > 64 {
                return Err("invalid runtime reference field path".into());
            }
            if !tail.is_empty() && (!fields::safe(key) || tail.chunks_exact(2).any(|edge| edge[0] != "fields" || !fields::safe(&edge[1]))) {
                return Err("invalid runtime reference field path".into());
            }
            let mut spec = manifest["nodes"][name]["attrs"].get(key);
            for edge in tail.chunks_exact(2) {
                spec = spec.and_then(|s| s.get("fields")).and_then(|f| f.get(&edge[1]));
            }
            spec
        }
        _ => None,
    }.ok_or("invalid runtime reference attribute path")?;
    if spec.get("fields").is_some() || spec["computed"] == true {
        return Err("runtime references require an atomic writable attribute".into());
    }
    Ok(spec)
}
fn collect_field_descriptors(spec: &Value, at: Vec<String>, output: &mut Vec<Vec<String>>, depth: usize) -> Result<()> {
    if depth > 64 { return Err("runtime reference field path exceeds 64 segments".into()); }
    if let Some(fields) = spec.get("fields") {
        let fields = fields.as_object().ok_or("runtime reference fields require object")?;
        for (name, child) in fields {
            if !fields::safe(name) { return Err("invalid runtime reference field name".into()); }
            let mut child_at = at.clone();
            child_at.extend(["fields".into(), name.clone()]);
            collect_field_descriptors(child, child_at, output, depth + 1)?;
        }
    } else if spec["computed"] != true {
        output.push(at);
    }
    Ok(())
}
// Compile identity classes once. Composite descendants inherit parent identity;
// child identity never establishes an identity between their parents.
fn compile_payload_graph(
    manifest: &Value,
    groups: &[ReferenceGroup],
) -> Result<(BTreeMap<ReferenceSlot, usize>, Vec<SharedIdentity>, Value)> {
    fn collect(
        value: &Value,
        slot: ReferenceSlot,
        nodes: &mut Vec<ReferenceSlot>,
        depth: usize,
    ) -> Result<()> {
        if depth > 64 {
            return Err("runtime payload exceeds maximum depth".into());
        }
        if !(value.is_object() || value.is_array()) {
            return Ok(());
        }
        nodes.push(slot.clone());
        match value {
            Value::Object(object) => {
                for (key, child) in object {
                    collect(
                        child,
                        slot.clone().nested([ValuePathSegment::Key(key.clone())]),
                        nodes,
                        depth + 1,
                    )?;
                }
            }
            Value::Array(array) => {
                for (index, child) in array.iter().enumerate() {
                    collect(
                        child,
                        slot.clone().nested([ValuePathSegment::Index(index)]),
                        nodes,
                        depth + 1,
                    )?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    let mut nodes = vec![];
    let mut roots = vec![];
    let mut descriptors = vec![];
    if let Some(marks) = manifest["markValues"].as_object() {
        for key in marks.keys() {
            descriptors.push(vec!["markValues".into(), key.clone()]);
        }
    }
    if let Some(kinds) = manifest["nodes"].as_object() {
        for (kind, node) in kinds {
            if let Some(attrs) = node["attrs"].as_object() {
                for (key, spec) in attrs {
                    collect_field_descriptors(spec, vec![
                        "nodes".into(), kind.clone(), "attrs".into(), key.clone(),
                    ], &mut descriptors, 1)?;
                }
            }
        }
    }
    for at in descriptors {
        let spec = descriptor_at(manifest, &at)?;
        if let Some(default) = spec.get("default") {
            let slot = ReferenceSlot {
                at: at.clone(),
                source: "default".into(),
                index: None,
                value_path: vec![],
            };
            if default.is_object() || default.is_array() {
                roots.push(slot.clone());
            }
            collect(default, slot, &mut nodes, 0)?;
        }
        if let Some(values) = spec["values"].as_array() {
            for (index, value) in values.iter().enumerate() {
                let slot = ReferenceSlot {
                    at: at.clone(),
                    source: "enum".into(),
                    index: Some(index),
                    value_path: vec![],
                };
                if value.is_object() || value.is_array() {
                    roots.push(slot.clone());
                }
                collect(value, slot, &mut nodes, 0)?;
            }
        }
    }
    let indices: BTreeMap<_, _> = nodes
        .iter()
        .cloned()
        .enumerate()
        .map(|(id, slot)| (slot, id))
        .collect();
    fn find(parent: &mut [usize], mut id: usize) -> usize {
        let start = id;
        while parent[id] != id {
            id = parent[id];
        }
        let mut node = start;
        while parent[node] != node {
            let next = parent[node];
            parent[node] = id;
            node = next;
        }
        id
    }
    let mut parent: Vec<_> = (0..nodes.len()).collect();
    let mut preferred = parent.clone();
    let mut labels = vec![None; nodes.len()];
    let mut explicit_slots = BTreeSet::new();
    let mut pending = vec![];
    for (group_id, group) in groups.iter().enumerate() {
        let representative = *indices
            .get(&group.representative)
            .ok_or("runtime payload representative must be composite")?;
        let canonical = canonical_json(group.representative.payload(manifest)?)?;
        for slot in &group.slots {
            if !explicit_slots.insert(slot.clone()) {
                return Err("duplicate or overlapping reference slot".into());
            }
            let id = *indices
                .get(slot)
                .ok_or("runtime payload slot must be composite")?;
            if canonical_json(slot.payload(manifest)?)? != canonical {
                return Err("group requires equal composite payloads".into());
            }
            let mut root_slot = slot.clone();
            root_slot.value_path.clear();
            let mut spec = descriptor_at(manifest, &slot.at)?.clone();
            spec.as_object_mut().unwrap().shift_remove("values");
            let valid = if field_descriptor_path(&slot.at) {
                value_ok(&spec, root_slot.payload(manifest)?)
            } else { atomic_value_ok(&spec, root_slot.payload(manifest)?) };
            if !valid {
                return Err("slot violates its own attribute constraints".into());
            }
            labels[id] = Some(group_id);
            pending.push((representative, id));
        }
        preferred[representative] = representative;
    }
    // Explicit groups are installed before downward propagation, so a nested
    // representative overrides inherited child order regardless of DTO order.
    for group in groups {
        let rep = indices[&group.representative];
        for slot in &group.slots {
            let id = indices[slot];
            parent[id] = rep;
        }
        parent[rep] = rep;
        preferred[rep] = rep;
    }
    let mut cursor = 0;
    while cursor < pending.len() {
        let (left, right) = pending[cursor];
        cursor += 1;
        let a = find(&mut parent, left);
        let b = find(&mut parent, right);
        if a != b {
            if labels[a].is_some() && labels[b].is_some() && labels[a] != labels[b] {
                return Err("ambiguous implicit overlap between explicit reference groups".into());
            }
            let winner = if labels[b].is_some() { b } else { a };
            let loser = if winner == a { b } else { a };
            parent[loser] = winner;
            if labels[winner].is_none() {
                preferred[winner] = preferred[a];
            }
            labels[winner] = labels[winner].or(labels[loser]);
        }
        let value = nodes[left].payload(manifest)?;
        let segments: Vec<_> = match value {
            Value::Object(o) => o
                .iter()
                .filter(|(_, v)| v.is_object() || v.is_array())
                .map(|(k, _)| ValuePathSegment::Key(k.clone()))
                .collect(),
            Value::Array(a) => a
                .iter()
                .enumerate()
                .filter(|(_, v)| v.is_object() || v.is_array())
                .map(|(i, _)| ValuePathSegment::Index(i))
                .collect(),
            _ => vec![],
        };
        for segment in segments {
            let child_a = nodes[left].clone().nested([segment.clone()]);
            let child_b = nodes[right].clone().nested([segment]);
            pending.push((indices[&child_a], indices[&child_b]));
        }
    }
    let mut slots = BTreeMap::new();
    let mut classes = vec![];
    let mut class_indices = BTreeMap::new();
    for (id, slot) in nodes.iter().enumerate() {
        let root = find(&mut parent, id);
        let class = *class_indices.entry(root).or_insert_with(|| {
            let class = classes.len();
            classes.push(SharedIdentity {
                payload: None,
                representative: nodes[preferred[root]].clone(),
                targets: BTreeMap::new(),
            });
            class
        });
        slots.insert(slot.clone(), class);
        if slot.value_path.is_empty() && !field_descriptor_path(&slot.at) {
            let spec = descriptor_at(manifest, &slot.at)?;
            if spec.get("values").is_none() || slot.source == "enum" {
                classes[class]
                    .targets
                    .entry(slot.at.last().unwrap().clone())
                    .or_default()
                    .insert(slot.at.clone());
            }
        }
    }
    fn expand(
        slot: &ReferenceSlot,
        manifest: &Value,
        slots: &BTreeMap<ReferenceSlot, usize>,
        classes: &[SharedIdentity],
        active: &mut BTreeSet<usize>,
        depth: usize,
    ) -> Result<Value> {
        if depth > 64 {
            return Err("expanded runtime payload exceeds maximum depth".into());
        }
        let class = slots[slot];
        if !active.insert(class) {
            return Err("cyclic runtime payload identity".into());
        }
        let representative = &classes[class].representative;
        let raw = representative.payload(manifest)?;
        let value = match raw {
            Value::Object(object) => {
                let mut output = serde_json::Map::new();
                for (key, child) in object {
                    let child = if child.is_object() || child.is_array() {
                        expand(
                            &representative
                                .clone()
                                .nested([ValuePathSegment::Key(key.clone())]),
                            manifest,
                            slots,
                            classes,
                            active,
                            depth + 1,
                        )?
                    } else {
                        child.clone()
                    };
                    output.insert(key.clone(), child);
                }
                Value::Object(output)
            }
            Value::Array(array) => {
                let mut output = Vec::with_capacity(array.len());
                for (index, child) in array.iter().enumerate() {
                    output.push(if child.is_object() || child.is_array() {
                        expand(
                            &representative
                                .clone()
                                .nested([ValuePathSegment::Index(index)]),
                            manifest,
                            slots,
                            classes,
                            active,
                            depth + 1,
                        )?
                    } else {
                        child.clone()
                    });
                }
                Value::Array(output)
            }
            _ => return Err("runtime payload class must be composite".into()),
        };
        active.remove(&class);
        Ok(value)
    }
    let mut effective = manifest.clone();
    for slot in roots {
        let value = expand(&slot, manifest, &slots, &classes, &mut BTreeSet::new(), 0)?;
        let mut spec = &mut effective;
        for key in &slot.at {
            spec = spec.get_mut(key).ok_or("payload root disappeared")?;
        }
        match slot.index {
            Some(index) => spec["values"][index] = value,
            None => spec["default"] = value,
        }
    }
    Ok((slots, classes, effective))
}

impl RuntimeSchema {
    pub fn compile(descriptor: Value) -> Result<Self> {
        canonical_json(&descriptor)?;
        let (manifest, mut default_references, mut reference_groups, schema_format) =
            match descriptor.get("format").and_then(Value::as_str) {
                Some(SHARED_FORMAT) | Some(PAYLOAD_FORMAT) => {
                    let parsed: SharedDescriptor = decode(&descriptor)?;
                    if !matches!(parsed.format.as_str(), SHARED_FORMAT | PAYLOAD_FORMAT) || parsed.reference_groups.is_empty() {
                        return unsupported("$", "invalid shared schema format or empty groups");
                    }
                    (
                        parsed.manifest,
                        vec![],
                        parsed.reference_groups,
                        Some(if parsed.format == PAYLOAD_FORMAT { PAYLOAD_FORMAT } else { SHARED_FORMAT }),
                    )
                }
                Some(_) => {
                    let parsed: AliasDescriptor = decode(&descriptor)?;
                    if parsed.format != ALIAS_FORMAT || parsed.default_references.is_empty() {
                        return unsupported("$", "invalid alias schema format or empty references");
                    }
                    (
                        parsed.manifest,
                        parsed.default_references,
                        vec![],
                        Some(ALIAS_FORMAT),
                    )
                }
                None if descriptor.get("format").is_some() => {
                    return unsupported("$", "schema format must be string")
                }
                None => (descriptor.clone(), vec![], vec![], None),
            };
        let mut shared_slots = BTreeMap::new();
        let mut shared_groups = vec![];
        for group in &mut reference_groups {
            if group.slots.len() < 2 || !group.slots.contains(&group.representative) {
                return unsupported(
                    "$.referenceGroups",
                    "group requires at least two slots and its representative",
                );
            }
            group
                .slots
                .sort_by_cached_key(|s| canonical_json(&serde_json::to_value(s).unwrap()).unwrap().encode_utf16().collect::<Vec<_>>());
        }
        reference_groups
            .sort_by_cached_key(|g| canonical_json(&serde_json::to_value(g).unwrap()).unwrap().encode_utf16().collect::<Vec<_>>());
        if schema_format != Some(PAYLOAD_FORMAT) && reference_groups.iter().flat_map(|g| &g.slots).any(|s| !s.value_path.is_empty()) {
            return unsupported("$.referenceGroups", "valuePath requires payload-v3");
        }
        if schema_format != Some(PAYLOAD_FORMAT) && (reference_groups.iter().flat_map(|g| &g.slots).any(|s| field_descriptor_path(&s.at)) || default_references.iter().any(|s| field_descriptor_path(&s.at))) {
            return unsupported("$", "field descriptor references require payload-v3");
        }
        let payload_graph = if schema_format == Some(PAYLOAD_FORMAT) {
            let (slots, groups, effective) = compile_payload_graph(&manifest, &reference_groups)?;
            shared_slots = slots; shared_groups = groups;
            let mut enum_roots: BTreeMap<(usize, Vec<String>), Vec<usize>> = BTreeMap::new();
            for (slot, class) in &shared_slots {
                if slot.value_path.is_empty() && slot.source == "enum" && !field_descriptor_path(&slot.at) {
                    enum_roots.entry((*class, slot.at.clone())).or_default().push(slot.index.unwrap());
                }
            }
            for (slot, class) in &shared_slots {
                if slot.value_path.is_empty() && slot.source == "default" && !field_descriptor_path(&slot.at) {
                    if let Some(indexes) = enum_roots.get(&(*class, slot.at.clone())) {
                        for index in indexes {
                            default_references.push(DefaultReference { at: slot.at.clone(), enum_index: *index });
                        }
                    }
                }
            }
            Some(effective)
        } else { None };
        for (id, group) in reference_groups.iter().enumerate().filter(|_| payload_graph.is_none()) {
            let payload = group.representative.payload(&manifest)?;
            let canonical = canonical_json(payload)?;
            let mut targets: BTreeMap<String, BTreeSet<Vec<String>>> = BTreeMap::new();
            for slot in &group.slots {
                if shared_slots.insert(slot.clone(), id).is_some() {
                    return unsupported(
                        "$.referenceGroups",
                        "duplicate or overlapping reference slot",
                    );
                }
                let value = slot.payload(&manifest)?;
                if !(value.is_object() || value.is_array()) || canonical_json(value)? != canonical {
                    return unsupported(
                        "$.referenceGroups",
                        "group requires equal composite payloads",
                    );
                }
                let spec = descriptor_at(&manifest, &slot.at)?;
                let mut without_enum = spec.clone();
                without_enum.as_object_mut().unwrap().shift_remove("values");
                if !atomic_value_ok(&without_enum, value) {
                    return unsupported(
                        "$.referenceGroups",
                        "slot violates its own attribute constraints",
                    );
                }
                // A constrained target must own an enum member in this identity
                // class. Matching payloads never create an identity edge.
                if spec.get("values").is_none() || slot.source == "enum" {
                    targets
                        .entry(slot.at.last().unwrap().clone())
                        .or_default()
                        .insert(slot.at.clone());
                }
                if slot.source == "default" {
                    for choice in &group.slots {
                        if choice.at == slot.at && choice.source == "enum" {
                            default_references.push(DefaultReference {
                                at: slot.at.clone(),
                                enum_index: choice.index.unwrap_or(usize::MAX),
                            });
                        }
                    }
                }
            }
            shared_groups.push(SharedIdentity {
                payload: Some(payload.clone()),
                representative: group.representative.clone(),
                targets,
            });
        }
        default_references.sort_by(|a, b| {
            a.at.iter()
                .map(|s| s.encode_utf16().collect::<Vec<_>>())
                .cmp(b.at.iter().map(|s| s.encode_utf16().collect::<Vec<_>>()))
                .then(a.enum_index.cmp(&b.enum_index))
        });
        for pair in default_references.windows(2) {
            if pair[0] == pair[1] {
                return unsupported("$.defaultReferences", "duplicate default reference");
            }
        }
        for edge in &default_references {
            let spec = descriptor_at(&manifest, &edge.at)?;
            let default = spec
                .get("default")
                .ok_or("alias requires an explicit default")?;
            let choice = spec
                .get("values")
                .and_then(Value::as_array)
                .and_then(|a| a.get(edge.enum_index))
                .ok_or("alias enum index out of range")?;
            if !(default.is_object() || default.is_array())
                || !(choice.is_object() || choice.is_array())
                || canonical_json(default)? != canonical_json(choice)?
            {
                return unsupported(
                    "$.defaultReferences",
                    "alias requires equal composite default and enum payloads",
                );
            }
        }
        canonical_json(&manifest)?;
        check_integer_precision(&manifest, "$")?;
        keys(
            &manifest,
            &["domain", "root", "marks", "markValues", "nodes"],
            "$",
        )?;
        let graphic = match manifest.get("domain").and_then(Value::as_str) {
            Some("graphic") => true,
            None | Some("document") => false,
            _ => return unsupported("$.domain", "expected document or graphic"),
        };
        if manifest.get("domain").is_some_and(|v| !v.is_string()) {
            return unsupported("$.domain", "string required");
        }
        let root = manifest["root"]
            .as_str()
            .ok_or("UnsupportedSchema at $.root: string required")?;
        let nodes = manifest["nodes"]
            .as_object()
            .ok_or("UnsupportedSchema at $.nodes: object required")?;
        if nodes.is_empty() || nodes.len() > 256 || !nodes.contains_key(root) {
            return unsupported(
                "$.nodes",
                "root must name a declared node; maximum 256 nodes",
            );
        }
        let marks = manifest["marks"]
            .as_array()
            .ok_or("UnsupportedSchema at $.marks: array required")?;
        let mut seen = BTreeSet::new();
        for m in marks {
            if m.as_str().is_none_or(|s| !safe_name(s) || !seen.insert(s)) {
                return unsupported("$.marks", "unique safe mark names required");
            }
        }
        if let Some(m) = manifest.get("markValues") {
            let values = m
                .as_object()
                .ok_or("UnsupportedSchema at $.markValues: object required")?;
            if graphic && !values.is_empty() {
                return unsupported("$.markValues", "Graphic value marks are unavailable");
            }
            for (key, spec) in values {
                if !safe_name(key) || seen.contains(key.as_str()) {
                    return unsupported(
                        &format!("$.markValues.{key}"),
                        "safe non-boolean mark name required",
                    );
                }
                if spec.get("fields").is_some() {
                    return unsupported(
                        &format!("$.markValues.{key}.fields"),
                        "fields are unavailable at this position",
                    );
                }
                attr(
                    spec,
                    &format!("$.markValues.{key}"),
                    false,
                    default_references
                        .iter()
                        .any(|e| e.at == ["markValues", key.as_str()]),
                )?;
            }
        }
        let root_shape = if graphic { "container" } else { "flow" };
        if nodes[root]["shape"] != root_shape {
            return unsupported(&format!("$.nodes.{root}.shape"), "invalid root shape");
        }
        for (name, node) in nodes {
            let path = format!("$.nodes.{name}");
            if !safe_name(name) {
                return unsupported(&path, "invalid node name");
            }
            keys(
                node,
                &[
                    "shape",
                    "children",
                    "attrs",
                    "ui",
                    "default",
                    "next",
                    "text",
                    "by",
                    "mark",
                    "attr",
                    "childRules",
                ],
                &path,
            )?;
            let shape = node["shape"]
                .as_str()
                .ok_or_else(|| format!("UnsupportedSchema at {path}.shape: string required"))?;
            if !(matches!(shape, "atom" | "text")
                || graphic && shape == "container"
                || !graphic
                    && matches!(
                        shape,
                        "flow" | "grid" | "row" | "cell" | "group" | "inline" | "span"
                    ))
            {
                return unsupported(
                    &format!("{path}.shape"),
                    "unsupported shape for this domain",
                );
            }
            for field in ["by", "mark", "attr"] {
                if node.get(field).is_some()
                    && !matches!((shape, field), ("group", "by") | ("span", "mark" | "attr"))
                {
                    return unsupported(
                        &format!("{path}.{field}"),
                        "rule is invalid for this shape",
                    );
                }
            }
            if matches!(shape, "group" | "span")
                && node
                    .get("attrs")
                    .is_some_and(|a| a.as_object().is_none_or(|a| !a.is_empty()))
            {
                return unsupported(
                    &format!("{path}.attrs"),
                    "derived node attributes must come from stored values",
                );
            }
            if node.get("childRules").is_some() && shape != "flow" {
                return unsupported(
                    &format!("{path}.childRules"),
                    "only flow declares child rules",
                );
            }
            if shape != "flow" && node.get("default").is_some() {
                return unsupported(&format!("{path}.default"), "only flow declares default");
            }
            if shape != "text" && (node.get("text").is_some() || node.get("next").is_some()) {
                return unsupported(&path, "text and next require text shape");
            }
            if node.get("text").is_some_and(|v| !v.is_boolean()) {
                return unsupported(&format!("{path}.text"), "boolean required");
            }
            if let Some(ui) = node.get("ui") {
                if !ui.is_object() {
                    return unsupported(&format!("{path}.ui"), "object required");
                }
            }
            let children = node
                .get("children")
                .map(|v| {
                    v.as_array().ok_or_else(|| {
                        format!("UnsupportedSchema at {path}.children: array required")
                    })
                })
                .transpose()?;
            if matches!(
                shape,
                "container" | "flow" | "grid" | "row" | "cell" | "group"
            ) || shape == "text" && children.is_some()
            {
                let children = children
                    .ok_or_else(|| format!("UnsupportedSchema at {path}.children: required"))?;
                let mut seen = BTreeSet::new();
                for child in children {
                    let c = child
                        .as_str()
                        .ok_or("UnsupportedSchema: child name must be string")?;
                    if !nodes.contains_key(c) || c == root || !seen.insert(c) {
                        return unsupported(
                            &format!("{path}.children"),
                            "unknown, duplicate, or root child",
                        );
                    }
                }
                if shape == "text"
                    && children.iter().any(|c| {
                        !matches!(
                            nodes[c.as_str().unwrap()]["shape"].as_str(),
                            Some("inline" | "span")
                        )
                    })
                {
                    return unsupported(
                        &format!("{path}.children"),
                        "text children must be inline or span types",
                    );
                }
            } else if children.is_some_and(|a| !a.is_empty()) {
                return unsupported(&format!("{path}.children"), "inline children unavailable");
            }
            if matches!(shape, "grid" | "row" | "cell") {
                let expected = match shape {
                    "grid" => "row",
                    "row" => "cell",
                    _ => "flow",
                };
                let children = children.unwrap();
                if children.len() != 1 || nodes[children[0].as_str().unwrap()]["shape"] != expected
                {
                    return unsupported(
                        &format!("{path}.children"),
                        "expected one child in grid > row > cell > flow chain",
                    );
                }
            }
            if shape == "flow" {
                if children.unwrap().iter().any(|c| {
                    matches!(
                        nodes[c.as_str().unwrap()]["shape"].as_str(),
                        Some("row" | "cell" | "inline" | "span")
                    )
                }) {
                    return unsupported(
                        &format!("{path}.children"),
                        "flow children must be stored block types",
                    );
                }
                let d = node["default"]
                    .as_str()
                    .ok_or("UnsupportedSchema: flow default required")?;
                if manifest["nodes"][d]["shape"] != "text"
                    || !children.unwrap().iter().any(|c| {
                        c == d
                            || nodes[c.as_str().unwrap()]["shape"] == "group"
                                && nodes[c.as_str().unwrap()]["children"]
                                    .as_array()
                                    .is_some_and(|cs| cs.iter().any(|c| c == d))
                    })
                {
                    return unsupported(
                        &format!("{path}.default"),
                        "default must name a child text type",
                    );
                }
            }
            if let Some(rules) = node.get("childRules") {
                let rules = rules.as_object().ok_or_else(|| {
                    format!("UnsupportedSchema at {path}.childRules: object required")
                })?;
                for (child, rule) in rules {
                    let p = format!("{path}.childRules.{child}");
                    if !children.unwrap().iter().any(|c| c == child) {
                        return unsupported(&p, "rule target must be a declared child");
                    }
                    keys(rule, &["min", "max"], &p)?;
                    for key in ["min", "max"] {
                        if rule
                            .get(key)
                            .is_some_and(|v| v.as_u64().is_none_or(|n| n > 1000))
                        {
                            return unsupported(
                                &format!("{p}.{key}"),
                                "bounds must be integers from 0 to 1000",
                            );
                        }
                    }
                    if rule["min"].as_u64().unwrap_or(0) > rule["max"].as_u64().unwrap_or(u64::MAX)
                    {
                        return unsupported(&p, "min exceeds max");
                    }
                }
            }
            if shape == "group" {
                let by = node["by"]
                    .as_array()
                    .ok_or_else(|| format!("UnsupportedSchema at {path}.by: array required"))?;
                let mut seen = BTreeSet::new();
                if by
                    .iter()
                    .any(|k| k.as_str().is_none_or(|k| !safe_name(k) || !seen.insert(k)))
                {
                    return unsupported(
                        &format!("{path}.by"),
                        "unique safe attribute names required",
                    );
                }
                let children = children.unwrap();
                if children.is_empty()
                    || children
                        .iter()
                        .any(|c| nodes[c.as_str().unwrap()]["shape"] != "text")
                {
                    return unsupported(
                        &format!("{path}.children"),
                        "nonempty text children required",
                    );
                }
                for child in children {
                    for key in by {
                        if nodes[child.as_str().unwrap()]["attrs"]
                            .get(key.as_str().unwrap())
                            .is_none()
                        {
                            return unsupported(
                                &format!("{path}.by"),
                                "group attribute must exist on each child",
                            );
                        }
                    }
                }
            }
            if shape == "span" {
                let mark = node["mark"]
                    .as_str()
                    .ok_or_else(|| format!("UnsupportedSchema at {path}.mark: string required"))?;
                if manifest["markValues"].get(mark).is_none() {
                    return unsupported(&format!("{path}.mark"), "declared value mark required");
                }
                if node["attr"].as_str().is_none_or(|a| !safe_name(a)) {
                    return unsupported(&format!("{path}.attr"), "safe attribute name required");
                }
            }
            if let Some(next) = node.get("next") {
                if shape != "text"
                    || next
                        .as_str()
                        .is_none_or(|n| manifest["nodes"][n]["shape"] != "text")
                {
                    return unsupported(&format!("{path}.next"), "next must name a text type");
                }
            }
            if name == root
                && node
                    .get("attrs")
                    .is_some_and(|a| a.as_object().is_none_or(|a| !a.is_empty()))
            {
                if let Some((key, _)) = node["attrs"]
                    .as_object()
                    .and_then(|a| a.iter().find(|(_, s)| s.get("fields").is_some()))
                {
                    return unsupported(
                        &format!("{path}.attrs.{key}.fields"),
                        "fields are unavailable at this position",
                    );
                }
                return unsupported(&format!("{path}.attrs"), "root attributes unavailable");
            }
            if let Some(attrs) = node.get("attrs") {
                for (key, spec) in attrs
                    .as_object()
                    .ok_or("UnsupportedSchema: attrs must be object")?
                {
                    if !safe_name(key) {
                        return unsupported(
                            &format!("{path}.attrs.{key}"),
                            if spec.get("fields").is_some() {
                                "safe field attribute name required"
                            } else {
                                "invalid attribute name"
                            },
                        );
                    }
                    if shape == "cell" && computed_cell_attr(key, spec) {
                        continue;
                    }
                    attr(
                        spec,
                        &format!("{path}.attrs.{key}"),
                        name != root,
                        default_references
                            .iter()
                            .any(|e| e.at == ["nodes", name.as_str(), "attrs", key.as_str()]),
                    )?;
                }
            }
        }
        if !graphic {
            let cell_bodies: BTreeSet<&str> = nodes
                .values()
                .filter(|n| n["shape"] == "cell")
                .filter_map(|n| n["children"][0].as_str())
                .collect();
            for (name, node) in nodes {
                if (node["shape"] == "row" || cell_bodies.contains(name.as_str()))
                    && node
                        .get("attrs")
                        .is_some_and(|a| a.as_object().is_none_or(|a| !a.is_empty()))
                {
                    return unsupported(
                        &format!("$.nodes.{name}.attrs"),
                        "attributes on model-only row/cell-body positions are unavailable",
                    );
                }
            }
        }
        if !graphic {
            fn visit(
                name: &str,
                nodes: &Map<String, Value>,
                active: &mut BTreeSet<String>,
                done: &mut BTreeSet<String>,
            ) -> Result<()> {
                if done.contains(name) {
                    return Ok(());
                }
                if !active.insert(name.into()) {
                    return unsupported(
                        &format!("$.nodes.{name}.childRules"),
                        "required child cycle",
                    );
                }
                for (child, rule) in nodes[name]["childRules"].as_object().into_iter().flatten() {
                    if rule["min"].as_u64().unwrap_or(0) > 0 {
                        let target = if nodes[child]["shape"] == "grid" {
                            nodes[nodes[nodes[child]["children"][0].as_str().unwrap()]["children"]
                                [0]
                            .as_str()
                            .unwrap()]["children"][0]
                                .as_str()
                                .unwrap()
                        } else {
                            child
                        };
                        if nodes[target]["shape"] == "flow" {
                            visit(target, nodes, active, done)?;
                        }
                    }
                }
                active.remove(name);
                done.insert(name.into());
                Ok(())
            }
            let mut done = BTreeSet::new();
            for name in nodes.keys() {
                visit(name, nodes, &mut BTreeSet::new(), &mut done)?;
            }
        }
        let mut identity_manifest = manifest.clone();
        if !graphic {
            identity_manifest
                .as_object_mut()
                .unwrap()
                .shift_remove("domain");
        }
        let base_identity = json_identity(&identity_manifest)?;
        let identity = match schema_format {
            Some(format @ (SHARED_FORMAT | PAYLOAD_FORMAT)) => json_identity(
                &json!({"format":format,"manifest":identity_manifest,"referenceGroups":reference_groups}),
            )?,
            Some(ALIAS_FORMAT) => json_identity(
                &json!({"format":ALIAS_FORMAT,"manifest":identity_manifest,"defaultReferences":default_references}),
            )?,
            _ => base_identity.clone(),
        };
        let descriptor = match schema_format {
            Some(format @ (SHARED_FORMAT | PAYLOAD_FORMAT)) => {
                json!({"format":format,"manifest":manifest,"referenceGroups":reference_groups})
            }
            Some(ALIAS_FORMAT) => {
                json!({"format":ALIAS_FORMAT,"manifest":manifest,"defaultReferences":default_references})
            }
            _ => manifest.clone(),
        };
        let mut default_aliases: BTreeMap<Vec<String>, BTreeSet<usize>> = BTreeMap::new();
        for edge in default_references {
            default_aliases
                .entry(edge.at)
                .or_default()
                .insert(edge.enum_index);
        }
        let mut effective_manifest = payload_graph.clone().unwrap_or_else(|| manifest.clone());
        for group in reference_groups.iter().filter(|_| payload_graph.is_none()) {
            let payload = group.representative.payload(&manifest)?.clone();
            for slot in &group.slots {
                let mut spec = &mut effective_manifest;
                for key in &slot.at {
                    spec = spec.get_mut(key).ok_or("shared slot disappeared")?;
                }
                if let Some(index) = slot.index {
                    spec["values"][index] = payload.clone();
                } else {
                    spec["default"] = payload.clone();
                }
            }
        }
        Ok(Self {
            manifest,
            effective_manifest,
            identity,
            base_identity,
            graphic,
            descriptor,
            default_aliases,
            shared_slots,
            shared_groups,
        })
    }
    pub fn compile_with_payload_references(
        manifest: Value, groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile(json!({"format":PAYLOAD_FORMAT,"manifest":manifest,"referenceGroups":groups.into_iter().collect::<Vec<_>>()}))
    }
    pub(crate) fn payload_references_enabled(&self) -> bool { self.descriptor["format"] == PAYLOAD_FORMAT }
    pub fn compile_with_reference_groups(
        manifest: Value,
        groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile(
            json!({"format":SHARED_FORMAT,"manifest":manifest,"referenceGroups":groups.into_iter().collect::<Vec<_>>()}),
        )
    }
    pub fn with_reference_groups(
        self,
        groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile_with_reference_groups(self.manifest, groups)
    }
    pub fn compile_with_default_references(
        manifest: Value,
        references: impl IntoIterator<Item = DefaultReference>,
    ) -> Result<Self> {
        Self::compile(
            json!({"format":ALIAS_FORMAT,"manifest":manifest,"defaultReferences":references.into_iter().collect::<Vec<_>>()}),
        )
    }
    pub fn with_default_references(
        self,
        references: impl IntoIterator<Item = DefaultReference>,
    ) -> Result<Self> {
        Self::compile_with_default_references(self.manifest, references)
    }
    /// Wire schema, retaining explicit identity edges. Legacy schemas remain bare.
    pub fn descriptor(&self) -> &Value {
        &self.descriptor
    }
    pub fn dto(&self) -> &Value {
        self.descriptor()
    }
    pub(crate) fn default_alias(&self, at: &[String], index: usize) -> bool {
        self.default_aliases
            .get(at)
            .is_some_and(|indexes| indexes.contains(&index))
    }
    pub(crate) fn default_has_alias(&self, at: &[String]) -> bool {
        self.default_aliases.contains_key(at)
    }
    pub fn validate_attribute(&self, name: &str, key: &str, value: &Value) -> Result<()> {
        validate_attribute(&self.manifest, name, key, value)
    }
    pub fn validate_mark_value(&self, key: &str, value: &Value) -> Result<()> {
        validate_mark_value(&self.manifest, key, value)
    }
    /// Raw manifest hash, matching TypeScript schemaVersion without alias edges.
    pub fn base_identity(&self) -> &str {
        &self.base_identity
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
    pub fn manifest(&self) -> &Value {
        &self.manifest
    }
    /// Compiled projection rules after explicit shared slots use their group's
    /// representative payload. The raw descriptor and identity remain intact.
    pub fn effective_manifest(&self) -> &Value {
        &self.effective_manifest
    }
    pub fn is_graphic(&self) -> bool {
        self.graphic
    }
    pub fn is_nested_document(&self) -> bool {
        let mut reachable = BTreeSet::new();
        let mut pending = vec![self.manifest["root"].as_str().unwrap()];
        while let Some(name) = pending.pop() {
            if reachable.insert(name) {
                if let Some(children) = self.manifest["nodes"][name]["children"].as_array() {
                    pending.extend(children.iter().filter_map(Value::as_str));
                }
            }
        }
        !self.graphic
            && (self.manifest["markValues"]
                .as_object()
                .is_some_and(|m| !m.is_empty())
                || self.manifest["nodes"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .any(|(name, node)| {
                        reachable.contains(name.as_str())
                            && (node.get("childRules").is_some()
                                || node["attrs"]
                                    .as_object()
                                    .is_some_and(|a| a.values().any(|s| s.get("fields").is_some()))
                                || name != self.manifest["root"].as_str().unwrap()
                                    && matches!(
                                        node["shape"].as_str(),
                                        Some("flow" | "grid" | "group" | "inline" | "span")
                                    ))
                    }))
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    format: String,
    schema: String,
    manifest: Value,
    clock: u64,
    #[serde(default, rename = "reservedClock", skip_serializing_if = "Option::is_none")]
    reserved_clock: Option<u64>,
    ops: Vec<Value>,
}
impl Replica {
    pub(super) fn root_type(&self) -> &str {
        self.runtime
            .as_ref()
            .map(|s| s.manifest["root"].as_str().unwrap())
            .unwrap_or(if self.graphic { "canvas" } else { "content" })
    }
    pub(super) fn default_text_type(&self) -> &str {
        self.runtime
            .as_ref()
            .filter(|s| !s.graphic)
            .map(|s| {
                s.manifest["nodes"][&s.manifest["root"].as_str().unwrap()]["default"]
                    .as_str()
                    .unwrap()
            })
            .unwrap_or("paragraph")
    }
    pub(super) fn is_text_type(&self, name: &str) -> bool {
        self.runtime
            .as_ref()
            .map(|s| {
                s.manifest["nodes"][name]["shape"] == "text"
                    && (self.nested.is_some()
                        || s.manifest["nodes"][self.root_type()]["children"]
                            .as_array()
                            .is_some_and(|children| children.iter().any(|child| child == name)))
            })
            .unwrap_or_else(|| general::text_type(name))
    }
    /// Raw text admission follows the ordered schema, not the current marker.
    pub(super) fn runtime_accepts_text(&self, flow: &str) -> bool {
        let Some(schema) = &self.runtime else { return true; };
        let nodes = &schema.manifest()["nodes"];
        nodes[flow]["children"].as_array().is_some_and(|children| {
            children.iter().filter_map(Value::as_str).any(|kind| {
                if nodes[flow]["shape"] == "flow" && nodes[kind]["shape"] == "group" {
                    nodes[kind]["children"].as_array().is_some_and(|members| {
                        members.iter().filter_map(Value::as_str).any(|member| {
                            nodes[member]["shape"] == "text" && nodes[member]["text"] != false
                        })
                    })
                } else {
                    nodes[kind]["shape"] == "text" && nodes[kind]["text"] != false
                }
            })
        })
    }
    pub(super) fn is_atom_type(&self, name: &str) -> bool {
        self.runtime
            .as_ref()
            .map(|s| {
                s.manifest["nodes"][name]["shape"] == "atom"
                    && (self.nested.is_some()
                        || s.manifest["nodes"][self.root_type()]["children"]
                            .as_array()
                            .is_some_and(|children| children.iter().any(|child| child == name)))
            })
            .unwrap_or_else(|| general::atom_type(name))
    }
    pub(super) fn validate_runtime_mark(&self, key: &str) -> Result<()> {
        if let Some(s) = &self.runtime {
            if s.manifest["marks"]
                .as_array()
                .unwrap()
                .iter()
                .any(|k| k == key)
                || s.manifest["markValues"].get(key).is_some()
            {
                Ok(())
            } else {
                Err(format!("unsupported runtime mark {key}"))
            }
        } else {
            validate_mark(key)
        }
    }
    pub(super) fn validate_birth_marks(&self, marks: &BTreeMap<String, Value>) -> Result<()> {
        if self.runtime.is_none() {
            return validate_marks(marks);
        }
        for (k, v) in marks {
            self.validate_mark_value(k, v)?;
        }
        Ok(())
    }
    pub(super) fn validate_mark_value(&self, key: &str, value: &Value) -> Result<()> {
        self.validate_runtime_mark(key)?;
        if self.reference_admits(&["markValues", key], value) {
            return Ok(());
        }
        if let Some(_spec) = self
            .runtime
            .as_ref()
            .and_then(|s| s.manifest["markValues"].get(key))
        {
            return self
                .runtime
                .as_ref()
                .unwrap()
                .validate_mark_value(key, value);
        }
        if value.is_null() || value.is_boolean() {
            Ok(())
        } else {
            Err("invalid boolean mark value".into())
        }
    }
    pub(super) fn validate_node_attr(&self, name: &str, key: &str, v: &Value) -> Result<()> {
        if self.reference_admits(&["nodes", name, "attrs", key], v) {
            return Ok(());
        }
        if let Some(s) = &self.runtime {
            s.validate_attribute(name, key, v)
        } else {
            general::validate_attr(name, key, v)
        }
    }
    pub(super) fn runtime_history_key(&self, key: &str) -> bool {
        self.runtime
            .as_ref()
            .map(|s| {
                key == "$type"
                    || fields::decode(key).is_some()
                    || s.manifest["markValues"].get(key).is_some()
                    || key.starts_with("$cell:")
                    || key.starts_with("$span:")
                    || s.manifest["marks"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|k| k == key)
                    || s.manifest["nodes"]
                        .as_object()
                        .unwrap()
                        .values()
                        .any(|n| n["attrs"].get(key).is_some())
            })
            .unwrap_or_else(|| general::history_key(key))
    }
    pub(super) fn new_runtime(actor: String, schema: RuntimeSchema) -> Result<Self> {
        let mut r = Self::new(actor)?;
        if !r
            .actor
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_~-".contains(&b))
        {
            return Err("runtime actor must use ASCII ticket profile".into());
        }
        r.general = true;
        r.paragraphs = true;
        r.graphic = schema.graphic;
        r.movement = schema.graphic || schema.is_nested_document();
        if r.movement {
            r.nested = Some(nested::Storage::new());
        }
        r.runtime = Some(schema);
        if r.nested.is_some() {
            r.refresh_nested()?;
        }
        Ok(r)
    }
    pub(super) fn runtime_snapshot(&self) -> Value {
        json!(Saved {
            format: RUNTIME_FORMAT.into(),
            schema: self.schema().into(),
            manifest: self.runtime.as_ref().unwrap().descriptor().clone(),
            clock: self.clock,
            reserved_clock: self.runtime_reserved_clock,
            ops: self.runtime_ops.clone()
        })
    }
    pub(super) fn restore_runtime(actor: String, value: &Value) -> Result<Self> {
        if value.get("reservedClock").is_some_and(|clock| clock.as_u64().is_none()) {
            return Err("reservedClock must be an exact clock integer".into());
        }
        let saved: Saved = decode(value)?;
        let schema = RuntimeSchema::compile(saved.manifest)?;
        if saved.format != RUNTIME_FORMAT || saved.schema != schema.identity {
            return Err("runtime snapshot schema mismatch".into());
        }
        let mut r = Self::new_runtime(actor, schema)?;
        for op in &saved.ops {
            r.apply(op)?;
        }
        let clock_valid = match saved.reserved_clock {
            None => saved.clock == r.clock,
            Some(reserved) => reserved == saved.clock && r.clock < reserved && reserved <= MAX,
        };
        if !clock_valid || r.runtime_ops != saved.ops {
            return Err("noncanonical runtime snapshot journal or clock".into());
        }
        // An explicit reservation marks the canonical clock gap above the journal.
        // This metadata is a shape invariant, not an authenticity proof.
        r.clock = saved.clock;
        r.runtime_reserved_clock = saved.reserved_clock;
        Ok(r)
    }
}
