// Native graphic storage uses the same immutable Token births, RGA lines,
// per-register LWW, deletion ledgers, placement projection and History as text.
// These pinned capabilities accept only the two declared graphic manifests.
// A retained op journal
// makes checkpoint validation replay the same mutation validators as live input.
pub(super) fn graphic_history_key(key: &str) -> bool {
    static KEYS: std::sync::OnceLock<BTreeSet<String>> = std::sync::OnceLock::new();
    graphic_field(key).is_some()
        || KEYS
            .get_or_init(|| {
                let mut keys = BTreeSet::new();
                for raw in [GRAPHIC_MANIFEST, GRAPHIC_BUILTIN_MANIFEST] {
                    let manifest: Value = serde_json::from_str(raw).unwrap();
                    for node in manifest["nodes"].as_object().unwrap().values() {
                        if let Some(attrs) = node["attrs"].as_object() {
                            keys.extend(attrs.keys().cloned());
                        }
                    }
                }
                keys
            })
            .contains(key)
}
fn graphic_field(key: &str) -> Option<(String, String)> {
    let parts: Vec<String> = serde_json::from_str(key.strip_prefix("$field:")?).ok()?;
    if parts.len() != 2
        || parts.iter().any(|s| {
            s.is_empty() || matches!(s.as_str(), "__proto__" | "constructor" | "prototype")
        })
        || key != format!("$field:{}", json!(parts))
    {
        return None;
    }
    Some((parts[0].clone(), parts[1].clone()))
}
fn graphic_pattern_ok(pattern: &str, value: &str) -> bool {
    if pattern.starts_with("^#") {
        let lengths = if pattern.contains("{2}") {
            vec![7, 9]
        } else {
            vec![7]
        };
        return lengths.contains(&value.len())
            && value.starts_with('#')
            && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit);
    }
    if pattern.starts_with("^(?:|") {
        if value.is_empty() {
            return true;
        }
        let Some((clock, actor)) = value.split_once('@') else {
            return false;
        };
        return clock.parse::<u64>().is_ok_and(|n| n <= MAX)
            && (1..=16).contains(&clock.len())
            && clock.as_bytes()[0] != b'0'
            && clock.bytes().all(|b| b.is_ascii_digit())
            && (1..=494).contains(&actor.encode_utf16().count())
            && !actor.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}');
    }
    let maximum = pattern
        .split("{0,")
        .nth(1)
        .and_then(|s| s.strip_suffix("}$"))
        .and_then(|s| s.parse::<usize>().ok());
    maximum.is_some_and(|max| {
        value.encode_utf16().count() <= max
            && !value.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}')
    })
}
fn graphic_assignment_ok(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    if object.len() != 2 || !object.contains_key("property") || !object.contains_key("value") {
        return false;
    }
    let Some(property) = object["property"].as_str() else {
        return false;
    };
    let value = &object["value"];
    match property {
        "name" => value.as_str().is_some_and(|s| {
            s.encode_utf16().count() <= 256 && !s.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}')
        }),
        "visible" | "locked" => value.is_boolean(),
        "opacity" => value
            .as_f64()
            .is_some_and(|v| v.is_finite() && (0.0..=1.0).contains(&v)),
        "transform.a" | "transform.b" | "transform.c" | "transform.d" | "transform.e"
        | "transform.f" => value
            .as_f64()
            .is_some_and(|v| v.is_finite() && (-1_000_000.0..=1_000_000.0).contains(&v)),
        "size.width" | "size.height" => value
            .as_f64()
            .is_some_and(|v| v.is_finite() && (0.0..=1_000_000.0).contains(&v)),
        _ => false,
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct GraphicSaved {
    format: String,
    schema: String,
    manifest: Value,
    capabilities: Vec<String>,
    clock: u64,
    ops: Vec<Value>,
}
impl Replica {
    fn graphic_kind<'a>(&'a self, token: &'a Token) -> &'a str {
        token
            .node
            .as_ref()
            .map(|n| n.born.as_str())
            .unwrap_or_else(|| self.root_type())
    }
    pub(super) fn validate_graphic_set(
        &self,
        token: &Token,
        key: &str,
        value: &Value,
    ) -> Result<()> {
        if token.unit.is_some() {
            let manifest = self.manifest();
            if manifest["marks"]
                .as_array()
                .unwrap()
                .iter()
                .any(|m| m == key)
                && (value.is_null() || value.is_boolean())
            {
                return Ok(());
            }
            return Err("unsupported graphic text mark".into());
        }
        if self.head(token) {
            return Err("graphic storage heads have no attributes".into());
        }
        let manifest = self.manifest();
        let attrs = &manifest["nodes"][self.graphic_kind(token)]["attrs"];
        let spec = if let Some((attr, field)) = graphic_field(key) {
            &attrs[&attr]["fields"][&field]
        } else {
            if attrs[key].get("fields").is_some() {
                return Err("graphic structured attributes require field operations".into());
            }
            &attrs[key]
        };
        if self.runtime.is_none() && self.graphic_kind(token) == "instance-override" && key == "assignment" && !spec.is_null()
        {
            return if value.is_null() || graphic_assignment_ok(value) {
                Ok(())
            } else {
                Err("invalid graphic override assignment".into())
            };
        }
        if spec.is_null() || !(if self.runtime.is_some() { runtime_schema::value_ok(spec, value) } else {general::attr_ok(spec, value)}) {
            return Err("invalid graphic attribute".into());
        }
        if let Some(pattern) = spec["pattern"].as_str().filter(|_| self.runtime.is_none()) {
            if !value.is_null()
                && !value
                    .as_str()
                    .is_some_and(|s| graphic_pattern_ok(pattern, s))
            {
                return Err("invalid graphic string pattern".into());
            }
        }
        Ok(())
    }
    fn graphic_accepts(&self, line: &Line, kind: &str) -> bool {
        let manifest = self.manifest();
        let owner = line
            .owner
            .as_ref()
            .and_then(|key| self.index_key(key))
            .map(|i| self.graphic_kind(&self.items[i]))
            .unwrap_or_else(|| self.root_type());
        manifest["nodes"][owner]["shape"] == "container"
            && manifest["nodes"][owner]["children"]
                .as_array()
                .is_some_and(|children| children.iter().any(|t| t == kind))
    }
    pub(super) fn apply_graphic(&mut self, value: &Value) -> Result<()> {
        self.clear_movement_cache();
        let op = object(value)?;
        let kind = string(op, "t")?;
        for key in [
            "id", "at", "origin", "target", "parent", "after", "ids", "cancels",
        ] {
            let Some(value) = op.get(key).filter(|v| !v.is_null()) else {
                continue;
            };
            let values = if let Some(values) = value.as_array() {
                values.clone()
            } else {
                vec![value.clone()]
            };
            for value in values {
                let ticket: Ticket = decode(&value)?;
                ticket.valid()?;
                if ticket.lamport > 0
                    && !ticket
                        .actor
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_~-".contains(&b))
                {
                    return Err("graphic operation actor must use ASCII ticket profile".into());
                }
            }
        }
        match kind {
            "node" => {
                fields(op, &["t", "id", "origin", "type", "boundary", "attrs"])?;
                let id = ticket(op, "id")?;
                id.birth_valid()?;
                let origin = ticket(op, "origin")?;
                self.ensure(&origin.key())?;
                let line = self
                    .line_of(&origin.key())
                    .ok_or("graphic origin line missing")?;
                if line.key != Ticket::root().key() && line.slot != "children" {
                    return Err("graphic object requires a child container".into());
                }
                let born = string(op, "type")?.to_owned();
                if !self.graphic_accepts(line, &born) {
                    return Err("unsupported graphic node type".into());
                }
                if string(op, "boundary")? != "" {
                    return Err("graphic objects have no document boundaries".into());
                }
                let birth: BTreeMap<String, Value> =
                    op.get("attrs").map(decode).transpose()?.unwrap_or_default();
                let mut token = Token {
                    id: id.clone(),
                    origin: Some(origin.key()),
                    unit: None,
                    node: Some(ParagraphBirth {
                        born: born.clone(),
                        boundary: String::new(),
                        type_at: id.clone(),
                        birth_attrs: Some(birth.clone()),
                    }),
                    birth_marks: BTreeMap::new(),
                    attrs: BTreeMap::new(),
                    dels: BTreeSet::new(),
                    cancels: BTreeSet::new(),
                };
                for (key, v) in &birth {
                    self.validate_graphic_set(&token, key, v)?;
                    token.attrs.insert(
                        key.clone(),
                        Register {
                            value: v.clone(),
                            at: id.clone(),
                        },
                    );
                }
                if let Some(old) = self.index(&id) {
                    if self.items[old]
                        .node
                        .as_ref()
                        .and_then(|n| n.birth_attrs.as_ref())
                        != Some(&birth)
                    {
                        return Err("conflicting graphic birth attributes".into());
                    }
                }
                self.integrate_nested(token)?;
                if self.manifest()["nodes"][&born]["shape"] == "container" {
                    self.ensure(&slot(&id.key(), "children"))?;
                }
                if self.manifest()["nodes"][&born]["shape"] == "text" {
                    self.ensure(&slot(&id.key(), "text"))?;
                }
                self.observe(&id);
            }
            "text" => {
                fields(op, &["t", "id", "origin", "units", "marks"])?;
                let id = ticket(op, "id")?;
                id.birth_valid()?;
                let origin = ticket(op, "origin")?;
                self.ensure(&origin.key())?;
                if self.line_of(&origin.key()).is_none_or(|l| l.slot != "text") {
                    return Err("graphic text requires label text storage".into());
                }
                let marks: BTreeMap<String, Value> = decode(required(op, "marks")?)?;
                for (key, value) in &marks {
                    let mut token = Token::root();
                    token.unit = Some(0);
                    self.validate_graphic_set(&token, key, value)?;
                }
                let units: Vec<u16> = decode(required(op, "units")?)?;
                if units.is_empty()
                    || id
                        .lamport
                        .checked_add(units.len() as u64 - 1)
                        .is_none_or(|n| n > MAX)
                {
                    return Err("invalid graphic text span".into());
                }
                let mut anchor = origin.key();
                for (n, unit) in units.into_iter().enumerate() {
                    let tid = Ticket {
                        lamport: id.lamport + n as u64,
                        actor: id.actor.clone(),
                    };
                    if self
                        .index(&tid)
                        .is_some_and(|i| self.items[i].birth_marks != marks)
                    {
                        return Err("conflicting graphic text birth marks".into());
                    }
                    self.integrate_nested(Token {
                        id: tid.clone(),
                        origin: Some(anchor),
                        unit: Some(unit),
                        node: None,
                        birth_marks: marks.clone(),
                        attrs: marks
                            .iter()
                            .map(|(key, value)| {
                                (
                                    key.clone(),
                                    Register {
                                        value: value.clone(),
                                        at: tid.clone(),
                                    },
                                )
                            })
                            .collect(),
                        dels: BTreeSet::new(),
                        cancels: BTreeSet::new(),
                    })?;
                    anchor = tid.key();
                    self.observe(&tid);
                }
            }
            "move" => self.apply_move(value)?,
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
                at.birth_valid()?;
                let ids: Vec<Ticket> = decode(required(op, "ids")?)?;
                let cancels: Vec<Ticket> = if kind == "undel" {
                    decode(required(op, "cancels")?)?
                } else {
                    vec![]
                };
                for c in &cancels {
                    c.birth_valid()?;
                }
                for id in ids {
                    id.valid()?;
                    let i = self.index(&id).ok_or("graphic target missing")?;
                    if self.head(&self.items[i]) {
                        return Err("graphic storage head mutation rejected".into());
                    }
                    if kind == "set" {
                        self.validate_graphic_set(
                            &self.items[i],
                            string(op, "key")?,
                            required(op, "value")?,
                        )?;
                    }
                    let token = &mut self.items[i];
                    match kind {
                        "del" => {
                            token.dels.insert(at.key());
                        }
                        "undel" => token.cancels.extend(cancels.iter().map(Ticket::key)),
                        _ => {
                            let key = string(op, "key")?;
                            let v = required(op, "value")?;
                            if token
                                .attrs
                                .get(key)
                                .is_some_and(|r| r.at == at && r.value != *v)
                            {
                                return Err("conflicting graphic register writer".into());
                            }
                            if token
                                .attrs
                                .get(key)
                                .is_none_or(|r| at.cmp_js(&r.at) == Ordering::Greater)
                            {
                                token.attrs.insert(
                                    key.into(),
                                    Register {
                                        value: v.clone(),
                                        at: at.clone(),
                                    },
                                );
                            }
                        }
                    }
                }
                self.observe(&at);
            }
            _ => return Err("unsupported graphic operation".into()),
        }
        self.clear_movement_cache();
        if !self.graphic_ops.contains(value) {
            self.graphic_ops.push(value.clone());
        }
        Ok(())
    }
    fn graphic_projection(&self) -> Projection {
        if let Some(p) = self.placement_cache.borrow().as_ref() {
            return p.clone();
        }
        let mut base = vec![];
        for line in &self.nested.as_ref().unwrap().lines {
            if line.slot == "text" {
                continue;
            }
            let mut after = None;
            for i in self.line_ids(&line.key).into_iter().skip(1) {
                let token = &self.items[i];
                base.push(Entry {
                    id: token.id.clone(),
                    target: token.id.key(),
                    parent: line.key.clone(),
                    after: after.clone(),
                });
                after = Some(token.id.key());
            }
        }
        self.project_placements(base, BTreeMap::new())
    }
    fn validate_graphic_move(&self, m: &Move) -> Result<()> {
        m.at.birth_valid()?;
        m.target.birth_valid()?;
        m.parent.valid()?;
        if m.t != "move"
            || m.at.cmp_js(&m.target) != Ordering::Greater
            || m.after
                .as_ref()
                .is_some_and(|a| m.at.cmp_js(a) != Ordering::Greater)
        {
            return Err("invalid graphic move references".into());
        }
        let token = self
            .index(&m.target)
            .map(|i| &self.items[i])
            .ok_or("graphic move target missing")?;
        if token.node.is_none() || self.head(token) {
            return Err("graphic move target must be stored object".into());
        }
        let parent = self
            .line_number(&m.parent.key())
            .map(|i| &self.nested.as_ref().unwrap().lines[i])
            .ok_or("graphic move parent missing")?;
        if parent.key != Ticket::root().key() && parent.slot != "children" {
            return Err("graphic move requires container".into());
        }
        if !self.graphic_accepts(parent, self.graphic_kind(token)) {
            return Err("graphic destination rejects this child kind".into());
        }

        if let Some(after) = &m.after {
            after.valid()?;
            if let Some(prior) = self.sorted_moves().iter().find(|p| p.at == *after) {
                if prior.parent != m.parent {
                    return Err("graphic move anchor parent mismatch".into());
                }
            } else if self
                .line_of(&after.key())
                .is_none_or(|l| l.key != parent.key)
                || self
                    .index(after)
                    .is_none_or(|i| self.items[i].node.is_none())
            {
                return Err("graphic move anchor parent mismatch".into());
            }
        }
        Ok(())
    }
    fn validate_graphic_history_placement(&self, target: &Ticket, p: &Placement) -> Result<()> {
        let token = self
            .index(target)
            .map(|i| &self.items[i])
            .ok_or("graphic history object missing")?;
        if token.node.is_none() || self.head(token) {
            return Err("graphic history placement target is not an object".into());
        }
        let parent = self
            .line_number(&p.parent.key())
            .map(|i| &self.nested.as_ref().unwrap().lines[i])
            .ok_or("graphic history container missing")?;
        if parent.key != Ticket::root().key() && parent.slot != "children" {
            return Err("graphic history placement requires container".into());
        }

        if let Some(m) = self.sorted_moves().iter().find(|m| m.at == p.at) {
            if m.target != *target || m.parent != p.parent || m.after != p.after {
                return Err("graphic history placement differs from log".into());
            }
            self.validate_graphic_move(m)
        } else {
            if p.at != *target
                || self
                    .line_of(&target.key())
                    .is_none_or(|l| l.key != p.parent.key())
            {
                return Err("graphic history birth placement mismatch".into());
            }
            if let Some(after) = &p.after {
                if self
                    .line_of(&after.key())
                    .is_none_or(|l| l.key != parent.key)
                    || self
                        .index(after)
                        .is_none_or(|i| self.items[i].node.is_none())
                {
                    return Err("graphic history birth order anchor mismatch".into());
                }
            }
            Ok(())
        }
    }
    fn graphic_attrs(&self, token: &Token) -> Value {
        let manifest = self.manifest();
        let mut attrs = Map::new();
        if let Some(specs) = manifest["nodes"][self.graphic_kind(token)]["attrs"].as_object() {
            for (key, spec) in specs {
                if let Some(fields) = spec["fields"].as_object() {
                    let mut values = Map::new();
                    for (field, spec) in fields {
                        let k = format!("$field:{}", json!([key, field]));
                        values.insert(
                            field.clone(),
                            token
                                .attrs
                                .get(&k)
                                .filter(|r| !r.value.is_null())
                                .map(|r| r.value.clone())
                                .unwrap_or_else(|| spec["default"].clone()),
                        );
                    }
                    attrs.insert(key.clone(), Value::Object(values));
                } else {
                    attrs.insert(
                        key.clone(),
                        token
                            .attrs
                            .get(key)
                            .filter(|r| !r.value.is_null())
                            .map(|r| r.value.clone())
                            .unwrap_or_else(|| spec["default"].clone()),
                    );
                }
            }
        }
        Value::Object(attrs)
    }
    fn graphic_children(
        &self,
        parent: &str,
        projection: &Projection,
        seen: &mut BTreeSet<String>,
    ) -> Vec<Value> {
        let mut out = vec![];
        for key in projection.order.get(parent).into_iter().flatten() {
            if !seen.insert(key.clone()) {
                continue;
            }
            let token = &self.items[self.index_key(key).unwrap()];
            if !token.alive() {
                continue;
            }
            let kind = self.graphic_kind(token);
            let mut node = json!({"id":key,"type":kind,"attrs":self.graphic_attrs(token)});
            if self.manifest()["nodes"][kind]["shape"] == "container" {
                node["children"] =
                    json!(self.graphic_children(&slot(key, "children"), projection, seen));
            }
            if self.manifest()["nodes"][kind]["shape"] == "text" {
                let mut runs: Vec<Value> = vec![];
                for i in self.line_ids(&slot(key, "text")) {
                    let token = &self.items[i];
                    let Some(unit) = token.unit.filter(|_| token.alive()) else {
                        continue;
                    };
                    let marks: Map<String, Value> = token
                        .attrs
                        .iter()
                        .filter(|(_, r)| r.value == true)
                        .map(|(key, r)| (key.clone(), r.value.clone()))
                        .collect();
                    if let Some(last) = runs.last_mut().filter(|run| run["marks"] == json!(marks)) {
                        last["units"].as_array_mut().unwrap().push(json!(unit));
                    } else {
                        runs.push(json!({"units":[unit],"marks":marks}));
                    }
                }
                node["runs"] = json!(runs);
            }
            out.push(node);
        }
        out
    }
    pub(super) fn graphic_state(&self) -> Value {
        let projection = self.graphic_projection();
        let placements: BTreeMap<String, Value> = projection
            .current
            .iter()
            .map(|(key, e)| {
                (
                    key.clone(),
                    json!({"at":e.id,"parent":e.parent,"after":e.after}),
                )
            })
            .collect();
        let texts: BTreeMap<String, Vec<String>> = self
            .items
            .iter()
            .filter(|t| self.manifest()["nodes"][self.graphic_kind(t)]["shape"] == "text")
            .map(|t| {
                (
                    t.id.key(),
                    self.line_ids(&slot(&t.id.key(), "text"))
                        .into_iter()
                        .filter_map(|i| {
                            let t = &self.items[i];
                            (t.alive() && t.unit.is_some()).then(|| t.id.key())
                        })
                        .collect(),
                )
            })
            .collect();
        json!({"clock":self.clock,"placements":placements,"texts":texts,"model":{"id":Ticket::root().key(),"type":self.root_type(),"attrs":{},"children":self.graphic_children(&Ticket::root().key(),&projection,&mut BTreeSet::new())},"items":self.items.iter().filter(|t|!self.head(t)).map(|t|json!({"id":t.id,"origin":t.origin,"unit":t.unit,"visible":t.alive(),"attrs":t.attrs})).collect::<Vec<_>>()})
    }
    pub(super) fn graphic_snapshot(&self) -> Value {
        json!(GraphicSaved {
            format: if self.graphic_builtins {
                GRAPHIC_BUILTIN_FORMAT
            } else {
                GRAPHIC_FORMAT
            }
            .into(),
            schema: self.schema().into(),
            manifest: self.manifest(),
            capabilities: vec![if self.graphic_builtins {
                GRAPHIC_BUILTIN_CAPABILITY
            } else {
                GRAPHIC_CAPABILITY
            }
            .into()],
            clock: self.clock,
            ops: self.graphic_ops.clone()
        })
    }
    pub(super) fn restore_graphic(actor: String, value: &Value) -> Result<Self> {
        let saved: GraphicSaved = decode(value)?;
        let builtin = saved.schema == GRAPHIC_BUILTIN_SCHEMA;
        if saved.schema
            != if builtin {
                GRAPHIC_BUILTIN_SCHEMA
            } else {
                GRAPHIC_SCHEMA
            }
            || saved.format
                != if builtin {
                    GRAPHIC_BUILTIN_FORMAT
                } else {
                    GRAPHIC_FORMAT
                }
            || saved.manifest
                != serde_json::from_str::<Value>(if builtin {
                    GRAPHIC_BUILTIN_MANIFEST
                } else {
                    GRAPHIC_MANIFEST
                })
                .unwrap()
            || saved.capabilities
                != [if builtin {
                    GRAPHIC_BUILTIN_CAPABILITY
                } else {
                    GRAPHIC_CAPABILITY
                }]
        {
            return Err("unsupported graphic snapshot schema".into());
        }
        if !actor
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_~-".contains(&b))
        {
            return Err(
                "graphic actor must use ASCII letters, digits, underscore, tilde or hyphen".into(),
            );
        }
        let mut replica = Self::new(actor)?;
        replica.graphic = true;
        replica.graphic_builtins = builtin;
        replica.general = true;
        replica.movement = true;
        replica.paragraphs = true;
        replica.nested = Some(Storage::new());
        for op in &saved.ops {
            replica.apply_graphic(op)?;
        }
        if replica.clock != saved.clock || replica.graphic_ops != saved.ops {
            return Err("noncanonical graphic snapshot journal or clock".into());
        }
        Ok(replica)
    }
}
