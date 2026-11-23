//! Opt-in pinned flat flow with typed text/atom attributes. No nested storage.
use super::paragraph::Block;
use super::*;
pub(super) fn manifest() -> Value {
    serde_json::from_str(GENERAL_MANIFEST).unwrap()
}
pub(super) fn text_type(t: &str) -> bool {
    matches!(t, "paragraph" | "heading")
}
pub(super) fn atom_type(t: &str) -> bool {
    matches!(t, "divider" | "image")
}
pub(super) fn history_key(k: &str) -> bool {
    matches!(
        k,
        "bold"
            | "italic"
            | "$type"
            | "align"
            | "meta"
            | "level"
            | "style"
            | "src"
            | "width"
            | "decorative"
    )
}
pub(super) fn attr_ok(spec: &Value, value: &Value) -> bool {
    if value.is_null() {
        return true;
    }
    if let Some(values) = spec.get("values").and_then(Value::as_array) {
        if !values.iter().any(|v| {
            if v.is_number() && value.is_number() {
                v.as_f64() == value.as_f64()
            } else {
                v == value
            }
        }) {
            return false;
        }
    }
    let default = &spec["default"];
    if default.is_null() {
        return true;
    }
    if default.is_number() {
        return value.as_f64().is_some_and(|v| {
            v.is_finite()
                && v >= spec["min"].as_f64().unwrap_or(f64::NEG_INFINITY)
                && v <= spec["max"].as_f64().unwrap_or(f64::INFINITY)
        });
    }
    if default.is_string() {
        return value.is_string();
    }
    if default.is_boolean() {
        return value.is_boolean();
    }
    false
}
pub(super) fn validate_attr(t: &str, k: &str, v: &Value) -> Result<()> {
    let m = manifest();
    let attrs = &m["nodes"][t]["attrs"];
    if attrs.get(k).is_some_and(|s| attr_ok(s, v)) {
        Ok(())
    } else {
        Err(format!("invalid {t} attribute {k}"))
    }
}
/// Grouping has JavaScript number and own-key equality, while preserving ordinary
/// object insertion order. The key is internal, not an emitted JS serialization.
pub(super) fn json_group_key(v: &Value) -> String {
    fn norm(v: &Value) -> Value {
        match v {
            Value::Number(n) => {
                let f = n.as_f64().unwrap();
                json!(if f == 0.0 { 0.0 } else { f })
            }
            Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
            Value::Object(o) => {
                let mut numbers: Vec<(u32, &String)> = o
                    .keys()
                    .filter_map(|k| {
                        k.parse::<u32>()
                            .ok()
                            .filter(|n| *n < u32::MAX && n.to_string() == *k)
                            .map(|n| (n, k))
                    })
                    .collect();
                numbers.sort_by_key(|x| x.0);
                let mut out = Map::new();
                for (_, k) in numbers {
                    out.insert(k.clone(), norm(&o[k]));
                }
                for (k, v) in o {
                    if !out.contains_key(k) {
                        out.insert(k.clone(), norm(v));
                    }
                }
                Value::Object(out)
            }
            _ => v.clone(),
        }
    }
    norm(v).to_string()
}
impl Replica {
    pub(super) fn schema(&self) -> &'static str {
        if self.movement {
            MOVE_SCHEMA
        } else if self.shapes {
            SHAPES_SCHEMA
        } else if self.nested.is_some() {
            NESTED_SCHEMA
        } else if self.general {
            GENERAL_SCHEMA
        } else {
            SCHEMA
        }
    }
    pub(super) fn manifest(&self) -> Value {
        if self.movement {
            serde_json::from_str(MOVE_MANIFEST).unwrap()
        } else if self.shapes {
            shapes::manifest()
        } else if self.nested.is_some() {
            nested::manifest()
        } else if self.general {
            manifest()
        } else {
            super::manifest()
        }
    }
    pub(super) fn type_of(&self, t: &Token) -> String {
        t.attrs
            .get("$type")
            .and_then(|r| r.value.as_str())
            .unwrap_or_else(|| {
                t.node
                    .as_ref()
                    .map(|n| n.born.as_str())
                    .unwrap_or("paragraph")
            })
            .into()
    }
    pub(super) fn validate_set(&self, t: &Token, k: &str, v: &Value) -> Result<()> {
        if self.nested.is_some() {
            return self.validate_nested_set(t, k, v);
        }
        if t.unit.is_some() {
            validate_mark(k)?;
            if v.is_null() || v.is_boolean() {
                return Ok(());
            }
            return Err("mark value must be boolean or null".into());
        }
        let born = t
            .node
            .as_ref()
            .map(|n| n.born.as_str())
            .unwrap_or("paragraph");
        if k == "$type" {
            return if text_type(born) && (v.is_null() || v.as_str().is_some_and(text_type)) {
                Ok(())
            } else {
                Err("type change requires supported text type".into())
            };
        }
        let candidates = if text_type(born) {
            ["paragraph", "heading"]
        } else {
            ["divider", "image"]
        };
        if candidates.iter().any(|t| validate_attr(t, k, v).is_ok()) {
            Ok(())
        } else {
            Err(format!("unsupported node attribute {k}"))
        }
    }
    pub(super) fn validate_general_birth(&self, t: &Token) -> Result<()> {
        let n = t.node.as_ref().unwrap();
        if !text_type(&n.born) && !atom_type(&n.born) {
            return Err("unsupported snapshot birth type".into());
        }
        if atom_type(&n.born) && !n.boundary.is_empty() {
            return Err("invalid atom boundary".into());
        }
        let attrs = n
            .birth_attrs
            .as_ref()
            .ok_or("missing immutable birth attrs")?;
        let check = |key: &str, value: &Value| -> Result<()> {
            let reg = t.attrs.get(key).ok_or("missing snapshot birth register")?;
            if reg.at.cmp_js(&t.id) == Ordering::Less
                || (reg.at == t.id && json_group_key(&reg.value) != json_group_key(value))
            {
                return Err("invalid snapshot birth register".into());
            }
            Ok(())
        };
        for (k, v) in attrs {
            validate_attr(&n.born, k, v)?;
            check(k, v)?;
        }
        check("$type", &json!(n.born))?;
        Ok(())
    }
    fn projected_attrs(&self, t: &Token, type_: &str, virtual_: bool) -> Value {
        let m = manifest();
        let mut out = Map::new();
        if let Some(attrs) = m["nodes"][type_]["attrs"].as_object() {
            for (k, s) in attrs {
                out.insert(
                    k.clone(),
                    if virtual_ {
                        s["default"].clone()
                    } else {
                        t.attrs
                            .get(k)
                            .map(|r| &r.value)
                            .filter(|v| !v.is_null())
                            .unwrap_or(&s["default"])
                            .clone()
                    },
                );
            }
        }
        Value::Object(out)
    }
    pub(super) fn general_blocks(&self) -> Vec<Block> {
        let mut primary = BTreeMap::new();
        for (i, t) in self.items.iter().enumerate() {
            if t.unit.is_none() && t.alive() && text_type(&self.type_of(t)) {
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
        let mut pending: Option<Block> = None;
        for (i, t) in self.items.iter().enumerate() {
            if !t.alive() {
                continue;
            }
            if t.unit.is_some() {
                if let Some(p) = pending.take() {
                    out.push(p);
                }
                out.last_mut().unwrap().chars.push(i);
                continue;
            }
            if text_type(&self.type_of(t)) {
                let boundary = t
                    .node
                    .as_ref()
                    .map(|n| n.boundary.as_str())
                    .unwrap_or("root");
                let head = primary[boundary];
                if head == i {
                    pending = None;
                    out.push(Block {
                        marker: i,
                        atom: false,
                        virtual_: false,
                        aliases: vec![],
                        chars: vec![],
                    });
                } else {
                    if let Some(p) = pending.take() {
                        out.push(p);
                    }
                    if let Some(b) = out.iter_mut().find(|b| b.marker == head && !b.atom) {
                        b.aliases.push(i);
                    }
                }
            } else {
                if let Some(p) = pending.take() {
                    out.push(p);
                }
                out.push(Block {
                    marker: i,
                    atom: true,
                    virtual_: false,
                    aliases: vec![],
                    chars: vec![],
                });
                pending = Some(Block {
                    marker: i,
                    atom: false,
                    virtual_: true,
                    aliases: vec![],
                    chars: vec![],
                });
            }
        }
        if let Some(p) = pending {
            out.push(p);
        }
        out
    }
    pub(super) fn general_state(&self, items: Vec<Value>) -> Value {
        let blocks = self.blocks();
        let mut children = vec![];
        let mut projected = vec![];
        for b in &blocks {
            let t = &self.items[b.marker];
            let type_ = if b.virtual_ {
                "paragraph".into()
            } else {
                self.type_of(t)
            };
            let attrs = self.projected_attrs(t, &type_, b.virtual_);
            if b.atom {
                projected
                    .push(json!({"kind":"atom","marker":t.id.key(),"type":type_,"attrs":attrs}));
                children.push(json!({"type":type_,"attrs":attrs}));
            } else {
                projected.push(json!({"kind":"text","marker":t.id.key(),"type":type_,"attrs":attrs,"aliases":b.aliases.iter().map(|i|self.items[*i].id.key()).collect::<Vec<_>>(),"virtual":b.virtual_,"chars":b.chars.iter().map(|i|self.items[*i].id.key()).collect::<Vec<_>>(),"textUnits":b.chars.iter().map(|i|self.items[*i].unit.unwrap()).collect::<Vec<_>>()}));
                if !b.virtual_ || !b.chars.is_empty() {
                    children.push(json!({"type":type_,"attrs":attrs,"runs":self.runs(&b.chars)}));
                }
            }
        }
        let visible = self.items.iter().skip(1).filter(|t| t.alive()).count();
        json!({"clock":self.clock,"items":items,"model":{"type":"content","children":children},"blocks":projected,"counts":{"tokens":self.items.len()-1,"visible":visible,"tombstones":self.items.len()-1-visible}})
    }
}
