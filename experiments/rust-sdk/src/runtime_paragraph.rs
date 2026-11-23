//! Bounded model-position insertion. Physical token APIs keep their own contract.
use super::*;
#[path = "runtime_structure.rs"]
mod structure;
#[path = "runtime_batch.rs"]
mod batch;
#[path = "runtime_targeting.rs"]
mod targeting;
#[path = "runtime_grid_targeting.rs"]
mod grid_targeting;
#[path = "runtime_column_targeting.rs"]
mod column_targeting;
#[path = "runtime_id_catalog.rs"]
mod id_catalog;
pub use id_catalog::{ModelCatalogRead, ModelTargetCatalog, StoredModelTarget, GridTargetCatalog, CatalogCell};
pub use column_targeting::{ColumnBoundary, RowCellPayload, ColumnInsert};
pub use grid_targeting::{GridRowTarget, GridCellTarget, GridModelTarget, GridModelInsert};
pub use targeting::{ModelEditBase, ModelRead, FlowTarget, RelativeModelTarget, RelativeModelInsert};
pub use batch::{ModelInsert, ModelInsertBatchResult};

struct ColumnMemo {
    grid: String,
    index: usize,
    key: Key,
    rows: std::collections::BTreeSet<String>,
}

struct Compiler {
    doc: RuntimeDocument,
    clock: u64,
    ops: Vec<Op>,
    batch: bool,
    column: Option<ColumnMemo>,
}

impl RuntimeDocument {
    /// Insert one text block at a model child path, such as `[1, 0]`.
    /// The final index is a child index, not a UTF-16 offset. Text, inline and
    /// span runs are supported. Paths can address group members and cell bodies.
    /// The complete insertion commits as one atomic history transaction.
    pub fn insert_paragraph_at(
        &mut self,
        at: &[usize],
        paragraph: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        let kind = paragraph["type"].as_str().unwrap_or("");
        if self.schema.effective_manifest()["nodes"][kind]["shape"] != "text" {
            return Err(Error("paragraph insertion requires a text node".into()));
        }
        self.insert_model_at(at, paragraph, options, now_ms)
    }

