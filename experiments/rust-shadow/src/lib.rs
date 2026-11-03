//! Independent, deliberately bounded native interpreter of Doc.apply wire ops.
//! The pinned flat paragraph schema supports boolean bold/italic marks.
//! Authored legacy paragraph markers require an explicit native capability.
//! Text crosses JSON as UTF-16 units, including unpaired surrogates. No TS state
//! or TS document snapshot is accepted. GC is outside this slice.
pub mod runtime_schema;
mod general;
mod history;
mod nested;
mod paragraph;
mod selection;
mod shapes;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

pub const SCHEMA: &str = "flow-root-paragraph:boolean-marks:bold,italic:v1";
/// Pinned manifest identified by SCHEMA. This engine does not negotiate schemas.
pub const SCHEMA_MANIFEST: &str = include_str!("../schema.json");
pub const FORMAT: &str = "doc-sync-rust-shadow-v1";
pub const PARAGRAPH_FORMAT: &str = "doc-sync-rust-shadow-v2";
pub const GENERAL_SCHEMA: &str = "general-flow-blocks:json-attrs:v1";
pub const GENERAL_FORMAT: &str = "doc-sync-rust-shadow-v3";
pub const GENERAL_CAPABILITY: &str = "general-blocks-attrs-v1";
pub const GENERAL_MANIFEST: &str = include_str!("../schema-general.json");
pub const NESTED_SCHEMA: &str = "nested-flows-tables:json-attrs:v1";
pub const NESTED_CAPABILITY: &str = "nested-flows-tables-v1";
pub const NESTED_FORMAT: &str = "doc-sync-rust-shadow-v4";
pub const NESTED_MANIFEST: &str = include_str!("../schema-nested.json");
pub const SHAPES_SCHEMA: &str = "groups-inline-spans:json-attrs:value-marks:v1";
pub const SHAPES_CAPABILITY: &str = "groups-inline-spans-v1";
pub const SHAPES_FORMAT: &str = "doc-sync-rust-shadow-v5";
pub const SHAPES_MANIFEST: &str = include_str!("../schema-shapes.json");
pub const MOVE_SCHEMA: &str = "movement-logical-storage:json-attrs:value-marks:v1";
pub const MOVE_CAPABILITY: &str = "movement-logical-storage-v1";
pub const MOVE_FORMAT: &str = "doc-sync-rust-shadow-v6";
pub const MOVE_MANIFEST: &str = include_str!("../schema-move.json");
pub const GRAPHIC_SCHEMA: &str = "graphic-canvas-containers:perfield-attrs:utf16:v1";
pub const GRAPHIC_BUILTIN_SCHEMA: &str = "graphic-builtins:affine-vector-paint-references:utf16:v1";
pub const GRAPHIC_BUILTIN_CAPABILITY: &str = "graphic-builtins-v1";
pub const GRAPHIC_BUILTIN_FORMAT: &str = "doc-sync-rust-graphic-builtins-v1";
pub const GRAPHIC_BUILTIN_MANIFEST: &str = include_str!("../schema-graphic-builtins.json");
pub const GRAPHIC_CAPABILITY: &str = "graphic-canvas-containers-v1";
pub const GRAPHIC_FORMAT: &str = "doc-sync-rust-graphic-v1";
pub const GRAPHIC_MANIFEST: &str = include_str!("../schema-graphic.json");
pub const PARAGRAPH_CAPABILITY: &str = "paragraph-markers-v1";
const MAX: u64 = 9_007_199_254_740_991;

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ticket {
    pub lamport: u64,
    pub actor: String,
}
impl Ticket {
    fn root() -> Self {
        Self {
            lamport: 0,
            actor: "~root".into(),
        }
    }
    fn key(&self) -> String {
        format!("{}@{}", self.lamport, self.actor)
    }
    fn valid(&self) -> Result<()> {
        if self.lamport > MAX || self.actor.is_empty() {
            return Err("invalid ticket".into());
        }
        Ok(())
    }
    fn birth_valid(&self) -> Result<()> {
        self.valid()?;
        if self.lamport == 0 || self.actor == "~root" {
            return Err("reserved birth ticket".into());
        }
        Ok(())
    }
    // Rust UTF-8/Unicode scalar ordering differs from JavaScript above U+FFFF.
    fn cmp_js(&self, other: &Self) -> Ordering {
        self.lamport
            .cmp(&other.lamport)
            .then_with(|| self.actor.encode_utf16().cmp(other.actor.encode_utf16()))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Register {
    #[serde(deserialize_with = "required_json")]
    value: Value,
    at: Ticket,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ParagraphBirth {
    born: String,
    boundary: String,
    type_at: Ticket,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    birth_attrs: Option<BTreeMap<String, Value>>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Token {
    id: Ticket,
    #[serde(deserialize_with = "required_nullable")]
    origin: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    unit: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    node: Option<ParagraphBirth>,
    // Preserve the immutable birth separately from current LWW registers.
    birth_marks: BTreeMap<String, Value>,
    attrs: BTreeMap<String, Register>,
    dels: BTreeSet<String>,
    cancels: BTreeSet<String>,
}
impl Token {
    fn root() -> Self {
        Self {
            id: Ticket::root(),
            origin: None,
            unit: None,
            node: None,
            birth_marks: BTreeMap::new(),
            attrs: BTreeMap::new(),
            dels: BTreeSet::new(),
            cancels: BTreeSet::new(),
        }
    }
    fn alive(&self) -> bool {
        self.dels.iter().all(|d| self.cancels.contains(d))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    format: String,
    schema: String,
    manifest: Value,
    clock: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    capabilities: Vec<String>,
    items: Vec<Token>,
}

#[derive(Clone, Debug)]
pub struct Replica {
    actor: String,
    paragraphs: bool,
    general: bool,
    shapes: bool,
    movement: bool,
    graphic: bool,
    graphic_builtins: bool,
    graphic_ops: Vec<Value>,
    runtime: Option<runtime_schema::RuntimeSchema>,
    runtime_ops: Vec<Value>,
    placement_cache: std::cell::RefCell<Option<nested::Projection>>,
    movement_cache: std::cell::RefCell<BTreeMap<String, Vec<nested::Block>>>,
    nested: Option<nested::Storage>,
    clock: u64,
    items: Vec<Token>,
}
impl Replica {
    fn new(actor: String) -> Result<Self> {
        if actor.is_empty() || actor == "~root" {
            return Err("invalid replica actor".into());
        }
        Ok(Self {
            actor,
            paragraphs: false,
            general: false,
            shapes: false,
            movement: false,
            graphic: false,
            graphic_builtins: false,
            graphic_ops: vec![],
            runtime: None,
            runtime_ops: vec![],
            placement_cache: std::cell::RefCell::new(None),
            movement_cache: std::cell::RefCell::new(BTreeMap::new()),
            nested: None,
            clock: 0,
            items: vec![Token::root()],
        })
    }
    fn index(&self, id: &Ticket) -> Option<usize> {
        self.items.iter().position(|t| t.id == *id)
    }
    fn index_key(&self, key: &str) -> Option<usize> {
        self.items.iter().position(|t| t.id.key() == key)
    }
    fn observe(&mut self, ticket: &Ticket) {
        self.clock = self.clock.max(ticket.lamport);
    }
    fn apply(&mut self, value: &Value) -> Result<()> {
        self.apply_inner(value)?;
        if self.runtime.is_some() && !self.runtime_ops.contains(value) { self.runtime_ops.push(value.clone()); }
        Ok(())
    }
    fn apply_inner(&mut self, value: &Value) -> Result<()> {
        if self.graphic { return self.apply_graphic(value); }
        if self.nested.is_some() {
            return self.apply_nested(value);
        }
        let op = object(value)?;
        let kind = string(op, "t")?;
        match kind {
            "text" => {
                fields(op, &["t", "id", "origin", "units", "marks"])?;
                let id = ticket(op, "id")?;
                id.birth_valid()?;
                let origin = ticket(op, "origin")?;
                origin.valid()?;
                let units: Vec<u16> = decode(required(op, "units")?)?;
                if units.is_empty() {
                    return Err("empty text unsupported".into());
                }
                if id
                    .lamport
                    .checked_add(units.len() as u64 - 1)
                    .filter(|n| *n <= MAX)
                    .is_none()
                {
                    return Err("text ticket span exceeds safe range".into());
                }
                let marks: BTreeMap<String, Value> =
                    op.get("marks").map(decode).transpose()?.unwrap_or_default();
                self.validate_birth_marks(&marks)?;
                // No partial mutation can escape: the Server applies a whole request
                // to a clone before replacing its stored replica.
                for (offset, unit) in units.iter().enumerate() {
                    let id = Ticket {
                        lamport: id.lamport + offset as u64,
                        actor: id.actor.clone(),
                    };
                    let origin = if offset == 0 {
                        origin.key()
                    } else {
                        Ticket {
                            lamport: id.lamport - 1,
                            actor: id.actor.clone(),
                        }
                        .key()
                    };
                    if let Some(existing) = self.index(&id) {
                        let token = &self.items[existing];
                        if token.origin.as_ref() != Some(&origin) || token.unit != Some(*unit) {
                            return Err("conflicting birth".into());
                        }
                        continue;
                    }
                    let after = self
                        .index_key(&origin)
                        .ok_or_else(|| format!("missing causal origin {origin}"))?;
                    let mut at = after + 1;
                    // Exact Doc.integrate scan, NOT a generic RGA subtree walk.
                    while at < self.items.len()
                        && self.items[at].id.cmp_js(&id) == Ordering::Greater
                    {
                        at += 1;
                    }
                    let attrs = marks
                        .iter()
                        .map(|(k, v)| {
                            (
                                k.clone(),
                                Register {
                                    value: json!(*v),
                                    at: id.clone(),
                                },
                            )
                        })
                        .collect();
                    self.items.insert(
                        at,
                        Token {
                            id,
                            origin: Some(origin),
                            unit: Some(*unit),
                            node: None,
                            birth_marks: marks.clone(),
                            attrs,
                            dels: BTreeSet::new(),
                            cancels: BTreeSet::new(),
                        },
                    );
                }
                self.observe(&Ticket {
                    lamport: id.lamport + units.len() as u64 - 1,
                    actor: id.actor,
                });
            }
            "node" => {
                if !self.paragraphs {
                    return Err("paragraph marker capability required".into());
                }
                fields(op, &["t", "id", "origin", "type", "boundary", "attrs"])?;
                let id = ticket(op, "id")?;
                id.birth_valid()?;
                let origin = ticket(op, "origin")?;
                origin.valid()?;
                let born = string(op, "type")?.to_owned();
                let text = self.is_text_type(&born);
                if (!self.general && born != "paragraph")
                    || (self.general && !text && !self.is_atom_type(&born))
                {
                    return Err("unsupported node type".into());
                }
                let boundary = if text {
                    string(op, "boundary")?.to_owned()
                } else {
                    op.get("boundary")
                        .map(|v| v.as_str().ok_or("atom boundary must be empty"))
                        .transpose()?
                        .unwrap_or("")
                        .to_owned()
                };
                if text {
                    let right = paragraph::boundary_right(&boundary, &origin)?;
                    if right
                        .as_ref()
                        .is_some_and(|right| *right == id || self.index(right).is_none())
                    {
                        return Err("missing paragraph boundary endpoint".into());
                    }
                } else if !boundary.is_empty() {
                    return Err("atom boundary unsupported".into());
                }
                let birth_attrs: BTreeMap<String, Value> =
                    op.get("attrs").map(decode).transpose()?.unwrap_or_default();
                if self.general {
                    for (key, value) in &birth_attrs {
                        self.validate_node_attr(&born, key, value)?;
                    }
                } else if !birth_attrs.is_empty() {
                    return Err("paragraph attributes unsupported".into());
                }
                if let Some(existing) = self.index(&id) {
                    let token = &self.items[existing];
                    if token.origin.as_ref() != Some(&origin.key())
                        || token
                            .node
                            .as_ref()
                            .is_none_or(|node| node.born != born || node.boundary != boundary)
                    {
                        return Err("conflicting paragraph birth".into());
                    }
                } else {
                    let after = self
                        .index(&origin)
                        .ok_or("missing paragraph causal origin")?;
                    let mut at = after + 1;
                    while at < self.items.len()
                        && self.items[at].id.cmp_js(&id) == Ordering::Greater
                    {
                        at += 1;
                    }
                    self.items.insert(
                        at,
                        Token {
                            id: id.clone(),
                            origin: Some(origin.key()),
                            unit: None,
                            node: Some(ParagraphBirth {
                                born: born.clone(),
                                boundary,
                                type_at: id.clone(),
                                birth_attrs: self.general.then_some(birth_attrs.clone()),
                            }),
                            birth_marks: BTreeMap::new(),
                            attrs: if self.general {
                                let mut attrs: BTreeMap<String, Register> = birth_attrs
                                    .iter()
                                    .map(|(key, value)| {
                                        (
                                            key.clone(),
                                            Register {
                                                value: value.clone(),
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
                                attrs
                            } else {
                                BTreeMap::new()
                            },
                            dels: BTreeSet::new(),
                            cancels: BTreeSet::new(),
                        },
                    );
                }
                self.observe(&id);
            }
            "del" | "undel" | "set" => {
                fields(
                    op,
                    match kind {
                        "del" => &["t", "at", "ids"],
                        "undel" => &["t", "at", "ids", "cancels"],
                        _ => &["t", "at", "ids", "key", "value"],
                    },
                )?;
                let at = ticket(op, "at")?;
                at.valid()?;
                let ids: Vec<Ticket> = decode(required(op, "ids")?)?;
                for id in &ids {
                    id.valid()?;
                    if *id == Ticket::root() && !(self.general && kind == "set") {
                        return Err("root mutation unsupported".into());
                    }
                }
                let cancels: Vec<Ticket> = if kind == "undel" {
                    decode(required(op, "cancels")?)?
                } else {
                    vec![]
                };
                for c in &cancels {
                    c.valid()?;
                }
                let mark = if kind == "set" {
                    let key = string(op, "key")?;
                    let value = required(op, "value")?.clone();
                    if self.general && !self.runtime_history_key(key) {
                        return Err("unsupported general attribute key".into());
                    }
                    if !self.general {
                        validate_mark(key)?;
                        if !value.is_null() && !value.is_boolean() {
                            return Err("mark value must be boolean or null".into());
                        }
                    }
                    Some((key.to_owned(), value))
                } else {
                    None
                };
                for id in ids {
                    // This deliberately matches apply(): missing del/set/undel targets
                    // are accepted and ignored. They are NOT buffered for later births.
                    if let Some(i) = self.index(&id) {
                        if kind == "set" && self.general {
                            let (key, value) = mark.as_ref().unwrap();
                            self.validate_set(&self.items[i], key, value)?;
                        }
                        let token = &mut self.items[i];
                        if kind == "set" && token.node.is_some() && !self.general {
                            return Err("paragraph marker attributes unsupported".into());
                        }
                        match kind {
                            "del" => {
                                token.dels.insert(at.key());
                            }
                            "undel" => {
                                token.cancels.extend(cancels.iter().map(Ticket::key));
                            }
                            _ => {
                                let (key, value) = mark.as_ref().unwrap();
                                if token
                                    .attrs
                                    .get(key)
                                    .map(|r| at.cmp_js(&r.at) == Ordering::Greater)
                                    .unwrap_or(true)
                                {
                                    token.attrs.insert(
                                        key.clone(),
                                        Register {
                                            value: value.clone(),
                                            at: at.clone(),
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
                self.observe(&at);
            }
            _ => return Err(format!("unsupported wire operation {kind}")),
        }
        Ok(())
    }
    pub fn state(&self) -> Value {
        if self.graphic { return self.graphic_state(); }
        if self.nested.is_some() {
            return self.nested_state();
        }
        let items:Vec<Value>=self.items.iter().map(|t| {
            let mut attrs=json!(t.attrs);
            if let Some(node)=&t.node {if !self.general {attrs["$type"]=json!({"value":node.born,"at":node.type_at});}}
            let mut value=json!({"id":t.id,"origin":t.origin,"kind":if t.unit.is_some(){"char"}else{"node"},"unit":t.unit,"visible":t.alive(),"dels":js_sorted(&t.dels),"cancels":js_sorted(&t.cancels),"attrs":attrs});
            if self.paragraphs {
                value["born"]=json!(t.node.as_ref().map(|n|n.born.as_str()).unwrap_or(""));
                value["boundary"]=json!(t.node.as_ref().map(|n|n.boundary.as_str()).unwrap_or(if t.id==Ticket::root() {"root"} else {""}));
            }
            value
        }).collect();
        if self.general {
            return self.general_state(items);
        }
        let blocks = self.blocks();
        let children: Vec<Value> = blocks
            .iter()
            .map(|block| json!({"type":"paragraph","runs":self.runs(&block.chars)}))
            .collect();
        let visible = self.items.iter().skip(1).filter(|t| t.alive()).count();
        let mut state = json!({"clock":self.clock,"items":items,"model":{"type":"content","children":children},"counts":{"tokens":self.items.len()-1,"visible":visible,"tombstones":self.items.len()-1-visible}});
        if self.paragraphs {
            state["blocks"]=json!(blocks.iter().map(|block|json!({"kind":"text","marker":self.items[block.marker].id.key(),"type":"paragraph","attrs":{},"aliases":block.aliases.iter().map(|i|self.items[*i].id.key()).collect::<Vec<_>>(),"virtual":false,"chars":block.chars.iter().map(|i|self.items[*i].id.key()).collect::<Vec<_>>(),"textUnits":block.chars.iter().map(|i|self.items[*i].unit.unwrap()).collect::<Vec<_>>() })).collect::<Vec<_>>());
        }
        state
    }
    fn snapshot(&self) -> Value {
        if self.runtime.is_some() { return self.runtime_snapshot(); }
        if self.graphic { return self.graphic_snapshot(); }
        if self.nested.is_some() {
            return self.nested_snapshot();
        }
        json!(Snapshot {
            format: if self.general {
                GENERAL_FORMAT
            } else if self.paragraphs {
                PARAGRAPH_FORMAT
            } else {
                FORMAT
            }
            .into(),
            capabilities: if self.general {
                vec![GENERAL_CAPABILITY.into()]
            } else if self.paragraphs {
                vec![PARAGRAPH_CAPABILITY.into()]
            } else {
                vec![]
            },
            schema: self.schema().into(),
            manifest: self.manifest(),
            clock: self.clock,
            items: self.items.clone()
        })
    }
    fn restore(actor: String, value: &Value) -> Result<Self> {
        if value["format"] == runtime_schema::RUNTIME_FORMAT { return Self::restore_runtime(actor, value); }
        if value["format"] == GRAPHIC_FORMAT || value["format"] == GRAPHIC_BUILTIN_FORMAT { return Self::restore_graphic(actor, value); }
        if value["format"] == NESTED_FORMAT
            || value["format"] == SHAPES_FORMAT
            || value["format"] == MOVE_FORMAT
        {
            return Self::restore_nested(actor, value);
        }
        let snapshot: Snapshot = decode(value)?;
        let general =
            snapshot.format == GENERAL_FORMAT && snapshot.capabilities == [GENERAL_CAPABILITY];
        let paragraphs = match snapshot.format.as_str() {
            FORMAT
                if !object(value)?.contains_key("capabilities")
                    && snapshot.items.iter().all(|t| t.node.is_none()) =>
            {
                false
            }
            PARAGRAPH_FORMAT if snapshot.capabilities == [PARAGRAPH_CAPABILITY] => true,
            GENERAL_FORMAT if general => true,
            _ => return Err("unsupported native snapshot format/capabilities".into()),
        };
        if snapshot.schema != if general { GENERAL_SCHEMA } else { SCHEMA }
            || snapshot.manifest
                != if general {
                    general::manifest()
                } else {
                    manifest()
                }
        {
            return Err("unsupported native snapshot schema".into());
        }
        for item in required(object(value)?, "items")?
            .as_array()
            .ok_or("snapshot items must be array")?
        {
            if let Some(node) = object(item)?.get("node") {
                if !paragraphs || node.is_null() {
                    return Err("invalid snapshot node capability/metadata".into());
                }
            }
        }
        if snapshot.clock > MAX
            || snapshot.items.first().is_none_or(|root| {
                if general {
                    let mut expected = Token::root();
                    expected.attrs = root.attrs.clone();
                    *root != expected
                } else {
                    *root != Token::root()
                }
            })
        {
            return Err("invalid snapshot clock/root".into());
        }
        let mut result = Self::new(actor)?;
        result.paragraphs = paragraphs;
        result.general = general;
        if general {
            let root = &snapshot.items[0];
            for (key, reg) in &root.attrs {
                result.validate_set(root, key, &reg.value)?;
                reg.at.valid()?;
                if reg.at.lamport > snapshot.clock {
                    return Err("root register exceeds clock".into());
                }
            }
            result.items[0] = root.clone();
        }
        let mut observed = 0;
        for token in snapshot.items.iter().skip(1) {
            token.id.birth_valid()?;
            if (token.unit.is_some() == token.node.is_some()) || result.index(&token.id).is_some() {
                return Err("invalid/duplicate snapshot token".into());
            }
            if let Some(node) = &token.node {
                if !paragraphs
                    || (!general && node.born != "paragraph")
                    || node.type_at != token.id
                    || (!general && !token.attrs.is_empty())
                    || !token.birth_marks.is_empty()
                    || (!general && node.birth_attrs.is_some())
                {
                    return Err("invalid snapshot paragraph birth".into());
                }
                if general {
                    result.validate_general_birth(token)?;
                }
                let origin = parse_key(token.origin.as_deref().ok_or("missing paragraph origin")?)?;
                let right = if general && general::atom_type(&node.born) {
                    None
                } else {
                    paragraph::boundary_right(&node.boundary, &origin)?
                };
                if right.as_ref().is_some_and(|right| {
                    *right == token.id || !snapshot.items.iter().any(|other| other.id == *right)
                }) {
                    return Err("missing snapshot paragraph boundary endpoint".into());
                }
            }
            validate_marks(&token.birth_marks)?;
            for (key, reg) in &token.attrs {
                if general {
                    if key == "$type"
                        && token
                            .node
                            .as_ref()
                            .is_some_and(|n| general::atom_type(&n.born))
                    {
                        let node = token.node.as_ref().unwrap();
                        if reg.at != token.id || reg.value != json!(node.born) {
                            return Err("invalid atom birth type register".into());
                        }
                    } else {
                        result.validate_set(token, key, &reg.value)?;
                    }
                } else {
                    validate_mark(key)?;
                    if !reg.value.is_null() && !reg.value.is_boolean() {
                        return Err("invalid snapshot mark value".into());
                    }
                }
                reg.at.valid()?;
                observed = observed.max(reg.at.lamport);
            }
            for key in &token.dels {
                observed = observed.max(parse_key(key)?.lamport);
            }
            for key in &token.cancels {
                parse_key(key)?;
            }
            for (key, value) in &token.birth_marks {
                let reg = token.attrs.get(key).ok_or("snapshot lost birth register")?;
                if reg.at.cmp_js(&token.id) == Ordering::Less
                    || reg.at == token.id && reg.value != json!(*value)
                {
                    return Err("invalid snapshot birth register".into());
                }
            }
            let origin = token.origin.as_deref().ok_or("missing snapshot origin")?;
            let origin_ticket = parse_key(origin)?;
            if result.index(&origin_ticket).is_none() {
                return Err("missing snapshot causal origin".into());
            }
            let mut at = result.index(&origin_ticket).unwrap() + 1;
            while at < result.items.len()
                && result.items[at].id.cmp_js(&token.id) == Ordering::Greater
            {
                at += 1;
            }
            if at != result.items.len() {
                return Err("invalid snapshot order".into());
            }
            observed = observed.max(token.id.lamport);
            result.items.push(token.clone());
        }
        if snapshot.clock < observed {
            return Err("snapshot clock precedes stored tickets".into());
        }
        result.clock = snapshot.clock;
        Ok(result)
    }
}

// Nullable fields remain mandatory in native snapshots. Serde's default
// Option handling would otherwise silently accept omitted fields as null.
fn required_nullable<'de, D, T>(deserializer: D) -> std::result::Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}
fn required_json<'de, D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Value, D::Error> {
    Value::deserialize(d)
}
fn manifest() -> Value {
    serde_json::from_str(SCHEMA_MANIFEST).expect("compiled schema manifest must be valid JSON")
}
fn js_sorted(set: &BTreeSet<String>) -> Vec<&str> {
    let mut keys: Vec<&str> = set.iter().map(String::as_str).collect();
    keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    keys
}
fn parse_key(key: &str) -> Result<Ticket> {
    let (n, actor) = key.split_once('@').ok_or("invalid ticket key")?;
    let lamport: u64 = n.parse().map_err(|_| "invalid ticket key clock")?;
    let ticket = Ticket {
        lamport,
        actor: actor.to_owned(),
    };
    ticket.valid()?;
    if ticket.key() != key {
        return Err("noncanonical ticket key".into());
    }
    Ok(ticket)
}
fn validate_mark(key: &str) -> Result<()> {
    if key == "bold" || key == "italic" {
        Ok(())
    } else {
        Err(format!("unsupported mark {key}"))
    }
}
fn validate_marks(marks: &BTreeMap<String, Value>) -> Result<()> {
    for (key, value) in marks {
        validate_mark(key)?;
        if !value.is_boolean() {
            return Err("invalid boolean birth mark".into());
        }
    }
    Ok(())
}
fn object(value: &Value) -> Result<&Map<String, Value>> {
    value.as_object().ok_or("expected object".into())
}
fn required<'a>(map: &'a Map<String, Value>, key: &str) -> Result<&'a Value> {
    map.get(key).ok_or_else(|| format!("missing field {key}"))
}
fn string<'a>(map: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    required(map, key)?
        .as_str()
        .ok_or_else(|| format!("field {key} must be string"))
}
fn ticket(map: &Map<String, Value>, key: &str) -> Result<Ticket> {
    decode(required(map, key)?)
}
fn decode<T: for<'de> Deserialize<'de>>(value: &Value) -> Result<T> {
    serde_json::from_value(value.clone()).map_err(|e| e.to_string())
}
fn fields(map: &Map<String, Value>, allowed: &[&str]) -> Result<()> {
    for key in map.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("unsupported field {key}"));
        }
    }
    Ok(())
}

#[derive(Default)]
pub struct Server {
    replicas: BTreeMap<String, Replica>,
    histories: BTreeMap<String, history::History>,
}
impl Server {
    pub fn request(&mut self, value: Value) -> Value {
        match self.execute(&value) {
            Ok(result) => result,
            Err(error) => json!({"ok":false,"error":error}),
        }
    }
    fn execute(&mut self, value: &Value) -> Result<Value> {
        let request = object(value)?;
        fields(
            request,
            &[
                "cmd",
                "replica",
                "actor",
                "schema",
                "ops",
                "snapshot",
                "manifest",
                "options",
                "now",
                "checkpoint",
                "sequences",
                "offset",
                "anchor",
                "strict",
                "range",
                "paragraph",
                "line",
                "capabilities",
                "runtimeSchema",
            ],
        )?;
        let cmd = string(request, "cmd")?;
        let name = string(request, "replica")?.to_owned();
        if name.is_empty() {
            return Err("empty replica name".into());
        }
        let requested_schema = request
            .get("schema")
            .map(|v| v.as_str().ok_or("schema must be string"))
            .transpose()?;
        let runtime = if let Some(manifest) = request.get("runtimeSchema") {
            Some(runtime_schema::RuntimeSchema::compile(manifest.clone())?)
        } else if matches!(cmd, "restore" | "history_restore") {
            let snapshot = if cmd == "restore" { &value["snapshot"] } else { &value["checkpoint"]["document"] };
            if snapshot["format"] == runtime_schema::RUNTIME_FORMAT {
                Some(runtime_schema::RuntimeSchema::compile(snapshot["manifest"].clone())?)
            } else { None }
        } else { self.replicas.get(&name).and_then(|r| r.runtime.clone()) };
        let expected_schema = if matches!(cmd, "new" | "restore" | "history_restore") {
            requested_schema.unwrap_or(SCHEMA)
        } else {
            self.replicas
                .get(&name)
                .map(Replica::schema)
                .unwrap_or(SCHEMA)
        };
        if (!runtime.as_ref().is_some_and(|s| s.identity() == expected_schema) && ![
            SCHEMA,
            GENERAL_SCHEMA,
            NESTED_SCHEMA,
            SHAPES_SCHEMA,
            MOVE_SCHEMA,
            GRAPHIC_SCHEMA,
            GRAPHIC_BUILTIN_SCHEMA,
        ]
        .contains(&expected_schema))
            || requested_schema.is_some_and(|s| s != expected_schema)
        {
            return Err("unsupported schema identity".into());
        }
        if matches!(cmd, "restore" | "history_restore") && self.replicas.get(&name).is_some_and(|r| (r.runtime.is_some() || runtime.is_some()) && r.schema()!=expected_schema) { return Err("runtime checkpoint cannot replace schema identity".into()); }
        if let Some(supplied) = request.get("manifest") {
            if *supplied
                != if let Some(runtime) = &runtime { runtime.manifest().clone() } else if expected_schema == GRAPHIC_BUILTIN_SCHEMA {
                    serde_json::from_str::<Value>(GRAPHIC_BUILTIN_MANIFEST).unwrap()
                } else if expected_schema == GRAPHIC_SCHEMA {
                    serde_json::from_str::<Value>(GRAPHIC_MANIFEST).unwrap()
                } else if expected_schema == MOVE_SCHEMA {
                    serde_json::from_str::<Value>(MOVE_MANIFEST).unwrap()
                } else if expected_schema == SHAPES_SCHEMA {
                    shapes::manifest()
                } else if expected_schema == NESTED_SCHEMA {
                    nested::manifest()
                } else if expected_schema == GENERAL_SCHEMA {
                    general::manifest()
                } else {
                    manifest()
                }
            {
                return Err("unsupported schema manifest".into());
            }
        }
        if matches!(
            cmd,
            "new" | "apply" | "restore" | "history_record" | "history_restore"
        ) && !request.contains_key("schema")
        {
            return Err("schema identity required".into());
        }
        if cmd != "new" && request.contains_key("capabilities") {
            return Err("replica capabilities are set only by new or native restore".into());
        }
        match cmd {
            "new" => {
                if self.replicas.contains_key(&name) {
                    return Err("replica already exists".into());
                }
                let mut replica = if let Some(schema) = runtime {
                    if request.contains_key("capabilities") { return Err("runtime schemas do not accept preset capabilities".into()); }
                    Replica::new_runtime(string(request, "actor")?.into(), schema)?
                } else { Replica::new(string(request, "actor")?.into())? };
                if let Some(capabilities) = request.get("capabilities") {
                    let capabilities: Vec<String> = decode(capabilities)?;
                    if capabilities == [GRAPHIC_CAPABILITY] && expected_schema == GRAPHIC_SCHEMA
                        || capabilities == [GRAPHIC_BUILTIN_CAPABILITY] && expected_schema == GRAPHIC_BUILTIN_SCHEMA {
                        if !replica.actor.bytes().all(|b| b.is_ascii_alphanumeric() || b"_~-".contains(&b)) {
                            return Err("graphic actor must use ASCII letters, digits, underscore, tilde or hyphen".into());
                        }
                        replica.graphic = true;
                        replica.graphic_builtins = expected_schema == GRAPHIC_BUILTIN_SCHEMA;
                        replica.movement = true;
                        replica.general = true;
                        replica.nested = Some(nested::Storage::new());
                    } else if capabilities == [MOVE_CAPABILITY] && expected_schema == MOVE_SCHEMA {
                        replica.movement = true;
                        replica.shapes = true;
                        replica.general = true;
                        replica.nested = Some(nested::Storage::new());
                    } else if capabilities == [SHAPES_CAPABILITY]
                        && expected_schema == SHAPES_SCHEMA
                    {
                        replica.shapes = true;
                        replica.general = true;
                        replica.nested = Some(nested::Storage::new());
                    } else if capabilities == [NESTED_CAPABILITY]
                        && expected_schema == NESTED_SCHEMA
                    {
                        replica.general = true;
                        replica.nested = Some(nested::Storage::new());
                    } else if capabilities == [GENERAL_CAPABILITY]
                        && expected_schema == GENERAL_SCHEMA
                    {
                        replica.general = true;
                    } else if capabilities != [PARAGRAPH_CAPABILITY] || expected_schema != SCHEMA {
                        return Err("unsupported replica capabilities".into());
                    }
                    replica.paragraphs = true;
                }
                if replica.schema() != expected_schema {
                    return Err("schema/capability mismatch".into());
                }
                let state = replica.state();
                self.replicas.insert(name, replica);
                Ok(json!({"ok":true,"state":state}))
            }
            "state" => Ok(
                json!({"ok":true,"state":self.replicas.get(&name).ok_or("unknown replica")?.state()}),
            ),
            "snapshot" => Ok(
                json!({"ok":true,"snapshot":self.replicas.get(&name).ok_or("unknown replica")?.snapshot()}),
            ),
            "apply" => {
                let mut replica = self.replicas.get(&name).ok_or("unknown replica")?.clone();
                let ops = required(request, "ops")?
                    .as_array()
                    .ok_or("ops must be array")?;
                for op in ops {
                    replica.apply(op)?;
                }
                let state = replica.state();
                self.replicas.insert(name, replica);
                Ok(json!({"ok":true,"state":state}))
            }
            "restore" => {
                let actor = if let Some(actor) = request.get("actor") {
                    actor.as_str().ok_or("actor must be string")?.to_owned()
                } else {
                    self.replicas
                        .get(&name)
                        .ok_or("actor required for new replica")?
                        .actor
                        .clone()
                };
                let replica = Replica::restore(actor, required(request, "snapshot")?)?;
                if replica.schema() != expected_schema {
                    return Err("snapshot/request schema mismatch".into());
                }
                let state = replica.state();
                self.histories.remove(&name);
                self.replicas.insert(name, replica);
                Ok(json!({"ok":true,"state":state}))
            }
            "anchor_capture" | "anchor_resolve" | "selection_capture" | "selection_resolve" => self
                .replicas
                .get(&name)
                .ok_or("unknown replica")?
                .selection_request(cmd, request),
            "history_state" => {
                self.replicas.get(&name).ok_or("unknown replica")?;
                let history = self.histories.entry(name).or_default();
                Ok(json!({"ok":true,"history":history.snapshot(),"status":history.status()}))
            }
            "history_clear" => {
                let state = self.replicas.get(&name).ok_or("unknown replica")?.state();
                let history = history::History::default();
                let response = json!({"ok":true,"state":state,"history":history.snapshot(),"status":history.status()});
                self.histories.insert(name, history);
                Ok(response)
            }
            "history_pin" => {
                self.replicas.get(&name).ok_or("unknown replica")?;
                let history = self.histories.get(&name).cloned().unwrap_or_default();
                Ok(json!({"ok":true,"pin":history.pin(required(request,"sequences")?)?}))
            }
            "history_record" | "history_undo" | "history_redo" => {
                let mut replica = self.replicas.get(&name).ok_or("unknown replica")?.clone();
                let mut history = self.histories.get(&name).cloned().unwrap_or_default();
                let (ops, caret) = if cmd == "history_record" {
                    let ops = required(request, "ops")?
                        .as_array()
                        .ok_or("ops must be array")?;
                    let now = required(request, "now")?
                        .as_f64()
                        .ok_or("now must be finite number")?;
                    history.record(
                        &mut replica,
                        ops,
                        decode(required(request, "options")?)?,
                        now,
                    )?;
                    (ops.clone(), None)
                } else {
                    history.travel(&mut replica, cmd == "history_undo")?
                };
                let response = json!({"ok":true,"state":replica.state(),"history":history.snapshot(),"status":history.status(),"ops":ops,"caret":caret});
                self.replicas.insert(name.clone(), replica);
                self.histories.insert(name, history);
                Ok(response)
            }
            "history_export" => {
                let replica = self.replicas.get(&name).ok_or("unknown replica")?;
                let history = self.histories.get(&name).cloned().unwrap_or_default();
                Ok(
                    json!({"ok":true,"checkpoint":history::Checkpoint {format:history::HISTORY_FORMAT.into(),actor:replica.actor.clone(),document:replica.snapshot(),history:history.snapshot()}}),
                )
            }
            "history_restore" => {
                let checkpoint: history::Checkpoint = decode(required(request, "checkpoint")?)?;
                if checkpoint.format != history::HISTORY_FORMAT {
                    return Err("unsupported history checkpoint".into());
                }
                if request
                    .get("actor")
                    .is_some_and(|a| a.as_str() != Some(checkpoint.actor.as_str()))
                    || self
                        .replicas
                        .get(&name)
                        .is_some_and(|r| r.actor != checkpoint.actor)
                {
                    return Err("history checkpoint actor mismatch".into());
                }
                let replica = Replica::restore(checkpoint.actor, &checkpoint.document)?;
                if replica.schema() != expected_schema {
                    return Err("checkpoint/request schema mismatch".into());
                }
                let history = history::History::restore_with_runtime(&checkpoint.history, replica.runtime.is_some())?;
                history.validate_document(&replica)?;
                let response = json!({"ok":true,"state":replica.state(),"history":history.snapshot(),"status":history.status()});
                self.replicas.insert(name.clone(), replica);
                self.histories.insert(name, history);
                Ok(response)
            }
            _ => Err(format!("unsupported command {cmd}")),
        }
    }
}
