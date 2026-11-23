//! Independently author text:false semantic commands through native SDK APIs.
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
// The semantic fixture means "after this block" even when it names its last
// character. SDK movement takes an explicit block marker or physical source head.
fn block_after(d: &mut RuntimeDocument, after: Option<Key>) -> Result<Option<Key>> {
    let Some(after) = after else {
        return Ok(None);
    };
    let state = d.state()?;
    if let Some(lines) = state["lines"].as_array() {
        for line in lines {
            let Some(items) = line["items"].as_array() else {
                continue;
            };
            let Some(index) = items
                .iter()
                .position(|item| item["id"] == json!(after.ticket().ok()))
            else {
                continue;
            };
            if items[index]["kind"] != "char" {
                break;
            }
            for item in items[..=index].iter().rev() {
                if item["kind"] != "node" {
                    continue;
                }
                let kind = item["attrs"]["$type"]["value"]
                    .as_str()
                    .or_else(|| item["born"].as_str())
                    .unwrap_or("");
                if d.schema().manifest()["nodes"][kind]["shape"] == "inline" {
                    continue;
                }
                return Ok(Some(Key::from_ticket(&serde_json::from_value(
                    item["id"].clone(),
                )?)));
            }
        }
    }
    Ok(Some(after))
}
fn runtime_value(schema: &RuntimeSchema, value: &Value) -> Result<SchemaValue> {
    if let Some(raw) = value.get("$json") {
        return Ok(SchemaValue::json(raw.clone()));
    }
    let Some(source) = value.get("$ref").and_then(Value::as_str) else {
        return Ok(SchemaValue::json(value.clone()));
    };
    let at = value["at"]
        .as_str()
        .ok_or_else(|| Error("reference path missing".into()))?;
    let mut parts = at.split('.').collect::<Vec<_>>();
    let tail = parts
        .pop()
        .ok_or_else(|| Error("reference path missing".into()))?;
    let index = match (source, tail) {
        ("default", "default") => None,
        ("enum", "values") => Some(
            value["index"]
                .as_u64()
                .ok_or_else(|| Error("reference enum index missing".into()))? as usize,
        ),
        _ => return Err(Error("reference source/path mismatch".into())),
    };
    schema.reference_value(&parts, index)
}
fn runtime_attrs(schema: &RuntimeSchema, value: &Value) -> Result<SchemaAttributes> {
    if value.is_null() {
        return Ok(SchemaAttributes::new());
    }
    value
        .as_object()
        .ok_or_else(|| Error("attributes object required".into()))?
        .iter()
        .map(|(key, value)| Ok((key.clone(), runtime_value(schema, value)?)))
        .collect()
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
        "rawNode" => {
            let id = d.next_ticket()?;
            let origin = after
                .as_ref()
                .unwrap_or(&RuntimeDocument::flow_head(parent.as_ref())?)
                .ticket()?;
            let right = key(&c["right"], aliases)?;
            let boundary = right
                .as_ref()
                .map(|right| format!("{}|{}", Key::from_ticket(&origin).as_str(), right.as_str()))
                .unwrap_or_default();
            let change = d.record(
                vec![Op::Node {
                    id: id.clone(),
                    origin,
                    node_type: c["kind"]
                        .as_str()
                        .ok_or_else(|| Error("raw node kind required".into()))?
                        .into(),
                    boundary,
                    attrs: Some(attrs(&c["attrs"])?),
                }],
                opt,
                time,
            )?;
            if let Some(alias) = c["alias"].as_str() {
                aliases.insert(alias.into(), Key::from_ticket(&id));
            }
            Ok(change)
        }
        "flowHead" => {
            let alias = c["alias"]
                .as_str()
                .ok_or_else(|| Error("flow head alias required".into()))?;
            aliases.insert(alias.into(), RuntimeDocument::flow_head(parent.as_ref())?);
            Ok(Change {
                ops: vec![],
                caret: None,
            })
        }
        "rawMove" => {
            let at = d.next_ticket()?;
            d.record(
                vec![Op::Move {
                    at,
                    target: required_key(&c["target"], aliases)?.ticket()?,
                    parent: RuntimeDocument::flow_head(parent.as_ref())?.ticket()?,
                    after: after.as_ref().map(Key::ticket).transpose()?,
                }],
                opt,
                time,
            )
        }
        "insertParagraph" | "rejectParagraph" | "insertModel" | "rejectModel" => {
            let at: Vec<usize> = serde_json::from_value(c["at"].clone())?;
            let (id, change) = if operation.ends_with("Paragraph") {
                d.insert_paragraph_at(&at, c["model"].clone(), opt, time)?
            } else {
                d.insert_model_at(&at, c["model"].clone(), opt, time)?
            };
            let kind = c["model"]["type"].as_str().unwrap_or("");
            if d.schema().manifest()["nodes"][kind]["shape"] == "grid" {
                let row_kind = d.schema().manifest()["nodes"][kind]["children"][0]
                    .as_str()
                    .unwrap();
                let row_ids = change.ops.iter().filter_map(|op| match op.raw_operation() {
                    Op::Node { id, node_type, .. } if node_type == row_kind => {
                        Some(Key::from_ticket(id))
                    }
                    _ => None,
                });
                for (alias, key) in c["rowAliases"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .zip(row_ids)
                {
                    aliases.insert(alias.as_str().unwrap().into(), key);
                }
                let col_ids = change.ops.iter().filter_map(|op| match op.raw_operation() {
                    Op::Node { id, node_type, .. } if node_type == "col" => {
                        Some(Key::from_ticket(id))
                    }
                    _ => None,
                });
                for (alias, key) in c["colAliases"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .zip(col_ids)
                {
                    aliases.insert(alias.as_str().unwrap().into(), key);
                }
            }
            if let Some(alias) = c["alias"].as_str() {
                aliases.insert(alias.into(), id);
            }
            Ok(change)
        }
        "rawSet" => {
            let at = d.next_ticket()?;
            d.record(
                vec![Op::Set {
                    at,
                    ids: vec![required_key(&c["target"], aliases)?.ticket()?],
                    key: c["key"].as_str().unwrap_or("$type").into(),
                    value: c["value"].clone(),
                }],
                opt,
                time,
            )
        }
        "rawText" | "rejectRawText" | "rejectMixedBatch" => {
            let mut at = d.next_ticket()?;
            let mut batch = vec![];
            if operation == "rejectMixedBatch" {
                batch.push(Op::Set {
                    at: at.clone(),
                    ids: vec![required_key(&c["target"], aliases)?.ticket()?],
                    key: c["key"].as_str().unwrap_or("$type").into(),
                    value: c["value"].clone(),
                });
                at.lamport += 1;
            }
            batch.push(Op::Text {
                id: at,
                origin: after
                    .as_ref()
                    .unwrap_or(&RuntimeDocument::flow_head(parent.as_ref())?)
                    .ticket()?,
                units: Utf16Text::from(c["text"].as_str().unwrap_or("x")),
                marks: attrs(&c["marks"])?,
            });
            let change = d.record(batch, opt, time)?;
            if let Some(alias) = c["alias"].as_str() {
                if let Some(Op::Text { id, .. }) = change.ops.last().map(Op::raw_operation) {
                    aliases.insert(alias.into(), Key::from_ticket(id));
                }
            }
            Ok(change)
        }
        "rejectRequired" => {
            let parent_head = RuntimeDocument::flow_head(parent.as_ref())?;
            let head = RuntimeDocument::required_head(
                &parent_head,
                c["kind"].as_str().unwrap(),
                c["ordinal"].as_u64().unwrap_or(0) as usize,
            )?;
            let mut origin = head.ticket()?;
            origin.lamport = c["variant"].as_u64().unwrap_or(0);
            let id = d.next_ticket()?;
            d.record(
                vec![Op::Text {
                    id,
                    origin,
                    units: Utf16Text::from("x"),
                    marks: Attributes::new(),
                }],
                opt,
                time,
            )
        }
        "required" => {
            let parent_head = RuntimeDocument::flow_head(parent.as_ref())?;
            let kind = c["kind"]
                .as_str()
                .ok_or_else(|| Error("required kind missing".into()))?;
            let ordinal = c["ordinal"].as_u64().unwrap_or(0) as usize;
            if let Some(name) = c["alias"].as_str() {
                aliases.insert(name.into(), d.required_node(&parent_head, kind, ordinal)?);
            }
            if let Some(name) = c["headAlias"].as_str() {
                aliases.insert(
                    name.into(),
                    RuntimeDocument::required_head(&parent_head, kind, ordinal)?,
                );
            }
            for (field, lamport) in [("rowAlias", 2), ("colAlias", 3)] {
                if let Some(name) = c[field].as_str() {
                    let mut ticket =
                        RuntimeDocument::required_head(&parent_head, kind, ordinal)?.ticket()?;
                    ticket.lamport = lamport;
                    aliases.insert(name.into(), Key::from_ticket(&ticket));
                }
            }
            Ok(Change {
                ops: vec![],
                caret: None,
            })
        }
        "setFields" | "rejectFields" => d.set_runtime_attributes(
            &required_key(&c["target"], aliases)?,
            runtime_attrs(d.schema(), &c["attrs"])?,
            opt,
            time,
        ),
        "setField" | "rejectField" => {
            let path = c["path"]
                .as_array()
                .ok_or_else(|| Error("field path missing".into()))?
                .iter()
                .map(|v| {
                    v.as_str()
                        .ok_or_else(|| Error("field segment missing".into()))
                })
                .collect::<Result<Vec<_>>>()?;
            d.set_field_path(
                &required_key(&c["target"], aliases)?,
                c["key"].as_str().unwrap(),
                &path,
                c["value"].clone(),
                opt,
                time,
            )
        }
        "insertInline" | "insertGroupMember" => {
            let head = if c["grid"].is_null() {
                if after
                    .as_ref()
                    .is_some_and(|key| key.as_str().starts_with("0@~required:"))
                {
                    after.clone().unwrap()
                } else {
                    RuntimeDocument::flow_head(parent.as_ref())?
                }
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
                d.insert_runtime_inline_at(
                    &head,
                    kind,
                    after.as_ref(),
                    runtime_attrs(d.schema(), &c["attrs"])?,
                    opt,
                    time,
                )?
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
                let mark = d.schema().manifest()["nodes"][c["kind"].as_str().unwrap()]["mark"]
                    .as_str()
                    .ok_or_else(|| Error("span mark missing".into()))?
                    .to_owned();
                d.format_runtime_tokens(
                    &ids,
                    &mark,
                    runtime_value(d.schema(), &c["value"])?,
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
                if after
                    .as_ref()
                    .is_some_and(|key| key.as_str().starts_with("0@~required:"))
                {
                    after.clone().unwrap()
                } else {
                    RuntimeDocument::flow_head(parent.as_ref())?
                }
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
                    if let (Some(alias), Some(Op::Text { id, .. })) = (
                        c["alias"].as_str(),
                        change.ops.first().map(Op::raw_operation),
                    ) {
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
            let (id, change) = d.insert_runtime_block_in(
                c["kind"].as_str().unwrap(),
                parent.as_ref(),
                after.as_ref(),
                right.as_ref(),
                runtime_attrs(d.schema(), &c["attrs"])?,
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
                if let Some(after) = &after {
                    let state = d.state()?;
                    let source = state["lines"]
                        .as_array()
                        .and_then(|lines| {
                            lines.iter().find(|line| {
                                line["items"].as_array().is_some_and(|items| {
                                    items
                                        .iter()
                                        .any(|item| item["id"] == json!(after.ticket().ok()))
                                })
                            })
                        })
                        .and_then(|line| line["key"].as_str())
                        .ok_or_else(|| Error("text alias source missing".into()))?;
                    Key::parse(source)?
                } else {
                    RuntimeDocument::flow_head(parent.as_ref())?
                }
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
                d.insert_runtime_text_at(
                    &head,
                    after.as_ref(),
                    c["text"].as_str().unwrap(),
                    runtime_attrs(d.schema(), &c["marks"])?,
                    opt,
                    time,
                )?
            };
            if let Some(alias) = c["alias"].as_str() {
                if let Some(Op::Text { id, .. }) = change.ops.first().map(Op::raw_operation) {
                    aliases.insert(alias.into(), Key::from_ticket(id));
                }
            }
            Ok(change)
        }
        "set" | "rejectSet" => d.set_runtime_attribute(
            &required_key(&c["target"], aliases)?,
            c["key"].as_str().unwrap(),
            runtime_value(d.schema(), &c["value"])?,
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
                if ids.len() != 1 {
                    return Err(Error("single block delete required".into()));
                }
                d.delete_block(&ids[0], opt, time)
            } else {
                let at = d.next_ticket()?;
                let value = runtime_value(d.schema(), &c["value"])?;
                d.record(
                    vec![value.bind(
                        Op::Set {
                            at,
                            ids: ids.iter().map(Key::ticket).collect::<Result<_>>()?,
                            key: c["key"].as_str().unwrap().into(),
                            value: value.value().clone(),
                        },
                        &["value"],
                    )?],
                    opt,
                    time,
                )
            }
        }
        "move" | "rejectParent" | "rejectRequiredMove" => {
            let after = block_after(d, after)?;
            d.reparent_block(
                &required_key(&c["target"], aliases)?,
                parent.as_ref(),
                after.as_ref(),
                opt,
                time,
            )
        }
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
                    for original in &deliveries {
                        // Round-trip the versioned native envelope. This is a native
                        // peer protocol; it does not reconstruct JavaScript references.
                        let change: Change =
                            serde_json::from_str(&serde_json::to_string(original)?)?;
                        assert_eq!(&change, original);
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
                    let change = result.map_err(|error| {
                        Error(format!("{}/{}: {}", v["name"], c["label"], error.0))
                    })?;
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
