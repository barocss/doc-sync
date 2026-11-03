//! User-defined native Document and Graphic schemas. Document support is the
//! flat root-flow/text/atom subset. Unsupported rules fail during compilation.
use crate::{
    Attributes, Change, EditOptions, Error, HistoryStatus, Key, Op, Result, Ticket, Utf16Text,
};
use doc_sync_rust_shadow as engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
const MAX_CLOCK: u64 = 9_007_199_254_740_991;
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(transparent)]
pub struct RuntimeSchema {
    manifest: Value,
    #[serde(skip)]
    identity: String,
}
impl<'de> Deserialize<'de> for RuntimeSchema {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        Self::compile(v).map_err(serde::de::Error::custom)
    }
}
impl RuntimeSchema {
    pub fn compile(manifest: Value) -> Result<Self> {
        let compiled =
            engine::runtime_schema::RuntimeSchema::compile(manifest.clone()).map_err(Error)?;
        let identity = compiled.identity().to_owned();
        Ok(Self { manifest, identity })
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
    pub fn manifest(&self) -> &Value {
        &self.manifest
    }
    pub fn domain(&self) -> &str {
        self.manifest["domain"].as_str().unwrap_or("document")
    }
}
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
    server: engine::Server,
    actor: String,
    schema: RuntimeSchema,
    pending: Vec<Change>,
}
impl RuntimeDocument {
    pub fn new(actor: impl Into<String>, schema: RuntimeSchema) -> Result<Self> {
        let mut doc = Self {
            server: engine::Server::default(),
            actor: actor.into(),
            schema,
            pending: vec![],
        };
        doc.call(
            "new",
            json!({"actor":doc.actor,"runtimeSchema":doc.schema.manifest()}),
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
        self.call("apply", json!({"ops":ops}))?;
        Ok(())
    }
    fn stage_change(&mut self, command: &str, extra: Value) -> Result<Change> {
        let checkpoint = self.call("history_export", json!({}))?["checkpoint"].clone();
        let mut candidate = Self {
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
            let (at, width) = match op {
                Op::Node { id, .. } => (id, 1),
                Op::Text { id, units, .. } => (id, units.0.len().max(1) as u64),
                Op::Delete { at, .. }
                | Op::Undelete { at, .. }
                | Op::Set { at, .. }
                | Op::Move { at, .. } => (at, 1),
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
        let mut scalar = Attributes::new();
        let mut fields = vec![];
        for (name, value) in attrs {
            if self.schema.manifest()["nodes"][kind]["attrs"][&name]
                .get("fields")
                .is_some()
            {
                let values = value
                    .as_object()
                    .ok_or_else(|| Error("graphic field patch must be object".into()))?;
                for (field, value) in values {
                    fields.push((format!("$field:{}", json!([name, field])), value.clone()));
                }
            } else {
                scalar.insert(name, value);
            }
        }
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
        let at = self.next_ticket()?;
        self.record(
            vec![Op::Set {
                at,
                ids: vec![id.ticket()?],
                key: key.into(),
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
            || engine::runtime_schema::RuntimeSchema::compile(checkpoint.schema.manifest.clone())
                .map_err(Error)?
                .identity()
                != checkpoint.schema.identity()
        {
            return Err(Error("graphic checkpoint actor/schema mismatch".into()));
        }
        let mut doc = Self {
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
                let at = match op {
                    Op::Node { id, .. } | Op::Text { id, .. } => id,
                    Op::Delete { at, .. }
                    | Op::Undelete { at, .. }
                    | Op::Set { at, .. }
                    | Op::Move { at, .. } => at,
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
    /// Insert a text or atom marker in the Document root flow.
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
        if self.schema.domain() != "document" {
            return Err(Error("insert_block requires document schema".into()));
        }
        let id = self.next_ticket()?;
        let key = Key::from_ticket(&id);
        let origin = after
            .map(Key::ticket)
            .transpose()?
            .unwrap_or(Key::root().ticket()?);
        let shape = &self.schema.manifest()["nodes"][kind]["shape"];
        let boundary = if shape == "text" {
            format!(
                "{}|{}",
                Key::from_ticket(&origin).as_str(),
                right.map(Key::as_str).unwrap_or("end")
            )
        } else {
            String::new()
        };
        let change = self.record(
            vec![Op::Node {
                id,
                origin,
                node_type: kind.into(),
                boundary,
                attrs: Some(attrs),
            }],
            options,
            now_ms,
        )?;
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
        if self.schema.domain() != "document" {
            return Err(Error("insert_text requires document schema".into()));
        }
        let id = self.next_ticket()?;
        let origin = after
            .map(Key::ticket)
            .transpose()?
            .unwrap_or(Key::root().ticket()?);
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
}
