//! Experimental native SDK for the six pinned native engine presets.
//! Hosts transport returned operations; this crate supplies no network or browser adapter.
use doc_sync_rust_shadow as engine;
pub mod sparse_sheet;
pub use sparse_sheet::*;
pub mod graphic;
pub use graphic::{GraphicDocument, GraphicCheckpoint, GraphicKind, GraphicNode, GraphicPreset};
pub mod runtime_schema;
pub use runtime_schema::{RuntimeSchema, RuntimeDocument, RuntimeCheckpoint};
pub mod runtime_sheet;
pub use runtime_sheet::*;
pub use engine::Ticket;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
pub type Attributes = BTreeMap<String, Value>;
pub type Result<T> = std::result::Result<T, Error>;
const MAX_CLOCK: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error(pub String);
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for Error {}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self(e.to_string())
    }
}

/// No runtime schema registration or transitions are provided.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SchemaPreset {
    Text,
    Paragraphs,
    Blocks,
    Nested,
    Shapes,
    Movement,
}
impl SchemaPreset {
    pub fn identity(self) -> &'static str {
        match self {
            Self::Text | Self::Paragraphs => engine::SCHEMA,
            Self::Blocks => engine::GENERAL_SCHEMA,
            Self::Nested => engine::NESTED_SCHEMA,
            Self::Shapes => engine::SHAPES_SCHEMA,
            Self::Movement => engine::MOVE_SCHEMA,
        }
    }
    fn capabilities(self) -> Vec<&'static str> {
        match self {
            Self::Text => vec![],
            Self::Paragraphs => vec![engine::PARAGRAPH_CAPABILITY],
            Self::Blocks => vec![engine::GENERAL_CAPABILITY],
            Self::Nested => vec![engine::NESTED_CAPABILITY],
            Self::Shapes => vec![engine::SHAPES_CAPABILITY],
            Self::Movement => vec![engine::MOVE_CAPABILITY],
        }
    }
}
/// Text is UTF-16 units, including isolated surrogates. Conversion to Rust String is fallible.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Utf16Text(pub Vec<u16>);
impl From<&str> for Utf16Text {
    fn from(s: &str) -> Self {
        Self(s.encode_utf16().collect())
    }
}
impl Utf16Text {
    pub fn units(&self) -> &[u16] {
        &self.0
    }
    pub fn to_string(&self) -> std::result::Result<String, std::string::FromUtf16Error> {
        String::from_utf16(&self.0)
    }
}
/// Stable token key, including engine-owned zero-clock storage heads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Key(String);
impl Key {
    pub fn root() -> Self {
        Self("0@~root".into())
    }
    pub fn from_ticket(t: &Ticket) -> Self {
        Self(format!("{}@{}", t.lamport, t.actor))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn parse(s: impl Into<String>) -> Result<Self> {
        let key = Self(s.into());
        key.ticket()?;
        Ok(key)
    }
    pub fn ticket(&self) -> Result<Ticket> {
        let (clock, actor) = self
            .0
            .split_once('@')
            .ok_or_else(|| Error("invalid token key".into()))?;
        let lamport = clock
            .parse::<u64>()
            .map_err(|_| Error("invalid token clock".into()))?;
        if lamport > MAX_CLOCK || actor.is_empty() {
            return Err(Error("invalid token key".into()));
        }
        Ok(Ticket {
            lamport,
            actor: actor.into(),
        })
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", deny_unknown_fields)]
pub enum Op {
    #[serde(rename = "text")]
    Text {
        id: Ticket,
        origin: Ticket,
        units: Utf16Text,
        marks: Attributes,
    },
    #[serde(rename = "node")]
    Node {
        id: Ticket,
        origin: Ticket,
        #[serde(rename = "type")]
        node_type: String,
        boundary: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        attrs: Option<Attributes>,
    },
    #[serde(rename = "del")]
    Delete { at: Ticket, ids: Vec<Ticket> },
    #[serde(rename = "undel")]
    Undelete {
        at: Ticket,
        ids: Vec<Ticket>,
        cancels: Vec<Ticket>,
    },
    #[serde(rename = "set")]
    Set {
        at: Ticket,
        ids: Vec<Ticket>,
        key: String,
        value: Value,
    },
    #[serde(rename = "move")]
    Move {
        at: Ticket,
        target: Ticket,
        parent: Ticket,
        after: Option<Ticket>,
    },
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    pub ops: Vec<Op>,
    pub caret: Option<String>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditOptions {
    pub caret_before: String,
    pub caret_after: String,
    pub typing: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Selection<T> {
    pub anchor: T,
    pub focus: T,
}
/// Model path indexes. The last component is a UTF-16 offset for text positions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Position(pub Vec<u64>);
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub attrs: Attributes,
    #[serde(default)]
    pub children: Vec<ModelNode>,
    #[serde(default)]
    pub runs: Vec<ModelRun>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ModelRun {
    Text(ModelText),
    Node(ModelNode),
}
/// One projected text run. Offsets and lengths use UTF-16 units.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelText {
    pub units: Utf16Text,
    pub marks: Attributes,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStatus {
    pub can_undo: bool,
    pub can_redo: bool,
    pub pins: Vec<String>,
}

/// Opaque coupled native document/history checkpoint plus exact unacknowledged changes.
/// The data is unauthenticated; store and transport it through a trusted host.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Checkpoint {
    version: u32,
    actor: String,
    preset: SchemaPreset,
    native: Value,
    pending: Vec<Change>,
}
impl Checkpoint {
    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string(self)?)
    }
    pub fn from_json(input: &str) -> Result<Self> {
        let checkpoint: Self = serde_json::from_str(input)?;
        Document::restore(&checkpoint)?;
        Ok(checkpoint)
    }
}
/// One actor and one fixed schema. Each successful local edit adds one pending change.
/// Apply remote operations (or resend pending operations) with `apply_remote`, never `record`.
pub struct Document {
    server: engine::Server,
    actor: String,
    preset: SchemaPreset,
    pending: Vec<Change>,
}
impl Document {
    pub fn new(actor: impl Into<String>, preset: SchemaPreset) -> Result<Self> {
        let mut doc = Self {
            server: engine::Server::default(),
            actor: actor.into(),
            preset,
            pending: vec![],
        };
        let mut config = json!({"actor":doc.actor});
        if preset != SchemaPreset::Text {
            config["capabilities"] = json!(preset.capabilities());
        }
        doc.call("new", config)?;
        Ok(doc)
    }
    pub fn actor(&self) -> &str {
        &self.actor
    }
    pub fn preset(&self) -> SchemaPreset {
        self.preset
    }
    fn call(&mut self, command: &str, extra: Value) -> Result<Value> {
        let mut request =
            json!({"cmd":command,"replica":"document","schema":self.preset.identity()});
        for (key, value) in extra.as_object().expect("internal object") {
            request[key] = value.clone();
        }
        let response = self.server.request(request);
        if response["ok"] != true {
            return Err(Error(
                response["error"]
                    .as_str()
                    .unwrap_or("native engine failure")
                    .into(),
            ));
        }
        Ok(response)
    }
    pub fn model(&mut self) -> Result<ModelNode> {
        Ok(serde_json::from_value(
            self.call("state", json!({}))?["state"]["model"].clone(),
        )?)
    }
    pub fn observed_clock(&mut self) -> Result<u64> {
        self.call("state", json!({}))?["state"]["clock"]
            .as_u64()
            .ok_or_else(|| Error("invalid engine clock".into()))
    }
    /// Next unallocated own ticket. Recording/applying the returned op advances the clock.
    pub fn next_ticket(&mut self) -> Result<Ticket> {
        let clock = self.observed_clock()?;
        if clock >= MAX_CLOCK {
            return Err(Error("clock exhausted".into()));
        }
        Ok(Ticket {
            lamport: clock + 1,
            actor: self.actor.clone(),
        })
    }
    /// Apply remote delivery or exact pending replay. This does not add own history or pending changes.
    pub fn apply_remote(&mut self, ops: &[Op]) -> Result<()> {
        self.call("apply", json!({"ops":ops}))?;
        Ok(())
    }
    /// Apply fresh own operations and record history atomically. This method is not retry-safe.
    pub fn record(&mut self, ops: Vec<Op>, options: EditOptions, now_ms: f64) -> Result<Change> {
        if !now_ms.is_finite() {
            return Err(Error("now_ms must be finite".into()));
        }
        // Local authoring never accepts a replay or a previously observed ticket.
        let mut previous = self.observed_clock()?;
        for op in &ops {
            let (at, width) = match op {
                Op::Text { id, units, .. } => (id, units.0.len().max(1) as u64),
                Op::Node { id, .. } => (id, 1),
                Op::Delete { at, .. }
                | Op::Undelete { at, .. }
                | Op::Set { at, .. }
                | Op::Move { at, .. } => (at, 1),
            };
            if at.actor != self.actor || at.lamport <= previous {
                return Err(Error(
                    "local record requires fresh own tickets in order; use apply_remote for replay"
                        .into(),
                ));
            }
            previous = at
                .lamport
                .checked_add(width - 1)
                .filter(|clock| *clock <= MAX_CLOCK)
                .ok_or_else(|| Error("clock exhausted".into()))?;
        }
        self.history_change(
            "history_record",
            json!({"ops":ops,"options":options,"now":now_ms}),
        )
    }
    // Native commands commit atomically inside Server. SDK decoding must also finish
    // before the caller can observe a commit. Stage on a fresh coupled replica.
    fn stage<T>(
        &mut self,
        command: &str,
        extra: Value,
        decode: impl FnOnce(Value) -> Result<T>,
    ) -> Result<T> {
        let checkpoint = self.call("history_export", json!({}))?["checkpoint"].clone();
        let mut candidate = Self {
            server: engine::Server::default(),
            actor: self.actor.clone(),
            preset: self.preset,
            pending: vec![],
        };
        candidate.call(
            "history_restore",
            json!({"actor":self.actor,"checkpoint":checkpoint}),
        )?;
        let decoded = decode(candidate.call(command, extra)?)?;
        self.server = candidate.server;
        Ok(decoded)
    }
    fn history_change(&mut self, command: &str, extra: Value) -> Result<Change> {
        let change = self.stage(command, extra, |response| {
            Ok(Change {
                ops: serde_json::from_value(response["ops"].clone())?,
                caret: serde_json::from_value(response["caret"].clone())?,
            })
        })?;
        if !change.ops.is_empty() {
            self.pending.push(change.clone());
        }
        Ok(change)
    }
    /// Insert explicit marks at a token anchor. No mark inheritance, split, join, or editor command compilation.
    pub fn insert_text(
        &mut self,
        anchor: &Key,
        text: impl Into<Utf16Text>,
        marks: Attributes,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let units = text.into();
        let id = self.next_ticket()?;
        self.record(
            vec![Op::Text {
                id,
                origin: anchor.ticket()?,
                units,
                marks,
            }],
            options,
            now_ms,
        )
    }
    pub fn delete_text(
        &mut self,
        ids: Vec<Ticket>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let at = self.next_ticket()?;
        self.record(vec![Op::Delete { at, ids }], options, now_ms)
    }
    pub fn set_mark(
        &mut self,
        ids: Vec<Ticket>,
        mark: Mark,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        let at = self.next_ticket()?;
        let (key, value) = match mark {
            Mark::Bold(v) => ("bold", json!(v)),
            Mark::Italic(v) => ("italic", json!(v)),
            Mark::Link(v) => ("link", json!(v)),
        };
        self.record(
            vec![Op::Set {
                at,
                ids,
                key: key.into(),
                value,
            }],
            options,
            now_ms,
        )
    }
    pub fn undo(&mut self) -> Result<Change> {
        self.history_change("history_undo", json!({}))
    }
    pub fn redo(&mut self) -> Result<Change> {
        self.history_change("history_redo", json!({}))
    }
    pub fn history_status(&mut self) -> Result<HistoryStatus> {
        Ok(serde_json::from_value(
            self.call("history_state", json!({}))?["status"].clone(),
        )?)
    }
    pub fn capture_anchor(&mut self, position: Position) -> Result<Option<Key>> {
        let range = Selection {
            anchor: position.clone(),
            focus: position,
        };
        Ok(self.capture_selection(Some(range))?.map(|s| s.anchor))
    }
    pub fn resolve_anchor(&mut self, anchor: &Key) -> Result<Option<Position>> {
        Ok(self
            .resolve_selection(Some(Selection {
                anchor: anchor.clone(),
                focus: anchor.clone(),
            }))?
            .map(|s| s.anchor))
    }
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
    pub fn pending_changes(&self) -> &[Change] {
        &self.pending
    }
    /// Acknowledge an exact sent prefix. A mismatch leaves the queue unchanged.
    pub fn acknowledge(&mut self, changes: &[Change]) -> Result<()> {
        if !self.pending.starts_with(changes) {
            return Err(Error(
                "acknowledgement is not an exact pending prefix".into(),
            ));
        }
        self.pending.drain(..changes.len());
        Ok(())
    }
    pub fn checkpoint(&mut self) -> Result<Checkpoint> {
        Ok(Checkpoint {
            version: 1,
            actor: self.actor.clone(),
            preset: self.preset,
            native: self.call("history_export", json!({}))?["checkpoint"].clone(),
            pending: self.pending.clone(),
        })
    }
    pub fn restore(checkpoint: &Checkpoint) -> Result<Self> {
        if checkpoint.version != 1 {
            return Err(Error("unsupported SDK checkpoint".into()));
        }
        let document = &checkpoint.native["document"];
        let capabilities = document.get("capabilities").cloned().unwrap_or(json!([]));
        if checkpoint.native["actor"] != checkpoint.actor
            || document["schema"] != checkpoint.preset.identity()
            || capabilities != json!(checkpoint.preset.capabilities())
        {
            return Err(Error("checkpoint actor/schema preset mismatch".into()));
        }
        let mut doc = Self {
            server: engine::Server::default(),
            actor: checkpoint.actor.clone(),
            preset: checkpoint.preset,
            pending: vec![],
        };
        doc.call(
            "history_restore",
            json!({"actor":doc.actor,"checkpoint":checkpoint.native}),
        )?;
        // Pending operations must already be present. Exact replay must leave the coupled state intact.
        let before = doc.call("history_export", json!({}))?["checkpoint"].clone();
        for change in &checkpoint.pending {
            for op in &change.ops {
                let own = match op {
                    Op::Text { id, .. } | Op::Node { id, .. } => id,
                    Op::Delete { at, .. }
                    | Op::Undelete { at, .. }
                    | Op::Set { at, .. }
                    | Op::Move { at, .. } => at,
                };
                if own.actor != doc.actor {
                    return Err(Error("pending operation actor mismatch".into()));
                }
            }
            doc.apply_remote(&change.ops)?;
        }
        if doc.call("history_export", json!({}))?["checkpoint"] != before {
            return Err(Error(
                "pending operations are not an exact replay of checkpoint".into(),
            ));
        }
        doc.pending = checkpoint.pending.clone();
        Ok(doc)
    }
    /// Replace only when actor and preset match. Invalid input leaves this document intact.
    pub fn restore_checkpoint(&mut self, checkpoint: &Checkpoint) -> Result<()> {
        if self.actor != checkpoint.actor || self.preset != checkpoint.preset {
            return Err(Error("cannot replace actor or preset".into()));
        }
        let restored = Self::restore(checkpoint)?;
        *self = restored;
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub enum Mark {
    Bold(Option<bool>),
    Italic(Option<bool>),
    Link(Option<String>),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sdk_decode_failure_after_native_acceptance_does_not_commit() {
        let mut doc = Document::new("A", SchemaPreset::Text).unwrap();
        doc.insert_text(
            &Key::root(),
            "x",
            Attributes::new(),
            EditOptions::default(),
            0.0,
        )
        .unwrap();
        let before = doc.checkpoint().unwrap().to_json().unwrap();
        let result: Result<Change> = doc.stage("history_undo", json!({}), |mut response| {
            // Native undo succeeded and emitted a deletion on the staged replica.
            assert!(!response["ops"].as_array().unwrap().is_empty());
            response["ops"][0]["t"] = json!("future-op");
            Ok(Change {
                ops: serde_json::from_value(response["ops"].clone())?,
                caret: None,
            })
        });
        assert!(result.is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
        assert!(doc.history_status().unwrap().can_undo);
        assert!(!doc.undo().unwrap().ops.is_empty());
    }
}
