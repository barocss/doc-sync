//! Local read bases and strict stored-block insertion targets.
use super::*;
use std::collections::{BTreeMap, BTreeSet};

/// Opaque process-local read base. It is neither a checkpoint nor a server lease.
/// Every successful apply or publication consumes it, including empty/duplicate
/// operations. Reads and acknowledgement alone preserve it. Restore replaces it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelEditBase {
    incarnation: u64,
    revision: u64,
    schema: String,
}
#[derive(Debug, Clone)]
pub struct ModelRead {
    pub model: Value,
    pub base: ModelEditBase,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FlowTarget {
    Root,
    Node(Key),
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RelativeModelTarget {
    Before(Key),
    After(Key),
    InsideStart(FlowTarget),
    InsideEnd(FlowTarget),
}
#[derive(Debug, Clone, PartialEq)]
pub struct RelativeModelInsert {
    pub target: RelativeModelTarget,
    pub model: Value,
}

impl RuntimeDocument {
    /// Read a model and capture its local targeting base in the same call.
    pub fn read_model_for_edit(&mut self) -> Result<ModelRead> {
        let model = self.model()?;
        Ok(ModelRead {
            model,
            base: self.current_model_base(),
        })
    }
    pub(super) fn current_model_base(&self) -> ModelEditBase {
        ModelEditBase { incarnation: self.incarnation, revision: self.revision,
            schema: self.schema.identity().into() }
    }
    pub(super) fn check_model_base(&self, base: &ModelEditBase) -> Result<()> {
        if base.schema != self.schema.identity() {
            return Err(Error("model edit base schema mismatch".into()));
        }
        if base.incarnation != self.incarnation {
            return Err(Error(
                "model edit base belongs to another document instance".into(),
            ));
        }
        if base.revision != self.revision {
            return Err(Error("stale model edit base".into()));
        }
        Ok(())
    }
    /// Insert relative to current visible stored primary blocks or explicit flow
    /// edges. Each target resolves on the evolving detached batch candidate.
    /// No nearest-node fallback, axis/cell wrapper target or distributed guard
    /// is supplied by this API. A failed batch leaves the read base usable.
    pub fn insert_models_relative(
        &mut self,
        base: &ModelEditBase,
        commands: &[RelativeModelInsert],
        options: EditOptions,
        now_ms: f64,
    ) -> Result<ModelInsertBatchResult> {
        self.check_model_base(base)?;
        if self.schema.domain() != "document" {
            return Err(Error("document relative insertion required".into()));
        }
        if !now_ms.is_finite() {
            return Err(Error("now_ms must be finite".into()));
        }
        let clock_before = self.observed_clock()?;
        let mut compiler = Compiler {
            doc: Self::restore(&self.checkpoint()?)?,
            clock: clock_before,
            ops: vec![],
            batch: true,
            column: None,
        };
        let mut keys = Vec::with_capacity(commands.len());
        let mut promoted = false;
        for command in commands {
            let at = compiler.relative_path(&command.target)?;
            keys.push(compiler.compile_model_insert(&mut promoted, &at, &command.model)?);
        }
        let clock_after = compiler.clock;
        let change = self.stage_change(
            "history_record",
            json!({"ops":compiler.ops,"options":options,"now":now_ms,"reservedClock":clock_after}),
        )?;
        Ok(ModelInsertBatchResult {
            keys,
            change,
            clock_before,
            clock_after,
        })
    }
}

pub(super) struct TargetView {
    projections: BTreeMap<String, Vec<Value>>,
    flows: BTreeMap<String, String>,
    alive: BTreeSet<String>,
    boundaries: BTreeMap<String, String>,
    tokens: BTreeMap<String, (String, String)>,
}
impl TargetView {
    pub(super) fn new(compiler: &Compiler, state: &Value) -> Result<Self> {
        let mut births = BTreeMap::new();
        let mut tokens = BTreeMap::new();
        let mut alive = BTreeSet::new();
        for token in state["items"].as_array().into_iter().flatten() {
            let id: Ticket = serde_json::from_value(token["id"].clone())?;
            let key = Key::from_ticket(&id).as_str().to_owned();
            let born = token["born"].as_str().unwrap_or("").to_owned();
            births.insert(key.clone(), born.clone());
            tokens.insert(
                key.clone(),
                (token["kind"].as_str().unwrap_or("").into(), born),
            );
            if token["visible"] == true {
                alive.insert(key);
            }
        }
        let mut flows = BTreeMap::new();
        for line in state["lines"].as_array().into_iter().flatten() {
            let key = line["key"]
                .as_str()
                .ok_or_else(|| Error("target source key missing".into()))?;
            let kind = if key == Key::root().as_str() {
                compiler.doc.schema.effective_manifest()["root"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            } else {
                let Some(owner) = line["owner"].as_str() else {
                    continue;
                };
                let Some(born) = births.get(owner) else {
                    continue;
                };
                if line["slot"]
                    .as_str()
                    .is_some_and(|slot| slot.starts_with("cell:"))
                {
                    let row = compiler.spec(born)["children"][0].as_str().unwrap();
                    let cell = compiler.spec(row)["children"][0].as_str().unwrap();
                    compiler.spec(cell)["children"][0]
                        .as_str()
                        .unwrap()
                        .to_owned()
                } else {
                    born.clone()
                }
            };
            flows.insert(key.into(), kind);
        }
        let mut projections = BTreeMap::new();
        for source in state["projections"].as_array().into_iter().flatten() {
            let line = source["line"]
                .as_str()
                .ok_or_else(|| Error("target projection line missing".into()))?;
            let blocks = source["blocks"]
                .as_array()
                .ok_or_else(|| Error("target projection blocks missing".into()))?;
            projections.insert(
                line.into(),
                blocks
                    .iter()
                    .filter(|block| {
                        !(block["virtual"] == true
                            && block["chars"].as_array().is_some_and(Vec::is_empty))
                    })
                    .cloned()
                    .collect(),
            );
        }
        Ok(Self {
            projections,
            flows,
            alive,
            boundaries: Compiler::required_boundaries(state)?,
            tokens,
        })
    }
}

impl TargetView {
    pub(super) fn require_stored_kind(&self, key: &Key, born: Option<&str>) -> Result<()> {
        let ticket = key.ticket()?;
        let token = self.tokens.get(key.as_str());
        if ticket.lamport == 0
            || ticket.actor.starts_with("~required:")
            || !self.alive.contains(key.as_str())
            || token.is_none_or(|(kind, node_type)| {
                kind != "node" || born.is_some_and(|expected| expected != node_type)
            })
        {
            return Err(Error(
                "relative target requires a live stored block of the expected kind".into(),
            ));
        }
        Ok(())
    }
    pub(super) fn cell_lines(grid: &Value) -> Result<BTreeMap<(&str, &str), &str>> {
        let mut cells = BTreeMap::new();
        for cell in grid["cells"].as_array().into_iter().flatten() {
            let row = cell["row"]
                .as_str()
                .ok_or_else(|| Error("target cell row missing".into()))?;
            let col = cell["col"]
                .as_str()
                .ok_or_else(|| Error("target cell column missing".into()))?;
            let line = cell["line"]
                .as_str()
                .ok_or_else(|| Error("target cell line missing".into()))?;
            if cells.insert((row, col), line).is_some() {
                return Err(Error("ambiguous target cell projection".into()));
            }
        }
        Ok(cells)
    }
}

pub(super) struct LocatedBlock {
    pub(super) path: Vec<usize>,
    pub(super) node: Value,
    pub(super) projection: Value,
}

impl Compiler {
    fn relative_path(&mut self, target: &RelativeModelTarget) -> Result<Vec<usize>> {
        let state = self.doc.state()?;
        if matches!(
            target,
            RelativeModelTarget::InsideStart(FlowTarget::Root)
                | RelativeModelTarget::InsideEnd(FlowTarget::Root)
        ) {
            return Ok(vec![
                if matches!(target, RelativeModelTarget::InsideStart(_)) {
                    0
                } else {
                    state["model"]["children"].as_array().map_or(0, Vec::len)
                },
            ]);
        }
        let key = match target {
            RelativeModelTarget::Before(key)
            | RelativeModelTarget::After(key)
            | RelativeModelTarget::InsideStart(FlowTarget::Node(key))
            | RelativeModelTarget::InsideEnd(FlowTarget::Node(key)) => key,
            _ => unreachable!(),
        };
        let view = TargetView::new(self, &state)?;
        let LocatedBlock { mut path, node, .. } =
            self.locate_stored_block_in(key, &state, &view)?;
        match target {
            RelativeModelTarget::Before(_) => Ok(path),
            RelativeModelTarget::After(_) => {
                let last = path
                    .last_mut()
                    .ok_or_else(|| Error("root is not a sibling target".into()))?;
                *last = last
                    .checked_add(1)
                    .ok_or_else(|| Error("model index exhausted".into()))?;
                Ok(path)
            }
            _ => {
                if self.spec(node["type"].as_str().unwrap_or(""))["shape"] != "flow" {
                    return Err(Error("inside target requires a stored flow".into()));
                }
                path.push(if matches!(target, RelativeModelTarget::InsideStart(_)) {
                    0
                } else {
                    node["children"].as_array().map_or(0, Vec::len)
                });
                Ok(path)
            }
        }
    }

    pub(super) fn locate_stored_block_in(
        &mut self,
        key: &Key,
        state: &Value,
        view: &TargetView,
    ) -> Result<LocatedBlock> {
        view.require_stored_kind(key, None)?;
        let mut found = vec![];
        self.walk_target_flow(
            Key::root().as_str(),
            &[],
            &state["model"],
            view,
            Some(key.as_str()),
            &mut BTreeSet::new(),
            &mut found,
        )?;
        if found.len() != 1 {
            return Err(Error(
                "relative target is not one current visible primary block".into(),
            ));
        }
        Ok(found.pop().unwrap())
    }

    pub(super) fn catalog_blocks_in(&mut self, state: &Value, view: &TargetView) -> Result<Vec<LocatedBlock>> {
        let mut found = vec![];
        self.walk_target_flow(Key::root().as_str(), &[], &state["model"], view, None,
            &mut BTreeSet::new(), &mut found)?;
        Ok(found)
    }

    fn empty_default_prefix(&self, flow: &str, node: &Value) -> bool {
        let Some(default) = self.spec(flow)["default"].as_str() else {
            return false;
        };
        if node["type"] == default {
            return node["runs"].as_array().is_some_and(Vec::is_empty);
        }
        let Some((group, _)) = self.group_owner_for_flow(flow, default) else {
            return false;
        };
        node["type"] == group
            && node["children"].as_array().is_some_and(|children| {
                children.len() == 1
                    && children[0]["type"] == default
                    && children[0]["runs"].as_array().is_some_and(Vec::is_empty)
            })
    }

    fn walk_target_flow(
        &mut self,
        line: &str,
        path: &[usize],
        model: &Value,
        view: &TargetView,
        target: Option<&str>,
        stack: &mut BTreeSet<String>,
        found: &mut Vec<LocatedBlock>,
    ) -> Result<()> {
        if path.len() > 192 || !stack.insert(line.into()) {
            return Err(Error(
                "relative target ancestry is cyclic or too deep".into(),
            ));
        }
        let blocks = view
            .projections
            .get(line)
            .ok_or_else(|| Error("target flow projection missing".into()))?;
        let flow = view
            .flows
            .get(line)
            .ok_or_else(|| Error("target flow type missing".into()))?;
        let entries = self.entries_for_projection(flow, blocks, &view.boundaries);
        let children = model["children"]
            .as_array()
            .ok_or_else(|| Error("target flow model children missing".into()))?;
        // The model can prepend one empty default text/group whose virtual
        // projection is omitted from compiler entries. Preserve its model slot.
        let offset = children
            .len()
            .checked_sub(entries.len())
            .filter(|n| *n <= 1)
            .ok_or_else(|| Error("unsupported relative target projection layout".into()))?;
        if offset == 1
            && (line.starts_with("0@~required:") || !self.empty_default_prefix(flow, &children[0]))
        {
            return Err(Error("unsupported relative target default prefix".into()));
        }
        for (entry_index, (flats, group)) in entries.iter().enumerate() {
            let entry_model = &children[entry_index + offset];
            for (member, flat) in flats.iter().enumerate() {
                let block = &blocks[*flat];
                let mut block_path = path.to_vec();
                block_path.push(entry_index + offset);
                let node = if group.is_some() {
                    block_path.push(member);
                    entry_model["children"]
                        .as_array()
                        .and_then(|nodes| nodes.get(member))
                        .ok_or_else(|| Error("target group model member missing".into()))?
                } else {
                    entry_model
                };
                if node["type"] != block["type"] {
                    return Err(Error("unsupported relative target model mapping".into()));
                }
                let marker = block["marker"]
                    .as_str()
                    .ok_or_else(|| Error("target marker missing".into()))?;
                let alive = view.alive.contains(marker);
                if target.is_none_or(|target| marker == target) && block["virtual"] != true && alive {
                    found.push(LocatedBlock {
                        path: block_path.clone(),
                        node: if target.is_none() { json!({"type": node["type"]}) } else { node.clone() },
                        projection: if target.is_none() && block["kind"] != "grid" {
                            json!({"marker": block["marker"], "type": block["type"], "kind": block["kind"]})
                        } else { block.clone() },
                    });
                }
                if !alive {
                    continue;
                }
                if block["kind"] == "flow" {
                    let body = block["body"]
                        .as_str()
                        .ok_or_else(|| Error("target flow body missing".into()))?;
                    self.walk_target_flow(body, &block_path, node, view, target, stack, found)?;
                } else if block["kind"] == "grid" {
                    self.walk_target_cells(block, &block_path, node, view, target, stack, found)?;
                }
            }
        }
        stack.remove(line);
        Ok(())
    }

    fn walk_target_cells(
        &mut self,
        grid: &Value,
        path: &[usize],
        model: &Value,
        view: &TargetView,
        target: Option<&str>,
        stack: &mut BTreeSet<String>,
        found: &mut Vec<LocatedBlock>,
    ) -> Result<()> {
        let cells = TargetView::cell_lines(grid)?;
        for (row, row_key) in grid["rows"].as_array().into_iter().flatten().enumerate() {
            for (col, col_key) in grid["cols"].as_array().into_iter().flatten().enumerate() {
                if grid["covered"].get(format!("{row},{col}")).is_some() {
                    continue;
                }
                let row_key = row_key
                    .as_str()
                    .ok_or_else(|| Error("target row axis missing".into()))?;
                let col_key = col_key
                    .as_str()
                    .ok_or_else(|| Error("target column axis missing".into()))?;
                if !view.alive.contains(row_key) || !view.alive.contains(col_key) {
                    return Err(Error("target grid axis is not alive".into()));
                }
                let line = cells
                    .get(&(row_key, col_key))
                    .ok_or_else(|| Error("target cell projection missing".into()))?;
                let mut body_path = path.to_vec();
                body_path.extend([row, col, 0]);
                self.walk_target_flow(
                    line,
                    &body_path,
                    &model["children"][row]["children"][col]["children"][0],
                    view,
                    target,
                    stack,
                    found,
                )?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incarnation_allocation_is_unique_under_bounded_thread_races() {
        let counter = std::sync::Arc::new(AtomicU64::new(1));
        let threads = (0..4)
            .map(|_| {
                let counter = counter.clone();
                std::thread::spawn(move || {
                    (0..32)
                        .map(|_| allocate_from(&counter).unwrap())
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>();
        let values = threads
            .into_iter()
            .flat_map(|thread| thread.join().unwrap())
            .collect::<BTreeSet<_>>();
        assert_eq!(values.len(), 128);
        assert_eq!(counter.load(Ordering::Relaxed), 129);
        let counter = std::sync::Arc::new(AtomicU64::new(u64::MAX - 2));
        let threads = (0..8)
            .map(|_| {
                let counter = counter.clone();
                std::thread::spawn(move || allocate_from(&counter).ok())
            })
            .collect::<Vec<_>>();
        let values = threads
            .into_iter()
            .filter_map(|thread| thread.join().unwrap())
            .collect::<BTreeSet<_>>();
        assert_eq!(values, BTreeSet::from([u64::MAX - 2, u64::MAX - 1]));
        assert_eq!(counter.load(Ordering::Relaxed), u64::MAX);
    }
    #[test]
    fn checked_local_counters_fail_before_publication() {
        let counter = AtomicU64::new(u64::MAX);
        assert!(allocate_from(&counter).is_err());
        assert_eq!(counter.load(Ordering::Relaxed), u64::MAX);
        let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
            "doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}
        }}))
        .unwrap();
        let mut doc = RuntimeDocument::new("A", schema).unwrap();
        doc.revision = u64::MAX;
        let before = doc.checkpoint().unwrap().to_json().unwrap();
        assert!(doc.apply_remote(&[]).is_err());
        assert!(doc
            .insert_models_batch(&[], EditOptions::default(), 1.)
            .is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
    }
}
