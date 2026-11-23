//! Legacy paragraph boundaries without placement, private storage or logical joins.
use super::*;
pub(super) struct Block {
    pub marker: usize,
    pub atom: bool,
    pub virtual_: bool,
    pub aliases: Vec<usize>,
    pub chars: Vec<usize>,
}
/// Accept only the actual no-move split builder's left|right boundary.
pub(super) fn boundary_right(boundary: &str, origin: &Ticket) -> Result<Option<Ticket>> {
    // Actor strings can themselves contain '|'. The immutable origin ticket
    // identifies the entire left endpoint, so strip that exact prefix.
    let prefix = format!("{}|", origin.key());
    let right = boundary
        .strip_prefix(&prefix)
        .ok_or("ordinary paragraph boundary required")?;
    if right == "end" {
        Ok(None)
    } else {
        Ok(Some(parse_key(right)?))
    }
}
impl Replica {
    pub(super) fn blocks(&self) -> Vec<Block> {
        if self.general {
            return self.general_blocks();
        }
        let mut primary = BTreeMap::new();
        for (i, token) in self.items.iter().enumerate() {
            if token.unit.is_none() && token.alive() {
                let boundary = token
                    .node
                    .as_ref()
                    .map(|n| n.boundary.as_str())
                    .unwrap_or("root");
                primary.entry(boundary).or_insert(i);
            }
        }
        let mut blocks: Vec<Block> = vec![];
        for (i, token) in self.items.iter().enumerate() {
            if !token.alive() {
                continue;
            }
            if token.unit.is_some() {
                // Root is never deleted under this bounded contract.
                blocks
                    .last_mut()
                    .expect("root paragraph exists")
                    .chars
                    .push(i);
            } else {
                let boundary = token
                    .node
                    .as_ref()
                    .map(|n| n.boundary.as_str())
                    .unwrap_or("root");
                let head = *primary.get(boundary).expect("live marker has primary");
                if head == i {
                    blocks.push(Block {
                        marker: i,
                        atom: false,
                        virtual_: false,
                        aliases: vec![],
                        chars: vec![],
                    });
                } else if let Some(block) = blocks.iter_mut().find(|b| b.marker == head) {
                    block.aliases.push(i);
                }
            }
        }
        blocks
    }
    pub(super) fn runs(&self, chars: &[usize]) -> Vec<Value> {
        let mut runs: Vec<Value> = vec![];
        for index in chars {
            let token = &self.items[*index];
            let marks: BTreeMap<&str, bool> = token
                .attrs
                .iter()
                .filter(|(_, r)| r.value == json!(true))
                .map(|(k, _)| (k.as_str(), true))
                .collect();
            let marks = json!(marks);
            if let Some(run) = runs.last_mut().filter(|r| r["marks"] == marks) {
                run["units"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(token.unit.unwrap()));
            } else {
                runs.push(json!({"units":[token.unit.unwrap()],"marks":marks}));
            }
        }
        runs
    }
}
