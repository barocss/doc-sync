// Fixed-schema v6 placement log and logical text projection. Physical origins,
// memberships and immutable births remain independent of current placement.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Move {
    t: String,
    at: Ticket,
    target: Ticket,
    parent: Ticket,
    #[serde(deserialize_with = "required_nullable")]
    after: Option<Ticket>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Placement {
    pub parent: Ticket,
    #[serde(deserialize_with = "required_nullable")]
    pub after: Option<Ticket>,
    pub at: Ticket,
}
#[derive(Clone, Debug)]
struct Address {
    parent: String,
    after: Option<String>,
    detached: bool,
}
#[derive(Clone, Debug)]
struct Entry {
    id: Ticket,
    target: String,
    parent: String,
    after: Option<String>,
}
#[derive(Clone, Default, Debug)]
pub(super) struct Projection {
    current: BTreeMap<String, Entry>,
    order: BTreeMap<String, Vec<String>>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SplitBirth {
    into: String,
    after: String,
    left: String,
    right: String,
}
fn split_birth(boundary: &str) -> Option<SplitBirth> {
    serde_json::from_str(boundary.strip_prefix("split:")?).ok()
}
fn uri_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char)
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
fn uri_decode(s: &str) -> Option<String> {
    let mut bytes = vec![];
    let mut i = 0;
    while i < s.len() {
        if s.as_bytes()[i] == b'%' {
            bytes.push(u8::from_str_radix(s.get(i + 1..i + 3)?, 16).ok()?);
            i += 3;
        } else {
            bytes.push(s.as_bytes()[i]);
            i += 1;
        }
    }
    String::from_utf8(bytes).ok()
}
fn text_key(a: &Address) -> String {
    format!(
        "0@~{}:{}:{}",
        if a.detached { "fragment" } else { "text" },
        uri_encode(&a.parent),
        a.after.as_ref().map(|s| uri_encode(s)).unwrap_or_default()
    )
}
fn text_address(k: &str) -> Option<Address> {
    let (detached, tail) = if let Some(t) = k.strip_prefix("0@~text:") {
        (false, t)
    } else {
        (true, k.strip_prefix("0@~fragment:")?)
    };
    let (parent, after) = tail.split_once(':')?;
    if parent.is_empty() {
        return None;
    }
    let a = Address {
        parent: uri_decode(parent)?,
        after: if after.is_empty() {
            None
        } else {
            Some(uri_decode(after)?)
        },
        detached,
    };
    (text_key(&a) == k).then_some(a)
}
impl Replica {
    fn clear_movement_cache(&self) {
        *self.placement_cache.borrow_mut() = None;
        self.movement_cache.borrow_mut().clear();
    }
    pub(super) fn has_retained_move(&self, at: &Ticket) -> bool {
        self.sorted_moves().iter().any(|m| m.at == *at)
    }
    fn has_moves(&self) -> bool {
        self.movement && self.nested.as_ref().is_some_and(|s| !s.moves.is_empty())
    }
    fn sorted_moves(&self) -> Vec<Move> {
        let mut m = self
            .nested
            .as_ref()
            .map(|s| s.moves.clone())
            .unwrap_or_default();
        m.sort_by(|a, b| a.at.cmp_js(&b.at));
        m
    }
    fn ensure_text_storage(&mut self, key: &str) -> Result<usize> {
        if let Some(i) = self.index_key(key) {
            return Ok(i);
        }
        let a = text_address(key).ok_or("invalid private text identity")?;
        self.ensure(&a.parent)?;
        let parent = self
            .nested
            .as_ref()
            .unwrap()
            .lines
            .get(
                self.line_number(&a.parent)
                    .ok_or("text parent is not a line")?,
            )
            .unwrap()
            .clone();
        if parent.key != a.parent
            || matches!(parent.slot.as_str(), "rows" | "cols")
            || text_address(&parent.key).is_some()
        {
            return Err("invalid text parent flow".into());
        }
        if !a.detached {
            if let Some(after) = &a.after {
                if self.index_key(after).is_none()
                    && !self.sorted_moves().iter().any(|m| m.at.key() == *after)
                {
                    return Err("text gap anchor missing".into());
                }
            }
        }
        let mut token = Token::root();
        token.id = parse_key(key)?;
        self.clear_movement_cache();
        let i = self.items.len();
        self.items.push(token);
        self.nested.as_mut().unwrap().lines.push(Line {
            key: key.into(),
            owner: parent.owner,
            slot: parent.slot,
            ids: vec![key.into()],
        });
        Ok(i)
    }
    fn automatic_gap(&self, mut a: Address) -> Option<Address> {
        let moves = self.sorted_moves();
        let mut seen = BTreeSet::new();
        while a.detached {
            let after = a.after.as_ref()?;
            if !seen.insert(after.clone()) {
                return None;
            }
            let m = moves.iter().find(|m| m.at.key() == *after)?;
            if let Some(original) = text_address(&m.target.key()) {
                if original.parent != a.parent {
                    return None;
                }
                a = original;
            } else {
                let i = self.index(&m.target)?;
                let born = self.items[i].node.as_ref()?.born.as_str();
                return (m.parent.key() == a.parent
                    && matches!(self.nested_shape(born), "flow" | "grid" | "atom"))
                .then(|| Address {
                    parent: a.parent,
                    after: m.after.as_ref().map(Ticket::key),
                    detached: false,
                });
            }
        }
        Some(a)
    }
    fn validate_move(&self, m: &Move) -> Result<()> {
        if !self.movement || m.t != "move" {
            return Err("movement capability required".into());
        }
        m.at.birth_valid()?;
        if !m
            .at
            .actor
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_~-".contains(&b))
        {
            return Err("invalid movement actor".into());
        }
        m.target.valid()?;
        m.parent.valid()?;
        if m.at.cmp_js(&m.target) != Ordering::Greater
            || m.after
                .as_ref()
                .is_some_and(|a| m.at.cmp_js(a) != Ordering::Greater)
        {
            return Err("move identity must follow references".into());
        }
        let i = self.index(&m.target).ok_or("move target missing")?;
        let target = &self.items[i];
        let l = self
            .line_of(&m.target.key())
            .ok_or("move target line missing")?;
        if matches!(l.slot.as_str(), "rows" | "cols")
            || target.unit.is_some()
            || !self.head(target)
                && !matches!(
                    self.nested_shape(&self.ntype(target)),
                    "text" | "flow" | "grid" | "atom"
                )
        {
            return Err("move target shape rejected".into());
        }
        let parent = self
            .nested
            .as_ref()
            .unwrap()
            .lines
            .iter()
            .find(|l| l.key == m.parent.key())
            .ok_or("move parent must be a flow head")?;
        if matches!(parent.slot.as_str(), "rows" | "cols") || text_address(&parent.key).is_some() {
            return Err("move parent shape rejected".into());
        }
        if let Some(after) = &m.after {
            after.valid()?;
            if let Some(prior) = self.sorted_moves().iter().find(|p| p.at == *after) {
                if prior.parent != m.parent {
                    return Err("move anchor belongs to another flow".into());
                }
            } else {
                let j = self.index(after).ok_or("move anchor missing")?;
                let l = self
                    .line_of(&after.key())
                    .ok_or("move anchor line missing")?;
                let parent = text_address(&l.key)
                    .map(|a| a.parent)
                    .unwrap_or_else(|| l.key.clone());
                if self.items[j].unit.is_some() || parent != m.parent.key() {
                    return Err("move anchor belongs to another flow".into());
                }
            }
        }
        Ok(())
    }
    fn apply_move(&mut self, value: &Value) -> Result<()> {
        let m: Move = decode(value)?;
        self.ensure(&m.target.key())?;
        self.ensure(&m.parent.key())?;
        if let Some(a) = &m.after {
            if !self.sorted_moves().iter().any(|p| p.at == *a) {
                self.ensure(&a.key())?;
            }
        }
        self.validate_move(&m)?;
        if let Some(old) = self
            .nested
            .as_ref()
            .unwrap()
            .moves
            .iter()
            .find(|p| p.at == m.at)
        {
            if old != &m {
                return Err("conflicting movement identity".into());
            }
        } else {
            self.nested.as_mut().unwrap().moves.push(m.clone());
        }
        self.observe(&m.at);
        Ok(())
    }
    fn validate_join(&self, t: &Token, v: &Value) -> Result<()> {
        if !self.head(t) && !self.nested_text_type(&self.ntype(t)) {
            return Err("join requires text target".into());
        }
        if v.is_null() {
            return Ok(());
        }
        let o = object(v)?;
        fields(o, &["into", "after"])?;
        for k in ["into", "after"] {
            let i = self
                .index_key(string(o, k)?)
                .ok_or("join endpoint missing")?;
            let x = &self.items[i];
            if !self.head(x) && !self.nested_text_type(&self.ntype(x)) {
                return Err("join endpoint must be text".into());
            }
        }
        Ok(())
    }
    fn split_right(&self, boundary: &str, origin: &Ticket) -> Result<Option<Ticket>> {
        if let Some(b) = split_birth(boundary) {
            if b.left != origin.key() {
                return Err("split left differs from origin".into());
            }
            for k in [&b.into, &b.after] {
                let i = self.index_key(k).ok_or("split endpoint missing")?;
                let t = &self.items[i];
                if !self.head(t) && !self.nested_text_type(&self.ntype(t)) {
                    return Err("split endpoint must be text".into());
                }
            }
            return if b.right == "end" {
                Ok(None)
            } else {
                Ok(Some(parse_key(&b.right)?))
            };
        }
        paragraph::boundary_right(
            boundary.strip_prefix("virtual:").unwrap_or(boundary),
            origin,
        )
    }
    fn placement_projection(&self) -> Projection {
        if let Some(p) = self.placement_cache.borrow().as_ref() {
            return p.clone();
        }
        let mut base = vec![];
        let mut gaps: BTreeMap<String, Ticket> = BTreeMap::new();
        for l in &self.nested.as_ref().unwrap().lines {
            if matches!(l.slot.as_str(), "rows" | "cols") {
                continue;
            }
            let address = text_address(&l.key);
            let gap = address.as_ref().and_then(|a| self.automatic_gap(a.clone()));
            let mut after = if address.is_some() {
                gap.as_ref().and_then(|a| a.after.clone())
            } else {
                None
            };
            if gap.is_some() {
                let stamps = self
                    .line_ids(&l.key)
                    .into_iter()
                    .skip(1)
                    .map(|i| self.items[i].id.clone())
                    .chain(
                        self.items[self.index_key(&l.key).unwrap()]
                            .attrs
                            .values()
                            .map(|r| r.at.clone()),
                    );
                for stamp in stamps {
                    if gaps
                        .get(&l.key)
                        .is_none_or(|old| stamp.cmp_js(old) == Ordering::Less)
                    {
                        gaps.insert(l.key.clone(), stamp);
                    }
                }
            }
            for i in self.line_ids(&l.key) {
                let t = &self.items[i];
                if t.unit.is_some()
                    || self.ntype(t) == "inline-image"
                    || address.as_ref().is_some_and(|a| a.detached) && gap.is_none() && self.head(t)
                {
                    continue;
                }
                let parent = address
                    .as_ref()
                    .map(|a| a.parent.clone())
                    .unwrap_or_else(|| l.key.clone());
                base.push(Entry {
                    id: t.id.clone(),
                    target: t.id.key(),
                    parent,
                    after: after.clone(),
                });
                if t.node
                    .as_ref()
                    .is_none_or(|n| split_birth(&n.boundary).is_none())
                {
                    after = Some(t.id.key());
                }
                if address.is_none() && !self.head(t) && !self.nested_text_type(&self.ntype(t)) {
                    let key = text_key(&Address {
                        parent: l.key.clone(),
                        after: Some(t.id.key()),
                        detached: false,
                    });
                    let id = parse_key(&key).unwrap();
                    base.push(Entry {
                        id: id.clone(),
                        target: key.clone(),
                        parent: l.key.clone(),
                        after: after.clone(),
                    });
                    if let Some(v) = self
                        .source_blocks(&l.key)
                        .iter()
                        .find(|b| b.virtual_ && b.marker == i)
                    {
                        for j in &v.chars {
                            let stamp = self.items[*j].id.clone();
                            if gaps
                                .get(&key)
                                .is_none_or(|old| stamp.cmp_js(old) == Ordering::Less)
                            {
                                gaps.insert(key.clone(), stamp);
                            }
                        }
                    }
                    after = Some(key);
                }
            }
        }
        let mut current: BTreeMap<String, Entry> =
            base.iter().map(|e| (e.target.clone(), e.clone())).collect();
        let mut all: BTreeMap<String, Entry> = base.into_iter().map(|e| (e.id.key(), e)).collect();
        for m in self.sorted_moves() {
            let e = Entry {
                id: m.at,
                target: m.target.key(),
                parent: m.parent.key(),
                after: m.after.as_ref().map(Ticket::key),
            };
            all.insert(e.id.key(), e.clone());
            if !current.contains_key(&e.target) {
                continue;
            }
            let mut owner = self
                .line_number(&e.parent)
                .and_then(|n| self.nested.as_ref().unwrap().lines[n].owner.clone());
            let mut seen = BTreeSet::new();
            while owner
                .as_ref()
                .is_some_and(|o| o != &e.target && !seen.contains(o))
            {
                let o = owner.clone().unwrap();
                seen.insert(o.clone());
                owner = current
                    .get(&o)
                    .and_then(|p| self.line_number(&p.parent))
                    .and_then(|n| self.nested.as_ref().unwrap().lines[n].owner.clone());
            }
            if owner.is_none() {
                current.insert(e.target.clone(), e);
            }
        }
        let mut children: BTreeMap<String, BTreeMap<Option<String>, Vec<Entry>>> = BTreeMap::new();
        for e in all.values() {
            children
                .entry(e.parent.clone())
                .or_default()
                .entry(e.after.clone())
                .or_default()
                .push(e.clone());
        }
        let mut order = BTreeMap::new();
        for (parent, mut origins) in children {
            for siblings in origins.values_mut() {
                siblings.sort_by(|a, b| {
                    let rank = |e: &Entry| {
                        if e.id.key() == e.target {
                            gaps.get(&e.target).unwrap_or(&e.id).clone()
                        } else {
                            e.id.clone()
                        }
                    };
                    rank(b).cmp_js(&rank(a)).then_with(|| b.id.cmp_js(&a.id))
                });
            }
            let mut result = vec![];
            let mut visited = BTreeSet::new();
            let mut stack = origins.get(&None).cloned().unwrap_or_default();
            stack.reverse();
            while let Some(e) = stack.pop() {
                let k = e.id.key();
                if !visited.insert(k.clone()) {
                    continue;
                }
                if current
                    .get(&e.target)
                    .is_some_and(|w| w.id == e.id && w.parent == parent)
                {
                    result.push(e.target.clone());
                }
                if let Some(c) = origins.get(&Some(k)) {
                    stack.extend(c.iter().rev().cloned());
                }
            }
            order.insert(parent, result);
        }
        let p = Projection { current, order };
        *self.placement_cache.borrow_mut() = Some(p.clone());
        p
    }
    pub(super) fn placement_of(&self, id: &Ticket) -> Option<Placement> {
        self.placement_projection()
            .current
            .get(&id.key())
            .map(|e| Placement {
                parent: parse_key(&e.parent).unwrap(),
                after: e.after.as_ref().map(|a| parse_key(a).unwrap()),
                at: e.id.clone(),
            })
    }
    fn logical_line(&self, key: &str) -> Option<String> {
        if self.has_moves() {
            if let Some(e) = self.placement_projection().current.get(key) {
                return Some(e.parent.clone());
            }
        }
        self.line_of(key).map(|l| {
            text_address(&l.key)
                .map(|a| a.parent)
                .unwrap_or_else(|| l.key.clone())
        })
    }
    fn movement_blocks(&self, line: &str) -> (Vec<Block>, BTreeSet<String>) {
        let mut needed = BTreeSet::new();
        let mut available: BTreeMap<String, Block> = BTreeMap::new();
        let mut physical_virtual = BTreeMap::new();
        let Some(l) = self
            .line_number(line)
            .map(|n| &self.nested.as_ref().unwrap().lines[n])
        else {
            return (vec![], needed);
        };
        if matches!(l.slot.as_str(), "rows" | "cols") {
            return (vec![], needed);
        }
        for source in &self.nested.as_ref().unwrap().lines {
            if text_address(&source.key).is_some()
                || matches!(source.slot.as_str(), "rows" | "cols")
            {
                continue;
            }
            for b in self.source_blocks(&source.key) {
                if b.kind == "text" && b.virtual_ {
                    let key = text_key(&Address {
                        parent: source.key.clone(),
                        after: Some(self.items[b.marker].id.key()),
                        detached: false,
                    });
                    needed.insert(key.clone());
                    physical_virtual.insert(key, b);
                } else if self.items[b.marker].alive() {
                    available.insert(self.items[b.marker].id.key(), b);
                }
            }
        }
        for source in &self.nested.as_ref().unwrap().lines {
            let Some(a) = text_address(&source.key) else {
                continue;
            };
            let blocks = self.source_blocks(&source.key);
            for b in blocks.iter().skip(1) {
                if !(b.kind == "text" && b.virtual_) && self.items[b.marker].alive() {
                    available.insert(self.items[b.marker].id.key(), b.clone());
                }
            }
            let gap = self.automatic_gap(a.clone());
            if a.detached && gap.is_none() {
                continue;
            }
            let Some(mut b) = blocks.first().cloned() else {
                continue;
            };
            if gap.as_ref().unwrap_or(&a).after.is_some()
                && source.ids.len() == 1
                && self.items[b.marker].attrs.is_empty()
                && !self
                    .sorted_moves()
                    .iter()
                    .any(|m| m.target.key() == source.key)
            {
                b.virtual_ = true;
            }
            if let Some(original) = physical_virtual.get(&source.key) {
                b.positions.push((b.marker, 0));
                b.positions.push((original.marker, b.chars.len()));
                b.positions
                    .extend(original.aliases.iter().map(|i| (*i, b.chars.len())));
                b.chars.extend(&original.chars);
            }
            available.insert(source.key.clone(), b);
        }
        let p = self.placement_projection();
        let mut joins: BTreeMap<String, (String, String, Ticket)> = BTreeMap::new();
        let mut candidates: Vec<_> = available
            .iter()
            .filter_map(|(k, b)| {
                if b.kind != "text" {
                    return None;
                }
                let r = self.items[b.marker].attrs.get("$join")?;
                let o = r.value.as_object()?;
                Some((
                    k.clone(),
                    o.get("into")?.as_str()?.to_owned(),
                    o.get("after")?.as_str()?.to_owned(),
                    r.at.clone(),
                ))
            })
            .collect();
        candidates.sort_by(|a, b| a.3.cmp_js(&b.3));
        for (key, into, after, at) in candidates {
            if !available.contains_key(&into) || !available.contains_key(&after) {
                continue;
            }
            let mut target = into.clone();
            let mut seen = BTreeSet::from([key.clone()]);
            while let Some(next) = joins.get(&target) {
                if seen.contains(&target) {
                    break;
                }
                seen.insert(target.clone());
                target = next.0.clone();
            }
            if !seen.contains(&target) {
                joins.insert(key, (into, after, at));
            }
        }
        let joined_into = |key: &str| {
            let mut k = key.to_owned();
            while let Some(j) = joins.get(&k) {
                k = j.0.clone();
            }
            k
        };
        let mut result = vec![];
        for key in p.order.get(line).into_iter().flatten() {
            let Some(mut b) = available.get(key).cloned() else {
                continue;
            };
            if joins.contains_key(key) {
                continue;
            }
            if b.kind == "text" {
                let keys: Vec<_> = joins
                    .keys()
                    .filter(|k| joined_into(k) == *key)
                    .cloned()
                    .collect();
                let mut emitted = BTreeSet::from([key.clone()]);
                loop {
                    let mut next: Vec<_> = keys
                        .iter()
                        .filter(|k| !emitted.contains(*k) && emitted.contains(&joins[*k].1))
                        .cloned()
                        .collect();
                    next.sort_by(|a, b| joins[b].2.cmp_js(&joins[a].2));
                    if next.is_empty() {
                        break;
                    }
                    for k in next {
                        let part = &available[&k];
                        if b.positions.is_empty() {
                            b.positions.push((b.marker, 0));
                            b.positions.extend(b.aliases.iter().map(|i| (*i, 0)));
                        }
                        let offset = b.chars.len();
                        if part.positions.is_empty() {
                            b.positions.push((part.marker, offset));
                            b.positions
                                .extend(part.aliases.iter().map(|i| (*i, offset)));
                        } else {
                            b.positions
                                .extend(part.positions.iter().map(|(i, o)| (*i, o + offset)));
                        }
                        b.aliases.push(part.marker);
                        b.aliases.extend(&part.aliases);
                        b.chars.extend(&part.chars);
                        emitted.insert(k);
                    }
                }
            }
            result.push(b);
        }
        let fallback = |after: Option<String>,
                        before: Option<&Block>,
                        needed: &mut BTreeSet<String>|
         -> Option<Block> {
            let mut key = text_key(&Address {
                parent: line.into(),
                after: after.clone(),
                detached: false,
            });
            needed.insert(key.clone());
            let mut visited = BTreeSet::new();
            while let Some(e) = p.current.get(&key) {
                if e.id.key() == key || !visited.insert(key.clone()) {
                    break;
                }
                key = text_key(&Address {
                    parent: line.into(),
                    after: Some(e.id.key()),
                    detached: true,
                });
                needed.insert(key.clone());
            }
            let mut b = available
                .get(&key)
                .cloned()
                .or_else(|| self.source_blocks(&key).first().cloned())?;
            if before.is_some()
                && (!b.chars.is_empty() || !self.items[b.marker].attrs.is_empty())
                && result.iter().any(|r| r.marker == b.marker)
            {
                if let Some(e) = before.and_then(|b| p.current.get(&self.items[b.marker].id.key()))
                {
                    if self.sorted_moves().iter().any(|m| m.at == e.id) {
                        key = text_key(&Address {
                            parent: line.into(),
                            after: Some(e.id.key()),
                            detached: true,
                        });
                        needed.insert(key.clone());
                        b = available
                            .get(&key)
                            .cloned()
                            .or_else(|| self.source_blocks(&key).first().cloned())?;
                    }
                }
            }
            if after.is_some()
                && self.line_ids(&key).len() == 1
                && self.items[b.marker].attrs.is_empty()
            {
                b.virtual_ = true;
            }
            Some(b)
        };
        let mut out: Vec<Block> = vec![];
        let mut emitted = BTreeSet::new();
        for (i, b) in result.iter().enumerate() {
            let key = self.items[b.marker].id.key();
            if emitted.contains(&key) {
                continue;
            }
            if b.kind == "text"
                && text_address(&key).is_some()
                && b.chars.is_empty()
                && !self.sorted_moves().iter().any(|m| m.target.key() == key)
                && (result.get(i + 1).is_some_and(|b| b.kind == "text")
                    || out.last().is_some_and(|b| b.kind == "text"))
            {
                continue;
            }
            let after = out.last().filter(|x| x.kind != "text").map(|last| {
                p.current
                    .get(&self.items[last.marker].id.key())
                    .map(|e| e.id.key())
                    .unwrap_or_else(|| self.items[last.marker].id.key())
            });
            if b.kind != "text" && (out.is_empty() || after.is_some()) {
                if let Some(gap) = fallback(after, Some(b), &mut needed) {
                    if emitted.insert(self.items[gap.marker].id.key()) {
                        out.push(gap);
                    }
                }
            }
            if emitted.insert(key) {
                out.push(b.clone());
            }
        }
        if out.is_empty() {
            if let Some(b) = fallback(None, None, &mut needed) {
                out.push(b);
            }
        } else if out.last().is_some_and(|b| b.kind != "text") {
            let b = out.last().unwrap();
            let after = p
                .current
                .get(&self.items[b.marker].id.key())
                .map(|e| e.id.key())
                .unwrap_or_else(|| self.items[b.marker].id.key());
            if let Some(b) = fallback(Some(after), None, &mut needed) {
                if emitted.insert(self.items[b.marker].id.key()) {
                    out.push(b);
                }
            }
        }
        (out, needed)
    }
    fn refresh_movement(&mut self) -> Result<()> {
        let lines = self.nested.as_ref().unwrap().lines.clone();
        for l in lines {
            if text_address(&l.key).is_some() || matches!(l.slot.as_str(), "rows" | "cols") {
                continue;
            }
            self.ensure(&text_key(&Address {
                parent: l.key.clone(),
                after: None,
                detached: false,
            }))?;
            for i in self.line_ids(&l.key) {
                let t = &self.items[i];
                if t.node
                    .as_ref()
                    .is_some_and(|n| matches!(self.nested_shape(&n.born), "flow" | "grid" | "atom"))
                {
                    let k = text_key(&Address {
                        parent: l.key.clone(),
                        after: Some(t.id.key()),
                        detached: false,
                    });
                    self.ensure(&k)?;
                }
            }
            for m in self.sorted_moves() {
                if m.parent.key() == l.key {
                    self.ensure(&text_key(&Address {
                        parent: l.key.clone(),
                        after: Some(m.at.key()),
                        detached: true,
                    }))?;
                }
            }
        }
        for _ in 0..100 {
            let keys: Vec<_> = self
                .nested
                .as_ref()
                .unwrap()
                .lines
                .iter()
                .filter(|l| text_address(&l.key).is_none())
                .map(|l| l.key.clone())
                .collect();
            let needed: BTreeSet<_> = keys
                .iter()
                .flat_map(|k| self.movement_blocks(k).1)
                .collect();
            let mut changed = false;
            for key in needed {
                if self.index_key(&key).is_none() {
                    self.ensure(&key)?;
                    changed = true;
                }
            }
            if !changed {
                return Ok(());
            }
        }
        Err("private text projection failed to close".into())
    }
}

