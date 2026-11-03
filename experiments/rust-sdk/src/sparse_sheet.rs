//! Private fixed-axis sparse sheet experiment. No structural axes, formula evaluation,
//! Client adapter, transport, or garbage collection are provided.
use crate::{Error, Result, Ticket, MAX_CLOCK};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{cell::RefCell, collections::BTreeMap, rc::Rc};

const FORMAT: &str = "doc-sync-sparse-sheet-experiment-v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SparseSheetOptions {
    pub actor: String,
    pub sheet_id: String,
    pub rows: u64,
    pub columns: u64,
}

/// Declaration order defines local operation allocation order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SparseField {
    Value,
    Formula,
    Fill,
    Bold,
    NumberFormat,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SparseValue {
    Text(String),
    Number(f64),
    Boolean(bool),
    Null,
}
pub type SparseCellPatch = BTreeMap<SparseField, SparseValue>;
pub type SparseCell = BTreeMap<SparseField, SparseValue>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SparseSheetOp {
    pub at: Ticket,
    pub sheet_id: String,
    pub row: u64,
    pub column: u64,
    pub field: SparseField,
    #[serde(deserialize_with = "SparseValue::deserialize")]
    pub value: SparseValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SparseRange {
    pub row: u64,
    pub column: u64,
    pub row_count: u64,
    pub column_count: u64,
    pub limit: Option<u64>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SparseRangeEntry {
    pub row: u64,
    pub column: u64,
    pub cell: SparseCell,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SparseSheetStats {
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
pub struct SparseSheetCheckpoint(Value);
impl SparseSheetCheckpoint {
    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string(&self.0)?)
    }
    pub fn to_value(&self) -> Value {
        self.0.clone()
    }
    pub fn from_json(input: &str) -> Result<Self> {
        let sheet = SparseSheet::from_state(serde_json::from_str(input)?)?;
        Ok(sheet.checkpoint())
    }
}

#[derive(Debug, Clone, Serialize)]
struct Register {
    at: Ticket,
    value: SparseValue,
}
#[derive(Debug, Clone, Serialize)]
struct StateRef {
    at: Option<Ticket>,
    value: SparseValue,
}
type Link = Rc<RefCell<StateRef>>;
struct HistoryTarget {
    row: u64,
    column: u64,
    field: SparseField,
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
        patch: SparseCellPatch,
        ops: Vec<SparseSheetOp>,
    },
    Receive {
        ops: Vec<SparseSheetOp>,
    },
    Undo {
        ops: Vec<SparseSheetOp>,
    },
    Redo {
        ops: Vec<SparseSheetOp>,
    },
    Acknowledge {
        ops: Vec<SparseSheetOp>,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    format: String,
    options: SparseSheetOptions,
    journal: Vec<JournalEntry>,
    checkpoint: Value,
}
type Slot = (u64, u64, SparseField);

pub struct SparseSheet {
    options: SparseSheetOptions,
    clock: u64,
    registers: BTreeMap<Slot, Register>,
    // Preserve insertion order for exact journal/checkpoint parity, including losing ops.
    ledger: Vec<SparseSheetOp>,
    identities: BTreeMap<String, usize>,
    pending: Vec<SparseSheetOp>,
    undo: Vec<Vec<HistoryTarget>>,
    redo: Vec<Vec<HistoryTarget>>,
    linked: BTreeMap<Slot, Link>,
    journal: Vec<JournalEntry>,
}
fn fail<T>(message: &str) -> Result<T> {
    Err(Error(format!("Sparse sheet: {message}")))
}
fn actor_valid(actor: &str) -> bool {
    !actor.is_empty()
        && actor.len() <= 128
        && actor != "~root"
        && actor
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_~-".contains(&c))
}
fn valid_value(field: SparseField, value: &SparseValue) -> bool {
    match value {
        SparseValue::Null => true,
        SparseValue::Number(v) => field == SparseField::Value && v.is_finite(),
        SparseValue::Boolean(_) => matches!(field, SparseField::Value | SparseField::Bold),
        SparseValue::Text(_) => field != SparseField::Bold,
    }
}
fn identity(at: &Ticket) -> String {
    format!("{}@{}", at.lamport, at.actor)
}
fn newer(a: &Ticket, b: &Ticket) -> bool {
    a.lamport > b.lamport || (a.lamport == b.lamport && a.actor > b.actor)
}
impl SparseSheet {
    pub fn new(options: SparseSheetOptions) -> Result<Self> {
        if !actor_valid(&options.actor)
            || options.sheet_id.is_empty()
            || options.sheet_id.encode_utf16().count() > 256
            || !(1..=MAX_CLOCK).contains(&options.rows)
            || !(1..=MAX_CLOCK).contains(&options.columns)
        {
            return fail("invalid options");
        }
        Ok(Self {
            options,
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
    fn validate_op(&self, op: &SparseSheetOp) -> Result<()> {
        if !(1..=MAX_CLOCK).contains(&op.at.lamport)
            || !actor_valid(&op.at.actor)
            || op.sheet_id != self.options.sheet_id
            || !valid_value(op.field, &op.value)
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
    fn apply(&mut self, ops: &[SparseSheetOp]) {
        for op in ops {
            let id = identity(&op.at);
            if self.identities.contains_key(&id) {
                continue;
            }
            self.identities.insert(id, self.ledger.len());
            self.ledger.push(op.clone());
            self.clock = self.clock.max(op.at.lamport);
            let key = (op.row, op.column, op.field);
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
        patch: SparseCellPatch,
    ) -> Result<Vec<SparseSheetOp>> {
        self.coordinate(row, column)?;
        if patch
            .iter()
            .any(|(field, value)| !valid_value(*field, value))
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
            let key = (row, column, *field);
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
                        value: current.map_or(SparseValue::Null, |r| r.value.clone()),
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
                field: *field,
                before,
                after: after.clone(),
                undone: false,
            });
            self.linked.insert(key, after);
            ops.push(SparseSheetOp {
                at,
                sheet_id: self.options.sheet_id.clone(),
                row,
                column,
                field: *field,
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
    pub fn receive(&mut self, ops: &[SparseSheetOp]) -> Result<()> {
        let mut staged: BTreeMap<String, &SparseSheetOp> = BTreeMap::new();
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
        self.receive(&serde_json::from_str::<Vec<SparseSheetOp>>(input)?)
    }
    pub fn get_cell(&self, row: u64, column: u64) -> Result<SparseCell> {
        self.coordinate(row, column)?;
        Ok(self
            .registers
            .range((row, column, SparseField::Value)..=(row, column, SparseField::NumberFormat))
            .filter(|(_, r)| r.value != SparseValue::Null)
            .map(|((_, _, f), r)| (*f, r.value.clone()))
            .collect())
    }
    pub fn get_range(&self, range: SparseRange) -> Result<Vec<SparseRangeEntry>> {
        if range.row > self.options.rows
            || range.column > self.options.columns
            || range.row_count > self.options.rows - range.row
            || range.column_count > self.options.columns - range.column
            || range.limit.is_some_and(|limit| limit > MAX_CLOCK)
        {
            return fail("invalid range");
        }
        let limit = range.limit.unwrap_or(10_000);
        let mut found: BTreeMap<(u64, u64), SparseCell> = BTreeMap::new();
        for ((row, column, field), register) in &self.registers {
            if register.value == SparseValue::Null
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
                .insert(*field, register.value.clone());
        }
        Ok(found
            .into_iter()
            .map(|((row, column), cell)| SparseRangeEntry { row, column, cell })
            .collect())
    }
    fn history(&mut self, undo: bool) -> Result<Vec<SparseSheetOp>> {
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
                        .get(&(target.row, target.column, target.field))
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
            self.linked
                .insert((target.row, target.column, target.field), state.clone());
            ops.push(SparseSheetOp {
                at,
                sheet_id: self.options.sheet_id.clone(),
                row: target.row,
                column: target.column,
                field: target.field,
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
    pub fn undo(&mut self) -> Result<Vec<SparseSheetOp>> {
        self.history(true)
    }
    pub fn redo(&mut self) -> Result<Vec<SparseSheetOp>> {
        self.history(false)
    }
    pub fn pending_changes(&self) -> &[SparseSheetOp] {
        &self.pending
    }
    pub fn acknowledge(&mut self, ops: &[SparseSheetOp]) -> Result<()> {
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
    pub fn stats(&self) -> SparseSheetStats {
        SparseSheetStats {
            registers: self.registers.len(),
            retained_ops: self.ledger.len(),
            pending: self.pending.len(),
            undo: self.undo.len(),
            redo: self.redo.len(),
            clock: self.clock,
        }
    }
    pub fn checkpoint(&self) -> SparseSheetCheckpoint {
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
        SparseSheetCheckpoint(
            json!({"format":FORMAT,"options":self.options,"journal":self.journal,"checkpoint":{
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
        if sheet.checkpoint().0 != state
            || snapshot.checkpoint != sheet.checkpoint().0["checkpoint"]
        {
            return fail("snapshot checkpoint does not match replayed state");
        }
        Ok(sheet)
    }
    pub fn restore_checkpoint(&mut self, checkpoint: &SparseSheetCheckpoint) -> Result<()> {
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
