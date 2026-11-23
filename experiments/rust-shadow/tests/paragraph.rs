use doc_sync_rust_shadow::{Server, FORMAT, PARAGRAPH_CAPABILITY, PARAGRAPH_FORMAT, SCHEMA};
use serde_json::{json, Value};
fn t(n: u64, a: &str) -> Value {
    json!({"lamport":n,"actor":a})
}
fn root() -> Value {
    t(0, "~root")
}
fn text(n: u64, a: &str, origin: Value, units: Vec<u16>) -> Value {
    json!({"t":"text","id":t(n,a),"origin":origin,"units":units})
}
fn node(n: u64, a: &str, left: Value, right: &str) -> Value {
    json!({"t":"node","id":t(n,a),"origin":left,"type":"paragraph","boundary":format!("{}@{}|{}",left["lamport"],left["actor"].as_str().unwrap(),right)})
}
fn request(s: &mut Server, mut v: Value) -> Value {
    v["replica"] = json!("r");
    v["schema"] = json!(SCHEMA);
    s.request(v)
}
fn new(actor: &str, paragraphs: bool) -> Server {
    let mut s = Server::default();
    let mut v = json!({"cmd":"new","actor":actor});
    if paragraphs {
        v["capabilities"] = json!([PARAGRAPH_CAPABILITY]);
    }
    assert_eq!(request(&mut s, v)["ok"], true);
    s
}
fn apply(s: &mut Server, ops: Vec<Value>) -> Value {
    request(s, json!({"cmd":"apply","ops":ops}))
}
fn local(s: &mut Server, ops: Vec<Value>) -> Value {
    request(
        s,
        json!({"cmd":"history_record","ops":ops,"now":1000,"options":{"caretBefore":"before","caretAfter":"after"}}),
    )
}
fn command(s: &mut Server, cmd: &str) -> Value {
    request(s, json!({"cmd":cmd}))
}
fn checkpoint(s: &mut Server) -> Value {
    command(s, "history_export")["checkpoint"].clone()
}
fn units(state: &Value) -> Vec<Vec<u16>> {
    state["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| serde_json::from_value(b["textUnits"].clone()).unwrap())
        .collect()
}
fn seed(s: &mut Server) {
    assert_eq!(
        apply(s, vec![text(1, "A", root(), vec![97, 98, 99, 100])])["ok"],
        true
    );
}
#[test]
fn marker_capability_preserves_base_contract_and_fails_closed() {
    let mut s = new("A", false);
    seed(&mut s);
    let before = checkpoint(&mut s);
    assert_eq!(
        apply(&mut s, vec![node(5, "A", t(2, "A"), "3@A")])["ok"],
        false
    );
    assert_eq!(checkpoint(&mut s), before);
    assert!(command(&mut s, "state")["state"].get("blocks").is_none());
    assert_eq!(before["document"]["format"], FORMAT);
    assert!(before["document"].get("capabilities").is_none());
    for capabilities in [
        json!([]),
        json!(["unknown"]),
        json!([PARAGRAPH_CAPABILITY, PARAGRAPH_CAPABILITY]),
        Value::Null,
    ] {
        let mut fresh = Server::default();
        assert_eq!(
            request(
                &mut fresh,
                json!({"cmd":"new","actor":"A","capabilities":capabilities})
            )["ok"],
            false
        );
    }
}
#[test]
fn split_merge_history_uses_node_identity_and_own_deletion_ticket() {
    let mut s = new("A", true);
    seed(&mut s);
    let split = node(5, "A", t(2, "A"), "3@A");
    let r = local(&mut s, vec![split.clone()]);
    assert_eq!(units(&r["state"]), vec![vec![97, 98], vec![99, 100]]);
    let marker = r["state"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["id"] == t(5, "A"))
        .unwrap();
    assert_eq!(marker["born"], "paragraph");
    assert_eq!(marker["boundary"], "2@A|3@A");
    assert_eq!(
        marker["attrs"],
        json!({"$type":{"value":"paragraph","at":t(5,"A")}})
    );
    let r = command(&mut s, "history_undo");
    assert_eq!(
        r["ops"],
        json!([{"t":"del","at":t(6,"A"),"ids":[t(5,"A")]}])
    );
    assert_eq!(units(&r["state"]), vec![vec![97, 98, 99, 100]]);
    assert_eq!(r["status"]["pins"], json!(["6@A"]));
    let r = command(&mut s, "history_redo");
    assert_eq!(
        r["ops"],
        json!([{"t":"undel","at":t(7,"A"),"ids":[t(5,"A")],"cancels":[t(6,"A")]}])
    );
    assert_eq!(units(&r["state"]), vec![vec![97, 98], vec![99, 100]]);
    local(
        &mut s,
        vec![json!({"t":"del","at":t(8,"A"),"ids":[t(5,"A")]})],
    );
    apply(
        &mut s,
        vec![json!({"t":"del","at":t(9,"B"),"ids":[t(5,"A")]})],
    );
    let r = command(&mut s, "history_undo");
    assert_eq!(r["ops"][0]["cancels"], json!([t(8, "A")]));
    assert_eq!(units(&r["state"]), vec![vec![97, 98, 99, 100]]);
    assert_eq!(apply(&mut s, vec![split])["ok"], true);
    assert_eq!(
        units(&command(&mut s, "state")["state"]),
        vec![vec![97, 98, 99, 100]]
    );
}
#[test]
fn concurrent_boundary_aliases_re_elect_primary_and_restore_all_markers() {
    let mut s = new("A", true);
    seed(&mut s);
    let a = node(5, "A", t(2, "A"), "3@A");
    let b = node(5, "B", t(2, "A"), "3@A");
    let c = node(5, "C", t(2, "A"), "3@A");
    let r = apply(&mut s, vec![a.clone(), b.clone(), c.clone(), c, b, a]);
    assert_eq!(r["ok"], true);
    assert_eq!(units(&r["state"]), vec![vec![97, 98], vec![99, 100]]);
    assert_eq!(r["state"]["blocks"][1]["marker"], "5@C");
    assert_eq!(r["state"]["blocks"][1]["aliases"], json!(["5@B", "5@A"]));
    let r = apply(
        &mut s,
        vec![json!({"t":"del","at":t(6,"C"),"ids":[t(5,"C")]})],
    );
    assert_eq!(r["state"]["blocks"][1]["marker"], "5@B");
    assert_eq!(r["state"]["blocks"][1]["aliases"], json!(["5@A"]));
    let r = local(
        &mut s,
        vec![json!({"t":"del","at":t(7,"A"),"ids":[t(5,"B"),t(5,"A")]})],
    );
    assert_eq!(units(&r["state"]), vec![vec![97, 98, 99, 100]]);
    let saved = checkpoint(&mut s);
    assert_eq!(
        request(&mut s, json!({"cmd":"history_restore","checkpoint":saved}))["ok"],
        true
    );
    let r = command(&mut s, "history_undo");
    assert_eq!(r["ops"][0]["cancels"], json!([t(7, "A")]));
    assert_eq!(r["state"]["blocks"][1]["marker"], "5@B");
    assert_eq!(r["state"]["blocks"][1]["aliases"], json!(["5@A"]));
}
#[test]
fn separated_alias_does_not_change_current_block_or_gain_direct_anchor_position() {
    let mut s = new("B", true);
    seed(&mut s);
    apply(
        &mut s,
        vec![
            node(5, "A", t(2, "A"), "3@A"),
            node(5, "B", t(2, "A"), "3@A"),
        ],
    );
    let r = local(&mut s, vec![node(6, "B", t(5, "B"), "3@A")]);
    assert_eq!(
        units(&r["state"]),
        vec![vec![97, 98], vec![], vec![99, 100]]
    );
    assert_eq!(r["state"]["blocks"][1]["aliases"], json!(["5@A"]));
    let pos = request(
        &mut s,
        json!({"cmd":"anchor_resolve","anchor":"5@A","strict":true}),
    );
    assert_eq!(pos["paragraph"], 2);
    assert_eq!(pos["offset"], 0);
    let range = request(
        &mut s,
        json!({"cmd":"selection_capture","range":{"anchor":[2,2],"focus":[1,0]}}),
    );
    assert_eq!(range["range"], json!({"anchor":"4@A","focus":"5@B"}));
    assert_eq!(
        request(
            &mut s,
            json!({"cmd":"selection_resolve","range":{"anchor":"5@A","focus":"5@B"}})
        )["range"],
        json!({"anchor":[2,0],"focus":[1,0]})
    );
    command(&mut s, "history_undo");
    let pos = request(&mut s, json!({"cmd":"anchor_resolve","anchor":"6@B"}));
    assert_eq!(pos["paragraph"], 1);
    assert_eq!(pos["offset"], 0);
}
#[test]
fn empty_paragraphs_and_surrogate_boundaries_preserve_model_and_paths() {
    let mut s = new("A", true);
    apply(&mut s, vec![text(1, "A", root(), vec![0xd83d, 0xde00])]);
    local(&mut s, vec![node(3, "A", root(), "1@A")]);
    local(&mut s, vec![node(4, "A", t(1, "A"), "2@A")]);
    local(&mut s, vec![node(5, "A", t(2, "A"), "end")]);
    let state = command(&mut s, "state")["state"].clone();
    assert_eq!(
        units(&state),
        vec![vec![], vec![0xd83d], vec![0xde00], vec![]]
    );
    for (paragraph, offset, anchor) in [
        (0, 0, "0@~root"),
        (1, 0, "3@A"),
        (1, 1, "1@A"),
        (2, 0, "4@A"),
        (2, 1, "2@A"),
        (3, 0, "5@A"),
    ] {
        assert_eq!(
            request(
                &mut s,
                json!({"cmd":"anchor_capture","paragraph":paragraph,"offset":offset})
            )["anchor"],
            anchor
        );
        let pos = request(&mut s, json!({"cmd":"anchor_resolve","anchor":anchor}));
        assert_eq!(pos["paragraph"], paragraph);
        assert_eq!(pos["offset"], offset);
    }
}
#[test]
fn snapshot_v2_is_explicit_restores_v1_separately_and_rejects_corruption_atomically() {
    let mut s = new("A", true);
    seed(&mut s);
    local(&mut s, vec![node(5, "A", t(2, "A"), "3@A")]);
    local(
        &mut s,
        vec![json!({"t":"set","at":t(6,"A"),"ids":[t(1,"A")],"key":"bold","value":true})],
    );
    let saved = checkpoint(&mut s);
    assert_eq!(saved["document"]["format"], PARAGRAPH_FORMAT);
    assert_eq!(
        saved["document"]["capabilities"],
        json!([PARAGRAPH_CAPABILITY])
    );
    let mut bads = vec![];
    for capabilities in [json!([]), json!(["unknown"]), Value::Null] {
        let mut c = saved.clone();
        c["document"]["capabilities"] = capabilities;
        bads.push(c);
    }
    let marker = saved["document"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .position(|v| v["id"] == t(5, "A"))
        .unwrap();
    let mut c = saved.clone();
    c["document"]["format"] = json!(FORMAT);
    bads.push(c);
    let mut c = saved.clone();
    c["document"]["items"][marker]["node"]["born"] = json!("table");
    bads.push(c);
    let mut c = saved.clone();
    c["document"]["items"][marker]["node"]["boundary"] = json!("root");
    bads.push(c);
    let mut c = saved.clone();
    c["document"]["items"][marker]["node"]["type_at"] = t(6, "A");
    bads.push(c);
    let mut c = saved.clone();
    c["document"]["items"][marker]["unit"] = json!(99);
    bads.push(c);
    let mut c = saved.clone();
    c["document"]["items"][marker]["node"] = Value::Null;
    bads.push(c);
    let mut c = saved.clone();
    c["document"]["items"][0]["node"] = saved["document"]["items"][marker]["node"].clone();
    bads.push(c);
    let mut c = saved.clone();
    c["history"]["undo"][1]["steps"][0]["targets"][0]["id"] = t(5, "A");
    c["history"]["undo"][1]["steps"][0]["targets"][0]["slot"] = json!("[\"5@A\",\"bold\"]");
    c["history"]["currentSets"][0][0] = json!("[\"5@A\",\"bold\"]");
    bads.push(c);
    for c in bads {
        assert_eq!(
            request(&mut s, json!({"cmd":"history_restore","checkpoint":c}))["ok"],
            false
        );
        assert_eq!(checkpoint(&mut s), saved);
    }
    assert_eq!(
        request(
            &mut s,
            json!({"cmd":"history_restore","checkpoint":saved.clone()})
        )["ok"],
        true
    );
    let mut old = new("A", false);
    seed(&mut old);
    let old = checkpoint(&mut old);
    assert_eq!(
        request(
            &mut s,
            json!({"cmd":"history_restore","checkpoint":old.clone()})
        )["ok"],
        true
    );
    assert_eq!(checkpoint(&mut s), old);
    let mut c = old.clone();
    c["document"]["capabilities"] = json!([]);
    assert_eq!(
        request(&mut s, json!({"cmd":"history_restore","checkpoint":c}))["ok"],
        false
    );
    assert_eq!(checkpoint(&mut s), old);
}
#[test]
fn unsupported_markers_and_mutations_reject_whole_batch_with_history_unchanged() {
    let mut s = new("A", true);
    seed(&mut s);
    local(&mut s, vec![node(5, "A", t(2, "A"), "3@A")]);
    let saved = checkpoint(&mut s);
    let mut invalid = vec![];
    for boundary in [
        "root",
        "",
        "virtual:2@A|3@A",
        "split:{}",
        "2@A|99@missing",
        "1@A|3@A",
    ] {
        let mut op = node(7, "A", t(2, "A"), "3@A");
        op["boundary"] = json!(boundary);
        invalid.push(op);
    }
    let mut op = node(7, "A", t(2, "A"), "3@A");
    op["type"] = json!("table");
    invalid.push(op);
    let mut op = node(7, "A", t(2, "A"), "3@A");
    op["attrs"] = json!({"bold":true});
    invalid.push(op);
    invalid.push(json!({"t":"set","at":t(7,"A"),"ids":[t(5,"A")],"key":"bold","value":true}));
    invalid
        .push(json!({"t":"set","at":t(7,"A"),"ids":[t(5,"A")],"key":"$type","value":"paragraph"}));
    invalid.push(json!({"t":"move"}));
    for op in invalid {
        assert_eq!(
            local(&mut s, vec![text(6, "A", t(4, "A"), vec![101]), op])["ok"],
            false
        );
        assert_eq!(checkpoint(&mut s), saved);
    }
    let mut conflicting = node(5, "A", t(2, "A"), "end");
    conflicting["attrs"] = json!({});
    assert_eq!(apply(&mut s, vec![conflicting])["ok"], false);
    assert_eq!(checkpoint(&mut s), saved);
}
#[test]
fn boundary_actor_delimiters_and_js_ticket_order_are_preserved() {
    let actor = "a|b@c";
    let mut s = new(actor, true);
    apply(&mut s, vec![text(1, actor, root(), vec![97, 98])]);
    let right = format!("2@{actor}");
    let op = node(3, actor, t(1, actor), &right);
    let r = local(&mut s, vec![op]);
    assert_eq!(r["ok"], true);
    assert_eq!(units(&r["state"]), vec![vec![97], vec![98]]);
    let saved = checkpoint(&mut s);
    assert_eq!(
        request(
            &mut s,
            json!({"cmd":"history_restore","checkpoint":saved.clone()})
        )["ok"],
        true
    );
    assert_eq!(checkpoint(&mut s), saved);
}