    /// Insert one text, flow, group, or nonempty grid at a model child path.
    /// Row and cell models add a row or column under a grid or row parent.
    /// A group returns its first member key; row/cell insertions return the new
    /// axis key. Empty group/grid inputs and text-offset insertion reject.
    /// Existing movements use logical placement.
    pub fn insert_model_at(
        &mut self,
        at: &[usize],
        model: Value,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<(Key, Change)> {
        if self.schema.domain() != "document" || at.is_empty() {
            return Err(Error("document model child path required".into()));
        }
        let checkpoint = self.checkpoint()?;
        let mut compiler = Compiler {
            doc: Self::restore(&checkpoint)?,
            clock: self.observed_clock()?,
            ops: vec![],
            batch: false,
            column: None,
        };
        compiler.validate_node(&model, 0)?;
        compiler.promote_virtual_text()?;
        let key = compiler.insert_at(at, &model)?
            .ok_or_else(|| Error("empty insertion has no stored key".into()))?;
        if compiler.doc.observed_clock()? != compiler.clock {
            return Err(Error(
                "model insertion with trailing reserved tickets is unsupported".into(),
            ));
        }
        Ok((
            key,
            self.record_compiled_model(compiler.ops, options, now_ms)?,
        ))
    }
    fn record_compiled_model(
        &mut self,
        ops: Vec<Op>,
        options: EditOptions,
        now_ms: f64,
    ) -> Result<Change> {
        if !now_ms.is_finite() {
            return Err(Error("now_ms must be finite".into()));
        }
        let before = self.observed_clock()?;
        let mut ranges = vec![];
        for op in &ops {
            let (at, width) = match op.raw_operation() {
                Op::Node { id, .. } => (id, 1),
                Op::Text { id, units, .. } => (id, units.0.len().max(1) as u64),
                Op::Set { at, .. }
                | Op::Move { at, .. }
                | Op::Delete { at, .. }
                | Op::Undelete { at, .. } => (at, 1),
                Op::Reference { .. } => unreachable!(),
            };
            let end = at
                .lamport
                .checked_add(width - 1)
                .filter(|end| *end <= MAX_CLOCK)
                .ok_or_else(|| Error("compiled ticket range exceeds clock capacity".into()))?;
            if at.actor != self.actor || at.lamport <= before {
                return Err(Error(
                    "compiled operations require fresh own tickets".into(),
                ));
            }
            ranges.push((at.lamport, end));
        }
        ranges.sort_unstable();
        if ranges.windows(2).any(|pair| pair[0].1 >= pair[1].0) {
            return Err(Error("compiled ticket ranges overlap".into()));
        }
        self.stage_change(
            "history_record",
            json!({"ops":ops,"options":options,"now":now_ms}),
        )
    }
}

impl Compiler {
    fn uses_projection(&mut self) -> Result<bool> {
        Ok(self.doc.state()?["moves"]
            .as_array()
            .is_some_and(|moves| !moves.is_empty()))
    }
    fn promote_virtual_text(&mut self) -> Result<()> {
        if !self.uses_projection()? {
            return Ok(());
        }
        let mut sources = self.doc.call("source_projections", json!({}))?["projections"]
            .as_array()
            .cloned()
            .ok_or_else(|| Error("source projections missing".into()))?;
        sources.retain(|source| {
            source["blocks"].as_array().is_some_and(|blocks| {
                blocks.iter().any(|block| {
                    block["kind"] == "text"
                        && block["virtual"] == true
                        && block["chars"]
                            .as_array()
                            .is_some_and(|chars| !chars.is_empty())
                })
            })
        });
        sources.sort_by(|left, right| {
            left["line"]
                .as_str()
                .unwrap()
                .encode_utf16()
                .cmp(right["line"].as_str().unwrap().encode_utf16())
        });
        for source in sources {
            for block in source["blocks"].as_array().into_iter().flatten() {
                let Some(first) = block["chars"]
                    .as_array()
                    .and_then(|chars| chars.first())
                    .and_then(Value::as_str)
                else {
                    continue;
                };
                if block["kind"] != "text" || block["virtual"] != true {
                    continue;
                }
                let marker = block["marker"]
                    .as_str()
                    .ok_or_else(|| Error("source marker missing".into()))?;
                let id = self.next()?;
                self.emit(vec![Op::Node {
                    id,
                    origin: Key::parse(marker)?.ticket()?,
                    node_type: block["type"].as_str().unwrap().into(),
                    boundary: format!("virtual:{marker}|{first}"),
                    attrs: None,
                }])?;
            }
        }
        Ok(())
    }
    fn placement_after(&mut self, line: &str, block: &Value) -> Result<Ticket> {
        let marker = block["marker"]
            .as_str()
            .ok_or_else(|| Error("placement marker missing".into()))?;
        let target = if block["virtual"] == true
            && !marker.starts_with("0@~text:")
            && !marker.starts_with("0@~fragment:")
        {
            format!(
                "0@~text:{}:{}",
                RuntimeDocument::encode_required_part(line),
                RuntimeDocument::encode_required_part(marker)
            )
        } else {
            marker.to_owned()
        };
        let state = self.doc.state()?;
        if let Some(at) = state["placements"][&target].get("at") {
            return serde_json::from_value(at.clone()).map_err(Error::from);
        }
        Key::parse(target)?.ticket()
    }
    fn chain_block(
        &mut self,
        line: &str,
        origin: Ticket,
        right: &str,
        node: &Value,
        after: Option<Ticket>,
    ) -> Result<(Option<Key>, Ticket, Option<Ticket>)> {
        let kind = node["type"].as_str().unwrap();
        let fence = if self.spec(kind)["shape"] == "text"
            && !self.doc.constrained_child(&Key::parse(line)?, kind)?
        {
            self.insertion_right(line, &origin, right, after.as_ref())?
        } else {
            right.to_owned()
        };
        let (key, last) = self.block(line, origin, &fence, node)?;
        let mut placement = None;
        if key.is_some() && self.uses_projection()? {
            let at = self.next()?;
            placement = Some(at.clone());
            self.emit(vec![Op::Move {
                at,
                target: key.as_ref().unwrap().ticket()?,
                parent: Key::parse(line)?.ticket()?,
                after,
            }])?;
        }
        Ok((key, last, placement))
    }
    /// Keep a moved-away source class separate while preserving coalescence
    /// for concurrent births at the same observed physical gap.
    fn insertion_right(
        &mut self,
        line: &str,
        origin: &Ticket,
        right: &str,
        after: Option<&Ticket>,
    ) -> Result<String> {
        if !self.uses_projection()? {
            return Ok(right.to_owned());
        }
        let state = self.doc.state()?;
        let source = state["lines"].as_array().and_then(|lines| {
            lines.iter().find(|source| {
                source["items"]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|item| item["id"] == json!(origin)))
            })
        });
        let Some(source) = source else {
            // The native engine creates a fresh detached head on its first
            // operation. An absent source has no existing text class to fence.
            if origin.lamport == 0 && origin.actor.starts_with("~fragment:") {
                return Ok(right.to_owned());
            }
            return Err(Error("insertion origin source missing".into()));
        };
        let items = source["items"]
            .as_array()
            .ok_or_else(|| Error("source tokens missing".into()))?;
        let response = self.doc.call("source_projections", json!({}))?;
        let blocks = response["projections"]
            .as_array()
            .and_then(|sources| sources.iter().find(|entry| entry["line"] == source["key"]))
            .and_then(|entry| entry["blocks"].as_array())
            .ok_or_else(|| Error("physical source projection missing".into()))?;
        let primaries = blocks
            .iter()
            .filter(|block| block["kind"] == "text" && block["virtual"] != true)
            .filter_map(|block| block["marker"].as_str())
            .collect::<std::collections::BTreeSet<_>>();
        let boundary = format!("{}|{right}", Key::from_ticket(origin).as_str());
        let mut physical = vec![];
        for item in items {
            let id: Ticket = serde_json::from_value(item["id"].clone())?;
            physical.push((Key::from_ticket(&id).as_str().to_owned(), item));
        }
        let collision = physical
            .iter()
            .find(|(key, item)| primaries.contains(key.as_str()) && item["boundary"] == boundary);
        let Some((collision, _)) = collision else {
            return Ok(right.to_owned());
        };
        if let Some(placement) = state["placements"].get(collision) {
            let after = after.map(|at| Key::from_ticket(at).as_str().to_owned());
            if placement["parent"] == line && placement["after"] == json!(after) {
                return Ok(right.to_owned());
            }
        }
        let start = items
            .iter()
            .position(|item| item["id"] == json!(origin))
            .ok_or_else(|| Error("physical origin token missing".into()))?;
        Ok(physical
            .iter()
            .skip(start + 1)
            .find(|(key, _)| primaries.contains(key.as_str()))
            .map(|(key, _)| key.clone())
            .unwrap_or_else(|| right.to_owned()))
    }
    fn spec(&self, kind: &str) -> &Value {
        &self.doc.schema.effective_manifest()["nodes"][kind]
    }
    fn next(&mut self) -> Result<Ticket> {
        self.clock = self
            .clock
            .checked_add(1)
            .filter(|n| *n <= MAX_CLOCK)
            .ok_or_else(|| Error("clock exhausted".into()))?;
        Ok(Ticket {
            lamport: self.clock,
            actor: self.doc.actor.clone(),
        })
    }
    fn emit(&mut self, ops: Vec<Op>) -> Result<()> {
        self.doc.apply_remote(&ops)?;
        self.ops.extend(ops);
        Ok(())
    }
    fn attrs(node: &Value) -> Result<Attributes> {
        match node.get("attrs") {
            None => Ok(Attributes::new()),
            Some(value) => serde_json::from_value(value.clone()).map_err(Error::from),
        }
    }
    fn validate_attrs(&self, kind: &str, node: &Value) -> Result<()> {
        if let Some(attrs) = node.get("attrs").and_then(Value::as_object) {
            if attrs.len() > 1
                && attrs
                    .keys()
                    .any(|key| self.spec(kind)["attrs"][key].get("fields").is_some())
            {
                return Err(Error(
                    "model insertion accepts one structured attribute branch at a time".into(),
                ));
            }
        }
        self.doc.attribute_writes(kind, Self::attrs(node)?, false)?;
        Ok(())
    }
    fn validate_node(&self, node: &Value, depth: usize) -> Result<()> {
        if depth > 64 {
            return Err(Error("model insertion exceeds maximum depth".into()));
        }
        let object = node
            .as_object()
            .ok_or_else(|| Error("model node object required".into()))?;
        if object
            .keys()
            .any(|key| !["type", "attrs", "runs", "children"].contains(&key.as_str()))
        {
            return Err(Error("unsupported model node property".into()));
        }
        let kind = node["type"]
            .as_str()
            .ok_or_else(|| Error("model type required".into()))?;
        if !matches!(
            self.spec(kind)["shape"].as_str(),
            Some("group" | "grid" | "row" | "cell")
        ) {
            self.validate_attrs(kind, node)?;
        }
        match self.spec(kind)["shape"].as_str() {
            Some("text") => {
                if node.get("children").is_some() {
                    return Err(Error("text node cannot have children".into()));
                }
                self.units(
                    node.get("runs").unwrap_or(&json!([])),
                    &Attributes::new(),
                    depth,
                )?;
            }
            Some("flow") => {
                if node.get("runs").is_some() {
                    return Err(Error("flow node cannot have runs".into()));
                }
                if let Some(children) = node.get("children") {
                    for child in children
                        .as_array()
                        .ok_or_else(|| Error("children array required".into()))?
                    {
                        let child_kind = child["type"].as_str().unwrap_or("");
                        if !self.accepts_model_child(kind, child_kind) {
                            return Err(Error("model child is not declared by flow".into()));
                        }
                        self.validate_node(child, depth + 1)?;
                    }
                }
            }
            Some("group" | "grid" | "row" | "cell") => self.validate_structure(node, depth)?,
            _ => {
                return Err(Error(
                    "model insertion supports text and flow nodes only".into(),
                ))
            }
        }
        Ok(())
    }
    fn blocks(&mut self, line: &str) -> Result<Vec<Value>> {
        let state = self.doc.state()?;
        let blocks = state["projections"]
            .as_array()
            .and_then(|projections| {
                projections
                    .iter()
                    .find(|projection| projection["line"] == line)
            })
            .and_then(|projection| projection["blocks"].as_array())
            .ok_or_else(|| Error("model flow projection missing".into()))?;
        let visible = blocks
            .iter()
            .filter(|block| {
                !(block["virtual"] == true && block["chars"].as_array().is_some_and(Vec::is_empty))
            })
            .cloned()
            .collect::<Vec<_>>();
        Ok(visible)
    }
    fn materialize_model_head(&mut self, line: &str, target: bool) -> Result<()> {
        if !self.uses_projection()? {
            return Ok(());
        }
        let blocks = self.blocks(line)?;
        let state = self.doc.state()?;
        if let Some(first) = blocks.first().filter(|block| block["kind"] == "text") {
            if !target {
                return Ok(());
            }
            let marker = first["marker"].as_str().unwrap();
            let unwritten_head = state["lines"]
                .as_array()
                .and_then(|lines| lines.iter().find(|line| line["key"] == marker))
                .and_then(|line| line["items"].as_array())
                .and_then(|items| items.first())
                .and_then(|head| head["attrs"].as_object())
                .is_some_and(serde_json::Map::is_empty);
            let implicit_placement = state["placements"].get(marker).is_none_or(|placement| {
                placement["at"] == json!(Key::parse(marker).unwrap().ticket().unwrap())
            });
            let unstable_gap = marker.starts_with("0@~text:")
                && marker.ends_with(':')
                && first["chars"].as_array().is_some_and(Vec::is_empty)
                && unwritten_head
                && implicit_placement;
            if !unstable_gap {
                return Ok(());
            }
        }
        let flow = self.flow_kind(line)?;
        let default = self.line_default(line)?;
        if self.spec(&flow)["childRules"][&default]["max"] == 0 {
            return Ok(());
        }
        if self
            .group_owner(line, &default)?
            .is_some_and(|(group, _)| self.spec(&flow)["childRules"][group]["max"] == 0)
        {
            return Ok(());
        }
        let nonce = self.next()?;
        let storage = Key::parse(format!(
            "0@~fragment:{}:{}",
            RuntimeDocument::encode_required_part(line),
            RuntimeDocument::encode_required_part(Key::from_ticket(&nonce).as_str())
        ))?;
        self.chain_block(
            line,
            storage.ticket()?,
            "end",
            &json!({"type":default,"runs":[]}),
            None,
        )?;
        Ok(())
    }
    fn last(block: &Value) -> Result<Ticket> {
        let key = block["chars"]
            .as_array()
            .and_then(|chars| chars.last())
            .unwrap_or(&block["marker"])
            .as_str()
            .ok_or_else(|| Error("model block marker missing".into()))?;
        Key::parse(key)?.ticket()
    }
    fn insert_nodes(&mut self, line: &str, index: usize, nodes: &[Value]) -> Result<Option<Key>> {
        let Some(node) = nodes.first() else { return Ok(None); };
        self.materialize_model_head(line, true)?;
        let blocks = self.blocks(line)?;
        if index > blocks.len() {
            return Err(Error("model child index outside flow".into()));
        }
        if index == 0 && self.uses_projection()? {
            let nonce = self.next()?;
            let storage = Key::parse(format!(
                "0@~fragment:{}:{}",
                RuntimeDocument::encode_required_part(line),
                RuntimeDocument::encode_required_part(Key::from_ticket(&nonce).as_str())
            ))?;
            return Ok(self
                .chain_nodes(line, storage.ticket()?, "end", nodes, None)?
                .0);
        }
        if index == 0 && !blocks.is_empty() {
            let head = &blocks[0];
            if head["kind"] != "text" || head["virtual"] == true {
                return Err(Error("model start requires a stored text head".into()));
            }
            let old_right = head["chars"]
                .as_array()
                .and_then(|chars| chars.first())
                .and_then(Value::as_str)
                .or_else(|| blocks.get(1).and_then(|block| block["marker"].as_str()))
                .unwrap_or("end")
                .to_owned();
            let head_key = Key::parse(head["marker"].as_str().unwrap())?;
            let (key, last) = if self.spec(node["type"].as_str().unwrap())["shape"] == "text" {
                (Some(head_key.clone()), self.fill_head(head, node)?)
            } else {
                let default = self.line_default(line)?;
                self.retype(head, &default, Attributes::new())?;
                self.chain_nodes(line, head_key.ticket()?, &old_right, nodes, None)?
            };
            let last = if self.spec(node["type"].as_str().unwrap())["shape"] == "text"
                && nodes.len() > 1
            {
                let after = self.after_origin(line, &last)?;
                self.chain_nodes(line, last, &old_right, &nodes[1..], after)?
                    .1
            } else {
                last
            };
            let tail = json!({"type":head["type"],"attrs":head["attrs"],"runs":[]});
            self.block_with_constraint(line, last, &old_right, &tail, false)?;
            return Ok(key);
        }
        let origin = if index == 0 {
            Key::parse(line)?.ticket()?
        } else {
            Self::last(&blocks[index - 1])?
        };
        let right = blocks
            .get(index)
            .and_then(|block| block["marker"].as_str())
            .unwrap_or("end");
        let state = self.doc.state()?;
        let required_prefix = format!(
            "0@~required:{}:",
            RuntimeDocument::encode_required_part(line)
        );
        let from_required = state["lines"].as_array().is_some_and(|lines| {
            lines.iter().any(|source| {
                source["key"]
                    .as_str()
                    .is_some_and(|key| key.starts_with(&required_prefix))
                    && source["items"]
                        .as_array()
                        .is_some_and(|items| items.iter().any(|item| item["id"] == json!(origin)))
            })
        });
        if index > 0 && from_required {
            if self.spec(node["type"].as_str().unwrap())["shape"] != "text" {
                return Err(Error(
                    "model insertion after required slots supports text only".into(),
                ));
            }
            let nonce = self.next()?;
            let storage = Key::parse(format!(
                "0@~fragment:{}:{}",
                RuntimeDocument::encode_required_part(line),
                RuntimeDocument::encode_required_part(Key::from_ticket(&nonce).as_str())
            ))?;
            let after = self.placement_after(line, &blocks[index - 1])?;
            let (key, last) = self.block(line, storage.ticket()?, right, node)?;
            let at = self.next()?;
            self.emit(vec![Op::Move {
                at: at.clone(),
                target: key.as_ref().unwrap().ticket()?,
                parent: Key::parse(line)?.ticket()?,
                after: Some(after),
            }])?;
            if nodes.len() > 1 {
                let after = self.after_origin(line, &last)?;
                self.chain_nodes(line, last, right, &nodes[1..], after)?;
            }
            return Ok(key);
        }
        let after = if index > 0 {
            Some(self.placement_after(line, &blocks[index - 1])?)
        } else {
            None
        };
        Ok(self.chain_nodes(line, origin, right, nodes, after)?.0)
    }
    fn line_default(&mut self, line: &str) -> Result<String> {
        let state = self.doc.state()?;
        state["lines"]
            .as_array()
            .and_then(|lines| lines.iter().find(|entry| entry["key"] == line))
            .and_then(|entry| entry["items"].as_array())
            .and_then(|items| items.first())
            .and_then(|item| item["born"].as_str())
            .map(str::to_owned)
            .ok_or_else(|| Error("flow default missing".into()))
    }
    fn birth_attrs(
        &self,
        kind: &str,
        attrs: Attributes,
    ) -> Result<(Attributes, Vec<(String, Value)>)> {
        let (mut scalar, fields) = self.doc.attribute_writes(kind, attrs, false)?;
        scalar.retain(|key, value| {
            !value.is_null()
                && (value.is_object()
                    || value.is_array()
                    || !RuntimeDocument::same_value(
                        value,
                        &self.spec(kind)["attrs"][key]["default"],
                    ))
        });
        Ok((scalar, fields))
    }
    fn block(
        &mut self,
        line: &str,
        origin: Ticket,
        right: &str,
        node: &Value,
    ) -> Result<(Option<Key>, Ticket)> {
        self.block_with_constraint(line, origin, right, node, true)
    }
    fn block_with_constraint(
        &mut self,
        line: &str,
        origin: Ticket,
        right: &str,
        node: &Value,
        constrain: bool,
    ) -> Result<(Option<Key>, Ticket)> {
        let kind = node["type"].as_str().unwrap();
        if self.batch && self.empty_grid(node) {
            return Ok((None, origin));
        }
        let id = self.next()?;
        let key = Key::from_ticket(&id);
        let text = self.spec(kind)["shape"] == "text";
        let constrained =
            constrain && text && self.doc.constrained_child(&Key::parse(line)?, kind)?;
        let boundary = if text {
            format!(
                "{}|{}{}",
                Key::from_ticket(&origin).as_str(),
                right,
                if constrained {
                    format!("|child:{}", key.as_str())
                } else {
                    String::new()
                }
            )
        } else {
            String::new()
        };
        let (attrs, fields) = self.birth_attrs(kind, Self::attrs(node)?)?;
        let mut ops = vec![Op::Node {
            id: id.clone(),
            origin,
            node_type: kind.into(),
            boundary,
            attrs: (!attrs.is_empty()).then_some(attrs),
        }];
        for (field, value) in fields {
            let at = self.next()?;
            ops.push(Op::Set {
                at,
                ids: vec![id.clone()],
                key: field,
                value,
            });
        }
        self.emit(ops)?;
        let last = if text {
            self.emit_runs(id, node.get("runs").unwrap_or(&json!([])))?
        } else if self.spec(kind)["shape"] == "grid" {
            self.fill_grid(&key, node)?;
            id
        } else {
            let body = RuntimeDocument::flow_head(Some(&key))?;
            self.fill_flow(
                body.as_str(),
                node.get("children")
                    .and_then(Value::as_array)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
            )?;
            id
        };
        Ok((Some(key), last))
    }
    fn retype(&mut self, head: &Value, kind: &str, attrs: Attributes) -> Result<()> {
        let id = Key::parse(head["marker"].as_str().unwrap())?.ticket()?;
        let mut staged = vec![];
        if head["type"] != kind {
            let at = self.next()?;
            staged.push((at, "$type".to_owned(), json!(kind)));
        }
        let specs = self.spec(kind)["attrs"]
            .as_object()
            .cloned()
            .unwrap_or_default();
        for (key, spec) in &specs {
            let value = attrs
                .get(key)
                .filter(|v| !v.is_null())
                .unwrap_or(&spec["default"]);
            if spec.get("fields").is_some() || head["attrs"][key] != *value {
                let at = self.next()?;
                staged.push((
                    at,
                    key.clone(),
                    if attrs.get(key).is_none_or(Value::is_null)
                        || !value.is_object()
                            && !value.is_array()
                            && RuntimeDocument::same_value(value, &spec["default"])
                    {
                        Value::Null
                    } else {
                        value.clone()
                    },
                ));
            }
        }
        let mut ops = vec![];
        for (at, key, value) in staged {
            if specs
                .get(&key)
                .is_some_and(|spec| spec.get("fields").is_some())
            {
                let mut writes = vec![];
                RuntimeDocument::field_writes(&specs[&key], &value, &mut vec![key], &mut writes)?;
                for (key, value, _) in writes {
                    let at = self.next()?;
                    ops.push(Op::Set {
                        at,
                        ids: vec![id.clone()],
                        key,
                        value,
                    });
                }
            } else {
                ops.push(Op::Set {
                    at,
                    ids: vec![id.clone()],
                    key,
                    value,
                });
            }
        }
        self.emit(ops)
    }
    fn fill_head(&mut self, head: &Value, node: &Value) -> Result<Ticket> {
        self.retype(head, node["type"].as_str().unwrap(), Self::attrs(node)?)?;
        self.emit_runs(
            Key::parse(head["marker"].as_str().unwrap())?.ticket()?,
            node.get("runs").unwrap_or(&json!([])),
        )
    }
    fn units(
        &self,
        runs: &Value,
        outer: &Attributes,
        depth: usize,
    ) -> Result<Vec<(Value, Attributes)>> {
        if depth > 64 {
            return Err(Error("run nesting exceeds maximum depth".into()));
        }
        let mut out = vec![];
        for run in runs
            .as_array()
            .ok_or_else(|| Error("runs array required".into()))?
        {
            if let Some(text) = run.get("text") {
                let text = text
                    .as_str()
                    .ok_or_else(|| Error("run text must be a string".into()))?;
                let mut marks: Attributes = match run.get("marks") {
                    None => Attributes::new(),
                    Some(value) => serde_json::from_value(value.clone())?,
                };
                marks.extend(outer.clone());
                let manifest = self.doc.schema.effective_manifest();
                let mut canonical = Attributes::new();
                for (name, value) in marks {
                    if manifest["marks"]
                        .as_array()
                        .is_some_and(|keys| keys.iter().any(|key| key == &name))
                    {
                        if value == true {
                            canonical.insert(name, value);
                        } else if !value.is_null() && !value.is_boolean() {
                            return Err(Error("invalid boolean mark".into()));
                        }
                    } else if let Some(spec) = manifest["markValues"].get(&name) {
                        if !value.is_null() && value != spec["default"] {
                            canonical.insert(name, value);
                        }
                    } else {
                        return Err(Error("unknown run mark".into()));
                    }
                }
                if !text.is_empty() {
                    out.push((json!(text), canonical));
                }
            } else {
                let kind = run["type"]
                    .as_str()
                    .ok_or_else(|| Error("inline or span type required".into()))?;
                match self.spec(kind)["shape"].as_str() {
                    Some("inline") => {
                        self.validate_attrs(kind, run)?;
                        out.push((run.clone(), Attributes::new()));
                    }
                    Some("span") => {
                        let mut outer = outer.clone();
                        let mark = self.spec(kind)["mark"].as_str().unwrap();
                        let attr = self.spec(kind)["attr"].as_str().unwrap();
                        outer.insert(mark.into(), run["attrs"][attr].clone());
                        out.extend(self.units(
                            run.get("runs").unwrap_or(&json!([])),
                            &outer,
                            depth + 1,
                        )?);
                    }
                    _ => return Err(Error("unsupported run node".into())),
                }
            }
        }
        Ok(out)
    }
    fn emit_runs(&mut self, mut origin: Ticket, runs: &Value) -> Result<Ticket> {
        let units = self.units(runs, &Attributes::new(), 0)?;
        let mut index = 0;
        while index < units.len() {
            let (value, marks) = &units[index];
            if let Some(text) = value.as_str() {
                let mut text = text.to_owned();
                index += 1;
                while index < units.len() && units[index].0.is_string() && units[index].1 == *marks
                {
                    text.push_str(units[index].0.as_str().unwrap());
                    index += 1;
                }
                let id = self.next()?;
                let units = Utf16Text::from(text.as_str());
                self.clock = self
                    .clock
                    .checked_add(units.0.len() as u64 - 1)
                    .filter(|n| *n <= MAX_CLOCK)
                    .ok_or_else(|| Error("clock exhausted".into()))?;
                self.emit(vec![Op::Text {
                    id: id.clone(),
                    origin,
                    units,
                    marks: marks.clone(),
                }])?;
                origin = Ticket {
                    lamport: self.clock,
                    actor: id.actor,
                };
            } else {
                let id = self.next()?;
                let kind = value["type"].as_str().unwrap();
                let (attrs, fields) = self.birth_attrs(kind, Self::attrs(value)?)?;
                let mut ops = vec![Op::Node {
                    id: id.clone(),
                    origin,
                    node_type: kind.into(),
                    boundary: String::new(),
                    attrs: (!attrs.is_empty()).then_some(attrs),
                }];
                for (key, value) in fields {
                    let at = self.next()?;
                    ops.push(Op::Set {
                        at,
                        ids: vec![id.clone()],
                        key,
                        value,
                    });
                }
                self.emit(ops)?;
                origin = id;
                index += 1;
            }
        }
        Ok(origin)
    }
}

