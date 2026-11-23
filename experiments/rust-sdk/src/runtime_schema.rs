//! User-defined native Document and Graphic schemas. Document support is the
//! recursive flow/grid/text/atom/group/inline/span subset. Unsupported rules fail
//! during compilation. Authoring addresses physical source heads and token keys.
use crate::{
    Attributes, Change, EditOptions, Error, HistoryStatus, Key, Op, Position, Result, Selection,
    Ticket, Utf16Text,
};
use doc_sync_rust_shadow as engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[path = "runtime_paragraph.rs"]
mod paragraph;
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_DOCUMENT_INCARNATION: AtomicU64 = AtomicU64::new(1);
fn allocate_incarnation() -> Result<u64> {
    allocate_from(&NEXT_DOCUMENT_INCARNATION)
}
fn allocate_from(counter: &AtomicU64) -> Result<u64> {
    counter.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |value| value.checked_add(1))
        .map_err(|_| Error("document incarnation exhausted".into()))
}

pub use paragraph::{ModelInsert, ModelInsertBatchResult, ModelEditBase, ModelRead, FlowTarget, RelativeModelTarget, RelativeModelInsert, GridRowTarget, GridCellTarget, GridModelTarget, GridModelInsert, ColumnBoundary, RowCellPayload, ColumnInsert, ModelCatalogRead, ModelTargetCatalog, StoredModelTarget, GridTargetCatalog, CatalogCell};
/// A JSON value, optionally bound to one value in the compiled schema.
/// References use schema identity and descriptor path. Clones preserve that identity.
#[derive(Debug, Clone, PartialEq)]
pub struct SchemaValue {
    value: Value,
    reference: Option<Value>,
    payload_paths: bool,
}
pub type SchemaAttributes = std::collections::BTreeMap<String, SchemaValue>;
impl From<Value> for SchemaValue {
    fn from(value: Value) -> Self {
        Self {
            value,
            reference: None,
            payload_paths: false,
        }
    }
}
impl SchemaValue {
    pub fn json(value: Value) -> Self {
        value.into()
    }
    pub fn value(&self) -> &Value {
        &self.value
    }
    /// Select a composite child in this schema-owned value. Object keys and
    /// array indices have distinct types. The source path stays in the handle.
    pub fn at_value_path(
        &self,
        path: impl IntoIterator<Item = ValuePathSegment>,
    ) -> Result<Self> {
        let path: Vec<_> = path.into_iter().collect();
        if !path.is_empty() && !self.payload_paths {
            return Err(Error("nested schema references require payload v3".into()));
        }
        let mut value = &self.value;
        for segment in &path {
            value = match segment {
                ValuePathSegment::Key(key) if key != "__proto__" && key != "prototype" && key != "constructor" =>
                    value.as_object().and_then(|object| object.get(key)),
                ValuePathSegment::Index(index) => value.as_array().and_then(|array| array.get(*index)),
                _ => None,
            }.ok_or_else(|| Error("invalid schema value path".into()))?;
        }
        if !value.is_object() && !value.is_array() {
            return Err(Error("schema value reference must select an object or array".into()));
        }
        let mut reference = self.reference.clone().ok_or_else(|| Error("schema-owned value required".into()))?;
        let mut source_path: Vec<ValuePathSegment> = reference.get("valuePath")
            .map(|value| serde_json::from_value(value.clone())).transpose()?.unwrap_or_default();
        source_path.extend(path);
        if source_path.len() > 64 { return Err(Error("schema value path exceeds maximum depth".into())); }
        if !source_path.is_empty() {
            reference["valuePath"] = serde_json::to_value(source_path)?;
        }
        Ok(Self { value: value.clone(), reference: Some(reference), payload_paths: self.payload_paths })
    }
    /// Attach this reference to an existing operation. The path addresses its
    /// raw payload, such as ["value"], ["attrs", "payload"], or ["marks", "paint"].
    /// Validation checks both the path and payload before the document changes.
    pub fn bind(&self, operation: Op, path: &[&str]) -> Result<Op> {
        let Some(reference) = &self.reference else {
            return Ok(operation);
        };
        let mut descriptor = reference.clone();
        descriptor["path"] = json!(path);
        match operation {
            Op::Reference {
                format,
                op,
                mut references,
            } => {
                references.push(descriptor);
                Ok(Op::Reference {
                    format,
                    op,
                    references,
                })
            }
            op => Ok(Op::Reference {
                format: "doc-sync-runtime-reference-op-v1".into(),
                op: Box::new(op),
                references: vec![descriptor],
            }),
        }
    }
}
const MAX_CLOCK: u64 = 9_007_199_254_740_991;
#[derive(Debug, Clone, Serialize)]
#[serde(transparent)]
pub struct RuntimeSchema {
    dto: Value,
    #[serde(skip)]
    manifest: Value,
    #[serde(skip)]
    identity: String,
    #[serde(skip)]
    compiled: engine::runtime_schema::RuntimeSchema,
}
impl PartialEq for RuntimeSchema {
    fn eq(&self, other: &Self) -> bool {
        self.manifest == other.manifest && self.identity == other.identity
    }
}
impl<'de> Deserialize<'de> for RuntimeSchema {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        Self::compile(v).map_err(serde::de::Error::custom)
    }
}
impl RuntimeSchema {
    pub fn compile(dto: Value) -> Result<Self> {
        let compiled =
            engine::runtime_schema::RuntimeSchema::compile(dto.clone()).map_err(Error)?;
        let manifest = compiled.manifest().clone();
        let identity = compiled.identity().to_owned();
        Ok(Self {
            dto,
            manifest,
            identity,
            compiled,
        })
    }
    /// Compile explicit default-to-enum object identities. Equal JSON alone does
    /// not create a reference. Every edge is validated before compilation succeeds.
    pub fn compile_with_default_references(
        manifest: Value,
        references: impl IntoIterator<Item = DefaultReference>,
    ) -> Result<Self> {
        Self::compile(json!({
            "format": "doc-sync-runtime-schema-alias-v1",
            "manifest": manifest,
            "defaultReferences": references.into_iter().collect::<Vec<_>>()
        }))
    }
    /// Compile explicit object identities across defaults and enum entries.
    /// Every group links at least two composite slots. Equal JSON alone does
    /// not link slots. Group members can name different attributes and marks.
    pub fn compile_with_reference_groups(
        manifest: Value,
        groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile(json!({
            "format": "doc-sync-runtime-schema-shared-v2",
            "manifest": manifest,
            "referenceGroups": groups.into_iter().collect::<Vec<_>>()
        }))
    }
    /// Compile explicit identities inside schema-owned default and enum payloads.
    /// Each value path selects an object or array in an atomic schema value.
    pub fn compile_with_payload_references(
        manifest: Value,
        groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile(json!({
            "format": "doc-sync-runtime-schema-payload-v3",
            "manifest": manifest,
            "referenceGroups": groups.into_iter().collect::<Vec<_>>()
        }))
    }
    pub fn with_payload_references(
        self,
        groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile_with_payload_references(self.manifest, groups)
    }
    /// Select a root or nested schema-owned source slot.
    pub fn reference_value_at(&self, slot: &ReferenceSlot) -> Result<SchemaValue> {
        let reference = self.compiled.reference_value_at(slot).map_err(Error)?;
        let value = self.compiled.reference_payload(&reference).map_err(Error)?;
        Ok(SchemaValue { value, reference: Some(reference), payload_paths: self.dto["format"] == "doc-sync-runtime-schema-payload-v3" })
    }
    /// Create a new schema with explicit shared groups. Existing documents keep
    /// their schema. This method does not perform a live schema transition.
    pub fn with_reference_groups(
        self,
        groups: impl IntoIterator<Item = ReferenceGroup>,
    ) -> Result<Self> {
        Self::compile_with_reference_groups(self.manifest, groups)
    }
    /// Return a new schema with explicit default references. Existing documents
    /// keep their schema; this method does not perform a live schema transition.
    pub fn with_default_references(
        self,
        references: impl IntoIterator<Item = DefaultReference>,
    ) -> Result<Self> {
        Self::compile_with_default_references(self.manifest, references)
    }
    /// Return the versioned schema wire value, or the original bare manifest.
    pub fn dto(&self) -> &Value {
        &self.dto
    }
    /// Select a schema-owned default or enum entry. `at` addresses the
    /// descriptor, for example ["nodes", "note", "attrs", "payload"].
    /// None selects its default; Some(index) selects an enum entry.
    pub fn reference_value(&self, at: &[&str], enum_index: Option<usize>) -> Result<SchemaValue> {
        let reference = self
            .compiled
            .reference_value(at, enum_index)
            .map_err(Error)?;
        let value = self.compiled.reference_payload(&reference).map_err(Error)?;
        Ok(SchemaValue {
            value,
            reference: Some(reference),
            payload_paths: self.dto["format"] == "doc-sync-runtime-schema-payload-v3",
        })
    }
    pub fn default_value(&self, kind: &str, attribute: &str) -> Result<SchemaValue> {
        self.reference_value(&["nodes", kind, "attrs", attribute], None)
    }
    pub fn enum_value(&self, kind: &str, attribute: &str, index: usize) -> Result<SchemaValue> {
        self.reference_value(&["nodes", kind, "attrs", attribute], Some(index))
    }
    /// Select a composite default from a declared field leaf. The field path
    /// traverses schema descriptors, independently of payload value paths.
    pub fn field_default_value(&self, kind: &str, attribute: &str, field_path: &[&str]) -> Result<SchemaValue> {
        self.field_reference_value(kind, attribute, field_path, None)
    }
    /// Select a composite enum entry from a declared field leaf.
    pub fn field_enum_value(&self, kind: &str, attribute: &str, field_path: &[&str], index: usize) -> Result<SchemaValue> {
        self.field_reference_value(kind, attribute, field_path, Some(index))
    }
    fn field_reference_value(&self, kind: &str, attribute: &str, field_path: &[&str], index: Option<usize>) -> Result<SchemaValue> {
        if field_path.is_empty() {
            return Err(Error("declared field leaf path required".into()));
        }
        let mut at = vec!["nodes", kind, "attrs", attribute];
        for field in field_path {
            at.extend(["fields", *field]);
        }
        let value = self.reference_value(&at, index)?;
        if !value.value.is_object() && !value.value.is_array() {
            return Err(Error("schema field reference must select an object or array".into()));
        }
        Ok(value)
    }
    /// Raw manifest identity, excluding the explicit alias graph.
    pub fn base_identity(&self) -> &str {
        self.compiled.base_identity()
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
    pub fn manifest(&self) -> &Value {
        &self.manifest
    }
    /// Compiled rules with shared slot payloads resolved to their representative.
    /// The raw manifest and wire DTO remain available through their own accessors.
    pub fn effective_manifest(&self) -> &Value {
        self.compiled.effective_manifest()
    }
    pub fn domain(&self) -> &str {
        self.manifest["domain"].as_str().unwrap_or("document")
    }
}
pub use engine::runtime_schema::{DefaultReference, ReferenceGroup, ReferenceSlot, ValuePathSegment};
/// Coupled native graphic/history checkpoint and exact unacknowledged changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeCheckpoint {
    version: u32,
    actor: String,
    native: Value,
    schema: RuntimeSchema,
    pending: Vec<Change>,
}
impl RuntimeCheckpoint {
    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string(self)?)
    }
    pub fn from_json(input: &str) -> Result<Self> {
        let checkpoint = serde_json::from_str(input)?;
        RuntimeDocument::restore(&checkpoint)?;
        Ok(checkpoint)
    }
}
pub struct RuntimeDocument {
    incarnation: u64,
    revision: u64,
    server: engine::Server,
    actor: String,
    schema: RuntimeSchema,
    pending: Vec<Change>,
}
impl RuntimeDocument {
    pub fn new(actor: impl Into<String>, schema: RuntimeSchema) -> Result<Self> {
        let mut doc = Self {
            incarnation: allocate_incarnation()?,
            revision: 0,
            server: engine::Server::default(),
            actor: actor.into(),
            schema,
            pending: vec![],
        };
        doc.call(
            "new",
            json!({"actor":doc.actor,"runtimeSchema":doc.schema.dto()}),
        )?;
        Ok(doc)
    }
    pub fn schema(&self) -> &RuntimeSchema {
        &self.schema
    }
    pub fn active_schema_identity(&self) -> &str {
        self.schema.identity()
    }
    pub fn actor(&self) -> &str {
        &self.actor
    }
    fn call(&mut self, command: &str, extra: Value) -> Result<Value> {
        let mut request =
            json!({"cmd":command,"replica":"graphic","schema":self.schema.identity()});
        for (key, value) in extra.as_object().expect("internal object") {
            request[key] = value.clone();
        }
        let response = self.server.request(request);
        if response["ok"] != true {
            return Err(Error(
                response["error"]
                    .as_str()
                    .unwrap_or("native graphic failure")
                    .into(),
            ));
        }
        Ok(response)
    }
    pub fn model(&mut self) -> Result<Value> {
        Ok(self.call("state", json!({}))?["state"]["model"].clone())
    }
    pub fn state(&mut self) -> Result<Value> {
        Ok(self.call("state", json!({}))?["state"].clone())
    }
    pub fn observed_clock(&mut self) -> Result<u64> {
        self.call("state", json!({}))?["state"]["clock"]
            .as_u64()
            .ok_or_else(|| Error("invalid graphic clock".into()))
    }
    pub fn next_ticket(&mut self) -> Result<Ticket> {
        let n = self
            .observed_clock()?
            .checked_add(1)
            .filter(|n| *n <= MAX_CLOCK)
            .ok_or_else(|| Error("clock exhausted".into()))?;
        Ok(Ticket {
            lamport: n,
            actor: self.actor.clone(),
        })
    }
    pub fn apply_remote(&mut self, ops: &[Op]) -> Result<()> {
        let revision = self.next_revision()?;
        self.call("apply", json!({"ops":ops}))?;
        self.revision = revision;
        Ok(())
    }
    fn next_revision(&self) -> Result<u64> {
        self.revision.checked_add(1).ok_or_else(|| Error("document revision exhausted".into()))
    }
    fn stage_change(&mut self, command: &str, extra: Value) -> Result<Change> {
        let revision = self.next_revision()?;
        let checkpoint = self.call("history_export", json!({}))?["checkpoint"].clone();
        let mut candidate = Self {
            incarnation: self.incarnation,
            revision: self.revision,
            server: engine::Server::default(),
            actor: self.actor.clone(),
            schema: self.schema.clone(),
            pending: vec![],
        };
        candidate.call(
            "history_restore",
            json!({"actor":self.actor,"checkpoint":checkpoint}),
        )?;
        let response = candidate.call(command, extra)?;
        let change = Change {
            ops: serde_json::from_value(response["ops"].clone())?,
            caret: serde_json::from_value(response["caret"].clone())?,
        };
        self.server = candidate.server;
        self.revision = revision;
        if !change.ops.is_empty() {
            self.pending.push(change.clone());
        }
        Ok(change)
    }
    /// Fresh own wire operations. Retry previously sent operations with apply_remote.
    pub fn record(&mut self, ops: Vec<Op>, options: EditOptions, now_ms: f64) -> Result<Change> {
        if !now_ms.is_finite() {
            return Err(Error("now_ms must be finite".into()));
        }
        let mut previous = self.observed_clock()?;
        for op in &ops {
            let (at, width) = match op.raw_operation() {
                Op::Node { id, .. } => (id, 1),
                Op::Text { id, units, .. } => (id, units.0.len().max(1) as u64),
                Op::Delete { at, .. }
                | Op::Undelete { at, .. }
                | Op::Set { at, .. }
                | Op::Move { at, .. } => (at, 1),
                Op::Reference { .. } => unreachable!("raw operation"),
            };
            if at.actor != self.actor || at.lamport <= previous {
                return Err(Error(
                    "graphic record requires fresh own tickets in order".into(),
                ));
            }
            previous = at
                .lamport
                .checked_add(width - 1)
                .filter(|n| *n <= MAX_CLOCK)
                .ok_or_else(|| Error("clock exhausted".into()))?;
        }
        self.stage_change(
            "history_record",
            json!({"ops":ops,"options":options,"now":now_ms}),
        )
    }
    // Expand schema branches without reading or replaying document history.
    fn field_writes(
        spec: &Value,
        value: &Value,
        path: &mut Vec<String>,
        out: &mut Vec<(String, Value, Value)>,
    ) -> Result<()> {
        if path.len() > 64 {
            return Err(Error("field path exceeds 64 segments".into()));
        }
        if let Some(fields) = spec.get("fields").and_then(Value::as_object) {
            if value.is_null() {
                for (name, child) in fields {
                    path.push(name.clone());
                    Self::field_writes(child, &Value::Null, path, out)?;
                    path.pop();
                }
            } else {
                let patch = value
                    .as_object()
                    .ok_or_else(|| Error("field patch must be an object or null".into()))?;
                for (name, item) in patch {
                    let child = fields
                        .get(name)
                        .ok_or_else(|| Error(format!("unknown field {name}")))?;
                    path.push(name.clone());
                    Self::field_writes(child, item, path, out)?;
                    path.pop();
                }
            }
        } else {
            out.push((
                format!("$field:{}", json!(path)),
                value.clone(),
                spec["default"].clone(),
            ));
        }
        Ok(())
    }
    fn attribute_writes(
        &self,
        kind: &str,
        attrs: Attributes,
        canonical: bool,
    ) -> Result<(Attributes, Vec<(String, Value)>)> {
        let mut scalar = Attributes::new();
        let mut fields = vec![];
        for (name, value) in attrs {
            let spec = &self.schema.effective_manifest()["nodes"][kind]["attrs"][&name];
            if spec.get("fields").is_some() {
                let mut writes = vec![];
                Self::field_writes(spec, &value, &mut vec![name.clone()], &mut writes)?;
                for (key, value, default) in writes {
                    engine::runtime_schema::validate_attribute(
                        self.schema.effective_manifest(),
                        kind,
                        &key,
                        &value,
                    )
                    .map_err(Error)?;
                    if !canonical || !value.is_null() && !Self::same_value(&value, &default) {
                        fields.push((key, value));
                    }
                }
            } else {
                engine::runtime_schema::validate_attribute(
                    self.schema.effective_manifest(),
                    kind,
                    &name,
                    &value,
                )
                .map_err(Error)?;
                if !canonical
                    || !value.is_null()
                        && (value.is_object()
                            || value.is_array()
                            || !Self::same_value(&value, &spec["default"]))
                {
                    scalar.insert(name, value);
                }
            }
        }
        Ok((scalar, fields))
    }
    fn same_value(a: &Value, b: &Value) -> bool {
        match (a, b) {
            (Value::Number(_), Value::Number(_)) => a.as_f64() == b.as_f64(),
            (Value::Array(left), Value::Array(right)) => {
                left.len() == right.len()
                    && left.iter().zip(right).all(|(a, b)| Self::same_value(a, b))
            }
            (Value::Object(left), Value::Object(right)) => {
                left.len() == right.len()
                    && left
                        .iter()
                        .all(|(key, a)| right.get(key).is_some_and(|b| Self::same_value(a, b)))
            }
            _ => a == b,
        }
    }
    fn append_fields(&self, id: &Ticket, fields: Vec<(String, Value)>, ops: &mut Vec<Op>) {
        for (index, (key, value)) in fields.into_iter().enumerate() {
            ops.push(Op::Set {
                at: Ticket {
                    lamport: id.lamport + index as u64 + 1,
                    actor: self.actor.clone(),
                },
                ids: vec![id.clone()],
                key,
                value,
            });
        }
    }
    fn node_kind(&mut self, id: &Key) -> Result<String> {
        let state = self.state()?;
        if let Some(lines) = state["lines"].as_array() {
            for line in lines {
                if let Some(items) = line["items"].as_array() {
                    for item in items {
                        if item["id"] == json!(id.ticket()?) && item["kind"] == "node" {
                            return Ok(item["attrs"]["$type"]["value"]
                                .as_str()
                                .or_else(|| item["born"].as_str())
                                .unwrap_or("")
                                .to_owned());
                        }
                    }
                }
            }
        }
        fn model_kind<'a>(model: &'a Value, id: &str) -> Option<&'a str> {
            if model["id"] == id {
                return model["type"].as_str();
            }
            model["children"]
                .as_array()?
                .iter()
                .find_map(|child| model_kind(child, id))
        }
        if let Some(kind) = model_kind(&state["model"], id.as_str()) {
            return Ok(kind.to_owned());
        }
        if let Some(item) = state["items"].as_array().and_then(|items| {
            items
                .iter()
                .find(|item| item["id"] == json!(id.ticket().ok()))
        }) {
            return Ok(item["attrs"]["$type"]["value"]
                .as_str()
                .or_else(|| item["born"].as_str())
                .unwrap_or("")
                .to_owned());
        }
        if let Some(kind) = state["nodes"][id.as_str()]["type"].as_str() {
            return Ok(kind.to_owned());
        }
        Err(Error("attribute target node not found".into()))
    }
    /// Apply one partial attribute patch as one atomic history transaction.
    /// Structured branches compile to independent leaf writers. Null resets all leaves.
    pub fn set_attributes(
        &mut self,
        id: &Key,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let kind = self.node_kind(id)?;
        let mut compiled = vec![];
        for (name, value) in attrs {
            let structured = self.schema.effective_manifest()["nodes"][&kind]["attrs"][&name]
                .get("fields")
                .is_some();
            let (scalar, fields) =
                self.attribute_writes(&kind, Attributes::from([(name, value)]), false)?;
            compiled.push((
                structured,
                scalar.into_iter().chain(fields).collect::<Vec<_>>(),
            ));
        }
        let first = self.next_ticket()?;
        let mut clock = first.lamport;
        let mut ops = vec![];
        for (structured, writes) in compiled {
            if structured {
                clock += 1;
            }
            for (key, value) in writes {
                ops.push(Op::Set {
                    at: Ticket {
                        lamport: clock,
                        actor: self.actor.clone(),
                    },
                    ids: vec![id.ticket()?],
                    key,
                    value,
                });
                clock += 1;
            }
        }
        self.record(ops, options, now_ms)
    }

    /// Set a schema-owned composite value or a distinct JSON value.
    pub fn set_runtime_attribute(
        &mut self,
        id: &Key,
        key: impl Into<String>,
        value: SchemaValue,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let key = key.into();
        if value.reference.is_none() {
            return self.set_attribute(id, key, value.value, options, now_ms);
        }
        let operation = Op::Set {
            at: self.next_ticket()?,
            ids: vec![id.ticket()?],
            key,
            value: value.value.clone(),
        };
        self.record(vec![value.bind(operation, &["value"])?], options, now_ms)
    }
    /// Set several independent attribute registers as one history transaction.
    pub fn set_runtime_attributes(
        &mut self,
        id: &Key,
        attrs: SchemaAttributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let kind = self.node_kind(id)?;
        let mut writes = vec![];
        for (key, value) in attrs {
            if value.reference.is_some() {
                writes.push((false, vec![(key, value)]));
            } else {
                let structured = self.schema.effective_manifest()["nodes"][&kind]["attrs"][&key]
                    .get("fields")
                    .is_some();
                let (scalar, fields) =
                    self.attribute_writes(&kind, Attributes::from([(key, value.value)]), false)?;
                writes.push((
                    structured,
                    scalar
                        .into_iter()
                        .chain(fields)
                        .map(|(k, v)| (k, SchemaValue::json(v)))
                        .collect(),
                ));
            }
        }
        let mut clock = self.next_ticket()?.lamport;
        let mut ops = vec![];
        for (structured, writes) in writes {
            if structured {
                clock += 1;
            }
            for (key, value) in writes {
                let operation = Op::Set {
                    at: Ticket {
                        lamport: clock,
                        actor: self.actor.clone(),
                    },
                    ids: vec![id.ticket()?],
                    key,
                    value: value.value.clone(),
                };
                ops.push(value.bind(operation, &["value"])?);
                clock += 1;
            }
        }
        self.record(ops, options, now_ms)
    }
    fn keep_birth_value(&self, value: &SchemaValue, at: &[&str]) -> Result<bool> {
        let Some(reference) = &value.reference else {
            return Ok(true);
        };
        self.schema.compiled.accepts_reference_at(reference, at).map_err(Error)?;
        Ok(!self.schema.compiled.is_default_reference_at(reference, at).map_err(Error)?)
    }
    fn birth_attributes(&self, attrs: SchemaAttributes, prefix: &[&str]) -> Result<SchemaAttributes> {
        let mut retained = SchemaAttributes::new();
        for (key, value) in attrs {
            let mut at = prefix.to_vec();
            at.push(&key);
            if self.keep_birth_value(&value, &at)? {
                retained.insert(key, value);
            }
        }
        Ok(retained)
    }
    fn bind_runtime_attributes(operation: Op, attrs: &SchemaAttributes, field: &str) -> Result<Op> {
        attrs
            .iter()
            .try_fold(operation, |op, (key, value)| value.bind(op, &[field, key]))
    }
    /// Insert a document block with schema-owned attribute references.
    pub fn insert_runtime_block_in(
        &mut self,
        kind: &str,
        parent: Option<&Key>,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: SchemaAttributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.document_origin(parent, None)?;
        let head = Self::flow_head(parent)?;
        let origin = self.document_line_origin(&head, after)?;
        self.validate_right_boundary(&head, right)?;
        let id = self.next_ticket()?;
        let key = Key::from_ticket(&id);
        let boundary = if self.schema.effective_manifest()["nodes"][kind]["shape"] == "text" {
            format!(
                "{}|{}{}",
                Key::from_ticket(&origin).as_str(),
                right.map(Key::as_str).unwrap_or("end"),
                if self.constrained_child(&head, kind)? {
                    format!("|child:{}", key.as_str())
                } else {
                    String::new()
                }
            )
        } else {
            String::new()
        };
        let attrs = self.birth_attributes(attrs, &["nodes", kind, "attrs"])?;
        let mut raw = Attributes::new();
        let mut fields = vec![];
        for (name, value) in &attrs {
            if value.reference.is_none() {
                let (scalar, leaf) = self.attribute_writes(
                    kind,
                    Attributes::from([(name.clone(), value.value.clone())]),
                    false,
                )?;
                raw.extend(scalar);
                fields.extend(leaf);
            } else {
                raw.insert(name.clone(), value.value.clone());
            }
        }
        let op = Op::Node {
            id,
            origin,
            node_type: kind.into(),
            boundary,
            attrs: Some(raw),
        };
        let op = Self::bind_runtime_attributes(op, &attrs, "attrs")?;
        let mut ops = vec![op];
        self.append_fields(&key.ticket()?, fields, &mut ops);
        Ok((key, self.record(ops, options, now_ms)?))
    }
    pub fn insert_runtime_block(
        &mut self,
        kind: &str,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: SchemaAttributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.insert_runtime_block_in(kind, None, after, right, attrs, options, now_ms)
    }
    /// Insert an inline token. Exact schema-default references produce no birth writer.
    pub fn insert_runtime_inline_at(
        &mut self,
        head: &Key,
        kind: &str,
        after: Option<&Key>,
        attrs: SchemaAttributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        if self.schema.effective_manifest()["nodes"][kind]["shape"] != "inline" {
            return Err(Error("inline kind required".into()));
        }
        let attrs = self.birth_attributes(attrs, &["nodes", kind, "attrs"])?;
        let origin = self.document_line_origin(head, after)?;
        let id = self.next_ticket()?;
        let key = Key::from_ticket(&id);
        let mut raw = Attributes::new();
        let mut fields = vec![];
        for (name, value) in &attrs {
            if value.reference.is_none() {
                let (scalar, leaf) = self.attribute_writes(
                    kind,
                    Attributes::from([(name.clone(), value.value.clone())]),
                    true,
                )?;
                raw.extend(scalar);
                fields.extend(leaf);
            } else {
                raw.insert(name.clone(), value.value.clone());
            }
        }
        let op = Self::bind_runtime_attributes(
            Op::Node {
                id,
                origin,
                node_type: kind.into(),
                boundary: String::new(),
                attrs: Some(raw),
            },
            &attrs,
            "attrs",
        )?;
        let mut ops = vec![op];
        self.append_fields(&key.ticket()?, fields, &mut ops);
        Ok((key, self.record(ops, options, now_ms)?))
    }
    /// Insert text at a physical source head. References apply to mark values.
    pub fn insert_runtime_text_at(
        &mut self,
        head: &Key,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        marks: SchemaAttributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let origin = self.document_line_origin(head, after)?;
        let id = self.next_ticket()?;
        let marks = self.birth_attributes(marks, &["markValues"])?;
        let raw = marks
            .iter()
            .map(|(k, v)| (k.clone(), v.value.clone()))
            .collect();
        let op = Self::bind_runtime_attributes(
            Op::Text {
                id,
                origin,
                units: text.into(),
                marks: raw,
            },
            &marks,
            "marks",
        )?;
        self.record(vec![op], options, now_ms)
    }
    /// Format explicit tokens with a schema-owned mark value.
    pub fn format_runtime_tokens(
        &mut self,
        ids: &[Key],
        mark: &str,
        value: SchemaValue,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let op = Op::Set {
            at: self.next_ticket()?,
            ids: ids.iter().map(Key::ticket).collect::<Result<_>>()?,
            key: mark.into(),
            value: value.value.clone(),
        };
        self.record(vec![value.bind(op, &["value"])?], options, now_ms)
    }

    /// Copy a schema-owned value to one declared field leaf. Source provenance
    /// is checked against this schema. Field values use deep-value validation;
    /// the emitted field operation carries plain JSON, not symbolic identity.
    pub fn set_runtime_field_path(
        &mut self,
        id: &Key,
        attribute: &str,
        path: &[&str],
        value: SchemaValue,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        if let Some(reference) = &value.reference {
            let payload = self.schema.compiled.reference_payload(reference).map_err(Error)?;
            if payload != value.value {
                return Err(Error("schema reference payload mismatch".into()));
            }
        }
        self.set_field_path(id, attribute, path, value.value, options, now_ms)
    }
    /// Set one nested leaf. Path segments are relative to the outer attribute.
    pub fn set_field_path(
        &mut self,
        id: &Key,
        attribute: &str,
        path: &[&str],
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let mut parts = vec![attribute];
        parts.extend_from_slice(path);
        self.set_attribute(
            id,
            format!("$field:{}", json!(parts)),
            value,
            options,
            now_ms,
        )
    }
    fn child_head(parent: Option<&Key>) -> Result<Ticket> {
        match parent {
            None => Key::root().ticket(),
            Some(key) => Key::parse(format!("0@{}/children", key.as_str()))?.ticket(),
        }
    }
    fn after_ticket(&mut self, after: Option<&Key>) -> Result<Option<Ticket>> {
        after
            .map(|key| {
                let state = self.call("state", json!({}))?;
                let value = &state["state"]["placements"][key.as_str()]["at"];
                if value.is_null() {
                    if self.schema.domain() == "document"
                        && state["state"]["lines"].as_array().is_some_and(|lines| {
                            lines.iter().any(|line| line["key"] == key.as_str())
                        })
                    {
                        return key.ticket();
                    }
                    return Err(Error("graphic order anchor missing".into()));
                }
                Ok(serde_json::from_value(value.clone())?)
            })
            .transpose()
    }
    /// Insert one object. None parent selects the canvas. None after inserts first.
    /// Declared structured attribute patches compile to independent field registers.
    pub fn insert(
        &mut self,
        kind: &str,
        parent: Option<&Key>,
        after: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        if self.schema.domain() != "graphic" {
            return Err(Error(
                "insert requires graphic schema; use insert_block for document".into(),
            ));
        }
        let id = self.next_ticket()?;
        let key = Key::from_ticket(&id);
        let parent = Self::child_head(parent)?;
        let after = self.after_ticket(after)?;
        let (scalar, fields) = self.attribute_writes(kind, attrs, false)?;
        let mut clock = id.lamport;
        let mut ops = vec![Op::Node {
            id: id.clone(),
            origin: parent.clone(),
            node_type: kind.into(),
            boundary: String::new(),
            attrs: Some(scalar),
        }];
        for (field, value) in fields {
            clock += 1;
            ops.push(Op::Set {
                at: Ticket {
                    lamport: clock,
                    actor: self.actor.clone(),
                },
                ids: vec![id.clone()],
                key: field,
                value,
            });
        }
        if let Some(after) = after {
            clock += 1;
            ops.push(Op::Move {
                at: Ticket {
                    lamport: clock,
                    actor: self.actor.clone(),
                },
                target: id,
                parent,
                after: Some(after),
            });
        }
        let change = self.record(ops, options, now_ms)?;
        Ok((key, change))
    }
    /// Set one declared scalar or one encoded perfield key. Null restores its default.
    pub fn set_attribute(
        &mut self,
        id: &Key,
        key: impl Into<String>,
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let key = key.into();
        if !key.starts_with("$field:")
            && self.schema.effective_manifest()["nodes"]
                .as_object()
                .is_some_and(|nodes| {
                    nodes
                        .values()
                        .any(|node| node["attrs"][&key].get("fields").is_some())
                })
        {
            return self.set_attributes(id, Attributes::from([(key, value)]), options, now_ms);
        }
        let at = self.next_ticket()?;
        self.record(
            vec![Op::Set {
                at,
                ids: vec![id.ticket()?],
                key,
                value,
            }],
            options,
            now_ms,
        )
    }
    pub fn set_field(
        &mut self,
        id: &Key,
        attribute: &str,
        field: &str,
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.set_attribute(
            id,
            format!("$field:{}", json!([attribute, field])),
            value,
            options,
            now_ms,
        )
    }
    pub fn delete(&mut self, ids: &[Key], options: EditOptions, now_ms: f64) -> Result<Change> {
        let at = self.next_ticket()?;
        self.record(
            vec![Op::Delete {
                at,
                ids: ids.iter().map(Key::ticket).collect::<Result<_>>()?,
            }],
            options,
            now_ms,
        )
    }
    /// Delete one physical block marker and its visible text tokens.
    /// Required markers remain present; deleting a required text slot clears its text.
    pub fn delete_block(&mut self, id: &Key, options: EditOptions, now_ms: f64) -> Result<Change> {
        let state = self.state()?;
        let mut targets = vec![];
        let mut found = false;
        if let Some(lines) = state["lines"].as_array() {
            for line in lines {
                let Some(items) = line["items"].as_array() else {
                    continue;
                };
                let Some(index) = items
                    .iter()
                    .position(|item| item["id"] == json!(id.ticket().ok()))
                else {
                    continue;
                };
                let marker = &items[index];
                let kind = marker["attrs"]["$type"]["value"]
                    .as_str()
                    .or_else(|| marker["born"].as_str())
                    .unwrap_or("");
                let text = self.schema.effective_manifest()["nodes"][kind]["shape"] == "text";
                let flow = self.schema.effective_manifest()["nodes"][kind]["shape"] == "flow";
                if flow {
                    fn descendants(
                        state: &Value,
                        manifest: &Value,
                        head: &Key,
                        targets: &mut Vec<Key>,
                        seen: &mut std::collections::BTreeSet<String>,
                    ) -> Result<()> {
                        if !seen.insert(head.as_str().to_owned()) {
                            return Ok(());
                        }
                        let required = format!(
                            "0@~required:{}:",
                            RuntimeDocument::encode_required_part(head.as_str())
                        );
                        if let Some(lines) = state["lines"].as_array() {
                            for line in lines {
                                let key = line["key"].as_str().unwrap_or("");
                                if key != head.as_str() && !key.starts_with(&required) {
                                    continue;
                                }
                                if let Some(items) = line["items"].as_array() {
                                    for item in items {
                                        if item["visible"] != true
                                            || item["boundary"] == "root"
                                                && !key.starts_with(&required)
                                        {
                                            continue;
                                        }
                                        let ticket: Ticket =
                                            serde_json::from_value(item["id"].clone())?;
                                        let id = Key::from_ticket(&ticket);
                                        if !ticket.actor.starts_with("~required:") {
                                            targets.push(id.clone());
                                        }
                                        let kind = item["attrs"]["$type"]["value"]
                                            .as_str()
                                            .or_else(|| item["born"].as_str())
                                            .unwrap_or("");
                                        if manifest["nodes"][kind]["shape"] == "flow" {
                                            descendants(
                                                state,
                                                manifest,
                                                &RuntimeDocument::flow_head(Some(&id))?,
                                                targets,
                                                seen,
                                            )?;
                                        }
                                    }
                                }
                            }
                        }
                        Ok(())
                    }
                    if !id.ticket()?.actor.starts_with("~required:") {
                        targets.push(id.clone());
                    }
                    descendants(
                        &state,
                        self.schema.effective_manifest(),
                        &Self::flow_head(Some(id))?,
                        &mut targets,
                        &mut std::collections::BTreeSet::new(),
                    )?;
                    found = true;
                    break;
                }
                found = true;
                for (offset, item) in items[index..].iter().enumerate() {
                    if offset > 0
                        && (!text
                            || item["kind"] == "node"
                                && self.schema.effective_manifest()["nodes"]
                                    [item["born"].as_str().unwrap_or("")]["shape"]
                                    != "inline")
                    {
                        break;
                    }
                    if item["visible"] != true {
                        continue;
                    }
                    let ticket: Ticket = serde_json::from_value(item["id"].clone())?;
                    if ticket.actor.starts_with("~required:") {
                        continue;
                    }
                    targets.push(Key::from_ticket(&ticket));
                }
                break;
            }
        }
        if !found {
            return Err(Error("physical block marker not found".into()));
        }
        if targets.is_empty() {
            return Ok(Change {
                ops: vec![],
                caret: None,
            });
        }
        self.delete(&targets, options, now_ms)
    }
    /// Move the object with all descendants and label text. Cycles are ignored by
    /// the shared deterministic placement projection, while the op remains retained.
    pub fn reparent(
        &mut self,
        id: &Key,
        parent: Option<&Key>,
        after: Option<&Key>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let at = self.next_ticket()?;
        let after = self.after_ticket(after)?;
        self.record(
            vec![Op::Move {
                at,
                target: id.ticket()?,
                parent: Self::child_head(parent)?,
                after,
            }],
            options,
            now_ms,
        )
    }
    pub fn insert_label_text(
        &mut self,
        label: &Key,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.insert_label_text_with_marks(label, after, text, Attributes::new(), options, now_ms)
    }
    pub fn insert_label_text_with_marks(
        &mut self,
        label: &Key,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        marks: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let ids = self.label_text_ids(label)?;
        if after.is_some_and(|key| !ids.contains(key)) {
            return Err(Error(
                "label anchor must be a visible token of this label".into(),
            ));
        }
        let id = self.next_ticket()?;
        let origin = match after {
            Some(key) => key.ticket()?,
            None => Key::parse(format!("0@{}/text", label.as_str()))?.ticket()?,
        };
        self.record(
            vec![Op::Text {
                id,
                origin,
                units: text.into(),
                marks,
            }],
            options,
            now_ms,
        )
    }
    /// Stable visible UTF-16 token keys for label editing. Deletion uses delete().
    pub fn label_text_ids(&mut self, label: &Key) -> Result<Vec<Key>> {
        let state = self.call("state", json!({}))?;
        let ids = &state["state"]["texts"][label.as_str()];
        if ids.is_null() {
            return Err(Error("label not found".into()));
        }
        Ok(serde_json::from_value(ids.clone())?)
    }
    pub fn undo(&mut self) -> Result<Change> {
        self.stage_change("history_undo", json!({}))
    }
    pub fn redo(&mut self) -> Result<Change> {
        self.stage_change("history_redo", json!({}))
    }
    pub fn history_status(&mut self) -> Result<HistoryStatus> {
        Ok(serde_json::from_value(
            self.call("history_state", json!({}))?["status"].clone(),
        )?)
    }
    pub fn pending_changes(&self) -> &[Change] {
        &self.pending
    }
    pub fn acknowledge(&mut self, changes: &[Change]) -> Result<()> {
        if !self.pending.starts_with(changes) {
            return Err(Error(
                "acknowledgement is not an exact pending prefix".into(),
            ));
        }
        self.pending.drain(..changes.len());
        Ok(())
    }
    pub fn checkpoint(&mut self) -> Result<RuntimeCheckpoint> {
        Ok(RuntimeCheckpoint {
            version: 1,
            actor: self.actor.clone(),
            schema: self.schema.clone(),
            native: self.call("history_export", json!({}))?["checkpoint"].clone(),
            pending: self.pending.clone(),
        })
    }
    pub fn restore(checkpoint: &RuntimeCheckpoint) -> Result<Self> {
        if checkpoint.version != 1
            || checkpoint.native["actor"] != checkpoint.actor
            || checkpoint.native["document"]["schema"] != checkpoint.schema.identity()
            || engine::runtime_schema::RuntimeSchema::compile(checkpoint.schema.dto.clone())
                .map_err(Error)?
                .identity()
                != checkpoint.schema.identity()
        {
            return Err(Error("graphic checkpoint actor/schema mismatch".into()));
        }
        let mut doc = Self {
            incarnation: allocate_incarnation()?,
            revision: 0,
            server: engine::Server::default(),
            actor: checkpoint.actor.clone(),
            schema: checkpoint.schema.clone(),
            pending: vec![],
        };
        doc.call(
            "history_restore",
            json!({"actor":doc.actor,"checkpoint":checkpoint.native}),
        )?;
        let before = doc.call("history_export", json!({}))?["checkpoint"].clone();
        for change in &checkpoint.pending {
            for op in &change.ops {
                let at = match op.raw_operation() {
                    Op::Node { id, .. } | Op::Text { id, .. } => id,
                    Op::Delete { at, .. }
                    | Op::Undelete { at, .. }
                    | Op::Set { at, .. }
                    | Op::Move { at, .. } => at,
                    Op::Reference { .. } => unreachable!("raw operation"),
                };
                if at.actor != doc.actor {
                    return Err(Error("graphic pending actor mismatch".into()));
                }
            }
            doc.apply_remote(&change.ops)?;
        }
        if doc.call("history_export", json!({}))?["checkpoint"] != before {
            return Err(Error(
                "graphic pending is not an exact checkpoint replay".into(),
            ));
        }
        doc.pending = checkpoint.pending.clone();
        Ok(doc)
    }
    pub fn restore_checkpoint(&mut self, checkpoint: &RuntimeCheckpoint) -> Result<()> {
        if checkpoint.actor != self.actor || checkpoint.schema.identity() != self.schema.identity()
        {
            return Err(Error("cannot replace graphic actor or schema".into()));
        }
        *self = Self::restore(checkpoint)?;
        Ok(())
    }
    /// Move a Document block and its descendants to a compatible flow.
    pub fn reparent_block(
        &mut self,
        id: &Key,
        parent: Option<&Key>,
        after: Option<&Key>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.document_origin(parent, None)?;
        let at = self.next_ticket()?;
        let after = self.after_ticket(after)?;
        self.record(
            vec![Op::Move {
                at,
                target: id.ticket()?,
                parent: Self::flow_head(parent)?.ticket()?,
                after,
            }],
            options,
            now_ms,
        )
    }
    /// Capture a model range as stable token anchors. Nested paths use one
    /// child index per flow level and a final UTF-16 offset.
    pub fn capture_selection(
        &mut self,
        range: Option<Selection<Position>>,
    ) -> Result<Option<Selection<Key>>> {
        Ok(serde_json::from_value(
            self.call("selection_capture", json!({"range":range}))?["range"].clone(),
        )?)
    }
    pub fn resolve_selection(
        &mut self,
        range: Option<Selection<Key>>,
    ) -> Result<Option<Selection<Position>>> {
        Ok(serde_json::from_value(
            self.call("selection_resolve", json!({"range":range}))?["range"].clone(),
        )?)
    }
    /// Stable body head for a Document flow. None selects the root flow.
    pub fn flow_head(parent: Option<&Key>) -> Result<Key> {
        match parent {
            None => Ok(Key::root()),
            Some(parent) => Key::parse(format!("0@{}/body", parent.as_str())),
        }
    }
    fn encode_required_part(s: &str) -> String {
        let mut out = String::new();
        for byte in s.bytes() {
            if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
                out.push(byte as char);
            } else {
                out.push_str(&format!("%{byte:02X}"));
            }
        }
        out
    }
    /// Stable virtual source head of a required child rule slot.
    pub fn required_head(parent_head: &Key, kind: &str, ordinal: usize) -> Result<Key> {
        if ordinal > 1000 {
            return Err(Error("required ordinal exceeds rule limit".into()));
        }
        Key::parse(format!(
            "0@~required:{}:{}:{}",
            Self::encode_required_part(parent_head.as_str()),
            Self::encode_required_part(kind),
            ordinal
        ))
    }
    /// Stable required marker key. Text and group slots use their source head.
    pub fn required_node(&self, parent_head: &Key, kind: &str, ordinal: usize) -> Result<Key> {
        let head = Self::required_head(parent_head, kind, ordinal)?;
        let shape = &self.schema.effective_manifest()["nodes"][kind]["shape"];
        if shape == "text" || shape == "group" {
            return Ok(head);
        }
        let mut ticket = head.ticket()?;
        ticket.lamport = 1;
        Ok(Key::from_ticket(&ticket))
    }
    fn document_origin(&mut self, parent: Option<&Key>, after: Option<&Key>) -> Result<Ticket> {
        if self.schema.domain() != "document" {
            return Err(Error("document flow requires document schema".into()));
        }
        let head = Self::flow_head(parent)?;
        if let Some(after) = after {
            if after.as_str().starts_with("0@~required:") {
                return self.document_line_origin(after, Some(after));
            }
        }
        self.document_line_origin(&head, after)
    }
    fn document_line_origin(&mut self, head: &Key, after: Option<&Key>) -> Result<Ticket> {
        let state = self.state()?;
        let items = if let Some(lines) = state["lines"].as_array() {
            lines
                .iter()
                .find(|line| line["key"] == head.as_str())
                .and_then(|line| line["items"].as_array())
                .ok_or_else(|| Error("document parent flow not found".into()))?
        } else if head == &Key::root() {
            state["items"]
                .as_array()
                .ok_or_else(|| Error("document items missing".into()))?
        } else {
            return Err(Error("document parent flow not found".into()));
        };
        let origin = after.unwrap_or(head).ticket()?;
        if !items.iter().any(|item| item["id"] == json!(origin)) {
            return Err(Error("document anchor is outside source flow".into()));
        }
        Ok(origin)
    }
    /// Visible UTF-16 token keys in the flow's physical source sequence.
    /// Moved blocks retain their source sequence; selection resolves model paths.
    pub fn flow_text_ids(&mut self, parent: Option<&Key>) -> Result<Vec<Key>> {
        self.document_origin(parent, None)?;
        let state = self.state()?;
        let head = Self::flow_head(parent)?;
        let items = if let Some(lines) = state["lines"].as_array() {
            lines
                .iter()
                .find(|line| line["key"] == head.as_str())
                .unwrap()["items"]
                .as_array()
                .unwrap()
        } else {
            state["items"].as_array().unwrap()
        };
        items
            .iter()
            .filter(|item| item["kind"] == "char" && item["visible"] == true)
            .map(|item| {
                serde_json::from_value::<Ticket>(item["id"].clone())
                    .map(|ticket| Key::from_ticket(&ticket))
                    .map_err(Error::from)
            })
            .collect()
    }
    /// Insert a text, atom or flow marker in the Document root flow.
    /// For text blocks, right is the current right boundary (None means end).
    pub fn insert_block(
        &mut self,
        kind: &str,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.insert_block_in(kind, None, after, right, attrs, options, now_ms)
    }
    /// Insert a marker in a parent flow's physical source sequence.
    /// None parent selects the root. After and right identify source tokens.
    /// This method does not compile model positions after block movement;
    /// a moved block retains its original source sequence.
    pub fn insert_block_in(
        &mut self,
        kind: &str,
        parent: Option<&Key>,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.document_origin(parent, None)?;
        self.insert_marker_in_line(
            kind,
            &Self::flow_head(parent)?,
            after,
            right,
            attrs,
            options,
            now_ms,
        )
    }
    fn constrained_child(&mut self, head: &Key, kind: &str) -> Result<bool> {
        if !self.schema.effective_manifest()["nodes"]
            .as_object()
            .is_some_and(|nodes| nodes.values().any(|node| node.get("childRules").is_some()))
        {
            return Ok(false);
        }
        if head.as_str().starts_with("0@~required:") {
            return Ok(false);
        }
        let flow = if head == &Key::root() {
            self.schema.effective_manifest()["root"].as_str().unwrap().to_owned()
        } else {
            let state = self.state()?;
            let line = state["lines"]
                .as_array()
                .and_then(|lines| lines.iter().find(|line| line["key"] == head.as_str()))
                .ok_or_else(|| Error("source line missing".into()))?;
            let owner = line["owner"]
                .as_str()
                .ok_or_else(|| Error("source owner missing".into()))?;
            let owner_kind = self.node_kind(&Key::parse(owner)?)?;
            if line["slot"] == "body" {
                owner_kind
            } else if line["slot"]
                .as_str()
                .is_some_and(|slot| slot.starts_with("cell:"))
            {
                let nodes = &self.schema.effective_manifest()["nodes"];
                let row = nodes[&owner_kind]["children"][0].as_str().unwrap_or("");
                let cell = nodes[row]["children"][0].as_str().unwrap_or("");
                nodes[cell]["children"][0].as_str().unwrap_or("").to_owned()
            } else {
                return Ok(false);
            }
        };
        let nodes = &self.schema.effective_manifest()["nodes"];
        let spec = &nodes[&flow];
        let child = spec["children"]
            .as_array()
            .and_then(|children| {
                children.iter().filter_map(Value::as_str).find(|child| {
                    nodes[*child]["shape"] == "group"
                        && nodes[*child]["children"]
                            .as_array()
                            .is_some_and(|members| members.iter().any(|member| member == kind))
                })
            })
            .unwrap_or(kind);
        Ok(spec["childRules"].get(child).is_some())
    }
    fn validate_right_boundary(&mut self, head: &Key, right: Option<&Key>) -> Result<()> {
        if let Some(right) = right {
            let ticket = right.ticket()?;
            let prefix = format!("~required:{}:", Self::encode_required_part(head.as_str()));
            if ticket.actor.starts_with(&prefix) {
                let virtual_head = Key::from_ticket(&Ticket {
                    lamport: 0,
                    actor: ticket.actor.clone(),
                });
                let state = self.state()?;
                let line = state["lines"]
                    .as_array()
                    .and_then(|lines| {
                        lines
                            .iter()
                            .find(|line| line["key"] == virtual_head.as_str())
                    })
                    .ok_or_else(|| Error("required right slot is not declared".into()))?;
                let items = line["items"]
                    .as_array()
                    .ok_or_else(|| Error("required right source missing".into()))?;
                let node = Ticket {
                    lamport: 1,
                    actor: ticket.actor.clone(),
                };
                let canonical_lamport = u64::from(
                    items
                        .iter()
                        .any(|item| item["id"] == json!(node) && item["kind"] == "node"),
                );
                if ticket.lamport != canonical_lamport
                    || !items
                        .iter()
                        .any(|item| item["id"] == json!(ticket) && item["kind"] == "node")
                {
                    return Err(Error(
                        "required right must name its canonical marker".into(),
                    ));
                }
            } else {
                self.document_line_origin(head, Some(right))?;
            }
        }
        Ok(())
    }
    fn insert_marker_in_line(
        &mut self,
        kind: &str,
        head: &Key,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        let origin = self.document_line_origin(head, after)?;
        self.validate_right_boundary(head, right)?;
        let id = self.next_ticket()?;
        let key = Key::from_ticket(&id);
        let shape = &self.schema.effective_manifest()["nodes"][kind]["shape"];
        let boundary = if shape == "text" {
            format!(
                "{}|{}{}",
                Key::from_ticket(&origin).as_str(),
                right.map(Key::as_str).unwrap_or("end"),
                if self.constrained_child(head, kind)? {
                    format!("|child:{}", key.as_str())
                } else {
                    String::new()
                }
            )
        } else {
            String::new()
        };
        let (attrs, fields) = self.attribute_writes(kind, attrs, false)?;
        let mut ops = vec![Op::Node {
            id: id.clone(),
            origin,
            node_type: kind.into(),
            boundary,
            attrs: Some(attrs),
        }];
        self.append_fields(&id, fields, &mut ops);
        let change = self.record(ops, options, now_ms)?;
        Ok((key, change))
    }
    /// Insert UTF-16 tokens at a Document token or block marker.
    pub fn insert_text(
        &mut self,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        marks: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.insert_text_in(None, after, text, marks, options, now_ms)
    }
    /// Insert UTF-16 tokens in a parent flow's physical source sequence.
    /// After identifies a source token, not a model position. Moved blocks
    /// retain their original source sequence; use selection for model paths.
    pub fn insert_text_in(
        &mut self,
        parent: Option<&Key>,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        marks: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let origin = self.document_origin(parent, after)?;
        let id = self.next_ticket()?;
        self.record(
            vec![Op::Text {
                id,
                origin,
                units: text.into(),
                marks,
            }],
            options,
            now_ms,
        )
    }
    /// Visible character and inline keys in a physical source line.
    /// A source line can be a root, nested flow, or grid cell head.
    pub fn line_token_ids(&mut self, head: &Key) -> Result<Vec<Key>> {
        self.document_line_origin(head, None)?;
        let state = self.state()?;
        let items = if let Some(lines) = state["lines"].as_array() {
            lines
                .iter()
                .find(|line| line["key"] == head.as_str())
                .unwrap()["items"]
                .as_array()
                .unwrap()
        } else {
            state["items"].as_array().unwrap()
        };
        items
            .iter()
            .filter(|item| {
                item["visible"] == true
                    && (item["kind"] == "char"
                        || item["kind"] == "node"
                            && self.schema.effective_manifest()["nodes"][item["born"].as_str().unwrap_or("")]
                                ["shape"]
                                == "inline")
            })
            .map(|item| {
                serde_json::from_value::<Ticket>(item["id"].clone())
                    .map(|id| Key::from_ticket(&id))
                    .map_err(Error::from)
            })
            .collect()
    }
    // Validate all supplied attributes before omitting default-valued birth
    // registers. Parent and source-context checks remain in atomic record().
    fn insert_canonical_marker_in_line(
        &mut self,
        kind: &str,
        head: &Key,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        let (scalar, fields) = self.attribute_writes(kind, attrs, true)?;
        let origin = self.document_line_origin(head, after)?;
        self.validate_right_boundary(head, right)?;
        let id = self.next_ticket()?;
        let key = Key::from_ticket(&id);
        let boundary = if self.schema.effective_manifest()["nodes"][kind]["shape"] == "text" {
            format!(
                "{}|{}{}",
                Key::from_ticket(&origin).as_str(),
                right.map(Key::as_str).unwrap_or("end"),
                if self.constrained_child(head, kind)? {
                    format!("|child:{}", key.as_str())
                } else {
                    String::new()
                }
            )
        } else {
            String::new()
        };
        let mut ops = vec![Op::Node {
            id: id.clone(),
            origin,
            node_type: kind.into(),
            boundary,
            attrs: Some(scalar),
        }];
        self.append_fields(&id, fields, &mut ops);
        Ok((key, self.record(ops, options, now_ms)?))
    }

    /// Insert a schema-declared inline token. Delete it with delete(); update
    /// its attributes with set_attribute(). The anchor is a physical source key.
    pub fn insert_inline_at(
        &mut self,
        head: &Key,
        kind: &str,
        after: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        if self.schema.effective_manifest()["nodes"][kind]["shape"] != "inline" {
            return Err(Error("inline kind required".into()));
        }
        self.insert_canonical_marker_in_line(kind, head, after, None, attrs, options, now_ms)
    }
    /// Insert a stored member of a schema-derived group. The wrapper has no
    /// stored ID. Its type and grouping attributes come from the schema.
    pub fn insert_group_member_at(
        &mut self,
        head: &Key,
        group: &str,
        kind: &str,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        let spec = &self.schema.effective_manifest()["nodes"][group];
        if spec["shape"] != "group"
            || !spec["children"]
                .as_array()
                .is_some_and(|children| children.iter().any(|child| child == kind))
        {
            return Err(Error("member must be declared by group".into()));
        }
        self.insert_canonical_marker_in_line(kind, head, after, right, attrs, options, now_ms)
    }
    /// Insert explicit marks at a stable physical source address.
    pub fn insert_text_at(
        &mut self,
        head: &Key,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        marks: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let origin = self.document_line_origin(head, after)?;
        let id = self.next_ticket()?;
        self.record(
            vec![Op::Text {
                id,
                origin,
                units: text.into(),
                marks,
            }],
            options,
            now_ms,
        )
    }
    /// Insert plain text with the left character's inheritable marks. Inline
    /// tokens and block markers do not supply inherited marks.
    pub fn insert_inherited_text_at(
        &mut self,
        head: &Key,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.document_line_origin(head, after)?;
        let mut marks = Attributes::new();
        if let Some(after) = after {
            let state = self.state()?;
            let items = if let Some(lines) = state["lines"].as_array() {
                lines
                    .iter()
                    .find(|line| line["key"] == head.as_str())
                    .unwrap()["items"]
                    .as_array()
                    .unwrap()
            } else {
                state["items"].as_array().unwrap()
            };
            if let Some(item) = items
                .iter()
                .find(|item| item["id"] == json!(after.ticket().unwrap()) && item["kind"] == "char")
            {
                if let Some(attrs) = item["attrs"].as_object() {
                    for (name, register) in attrs {
                        let value = &register["value"];
                        let boolean = self.schema.effective_manifest()["marks"]
                            .as_array()
                            .is_some_and(|keys| keys.iter().any(|key| key == name));
                        let spec = &self.schema.effective_manifest()["markValues"][name];
                        if boolean && value == true
                            || !spec.is_null()
                                && spec["inherit"] == true
                                && !value.is_null()
                                && value != &spec["default"]
                        {
                            marks.insert(name.clone(), value.clone());
                        }
                    }
                }
            }
        }
        self.insert_text_at(head, after, text, marks, options, now_ms)
    }
    /// Set a boolean or scalar value mark on explicit character/inline tokens.
    /// Null clears a value mark. Schema and token validation occurs before commit.
    pub fn format_tokens(
        &mut self,
        ids: &[Key],
        mark: &str,
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        if !self.schema.effective_manifest()["marks"]
            .as_array()
            .is_some_and(|marks| marks.iter().any(|m| m == mark))
            && self.schema.effective_manifest()["markValues"].get(mark).is_none()
        {
            return Err(Error("declared mark required".into()));
        }
        let at = self.next_ticket()?;
        self.record(
            vec![Op::Set {
                at,
                ids: ids.iter().map(Key::ticket).collect::<Result<_>>()?,
                key: mark.into(),
                value,
            }],
            options,
            now_ms,
        )
    }
    /// Format a span by its schema type. The wrapper is projected from its
    /// value mark; it does not create or store a wrapper token.
    pub fn format_span(
        &mut self,
        ids: &[Key],
        kind: &str,
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let spec = &self.schema.effective_manifest()["nodes"][kind];
        if spec["shape"] != "span" {
            return Err(Error("span kind required".into()));
        }
        let mark = spec["mark"]
            .as_str()
            .ok_or_else(|| Error("span mark missing".into()))?
            .to_owned();
        self.format_tokens(ids, &mark, value, options, now_ms)
    }
    /// Update one declared group attribute on explicit stored members in one
    /// transaction. Callers retain member identities when group boundaries change.
    pub fn set_group_attribute(
        &mut self,
        members: &[Key],
        group: &str,
        attribute: &str,
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let spec = self.schema.effective_manifest()["nodes"][group].clone();
        if spec["shape"] != "group"
            || !spec["by"]
                .as_array()
                .is_some_and(|by| by.iter().any(|name| name == attribute))
        {
            return Err(Error("declared group attribute required".into()));
        }
        let state = self.state()?;
        let mut kinds = std::collections::BTreeMap::new();
        if let Some(lines) = state["lines"].as_array() {
            for line in lines {
                if let Some(items) = line["items"].as_array() {
                    for item in items {
                        if item["visible"] != true || item["kind"] != "node" {
                            continue;
                        }
                        if let Ok(id) = serde_json::from_value::<Ticket>(item["id"].clone()) {
                            let kind = item["attrs"]["$type"]["value"]
                                .as_str()
                                .unwrap_or_else(|| item["born"].as_str().unwrap_or(""));
                            if self.schema.effective_manifest()["nodes"][kind]["shape"] == "text" {
                                kinds
                                    .insert(Key::from_ticket(&id).as_str().to_owned(), json!(kind));
                            }
                        }
                    }
                }
            }
        }
        if members.is_empty()
            || members.iter().any(|member| {
                !spec["children"].as_array().is_some_and(|children| {
                    kinds
                        .get(member.as_str())
                        .is_some_and(|kind| children.contains(kind))
                })
            })
        {
            return Err(Error("group member required".into()));
        }
        let structured = self.schema.effective_manifest()["nodes"]
            [kinds[members[0].as_str()].as_str().unwrap()]["attrs"][attribute]
            .get("fields")
            .is_some();
        let mut compiled = vec![];
        for member in members {
            let kind = kinds[member.as_str()].as_str().unwrap();
            let (scalar, fields) = self.attribute_writes(
                kind,
                Attributes::from([(attribute.into(), value.clone())]),
                false,
            )?;
            compiled.push((
                member.ticket()?,
                scalar.into_iter().chain(fields).collect::<Vec<_>>(),
            ));
        }
        let first = self.next_ticket()?;
        if !structured {
            return self.record(
                vec![Op::Set {
                    at: first,
                    ids: members.iter().map(Key::ticket).collect::<Result<_>>()?,
                    key: attribute.into(),
                    value,
                }],
                options,
                now_ms,
            );
        }
        let mut clock = first.lamport + 1;
        let mut ops = vec![];
        for (member, writes) in compiled {
            for (key, value) in writes {
                ops.push(Op::Set {
                    at: Ticket {
                        lamport: clock,
                        actor: self.actor.clone(),
                    },
                    ids: vec![member.clone()],
                    key,
                    value,
                });
                clock += 1;
            }
        }
        self.record(ops, options, now_ms)
    }

    /// Insert an empty grid and all axes in one history transaction.
    /// `head` is a physical flow head from flow_head() or cell_head().
    /// The helper does not compile a model insertion position or a trailing block.
    pub fn insert_grid_at(
        &mut self,
        head: &Key,
        kind: &str,
        after: Option<&Key>,
        rows: usize,
        columns: usize,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Vec<Key>, Vec<Key>, Change)> {
        if rows == 0 || columns == 0 {
            return Err(Error("grid dimensions must be positive".into()));
        }
        let origin = self.document_line_origin(head, after)?;
        let spec = &self.schema.effective_manifest()["nodes"][kind];
        if spec["shape"] != "grid" {
            return Err(Error("grid kind required".into()));
        }
        let row_kind = spec["children"][0]
            .as_str()
            .ok_or_else(|| Error("grid row kind missing".into()))?
            .to_owned();
        let count = rows
            .checked_add(columns)
            .and_then(|n| u64::try_from(n).ok())
            .ok_or_else(|| Error("grid dimensions overflow".into()))?;
        let first = self.next_ticket()?;
        first
            .lamport
            .checked_add(count)
            .filter(|n| *n <= MAX_CLOCK)
            .ok_or_else(|| Error("grid dimensions exceed clock capacity".into()))?;
        let grid = Key::from_ticket(&first);
        let (attrs, fields) = self.attribute_writes(kind, attrs, false)?;
        let mut ops = vec![Op::Node {
            id: first.clone(),
            origin,
            node_type: kind.into(),
            boundary: String::new(),
            attrs: Some(attrs),
        }];
        self.append_fields(&first, fields, &mut ops);
        let mut axis_keys = [Vec::new(), Vec::new()];
        let mut clock = first.lamport + ops.len() as u64 - 1;
        for (index, count) in [rows, columns].into_iter().enumerate() {
            let mut origin = if index == 0 {
                Self::grid_rows_head(&grid)?
            } else {
                Self::grid_columns_head(&grid)?
            }
            .ticket()?;
            for _ in 0..count {
                clock = clock
                    .checked_add(1)
                    .filter(|n| *n <= MAX_CLOCK)
                    .ok_or_else(|| Error("clock exhausted".into()))?;
                let id = Ticket {
                    lamport: clock,
                    actor: self.actor.clone(),
                };
                axis_keys[index].push(Key::from_ticket(&id));
                ops.push(Op::Node {
                    id: id.clone(),
                    origin,
                    node_type: if index == 0 {
                        row_kind.clone()
                    } else {
                        "col".into()
                    },
                    boundary: String::new(),
                    attrs: Some(Attributes::new()),
                });
                origin = id;
            }
        }
        let change = self.record(ops, options, now_ms)?;
        let [rows, columns] = axis_keys;
        Ok((grid, rows, columns, change))
    }
    /// Physical row sequence head. Rows and columns are stable token identities.
    pub fn grid_rows_head(grid: &Key) -> Result<Key> {
        Key::parse(format!("0@{}/rows", grid.as_str()))
    }
    pub fn grid_columns_head(grid: &Key) -> Result<Key> {
        Key::parse(format!("0@{}/cols", grid.as_str()))
    }
    /// Physical cell flow head. This address is stable across axis movement.
    /// It is not a model position. A moved block retains its birth sequence.
    pub fn cell_head(grid: &Key, row: &Key, col: &Key) -> Result<Key> {
        Key::parse(format!(
            "0@{}/cell:{},{}",
            grid.as_str(),
            row.as_str(),
            col.as_str()
        ))
    }
    /// Insert one schema-named row. Delete rows with delete(&[row], ...).
    pub fn insert_grid_row(
        &mut self,
        grid: &Key,
        kind: &str,
        after: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.insert_marker_in_line(
            kind,
            &Self::grid_rows_head(grid)?,
            after,
            None,
            attrs,
            options,
            now_ms,
        )
    }
    /// Insert one column. The wire type `col` is reserved by the native format.
    pub fn insert_grid_column(
        &mut self,
        grid: &Key,
        after: Option<&Key>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.insert_marker_in_line(
            "col",
            &Self::grid_columns_head(grid)?,
            after,
            None,
            Attributes::new(),
            options,
            now_ms,
        )
    }
    pub fn insert_cell_block(
        &mut self,
        grid: &Key,
        row: &Key,
        col: &Key,
        kind: &str,
        after: Option<&Key>,
        right: Option<&Key>,
        attrs: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        self.insert_marker_in_line(
            kind,
            &Self::cell_head(grid, row, col)?,
            after,
            right,
            attrs,
            options,
            now_ms,
        )
    }
    pub fn insert_cell_text(
        &mut self,
        grid: &Key,
        row: &Key,
        col: &Key,
        after: Option<&Key>,
        text: impl Into<Utf16Text>,
        marks: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let origin = self.document_line_origin(&Self::cell_head(grid, row, col)?, after)?;
        let id = self.next_ticket()?;
        self.record(
            vec![Op::Text {
                id,
                origin,
                units: text.into(),
                marks,
            }],
            options,
            now_ms,
        )
    }
    pub fn set_cell_attribute(
        &mut self,
        grid: &Key,
        row: &Key,
        col: &Key,
        attribute: &str,
        value: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let grid_kind = self.node_kind(grid)?;
        let row_kind = self.schema.effective_manifest()["nodes"][&grid_kind]["children"][0]
            .as_str()
            .unwrap_or("");
        let cell_kind = self.schema.effective_manifest()["nodes"][row_kind]["children"][0]
            .as_str()
            .unwrap_or("")
            .to_owned();
        if self.schema.effective_manifest()["nodes"][&cell_kind]["attrs"][attribute]
            .get("fields")
            .is_some()
        {
            let (_, fields) = self.attribute_writes(
                &cell_kind,
                Attributes::from([(attribute.into(), value)]),
                false,
            )?;
            let first = self.next_ticket()?;
            let ops = fields
                .into_iter()
                .enumerate()
                .map(|(index, (key, value))| {
                    Ok(Op::Set {
                        at: Ticket {
                            lamport: first.lamport + index as u64 + 1,
                            actor: self.actor.clone(),
                        },
                        ids: vec![grid.ticket()?],
                        key: format!("$cell:{},{}|{}", row.as_str(), col.as_str(), key),
                        value,
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            return self.record(ops, options, now_ms);
        }
        self.set_attribute(
            grid,
            format!("$cell:{},{}|{}", row.as_str(), col.as_str(), attribute),
            value,
            options,
            now_ms,
        )
    }
    /// Merge a rectangle using inclusive stable row/column endpoints.
    /// Covered cells retain their content. Split clears this span register.
    pub fn merge_cells(
        &mut self,
        grid: &Key,
        row: &Key,
        col: &Key,
        end_row: &Key,
        end_col: &Key,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.set_attribute(
            grid,
            format!("$span:{},{}", row.as_str(), col.as_str()),
            json!({"row":end_row,"col":end_col}),
            options,
            now_ms,
        )
    }
    pub fn split_cell(
        &mut self,
        grid: &Key,
        row: &Key,
        col: &Key,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        self.set_attribute(
            grid,
            format!("$span:{},{}", row.as_str(), col.as_str()),
            Value::Null,
            options,
            now_ms,
        )
    }
    /// Move a Document block into a cell, with the same physical source contract
    /// as reparent_block. The anchor uses the current placement ticket.
    pub fn reparent_block_to_cell(
        &mut self,
        id: &Key,
        grid: &Key,
        row: &Key,
        col: &Key,
        after: Option<&Key>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let head = Self::cell_head(grid, row, col)?;
        self.document_line_origin(&head, None)?;
        let at = self.next_ticket()?;
        let after = self.after_ticket(after)?;
        self.record(
            vec![Op::Move {
                at,
                target: id.ticket()?,
                parent: head.ticket()?,
                after,
            }],
            options,
            now_ms,
        )
    }
}
