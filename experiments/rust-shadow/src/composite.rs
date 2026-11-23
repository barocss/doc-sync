//! Explicit symbolic identity at native admission; stored values stay plain JSON.
use super::*;
use runtime_schema::{ReferenceSlot, RuntimeSchema, ValuePathSegment, REFERENCE_FORMAT};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Reference {
    schema: String,
    at: Vec<String>,
    source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    index: Option<usize>,
    #[serde(default, rename = "valuePath", skip_serializing_if = "Vec::is_empty")]
    value_path: Vec<ValuePathSegment>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Binding {
    path: Vec<String>,
    schema: String,
    at: Vec<String>,
    source: String,
    #[serde(default)]
    index: Option<usize>,
    #[serde(default, rename = "valuePath")]
    value_path: Vec<ValuePathSegment>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    t: String,
    format: String,
    op: Value,
    references: Vec<Binding>,
}
fn scope(at: &[String]) -> String {
    serde_json::to_string(at).unwrap()
}
// A schema identity ignores object insertion order. Bind an explicit symbolic
// reference by the same canonical JSON rules, without rewriting its raw value.
fn payload_matches(a: &Value, b: &Value) -> bool {
    runtime_schema::canonical_json(a)
        .ok()
        .is_some_and(|a| runtime_schema::canonical_json(b).is_ok_and(|b| a == b))
}
fn spec_at<'a>(schema: &'a RuntimeSchema, at: &[String]) -> Result<&'a Value> {
    runtime_schema::descriptor_at(schema.manifest(), at)
}
impl RuntimeSchema {
    /// A schema-symbolic handle. Equal-manifest replicas share this namespace.
    /// Unlike a raw JSON value, this explicitly selects the schema-owned value.
    pub fn reference_value(&self, at: &[&str], enum_index: Option<usize>) -> Result<Value> {
        let reference = Reference {
            schema: self.identity().into(),
            at: at.iter().map(|s| (*s).into()).collect(),
            source: if enum_index.is_some() {
                "enum"
            } else {
                "default"
            }
            .into(),
            index: enum_index,
            value_path: vec![],
        };
        let value = serde_json::to_value(reference).unwrap();
        self.reference_payload(&value)?;
        Ok(value)
    }
    pub fn reference_value_at(&self, slot: &ReferenceSlot) -> Result<Value> {
        let value = serde_json::to_value(Reference { schema: self.identity().into(), at: slot.at.clone(), source: slot.source.clone(), index: slot.index, value_path: slot.value_path.clone() }).unwrap();
        self.reference_payload(&value)?;
        Ok(value)
    }
    pub fn is_default_reference(&self, reference: &Value) -> Result<bool> {
        let source: Reference = decode(reference)?;
        let at = source.at.iter().map(String::as_str).collect::<Vec<_>>();
        self.is_default_reference_at(reference, &at)
    }
    /// Check source identity at the actual target descriptor. Raw equality does
    /// not grant cross-descriptor admission, including for unconstrained copies.
    pub fn accepts_reference_at(&self, reference: &Value, at: &[&str]) -> Result<()> {
        self.reference_payload(reference)?;
        let source: Reference = decode(reference)?;
        let target = at.iter().map(|s| (*s).into()).collect::<Vec<String>>();
        spec_at(self, &target)?;
        if runtime_schema::field_descriptor_path(&target) {
            return Err("field targets use deep-value admission".into());
        }
        let slot = ReferenceSlot {
            at: source.at.clone(),
            source: source.source,
            index: source.index,
            value_path: source.value_path.clone(),
        };
        if source.at == target && source.value_path.is_empty()
            || self.shared_slots.get(&slot).is_some_and(|id| {
                target.last().is_some_and(|key| {
                    self.shared_groups[*id]
                        .targets
                        .get(key)
                        .is_some_and(|paths| paths.contains(&target))
                })
            })
        {
            Ok(())
        } else {
            Err("runtime reference target lacks declared shared identity".into())
        }
    }
    pub fn is_default_reference_at(&self, reference: &Value, at: &[&str]) -> Result<bool> {
        self.accepts_reference_at(reference, at)?;
        let source: Reference = decode(reference)?;
        let target = at.iter().map(|s| (*s).into()).collect::<Vec<String>>();
        let slot = ReferenceSlot {
            at: source.at.clone(),
            source: source.source.clone(),
            index: source.index,
            value_path: source.value_path.clone(),
        };
        let default = ReferenceSlot {
            at: target.clone(),
            source: "default".into(),
            index: None,
            value_path: vec![],
        };
        Ok(slot == default
            || self
                .shared_slots
                .get(&slot)
                .zip(self.shared_slots.get(&default))
                .is_some_and(|(a, b)| a == b)
            || source.value_path.is_empty() && source.at == target
                && source.source == "enum"
                && source.index.is_some_and(|i| self.default_alias(&target, i)))
    }
    fn reference_target_paths(
        &self,
        reference: &Value,
        key: &str,
    ) -> Result<BTreeSet<Vec<String>>> {
        self.reference_payload(reference)?;
        let source: Reference = decode(reference)?;
        let slot = ReferenceSlot {
            at: source.at.clone(),
            source: source.source,
            index: source.index,
            value_path: source.value_path.clone(),
        };
        let attribute = key
            .strip_prefix("$cell:")
            .and_then(|s| s.split_once('|').map(|(_, k)| k))
            .unwrap_or(key);
        let mut paths = self
            .shared_slots
            .get(&slot)
            .and_then(|id| self.shared_groups[*id].targets.get(attribute))
            .cloned()
            .unwrap_or_default();
        if source.value_path.is_empty() && !runtime_schema::field_descriptor_path(&source.at) && source.at.last().map(String::as_str) == Some(attribute) {
            paths.insert(source.at);
        }
        Ok(paths)
    }
    pub fn reference_payload(&self, reference: &Value) -> Result<Value> {
        let reference: Reference = decode(reference)?;
        if reference.schema != self.identity() {
            return Err("runtime reference schema mismatch".into());
        }
        if runtime_schema::field_descriptor_path(&reference.at) && !self.payload_references_enabled() {
            return Err("field descriptor references require payload-v3".into());
        }
        let spec = spec_at(self, &reference.at)?;
        if runtime_schema::field_descriptor_path(&reference.at) {
            let root = ReferenceSlot { at: reference.at.clone(), source: reference.source.clone(), index: reference.index, value_path: vec![] };
            // Leaves use deep enum membership and preserve array/record types.
            // A payload descendant cannot bypass its source leaf's rule.
            if !runtime_schema::value_ok(spec, root.payload(self.manifest())?) {
                return Err("runtime field reference violates leaf constraints".into());
            }
        }
        if !reference.value_path.is_empty() && !self.payload_references_enabled() {
            return Err("valuePath requires payload-v3".into());
        }
        if self.payload_references_enabled() {
            let slot = ReferenceSlot { at: reference.at.clone(), source: reference.source.clone(), index: reference.index, value_path: reference.value_path.clone() };
            let raw = slot.payload(self.manifest())?;
            if !reference.value_path.is_empty() && !(raw.is_object() || raw.is_array()) { return Err("nested runtime reference must be composite".into()); }
            if let Some(class) = self.shared_slots.get(&slot) {
                if slot.value_path.is_empty() && slot.source == "default" && !runtime_schema::field_descriptor_path(&slot.at) && spec.get("values").is_some() && !self.default_has_alias(&slot.at) {
                    return Err("runtime default reference lacks enum alias".into());
                }
                return Ok(self.shared_groups[*class].representative.payload(self.effective_manifest())?.clone());
            }
        }
        let payload = match (reference.source.as_str(), reference.index) {
            ("default", None) => &spec["default"],
            ("enum", Some(index)) => {
                let choice = spec["values"]
                    .as_array()
                    .and_then(|a| a.get(index))
                    .ok_or("runtime reference enum index out of range")?;
                // One aliased JavaScript object has one insertion order. Keep
                // the selected enum index in the handle, but use its default's
                // payload order exactly as explicit schema rehydration does.
                if self.default_alias(&reference.at, index) {
                    &spec["default"]
                } else {
                    choice
                }
            }
            _ => return Err("invalid runtime reference source".into()),
        };
        if reference.source == "default"
            && !runtime_schema::field_descriptor_path(&reference.at)
            && (payload.is_object() || payload.is_array())
            && spec.get("values").is_some()
            && !self.default_has_alias(&reference.at)
        {
            return Err("runtime default reference lacks enum alias".into());
        }
        let mut without_enum = spec.clone();
        without_enum.as_object_mut().unwrap().shift_remove("values");
        let valid = if runtime_schema::field_descriptor_path(&reference.at) {
            runtime_schema::value_ok(&without_enum, payload)
        } else { runtime_schema::atomic_value_ok(&without_enum, payload) };
        if !valid {
            return Err("runtime reference violates attribute type or constraints".into());
        }
        let slot = ReferenceSlot {
            at: reference.at,
            source: reference.source,
            index: reference.index,
            value_path: reference.value_path,
        };
        Ok(self
            .shared_slots
            .get(&slot)
            .and_then(|id| self.shared_groups[*id].payload.as_ref())
            .unwrap_or(payload)
            .clone())
    }
    pub fn reference_operation(
        &self,
        op: Value,
        references: Vec<(Vec<String>, Value)>,
    ) -> Result<Value> {
        let references = references
            .into_iter()
            .map(|(path, mut reference)| {
                reference
                    .as_object_mut()
                    .ok_or("runtime reference must be object")?
                    .insert("path".into(), json!(path));
                Ok(reference)
            })
            .collect::<Result<Vec<_>>>()?;
        let envelope =
            json!({"t":"reference","format":REFERENCE_FORMAT,"op":op,"references":references});
        self.decode_reference_operation(&envelope)?;
        Ok(envelope)
    }
    fn decode_reference_operation(
        &self,
        value: &Value,
    ) -> Result<(Value, Vec<(String, String, Value)>)> {
        let saved: Envelope = decode(value)?;
        if saved.t != "reference"
            || saved.format != REFERENCE_FORMAT
            || saved.references.is_empty()
            || saved.op["t"] == "reference"
        {
            return Err("invalid runtime reference envelope".into());
        }
        let mut seen = BTreeSet::new();
        let mut refs = vec![];
        for binding in saved.references {
            if !seen.insert(binding.path.clone()) {
                return Err("duplicate runtime reference path".into());
            }
            let (key, target) = match (saved.op["t"].as_str(), binding.path.as_slice()) {
                (Some("text"), [marks, key]) if marks == "marks" => {
                    (key.clone(), Some(vec!["markValues".into(), key.clone()]))
                }
                (Some("node"), [attrs, key]) if attrs == "attrs" => (
                    key.clone(),
                    Some(vec![
                        "nodes".into(),
                        saved.op["type"].as_str().unwrap_or("").into(),
                        "attrs".into(),
                        key.clone(),
                    ]),
                ),
                (Some("set"), [value]) if value == "value" => (
                    saved.op["key"]
                        .as_str()
                        .ok_or("runtime reference set key required")?
                        .into(),
                    None,
                ),
                _ => return Err("runtime reference path does not bind an operation value".into()),
            };
            let reference = serde_json::to_value(Reference {
                schema: binding.schema,
                at: binding.at,
                source: binding.source,
                index: binding.index,
                value_path: binding.value_path,
            })
            .unwrap();
            let payload = self.reference_payload(&reference)?;
            let mut actual = &saved.op;
            for key in &binding.path {
                actual = actual.get(key).ok_or("runtime reference payload missing")?;
            }
            // This binds the explicit reference to its exact payload. It does not
            // grant identity to any other equal JSON value.
            if !payload_matches(actual, &payload) {
                return Err("runtime reference payload mismatch".into());
            }
            let targets = if let Some(at) = target {
                self.accepts_reference_at(
                    &reference,
                    &at.iter().map(String::as_str).collect::<Vec<_>>(),
                )?;
                BTreeSet::from([at])
            } else {
                let targets = self.reference_target_paths(&reference, &key)?;
                if targets.is_empty() {
                    return Err("runtime reference set attribute mismatch".into());
                }
                targets
            };
            for at in targets {
                refs.push((scope(&at), key.clone(), reference.clone()));
            }
        }
        Ok((saved.op, refs))
    }
}
pub(super) fn operation_body(value: &Value) -> &Value {
    if value["t"] == "reference" {
        &value["op"]
    } else {
        value
    }
}
impl Replica {
    pub(super) fn reference_admits(&self, at: &[&str], value: &Value) -> bool {
        let at = at.iter().map(|s| (*s).into()).collect::<Vec<String>>();
        self.runtime_references
            .get(&scope(&at))
            .is_some_and(|reference| {
                self.runtime.as_ref().is_some_and(|schema| {
                    schema
                        .reference_payload(reference)
                        .is_ok_and(|v| payload_matches(&v, value))
                })
            })
    }
    pub(super) fn apply_reference(&mut self, value: &Value) -> Result<()> {
        let (op, references) = self
            .runtime
            .as_ref()
            .ok_or("runtime schema required for reference operation")?
            .decode_reference_operation(value)?;
        if op["t"] == "set" {
            let ids: Vec<Ticket> = decode(&op["ids"])?;
            for id in &ids {
                if let Some(i) = self.index(id) {
                    if !references.iter().any(|(target, key, _)| {
                        let at: Vec<String> = serde_json::from_str(target).unwrap();
                        self.reference_target_matches(&self.items[i], key, &at)
                    }) {
                        return Err("runtime reference target mismatch".into());
                    }
                }
            }
        }
        self.runtime_references = references
            .iter()
            .map(|(scope, _, r)| (scope.clone(), r.clone()))
            .collect();
        let result = self.apply_inner(&op);
        self.runtime_references.clear();
        result?;
        let ticket: Ticket = decode(if op["t"] == "set" {
            &op["at"]
        } else {
            &op["id"]
        })?;
        let count = if op["t"] == "text" {
            op["units"].as_array().map(Vec::len).unwrap_or(0)
        } else {
            1
        };
        for offset in 0..count {
            let writer = Ticket {
                lamport: ticket.lamport + offset as u64,
                actor: ticket.actor.clone(),
            }
            .key();
            for (_, key, reference) in &references {
                let slot = (writer.clone(), key.clone());
                if self
                    .runtime_reference_writers
                    .get(&slot)
                    .is_some_and(|old| old != reference)
                {
                    return Err("conflicting runtime reference writer".into());
                }
                self.runtime_reference_writers
                    .insert(slot, reference.clone());
            }
        }
        Ok(())
    }
    pub(super) fn history_reference_op(
        &self,
        op: Value,
        writer: Option<&Ticket>,
        key: &str,
    ) -> Result<Value> {
        let reference =
            writer.and_then(|at| self.runtime_reference_writers.get(&(at.key(), key.into())));
        match (self.runtime.as_ref(), reference) {
            (Some(schema), Some(reference)) => {
                schema.reference_operation(op, vec![(vec!["value".into()], reference.clone())])
            }
            _ => Ok(op),
        }
    }
    pub(super) fn validate_history_set(
        &self,
        token: &Token,
        key: &str,
        value: &Value,
        writer: Option<&Ticket>,
    ) -> Result<()> {
        if self.validate_set(token, key, value).is_ok() {
            return Ok(());
        }
        let reference = writer
            .and_then(|at| self.runtime_reference_writers.get(&(at.key(), key.into())))
            .ok_or("history value lacks schema reference provenance")?;
        let valid = self.runtime.as_ref().is_some_and(|schema| {
            schema
                .reference_payload(reference)
                .is_ok_and(|v| payload_matches(&v, value))
        });
        if !valid {
            return Err("invalid history reference payload".into());
        }
        if self.runtime.as_ref().is_some_and(|schema| {
            schema
                .reference_target_paths(reference, key)
                .is_ok_and(|paths| {
                    paths
                        .iter()
                        .any(|at| self.reference_target_matches(token, key, at))
                })
        }) {
            return Ok(());
        }
        Err("history reference target mismatch".into())
    }
    fn reference_target_matches(&self, token: &Token, key: &str, at: &[String]) -> bool {
        if token.unit.is_some() {
            return at.len() == 2 && at[0] == "markValues" && at[1] == key;
        }
        let Some(schema) = self.runtime.as_ref().map(RuntimeSchema::manifest) else {
            return false;
        };
        if at.len() != 4 || at[0] != "nodes" || at[2] != "attrs" {
            return false;
        }
        let born = token
            .node
            .as_ref()
            .map(|n| n.born.as_str())
            .unwrap_or_else(|| self.default_text_type());
        if let Some((_, attribute)) = key.strip_prefix("$cell:").and_then(|s| s.split_once('|')) {
            let row = schema["nodes"][born]["children"][0].as_str().unwrap_or("");
            let cell = schema["nodes"][row]["children"][0].as_str().unwrap_or("");
            return schema["nodes"][born]["shape"] == "grid" && at[1] == cell && at[3] == attribute;
        }
        at[3] == key && schema["nodes"][born]["shape"] == schema["nodes"][&at[1]]["shape"]
    }
}
