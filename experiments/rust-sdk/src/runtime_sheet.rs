//! Schema-bound fixed-axis sparse sheets. Field names form an owned registry;
//! no enum or fixed field slots are used. Legacy SparseSheet stays wire-compatible.
use crate::{Error, Result, Ticket, MAX_CLOCK};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{cell::RefCell, collections::BTreeMap, rc::Rc};

const FORMAT: &str = "doc-sync-sparse-sheet-experiment-v2";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RuntimeSheetOptions {
    pub actor: String,
    pub sheet_id: String,
    pub rows: u64,
    pub columns: u64,
    pub schema: SpreadsheetSchema,
}

pub use crate::sparse_sheet::SparseValue as RuntimeValue;
pub type RuntimeCellPatch = BTreeMap<String, RuntimeValue>;
pub type RuntimeCell = BTreeMap<String, RuntimeValue>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RuntimeSheetOp {
    pub at: Ticket,
    pub schema_version: String,
    pub sheet_id: String,
    pub row: u64,
    pub column: u64,
    pub field: String,
    #[serde(deserialize_with = "RuntimeValue::deserialize")]
    pub value: RuntimeValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RuntimeRange {
    pub row: u64,
    pub column: u64,
    pub row_count: u64,
    pub column_count: u64,
    pub limit: Option<u64>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeRangeEntry {
    pub row: u64,
    pub column: u64,
    pub cell: RuntimeCell,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSheetStats {
    pub registers: usize,
    pub retained_ops: usize,
    pub pending: usize,
    pub undo: usize,
    pub redo: usize,
    pub clock: u64,
}

/// Coupled journal, model, history, and exact pending queue. Replay validates
/// consistency, not authenticity. The host must trust the stored checkpoint.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(transparent)]
pub struct RuntimeSheetCheckpoint(Value);
impl RuntimeSheetCheckpoint {
    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string(&self.0)?)
    }
    pub fn to_value(&self) -> Value {
        self.0.clone()
    }
    pub fn from_json(input: &str) -> Result<Self> {
        let sheet = RuntimeSheet::from_state(serde_json::from_str(input)?)?;
        Ok(sheet.checkpoint())
    }
}

#[derive(Debug, Clone, Serialize)]
struct Register {
    at: Ticket,
    value: RuntimeValue,
}
#[derive(Debug, Clone, Serialize)]
struct StateRef {
    at: Option<Ticket>,
    value: RuntimeValue,
}
type Link = Rc<RefCell<StateRef>>;
struct HistoryTarget {
    row: u64,
    column: u64,
    field: String,
    before: Link,
    after: Link,
    undone: bool,
}
impl HistoryTarget {
    fn value(&self) -> Value {
        json!({"row":self.row,"column":self.column,"field":self.field,
            "before":*self.before.borrow(),"after":*self.after.borrow(),"undone":self.undone})
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
enum JournalEntry {
    Set {
        row: u64,
        column: u64,
        patch: RuntimeCellPatch,
        ops: Vec<RuntimeSheetOp>,
    },
    Receive {
        ops: Vec<RuntimeSheetOp>,
    },
    Undo {
        ops: Vec<RuntimeSheetOp>,
    },
    Redo {
        ops: Vec<RuntimeSheetOp>,
    },
    Acknowledge {
        ops: Vec<RuntimeSheetOp>,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    format: String,
    #[serde(rename = "schemaVersion")]
    schema_version: String,
    options: RuntimeSheetOptions,
    journal: Vec<JournalEntry>,
    checkpoint: Value,
}
type Slot = (u64, u64, String);

pub struct RuntimeSheet {
    options: RuntimeSheetOptions,
    schema_version: String,
    clock: u64,
    registers: BTreeMap<Slot, Register>,
    // Preserve insertion order for exact journal/checkpoint parity, including losing ops.
    ledger: Vec<RuntimeSheetOp>,
    identities: BTreeMap<String, usize>,
    pending: Vec<RuntimeSheetOp>,
    undo: Vec<Vec<HistoryTarget>>,
    redo: Vec<Vec<HistoryTarget>>,
    linked: BTreeMap<Slot, Link>,
    journal: Vec<JournalEntry>,
}
fn fail<T>(message: &str) -> Result<T> {
    Err(Error(format!("Runtime sheet: {message}")))
}
fn actor_valid(actor: &str) -> bool {
    !actor.is_empty()
        && actor.len() <= 128
        && actor != "~root"
        && actor
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_~-".contains(&c))
}
fn identity(at: &Ticket) -> String {
    format!("{}@{}", at.lamport, at.actor)
}
fn newer(a: &Ticket, b: &Ticket) -> bool {
    a.lamport > b.lamport || (a.lamport == b.lamport && a.actor > b.actor)
}
impl RuntimeSheet {
    pub fn new(options: RuntimeSheetOptions) -> Result<Self> {
        if !actor_valid(&options.actor)
            || options.sheet_id.is_empty()
            || options.sheet_id.encode_utf16().count() > 256
            || !(1..=MAX_CLOCK).contains(&options.rows)
            || !(1..=MAX_CLOCK).contains(&options.columns)
        {
            return fail("invalid options");
        }
        options.schema.validate()?;
        let schema_version = options.schema.identity()?;
        Ok(Self {
            options,
            schema_version,
            clock: 0,
            registers: BTreeMap::new(),
            ledger: vec![],
            identities: BTreeMap::new(),
            pending: vec![],
            undo: vec![],
            redo: vec![],
            linked: BTreeMap::new(),
            journal: vec![],
        })
    }
    fn coordinate(&self, row: u64, column: u64) -> Result<()> {
        if row >= self.options.rows || column >= self.options.columns {
            return fail("coordinate outside extent");
        }
        Ok(())
    }
    fn validate_op(&self, op: &RuntimeSheetOp) -> Result<()> {
        if !(1..=MAX_CLOCK).contains(&op.at.lamport)
            || !actor_valid(&op.at.actor)
            || op.sheet_id != self.options.sheet_id
            || op.schema_version != self.schema_version
            || !self.options.schema.accepts(&op.field, &op.value)
        {
            return fail("invalid operation");
        }
        self.coordinate(op.row, op.column)
    }
    fn reserve(&self, count: usize) -> Result<()> {
        if count as u64 > MAX_CLOCK - self.clock {
            return fail("Lamport clock exhausted");
        }
        Ok(())
    }
    fn next(&mut self) -> Ticket {
        self.clock += 1;
        Ticket {
            lamport: self.clock,
            actor: self.options.actor.clone(),
        }
    }
    fn apply(&mut self, ops: &[RuntimeSheetOp]) {
        for op in ops {
            let id = identity(&op.at);
            if self.identities.contains_key(&id) {
                continue;
            }
            self.identities.insert(id, self.ledger.len());
            self.ledger.push(op.clone());
            self.clock = self.clock.max(op.at.lamport);
            let key = (op.row, op.column, op.field.clone());
            if self
                .registers
                .get(&key)
                .is_none_or(|current| newer(&op.at, &current.at))
            {
                self.registers.insert(
                    key,
                    Register {
                        at: op.at.clone(),
                        value: op.value.clone(),
                    },
                );
            }
        }
    }
    pub fn set_cell(
        &mut self,
        row: u64,
        column: u64,
        patch: RuntimeCellPatch,
    ) -> Result<Vec<RuntimeSheetOp>> {
        self.coordinate(row, column)?;
        if patch
            .iter()
            .any(|(field, value)| !self.options.schema.accepts(field, value))
        {
            return fail("invalid cell patch");
        }
        if patch.is_empty() {
            return Ok(vec![]);
        }
        self.reserve(patch.len())?;
        let mut ops = vec![];
        let mut targets = vec![];
        for (field, value) in &patch {
            let key = (row, column, field.clone());
            let current = self.registers.get(&key);
            let before = self
                .linked
                .get(&key)
                .filter(|link| {
                    link.borrow()
                        .at
                        .as_ref()
                        .zip(current.map(|r| &r.at))
                        .is_some_and(|(a, b)| a == b)
                })
                .cloned()
                .unwrap_or_else(|| {
                    Rc::new(RefCell::new(StateRef {
                        at: current.map(|r| r.at.clone()),
                        value: current.map_or(RuntimeValue::Null, |r| r.value.clone()),
                    }))
                });
            let at = self.next();
            let after = Rc::new(RefCell::new(StateRef {
                at: Some(at.clone()),
                value: value.clone(),
            }));
            targets.push(HistoryTarget {
                row,
                column,
                field: field.clone(),
                before,
                after: after.clone(),
                undone: false,
            });
            self.linked.insert(key, after);
            ops.push(RuntimeSheetOp {
                at,
                schema_version: self.schema_version.clone(),
                sheet_id: self.options.sheet_id.clone(),
                row,
                column,
                field: field.clone(),
                value: value.clone(),
            });
        }
        self.apply(&ops);
        self.pending.extend(ops.clone());
        self.undo.push(targets);
        self.redo.clear();
        self.journal.push(JournalEntry::Set {
            row,
            column,
            patch,
            ops: ops.clone(),
        });
        Ok(ops)
    }
    /// Validate the complete batch before committing. Duplicate IDs retain their
    /// original payload even when their register write lost.
    pub fn receive(&mut self, ops: &[RuntimeSheetOp]) -> Result<()> {
        let mut staged: BTreeMap<String, &RuntimeSheetOp> = BTreeMap::new();
        let mut fresh = vec![];
        for op in ops {
            self.validate_op(op)?;
            let id = identity(&op.at);
            let known = staged
                .get(&id)
                .copied()
                .or_else(|| self.identities.get(&id).map(|i| &self.ledger[*i]));
            if let Some(known) = known {
                if known != op {
                    return fail("conflicting operation identity");
                }
            } else {
                if op.at.actor == self.options.actor {
                    return fail("unseen operation from this actor; actor forks are unsupported");
                }
                staged.insert(id, op);
                fresh.push(op.clone());
            }
        }
        if !fresh.is_empty() {
            self.apply(&fresh);
            self.journal.push(JournalEntry::Receive { ops: fresh });
        }
        Ok(())
    }
    /// JSON ingress rejects malformed envelopes before any operation is applied.
    pub fn receive_json(&mut self, input: &str) -> Result<()> {
        self.receive(&serde_json::from_str::<Vec<RuntimeSheetOp>>(input)?)
    }
    pub fn get_cell(&self, row: u64, column: u64) -> Result<RuntimeCell> {
        self.coordinate(row, column)?;
        Ok(self
            .registers
            .iter()
            .filter(|((r, c, _), _)| *r == row && *c == column)
            .filter(|(_, r)| r.value != RuntimeValue::Null)
            .map(|((_, _, f), r)| (f.clone(), r.value.clone()))
            .collect())
    }
    pub fn schema_identity(&self) -> &str {
        &self.schema_version
    }
    pub fn get_cell_value(&self, row: u64, column: u64, field: &str) -> Result<RuntimeValue> {
        self.coordinate(row, column)?;
        let spec = self
            .options
            .schema
            .fields
            .get(field)
            .ok_or_else(|| Error("Unknown spreadsheet field".into()))?;
        Ok(self
            .registers
            .get(&(row, column, field.into()))
            .filter(|r| r.value != RuntimeValue::Null)
            .map(|r| r.value.clone())
            .unwrap_or_else(|| spec.default.clone()))
    }
    pub fn get_range(&self, range: RuntimeRange) -> Result<Vec<RuntimeRangeEntry>> {
        if range.row > self.options.rows
            || range.column > self.options.columns
            || range.row_count > self.options.rows - range.row
            || range.column_count > self.options.columns - range.column
            || range.limit.is_some_and(|limit| limit > MAX_CLOCK)
        {
            return fail("invalid range");
        }
        let limit = range.limit.unwrap_or(10_000);
        let mut found: BTreeMap<(u64, u64), RuntimeCell> = BTreeMap::new();
        for ((row, column, field), register) in &self.registers {
            if register.value == RuntimeValue::Null
                || *row < range.row
                || *row >= range.row + range.row_count
                || *column < range.column
                || *column >= range.column + range.column_count
            {
                continue;
            }
            if !found.contains_key(&(*row, *column)) && found.len() as u64 >= limit {
                return fail("range result limit exceeded");
            }
            found
                .entry((*row, *column))
                .or_default()
                .insert(field.clone(), register.value.clone());
        }
        Ok(found
            .into_iter()
            .map(|((row, column), cell)| RuntimeRangeEntry { row, column, cell })
            .collect())
    }
    fn history(&mut self, undo: bool) -> Result<Vec<RuntimeSheetOp>> {
        let source = if undo { &self.undo } else { &self.redo };
        let Some(entry) = source.last() else {
            return Ok(vec![]);
        };
        let selected: Vec<usize> = entry
            .iter()
            .enumerate()
            .filter(|(_, target)| {
                let fence = if undo { &target.after } else { &target.before };
                target.undone != undo
                    && self
                        .registers
                        .get(&(target.row, target.column, target.field.clone()))
                        .is_some_and(|r| fence.borrow().at.as_ref() == Some(&r.at))
            })
            .map(|(i, _)| i)
            .collect();
        self.reserve(selected.len())?;
        let mut entry = if undo {
            self.undo.pop().unwrap()
        } else {
            self.redo.pop().unwrap()
        };
        let mut ops = vec![];
        for index in selected {
            let target = &mut entry[index];
            let state = if undo { &target.before } else { &target.after };
            let at = self.next();
            state.borrow_mut().at = Some(at.clone());
            target.undone = undo;
            self.linked.insert(
                (target.row, target.column, target.field.clone()),
                state.clone(),
            );
            ops.push(RuntimeSheetOp {
                at,
                schema_version: self.schema_version.clone(),
                sheet_id: self.options.sheet_id.clone(),
                row: target.row,
                column: target.column,
                field: target.field.clone(),
                value: state.borrow().value.clone(),
            });
        }
        self.apply(&ops);
        self.pending.extend(ops.clone());
        if undo {
            self.redo.push(entry);
            self.journal.push(JournalEntry::Undo { ops: ops.clone() });
        } else {
            self.undo.push(entry);
            self.journal.push(JournalEntry::Redo { ops: ops.clone() });
        }
        Ok(ops)
    }
    pub fn undo(&mut self) -> Result<Vec<RuntimeSheetOp>> {
        self.history(true)
    }
    pub fn redo(&mut self) -> Result<Vec<RuntimeSheetOp>> {
        self.history(false)
    }
    pub fn pending_changes(&self) -> &[RuntimeSheetOp] {
        &self.pending
    }
    pub fn acknowledge(&mut self, ops: &[RuntimeSheetOp]) -> Result<()> {
        if !self.pending.starts_with(ops) {
            return fail("acknowledgement must match the exact pending prefix");
        }
        if !ops.is_empty() {
            self.pending.drain(..ops.len());
            self.journal
                .push(JournalEntry::Acknowledge { ops: ops.to_vec() });
        }
        Ok(())
    }
    pub fn stats(&self) -> RuntimeSheetStats {
        RuntimeSheetStats {
            registers: self.registers.len(),
            retained_ops: self.ledger.len(),
            pending: self.pending.len(),
            undo: self.undo.len(),
            redo: self.redo.len(),
            clock: self.clock,
        }
    }
    pub fn checkpoint(&self) -> RuntimeSheetCheckpoint {
        let mut registers: Vec<(String, &Register)> = self
            .registers
            .iter()
            .map(|((row, column, field), r)| {
                (
                    serde_json::to_string(&json!([self.options.sheet_id, row, column, field]))
                        .unwrap(),
                    r,
                )
            })
            .collect();
        // JavaScript sorts these serialized slot keys by UTF-16 code units.
        registers.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
        let history = |entries: &Vec<Vec<HistoryTarget>>| {
            entries
                .iter()
                .map(|entry| entry.iter().map(HistoryTarget::value).collect::<Vec<_>>())
                .collect::<Vec<_>>()
        };
        RuntimeSheetCheckpoint(
            json!({"format":FORMAT,"schemaVersion":self.schema_version,"options":self.options,"journal":self.journal,"checkpoint":{
            "clock":self.clock,"registers":registers,"retainedOps":self.ledger,"pending":self.pending,
            "undo":history(&self.undo),"redo":history(&self.redo)}}),
        )
    }
    /// Rebuild aliases by replaying trusted authoring inputs, then compare the
    /// complete checkpoint. Do not accept a detached model or history snapshot.
    pub fn from_state(state: Value) -> Result<Self> {
        let snapshot: Snapshot = serde_json::from_value(state.clone())?;
        if snapshot.format != FORMAT {
            return fail("invalid snapshot format");
        }
        let mut sheet = Self::new(snapshot.options)?;
        if snapshot.schema_version != sheet.schema_version {
            return fail("snapshot schema identity differs");
        }
        for entry in snapshot.journal {
            let count = sheet.journal.len();
            match &entry {
                JournalEntry::Set {
                    row,
                    column,
                    patch,
                    ops,
                } => {
                    if sheet.set_cell(*row, *column, patch.clone())? != *ops {
                        return fail("invalid generated set operations");
                    }
                }
                JournalEntry::Receive { ops } => sheet.receive(ops)?,
                JournalEntry::Undo { ops } => {
                    if sheet.undo()? != *ops {
                        return fail("invalid history replay");
                    }
                }
                JournalEntry::Redo { ops } => {
                    if sheet.redo()? != *ops {
                        return fail("invalid history replay");
                    }
                }
                JournalEntry::Acknowledge { ops } => sheet.acknowledge(ops)?,
            }
            if sheet.journal.len() == count || sheet.journal.last() != Some(&entry) {
                return fail("invalid snapshot journal replay");
            }
        }
        if doc_sync_rust_shadow::runtime_schema::canonical_json(&sheet.checkpoint().0)
            .map_err(Error)?
            != doc_sync_rust_shadow::runtime_schema::canonical_json(&state).map_err(Error)?
            || doc_sync_rust_shadow::runtime_schema::canonical_json(&snapshot.checkpoint)
                .map_err(Error)?
                != doc_sync_rust_shadow::runtime_schema::canonical_json(
                    &sheet.checkpoint().0["checkpoint"],
                )
                .map_err(Error)?
        {
            return fail("snapshot checkpoint does not match replayed state");
        }
        Ok(sheet)
    }
    pub fn restore_checkpoint(&mut self, checkpoint: &RuntimeSheetCheckpoint) -> Result<()> {
        self.restore_state(checkpoint.to_value())
    }
    pub fn restore_state(&mut self, state: Value) -> Result<()> {
        let next = Self::from_state(state)?;
        if next.options != self.options {
            return fail("snapshot actor, sheet, or extent differs");
        }
        *self = next;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SpreadsheetFieldSpec {
    #[serde(rename = "type")]
    pub value_type: String,
    pub default: RuntimeValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<RuntimeValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u64>,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SpreadsheetSchema {
    pub domain: String,
    pub version: u32,
    pub fields: BTreeMap<String, SpreadsheetFieldSpec>,
}
fn scalar_equal(a: &RuntimeValue, b: &RuntimeValue) -> bool {
    match (a, b) {
        (RuntimeValue::Number(a), RuntimeValue::Number(b)) => a == b,
        _ => a == b,
    }
}
impl SpreadsheetFieldSpec {
    fn accepts(&self, v: &RuntimeValue) -> bool {
        if *v == RuntimeValue::Null {
            return true;
        }
        let kind = match v {
            RuntimeValue::Text(_) => "string",
            RuntimeValue::Number(n) if n.is_finite() => "number",
            RuntimeValue::Boolean(_) => "boolean",
            _ => return false,
        };
        if self.value_type != "scalar" && self.value_type != kind {
            return false;
        }
        if self
            .values
            .as_ref()
            .is_some_and(|values| !values.iter().any(|a| scalar_equal(a, v)))
        {
            return false;
        }
        match v {
            RuntimeValue::Number(n) => {
                self.min.is_none_or(|m| *n >= m) && self.max.is_none_or(|m| *n <= m)
            }
            RuntimeValue::Text(s) => self
                .max_length
                .is_none_or(|m| s.encode_utf16().count() as u64 <= m),
            _ => true,
        }
    }
}
impl SpreadsheetSchema {
    pub fn compile(mut value: Value) -> Result<Self> {
        if let Some(fields) = value["fields"].as_object() {
            for spec in fields.values() {
                for key in ["values", "min", "max", "maxLength"] {
                    if spec.get(key).is_some_and(Value::is_null) {
                        return fail("null spreadsheet constraint");
                    }
                }
            }
        }
        if value["version"].as_f64() == Some(1.0) {
            value["version"] = json!(1);
        }
        if let Some(fields) = value["fields"].as_object_mut() {
            for spec in fields.values_mut() {
                if let Some(n) = spec["maxLength"]
                    .as_f64()
                    .filter(|n| n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= 1_000_000.0)
                {
                    spec["maxLength"] = json!(n as u64);
                }
            }
        }
        let data: SpreadsheetSchemaData = serde_json::from_value(value)?;
        let schema = Self {
            domain: data.domain,
            version: data.version,
            fields: data.fields,
        };
        schema.validate()?;
        Ok(schema)
    }
    pub fn identity(&self) -> Result<String> {
        self.validate()?;
        doc_sync_rust_shadow::runtime_schema::json_identity(&serde_json::to_value(self)?)
            .map_err(Error)
    }
    fn accepts(&self, field: &str, value: &RuntimeValue) -> bool {
        self.fields.get(field).is_some_and(|s| s.accepts(value))
    }
    fn validate(&self) -> Result<()> {
        if self.domain != "spreadsheet"
            || self.version != 1
            || self.fields.is_empty()
            || self.fields.len() > 128
        {
            return fail("invalid spreadsheet schema");
        }
        for (name, spec) in &self.fields {
            if name.is_empty()
                || name.len() > 128
                || matches!(name.as_str(), "__proto__" | "prototype" | "constructor")
                || !name.bytes().enumerate().all(|(i, b)| {
                    b.is_ascii_alphabetic()
                        || b == b'_'
                        || i > 0 && (b.is_ascii_digit() || b".-".contains(&b))
                })
            {
                return fail("invalid spreadsheet field name");
            }
            if !["string", "number", "boolean", "scalar"].contains(&spec.value_type.as_str())
                || spec
                    .min
                    .is_some_and(|n| !n.is_finite() || spec.value_type != "number")
                || spec
                    .max
                    .is_some_and(|n| !n.is_finite() || spec.value_type != "number")
                || spec.min.zip(spec.max).is_some_and(|(a, b)| a > b)
                || spec
                    .max_length
                    .is_some_and(|n| spec.value_type != "string" || n > 1_000_000)
            {
                return fail("invalid spreadsheet field constraints");
            }
            if !spec.accepts(&spec.default)
                || matches!(&spec.default,RuntimeValue::Text(s) if s.encode_utf16().count()>1_000_000)
            {
                return fail("invalid spreadsheet default");
            }
            if let Some(values) = &spec.values {
                if values.is_empty() || values.len() > 256 {
                    return fail("invalid spreadsheet enum");
                }
                for (i, v) in values.iter().enumerate() {
                    if *v == RuntimeValue::Null
                        || !spec.accepts(v)
                        || values[..i].iter().any(|old| scalar_equal(old, v))
                        || matches!(v,RuntimeValue::Text(s) if s.encode_utf16().count()>1_000_000)
                    {
                        return fail("invalid spreadsheet enum value");
                    }
                }
            }
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SpreadsheetSchemaData {
    domain: String,
    version: u32,
    fields: BTreeMap<String, SpreadsheetFieldSpec>,
}
impl<'de> Deserialize<'de> for SpreadsheetSchema {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        Self::compile(Value::deserialize(d)?).map_err(serde::de::Error::custom)
    }
}
