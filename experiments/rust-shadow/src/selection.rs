//! UTF-16 token anchors for the pinned flat flow schema.
use super::*;
impl Replica {
    fn capture_offset(&self, paragraph: u64, offset: u64) -> Option<String> {
        let blocks = self.blocks();
        let block = blocks.get(usize::try_from(paragraph).ok()?)?;
        if block.atom {
            return None;
        }
        let index = if offset == 0 {
            block.marker
        } else {
            *block.chars.get(usize::try_from(offset - 1).ok()?)?
        };
        Some(self.items[index].id.key())
    }
    fn resolve_anchor(&self, anchor: &str, strict: bool) -> Option<(u64, u64)> {
        let Some(index) = self.index_key(anchor) else {
            return if strict { None } else { Some((0, 0)) };
        };
        let mut positions = BTreeMap::new();
        for (p, block) in self.blocks().iter().enumerate() {
            if block.atom {
                positions.insert(block.marker, (p as u64 + 1, 0));
                continue;
            }
            if !block.virtual_ {
                positions.insert(block.marker, (p as u64, 0));
            }
            for (o, index) in block.chars.iter().enumerate() {
                positions.insert(*index, (p as u64, o as u64 + 1));
            }
            // Legacy aliases have no direct entry in Doc.posMap. Resolve by the
            // physical predecessor walk, just like tombstones.
        }
        (0..=index)
            .rev()
            .find_map(|i| positions.get(&i).copied())
            .or(Some((0, 0)))
    }
    fn resolve_path(&self, anchor: &str) -> Option<(u64, u64)> {
        let (p, o) = self.resolve_anchor(anchor, true)?;
        if !self.general {
            return Some((p, o));
        }
        let blocks = self.blocks();
        let visible: Vec<usize> = blocks
            .iter()
            .enumerate()
            .filter(|(_, b)| !b.virtual_ || !b.chars.is_empty())
            .map(|(i, _)| i)
            .collect();
        if let Some(i) = visible.iter().position(|i| *i == p as usize) {
            return Some((i as u64, o));
        }
        if p > 0 {
            let before = p as usize - 1;
            return visible
                .iter()
                .position(|i| *i == before)
                .map(|i| (i as u64, blocks[before].chars.len() as u64));
        }
        None
    }
    fn capture_path(&self, value: &Value) -> Option<String> {
        let path = value.as_array()?;
        if path.len() != 2 {
            return None;
        }
        let paragraph = path[0].as_u64().filter(|n| *n <= MAX)?;
        let offset = path[1].as_u64().filter(|n| *n <= MAX)?;
        let paragraph = if self.general {
            self.blocks()
                .iter()
                .enumerate()
                .filter(|(_, b)| !b.virtual_ || !b.chars.is_empty())
                .nth(usize::try_from(paragraph).ok()?)
                .map(|(i, _)| i as u64)?
        } else {
            paragraph
        };
        self.capture_offset(paragraph, offset)
    }
    pub(super) fn selection_request(
        &self,
        cmd: &str,
        request: &Map<String, Value>,
    ) -> Result<Value> {
        if self.nested.is_some() {
            return self.nested_selection(cmd, request);
        }
        match cmd {
            "anchor_capture" => {
                let offset = required(request, "offset")?
                    .as_u64()
                    .filter(|n| *n <= MAX)
                    .ok_or("invalid UTF-16 offset")?;
                let paragraph = request
                    .get("paragraph")
                    .map(|v| {
                        v.as_u64()
                            .filter(|n| *n <= MAX)
                            .ok_or("invalid paragraph index")
                    })
                    .transpose()?
                    .unwrap_or(0);
                let anchor = self
                    .capture_offset(paragraph, offset)
                    .ok_or("UTF-16 position outside paragraph")?;
                Ok(json!({"ok":true,"anchor":anchor}))
            }
            "anchor_resolve" => {
                let strict = request
                    .get("strict")
                    .map(|v| v.as_bool().ok_or("strict must be boolean"))
                    .transpose()?
                    .unwrap_or(false);
                let position = self.resolve_anchor(string(request, "anchor")?, strict);
                let mut response = json!({"ok":true,"offset":position.map(|(_,o)|o)});
                if self.paragraphs {
                    response["paragraph"] = json!(position.map(|(p, _)| p));
                }
                Ok(response)
            }
            "selection_capture" => {
                let range = required(request, "range")?;
                if range.is_null() {
                    return Ok(json!({"ok":true,"range":null}));
                }
                let range = object(range)?;
                fields(range, &["anchor", "focus"])?;
                let anchor = self.capture_path(required(range, "anchor")?);
                let focus = self.capture_path(required(range, "focus")?);
                Ok(
                    json!({"ok":true,"range":match (anchor,focus) {(Some(anchor),Some(focus))=>json!({"anchor":anchor,"focus":focus}),_=>Value::Null}}),
                )
            }
            "selection_resolve" => {
                let range = required(request, "range")?;
                if range.is_null() {
                    return Ok(json!({"ok":true,"range":null}));
                }
                let range = object(range)?;
                fields(range, &["anchor", "focus"])?;
                let anchor = self.resolve_path(string(range, "anchor")?);
                let focus = self.resolve_path(string(range, "focus")?);
                Ok(
                    json!({"ok":true,"range":match (anchor,focus) {(Some((ap,ao)),Some((fp,fo)))=>json!({"anchor":[ap,ao],"focus":[fp,fo]}),_=>Value::Null}}),
                )
            }
            _ => Err("unsupported selection request".into()),
        }
    }
}
