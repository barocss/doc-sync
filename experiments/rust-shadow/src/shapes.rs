//! Fixed v5 group and span projection. Neither shape creates physical storage.
use super::*;

pub(super) fn manifest() -> Value {
    serde_json::from_str(SHAPES_MANIFEST).unwrap()
}

impl Replica {
    pub(super) fn nested_text_type(&self, t: &str) -> bool {
        self.is_text_type(t) || self.shapes && t == "list-item"
    }

    pub(super) fn validate_nested_marks(&self, marks: &BTreeMap<String, Value>) -> Result<()> {
        if self.runtime.is_some() {
            return self.validate_birth_marks(marks);
        }
        if !self.shapes {
            return validate_marks(marks);
        }
        for (k, v) in marks {
            self.validate_nested_mark(k, v)?;
        }
        Ok(())
    }

    pub(super) fn validate_nested_mark(&self, key: &str, value: &Value) -> Result<()> {
        if self.runtime.is_some() {
            return self.validate_mark_value(key, value);
        }
        if self.shapes && key == "link" {
            if value.is_null() || value.is_string() {
                return Ok(());
            }
            return Err("link mark must be string or null".into());
        }
        self.validate_runtime_mark(key)?;
        if value.is_null() || value.is_boolean() {
            Ok(())
        } else {
            Err("invalid boolean mark".into())
        }
    }

    /// Link is a string in this fixed schema. Equality therefore has the same
    /// meaning as JavaScript strict equality, without an object identity oracle.
    fn link(&self, i: usize) -> Option<&str> {
        self.items[i]
            .attrs
            .get("link")?
            .value
            .as_str()
            .filter(|s| !s.is_empty())
    }

    fn plain_shapes_runs(&self, chars: &[usize]) -> Vec<Value> {
        let mut out: Vec<Value> = vec![];
        for &i in chars {
            let t = &self.items[i];
            let Some(unit) = t.unit else {
                out.push(json!({"type":"inline-image", "attrs": self.attrs_nested(t, "inline-image", false)}));
                continue;
            };
            let mut marks = Map::new();
            for k in ["bold", "italic"] {
                if t.attrs.get(k).is_some_and(|r| r.value == true) {
                    marks.insert(k.into(), json!(true));
                }
            }
            let marks = json!(marks);
            if let Some(last) = out
                .last_mut()
                .filter(|r| r.get("units").is_some() && r["marks"] == marks)
            {
                last["units"].as_array_mut().unwrap().push(json!(unit));
            } else {
                out.push(json!({"units":[unit],"marks":marks}));
            }
        }
        out
    }

    pub(super) fn shapes_runs(&self, chars: &[usize]) -> Vec<Value> {
        let mut out = vec![];
        let mut start = 0;
        while start < chars.len() {
            let i = chars[start];
            let link = self.items[i].unit.and_then(|_| self.link(i));
            let mut end = start + 1;
            while end < chars.len() {
                let next = chars[end];
                let other = self.items[next].unit.and_then(|_| self.link(next));
                if link != other || link.is_some() && self.items[next].unit.is_none() {
                    break;
                }
                end += 1;
            }
            let runs = self.plain_shapes_runs(&chars[start..end]);
            if let Some(link) = link {
                out.push(json!({"type":"inline-hyperlink","attrs":{"url":link},"runs":runs}));
            } else {
                out.extend(runs);
            }
            start = end;
        }
        out
    }
}

impl Replica {
    fn canonical_runtime_marks(&self, token: &Token, skip: Option<&str>) -> Value {
        let schema = self.runtime.as_ref().unwrap().effective_manifest();
        let mut marks = Map::new();
        for key in schema["marks"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
        {
            if Some(key) != skip && token.attrs.get(key).is_some_and(|r| r.value == true) {
                marks.insert(key.into(), json!(true));
            }
        }
        for (key, spec) in schema["markValues"].as_object().into_iter().flatten() {
            if Some(key.as_str()) == skip {
                continue;
            }
            if let Some(value) = token
                .attrs
                .get(key)
                .map(|r| &r.value)
                .filter(|v| !v.is_null() && !runtime_scalar_equal(v, &spec["default"]))
            {
                marks.insert(key.clone(), value.clone());
            }
        }
        json!(marks)
    }
    fn plain_runtime_runs(&self, chars: &[usize], skip: Option<&str>) -> Vec<Value> {
        let mut out: Vec<Value> = vec![];
        for &index in chars {
            let token = &self.items[index];
            let Some(unit) = token.unit else {
                let kind = self.type_of(token);
                let attrs = self.attrs_nested(token, &kind, false);
                let mut node = json!({"type":kind});
                if self.runtime.as_ref().unwrap().effective_manifest()["nodes"][&kind]
                    .get("attrs")
                    .is_some()
                {
                    node["attrs"] = attrs;
                }
                out.push(node);
                continue;
            };
            let marks = self.canonical_runtime_marks(token, skip);
            if let Some(last) = out.last_mut().filter(|r| {
                r.get("units").is_some()
                    && general::json_group_key(&r["marks"]) == general::json_group_key(&marks)
            }) {
                last["units"].as_array_mut().unwrap().push(json!(unit));
            } else {
                out.push(json!({"units":[unit],"marks":marks}));
            }
        }
        out
    }
    pub(super) fn runtime_runs(&self, chars: &[usize]) -> Vec<Value> {
        let schema = self.runtime.as_ref().unwrap().effective_manifest();
        let spans: Vec<_> = schema["nodes"]
            .as_object()
            .unwrap()
            .iter()
            .filter(|(_, s)| s["shape"] == "span")
            .collect();
        let mut out = vec![];
        let mut start = 0;
        while start < chars.len() {
            let token = &self.items[chars[start]];
            let marks = self.canonical_runtime_marks(token, None);
            let span = token.unit.and_then(|_| {
                spans
                    .iter()
                    .find(|(_, spec)| marks.get(spec["mark"].as_str().unwrap()).is_some())
            });
            if let Some((kind, spec)) = span {
                let key = spec["mark"].as_str().unwrap();
                let value = &marks[key];
                let mut end = start + 1;
                while end < chars.len()
                    && self.items[chars[end]].unit.is_some()
                    && self
                        .canonical_runtime_marks(&self.items[chars[end]], None)
                        .get(key)
                        .is_some_and(|v| runtime_scalar_equal(v, value))
                {
                    end += 1;
                }
                let mut attrs = Map::new();
                attrs.insert(spec["attr"].as_str().unwrap().into(), value.clone());
                out.push(json!({"type":kind,"attrs":attrs,"runs":self.plain_runtime_runs(&chars[start..end], Some(key))}));
                start = end;
            } else {
                let mut end = start + 1;
                while end < chars.len() {
                    let token = &self.items[chars[end]];
                    let marks = self.canonical_runtime_marks(token, None);
                    if token.unit.is_some()
                        && spans
                            .iter()
                            .any(|(_, spec)| marks.get(spec["mark"].as_str().unwrap()).is_some())
                    {
                        break;
                    }
                    end += 1;
                }
                out.extend(self.plain_runtime_runs(&chars[start..end], None));
                start = end;
            }
        }
        out
    }
}
fn runtime_scalar_equal(a: &Value, b: &Value) -> bool {
    if a.is_object() || a.is_array() || b.is_object() || b.is_array() { return false; }
    if a.is_number() && b.is_number() {
        a.as_f64() == b.as_f64()
    } else {
        a == b
    }
}
