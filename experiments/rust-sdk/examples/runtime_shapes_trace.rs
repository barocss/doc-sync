//! Independently author the semantic commands in a group/inline/span schema corpus.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::{self, Read},
};
fn key(v: &Value, aliases: &BTreeMap<String, Key>) -> Result<Option<Key>> {
    if v.is_null() {
        return Ok(None);
    }
    let name = v
        .as_str()
        .or_else(|| v["ref"].as_str())
        .ok_or_else(|| Error("alias required".into()))?;
    let base = aliases
        .get(name)
        .ok_or_else(|| Error(format!("unknown alias {name}")))?;
    let mut ticket = base.ticket()?;
    ticket.lamport += v["offset"].as_u64().unwrap_or(0);
    Ok(Some(Key::from_ticket(&ticket)))
}
fn required_key(v: &Value, aliases: &BTreeMap<String, Key>) -> Result<Key> {
    key(v, aliases)?.ok_or_else(|| Error("target required".into()))
}
fn attrs(v: &Value) -> Result<Attributes> {
    Ok(if v.is_null() {
        Attributes::new()
    } else {
        serde_json::from_value(v.clone())?
    })
}
fn capture(d: &mut RuntimeDocument) -> Result<Value> {
    let cp: Value = serde_json::from_str(&d.checkpoint()?.to_json()?)?;
    let status = d.history_status()?;
    Ok(
        json!({"model":d.model()?,"state":d.state()?,"history":cp["native"]["history"],"status":{"canUndo":status.can_undo,"canRedo":status.can_redo,"pins":status.pins},"pending":d.pending_changes(),"checkpoint":cp}),
    )
}
fn edit(d: &mut RuntimeDocument, c: &Value, aliases: &mut BTreeMap<String, Key>) -> Result<Change> {
    let parent = key(&c["parent"], aliases)?;
    let after = key(&c["after"], aliases)?;
    let opt = EditOptions {
        caret_before: key(&c["caretBefore"], aliases)?
            .map(|key| key.as_str().to_owned())
            .unwrap_or_default(),
        caret_after: key(&c["caretAfter"], aliases)?
            .map(|key| key.as_str().to_owned())
            .unwrap_or_default(),
        typing: false,
    };
    let time = c["time"].as_f64().unwrap_or(1.);
    let operation = c["op"].as_str().unwrap_or("");
    match operation {
        "insertInline" | "insertGroupMember" => {
            let head = if c["grid"].is_null() {
                RuntimeDocument::flow_head(parent.as_ref())?
            } else {
                RuntimeDocument::cell_head(
                    &required_key(&c["grid"], aliases)?,
                    &required_key(&c["row"], aliases)?,
                    &required_key(&c["col"], aliases)?,
                )?
            };
            let kind = c["kind"]
                .as_str()
                .ok_or_else(|| Error("kind required".into()))?;
            let (id, change) = if operation == "insertInline" {
                d.insert_inline_at(&head, kind, after.as_ref(), attrs(&c["attrs"])?, opt, time)?
            } else {
                d.insert_group_member_at(
                    &head,
                    c["group"]
                        .as_str()
                        .ok_or_else(|| Error("group required".into()))?,
                    kind,
                    after.as_ref(),
                    key(&c["right"], aliases)?.as_ref(),
                    attrs(&c["attrs"])?,
                    opt,
                    time,
                )?
            };
            if let Some(alias) = c["alias"].as_str() {
                aliases.insert(alias.into(), id);
            }
            Ok(change)
        }
        "formatSpan" | "setGroup" => {
            let ids = c["targets"]
                .as_array()
                .ok_or_else(|| Error("targets required".into()))?
                .iter()
                .map(|v| required_key(v, aliases))
                .collect::<Result<Vec<_>>>()?;
            if operation == "formatSpan" {
                d.format_span(
                    &ids,
                    c["kind"].as_str().unwrap(),
                    c["value"].clone(),
                    opt,
                    time,
                )
            } else {
                d.set_group_attribute(
                    &ids,
                    c["group"].as_str().unwrap(),
                    c["key"].as_str().unwrap(),
                    c["value"].clone(),
                    opt,
                    time,
                )
            }
        }
        "insertGrid" => {
            let head = if c["grid"].is_null() {
                RuntimeDocument::flow_head(parent.as_ref())?
            } else {
                RuntimeDocument::cell_head(
                    &required_key(&c["grid"], aliases)?,
                    &required_key(&c["row"], aliases)?,
                    &required_key(&c["col"], aliases)?,
                )?
            };
            let (grid, rows, cols, change) = d.insert_grid_at(
                &head,
                c["kind"].as_str().unwrap(),
                after.as_ref(),
                c["rows"].as_u64().unwrap() as usize,
                c["cols"].as_u64().unwrap() as usize,
                attrs(&c["attrs"])?,
                opt,
                time,
            )?;
            if let Some(alias) = c["alias"].as_str() {
                aliases.insert(alias.into(), grid);
            }
            for (names, keys) in [(&c["rowAliases"], rows), (&c["colAliases"], cols)] {
                for (name, key) in names.as_array().unwrap().iter().zip(keys) {
                    aliases.insert(name.as_str().unwrap().into(), key);
                }
            }
            Ok(change)
        }
        "insertAxis" => {
            let grid = required_key(&c["grid"], aliases)?;
            let (id, change) = if c["axis"] == "rows" {
                d.insert_grid_row(
                    &grid,
                    c["kind"].as_str().unwrap(),
                    after.as_ref(),
                    attrs(&c["attrs"])?,
                    opt,
                    time,
                )?
            } else {
                d.insert_grid_column(&grid, after.as_ref(), opt, time)?
            };
            if let Some(alias) = c["alias"].as_str() {
                aliases.insert(alias.into(), id);
            }
            Ok(change)
        }
        "insertCellBlock" | "insertCellText" | "setCell" | "rejectCell" | "span" | "rejectSpan"
        | "moveToCell" => {
            let grid = required_key(&c["grid"], aliases)?;
            let row = required_key(&c["row"], aliases)?;
            let col = required_key(&c["col"], aliases)?;
            match operation {
                "insertCellBlock" => {
                    let right = key(&c["right"], aliases)?;
                    let (id, change) = d.insert_cell_block(
                        &grid,
                        &row,
                        &col,
                        c["kind"].as_str().unwrap(),
                        after.as_ref(),
                        right.as_ref(),
                        attrs(&c["attrs"])?,
                        opt,
                        time,
                    )?;
                    if let Some(alias) = c["alias"].as_str() {
                        aliases.insert(alias.into(), id);
                    }
                    Ok(change)
                }
                "insertCellText" => {
                    let change = d.insert_cell_text(
                        &grid,
                        &row,
                        &col,
                        after.as_ref(),
                        c["text"].as_str().unwrap(),
                        attrs(&c["marks"])?,
                        opt,
                        time,
                    )?;
                    if let (Some(alias), Some(Op::Text { id, .. })) =
                        (c["alias"].as_str(), change.ops.first())
                    {
                        aliases.insert(alias.into(), Key::from_ticket(id));
                    }
                    Ok(change)
                }
                "setCell" | "rejectCell" => d.set_cell_attribute(
                    &grid,
                    &row,
                    &col,
                    c["key"].as_str().unwrap(),
                    c["value"].clone(),
                    opt,
                    time,
                ),
                "moveToCell" => d.reparent_block_to_cell(
                    &required_key(&c["target"], aliases)?,
                    &grid,
                    &row,
                    &col,
                    after.as_ref(),
                    opt,
                    time,
                ),
                _ => {
                    if c["endRow"].is_null() {
                        d.split_cell(&grid, &row, &col, opt, time)
                    } else {
                        d.merge_cells(
                            &grid,
                            &row,
                            &col,
                            &required_key(&c["endRow"], aliases)?,
                            &required_key(&c["endCol"], aliases)?,
                            opt,
                            time,
                        )
                    }
                }
            }
        }
        "insertBlock" | "rejectChild" => {
            let right = key(&c["right"], aliases)?;
            let (id, change) = d.insert_block_in(
                c["kind"].as_str().unwrap(),
                parent.as_ref(),
                after.as_ref(),
                right.as_ref(),
                attrs(&c["attrs"])?,
                opt,
                time,
            )?;
            if let Some(alias) = c["alias"].as_str() {
                aliases.insert(alias.into(), id);
            }
            Ok(change)
        }
        "insertText" => {
            let head = if c["grid"].is_null() {
                RuntimeDocument::flow_head(parent.as_ref())?
            } else {
                RuntimeDocument::cell_head(
                    &required_key(&c["grid"], aliases)?,
                    &required_key(&c["row"], aliases)?,
                    &required_key(&c["col"], aliases)?,
                )?
            };
            let change = if c["inherit"] == true {
                d.insert_inherited_text_at(
                    &head,
                    after.as_ref(),
                    c["text"].as_str().unwrap(),
                    opt,
                    time,
                )?
            } else {
                d.insert_text_at(
                    &head,
                    after.as_ref(),
                    c["text"].as_str().unwrap(),
                    attrs(&c["marks"])?,
                    opt,
                    time,
                )?
            };
            if let Some(alias) = c["alias"].as_str() {
                if let Some(Op::Text { id, .. }) = change.ops.first() {
                    aliases.insert(alias.into(), Key::from_ticket(id));
                }
            }
            Ok(change)
        }
        "set" | "rejectSet" => d.set_attribute(
            &required_key(&c["target"], aliases)?,
            c["key"].as_str().unwrap(),
            c["value"].clone(),
            opt,
            time,
        ),
        "format" | "delete" => {
            let ids = c["targets"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| required_key(v, aliases))
                .collect::<Result<Vec<_>>>()?;
            if operation == "delete" {
                d.delete(&ids, opt, time)
            } else {
                let at = d.next_ticket()?;
                d.record(
                    vec![Op::Set {
                        at,
                        ids: ids.iter().map(Key::ticket).collect::<Result<_>>()?,
                        key: c["key"].as_str().unwrap().into(),
                        value: c["value"].clone(),
                    }],
                    opt,
                    time,
                )
            }
        }
        "move" | "rejectParent" => d.reparent_block(
            &required_key(&c["target"], aliases)?,
            parent.as_ref(),
            after.as_ref(),
            opt,
            time,
        ),
        "undo" => d.undo(),
        "redo" => d.redo(),
        "rejectOp" => {
            let at = d.next_ticket()?;
            let op = if c["kind"] == "unknownMark" {
                Op::Set {
                    at,
                    ids: vec![required_key(&c["target"], aliases)?.ticket()?],
                    key: c["key"].as_str().unwrap_or("unknown").into(),
                    value: json!(true),
                }
            } else {
                Op::Node {
                    id: at,
                    origin: Key::root().ticket()?,
                    node_type: "unknownType".into(),
                    boundary: String::new(),
                    attrs: None,
                }
            };
            d.record(vec![op], opt, time)
        }
        _ => Err(Error(format!("unknown edit {operation}"))),
    }
}
fn document(v: &Value) -> Result<Value> {
    let schema = RuntimeSchema::compile(v["schema"].clone())?;
    let identity = schema.identity().to_owned();
    let mut docs = [
        RuntimeDocument::new("A", schema.clone())?,
        RuntimeDocument::new("B", schema)?,
    ];
    let mut aliases = BTreeMap::from([("rootHead".into(), Key::root())]);
    let mut changes: BTreeMap<String, Change> = BTreeMap::new();
    let mut selections: BTreeMap<String, Option<Selection<Key>>> = BTreeMap::new();
    let mut trace = vec![];
    for c in v["commands"].as_array().unwrap() {
        let index = if c["actor"] == "B" { 1 } else { 0 };
        let operation = c["op"].as_str().unwrap();
        let mut ops = vec![];
        let mut selection = None;
        match operation {
            "selectionStable" => {
                let range: Option<Selection<Position>> =
                    serde_json::from_value(c["range"].clone())?;
                let anchors = docs[index].capture_selection(range)?;
                selections.insert(c["name"].as_str().unwrap().into(), anchors.clone());
                let resolved = docs[index].resolve_selection(anchors.clone())?;
                selection = Some(json!({"anchors":anchors,"resolved":resolved}));
            }
            "resolveSelection" => {
                let anchors = selections
                    .get(c["name"].as_str().unwrap())
                    .ok_or_else(|| Error("selection missing".into()))?
                    .clone();
                let resolved = docs[index].resolve_selection(anchors.clone())?;
                selection = Some(json!({"anchors":anchors,"resolved":resolved}));
            }
            "selection" => {
                let range: Option<Selection<Position>> =
                    serde_json::from_value(c["range"].clone())?;
                let anchors = docs[index].capture_selection(range)?;
                let resolved = docs[index].resolve_selection(anchors.clone())?;
                selection = Some(json!({"anchors":anchors,"resolved":resolved}));
            }
            "capture" => {}
            "deliver" => {
                let from = if c["from"] == "B" { 1 } else { 0 };
                let to = if c["to"] == "B" { 1 } else { 0 };
                let deliveries = if c["change"] == "pending" {
                    docs[from].pending_changes().to_vec()
                } else {
                    vec![changes
                        .get(c["change"].as_str().unwrap())
                        .ok_or_else(|| Error("change alias missing".into()))?
                        .clone()]
                };
                for _ in 0..c["repeat"].as_u64().unwrap_or(1) {
                    for change in &deliveries {
                        docs[to].apply_remote(&change.ops)?;
                        if c["self"] == true {
                            docs[from].apply_remote(&change.ops)?;
                        }
                    }
                }
            }
            "checkpoint" => {
                docs[index] = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
                    &docs[index].checkpoint()?.to_json()?,
                )?)?;
            }
            "ack" => {
                let pending = docs[index].pending_changes().to_vec();
                docs[index].acknowledge(&pending)?;
            }
            "rejectAck" => {
                let before = docs[index].checkpoint()?.to_json()?;
                let mut pending = docs[index].pending_changes().to_vec();
                pending.push(Change {
                    ops: vec![],
                    caret: None,
                });
                assert!(docs[index].acknowledge(&pending).is_err());
                assert_eq!(before, docs[index].checkpoint()?.to_json()?);
            }
            "rejectCheckpoint" => {
                let before = docs[index].checkpoint()?.to_json()?;
                let mut bad: Value = serde_json::from_str(&before)?;
                match c["kind"].as_str().unwrap() {
                    "historyVersion" => bad["native"]["history"]["version"] = json!(2),
                    "schema" => bad["native"]["document"]["schema"] = json!("unknown"),
                    _ => {
                        let id = docs[index].next_ticket()?;
                        bad["pending"] = json!([Change {
                            ops: vec![Op::Text {
                                id,
                                origin: Key::root().ticket()?,
                                units: Utf16Text::from("unsent"),
                                marks: Attributes::new(),
                            }],
                            caret: None
                        }]);
                    }
                }
                assert!(RuntimeCheckpoint::from_json(&bad.to_string()).is_err());
                assert_eq!(before, docs[index].checkpoint()?.to_json()?);
            }
            _ => {
                let before = docs[index].checkpoint()?.to_json()?;
                let result = edit(&mut docs[index], c, &mut aliases);
                if operation.starts_with("reject") {
                    assert!(result.is_err(), "{} should reject", c["label"]);
                    assert_eq!(before, docs[index].checkpoint()?.to_json()?);
                } else {
                    let change = result?;
                    ops = change.ops.clone();
                    if let Some(alias) = c["change"].as_str() {
                        changes.insert(alias.into(), change);
                    }
                }
            }
        }
        let mut row = json!({"label":c["label"],"ops":ops,"A":capture(&mut docs[0])?,"B":capture(&mut docs[1])?});
        if let Some(selection) = selection {
            row["selection"] = selection;
        }
        trace.push(row);
    }
    Ok(json!({"name":v["name"],"identity":identity,"trace":trace}))
}
fn main() -> Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let v: Value = serde_json::from_str(&input)?;
    let output = v["documents"]
        .as_array()
        .unwrap()
        .iter()
        .map(document)
        .collect::<Result<Vec<_>>>()?;
    let unsupported = v["unsupported"]
        .as_array()
        .map(|entries| {
            entries.iter().map(|entry| {
        let result = RuntimeSchema::compile(entry["schema"].clone());
        json!({"name":entry["name"],"rejected":result.is_err(),"error":result.err().map(|e|e.0)})
    }).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    println!("{}", json!({"documents":output,"unsupported":unsupported}));
    Ok(())
}