#[cfg(test)]
mod compiled_record_tests {
    use super::*;
    fn document() -> RuntimeDocument {
        let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
            "doc":{"shape":"flow","children":["p"],"default":"p"},
            "p":{"shape":"text","attrs":{"a":{"default":0},"b":{"default":0}}}
        }}))
        .unwrap();
        let mut doc = RuntimeDocument::new("A", schema).unwrap();
        doc.record(vec![set(1, "A", "a", 1)], EditOptions::default(), 1.)
            .unwrap();
        doc
    }
    fn set(clock: u64, actor: &str, key: &str, value: i32) -> Op {
        Op::Set {
            at: Ticket {
                lamport: clock,
                actor: actor.into(),
            },
            ids: vec![Key::root().ticket().unwrap()],
            key: key.into(),
            value: json!(value),
        }
    }
    #[test]
    fn compiled_tickets_keep_emission_order_but_reject_invalid_ranges_atomically() {
        let mut doc = document();
        let ops = vec![set(3, "A", "a", 3), set(2, "A", "b", 2)];
        let before = doc.checkpoint().unwrap().to_json().unwrap();
        assert!(doc.record(ops.clone(), EditOptions::default(), 2.).is_err());
        assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
        let change = doc
            .record_compiled_model(ops.clone(), EditOptions::default(), 2.)
            .unwrap();
        assert_eq!(change.ops, ops);
        assert_eq!(doc.observed_clock().unwrap(), 3);
        for (ops, now) in [
            (vec![set(3, "A", "a", 7)], 3.),
            (vec![set(4, "B", "a", 7)], 3.),
            (
                vec![
                    Op::Text {
                        id: Ticket {
                            lamport: 4,
                            actor: "A".into(),
                        },
                        origin: Key::root().ticket().unwrap(),
                        units: Utf16Text::from("abc"),
                        marks: Attributes::new(),
                    },
                    set(5, "A", "b", 7),
                ],
                3.,
            ),
            (
                vec![Op::Text {
                    id: Ticket {
                        lamport: MAX_CLOCK,
                        actor: "A".into(),
                    },
                    origin: Key::root().ticket().unwrap(),
                    units: Utf16Text::from("ab"),
                    marks: Attributes::new(),
                }],
                3.,
            ),
            (vec![set(4, "A", "a", 7)], f64::NAN),
            (vec![set(4, "A", "a", 7)], f64::INFINITY),
        ] {
            let before = doc.checkpoint().unwrap().to_json().unwrap();
            assert!(doc
                .record_compiled_model(ops, EditOptions::default(), now)
                .is_err());
            assert_eq!(doc.checkpoint().unwrap().to_json().unwrap(), before);
        }
    }
}
