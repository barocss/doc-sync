//! Fixed v5 group and span projection. Neither shape creates physical storage.
use super::*;

pub(super) fn manifest() -> Value {
    serde_json::from_str(SHAPES_MANIFEST).unwrap()
}

impl Replica {
    pub(super) fn nested_text_type(&self, t: &str) -> bool {
        general::text_type(t) || self.shapes && t == "list-item"
    }

    pub(super) fn validate_nested_marks(&self, marks: &BTreeMap<String, Value>) -> Result<()> {
        if !self.shapes {
            return validate_marks(marks);
        }
        for (k, v) in marks {
            self.validate_nested_mark(k, v)?;
        }
        Ok(())
    }

    pub(super) fn validate_nested_mark(&self, key: &str, value: &Value) -> Result<()> {
        if self.shapes && key == "link" {
            if value.is_null() || value.is_string() {
                return Ok(());
            }
            return Err("link mark must be string or null".into());
        }
        validate_mark(key)?;
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
