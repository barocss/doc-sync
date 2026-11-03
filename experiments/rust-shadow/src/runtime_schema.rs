//! Owned, validated JSON schemas. The supported native subset is explicit and
//! checked before storage is created. No callbacks or executable schema data.
use super::*;
use sha2::{Digest, Sha256};
pub const RUNTIME_FORMAT: &str = "doc-sync-runtime-schema-native-v1";
#[derive(Clone, Debug)]
pub struct RuntimeSchema {
    manifest: Value,
    identity: String,
    graphic: bool,
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
fn attr(spec: &Value, path: &str, structured: bool) -> Result<()> {
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
            "computed attributes are unavailable",
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
        keys(spec, &["default", "fields", "inherit"], path)?;
        let fields = fs
            .as_object()
            .ok_or_else(|| format!("UnsupportedSchema at {path}.fields: object required"))?;
        let defaults = spec["default"]
            .as_object()
            .ok_or_else(|| format!("UnsupportedSchema at {path}.default: object required"))?;
        if fields.is_empty() || fields.len() != defaults.len() {
            return unsupported(path, "field defaults must have exactly the declared keys");
        }
        for (name, spec) in fields {
            if !safe_name(name) {
                return unsupported(path, "invalid field name");
            }
            attr(spec, &format!("{path}.fields.{name}"), false)?;
            if defaults.get(name) != spec.get("default") {
                return unsupported(path, "field default differs from object default");
            }
        }
        return Ok(());
    }
    let default = &spec["default"];
    if !default.is_null() && !default.is_string() && !default.is_boolean() && !default.is_number() {
        return unsupported(&format!("{path}.default"), "only scalar defaults supported");
    }
    if let Some(values) = spec.get("values") {
        if values.as_array().is_none_or(|a| {
            a.is_empty()
                || a.iter()
                    .any(|v| v.is_null() || !(v.is_boolean() || v.is_number() || v.is_string()))
        }) {
            return unsupported(&format!("{path}.values"), "nonempty scalar list required");
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
    if !value_ok(spec, default) {
        return unsupported(&format!("{path}.default"), "default violates constraints");
    }
    Ok(())
}
fn pattern_supported(p: &str) -> bool {
    p == "^#[0-9a-fA-F]{6}$"
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
pub(crate) fn value_ok(spec: &Value, v: &Value) -> bool {
    if !general::attr_ok(spec, v) {
        return false;
    }
    if v.is_null() {
        return true;
    }
    let Some(p) = spec["pattern"].as_str() else {
        return true;
    };
    let Some(s) = v.as_str() else {
        return false;
    };
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
impl RuntimeSchema {
    pub fn compile(manifest: Value) -> Result<Self> {
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
            if m.as_object().is_none_or(|o| !o.is_empty()) {
                return unsupported("$.markValues", "value marks are unavailable");
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
                    "shape", "children", "attrs", "ui", "default", "next", "text",
                ],
                &path,
            )?;
            let shape = node["shape"]
                .as_str()
                .ok_or_else(|| format!("UnsupportedSchema at {path}.shape: string required"))?;
            if !(matches!(shape, "atom" | "text")
                || graphic && shape == "container"
                || !graphic && name == root && shape == "flow")
            {
                return unsupported(
                    &format!("{path}.shape"),
                    "supported: Graphic container/text/atom; Document flat root flow/text/atom",
                );
            }
            if shape != "flow" && node.get("default").is_some() {
                return unsupported(&format!("{path}.default"), "only flow declares default");
            }
            if shape != "text" && (node.get("text").is_some() || node.get("next").is_some()) {
                return unsupported(&path, "text and next require text shape");
            }
            if node.get("text").is_some_and(|v| v != true) {
                return unsupported(&format!("{path}.text"), "text=false is unavailable");
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
            if shape == "container" || shape == "flow" {
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
            } else if children.is_some_and(|a| !a.is_empty()) {
                return unsupported(&format!("{path}.children"), "inline children unavailable");
            }
            if shape == "flow" {
                let d = node["default"]
                    .as_str()
                    .ok_or("UnsupportedSchema: flow default required")?;
                if manifest["nodes"][d]["shape"] != "text"
                    || !children.unwrap().iter().any(|c| c == d)
                {
                    return unsupported(
                        &format!("{path}.default"),
                        "default must name a child text type",
                    );
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
                            "invalid attribute name",
                        );
                    }
                    attr(
                        spec,
                        &format!("{path}.attrs.{key}"),
                        graphic && name != root,
                    )?;
                }
            }
        }
        // Every Document stored type belongs to the single flow.
        if !graphic {
            for name in nodes.keys().filter(|n| n.as_str() != root) {
                if !nodes[root]["children"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|c| c == name)
                {
                    return unsupported(
                        &format!("$.nodes.{root}.children"),
                        "all stored types must belong to the flat flow",
                    );
                }
            }
        }
        let mut identity_manifest = manifest.clone();
        if !graphic {
            identity_manifest
                .as_object_mut()
                .unwrap()
                .shift_remove("domain");
        }
        let identity = json_identity(&identity_manifest)?;
        Ok(Self {
            manifest,
            identity,
            graphic,
        })
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
    pub fn manifest(&self) -> &Value {
        &self.manifest
    }
    pub fn is_graphic(&self) -> bool {
        self.graphic
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    format: String,
    schema: String,
    manifest: Value,
    clock: u64,
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
            .map(|s| s.manifest["nodes"][name]["shape"] == "text")
            .unwrap_or_else(|| general::text_type(name))
    }
    pub(super) fn is_atom_type(&self, name: &str) -> bool {
        self.runtime
            .as_ref()
            .map(|s| s.manifest["nodes"][name]["shape"] == "atom")
            .unwrap_or_else(|| general::atom_type(name))
    }
    pub(super) fn validate_runtime_mark(&self, key: &str) -> Result<()> {
        if let Some(s) = &self.runtime {
            if s.manifest["marks"]
                .as_array()
                .unwrap()
                .iter()
                .any(|k| k == key)
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
            self.validate_runtime_mark(k)?;
            if !v.is_boolean() {
                return Err("invalid boolean birth mark".into());
            }
        }
        Ok(())
    }
    pub(super) fn validate_node_attr(&self, name: &str, key: &str, v: &Value) -> Result<()> {
        if let Some(s) = &self.runtime {
            let spec = &s.manifest["nodes"][name]["attrs"][key];
            if !spec.is_null() && value_ok(spec, v) {
                Ok(())
            } else {
                Err(format!("invalid runtime attribute {name}.{key}"))
            }
        } else {
            general::validate_attr(name, key, v)
        }
    }
    pub(super) fn runtime_history_key(&self, key: &str) -> bool {
        self.runtime
            .as_ref()
            .map(|s| {
                key == "$type"
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
        r.movement = schema.graphic;
        if r.graphic {
            r.nested = Some(nested::Storage::new());
        }
        r.runtime = Some(schema);
        Ok(r)
    }
    pub(super) fn runtime_snapshot(&self) -> Value {
        json!(Saved {
            format: RUNTIME_FORMAT.into(),
            schema: self.schema().into(),
            manifest: self.manifest(),
            clock: self.clock,
            ops: self.runtime_ops.clone()
        })
    }
    pub(super) fn restore_runtime(actor: String, value: &Value) -> Result<Self> {
        let saved: Saved = decode(value)?;
        let schema = RuntimeSchema::compile(saved.manifest)?;
        if saved.format != RUNTIME_FORMAT || saved.schema != schema.identity {
            return Err("runtime snapshot schema mismatch".into());
        }
        let mut r = Self::new_runtime(actor, schema)?;
        for op in &saved.ops {
            r.apply(op)?;
        }
        if r.clock != saved.clock || r.runtime_ops != saved.ops {
            return Err("noncanonical runtime snapshot journal or clock".into());
        }
        Ok(r)
    }
}
