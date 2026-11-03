//! Bounded participant History. State references are arena identities, not values.
use super::*;

const DEPTH: usize = 100;
pub(super) const HISTORY_FORMAT: &str = "doc-sync-rust-history-v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SetState {
    #[serde(deserialize_with = "required_json")]
    value: Value,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_ticket"
    )]
    at: Option<Ticket>,
    users: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Target {
    id: Ticket,
    slot: String,
    before: usize,
    after: usize,
    undone: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
enum Step {
    #[serde(rename = "existence")]
    Existence {
        ids: Vec<Ticket>,
        #[serde(rename = "delAt", deserialize_with = "required_nullable")]
        del_at: Option<Ticket>,
    },
    #[serde(rename = "set")]
    Set { key: String, targets: Vec<Target> },
    #[serde(rename = "move")]
    Move {
        target: Ticket,
        before: usize,
        after: usize,
        undone: bool,
    },
    #[serde(rename = "split")]
    Split {
        id: Ticket,
        slot: String,
        before: usize,
        after: usize,
        placement: usize,
        undone: bool,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Group {
    steps: Vec<Step>,
    caret_before: String,
    caret_after: String,
    typing: bool,
    at: f64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Options {
    caret_before: String,
    caret_after: String,
    #[serde(default)]
    typing: bool,
}
#[derive(Clone, Default, Debug)]
pub(super) struct History {
    undo: Vec<Group>,
    redo: Vec<Group>,
    sets: Vec<SetState>,
    // Preserve insertion order of JS Map, including replacement in place.
    current: Vec<(String, usize)>,
    moves: Vec<nested::Placement>,
    current_moves: Vec<(String, usize)>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Saved {
    version: u8,
    undo: Vec<Group>,
    redo: Vec<Group>,
    sets: Vec<SetState>,
    moves: Vec<nested::Placement>,
    current_sets: Vec<(String, usize)>,
    current_moves: Vec<(String, usize)>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Checkpoint {
    pub format: String,
    pub actor: String,
    pub document: Value,
    pub history: Value,
}
fn optional_ticket<'de, D>(deserializer: D) -> std::result::Result<Option<Ticket>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ticket::deserialize(deserializer).map(Some)
}
fn slot(id: &Ticket, key: &str) -> String {
    json!([id.key(), key]).to_string()
}
fn validate_id(id: &Ticket) -> Result<()> {
    id.valid()?;

    Ok(())
}
impl History {
    fn current_move(&mut self, key: String, state: usize) {
        if let Some(e) = self.current_moves.iter_mut().find(|e| e.0 == key) {
            e.1 = state;
        } else {
            self.current_moves.push((key, state));
        }
    }
    fn current_set(&mut self, slot: String, state: usize) {
        if let Some(entry) = self.current.iter_mut().find(|entry| entry.0 == slot) {
            entry.1 = state;
        } else {
            self.current.push((slot, state));
        }
    }
    fn release(&mut self, group: &Group) {
        for step in &group.steps {
            if let Step::Set { targets, .. } = step {
                for target in targets {
                    for state in [target.before, target.after] {
                        self.sets[state].users -= 1;
                        if self.sets[state].users == 0 {
                            self.current
                                .retain(|(slot, id)| !(slot == &target.slot && *id == state));
                        }
                    }
                }
            }
        }
    }
    pub fn record(
        &mut self,
        doc: &mut Replica,
        ops: &[Value],
        options: Options,
        now: f64,
    ) -> Result<()> {
        if !now.is_finite() {
            return Err("invalid history time".into());
        }
        let mut steps = vec![];
        let mut written = BTreeSet::new();
        for op in ops {
            let o = object(op)?;
            let kind = string(o, "t")?;
            // Validate and apply on the candidate document first. For set, capture
            // each actual register before applying, as Doc.run does for local ops.
            let priors = if kind == "set" {
                let key = string(o, "key")?;
                let ids: Vec<Ticket> = decode(required(o, "ids")?)?;
                ids.into_iter()
                    .map(|id| {
                        let prior = doc
                            .index(&id)
                            .and_then(|i| doc.items[i].attrs.get(key))
                            .cloned();
                        (id, prior)
                    })
                    .collect::<Vec<_>>()
            } else {
                vec![]
            };
            let prior_placement = if kind == "move" {
                doc.placement_of(&ticket(o, "target")?)
            } else {
                None
            };
            doc.apply(op)?;
            let owner = if kind == "text" || kind == "node" {
                ticket(o, "id")?
            } else {
                ticket(o, "at")?
            };
            if owner.actor != doc.actor {
                return Err("local history operation actor mismatch".into());
            }
            let span = if kind == "text" {
                required(o, "units")?
                    .as_array()
                    .ok_or("units must be array")?
                    .len()
            } else {
                1
            };
            for n in 0..span {
                let key = Ticket {
                    lamport: owner.lamport + n as u64,
                    actor: owner.actor.clone(),
                }
                .key();
                if !written.insert(key) {
                    return Err("repeated local history operation ticket".into());
                }
            }
            if kind != "text" && kind != "node" && kind != "move" {
                let ids: Vec<Ticket> = decode(required(o, "ids")?)?;
                if ids.iter().any(|id| {
                    (*id == Ticket::root() && !(doc.general && kind == "set"))
                        || doc.index(id).is_none()
                }) {
                    return Err("local history target missing".into());
                }
            }
            match kind {
                "text" => {
                    let id = ticket(o, "id")?;
                    let units: Vec<u16> = decode(required(o, "units")?)?;
                    let ids = (0..units.len())
                        .map(|n| Ticket {
                            lamport: id.lamport + n as u64,
                            actor: id.actor.clone(),
                        })
                        .collect();
                    steps.push(Step::Existence { ids, del_at: None });
                }
                "node" => {
                    let id = ticket(o, "id")?;
                    let boundary = o.get("boundary").and_then(Value::as_str).unwrap_or("");
                    if boundary.starts_with("virtual:") {
                        continue;
                    }
                    if let Some(split) = nested::history_split(boundary) {
                        let movement = ops
                            .iter()
                            .find(|op| op["t"] == "move" && op["target"] == json!(id));
                        let placement = if let Some(m) = movement {
                            nested::Placement {
                                parent: decode(&m["parent"])?,
                                after: decode(&m["after"])?,
                                at: decode(&m["at"])?,
                            }
                        } else {
                            doc.placement_of(&id).ok_or("split placement missing")?
                        };
                        let m = self.moves.len();
                        self.moves.push(placement);
                        self.current_move(id.key(), m);
                        let slot = slot(&id, "$join");
                        let after = self.sets.len();
                        self.sets.push(SetState {
                            value: Value::Null,
                            at: None,
                            users: 1,
                        });
                        self.current_set(slot.clone(), after);
                        let before = self.sets.len();
                        self.sets.push(SetState {
                            value: json!({"into":split.0,"after":split.1}),
                            at: None,
                            users: 1,
                        });
                        steps.push(Step::Split {
                            id,
                            slot,
                            before,
                            after,
                            placement: m,
                            undone: false,
                        });
                    } else {
                        steps.push(Step::Existence {
                            ids: vec![id],
                            del_at: None,
                        });
                    }
                }
                "move" => {
                    let id = ticket(o, "target")?;
                    let split = ops.iter().any(|op| {
                        op["t"] == "node"
                            && op["id"] == json!(id)
                            && op["boundary"]
                                .as_str()
                                .is_some_and(|b| nested::history_split(b).is_some())
                    });
                    let first = ops
                        .iter()
                        .find(|op| op["t"] == "move" && op["target"] == json!(id));
                    if split && first == Some(op) {
                        continue;
                    }
                    if let Some(prior) = prior_placement {
                        let cached = self
                            .current_moves
                            .iter()
                            .find(|(k, _)| *k == id.key())
                            .map(|(_, i)| *i);
                        let before = cached
                            .filter(|i| self.moves[*i].at == prior.at)
                            .unwrap_or_else(|| {
                                let i = self.moves.len();
                                self.moves.push(prior);
                                i
                            });
                        let after = self.moves.len();
                        self.moves.push(nested::Placement {
                            parent: ticket(o, "parent")?,
                            after: decode(required(o, "after")?)?,
                            at: ticket(o, "at")?,
                        });
                        self.current_move(id.key(), after);
                        steps.push(Step::Move {
                            target: id,
                            before,
                            after,
                            undone: false,
                        });
                    }
                }
                "del" => steps.push(Step::Existence {
                    ids: decode(required(o, "ids")?)?,
                    del_at: Some(ticket(o, "at")?),
                }),
                "set" => {
                    let key = string(o, "key")?.to_owned();
                    let at = ticket(o, "at")?;
                    let value = required(o, "value")?.clone();
                    let mut targets = vec![];
                    for (id, prior) in priors {
                        let slot = slot(&id, &key);
                        let cached = self
                            .current
                            .iter()
                            .find(|(s, _)| s == &slot)
                            .map(|(_, i)| *i);
                        let before = cached
                            .filter(|i| self.sets[*i].at == prior.as_ref().map(|r| r.at.clone()))
                            .unwrap_or_else(|| {
                                let i = self.sets.len();
                                self.sets.push(SetState {
                                    value: prior
                                        .as_ref()
                                        .map(|r| r.value.clone())
                                        .unwrap_or(Value::Null),
                                    at: prior.map(|r| r.at),
                                    users: 0,
                                });
                                i
                            });
                        self.sets[before].users += 1;
                        let after = self.sets.len();
                        self.sets.push(SetState {
                            value: value.clone(),
                            at: Some(at.clone()),
                            users: 1,
                        });
                        self.current_set(slot.clone(), after);
                        targets.push(Target {
                            id,
                            slot,
                            before,
                            after,
                            undone: false,
                        });
                    }
                    steps.push(Step::Set { key, targets });
                }
                "undel" => {}
                _ => unreachable!("apply rejects unsupported ops"),
            }
        }
        if steps.is_empty() {
            return Ok(());
        }
        if let Some(last) = self.undo.last_mut().filter(|last| {
            options.typing
                && last.typing
                && last.caret_after == options.caret_before
                && now - last.at < 1500.0
        }) {
            last.steps.extend(steps);
            last.caret_after = options.caret_after;
            last.at = now;
        } else {
            self.undo.push(Group {
                steps,
                caret_before: options.caret_before,
                caret_after: options.caret_after,
                typing: options.typing,
                at: now,
            });
            if self.undo.len() > DEPTH {
                let old = self.undo.remove(0);
                self.release(&old);
            }
        }
        for old in std::mem::take(&mut self.redo) {
            self.release(&old);
        }
        // Discard released arena nodes. This also bounds retained ownership metadata
        // by retained groups/targets rather than lifetime edit count.
        *self = Self::restore_with_runtime(&self.snapshot(), doc.runtime.is_some())?;
        Ok(())
    }
    fn next(doc: &mut Replica) -> Result<Ticket> {
        if doc.clock >= MAX {
            return Err("history clock exhausted".into());
        }
        doc.clock += 1;
        Ok(Ticket {
            lamport: doc.clock,
            actor: doc.actor.clone(),
        })
    }
    fn step(&mut self, step: &mut Step, doc: &mut Replica, undo: bool) -> Result<Vec<Value>> {
        match step {
            Step::Move {
                target,
                before,
                after,
                undone,
            } => {
                if *undone == undo {
                    return Ok(vec![]);
                }
                let source = if undo { *after } else { *before };
                if doc
                    .placement_of(target)
                    .is_none_or(|p| p.at != self.moves[source].at)
                {
                    return Ok(vec![]);
                }
                let target_state = if undo { *before } else { *after };
                let location = self.moves[target_state].clone();
                let at = Self::next(doc)?;
                let op = json!({"t":"move","at":at,"target":target,"parent":location.parent,"after":location.after});
                doc.apply(&op)?;
                if doc.placement_of(target).is_some_and(|p| p.at == at) {
                    self.moves[target_state].at = at;
                    *undone = undo;
                }
                Ok(vec![op])
            }
            Step::Split {
                id,
                slot,
                before,
                after,
                placement,
                undone,
            } => {
                if *undone == undo
                    || doc
                        .placement_of(id)
                        .is_none_or(|p| p.at != self.moves[*placement].at)
                {
                    return Ok(vec![]);
                }
                let current = doc
                    .index(id)
                    .and_then(|i| doc.items[i].attrs.get("$join"))
                    .map(|r| r.at.clone());
                let source = if undo { *after } else { *before };
                if current != self.sets[source].at {
                    return Ok(vec![]);
                }
                let target = if undo { *before } else { *after };
                let at = Self::next(doc)?;
                let op = json!({"t":"set","at":at,"ids":[id],"key":"$join","value":self.sets[target].value});
                doc.apply(&op)?;
                self.sets[target].at = Some(at);
                self.current_set(slot.clone(), target);
                *undone = undo;
                Ok(vec![op])
            }
            Step::Existence { ids, del_at } => {
                let at = Self::next(doc)?;
                let op = if let Some(del) = del_at.take() {
                    json!({"t":"undel","at":at,"ids":ids,"cancels":[del]})
                } else {
                    *del_at = Some(at.clone());
                    json!({"t":"del","at":at,"ids":ids})
                };
                doc.apply(&op)?;
                Ok(vec![op])
            }
            Step::Set { key, targets } => {
                let mut groups: Vec<(Value, Vec<usize>)> = vec![];
                for (i, t) in targets.iter().enumerate() {
                    if t.undone == undo {
                        continue;
                    }
                    let source = if undo { t.after } else { t.before };
                    let current = doc
                        .index(&t.id)
                        .and_then(|i| doc.items[i].attrs.get(key))
                        .map(|r| &r.at);
                    if current.is_none() || current != self.sets[source].at.as_ref() {
                        continue;
                    }
                    let value = self.sets[if undo { t.before } else { t.after }]
                        .value
                        .clone();
                    if let Some((_, ids)) = groups.iter_mut().find(|(v, _)| {
                        general::json_group_key(v) == general::json_group_key(&value)
                    }) {
                        ids.push(i);
                    } else {
                        groups.push((value, vec![i]));
                    }
                }
                let mut ops = vec![];
                for (value, indices) in groups {
                    let at = Self::next(doc)?;
                    let ids: Vec<&Ticket> = indices.iter().map(|i| &targets[*i].id).collect();
                    let op = json!({"t":"set","at":at,"ids":ids,"key":key,"value":value});
                    doc.apply(&op)?;
                    for i in indices {
                        let t = &mut targets[i];
                        let target = if undo { t.before } else { t.after };
                        self.sets[target].at = Some(at.clone());
                        self.current_set(t.slot.clone(), target);
                        t.undone = undo;
                    }
                    ops.push(op);
                }
                Ok(ops)
            }
        }
    }
    pub fn travel(
        &mut self,
        doc: &mut Replica,
        undo: bool,
    ) -> Result<(Vec<Value>, Option<String>)> {
        let source = if undo { &mut self.undo } else { &mut self.redo };
        let Some(mut group) = source.pop() else {
            return Ok((vec![], None));
        };
        let mut ops = vec![];
        if undo {
            for step in group.steps.iter_mut().rev() {
                ops.extend(self.step(step, doc, true)?);
            }
        } else {
            for step in &mut group.steps {
                ops.extend(self.step(step, doc, false)?);
            }
        }
        let caret = if undo {
            group.caret_before.clone()
        } else {
            group.caret_after.clone()
        };
        if undo {
            self.redo.push(group);
        } else {
            self.undo.push(group);
        }
        Ok((ops, Some(caret)))
    }
    pub fn snapshot(&self) -> Value {
        let mut ids = BTreeMap::new();
        let mut states = vec![];
        let mut register = |old: usize| -> usize {
            *ids.entry(old).or_insert_with(|| {
                let id = states.len();
                states.push(self.sets[old].clone());
                id
            })
        };
        let mut mids = BTreeMap::new();
        let mut moves = vec![];
        let mut movement = |old: usize| -> usize {
            *mids.entry(old).or_insert_with(|| {
                let id = moves.len();
                moves.push(self.moves[old].clone());
                id
            })
        };
        let mut undo = self.undo.clone();
        let mut redo = self.redo.clone();
        for group in undo.iter_mut().chain(redo.iter_mut()) {
            for step in &mut group.steps {
                match step {
                    Step::Set { targets, .. } => {
                        for t in targets {
                            t.before = register(t.before);
                            t.after = register(t.after);
                        }
                    }
                    Step::Split {
                        before,
                        after,
                        placement,
                        ..
                    } => {
                        *before = register(*before);
                        *after = register(*after);
                        *placement = movement(*placement);
                    }
                    Step::Move { before, after, .. } => {
                        *before = movement(*before);
                        *after = movement(*after);
                    }
                    _ => {}
                }
            }
        }
        let current_sets = self
            .current
            .iter()
            .map(|(slot, state)| (slot.clone(), register(*state)))
            .collect();
        let current_moves = self
            .current_moves
            .iter()
            .map(|(key, state)| (key.clone(), movement(*state)))
            .collect();
        json!(Saved {
            version: 1,
            undo,
            redo,
            sets: states,
            moves,
            current_sets,
            current_moves
        })
    }
    pub fn restore_with_runtime(value: &Value, runtime: bool) -> Result<Self> {
        let saved: Saved = decode(value)?;
        if saved.version != 1 || saved.undo.len() + saved.redo.len() > DEPTH {
            return Err("unsupported history snapshot".into());
        }
        let mut refs = vec![0; saved.sets.len()];
        for state in &saved.sets {
            if state.users == 0 || state.users > MAX as usize {
                return Err("invalid history users".into());
            }
            if let Some(at) = &state.at {
                at.valid()?;
            }
        }
        let mut slots = BTreeSet::new();
        let mut state_slots: BTreeMap<usize, String> = BTreeMap::new();
        for group in saved.undo.iter().chain(saved.redo.iter()) {
            if group.steps.is_empty() || !group.at.is_finite() {
                return Err("invalid history group".into());
            }
            for step in &group.steps {
                match step {
                    Step::Split {
                        id,
                        slot: slot_,
                        before,
                        after,
                        placement,
                        ..
                    } => {
                        validate_id(id)?;
                        if *slot_ != slot(id, "$join")
                            || *before >= refs.len()
                            || *after >= refs.len()
                            || *placement >= saved.moves.len()
                        {
                            return Err("invalid split history reference".into());
                        }
                        for i in [*before, *after] {
                            if state_slots
                                .insert(i, slot_.clone())
                                .is_some_and(|old| old != *slot_)
                            {
                                return Err("history state crosses split slots".into());
                            }
                            refs[i] += 1;
                        }
                        slots.insert(slot_.clone());
                    }
                    Step::Move {
                        target,
                        before,
                        after,
                        ..
                    } => {
                        validate_id(target)?;
                        if *before >= saved.moves.len() || *after >= saved.moves.len() {
                            return Err("invalid move history reference".into());
                        }
                    }
                    Step::Existence { ids, del_at } => {
                        for id in ids {
                            validate_id(id)?;
                        }
                        if let Some(at) = del_at {
                            at.valid()?;
                        }
                    }
                    Step::Set { key, targets } => {
                        if !(runtime && runtime_schema::safe_name(key)) && !nested::graphic_history_key(key)
                            && !general::history_key(key)
                            && !nested::history_key(key)
                            && key != "link"
                            && key != "listType"
                            && key != "$join"
                        {
                            return Err("unsupported history attribute".into());
                        }
                        for t in targets {
                            validate_id(&t.id)?;
                            if t.slot != slot(&t.id, key)
                                || t.before >= refs.len()
                                || t.after >= refs.len()
                            {
                                return Err("invalid history target/reference".into());
                            }
                            for id in [t.before, t.after] {
                                if state_slots
                                    .insert(id, t.slot.clone())
                                    .is_some_and(|old| old != t.slot)
                                {
                                    return Err("history state crosses attribute slots".into());
                                }
                            }
                            refs[t.before] += 1;
                            refs[t.after] += 1;
                            slots.insert(t.slot.clone());
                        }
                    }
                }
            }
        }
        for (slot_, id) in &saved.current_sets {
            if *id >= saved.sets.len() {
                return Err("invalid history current state".into());
            }
            if !slots.contains(slot_) {
                let pair: Vec<String> =
                    serde_json::from_str(slot_).map_err(|_| "invalid orphan history slot")?;
                if pair.len() != 2
                    || pair[1] != "$join"
                    || *slot_ != slot(&parse_key(&pair[0])?, "$join")
                {
                    return Err("unsupported orphan history state".into());
                }
                slots.insert(slot_.clone());
                if state_slots
                    .insert(*id, slot_.clone())
                    .is_some_and(|old| old != *slot_)
                {
                    return Err("orphan history state crosses slots".into());
                }
            }
        }
        if refs.iter().enumerate().zip(&saved.sets).any(|((i, n), s)| {
            *n > s.users
                || *n != s.users
                    && !state_slots
                        .get(&i)
                        .is_some_and(|slot| slot.ends_with(",\"$join\"]"))
        }) {
            return Err("invalid history state ownership count".into());
        }
        let mut seen = BTreeSet::new();
        for (slot, id) in &saved.current_sets {
            if *id >= saved.sets.len()
                || !slots.contains(slot)
                || state_slots.get(id) != Some(slot)
                || !seen.insert(slot)
            {
                return Err("invalid history current reference".into());
            }
        }
        for m in &saved.moves {
            m.parent.valid()?;
            m.at.valid()?;
            if let Some(a) = &m.after {
                a.valid()?;
            }
        }
        let mut seen_moves = BTreeSet::new();
        for (k, i) in &saved.current_moves {
            parse_key(k)?;
            if *i >= saved.moves.len() || !seen_moves.insert(k) {
                return Err("invalid current movement reference".into());
            }
        }
        Ok(Self {
            undo: saved.undo,
            redo: saved.redo,
            sets: saved.sets,
            current: saved.current_sets,
            moves: saved.moves,
            current_moves: saved.current_moves,
        })
    }
    pub fn validate_document(&self, doc: &Replica) -> Result<()> {
        if !doc.movement && (!self.moves.is_empty() || !self.current_moves.is_empty()) {
            return Err("movement history requires v6".into());
        }
        let check = |at: &Ticket| -> Result<()> {
            at.valid()?;
            if at.lamport > doc.clock {
                return Err("history ticket exceeds document clock".into());
            }
            Ok(())
        };
        for state in &self.moves {
            check(&state.at)?;
            check(&state.parent)?;
            if let Some(a) = &state.after {
                check(a)?;
            }
        }
        for state in &self.sets {
            if let Some(at) = &state.at {
                check(at)?;
            }
        }
        for group in self.undo.iter().chain(self.redo.iter()) {
            for step in &group.steps {
                match step {
                    Step::Split {
                        id,
                        slot: _,
                        before,
                        after,
                        placement,
                        ..
                    } => {
                        if !doc.movement {
                            return Err("split history requires v6".into());
                        }
                        let token = doc
                            .index(id)
                            .map(|i| &doc.items[i])
                            .ok_or("split history target missing")?;
                        if token
                            .node
                            .as_ref()
                            .is_none_or(|n| nested::history_split(&n.boundary).is_none())
                        {
                            return Err("split history immutable birth missing".into());
                        }
                        for i in [*before, *after] {
                            doc.validate_set(token, "$join", &self.sets[i].value)?;
                        }
                        check(&self.moves[*placement].at)?;
                    }
                    Step::Move {
                        target,
                        before,
                        after,
                        ..
                    } => {
                        if !doc.movement || doc.index(target).is_none() {
                            return Err("move history target missing".into());
                        }
                        for i in [*before, *after] {
                            let m = &self.moves[i];
                            check(&m.at)?;
                            if doc.index(&m.parent).is_none() {
                                return Err("move history parent missing".into());
                            }
                        }
                        if self.moves[*after].at.actor != doc.actor {
                            return Err("move history writer mismatch".into());
                        }
                    }
                    Step::Existence { ids, del_at } => {
                        if ids
                            .iter()
                            .any(|id| *id == Ticket::root() || doc.index(id).is_none())
                        {
                            return Err("history existence target missing".into());
                        }
                        if let Some(at) = del_at {
                            check(at)?;
                            if at.actor != doc.actor {
                                return Err("history deletion actor mismatch".into());
                            }
                            if ids.iter().any(|id| {
                                !doc.items[doc.index(id).unwrap()].dels.contains(&at.key())
                            }) {
                                return Err("history deletion ledger missing".into());
                            }
                        }
                    }
                    Step::Set { key, targets } => {
                        for t in targets {
                            let token = doc
                                .index(&t.id)
                                .map(|i| &doc.items[i])
                                .ok_or("history attribute target missing")?;
                            if !doc.general && token.unit.is_none() {
                                return Err("history attribute character target missing".into());
                            }
                            for state in [t.before, t.after] {
                                if let Some(register) = token.attrs.get(key) {
                                    if self.sets[state].at.as_ref() == Some(&register.at)
                                        && general::json_group_key(&self.sets[state].value)
                                            != general::json_group_key(&register.value)
                                    {
                                        return Err(
                                            "history and document disagree at same writer ticket"
                                                .into(),
                                        );
                                    }
                                }
                                if doc.general {
                                    doc.validate_set(token, key, &self.sets[state].value)?;
                                } else {
                                    validate_mark(key)?;
                                    if !self.sets[state].value.is_null()
                                        && !self.sets[state].value.is_boolean()
                                    {
                                        return Err("invalid history mark value".into());
                                    }
                                }
                            }

                            if self.sets[t.after]
                                .at
                                .as_ref()
                                .is_none_or(|at| at.actor != doc.actor)
                            {
                                return Err("history write actor mismatch".into());
                            }
                        }
                    }
                }
            }
        }
        let mut move_targets: BTreeMap<usize, Ticket> = BTreeMap::new();
        let mut bind = |state: usize, target: &Ticket| -> Result<()> {
            if move_targets
                .insert(state, target.clone())
                .is_some_and(|old| old != *target)
            {
                return Err("history placement state crosses targets".into());
            }
            doc.validate_history_placement(target, &self.moves[state])
        };
        for group in self.undo.iter().chain(self.redo.iter()) {
            for step in &group.steps {
                match step {
                    Step::Move {
                        target,
                        before,
                        after,
                        ..
                    } => {
                        bind(*before, target)?;
                        bind(*after, target)?;
                    }
                    Step::Split {
                        id,
                        before,
                        after,
                        placement,
                        ..
                    } => {
                        bind(*placement, id)?;
                        let token = &doc.items[doc.index(id).unwrap()];
                        let (into, after_key) =
                            nested::history_split(&token.node.as_ref().unwrap().boundary).unwrap();
                        if self.sets[*before].value != json!({"into":into,"after":after_key})
                            || !self.sets[*after].value.is_null()
                        {
                            return Err(
                                "split ownership state differs from immutable boundary".into()
                            );
                        }
                        for state in [*before, *after] {
                            if let Some(register) = token.attrs.get("$join") {
                                if self.sets[state].at.as_ref() == Some(&register.at)
                                    && self.sets[state].value != register.value
                                {
                                    return Err("split state differs at current writer".into());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        for (key, state) in &self.current_moves {
            let target = parse_key(key)?;
            let owner = &self.moves[*state];
            let split_birth = doc
                .index(&target)
                .and_then(|i| doc.items[i].node.as_ref())
                .is_some_and(|n| nested::history_split(&n.boundary).is_some());
            if owner.at.actor != doc.actor
                || !(doc.has_retained_move(&owner.at) || split_birth && owner.at == target)
            {
                return Err("history current placement is not an owned recorded state".into());
            }
            bind(*state, &target)?;
        }
        if move_targets.len() != self.moves.len() {
            return Err("unreferenced history placement state".into());
        }
        for (slot_, state) in &self.current {
            let state = &self.sets[*state];
            if state.at.as_ref().is_some_and(|at| at.actor != doc.actor) {
                return Err("history current owner mismatch".into());
            }
            if state.at.is_none() {
                let pair: Vec<String> =
                    serde_json::from_str(slot_).map_err(|_| "invalid initial history slot")?;
                if !doc.movement
                    || pair.len() != 2
                    || pair[1] != "$join"
                    || !state.value.is_null()
                    || doc
                        .index_key(&pair[0])
                        .and_then(|i| doc.items[i].node.as_ref())
                        .is_none_or(|n| nested::history_split(&n.boundary).is_none())
                {
                    return Err("history current writer missing".into());
                }
            }
        }
        Ok(())
    }
    pub fn status(&self) -> Value {
        let mut pins = vec![];
        for group in self.undo.iter().chain(self.redo.iter()) {
            for step in &group.steps {
                if let Step::Existence {
                    del_at: Some(at), ..
                } = step
                {
                    pins.push(at.key());
                }
            }
        }
        json!({"canUndo":!self.undo.is_empty(),"canRedo":!self.redo.is_empty(),"pins":pins})
    }
    pub fn pin(&self, sequences: &Value) -> Result<Value> {
        let map = object(sequences)?;
        let mut minimum: Option<u64> = None;
        for pin in self.status()["pins"].as_array().unwrap() {
            if let Some(value) = map.get(pin.as_str().unwrap()) {
                let seq = value
                    .as_u64()
                    .filter(|n| *n <= MAX)
                    .ok_or("invalid deletion sequence")?;
                minimum = Some(minimum.map(|m| m.min(seq)).unwrap_or(seq));
            }
        }
        Ok(json!(minimum))
    }
}
