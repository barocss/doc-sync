//! Pinned recursive flow/grid storage. Every physical line retains its own RGA order.
use super::*;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(super) struct Line {
    key: String,
    owner: Option<String>,
    slot: String,
    ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Storage {
    lines: Vec<Line>,
    attr_order: BTreeMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    moves: Vec<Move>,
}
impl Storage {
    pub fn new() -> Self {
        Self {
            lines: vec![Line {
                key: Ticket::root().key(),
                owner: None,
                slot: String::new(),
                ids: vec![Ticket::root().key()],
            }],
            attr_order: BTreeMap::new(),
            moves: vec![],
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    format: String,
    schema: String,
    manifest: Value,
    capabilities: Vec<String>,
    clock: u64,
    lines: Vec<Line>,
    items: Vec<Token>,
    attr_order: BTreeMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    moves: Vec<Move>,
}
#[derive(Clone, Debug)]
pub(super) struct Block {
    kind: &'static str,
    marker: usize,
    virtual_: bool,
    chars: Vec<usize>,
    aliases: Vec<usize>,
    positions: Vec<(usize, usize)>,
}
#[derive(Default)]
struct Grid {
    rows: Vec<usize>,
    cols: Vec<usize>,
    spans: BTreeMap<String, (usize, usize)>,
    covered: BTreeMap<String, (usize, usize)>,
}
pub(super) fn manifest() -> Value {
    serde_json::from_str(NESTED_MANIFEST).unwrap()
}
pub(super) fn history_key(k: &str) -> bool {
    matches!(k, "tone" | "background") || k.starts_with("$cell:") || k.starts_with("$span:")
}
fn slot(owner: &str, name: &str) -> String {
    format!("0@{owner}/{name}")
}
fn cell(row: &str, col: &str) -> String {
    format!("cell:{row},{col}")
}
fn shape(t: &str) -> &'static str {
    match t {
        "paragraph" | "heading" => "text",
        "divider" | "image" => "atom",
        "callout" => "flow",
        "table" => "grid",
        "table-row" => "row",
        "col" => "col",
        _ => "",
    }
}
impl Replica {
    fn nested_shape(&self, t: &str) -> &'static str {
        if let Some(schema) = &self.runtime {
            return match schema.manifest()["nodes"][t]["shape"].as_str() {
                Some("text") => "text",
                Some("atom") => "atom",
                Some("flow") => "flow",
                Some("grid") => "grid",
                Some("row") => "row",
                Some("cell") => "cell",
                Some("inline") => "inline",
                _ => "",
            };
        }
        if self.shapes && t == "list-item" {
            "text"
        } else if self.shapes && t == "inline-image" {
            "inline"
        } else {
            shape(t)
        }
    }
    fn grid_parts(&self, grid: &str) -> Option<(&str, &str, &str)> {
        if let Some(schema) = &self.runtime {
            let nodes = &schema.manifest()["nodes"];
            if nodes[grid]["shape"] != "grid" {
                return None;
            }
            let row = nodes[grid]["children"][0].as_str()?;
            let cell = nodes[row]["children"][0].as_str()?;
            let body = nodes[cell]["children"][0].as_str()?;
            return Some((row, cell, body));
        }
        (grid == "table").then_some(("table-row", "table-cell", "table-cell-body"))
    }
    fn nested_attr(&self, t: &str, k: &str, v: &Value) -> bool {
        if self.runtime.is_some() {
            return self.validate_node_attr(t, k, v).is_ok();
        }
        self.manifest()["nodes"][t]["attrs"]
            .get(k)
            .is_some_and(|s| s["computed"] != true && general::attr_ok(s, v))
    }
    fn runtime_flow_type(&self, line: &str) -> Option<&str> {
        let schema = self.runtime.as_ref().filter(|s| !s.is_graphic())?;
        let required = required_address(line);
        let line = required.as_ref().map(|a| a.0.as_str()).unwrap_or(line);
        let key = text_address(line)
            .map(|a| a.parent)
            .unwrap_or_else(|| line.into());
        if key == Ticket::root().key() {
            return schema.manifest()["root"].as_str();
        }
        let l = self.line_of(&key)?;
        let owner = self.index_key(l.owner.as_ref()?)?;
        let born = self.items[owner].node.as_ref()?.born.as_str();
        if l.slot.starts_with("cell:") {
            self.grid_parts(born).map(|(_, _, body)| body)
        } else if l.slot == "body" {
            Some(born)
        } else {
            None
        }
    }
    fn line_default_type(&self, line: &str) -> String {
        if let Some((_,kind,_))=required_address(line) { let concrete=self.required_concrete(&kind); if self.nested_shape(&concrete)=="text" {return concrete;} }
        self.runtime_flow_type(line)
            .and_then(|flow| {
                self.runtime.as_ref().unwrap().manifest()["nodes"][flow]["default"]
                    .as_str()
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| "paragraph".into())
    }
    fn runtime_child_allowed(&self, line: &str, child: &str) -> bool {
        if let Some(l) = self
            .line_number(line)
            .map(|n| &self.nested.as_ref().unwrap().lines[n])
        {
            if l.slot == "cols" {
                return child == "col";
            }
            if l.slot == "rows" {
                return l
                    .owner
                    .as_ref()
                    .and_then(|k| self.index_key(k))
                    .and_then(|i| self.items[i].node.as_ref())
                    .and_then(|n| self.grid_parts(&n.born))
                    .is_some_and(|(row, _, _)| child == row);
            }
        }
        let Some(flow) = self.runtime_flow_type(line) else {
            return self.runtime.is_none() || self.graphic;
        };
        let nodes = &self.runtime.as_ref().unwrap().manifest()["nodes"];
        nodes[flow]["children"].as_array().is_some_and(|children| {
            children.iter().any(|c| {
                let kind = c.as_str().unwrap();
                if nodes[kind]["shape"] == "group" {
                    nodes[kind]["children"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|member| {
                            self.runtime_stored_or_inline(nodes, member.as_str().unwrap(), child)
                        })
                } else {
                    self.runtime_stored_or_inline(nodes, kind, child)
                }
            })
        })
    }
    fn runtime_stored_or_inline(&self, nodes: &Value, kind: &str, child: &str) -> bool {
        kind == child
            || nodes[kind]["shape"] == "text"
                && nodes[child]["shape"] == "inline"
                && nodes[kind]["children"]
                    .as_array()
                    .is_some_and(|cs| cs.iter().any(|c| c == child))
    }
    fn group_owner<'a>(&'a self, line: &str, kind: &str) -> Option<(&'a str, &'a Value)> {
        let schema = self.runtime.as_ref()?;
        let flow = self.runtime_flow_type(line)?;
        let nodes = &schema.manifest()["nodes"];
        nodes[flow]["children"].as_array()?.iter().find_map(|name| {
            let name = name.as_str()?;
            let spec = &nodes[name];
            (spec["shape"] == "group" && spec["children"].as_array()?.iter().any(|c| c == kind))
                .then_some((name, spec))
        })
    }
    fn block_group(&self, b: &Block, line: &str) -> Option<(String, Vec<String>)> {
        if b.kind != "text" {
            return None;
        }
        let kind = if b.virtual_ {
            self.line_default_type(line)
        } else {
            self.ntype(&self.items[b.marker])
        };
        if let Some((name, spec)) = self.group_owner(line, &kind) {
            return Some((
                name.into(),
                spec["by"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|k| k.as_str().unwrap().into())
                    .collect(),
            ));
        }
        if self.shapes && kind == "list-item" {
            return Some(("list".into(), vec!["level".into(), "listType".into()]));
        }
        None
    }

    fn line_number(&self, key: &str) -> Option<usize> {
        self.nested
            .as_ref()?
            .lines
            .iter()
            .position(|l| l.key == key)
    }
    fn line_of(&self, key: &str) -> Option<&Line> {
        self.nested
            .as_ref()?
            .lines
            .iter()
            .find(|l| l.ids.iter().any(|s| s == key))
    }
    fn head(&self, t: &Token) -> bool {
        self.line_of(&t.id.key())
            .is_some_and(|l| l.key == t.id.key())
    }
    fn ntype(&self, t: &Token) -> String {
        let stored = t
            .attrs
            .get("$type")
            .and_then(|r| r.value.as_str())
            .unwrap_or_else(|| {
                t.node
                    .as_ref()
                    .map(|n| n.born.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or("")
            })
            .to_owned();
        if stored.is_empty() {
            self.line_of(&t.id.key())
                .map(|l| self.line_default_type(&l.key))
                .unwrap_or_else(|| self.default_text_type().into())
        } else {
            stored
        }
    }
    fn ensure(&mut self, key: &str) -> Result<usize> {
        if self.movement && text_address(key).is_some() {
            return self.ensure_text_storage(key);
        }
        if let Some(i) = self.index_key(key) {
            return Ok(i);
        }
        if required_address(key).is_some() { return Err("invalid required storage address".into()); }
        let rest = key.strip_prefix("0@").ok_or("missing nested token")?;
        let (owner_key, name) = rest.split_once('/').ok_or("invalid slot identity")?;
        let owner = self.index_key(owner_key).ok_or("missing slot owner")?;
        let born = self.items[owner]
            .node
            .as_ref()
            .ok_or("slot owner is not a stored node")?
            .born
            .as_str();
        let good = match name {
            "children" if self.graphic => self.manifest()["nodes"][born]["shape"] == "container",
            "text" if self.graphic => self.manifest()["nodes"][born]["shape"] == "text",
            "body" => self.nested_shape(born) == "flow" && born != self.root_type(),
            "rows" | "cols" => self.nested_shape(born) == "grid",
            _ => {
                if let Some((r, c)) = name.strip_prefix("cell:").and_then(|s| s.split_once(',')) {
                    self.nested_shape(born) == "grid"
                        && self
                            .line_of(r)
                            .is_some_and(|l| l.key == slot(owner_key, "rows") && l.key != r)
                        && self
                            .line_of(c)
                            .is_some_and(|l| l.key == slot(owner_key, "cols") && l.key != c)
                } else {
                    false
                }
            }
        };
        if !good {
            return Err("invalid owner/slot membership".into());
        }
        let mut token = Token::root();
        token.id = parse_key(key)?;
        self.clear_movement_cache();
        let index = self.items.len();
        self.items.push(token);
        self.nested.as_mut().unwrap().lines.push(Line {
            key: key.into(),
            owner: Some(owner_key.into()),
            slot: name.into(),
            ids: vec![key.into()],
        });
        Ok(index)
    }
    fn integrate_nested(&mut self, token: Token) -> Result<()> {
        let origin = token.origin.as_ref().ok_or("birth origin missing")?.clone();
        self.ensure(&origin)?;
        if let Some(i) = self.index(&token.id) {
            let old = &self.items[i];
            if old.origin != token.origin
                || old.unit != token.unit
                || old.node.as_ref().map(|n| (&n.born, &n.boundary))
                    != token.node.as_ref().map(|n| (&n.born, &n.boundary))
            {
                return Err("conflicting nested birth".into());
            }
            return Ok(());
        }
        let line = self
            .line_of(&origin)
            .ok_or("missing origin line")?
            .key
            .clone();
        let ln = self.line_number(&line).unwrap();
        let ids = &self.nested.as_ref().unwrap().lines[ln].ids;
        let mut at = ids.iter().position(|k| k == &origin).unwrap() + 1;
        while at < ids.len()
            && self.items[self.index_key(&ids[at]).unwrap()]
                .id
                .cmp_js(&token.id)
                == Ordering::Greater
        {
            at += 1;
        }
        let key = token.id.key();
        self.items.push(token);
        self.nested.as_mut().unwrap().lines[ln].ids.insert(at, key);
        Ok(())
    }
    pub(super) fn validate_nested_set(&self, t: &Token, k: &str, v: &Value) -> Result<()> {
        if t.unit.is_some() {
            return self.validate_nested_mark(k, v);
        }
        let line = self.line_of(&t.id.key()).ok_or("target line missing")?;
        if line.slot == "rows" || line.slot == "cols" {
            return Err("axis attributes unsupported".into());
        }
        let fallback = self.line_default_type(&line.key);
        let born = t
            .node
            .as_ref()
            .map(|n| n.born.as_str())
            .unwrap_or(&fallback);
        if let Some(suffix) = k.strip_prefix("$span:") {
            let (r, c) = suffix.split_once(',').ok_or("invalid span key")?;
            let belongs = |key: &str, name: &str| {
                self.line_of(key)
                    .is_some_and(|l| l.key == slot(&t.id.key(), name))
            };
            if self.nested_shape(born) != "grid" || !belongs(r, "rows") || !belongs(c, "cols") {
                return Err("span axis belongs to other table".into());
            }
            if !v.is_null() {
                let o = object(v)?;
                fields(o, &["row", "col"])?;
                if !belongs(string(o, "row")?, "rows") || !belongs(string(o, "col")?, "cols") {
                    return Err("invalid span endpoint".into());
                }
            }
            return Ok(());
        }
        if let Some(suffix) = k.strip_prefix("$cell:") {
            let (axes, name) = suffix.split_once('|').ok_or("invalid cell key")?;
            let (r, c) = axes.split_once(',').ok_or("invalid cell coordinates")?;
            if self.nested_shape(born) != "grid"
                || self
                    .line_of(r)
                    .is_none_or(|l| l.key != slot(&t.id.key(), "rows"))
                || self
                    .line_of(c)
                    .is_none_or(|l| l.key != slot(&t.id.key(), "cols"))
                || !self
                    .grid_parts(born)
                    .is_some_and(|(_, cell, _)| self.nested_attr(cell, name, v))
            {
                return Err("invalid cell attribute".into());
            }
            return Ok(());
        }
        if self.movement && k == "$join" {
            return self.validate_join(t, v);
        }
        if k == "$type" {
            if let Some((_,kind,_))=required_address(&line.key) {
                return if v.is_null() || v.as_str()==Some(self.required_concrete(&kind).as_str()) {Ok(())}else{Err("required slot type is immutable".into())};
            }
            return if (self.head(t) || self.nested_text_type(born))
                && (v.is_null()
                    || v.as_str().is_some_and(|v| {
                        self.nested_text_type(v) && self.runtime_child_allowed(&line.key, v)
                    }))
            {
                Ok(())
            } else {
                Err("invalid text type write".into())
            };
        }
        if let Some(schema) = &self.runtime {
            let shape = self.nested_shape(born);
            return if schema.manifest()["nodes"]
                .as_object()
                .unwrap()
                .keys()
                .any(|name| {
                    (if shape == "text" {
                        self.nested_shape(name) == "text"
                    } else {
                        name == born
                    }) && self.nested_attr(name, k, v)
                }) {
                Ok(())
            } else {
                Err(format!("invalid runtime nested attribute {k}"))
            };
        }
        let candidates: Vec<&str> = match self.nested_shape(born) {
            "text" if self.shapes => vec!["paragraph", "heading", "list-item"],
            "text" => vec!["paragraph", "heading"],
            "inline" => vec!["inline-image"],
            "atom" => vec!["divider", "image"],
            "flow" => vec!["callout"],
            "grid" => vec!["table"],
            _ => vec![],
        };
        if candidates.into_iter().any(|t| self.nested_attr(t, k, v)) {
            Ok(())
        } else {
            Err(format!("invalid nested attribute {k}"))
        }
    }
    pub(super) fn apply_nested(&mut self, value: &Value) -> Result<()> {
        self.clear_movement_cache();
        let op = object(value)?;
        let kind = string(op, "t")?;
        match kind {
            "move" if self.movement => self.apply_move(value)?,
            "text" => {
                fields(op, &["t", "id", "origin", "units", "marks"])?;
                let id = ticket(op, "id")?;
                id.birth_valid()?;
                if self.runtime.as_ref().is_some_and(|s|s.manifest()["nodes"].as_object().unwrap().values().any(|n|n["childRules"].as_object().is_some_and(|r|!r.is_empty()))) && id.actor.starts_with("~required:") {return Err("reserved required birth actor".into());}
                let origin = ticket(op, "origin")?;
                self.ensure(&origin.key())?;
                let line = self.line_of(&origin.key()).unwrap();
                if line.slot == "rows" || line.slot == "cols" {
                    return Err("axis text rejected".into());
                }
                if self.runtime_flow_type(&line.key).is_some_and(|flow| !self.runtime_accepts_text(flow)) {
                    return Err("flow rejects text".into());
                }
                let units: Vec<u16> = decode(required(op, "units")?)?;
                if units.is_empty()
                    || id
                        .lamport
                        .checked_add(units.len() as u64 - 1)
                        .is_none_or(|n| n > MAX)
                {
                    return Err("invalid text span".into());
                }
                let marks: BTreeMap<String, Value> =
                    op.get("marks").map(decode).transpose()?.unwrap_or_default();
                self.validate_nested_marks(&marks)?;
                for (n, u) in units.iter().enumerate() {
                    let tid = Ticket {
                        lamport: id.lamport + n as u64,
                        actor: id.actor.clone(),
                    };
                    let origin = if n == 0 {
                        origin.key()
                    } else {
                        Ticket {
                            lamport: tid.lamport - 1,
                            actor: tid.actor.clone(),
                        }
                        .key()
                    };
                    let attrs = marks
                        .iter()
                        .map(|(k, v)| {
                            (
                                k.clone(),
                                Register {
                                    value: json!(v),
                                    at: tid.clone(),
                                },
                            )
                        })
                        .collect();
                    let fresh = self.index(&tid).is_none();
                    self.integrate_nested(Token {
                        id: tid.clone(),
                        origin: Some(origin),
                        unit: Some(*u),
                        node: None,
                        birth_marks: marks.clone(),
                        attrs,
                        dels: BTreeSet::new(),
                        cancels: BTreeSet::new(),
                    })?;
                    if fresh && !marks.is_empty() {
                        let order = op
                            .get("marks")
                            .and_then(Value::as_object)
                            .unwrap()
                            .keys()
                            .cloned()
                            .collect();
                        self.nested
                            .as_mut()
                            .unwrap()
                            .attr_order
                            .insert(tid.key(), order);
                    }
                    self.observe(&tid);
                }
            }
            "node" => {
                fields(op, &["t", "id", "origin", "type", "boundary", "attrs"])?;
                let id = ticket(op, "id")?;
                id.birth_valid()?;
                if self.runtime.as_ref().is_some_and(|s|s.manifest()["nodes"].as_object().unwrap().values().any(|n|n["childRules"].as_object().is_some_and(|r|!r.is_empty()))) && id.actor.starts_with("~required:") {return Err("reserved required birth actor".into());}
                let origin = ticket(op, "origin")?;
                self.ensure(&origin.key())?;
                let born = string(op, "type")?.to_owned();
                let line = self.line_of(&origin.key()).unwrap();
                if !self.runtime_child_allowed(&line.key, &born) {
                    return Err("node type is not allowed in parent flow".into());
                }
                let expected = if line.slot == "rows" {
                    line.owner
                        .as_ref()
                        .and_then(|k| self.index_key(k))
                        .and_then(|i| self.items[i].node.as_ref())
                        .and_then(|n| self.grid_parts(&n.born))
                        .map(|(row, _, _)| row)
                } else if line.slot == "cols" {
                    Some("col")
                } else {
                    None
                };
                if expected.is_some_and(|t| t != born)
                    || (expected.is_none()
                        && !matches!(
                            self.nested_shape(&born),
                            "text" | "atom" | "flow" | "grid" | "inline"
                        ))
                {
                    return Err("node birth shape rejected".into());
                }
                let boundary = op
                    .get("boundary")
                    .map(|v| v.as_str().ok_or("invalid boundary"))
                    .transpose()?
                    .unwrap_or("")
                    .to_owned();
                if self.nested_text_type(&born) {
                    let ordinary = if let Some((ordinary,child))=boundary.rsplit_once("|child:") {
                        let constrained=self.runtime_flow_type(&line.key).is_some_and(|flow|{
                            let nodes=&self.runtime.as_ref().unwrap().manifest()["nodes"];
                            let kind=self.group_owner(&line.key,&born).map(|g|g.0).unwrap_or(&born);
                            required_address(&line.key).is_none() && nodes[flow]["childRules"].get(kind).is_some()
                        });
                        if child!=id.key() || !constrained {return Err("invalid constrained child boundary".into());}
                        ordinary
                    } else {boundary.as_str()};
                    let right = if self.movement {
                        self.split_right(ordinary, &origin)?
                    } else {
                        paragraph::boundary_right(ordinary, &origin)?
                    };
                    if right.as_ref().is_some_and(|r| {
                        *r == id
                            || self.index(r).is_none_or(|i| {
                                !self.movement && self.line_of(&self.items[i].id.key()).is_none_or(|right_line| {
                                    right_line.key!=line.key && !required_address(&right_line.key).is_some_and(|a|a.0==line.key)
                                })
                            })
                    }) {
                        return Err("invalid cross-line boundary".into());
                    }
                } else if !boundary.is_empty() {
                    return Err("nontext boundary rejected".into());
                }
                let birth_attrs: BTreeMap<String, Value> =
                    op.get("attrs").map(decode).transpose()?.unwrap_or_default();
                if expected.is_none() {
                    for (k, v) in &birth_attrs {
                        if !self.nested_attr(&born, k, v) {
                            return Err("invalid birth attribute".into());
                        }
                    }
                } else if !birth_attrs.is_empty() {
                    return Err("axis birth attrs unsupported".into());
                }
                let mut attrs: BTreeMap<String, Register> = birth_attrs
                    .iter()
                    .map(|(k, v)| {
                        (
                            k.clone(),
                            Register {
                                value: v.clone(),
                                at: id.clone(),
                            },
                        )
                    })
                    .collect();
                attrs.insert(
                    "$type".into(),
                    Register {
                        value: json!(born),
                        at: id.clone(),
                    },
                );
                let fresh = self.index(&id).is_none();
                self.integrate_nested(Token {
                    id: id.clone(),
                    origin: Some(origin.key()),
                    unit: None,
                    node: Some(ParagraphBirth {
                        born,
                        boundary,
                        type_at: id.clone(),
                        birth_attrs: Some(birth_attrs),
                    }),
                    birth_marks: BTreeMap::new(),
                    attrs,
                    dels: BTreeSet::new(),
                    cancels: BTreeSet::new(),
                })?;
                if fresh {
                    let mut order = vec!["$type".to_string()];
                    if let Some(a) = op.get("attrs").and_then(Value::as_object) {
                        order.extend(a.keys().cloned());
                    }
                    self.nested
                        .as_mut()
                        .unwrap()
                        .attr_order
                        .insert(id.key(), order);
                }
                self.observe(&id);
            }
            "set" | "del" | "undel" => {
                fields(
                    op,
                    match kind {
                        "set" => &["t", "at", "ids", "key", "value"],
                        "del" => &["t", "at", "ids"],
                        _ => &["t", "at", "ids", "cancels"],
                    },
                )?;
                let at = ticket(op, "at")?;
                at.valid()?;
                let ids: Vec<Ticket> = decode(required(op, "ids")?)?;
                let cancels: Vec<Ticket> = if kind == "undel" {
                    decode(required(op, "cancels")?)?
                } else {
                    vec![]
                };
                for c in &cancels {
                    c.valid()?;
                }
                for id in ids {
                    id.valid()?;
                    let i = self.ensure(&id.key())?;
                    if kind == "set" {
                        self.validate_nested_set(
                            &self.items[i],
                            string(op, "key")?,
                            required(op, "value")?,
                        )?;
                    } else if self.head(&self.items[i]) || required_address(&id.key()).is_some() {
                        return Err("line head existence rejected".into());
                    }
                    if kind == "set" {
                        let k = string(op, "key")?;
                        let order = self
                            .nested
                            .as_mut()
                            .unwrap()
                            .attr_order
                            .entry(id.key())
                            .or_default();
                        if !order.iter().any(|s| s == k) {
                            order.push(k.into());
                        }
                    }
                    let token = &mut self.items[i];
                    match kind {
                        "del" => {
                            token.dels.insert(at.key());
                        }
                        "undel" => {
                            token.cancels.extend(cancels.iter().map(Ticket::key));
                        }
                        _ => {
                            let key = string(op, "key")?;
                            if token
                                .attrs
                                .get(key)
                                .is_none_or(|r| at.cmp_js(&r.at) == Ordering::Greater)
                            {
                                token.attrs.insert(
                                    key.into(),
                                    Register {
                                        value: required(op, "value")?.clone(),
                                        at: at.clone(),
                                    },
                                );
                            }
                        }
                    }
                }
                self.observe(&at);
            }
            _ => return Err(format!("unsupported nested operation {kind}")),
        }
        self.clear_movement_cache();
        self.refresh_nested()?;
        Ok(())
    }
    fn line_ids(&self, key: &str) -> Vec<usize> {
        self.line_number(key)
            .map(|n| {
                self.nested.as_ref().unwrap().lines[n]
                    .ids
                    .iter()
                    .filter_map(|k| self.index_key(k))
                    .collect()
            })
            .unwrap_or_default()
    }
    fn axis(&self, owner: &str, name: &str) -> Vec<usize> {
        self.line_ids(&slot(owner, name))
            .into_iter()
            .skip(1)
            .filter(|i| self.items[*i].alive())
            .collect()
    }
    fn grid(&self, owner: &Token) -> Grid {
        let key = owner.id.key();
        let rows = self.axis(&key, "rows");
        let cols = self.axis(&key, "cols");
        let mut g = Grid {
            rows,
            cols,
            ..Grid::default()
        };
        let order = self
            .nested
            .as_ref()
            .unwrap()
            .attr_order
            .get(&key)
            .cloned()
            .unwrap_or_default();
        let mut entries: Vec<_> = order
            .iter()
            .filter_map(|k| owner.attrs.get(k).map(|v| (k, v)))
            .filter(|(k, v)| k.starts_with("$span:") && !v.value.is_null())
            .collect();
        entries.sort_by(|(_, a), (_, b)| b.at.cmp_js(&a.at));
        let extent = |axis: &Vec<usize>, name: &str, start: usize, end: &str| {
            let all = self.line_ids(&slot(&key, name));
            let end = all.iter().position(|i| self.items[*i].id.key() == end);
            end.map(|end| {
                axis.iter()
                    .skip(start)
                    .take_while(|i| all.iter().position(|j| j == *i).unwrap() <= end)
                    .count()
                    .max(1)
            })
            .unwrap_or(1)
        };
        for (k, r) in entries {
            let Some((rk, ck)) = k[6..].split_once(',') else {
                continue;
            };
            let Some(ri) = g.rows.iter().position(|i| self.items[*i].id.key() == rk) else {
                continue;
            };
            let Some(ci) = g.cols.iter().position(|i| self.items[*i].id.key() == ck) else {
                continue;
            };
            let rs = extent(&g.rows, "rows", ri, r.value["row"].as_str().unwrap_or(""));
            let cs = extent(&g.cols, "cols", ci, r.value["col"].as_str().unwrap_or(""));
            let area: Vec<_> = (ri..ri + rs)
                .flat_map(|r| (ci..ci + cs).map(move |c| format!("{r},{c}")))
                .collect();
            if rs == 1 && cs == 1
                || area
                    .iter()
                    .any(|k| g.spans.contains_key(k) || g.covered.contains_key(k))
            {
                continue;
            }
            g.spans.insert(format!("{ri},{ci}"), (rs, cs));
            for k in area.into_iter().skip(1) {
                g.covered.insert(k, (ri, ci));
            }
        }
        g
    }
    fn blocks_nested(&self, key: &str) -> Vec<Block> {
        if self.has_moves() && text_address(key).is_none() && required_address(key).is_none() {
            if let Some(blocks) = self.movement_cache.borrow().get(key) {
                return self.apply_child_rules(key,blocks.clone());
            }
            let blocks = self.movement_blocks(key).0;
            self.movement_cache
                .borrow_mut()
                .insert(key.into(), blocks.clone());
            return self.apply_child_rules(key,blocks);
        }
        self.apply_child_rules(key,self.source_blocks(key))
    }
    fn source_blocks(&self, key: &str) -> Vec<Block> {
        let Some(n) = self.line_number(key) else {
            return vec![];
        };
        let l = &self.nested.as_ref().unwrap().lines[n];
        if l.slot == "rows" || l.slot == "cols" {
            return vec![];
        }
        let ids = self.line_ids(key);
        let mut primary = BTreeMap::new();
        for &i in &ids {
            let t = &self.items[i];
            if t.alive() && (i == ids[0] || self.nested_text_type(&self.ntype(t))) {
                primary
                    .entry(
                        t.node
                            .as_ref()
                            .map(|n| n.boundary.as_str())
                            .unwrap_or("root"),
                    )
                    .or_insert(i);
            }
        }
        let retained: BTreeSet<_> = if self.has_moves() {
            self.sorted_moves().iter().map(|m| m.target.key()).collect()
        } else {
            BTreeSet::new()
        };
        for &i in &ids {
            let t = &self.items[i];
            if (t.alive() || self.head(t) || retained.contains(&t.id.key()))
                && (self.head(t) || self.nested_text_type(&self.ntype(t)))
            {
                primary
                    .entry(
                        t.node
                            .as_ref()
                            .map(|n| n.boundary.as_str())
                            .unwrap_or("root"),
                    )
                    .or_insert(i);
            }
        }
        let mut out: Vec<Block> = vec![];
        let mut pending = None;
        for i in ids {
            let t = &self.items[i];
            let head = t.id.key() == key;
            if !t.alive() && !head && !retained.contains(&t.id.key()) {
                continue;
            }
            if t.unit.is_some() || self.nested_shape(&self.ntype(t)) == "inline" {
                if let Some(b) = pending.take() {
                    out.push(b)
                }
                if let Some(b) = out.last_mut() {
                    b.chars.push(i)
                }
                continue;
            }
            if head || self.nested_text_type(&self.ntype(t)) {
                let boundary = t
                    .node
                    .as_ref()
                    .map(|n| n.boundary.as_str())
                    .unwrap_or("root");
                let p = primary.get(boundary).copied().unwrap_or(i);
                if p == i {
                    pending = None;
                    out.push(Block {
                        kind: "text",
                        marker: i,
                        virtual_: false,
                        chars: vec![],
                        aliases: vec![],
                        positions: vec![],
                    });
                } else {
                    if let Some(b) = pending.take() {
                        out.push(b)
                    }
                    if let Some(b) = out.iter_mut().find(|b| b.marker == p) {
                        b.aliases.push(i);
                    }
                }
            } else {
                let kind = match self.nested_shape(&self.ntype(t)) {
                    "grid" => {
                        let g = self.grid(t);
                        if g.rows.is_empty() || g.cols.is_empty() {
                            continue;
                        }
                        "grid"
                    }
                    "flow" => "flow",
                    _ => "atom",
                };
                if let Some(b) = pending.take() {
                    out.push(b)
                }
                out.push(Block {
                    kind,
                    marker: i,
                    virtual_: false,
                    chars: vec![],
                    aliases: vec![],
                    positions: vec![],
                });
                pending = Some(Block {
                    kind: "text",
                    marker: i,
                    virtual_: true,
                    chars: vec![],
                    aliases: vec![],
                    positions: vec![],
                });
            }
        }
        if let Some(b) = pending {
            out.push(b)
        }
        out
    }
    pub(super) fn refresh_nested(&mut self) -> Result<()> {
        let before=self.items.len();
        self.refresh_required()?;
        // Canonical zero-clock genesis closure. Lazy Map materialization order is
        // not observable in the comparison; authored tokens and line RGA order are.
        let owners: Vec<_> = self
            .items
            .iter()
            .filter_map(|t| {
                t.node
                    .as_ref()
                    .filter(|n| matches!(self.nested_shape(&n.born), "flow" | "grid"))
                    .map(|n| (t.id.key(), n.born.clone()))
            })
            .collect();
        for (key, born) in owners {
            if self.nested_shape(&born) == "flow" {
                self.ensure(&slot(&key, "body"))?;
                continue;
            }
            self.ensure(&slot(&key, "rows"))?;
            self.ensure(&slot(&key, "cols"))?;
            let rows = self.line_ids(&slot(&key, "rows"));
            let cols = self.line_ids(&slot(&key, "cols"));
            for r in rows.into_iter().skip(1) {
                for &c in cols.iter().skip(1) {
                    self.ensure(&slot(
                        &key,
                        &cell(&self.items[r].id.key(), &self.items[c].id.key()),
                    ))?;
                }
            }
        }
        if self.items.len()!=before {return self.refresh_nested();}
        if self.has_moves() {
            self.refresh_movement()?;
        }
        Ok(())
    }

    pub(super) fn attrs_nested(&self, t: &Token, type_: &str, virtual_: bool) -> Value {
        let m = self.manifest();
        let mut out = Map::new();
        if let Some(attrs) = m["nodes"][type_]["attrs"].as_object() {
            for (k, s) in attrs {
                if s["computed"] == true {
                    continue;
                }
                out.insert(
                    k.clone(),
                    if s.get("fields").is_some() {
                        fields::materialize(s,k,|key| (!virtual_).then(|| t.attrs.get(key).map(|r| r.value.clone())).flatten())
                    } else if virtual_ {
                        s["default"].clone()
                    } else {
                        t.attrs
                            .get(k)
                            .map(|r| &r.value)
                            .filter(|v| {
                                !v.is_null()
                                    && (self.runtime.is_none()
                                        || runtime_schema::atomic_value_ok(s, v))
                            })
                            .unwrap_or(&s["default"])
                            .clone()
                    },
                );
            }
        }
        json!(out)
    }
    fn cell_attrs(&self, t: &Token, r: &str, c: &str) -> Value {
        let m = self.manifest();
        let mut out = Map::new();
        let cell_type = self
            .grid_parts(t.node.as_ref().map(|n| n.born.as_str()).unwrap_or(""))
            .map(|(_, cell, _)| cell)
            .unwrap_or("");
        for (k, s) in m["nodes"][cell_type]["attrs"]
            .as_object()
            .into_iter()
            .flatten()
        {
            if s["computed"] == true {
                continue;
            }
            if s.get("fields").is_some() {
                let value = fields::materialize(s, k, |key| {
                    t.attrs
                        .get(&format!("$cell:{r},{c}|{key}"))
                        .map(|r| r.value.clone())
                });
                out.insert(k.clone(), value);
            } else if let Some(v) = t
                .attrs
                .get(&format!("$cell:{r},{c}|{k}"))
                .map(|r| &r.value)
                .filter(|v| {
                    !v.is_null()
                        && (v.is_object() || v.is_array() || **v != s["default"])
                        && (self.runtime.is_none() || runtime_schema::atomic_value_ok(s, v))
                })
            {
                out.insert(k.clone(), v.clone());
            }
        }
        json!(out)
    }
    fn projection(&self, line: &str) -> Value {
        json!(self
            .blocks_nested(line)
            .iter()
            .map(|b| self.block_json(b, line))
            .collect::<Vec<_>>())
    }
    /// Read physical source blocks in retained line insertion order. Compilation
    /// uses this view before resolving logical placement paths.
    pub(super) fn source_projections(&self) -> Result<Value> {
        let storage = self.nested.as_ref().ok_or("source projections require nested storage")?;
        Ok(json!({"ok":true,"projections":storage.lines.iter().map(|line| json!({
            "line":line.key,
            "blocks":self.source_blocks(&line.key).iter().map(|block| self.block_json(block,&line.key)).collect::<Vec<_>>()
        })).collect::<Vec<_>>() }))
    }
    fn block_json(&self, b: &Block, line: &str) -> Value {
        let t = &self.items[b.marker];
        let key = t.id.key();
        let type_ = if b.virtual_ {
            self.line_default_type(line)
        } else {
            self.ntype(t)
        };
        let mut v = json!({"kind":b.kind,"marker":key,"type":type_,"attrs":self.attrs_nested(t,&type_,b.virtual_)});
        match b.kind {
            "text" => {
                v["aliases"] = json!(b
                    .aliases
                    .iter()
                    .map(|i| self.items[*i].id.key())
                    .collect::<Vec<_>>());
                v["virtual"] = json!(b.virtual_);
                v["chars"] = json!(b
                    .chars
                    .iter()
                    .map(|i| self.items[*i].id.key())
                    .collect::<Vec<_>>());
                v["textUnits"] = json!(b
                    .chars
                    .iter()
                    .map(|i| self.items[*i].unit.unwrap_or(0xfffc))
                    .collect::<Vec<_>>());
            }
            "flow" => v["body"] = json!(slot(&key, "body")),
            "grid" => {
                let g = self.grid(t);
                v["rows"] = json!(g
                    .rows
                    .iter()
                    .map(|i| self.items[*i].id.key())
                    .collect::<Vec<_>>());
                v["cols"] = json!(g
                    .cols
                    .iter()
                    .map(|i| self.items[*i].id.key())
                    .collect::<Vec<_>>());
                v["spans"] = json!(g.spans);
                v["covered"] = json!(g.covered);
                v["cells"]=json!(g.rows.iter().flat_map(|r|g.cols.iter().map(|c|{let r=self.items[*r].id.key();let c=self.items[*c].id.key();json!({"row":r,"col":c,"line":slot(&key,&cell(&r,&c)),"attrs":self.cell_attrs(t,&r,&c)})})).collect::<Vec<_>>());
            }
            _ => {}
        }
        v
    }
    fn model_nested(&self, line: &str) -> Vec<Value> {
        let blocks = self.blocks_nested(line);
        let mut model: Vec<Value> = self.entries_nested(line)
            .iter()
            .map(|entry| {
                let node = self.model_block(&blocks[entry[0]], line);
                let Some((group, by)) = self.block_group(&blocks[entry[0]], line) else {
                    return node;
                };
                let attrs: Map<String, Value> = by
                    .iter()
                    .map(|k| (k.clone(), node["attrs"][k].clone()))
                    .collect();
                let children: Vec<_> = entry
                    .iter()
                    .map(|i| {
                        let mut child = self.model_block(&blocks[*i], line);
                        if let Some(attrs) = child.get_mut("attrs").and_then(Value::as_object_mut) {
                            for key in &by {
                                attrs.shift_remove(key);
                            }
                            if attrs.is_empty() {
                                child.as_object_mut().unwrap().shift_remove("attrs");
                            }
                        }
                        child
                    })
                    .collect();
                let mut result = json!({"type":group,"children":children});
                if !attrs.is_empty() {
                    result["attrs"] = json!(attrs);
                }
                result
            })
            .collect();
        // Model canonicalization does not change block placement or storage.
        // Required private lines do not inherit the parent flow's rules.
        if required_address(line).is_some() {
            return model;
        }
        let Some(flow) = self.runtime_flow_type(line) else {
            return model;
        };
        let nodes = &self.runtime.as_ref().unwrap().manifest()["nodes"];
        let spec = &nodes[flow];
        if spec["shape"] != "flow" {
            return model;
        }
        let first_text = model.first().is_some_and(|node| {
            let kind = node["type"].as_str().unwrap_or("");
            nodes[kind]["shape"] == "text" || nodes[kind]["shape"] == "group"
        });
        let default = self.line_default_type(line);
        if !first_text && spec["childRules"][&default]["max"] != 0 {
            let empty = Block {
                kind: "text", marker: self.index_key(line).unwrap(), virtual_: true,
                chars: vec![], aliases: vec![], positions: vec![],
            };
            let mut node = self.model_block(&empty, line);
            if let Some((group, by)) = self.block_group(&empty, line) {
                let attrs: Map<String, Value> = by.iter().map(|key| (key.clone(), node["attrs"][key].clone())).collect();
                if let Some(child_attrs) = node.get_mut("attrs").and_then(Value::as_object_mut) {
                    for key in by { child_attrs.shift_remove(&key); }
                    if child_attrs.is_empty() { node.as_object_mut().unwrap().shift_remove("attrs"); }
                }
                node = json!({"type":group,"children":[node]});
                if !attrs.is_empty() { node["attrs"] = json!(attrs); }
            }
            model.insert(0, node);
        }
        if let Some(rules) = spec["childRules"].as_object() {
            let mut counts = BTreeMap::<String, u64>::new();
            model.retain(|node| {
                let kind = node["type"].as_str().unwrap_or("");
                let count = counts.entry(kind.into()).or_default();
                if rules.get(kind).and_then(|rule| rule["max"].as_u64()).is_some_and(|max| *count >= max) {
                    return false;
                }
                *count += 1;
                true
            });
        }
        model
    }
    /// Model entries retain flat block indexes so selection and grouping share
    /// one native projection, including skipped empty virtual paragraphs.
    fn entries_nested(&self, line: &str) -> Vec<Vec<usize>> {
        let blocks = self.blocks_nested(line);
        let mut out: Vec<Vec<usize>> = vec![];
        let mut last_group: Option<(String, String)> = None;
        for (i, b) in blocks.iter().enumerate() {
            if b.virtual_ && b.chars.is_empty() {
                continue;
            }
            let current = self.block_json(b, line);
            let group = self.block_group(b, line).map(|(name, by)| {
                let values: Vec<_> = by.iter().map(|k| current["attrs"][k].clone()).collect();
                (name, format!("{}:{}",general::json_group_key(&json!(values)), self.line_of(&self.items[b.marker].id.key()).filter(|l|required_address(&l.key).is_some()).map(|l|l.key.as_str()).unwrap_or("")))
            });
            if group.is_some() && group == last_group {
                out.last_mut().unwrap().push(i);
            } else {
                out.push(vec![i]);
            }
            last_group = group;
        }
        out
    }
    fn model_block(&self, block: &Block, line: &str) -> Value {
        let token = &self.items[block.marker];
        let type_ = if block.virtual_ {
            self.line_default_type(line)
        } else {
            self.ntype(token)
        };
        let attrs = self.attrs_nested(token, &type_, block.virtual_);
        let mut node = json!({"type":type_});
        if attrs.as_object().is_some_and(|a| !a.is_empty()) {
            node["attrs"] = attrs;
        }
        match block.kind {
            "text" => {
                node["runs"] = json!(if self.runtime.is_some() {
                    self.runtime_runs(&block.chars)
                } else if self.shapes {
                    self.shapes_runs(&block.chars)
                } else {
                    self.runs(&block.chars)
                })
            }
            "flow" => node["children"] = json!(self.model_nested(&slot(&token.id.key(), "body"))),
            "grid" => node["children"] = self.model_rows(token),
            _ => {}
        }
        node
    }
    fn model_rows(&self, token: &Token) -> Value {
        let grid = self.grid(token);
        let (row_type, cell_type, body_type) = self
            .grid_parts(token.node.as_ref().unwrap().born.as_str())
            .unwrap();
        let mut rows = vec![];
        for (ri, r) in grid.rows.iter().enumerate() {
            let mut cells = vec![];
            for (ci, c) in grid.cols.iter().enumerate() {
                let row = self.items[*r].id.key();
                let col = self.items[*c].id.key();
                let children = self.model_nested(&slot(&token.id.key(), &cell(&row, &col)));
                let mut node =
                    json!({"type":cell_type,"children":[{"type":body_type,"children":children}]});
                let mut attrs = Map::new();
                let coordinate = format!("{ri},{ci}");
                if let Some((rs, cs)) = grid.spans.get(&coordinate) {
                    attrs.insert("colspan".into(), json!(cs));
                    attrs.insert("rowspan".into(), json!(rs));
                } else if grid.covered.contains_key(&coordinate) {
                    attrs.insert("spanned".into(), json!(true));
                }
                attrs.extend(
                    self.cell_attrs(token, &row, &col)
                        .as_object()
                        .unwrap()
                        .clone(),
                );
                if !attrs.is_empty() {
                    node["attrs"] = json!(attrs);
                }
                cells.push(node);
            }
            rows.push(json!({"type":row_type,"children":cells}));
        }
        json!(rows)
    }
    fn raw_nested(&self, t: &Token) -> Value {
        let line = self.line_of(&t.id.key()).unwrap();
        let head = line.key == t.id.key();
        json!({"id":t.id,"origin":t.origin,"kind":if head&&(line.slot=="rows"||line.slot=="cols"){"head"}else if t.unit.is_some(){"char"}else{"node"},"born":if self.runtime.is_some() && head {self.line_default_type(&line.key)} else if text_address(&line.key).is_some() && head {"paragraph".into()} else {t.node.as_ref().map(|n|n.born.clone()).unwrap_or_default()},"boundary":if head{"root"}else{t.node.as_ref().map(|n|n.boundary.as_str()).unwrap_or("")},"unit":t.unit,"visible":t.alive(),"dels":js_sorted(&t.dels),"cancels":js_sorted(&t.cancels),"attrs":t.attrs})
    }
    pub(super) fn nested_state(&self) -> Value {
        let mut lines = self.nested.as_ref().unwrap().lines.clone();
        lines.sort_by(|a, b| a.key.encode_utf16().cmp(b.key.encode_utf16()));
        let ordered: Vec<_> = lines.iter().flat_map(|l| self.line_ids(&l.key)).collect();
        let tokens: Vec<_> = ordered
            .iter()
            .filter(|i| !self.head(&self.items[**i]))
            .collect();
        let visible = tokens.iter().filter(|i| self.items[***i].alive()).count();
        let mut state = json!({"clock":self.clock,"items":ordered.iter().map(|i|self.raw_nested(&self.items[*i])).collect::<Vec<_>>(),"lines":lines.iter().map(|l|json!({"key":l.key,"owner":l.owner,"slot":l.slot,"items":self.line_ids(&l.key).iter().map(|i|self.raw_nested(&self.items[*i])).collect::<Vec<_>>()})).collect::<Vec<_>>(),"model":{"type":self.root_type(),"children":self.model_nested(&Ticket::root().key())},"blocks":self.projection(&Ticket::root().key()),"projections":lines.iter().map(|l|json!({"line":l.key,"blocks":self.projection(&l.key)})).collect::<Vec<_>>(),"counts":{"tokens":tokens.len(),"visible":visible,"tombstones":tokens.len()-visible}});
        if self.movement {
            state["moves"] = json!(self.sorted_moves());
        }
        if self.runtime.is_some() {
            let placements: BTreeMap<String, Value> = self
                .placement_projection()
                .current
                .iter()
                .map(|(key, entry)| {
                    (
                        key.clone(),
                        json!({"at":entry.id,"parent":entry.parent,"after":entry.after}),
                    )
                })
                .collect();
            state["placements"] = json!(placements);
        }
        state
    }
    pub(super) fn nested_snapshot(&self) -> Value {
        let mut saved = json!(Saved {
            format: if self.movement {
                MOVE_FORMAT
            } else if self.shapes {
                SHAPES_FORMAT
            } else {
                NESTED_FORMAT
            }
            .into(),
            schema: self.schema().into(),
            manifest: self.manifest(),
            capabilities: vec![if self.movement {
                MOVE_CAPABILITY
            } else if self.shapes {
                SHAPES_CAPABILITY
            } else {
                NESTED_CAPABILITY
            }
            .into()],
            clock: self.clock,
            lines: self.nested.as_ref().unwrap().lines.clone(),
            items: self.items.clone(),
            attr_order: self.nested.as_ref().unwrap().attr_order.clone(),
            moves: self.sorted_moves()
        });
        if self.movement {
            saved["moves"] = json!(self.sorted_moves());
            let mut lines = self.nested.as_ref().unwrap().lines.clone();
            lines.sort_by(|a, b| a.key.encode_utf16().cmp(b.key.encode_utf16()));
            let mut items = vec![self.items[0].clone()];
            for line in &lines {
                for i in self.line_ids(&line.key) {
                    if i != 0 {
                        items.push(self.items[i].clone());
                    }
                }
            }
            saved["lines"] = json!(lines);
            saved["items"] = json!(items);
        }
        saved
    }
    pub(super) fn restore_nested(actor: String, value: &Value) -> Result<Self> {
        let saved: Saved = decode(value)?;
        let movement = saved.format == MOVE_FORMAT;
        if movement && value.get("moves").is_none() {
            return Err("v6 snapshot requires moves".into());
        }
        let shapes = movement || saved.format == SHAPES_FORMAT;
        if saved.format
            != if movement {
                MOVE_FORMAT
            } else if shapes {
                SHAPES_FORMAT
            } else {
                NESTED_FORMAT
            }
            || saved.schema
                != if movement {
                    MOVE_SCHEMA
                } else if shapes {
                    SHAPES_SCHEMA
                } else {
                    NESTED_SCHEMA
                }
            || saved.manifest
                != if shapes {
                    shapes::manifest()
                } else {
                    manifest()
                }
            || saved.capabilities
                != [if movement {
                    MOVE_CAPABILITY
                } else if shapes {
                    SHAPES_CAPABILITY
                } else {
                    NESTED_CAPABILITY
                }]
            || saved.clock > MAX
        {
            return Err("invalid nested snapshot identity".into());
        }
        let mut r = Self::new(actor)?;
        if !movement && !saved.moves.is_empty() {
            return Err("moves require v6".into());
        }
        r.movement = movement;
        r.shapes = shapes;
        r.general = true;
        r.paragraphs = true;
        r.nested = Some(Storage::new());
        if movement {
            r.nested.as_mut().unwrap().moves = saved.moves.clone();
        }
        let root = saved.items.first().ok_or("missing root")?;
        if root.id != Ticket::root()
            || root.origin.is_some()
            || root.node.is_some()
            || root.unit.is_some()
            || !root.birth_marks.is_empty()
            || !root.dels.is_empty()
            || !root.cancels.is_empty()
        {
            return Err("invalid nested root".into());
        }
        let mut seen = BTreeSet::new();
        for t in &saved.items {
            if !seen.insert(t.id.key()) {
                return Err("duplicate snapshot token".into());
            }
        }
        // Rebuild immutable births before validating registers. A grid register may
        // reference an axis born later than its owning grid token.
        let mut pending: Vec<_> = saved.items.iter().skip(1).collect();
        while !pending.is_empty() {
            let before = pending.len();
            let mut next = vec![];
            for token in pending {
                let key = token.id.key();
                if token.origin.is_none() {
                    if r.ensure(&key).is_err() {
                        next.push(token);
                        continue;
                    }
                    if token.unit.is_some()
                        || token.node.is_some()
                        || !token.birth_marks.is_empty()
                        || !token.dels.is_empty()
                        || !token.cancels.is_empty()
                    {
                        return Err("corrupt derived head".into());
                    }
                    continue;
                }
                if r.ensure(token.origin.as_ref().unwrap()).is_err() {
                    next.push(token);
                    continue;
                }
                token.id.birth_valid()?;
                if token.id.lamport > saved.clock {
                    return Err("snapshot future birth".into());
                }
                let origin = parse_key(token.origin.as_ref().unwrap())?;
                if movement {
                    if let Some(node) = &token.node {
                        if r.nested_text_type(&node.born) {
                            let right = if let Some(split) = split_birth(&node.boundary) {
                                if r.index_key(&split.into).is_none()
                                    || r.index_key(&split.after).is_none()
                                {
                                    next.push(token);
                                    continue;
                                }
                                if split.right == "end" {
                                    None
                                } else {
                                    Some(parse_key(&split.right)?)
                                }
                            } else {
                                paragraph::boundary_right(
                                    node.boundary
                                        .strip_prefix("virtual:")
                                        .unwrap_or(&node.boundary),
                                    &origin,
                                )?
                            };
                            if right.as_ref().is_some_and(|id| r.index(id).is_none()) {
                                next.push(token);
                                continue;
                            }
                        }
                    }
                }
                let op = if let Some(u) = token.unit {
                    if token.node.is_some() {
                        return Err("character has node birth".into());
                    }
                    json!({"t":"text","id":token.id,"origin":origin,"units":[u],"marks":token.birth_marks})
                } else {
                    let n = token.node.as_ref().ok_or("missing birth metadata")?;
                    if n.type_at != token.id
                        || !token.birth_marks.is_empty()
                        || n.birth_attrs.is_none()
                    {
                        return Err("invalid immutable node metadata".into());
                    }
                    json!({"t":"node","id":token.id,"origin":origin,"type":n.born,"boundary":n.boundary,"attrs":n.birth_attrs})
                };
                r.apply_nested(&op)?;
            }
            if next.len() == before {
                return Err("orphan snapshot origin".into());
            }
            pending = next;
        }
        for token in &saved.items {
            let i = r.index(&token.id).ok_or("snapshot token missing")?;
            let birth = &r.items[i];
            for (k, v) in &birth.attrs {
                let current = token.attrs.get(k).ok_or("missing birth register")?;
                if current.at.cmp_js(&v.at) == Ordering::Less
                    || current.at == v.at
                        && general::json_group_key(&current.value)
                            != general::json_group_key(&v.value)
                {
                    return Err("corrupt immutable birth register".into());
                }
            }
            for (k, v) in &token.attrs {
                v.at.valid()?;
                if v.at.lamport > saved.clock {
                    return Err("future snapshot register".into());
                }
                if k == "$type"
                    && token
                        .node
                        .as_ref()
                        .is_some_and(|n| !r.nested_text_type(&n.born))
                {
                    if v.at != token.id || v.value != json!(token.node.as_ref().unwrap().born) {
                        return Err("invalid nontext birth type register".into());
                    }
                } else {
                    r.validate_nested_set(birth, k, &v.value)?;
                }
            }
            for d in token.dels.iter().chain(token.cancels.iter()) {
                let at = parse_key(d)?;
                if at.lamport > saved.clock {
                    return Err("future snapshot ledger".into());
                }
            }
        }
        for token in &saved.items {
            let i = r.index(&token.id).unwrap();
            r.items[i] = token.clone();
        }
        for (key, order) in &saved.attr_order {
            let i = r.index_key(key).ok_or("attribute order target missing")?;
            let mut seen = BTreeSet::new();
            if order
                .iter()
                .any(|k| !seen.insert(k) || !r.items[i].attrs.contains_key(k))
                || order.len() != r.items[i].attrs.len()
            {
                return Err("invalid attribute order".into());
            }
        }
        for t in &r.items {
            if !t.attrs.is_empty() && !saved.attr_order.contains_key(&t.id.key()) {
                return Err("missing attribute order".into());
            }
        }
        r.nested.as_mut().unwrap().attr_order = saved.attr_order;
        if movement {
            for op in &saved.moves {
                r.validate_move(op)?;
                if op.at.lamport > saved.clock {
                    return Err("future snapshot move".into());
                }
            }
            let mut seen = BTreeSet::new();
            if saved.moves.iter().any(|m| !seen.insert(m.at.key())) {
                return Err("duplicate snapshot move".into());
            }
        }
        r.clock = saved.clock;
        r.clear_movement_cache();
        r.refresh_nested()?;
        let mut actual = r.nested.as_ref().unwrap().lines.clone();
        let mut expected = saved.lines;
        actual.sort_by(|a, b| a.key.cmp(&b.key));
        expected.sort_by(|a, b| a.key.cmp(&b.key));
        if actual != expected {
            return Err("snapshot line membership/order mismatch".into());
        }
        if r.items.len() != saved.items.len() {
            return Err("snapshot missing derived heads".into());
        }
        Ok(r)
    }
}
impl Replica {
    fn line_visible(&self, key: &str) -> bool {
        if let Some((parent,_,_))=required_address(key) {
            return self.line_visible(&parent) && self.blocks_nested(&parent).iter().any(|b|self.line_of(&self.items[b.marker].id.key()).is_some_and(|l|l.key==key));
        }
        if let Some(a) = text_address(key) {
            return self.line_visible(&a.parent);
        }
        if key == Ticket::root().key() {
            return true;
        }
        let Some(l) = self
            .line_number(key)
            .map(|n| &self.nested.as_ref().unwrap().lines[n])
        else {
            return false;
        };
        let Some(owner) = l.owner.as_ref().and_then(|k| self.index_key(k)) else {
            return false;
        };
        let owner_key = self.items[owner].id.key();
        let Some(parent_key) = self.logical_line(&owner_key) else {
            return false;
        };
        if !self.line_visible(&parent_key) {
            return false;
        }
        let Some(b) = self
            .blocks_nested(&parent_key)
            .into_iter()
            .find(|b| b.marker == owner && b.kind != "text")
        else {
            return false;
        };
        if b.kind == "flow" {
            return l.slot == "body";
        }
        if b.kind == "grid" {
            let Some((r, c)) = l.slot.strip_prefix("cell:").and_then(|s| s.split_once(',')) else {
                return false;
            };
            let g = self.grid(&self.items[owner]);
            let ri = g.rows.iter().position(|i| self.items[*i].id.key() == r);
            let ci = g.cols.iter().position(|i| self.items[*i].id.key() == c);
            return match (ri, ci) {
                (Some(r), Some(c)) => !g.covered.contains_key(&format!("{r},{c}")),
                _ => false,
            };
        }
        false
    }
    // Runtime models retain covered cell bodies, although they are not visual lines.
    fn runtime_covered_cell(&self, key: &str) -> bool {
        if self.runtime.is_none() {
            return false;
        }
        let Some(line) = self.line_number(key).map(|n| &self.nested.as_ref().unwrap().lines[n]) else {
            return false;
        };
        let Some((row, col)) = line.slot.strip_prefix("cell:").and_then(|s| s.split_once(',')) else {
            return false;
        };
        let Some(owner) = line.owner.as_ref().and_then(|k| self.index_key(k)) else {
            return false;
        };
        let Some(parent) = self.logical_line(&self.items[owner].id.key()) else {
            return false;
        };
        if !self.items[owner].alive() || !self.line_visible(&parent)
            || !self.blocks_nested(&parent).iter().any(|b| b.marker == owner && b.kind == "grid")
        {
            return false;
        }
        let grid = self.grid(&self.items[owner]);
        let Some(r) = grid.rows.iter().position(|i| self.items[*i].id.key() == row) else {
            return false;
        };
        let Some(c) = grid.cols.iter().position(|i| self.items[*i].id.key() == col) else {
            return false;
        };
        grid.covered.contains_key(&format!("{r},{c}"))
    }
    fn raw_position(&self, key: &str) -> Option<(String, usize, usize)> {
        let i = self.index_key(key)?;
        if let Some((parent,_,_))=self.line_of(key).and_then(|l|required_address(&l.key)) {
            return self.position_in(&parent,i).or_else(||Some((parent,0,0)));
        }
        if self.has_moves() {
            if let Some((line, true)) = self.movement_location(key) {
                if let Some(p) = self.position_in(&line, i) {
                    return Some(p);
                }
            }
        }
        let l = self.line_of(key)?;
        // An unprojected private root gap has no owner to escape through.
        // Match Doc.posAfter's root-start fallback without exposing storage.
        if self.has_moves() && text_address(&l.key).is_some() && l.owner.is_none() {
            return Some((Ticket::root().key(), 0, 0));
        }
        if !self.line_visible(&l.key) {
            let owner = l.owner.as_ref().and_then(|k| self.index_key(k))?;
            let t = &self.items[owner];
            let parent_key = self.logical_line(&t.id.key())?;
            if l.slot.starts_with("cell:") && self.line_visible(&parent_key) {
                if let Some(b) = self
                    .blocks_nested(&parent_key)
                    .iter()
                    .find(|b| b.marker == owner && b.kind == "grid")
                {
                    let _ = b;
                    let g = self.grid(t);
                    let (rk, ck) = l.slot[5..].split_once(',')?;
                    let near = |axis: &Vec<usize>, name: &str, key: &str| {
                        let all = self.line_ids(&slot(&t.id.key(), name));
                        let at = all
                            .iter()
                            .position(|i| self.items[*i].id.key() == key)
                            .unwrap_or(0);
                        all.iter()
                            .take(at + 1)
                            .filter(|i| axis.contains(i))
                            .next_back()
                            .copied()
                            .or_else(|| axis.first().copied())
                    };
                    let r = near(&g.rows, "rows", rk)?;
                    let c = near(&g.cols, "cols", ck)?;
                    let ri = g.rows.iter().position(|i| *i == r)?;
                    let ci = g.cols.iter().position(|i| *i == c)?;
                    let (ri, ci) = g
                        .covered
                        .get(&format!("{ri},{ci}"))
                        .copied()
                        .unwrap_or((ri, ci));
                    return Some((
                        slot(
                            &t.id.key(),
                            &cell(
                                &self.items[g.rows[ri]].id.key(),
                                &self.items[g.cols[ci]].id.key(),
                            ),
                        ),
                        0,
                        0,
                    ));
                }
            }
            return self.raw_position(&t.id.key());
        }
        let mut positions = BTreeMap::new();
        for (p, b) in self.blocks_nested(&l.key).iter().enumerate() {
            if b.kind != "text" {
                positions.insert(b.marker, (p + 1, 0));
                continue;
            }
            if !b.virtual_ {
                positions.insert(b.marker, (p, 0));
            }
            for (i, o) in &b.positions {
                positions.insert(*i, (p, *o));
            }
            for (o, i) in b.chars.iter().enumerate() {
                positions.insert(*i, (p, o + 1));
            }
        }
        let all = self.line_ids(&l.key);
        let at = all.iter().position(|j| *j == i)?;
        let (p, o) = all
            .iter()
            .take(at + 1)
            .rev()
            .find_map(|j| positions.get(j))
            .copied()
            .unwrap_or((0, 0));
        Some((l.key.clone(), p, o))
    }
    fn flow_model_path(&self, key: &str) -> Option<Vec<usize>> {
        if key == Ticket::root().key() {
            return Some(vec![]);
        }
        let l = &self.nested.as_ref()?.lines[self.line_number(key)?];
        let owner = l.owner.as_ref()?;
        let i = self.index_key(owner)?;
        let parent_key = self.logical_line(owner)?;
        let blocks = self.blocks_nested(&parent_key);
        let p = blocks
            .iter()
            .position(|b| b.marker == i && b.kind != "text")?;
        let mut path = self.block_model_path(&parent_key, p)?;
        if l.slot == "body" {
            return Some(path);
        }
        let (r, c) = l.slot.strip_prefix("cell:")?.split_once(',')?;
        let g = self.grid(&self.items[i]);
        path.push(g.rows.iter().position(|i| self.items[*i].id.key() == r)?);
        path.push(g.cols.iter().position(|i| self.items[*i].id.key() == c)?);
        path.push(0);
        Some(path)
    }
    fn block_model_path(&self, line: &str, p: usize) -> Option<Vec<usize>> {
        let blocks = self.blocks_nested(line);
        let b = blocks.get(p)?;
        if b.virtual_ && b.chars.is_empty() {
            return None;
        }
        let entries = self.entries_nested(line);
        let index = entries.iter().position(|entry| entry.contains(&p))?;
        let mut path = self.flow_model_path(line)?;
        path.push(index);
        if self.block_group(b, line).is_some() {
            path.push(entries[index].iter().position(|i| *i == p)?);
        }
        Some(path)
    }
    fn capture_nested_path(&self, path: &[Value]) -> Option<String> {
        let nums: Vec<usize> = path
            .iter()
            .map(|v| v.as_u64().and_then(|n| usize::try_from(n).ok()))
            .collect::<Option<_>>()?;
        let mut n = 0;
        let mut line = Ticket::root().key();
        while n < nums.len() {
            let blocks = self.blocks_nested(&line);
            let entries = self.entries_nested(&line);
            let entry = entries.get(nums[n])?;
            let mut b = blocks.get(entry[0])?;
            n += 1;
            if self.block_group(b, &line).is_some() {
                b = blocks.get(*entry.get(*nums.get(n)?)?)?;
                n += 1;
            }
            if b.kind == "text" {
                if n + 1 != nums.len()
                    || (!self.line_visible(&line) && !self.runtime_covered_cell(&line))
                {
                    return None;
                }
                let o = nums[n];
                return Some(
                    self.items[if o == 0 {
                        b.marker
                    } else {
                        *b.chars.get(o - 1)?
                    }]
                    .id
                    .key(),
                );
            }
            if b.kind == "flow" {
                line = slot(&self.items[b.marker].id.key(), "body");
                continue;
            }
            if b.kind == "grid" {
                if n + 3 >= nums.len() {
                    return None;
                }
                let g = self.grid(&self.items[b.marker]);
                let r = *g.rows.get(nums[n])?;
                let c = *g.cols.get(nums[n + 1])?;
                line = slot(
                    &self.items[b.marker].id.key(),
                    &cell(&self.items[r].id.key(), &self.items[c].id.key()),
                );
                n += 3;
                continue;
            }
            return None;
        }
        None
    }
    fn resolve_nested_path(&self, key: &str) -> Option<Vec<usize>> {
        let line = self.line_of(key)?;
        let (effective, visible) = if self.has_moves() {
            self.movement_location(key)?
        } else {
            (line.key.clone(), self.line_visible(&line.key))
        };
        let covered = !visible && self.runtime_covered_cell(&effective);
        if !visible && !covered {
            return None;
        }
        let position_key = if covered { effective.as_str() } else { key };
        let (line, p, o) = self.raw_position(position_key)?;
        if !self.line_visible(&line) {
            return None;
        }
        let mut path = if let Some(path) = self.block_model_path(&line, p) {
            path
        } else if p > 0 {
            let mut path = self.block_model_path(&line, p - 1)?;
            path.push(self.blocks_nested(&line)[p - 1].chars.len());
            return Some(path);
        } else {
            return None;
        };
        path.push(o);
        Some(path)
    }
    pub(super) fn nested_selection(&self, cmd: &str, r: &Map<String, Value>) -> Result<Value> {
        match cmd {
            "anchor_capture" => {
                let line = r
                    .get("line")
                    .map(|v| v.as_str().ok_or("invalid line"))
                    .transpose()?
                    .unwrap_or("0@~root");
                let p = r
                    .get("paragraph")
                    .map(|v| v.as_u64().ok_or("invalid block"))
                    .transpose()?
                    .unwrap_or(0) as usize;
                let o = required(r, "offset")?.as_u64().ok_or("invalid offset")? as usize;
                let blocks = self.blocks_nested(line);
                let b = blocks
                    .get(p)
                    .filter(|b| b.kind == "text")
                    .ok_or("not a text position")?;
                let i = if o == 0 {
                    b.marker
                } else {
                    *b.chars.get(o - 1).ok_or("offset outside text")?
                };
                Ok(json!({"ok":true,"anchor":self.items[i].id.key()}))
            }
            "anchor_resolve" => {
                let key = string(r, "anchor")?;
                let p = self.raw_position(key).or_else(|| {
                    if r.get("strict") == Some(&Value::Bool(true)) {
                        None
                    } else {
                        Some(("0@~root".into(), 0, 0))
                    }
                });
                let mut v = json!({"ok":true,"paragraph":p.as_ref().map(|(_,p,_)|p),"offset":p.as_ref().map(|(_,_,o)|o)});
                if let Some((line, _, _)) = p {
                    if line != "0@~root" {
                        v["line"] = json!(line);
                    }
                }
                Ok(v)
            }
            "selection_capture" | "selection_resolve" => {
                let range = required(r, "range")?;
                if range.is_null() {
                    return Ok(json!({"ok":true,"range":null}));
                }
                let range = object(range)?;
                fields(range, &["anchor", "focus"])?;
                let value = if cmd == "selection_capture" {
                    let a = required(range, "anchor")?
                        .as_array()
                        .and_then(|p| self.capture_nested_path(p));
                    let f = required(range, "focus")?
                        .as_array()
                        .and_then(|p| self.capture_nested_path(p));
                    match (a, f) {
                        (Some(a), Some(f)) => json!({"anchor":a,"focus":f}),
                        _ => Value::Null,
                    }
                } else {
                    let a = self.resolve_nested_path(string(range, "anchor")?);
                    let f = self.resolve_nested_path(string(range, "focus")?);
                    match (a, f) {
                        (Some(a), Some(f)) => json!({"anchor":a,"focus":f}),
                        _ => Value::Null,
                    }
                };
                Ok(json!({"ok":true,"range":value}))
            }
            _ => Err("unsupported nested selection request".into()),
        }
    }
}

include!("required.rs");

include!("movement.rs");

include!("graphic.rs");