pub(super) fn history_split(boundary: &str) -> Option<(String, String)> {
    split_birth(boundary).map(|b| (b.into, b.after))
}

impl Replica {
    fn movement_location(&self, key: &str) -> Option<(String, bool)> {
        let target = self.index_key(key)?;
        let physical = self.line_of(key)?;
        if matches!(physical.slot.as_str(), "rows" | "cols") {
            return None;
        }
        let mut locations = BTreeMap::new();
        for line in &self.nested.as_ref().unwrap().lines {
            if text_address(&line.key).is_some() || matches!(line.slot.as_str(), "rows" | "cols") {
                continue;
            }
            let location = (line.key.clone(), self.line_visible(&line.key));
            for b in self.blocks_nested(&line.key) {
                locations.insert(b.marker, location.clone());
                if b.kind == "text" {
                    for i in b.aliases.iter().chain(b.chars.iter()) {
                        locations.insert(*i, location.clone());
                    }
                }
            }
        }
        if let Some(p) = locations.get(&target) {
            return Some(p.clone());
        }
        let mut containing = (self.logical_line(&physical.key)?, false);
        for i in self.line_ids(&physical.key) {
            let t = &self.items[i];
            if t.alive() && t.unit.is_none() && self.ntype(t) != "inline-image" {
                containing = locations
                    .get(&i)
                    .cloned()
                    .unwrap_or((self.logical_line(&t.id.key())?, false));
            }
            if i == target {
                return Some(containing);
            }
        }
        Some(containing)
    }
    fn position_in(&self, line: &str, i: usize) -> Option<(String, usize, usize)> {
        let mut map = BTreeMap::new();
        for (p, b) in self.blocks_nested(line).iter().enumerate() {
            if b.kind != "text" {
                map.insert(b.marker, (p + 1, 0));
                continue;
            }
            if !b.virtual_ {
                map.insert(b.marker, (p, 0));
            }
            for (j, o) in &b.positions {
                map.insert(*j, (p, *o));
            }
            for (o, j) in b.chars.iter().enumerate() {
                map.insert(*j, (p, o + 1));
            }
        }
        let physical = self.line_of(&self.items[i].id.key())?;
        let all = self.line_ids(&physical.key);
        let at = all.iter().position(|j| *j == i)?;
        all[..=at]
            .iter()
            .rev()
            .find_map(|j| map.get(j))
            .map(|(p, o)| (line.into(), *p, *o))
    }
}
impl Replica {
    pub(super) fn validate_history_placement(&self, target: &Ticket, p: &Placement) -> Result<()> {
        let i = self
            .index(target)
            .ok_or("history movement target missing")?;
        let token = &self.items[i];
        let physical = self
            .line_of(&target.key())
            .ok_or("history movement target line missing")?;
        if token.unit.is_some()
            || matches!(physical.slot.as_str(), "rows" | "cols")
            || !self.head(token)
                && !matches!(
                    self.nested_shape(&self.ntype(token)),
                    "text" | "flow" | "grid" | "atom"
                )
        {
            return Err("history movement target shape invalid".into());
        }
        let m = Move {
            t: "move".into(),
            at: p.at.clone(),
            target: target.clone(),
            parent: p.parent.clone(),
            after: p.after.clone(),
        };
        if let Some(record) = self.sorted_moves().iter().find(|m| m.at == p.at) {
            if record != &m {
                return Err("history movement state disagrees with retained log".into());
            }
            self.validate_move(&m)?;
        } else {
            if p.at != *target {
                return Err("history movement writer missing from log".into());
            }
            let expected = text_address(&physical.key)
                .map(|a| a.parent)
                .unwrap_or_else(|| physical.key.clone());
            if p.parent.key() != expected {
                return Err("history initial movement parent differs from physical owner".into());
            }
            if let Some(after) = &p.after {
                let line = self
                    .line_of(&after.key())
                    .ok_or("history initial placement anchor missing")?;
                if text_address(&line.key)
                    .map(|a| a.parent)
                    .unwrap_or_else(|| line.key.clone())
                    != expected
                    || self.items[self.index(after).unwrap()].unit.is_some()
                {
                    return Err("history initial placement anchor has wrong owner".into());
                }
            }
        }
        Ok(())
    }
}
