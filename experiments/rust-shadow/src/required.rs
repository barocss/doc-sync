// Deterministic, immutable fallback storage. No authored operation is required.
fn required_actor(parent: &str, kind: &str, ordinal: usize) -> String {
    format!(
        "~required:{}:{}:{ordinal}",
        uri_encode(parent),
        uri_encode(kind)
    )
}
fn required_address(key: &str) -> Option<(String, String, usize)> {
    let (_, actor) = key.split_once('@')?;
    let parts: Vec<_> = actor.strip_prefix("~required:")?.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let (parent, kind, ordinal) = (
        uri_decode(parts[0])?,
        uri_decode(parts[1])?,
        parts[2].parse::<usize>().ok()?,
    );
    (actor == required_actor(&parent, &kind, ordinal)).then_some((parent, kind, ordinal))
}
impl Replica {
    fn required_concrete(&self, kind: &str) -> String {
        let nodes = &self.runtime.as_ref().unwrap().manifest()["nodes"];
        if nodes[kind]["shape"] == "group" {
            nodes[kind]["children"][0].as_str().unwrap().into()
        } else {
            kind.into()
        }
    }
    fn required_genesis(&mut self, parent: &str, kind: &str, ordinal: usize) -> Result<()> {
        let actor = required_actor(parent, kind, ordinal);
        let key = format!("0@{actor}");
        if self.index_key(&key).is_some() {
            return Ok(());
        }
        let l = self.nested.as_ref().unwrap().lines
            [self.line_number(parent).ok_or("required parent missing")?]
        .clone();
        let concrete = self.required_concrete(kind);
        let shape = self.nested_shape(&concrete);
        let mut head = Token::root();
        head.id = Ticket {
            lamport: 0,
            actor: actor.clone(),
        };
        self.items.push(head);
        self.nested.as_mut().unwrap().lines.push(Line {
            key: key.clone(),
            owner: l.owner,
            slot: l.slot,
            ids: vec![key.clone()],
        });
        if shape != "text" {
            self.required_node(&actor, 1, &concrete, &key)?;
            if shape == "grid" {
                let owner = format!("1@{actor}");
                let row = self.grid_parts(&concrete).unwrap().0.to_owned();
                self.ensure(&slot(&owner, "rows"))?;
                self.ensure(&slot(&owner, "cols"))?;
                self.required_node(&actor, 2, &row, &slot(&owner, "rows"))?;
                self.required_node(&actor, 3, "col", &slot(&owner, "cols"))?;
            }
        }
        Ok(())
    }
    fn required_node(&mut self, actor: &str, lamport: u64, kind: &str, line: &str) -> Result<()> {
        let id = Ticket {
            lamport,
            actor: actor.into(),
        };
        self.items.push(Token {
            id: id.clone(),
            origin: Some(line.into()),
            unit: None,
            node: Some(ParagraphBirth {
                born: kind.into(),
                boundary: String::new(),
                type_at: id.clone(),
                birth_attrs: Some(BTreeMap::new()),
            }),
            birth_marks: BTreeMap::new(),
            attrs: BTreeMap::new(),
            dels: BTreeSet::new(),
            cancels: BTreeSet::new(),
        });
        let n = self.line_number(line).ok_or("required node line missing")?;
        self.nested.as_mut().unwrap().lines[n].ids.push(id.key());
        Ok(())
    }
    fn refresh_required(&mut self) -> Result<()> {
        if self.runtime.is_none() || self.graphic {
            return Ok(());
        }
        let lines: Vec<_> = self
            .nested
            .as_ref()
            .unwrap()
            .lines
            .iter()
            .filter(|l| required_address(&l.key).is_none() && text_address(&l.key).is_none())
            .map(|l| l.key.clone())
            .collect();
        for line in lines {
            let rules = self
                .runtime_flow_type(&line)
                .map(|f| {
                    self.runtime.as_ref().unwrap().manifest()["nodes"][f]["childRules"].clone()
                })
                .unwrap_or(Value::Null);
            for (kind, rule) in rules.as_object().into_iter().flatten() {
                for ordinal in 0..rule["min"].as_u64().unwrap_or(0) as usize {
                    self.required_genesis(&line, kind, ordinal)?;
                }
            }
        }
        Ok(())
    }
    fn apply_child_rules(&self, line: &str, blocks: Vec<Block>) -> Vec<Block> {
        if required_address(line).is_some() {
            return blocks;
        }
        let Some(flow) = self.runtime_flow_type(line) else {
            return blocks;
        };
        let rules = &self.runtime.as_ref().unwrap().manifest()["nodes"][flow]["childRules"];
        let Some(rules) = rules.as_object() else {
            return blocks;
        };
        struct Unit {
            kind: String,
            blocks: Vec<Block>,
            group: Option<(String, String)>,
            required: Option<(String, String, usize)>,
        }
        let mut units: Vec<Unit> = vec![];
        for block in blocks {
            if block.virtual_ && block.chars.is_empty() {
                continue;
            }
            let kind = if block.virtual_ {
                self.line_default_type(line)
            } else {
                self.ntype(&self.items[block.marker])
            };
            let required = self
                .line_of(&self.items[block.marker].id.key())
                .and_then(|l| required_address(&l.key));
            let group = self.block_group(&block, line).map(|(name, by)| {
                let attrs = self.attrs_nested(&self.items[block.marker], &kind, block.virtual_);
                let boundary = required
                    .as_ref()
                    .map(|(_, kind, ordinal)| required_actor(line, kind, *ordinal))
                    .unwrap_or_default();
                (
                    name,
                    format!(
                        "{}:{boundary}",
                        general::json_group_key(&json!(by
                            .iter()
                            .map(|key| attrs[key].clone())
                            .collect::<Vec<_>>()))
                    ),
                )
            });
            if group.is_some() && units.last().is_some_and(|last| last.group == group) {
                units.last_mut().unwrap().blocks.push(block);
            } else {
                units.push(Unit {
                    kind: required
                        .as_ref()
                        .map(|a| a.1.clone())
                        .or_else(|| group.as_ref().map(|g| g.0.clone()))
                        .unwrap_or(kind),
                    blocks: vec![block],
                    group,
                    required,
                });
            }
        }
        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut selected = BTreeSet::new();
        for (index, unit) in units
            .iter()
            .enumerate()
            .filter(|(_, unit)| unit.required.is_none())
        {
            let count = counts.entry(unit.kind.clone()).or_default();
            if *count
                < rules
                    .get(&unit.kind)
                    .and_then(|r| r["max"].as_u64())
                    .unwrap_or(u64::MAX) as usize
            {
                *count += 1;
                selected.insert(index);
            }
        }
        let mut visible = vec![];
        let mut seen = BTreeSet::new();
        for (index, unit) in units.into_iter().enumerate() {
            if let Some((parent, kind, ordinal)) = unit.required {
                seen.insert(required_actor(&parent, &kind, ordinal));
                if ordinal >= counts.get(&kind).copied().unwrap_or(0)
                    && ordinal
                        < rules
                            .get(&kind)
                            .and_then(|r| r["min"].as_u64())
                            .unwrap_or(0) as usize
                {
                    visible.extend(unit.blocks);
                }
            } else if selected.contains(&index) {
                visible.extend(unit.blocks);
            }
        }
        for (kind, rule) in rules {
            for ordinal in 0..rule["min"].as_u64().unwrap_or(0) as usize {
                let actor = required_actor(line, kind, ordinal);
                if seen.contains(&actor) || ordinal < counts.get(kind).copied().unwrap_or(0) {
                    continue;
                }
                if let Some(block) = self.required_block(&actor, kind) {
                    visible.push(block);
                }
            }
        }
        visible
    }
    fn required_block(&self, actor: &str, kind: &str) -> Option<Block> {
        let key = format!("0@{actor}");
        let marker = format!(
            "{}@{actor}",
            if self.nested_shape(&self.required_concrete(kind)) == "text" {
                0
            } else {
                1
            }
        );
        self.source_blocks(&key)
            .into_iter()
            .find(|b| !b.virtual_ && self.items[b.marker].id.key() == marker)
    }
}
