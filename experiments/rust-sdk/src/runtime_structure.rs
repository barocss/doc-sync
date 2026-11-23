//! Derived groups and grid axes for the model-position compiler.
use super::*;

enum ModelRef {
    Flow(String),
    Group {
        line: String,
        flats: Vec<usize>,
        kind: String,
    },
    Grid(Value),
    Row {
        grid: Value,
        row: usize,
    },
    Cell {
        grid: Value,
        row: usize,
        col: usize,
    },
    Text,
}

impl Compiler {
    pub(super) fn accepts_model_child(&self, flow: &str, kind: &str) -> bool {
        self.spec(flow)["children"]
            .as_array()
            .is_some_and(|children| {
                children.iter().any(|child| {
                    child == kind
                        || self.spec(child.as_str().unwrap())["shape"] == "group"
                            && self.spec(child.as_str().unwrap())["children"]
                                .as_array()
                                .is_some_and(|members| members.iter().any(|member| member == kind))
                })
            })
    }

    pub(super) fn validate_structure(&self, node: &Value, depth: usize) -> Result<()> {
        let kind = node["type"].as_str().unwrap();
        let children = node
            .get("children")
            .map(|value| {
                value
                    .as_array()
                    .ok_or_else(|| Error("children array required".into()))
            })
            .transpose()?
            .cloned()
            .unwrap_or_default();
        if node.get("runs").is_some() {
            return Err(Error("structural node cannot have runs".into()));
        }
        match self.spec(kind)["shape"].as_str().unwrap() {
            "group" => {
                if children.is_empty() && !self.batch {
                    return Err(Error("empty group has no stored node".into()));
                }
                if Self::attrs(node)?.keys().any(|key| {
                    !self.spec(kind)["by"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|by| by == key)
                }) {
                    return Err(Error("group attributes must be declared by keys".into()));
                }
                for child in
                    self.flatten_nodes(std::slice::from_ref(node), &serde_json::Map::new())?
                {
                    if !self.spec(kind)["children"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|member| member == &child["type"])
                    {
                        return Err(Error("group member type is not declared".into()));
                    }
                    self.validate_node(&child, depth + 1)?;
                }
            }
            "grid" => {
                self.validate_attrs(kind, node)?;
                if !self.batch && (children.is_empty()
                    || children
                        .iter()
                        .all(|row| row["children"].as_array().is_none_or(Vec::is_empty)))
                {
                    return Err(Error("empty grid has no stored node".into()));
                }
                let row_kind = self.spec(kind)["children"][0].as_str().unwrap();
                for child in children {
                    if child["type"] != row_kind {
                        return Err(Error("grid row type mismatch".into()));
                    }
                    self.validate_node(&child, depth + 1)?;
                }
            }
            "row" => {
                if !Self::attrs(node)?.is_empty() {
                    return Err(Error("row attributes are not compiled".into()));
                }
                let cell_kind = self.spec(kind)["children"][0].as_str().unwrap();
                for child in children {
                    if child["type"] != cell_kind {
                        return Err(Error("row cell type mismatch".into()));
                    }
                    self.validate_node(&child, depth + 1)?;
                }
            }
            "cell" => {
                for (key, value) in Self::attrs(node)? {
                    match key.as_str() {
                        "rowspan" | "colspan" => {
                            Self::span_size(&value)?;
                        }
                        "spanned" => {
                            if !value.is_boolean() {
                                return Err(Error("spanned must be boolean".into()));
                            }
                        }
                        _ => {
                            self.doc.attribute_writes(
                                kind,
                                Attributes::from([(key, value)]),
                                false,
                            )?;
                        }
                    }
                }
                if children.len() > 1 {
                    return Err(Error("cell has one fixed body wrapper".into()));
                }
                if let Some(body) = children.first() {
                    if body["type"] != self.spec(kind)["children"][0] {
                        return Err(Error("cell body type mismatch".into()));
                    }
                    if !Self::attrs(body)?.is_empty() {
                        return Err(Error(
                            "cell body wrapper attributes are not compiled".into(),
                        ));
                    }
                    self.validate_node(body, depth + 1)?;
                }
            }
            _ => unreachable!(),
        }
        Ok(())
    }

    pub(super) fn flatten_nodes(
        &self,
        nodes: &[Value],
        extra: &serde_json::Map<String, Value>,
    ) -> Result<Vec<Value>> {
        let mut result = vec![];
        for node in nodes {
            let group = self.spec(node["type"].as_str().unwrap_or(""))["shape"] == "group";
            let mut inherited = extra.clone();
            if group {
                for key in self.spec(node["type"].as_str().unwrap())["by"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(Value::as_str)
                {
                    if let Some(value) = node["attrs"].get(key) {
                        inherited.insert(key.into(), value.clone());
                    }
                }
            }
            let items = if group {
                node["children"].as_array().cloned().unwrap_or_default()
            } else {
                vec![node.clone()]
            };
            for mut item in items {
                let leaf = item["type"].as_str().unwrap_or("");
                let mut attrs = inherited
                    .iter()
                    .filter(|(key, _)| self.spec(leaf)["attrs"].get(*key).is_some())
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect::<serde_json::Map<_, _>>();
                if let Some(own) = item.get("attrs").and_then(Value::as_object) {
                    attrs.extend(own.clone());
                }
                if !attrs.is_empty() {
                    item["attrs"] = json!(attrs);
                }
                result.push(item);
            }
        }
        Ok(result)
    }

    pub(super) fn flow_kind(&mut self, line: &str) -> Result<String> {
        if line == Key::root().as_str() {
            return Ok(self.doc.schema.effective_manifest()["root"]
                .as_str()
                .unwrap()
                .into());
        }
        let state = self.doc.state()?;
        let source = state["lines"]
            .as_array()
            .and_then(|lines| lines.iter().find(|source| source["key"] == line))
            .ok_or_else(|| Error("flow source missing".into()))?;
        let owner = source["owner"]
            .as_str()
            .ok_or_else(|| Error("flow owner missing".into()))?;
        let owner_id = Key::parse(owner)?.ticket()?;
        let kind = state["items"]
            .as_array()
            .and_then(|items| items.iter().find(|item| item["id"] == json!(owner_id)))
            .and_then(|item| item["born"].as_str())
            .ok_or_else(|| Error("flow owner birth type missing".into()))?
            .to_owned();
        if source["slot"]
            .as_str()
            .is_some_and(|slot| slot.starts_with("cell:"))
        {
            return Ok(self.grid_parts(&kind).2);
        }
        Ok(kind)
    }

    pub(super) fn group_owner(
        &mut self, line: &str, kind: &str,
    ) -> Result<Option<(String, Vec<String>)>> {
        let flow = self.flow_kind(line)?;
        Ok(self.group_owner_for_flow(&flow, kind))
    }

    pub(super) fn group_owner_for_flow(&self, flow: &str, kind: &str) -> Option<(String, Vec<String>)> {
        self.spec(flow)["children"].as_array().into_iter().flatten()
            .filter_map(Value::as_str).find(|name| {
                self.spec(name)["shape"] == "group"
                    && self.spec(name)["children"].as_array()
                        .is_some_and(|members| members.iter().any(|member| member == kind))
            }).map(|name| (name.into(), self.spec(name)["by"].as_array().unwrap()
                .iter().map(|key| key.as_str().unwrap().into()).collect()))
    }

    pub(super) fn required_boundaries(state: &Value) -> Result<std::collections::BTreeMap<String, String>> {
        let mut result = std::collections::BTreeMap::new();
        for line in state["lines"].as_array().into_iter().flatten() {
            let name = line["key"].as_str().unwrap_or("");
            if !name.starts_with("0@~required:") { continue; }
            for item in line["items"].as_array().into_iter().flatten() {
                let id: Ticket = serde_json::from_value(item["id"].clone())?;
                result.entry(Key::from_ticket(&id).as_str().to_owned()).or_insert_with(|| name.into());
            }
        }
        Ok(result)
    }

    pub(super) fn entries_for_projection(
        &self, flow: &str, blocks: &[Value], boundaries: &std::collections::BTreeMap<String, String>,
    ) -> Vec<(Vec<usize>, Option<String>)> {
        let mut entries: Vec<(Vec<usize>, Option<String>)> = vec![];
        let mut previous: Option<(String, String, String)> = None;
        for (index, block) in blocks.iter().enumerate() {
            let owner = if block["kind"] == "text" {
                self.group_owner_for_flow(flow, block["type"].as_str().unwrap())
            } else { None };
            let group = owner.map(|(name, by)| {
                let values = json!(by.iter().map(|key| block["attrs"][key].clone()).collect::<Vec<_>>());
                let marker = block["marker"].as_str().unwrap();
                (name, engine::model_group_key(&values), boundaries.get(marker).cloned().unwrap_or_default())
            });
            if group.as_ref().zip(previous.as_ref()).is_some_and(|(a,b)| a == b) {
                entries.last_mut().unwrap().0.push(index);
            } else {
                entries.push((vec![index], group.as_ref().map(|entry| entry.0.clone())));
            }
            previous = group;
        }
        entries
    }

    pub(super) fn entries(&mut self, line: &str) -> Result<Vec<(Vec<usize>, Option<String>)>> {
        let blocks = self.blocks(line)?;
        let state = self.doc.state()?;
        let flow = self.flow_kind(line)?;
        Ok(self.entries_for_projection(&flow, &blocks, &Self::required_boundaries(&state)?))
    }

    fn block_ref(&self, block: &Value) -> Result<ModelRef> {
        match block["kind"].as_str() {
            Some("flow") => Ok(ModelRef::Flow(block["body"].as_str().unwrap().into())),
            Some("grid") => Ok(ModelRef::Grid(block.clone())),
            Some("text") => Ok(ModelRef::Text),
            _ => Err(Error("model parent is not editable".into())),
        }
    }

    fn select_entry(&mut self, line: String, index: usize) -> Result<ModelRef> {
        self.materialize_model_head(&line, false)?;
        let entries = self.entries(&line)?;
        let (flats, group) = entries
            .get(index)
            .ok_or_else(|| Error("model child index outside flow".into()))?;
        if let Some(kind) = group {
            return Ok(ModelRef::Group {
                line,
                flats: flats.clone(),
                kind: kind.clone(),
            });
        }
        let blocks = self.blocks(&line)?;
        self.block_ref(&blocks[flats[0]])
    }

    pub(super) fn insert_at(&mut self, at: &[usize], model: &Value) -> Result<Option<Key>> {
        let mut parent = ModelRef::Flow(Key::root().as_str().into());
        for index in &at[..at.len() - 1] {
            parent = match parent {
                ModelRef::Flow(line) => self.select_entry(line, *index)?,
                ModelRef::Group { line, flats, .. } => {
                    let flat = *flats
                        .get(*index)
                        .ok_or_else(|| Error("group member index outside group".into()))?;
                    let blocks = self.blocks(&line)?;
                    self.block_ref(&blocks[flat])?
                }
                ModelRef::Grid(grid) => {
                    if *index >= grid["rows"].as_array().unwrap().len() {
                        return Err(Error("grid row index outside table".into()));
                    }
                    ModelRef::Row { grid, row: *index }
                }
                ModelRef::Row { grid, row } => {
                    if *index >= grid["cols"].as_array().unwrap().len() {
                        return Err(Error("grid column index outside table".into()));
                    }
                    ModelRef::Cell {
                        grid,
                        row,
                        col: *index,
                    }
                }
                ModelRef::Cell { grid, row, col } => {
                    if *index != 0 {
                        return Err(Error("cell body index must be zero".into()));
                    }
                    ModelRef::Flow(Self::grid_cell(&grid, row, col)?.as_str().into())
                }
                ModelRef::Text => {
                    return Err(Error("text-offset model insertion is unsupported".into()))
                }
            };
        }
        let index = at[at.len() - 1];
        match parent {
            ModelRef::Flow(line) => {
                self.materialize_model_head(&line, true)?;
                let flow = self.flow_kind(&line)?;
                let nodes =
                    self.flatten_nodes(std::slice::from_ref(model), &serde_json::Map::new())?;
                if !(self.batch && nodes.is_empty())
                    && !self.accepts_model_child(&flow, model["type"].as_str().unwrap_or(""))
                {
                    return Err(Error("model type is not declared by flow".into()));
                }
                let entries = self.entries(&line)?;
                if index > entries.len() {
                    return Err(Error("model child index outside flow".into()));
                }
                let flat = entries
                    .get(index)
                    .map(|entry| entry.0[0])
                    .unwrap_or(self.blocks(&line)?.len());
                self.insert_nodes(&line, flat, &nodes)
            }
            ModelRef::Group { line, flats, kind } => {
                if index > flats.len() {
                    return Err(Error("group member insertion index outside group".into()));
                }
                let blocks = self.blocks(&line)?;
                let mut extra = serde_json::Map::new();
                for key in self.spec(&kind)["by"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(Value::as_str)
                {
                    extra.insert(key.into(), blocks[flats[0]]["attrs"][key].clone());
                }
                let nodes = self.flatten_nodes(std::slice::from_ref(model), &extra)?;
                let flow = self.flow_kind(&line)?;
                if nodes.iter().any(|node| {
                    !self.accepts_model_child(&flow, node["type"].as_str().unwrap_or(""))
                }) {
                    return Err(Error(
                        "inserted block is not allowed in group parent flow".into(),
                    ));
                }
                for node in &nodes {
                    self.validate_node(node, 0)?;
                }
                self.insert_nodes(
                    &line,
                    flats
                        .get(index)
                        .copied()
                        .unwrap_or(flats.last().unwrap() + 1),
                    &nodes,
                )
            }
            ModelRef::Grid(grid) => self.insert_model_row(&grid, index, model).map(Some),
            ModelRef::Row { grid, row } => self.insert_model_cell(&grid, row, index, model).map(Some),
            _ => Err(Error(
                "insert requires flow, group, grid or row parent".into(),
            )),
        }
    }

    pub(super) fn after_origin(&mut self, line: &str, origin: &Ticket) -> Result<Option<Ticket>> {
        let blocks = self.blocks(line)?;
        let key = Key::from_ticket(origin);
        match blocks.iter().find(|block| {
            block["marker"] == key.as_str()
                || block["chars"]
                    .as_array()
                    .is_some_and(|chars| chars.iter().any(|value| value == key.as_str()))
        }) {
            Some(block) => Ok(Some(self.placement_after(line, block)?)),
            None => Ok(None),
        }
    }

    pub(super) fn chain_nodes(
        &mut self,
        line: &str,
        mut origin: Ticket,
        right: &str,
        nodes: &[Value],
        mut after: Option<Ticket>,
    ) -> Result<(Option<Key>, Ticket)> {
        let mut first = None;
        for node in nodes {
            let (key, last, placement) =
                self.chain_block(line, origin, right, node, after.clone())?;
            if first.is_none() {
                first = key;
            }
            origin = last;
            if placement.is_some() {
                after = placement;
            }
        }
        Ok((
            first,
            origin,
        ))
    }

    pub(super) fn fill_flow(&mut self, line: &str, children: &[Value]) -> Result<()> {
        let nodes = self.flatten_nodes(children, &serde_json::Map::new())?;
        let Some((first, rest)) = nodes.split_first() else {
            return Ok(());
        };
        let blocks = self.blocks(line)?;
        let head = blocks
            .first()
            .ok_or_else(|| Error("flow text head missing".into()))?;
        let text = self.spec(first["type"].as_str().unwrap())["shape"] == "text";
        let last = if text {
            self.fill_head(head, first)?
        } else {
            Self::last(head)?
        };
        let rest = if text { rest } else { &nodes };
        if !rest.is_empty() {
            let after = self.after_origin(line, &last)?;
            self.chain_nodes(line, last, "end", rest, after)?;
        }
        Ok(())
    }

    fn grid_parts(&self, kind: &str) -> (String, String, String) {
        let row = self.spec(kind)["children"][0].as_str().unwrap();
        let cell = self.spec(row)["children"][0].as_str().unwrap();
        (
            row.into(),
            cell.into(),
            self.spec(cell)["children"][0].as_str().unwrap().into(),
        )
    }
    fn grid_birth_kind(&mut self, grid: &Key) -> Result<String> {
        let state = self.doc.state()?;
        let id = grid.ticket()?;
        state["items"]
            .as_array()
            .and_then(|items| items.iter().find(|item| item["id"] == json!(id)))
            .and_then(|item| item["born"].as_str())
            .map(str::to_owned)
            .ok_or_else(|| Error("grid birth type missing".into()))
    }

    fn axis_node(&mut self, kind: &str, origin: Ticket) -> Result<Ticket> {
        let id = self.next()?;
        self.emit(vec![Op::Node {
            id: id.clone(),
            origin,
            node_type: kind.into(),
            boundary: String::new(),
            attrs: None,
        }])?;
        Ok(id)
    }

    pub(super) fn fill_grid(&mut self, grid: &Key, node: &Value) -> Result<()> {
        let rows = node["children"].as_array().unwrap();
        let width = rows
            .iter()
            .filter_map(|row| row["children"].as_array().map(Vec::len))
            .max()
            .unwrap_or(0);
        let (row_kind, _, _) = self.grid_parts(node["type"].as_str().unwrap());
        let mut row_ids = vec![];
        let mut col_ids = vec![];
        let mut origin = RuntimeDocument::grid_rows_head(grid)?.ticket()?;
        for _ in rows {
            let id = self.axis_node(&row_kind, origin)?;
            origin = id.clone();
            row_ids.push(id);
        }
        origin = RuntimeDocument::grid_columns_head(grid)?.ticket()?;
        for _ in 0..width {
            let id = self.axis_node("col", origin)?;
            origin = id.clone();
            col_ids.push(id);
        }
        for (i, row) in rows.iter().enumerate() {
            for (j, cell) in row["children"].as_array().into_iter().flatten().enumerate() {
                self.fill_cell(grid, &row_ids, &col_ids, i, j, cell)?;
            }
        }
        Ok(())
    }

    fn grid_cell(grid: &Value, row: usize, col: usize) -> Result<Key> {
        RuntimeDocument::cell_head(
            &Key::parse(grid["marker"].as_str().unwrap())?,
            &Key::parse(grid["rows"][row].as_str().unwrap())?,
            &Key::parse(grid["cols"][col].as_str().unwrap())?,
        )
    }

    fn span_size(value: &Value) -> Result<usize> {
        if value.is_null() {
            return Ok(1);
        }
        if let Some(number) = value.as_u64().filter(|number| *number > 0) {
            return Ok(usize::try_from(number).unwrap_or(usize::MAX));
        }
        if let Some(number) = value
            .as_f64()
            .filter(|number| number.is_finite() && *number >= 1.0 && number.fract() == 0.0)
        {
            return Ok(number.min(usize::MAX as f64) as usize);
        }
        Err(Error("cell spans must be positive integers".into()))
    }

    fn fill_cell(
        &mut self,
        grid: &Key,
        rows: &[Ticket],
        cols: &[Ticket],
        i: usize,
        j: usize,
        cell: &Value,
    ) -> Result<()> {
        let head = RuntimeDocument::cell_head(
            grid,
            &Key::from_ticket(&rows[i]),
            &Key::from_ticket(&cols[j]),
        )?;
        self.fill_flow(
            head.as_str(),
            cell["children"][0]["children"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or(&[]),
        )?;
        let kind = self.grid_birth_kind(grid)?;
        let (_, cell_kind, _) = self.grid_parts(&kind);
        let attrs = cell
            .get("attrs")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut coarse = vec![];
        let rs = Self::span_size(attrs.get("rowspan").unwrap_or(&Value::Null))?;
        let cs = Self::span_size(attrs.get("colspan").unwrap_or(&Value::Null))?;
        if rs > 1 || cs > 1 {
            let at = self.next()?;
            coarse.push((at, format!("$span:{},{}", Key::from_ticket(&rows[i]).as_str(), Key::from_ticket(&cols[j]).as_str()), json!({"row":Key::from_ticket(&rows[i.saturating_add(rs).min(rows.len())-1]).as_str(),"col":Key::from_ticket(&cols[j.saturating_add(cs).min(cols.len())-1]).as_str()}), None));
        }
        for (key, value) in attrs {
            if ["rowspan", "colspan", "spanned"].contains(&key.as_str()) {
                continue;
            }
            let spec = self.spec(&cell_kind)["attrs"][&key].clone();
            if spec.get("fields").is_some()
                || !value.is_null()
                    && (value.is_object()
                        || value.is_array()
                        || !RuntimeDocument::same_value(&value, &spec["default"]))
            {
                let at = self.next()?;
                coarse.push((at, key, value, Some(spec)));
            }
        }
        let prefix = format!(
            "$cell:{},{}|",
            Key::from_ticket(&rows[i]).as_str(),
            Key::from_ticket(&cols[j]).as_str()
        );
        let mut ops = vec![];
        for (at, key, value, spec) in coarse {
            if let Some(fields) = spec.as_ref().filter(|spec| spec.get("fields").is_some()) {
                let mut writes = vec![];
                RuntimeDocument::field_writes(fields, &value, &mut vec![key], &mut writes)?;
                for (key, value, _) in writes {
                    let at = self.next()?;
                    ops.push(Op::Set {
                        at,
                        ids: vec![grid.ticket()?],
                        key: format!("{prefix}{key}"),
                        value,
                    });
                }
            } else {
                ops.push(Op::Set {
                    at,
                    ids: vec![grid.ticket()?],
                    key: if spec.is_some() {
                        format!("{prefix}{key}")
                    } else {
                        key
                    },
                    value,
                });
            }
        }
        self.emit(ops)
    }

    fn refreshed_grid(&mut self, marker: &str) -> Result<Value> {
        self.doc.state()?["projections"]
            .as_array()
            .and_then(|sources| {
                sources.iter().find_map(|source| {
                    source["blocks"].as_array().and_then(|blocks| {
                        blocks
                            .iter()
                            .find(|block| block["marker"] == marker && block["kind"] == "grid")
                    })
                })
            })
            .cloned()
            .ok_or_else(|| Error("grid projection missing".into()))
    }
    fn axes(grid: &Value) -> Result<(Vec<Ticket>, Vec<Ticket>)> {
        let parse = |name: &str| {
            grid[name]
                .as_array()
                .ok_or_else(|| Error("grid axes missing".into()))?
                .iter()
                .map(|key| Key::parse(key.as_str().unwrap())?.ticket())
                .collect::<Result<Vec<_>>>()
        };
        Ok((parse("rows")?, parse("cols")?))
    }
    fn insert_model_row(&mut self, grid: &Value, index: usize, model: &Value) -> Result<Key> {
        let marker = grid["marker"].as_str().unwrap();
        let key = Key::parse(marker)?;
        let (row_kind, _, _) = self.grid_parts(grid["type"].as_str().unwrap());
        if model["type"] != row_kind {
            return Err(Error("row insertion requires grid row type".into()));
        }
        let (rows, _) = Self::axes(grid)?;
        if index > rows.len() {
            return Err(Error("row insertion index outside grid".into()));
        }
        let origin = if index == 0 {
            RuntimeDocument::grid_rows_head(&key)?.ticket()?
        } else {
            rows[index - 1].clone()
        };
        let fresh = self.axis_node(&row_kind, origin)?;
        let now = self.refreshed_grid(marker)?;
        let (rows, cols) = Self::axes(&now)?;
        let row = rows.iter().position(|id| id == &fresh).unwrap();
        for (col, cell) in model["children"]
            .as_array()
            .into_iter()
            .flatten()
            .take(cols.len())
            .enumerate()
        {
            self.fill_cell(&key, &rows, &cols, row, col, cell)?;
        }
        Ok(Key::from_ticket(&fresh))
    }
    fn insert_model_cell(
        &mut self,
        grid: &Value,
        row: usize,
        index: usize,
        model: &Value,
    ) -> Result<Key> {
        let marker = grid["marker"].as_str().unwrap();
        let key = Key::parse(marker)?;
        let (_, cell_kind, _) = self.grid_parts(grid["type"].as_str().unwrap());
        if model["type"] != cell_kind {
            return Err(Error("cell insertion requires grid cell type".into()));
        }
        let (_, cols) = Self::axes(grid)?;
        if index > cols.len() {
            return Err(Error("column insertion index outside grid".into()));
        }
        let (rows, _) = Self::axes(grid)?;
        let row_key = Key::from_ticket(&rows[row]).as_str().to_owned();
        let reuse = self.column.as_mut().filter(|memo| {
            memo.grid == marker && memo.index == index && !memo.rows.contains(&row_key)
        });
        if let Some(memo) = reuse {
            memo.rows.insert(row_key.clone());
            let result = memo.key.clone();
            self.fill_cell(&key, &rows, &cols, row, index, model)?;
            return Ok(result);
        }
        let origin = if index == 0 {
            RuntimeDocument::grid_columns_head(&key)?.ticket()?
        } else {
            cols[index - 1].clone()
        };
        let fresh = self.axis_node("col", origin)?;
        if self.batch {
            self.column = Some(ColumnMemo {
                grid: marker.into(), index, key: Key::from_ticket(&fresh),
                rows: std::collections::BTreeSet::from([row_key]),
            });
        }
        let now = self.refreshed_grid(marker)?;
        let (rows, cols) = Self::axes(&now)?;
        let col = cols.iter().position(|id| id == &fresh).unwrap();
        self.fill_cell(&key, &rows, &cols, row, col, model)?;
        Ok(Key::from_ticket(&fresh))
    }
}
