use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn schema() -> RuntimeSchema {
    RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box","list","table"],"default":"p"},
        "p":{"shape":"text"},"box":{"shape":"flow","children":["p","box","list","table"],"default":"p"},
        "list":{"shape":"group","children":["item"],"by":["bucket"]},
        "item":{"shape":"text","attrs":{"bucket":{"default":"plain"}}},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["p"],"default":"p"}
    }})).unwrap()
}
fn p(s: &str) -> Value {
    json!({"type":"p","runs":[{"text":s}]})
}
fn cp(doc: &mut RuntimeDocument) -> String {
    doc.checkpoint().unwrap().to_json().unwrap()
}
fn add(doc: &mut RuntimeDocument, at: &[usize], model: Value) -> Key {
    doc.insert_model_at(at, model, EditOptions::default(), 1.)
        .unwrap()
        .0
}
fn rel(target: RelativeModelTarget, model: Value) -> RelativeModelInsert {
    RelativeModelInsert { target, model }
}
fn end() -> RelativeModelTarget {
    RelativeModelTarget::InsideEnd(FlowTarget::Root)
}
fn apply(
    doc: &mut RuntimeDocument,
    base: &ModelEditBase,
    commands: &[RelativeModelInsert],
) -> ModelInsertBatchResult {
    doc.insert_models_relative(base, commands, EditOptions::default(), 2.)
        .unwrap()
}
fn units(node: &Value) -> Vec<u16> {
    node["runs"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|run| run["units"].as_array().into_iter().flatten())
        .map(|n| n.as_u64().unwrap() as u16)
        .collect()
}

#[test]
fn sequential_identity_inserts_are_one_history_change_and_resolve_again() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let key = add(&mut doc, &[1], p("K"));
    let read = doc.read_model_for_edit().unwrap();
    let pending = doc.pending_changes().len();
    let result = apply(
        &mut doc,
        &read.base,
        &[
            rel(RelativeModelTarget::After(key.clone()), p("first")),
            rel(RelativeModelTarget::After(key), p("second")),
        ],
    );
    let model = doc.model().unwrap();
    assert_eq!(
        units(&model["children"][2]),
        "second".encode_utf16().collect::<Vec<_>>()
    );
    assert_eq!(
        units(&model["children"][3]),
        "first".encode_utf16().collect::<Vec<_>>()
    );
    assert_eq!(doc.pending_changes().len(), pending + 1);
    assert_eq!(doc.pending_changes().last(), Some(&result.change));
    doc.undo().unwrap();
    assert_eq!(doc.model().unwrap(), read.model);
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), model);
    let before = cp(&mut doc);
    assert!(doc
        .insert_models_relative(&read.base, &[], EditOptions::default(), 3.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn old_base_rejects_lower_clock_remote_change_without_lamport_growth() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    add(&mut doc, &[1], p(&"x".repeat(100)));
    let read = doc.read_model_for_edit().unwrap();
    let clock = doc.observed_clock().unwrap();
    doc.apply_remote(&[Op::Text {
        id: Ticket {
            lamport: 1,
            actor: "B".into(),
        },
        origin: Key::root().ticket().unwrap(),
        units: Utf16Text::from("foreign"),
        marks: Attributes::new(),
    }])
    .unwrap();
    assert_eq!(doc.observed_clock().unwrap(), clock);
    assert_ne!(doc.model().unwrap(), read.model);
    let before = cp(&mut doc);
    let error = doc
        .insert_models_relative(
            &read.base,
            &[rel(end(), p("wrong"))],
            EditOptions::default(),
            2.,
        )
        .unwrap_err();
    assert!(error.0.contains("stale"));
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn reads_and_ack_preserve_base_failures_preserve_base_and_checkpoint() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    add(&mut doc, &[1], p("seed"));
    let read = doc.read_model_for_edit().unwrap();
    doc.state().unwrap();
    doc.model().unwrap();
    doc.history_status().unwrap();
    doc.checkpoint().unwrap();
    doc.acknowledge(&doc.pending_changes().to_vec()).unwrap();
    let before = cp(&mut doc);
    let invalid = Op::Node {
        id: Ticket {
            lamport: 999,
            actor: "B".into(),
        },
        origin: Key::root().ticket().unwrap(),
        node_type: "missing".into(),
        boundary: String::new(),
        attrs: None,
    };
    assert!(doc.apply_remote(&[invalid]).is_err());
    assert_eq!(cp(&mut doc), before);
    let invalid_own = Op::Node {
        id: doc.next_ticket().unwrap(),
        origin: Key::root().ticket().unwrap(),
        node_type: "missing".into(),
        boundary: String::new(),
        attrs: None,
    };
    assert!(doc
        .record(vec![invalid_own], EditOptions::default(), 2.)
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let bad = Key::parse("999@missing").unwrap();
    assert!(doc
        .insert_models_relative(
            &read.base,
            &[
                rel(end(), p("candidate")),
                rel(RelativeModelTarget::Before(bad), p("bad"))
            ],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    apply(&mut doc, &read.base, &[rel(end(), p("success"))]);
}

#[test]
fn successful_empty_duplicate_and_clock_only_publications_consume_base() {
    for mode in [
        "emptyRemote",
        "duplicateRemote",
        "emptyBatch",
        "emptyRelative",
        "emptyUndo",
        "clockOnly",
    ] {
        let mut doc = RuntimeDocument::new("A", schema()).unwrap();
        let (_, seed) = doc
            .insert_model_at(&[1], p("seed"), EditOptions::default(), 1.)
            .unwrap();
        if mode == "clockOnly" {
            doc.reparent_block(&Key::root(), None, None, EditOptions::default(), 1.)
                .unwrap();
        }
        if mode == "emptyUndo" {
            doc.undo().unwrap();
            assert!(!doc.history_status().unwrap().can_undo);
        }
        let read = doc.read_model_for_edit().unwrap();
        match mode {
            "emptyRemote" => doc.apply_remote(&[]).unwrap(),
            "duplicateRemote" => doc.apply_remote(&seed.ops).unwrap(),
            "emptyBatch" => {
                doc.insert_models_batch(&[], EditOptions::default(), 1.)
                    .unwrap();
            }
            "emptyRelative" => {
                apply(&mut doc, &read.base, &[]);
            }
            "emptyUndo" => {
                assert!(doc.undo().unwrap().ops.is_empty());
            }
            _ => {
                let out = doc
                    .insert_models_batch(
                        &[ModelInsert {
                            at: vec![0],
                            model: json!({"type":"table","children":[]}),
                        }],
                        EditOptions::default(),
                        1.,
                    )
                    .unwrap();
                assert!(out.change.ops.is_empty());
                assert_eq!(out.clock_after, out.clock_before + 1);
            }
        }
        let before = cp(&mut doc);
        assert!(
            doc.insert_models_relative(&read.base, &[], EditOptions::default(), 1.)
                .is_err(),
            "{mode}"
        );
        assert_eq!(cp(&mut doc), before);
    }
}

#[test]
fn instance_schema_and_restore_aba_reject_tokens_without_changing_checkpoint() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let saved = doc.checkpoint().unwrap();
    let mut other = RuntimeDocument::new("A", schema()).unwrap();
    let before = cp(&mut other);
    assert!(other
        .insert_models_relative(&read.base, &[], EditOptions::default(), 1.)
        .is_err());
    assert_eq!(cp(&mut other), before);
    let mut restored = RuntimeDocument::restore(&saved).unwrap();
    assert!(restored
        .insert_models_relative(&read.base, &[], EditOptions::default(), 1.)
        .is_err());
    doc.restore_checkpoint(&saved).unwrap();
    assert!(doc
        .insert_models_relative(&read.base, &[], EditOptions::default(), 1.)
        .is_err());
    let mut descriptor = schema().manifest().clone();
    descriptor["nodes"]["p"]["attrs"] = json!({"n":{"default":0}});
    let mut different =
        RuntimeDocument::new("A", RuntimeSchema::compile(descriptor).unwrap()).unwrap();
    let error = different
        .insert_models_relative(&read.base, &[], EditOptions::default(), 1.)
        .unwrap_err();
    assert!(error.0.contains("schema"));
}

#[test]
fn stored_flow_edges_and_fresh_target_follow_move_with_foreign_recovery() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let a = add(&mut doc, &[1], json!({"type":"box","children":[]}));
    let b = add(&mut doc, &[2], json!({"type":"box","children":[]}));
    let read = doc.read_model_for_edit().unwrap();
    let out = apply(
        &mut doc,
        &read.base,
        &[rel(
            RelativeModelTarget::InsideEnd(FlowTarget::Node(a.clone())),
            p("K"),
        )],
    );
    let target = out.keys[0].clone().unwrap();
    doc.reparent_block(&target, Some(&b), None, EditOptions::default(), 3.)
        .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let out = apply(
        &mut doc,
        &read.base,
        &[rel(RelativeModelTarget::After(target), p("followed"))],
    );
    let mut expected_order = read.model["children"][2]["children"]
        .as_array()
        .unwrap()
        .iter()
        .map(units)
        .collect::<Vec<_>>();
    let at = expected_order
        .iter()
        .position(|value| *value == "K".encode_utf16().collect::<Vec<_>>())
        .unwrap();
    expected_order.insert(at + 1, "followed".encode_utf16().collect());
    let model = doc.model().unwrap();
    assert_eq!(
        model["children"][2]["children"]
            .as_array()
            .unwrap()
            .iter()
            .map(units)
            .collect::<Vec<_>>(),
        expected_order
    );
    assert!(model["children"][1]["children"]
        .as_array()
        .unwrap()
        .iter()
        .all(|node| units(node) != "followed".encode_utf16().collect::<Vec<_>>()));
    let mut peer = RuntimeDocument::new("B", schema()).unwrap();
    for change in doc.pending_changes() {
        peer.apply_remote(&change.ops).unwrap();
    }
    let foreign = peer
        .insert_text_at(
            &Key::root(),
            None,
            "FOREIGN",
            Attributes::new(),
            EditOptions::default(),
            4.,
        )
        .unwrap();
    doc.apply_remote(&foreign.ops).unwrap();
    let with_foreign = doc.model().unwrap();
    doc = RuntimeDocument::restore(&doc.checkpoint().unwrap()).unwrap();
    doc.undo().unwrap();
    assert_eq!(
        units(&doc.model().unwrap()["children"][0]),
        "FOREIGN".encode_utf16().collect::<Vec<_>>()
    );
    doc.redo().unwrap();
    assert_eq!(doc.model().unwrap(), with_foreign);
    doc.apply_remote(&out.change.ops).unwrap();
    assert_eq!(doc.model().unwrap(), with_foreign);
}

#[test]
fn group_member_targets_use_current_wrapper_slot_and_inherit_attrs() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let first = add(
        &mut doc,
        &[1],
        json!({"type":"list","attrs":{"bucket":"shared"},"children":[{"type":"item","runs":[{"text":"K"}]},{"type":"item","runs":[{"text":"tail"}]}]}),
    );
    let read = doc.read_model_for_edit().unwrap();
    apply(
        &mut doc,
        &read.base,
        &[rel(
            RelativeModelTarget::After(first),
            json!({"type":"item","runs":[{"text":"middle"}]}),
        )],
    );
    let model = doc.model().unwrap();
    assert_eq!(model["children"][1]["attrs"]["bucket"], "shared");
    assert_eq!(
        model["children"][1]["children"].as_array().unwrap().len(),
        3
    );
    assert_eq!(
        units(&model["children"][1]["children"][1]),
        "middle".encode_utf16().collect::<Vec<_>>()
    );
}

#[test]
fn missing_deleted_heads_chars_axes_and_wrong_inside_shapes_reject_atomically() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let key = add(&mut doc, &[1], p("K"));
    let character = Key::from_ticket(&Ticket {
        lamport: key.ticket().unwrap().lamport + 1,
        actor: "A".into(),
    });
    for target in [
        RelativeModelTarget::Before(Key::root()),
        RelativeModelTarget::After(character),
        RelativeModelTarget::Before(Key::parse("999@missing").unwrap()),
        RelativeModelTarget::InsideStart(FlowTarget::Node(key.clone())),
    ] {
        let read = doc.read_model_for_edit().unwrap();
        let before = cp(&mut doc);
        assert!(doc
            .insert_models_relative(
                &read.base,
                &[rel(target, p("bad"))],
                EditOptions::default(),
                2.
            )
            .is_err());
        assert_eq!(cp(&mut doc), before);
    }
    doc.delete_block(&key, EditOptions::default(), 2.).unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_models_relative(
            &read.base,
            &[rel(RelativeModelTarget::After(key), p("bad"))],
            EditOptions::default(),
            2.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn visible_cell_siblings_work_but_covered_cells_axes_and_hidden_ancestors_reject() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let cell = json!({"type":"cell","children":[{"type":"body","children":[p("head")]}]});
    let (grid, change) = doc
        .insert_model_at(
            &[1],
            json!({"type":"table","children":[{"type":"row","children":[cell.clone(),cell]}]}),
            EditOptions::default(),
            1.,
        )
        .unwrap();
    let row = change
        .ops
        .iter()
        .find_map(|op| match op.raw_operation() {
            Op::Node { id, node_type, .. } if node_type == "row" => Some(Key::from_ticket(id)),
            _ => None,
        })
        .unwrap();
    let cols = change
        .ops
        .iter()
        .filter_map(|op| match op.raw_operation() {
            Op::Node { id, node_type, .. } if node_type == "col" => Some(Key::from_ticket(id)),
            _ => None,
        })
        .collect::<Vec<_>>();
    let target = add(&mut doc, &[1, 0, 1, 0, 1], p("stored"));
    let read = doc.read_model_for_edit().unwrap();
    apply(
        &mut doc,
        &read.base,
        &[rel(
            RelativeModelTarget::Before(target.clone()),
            p("visible"),
        )],
    );
    doc.merge_cells(
        &grid,
        &row,
        &cols[0],
        &row,
        &cols[1],
        EditOptions::default(),
        3.,
    )
    .unwrap();
    for key in [target, row, cols[0].clone()] {
        let read = doc.read_model_for_edit().unwrap();
        let before = cp(&mut doc);
        assert!(doc
            .insert_models_relative(
                &read.base,
                &[rel(RelativeModelTarget::After(key), p("bad"))],
                EditOptions::default(),
                4.
            )
            .is_err());
        assert_eq!(cp(&mut doc), before);
    }
    let owner = add(&mut doc, &[2], json!({"type":"box","children":[]}));
    let child = add(&mut doc, &[2, 1], p("inside"));
    doc.delete_block(&owner, EditOptions::default(), 3.)
        .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    assert!(doc
        .insert_models_relative(
            &read.base,
            &[rel(RelativeModelTarget::After(child), p("bad"))],
            EditOptions::default(),
            4.
        )
        .is_err());
}

#[test]
fn joined_alias_and_cardinality_hidden_primary_reject_without_neighbor_fallback() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let alias = add(&mut doc, &[1], p("joined"));
    doc.reparent_block(&alias, None, Some(&Key::root()), EditOptions::default(), 2.)
        .unwrap();
    let at = doc.next_ticket().unwrap();
    doc.record(
        vec![Op::Set {
            at,
            ids: vec![alias.ticket().unwrap()],
            key: "$join".into(),
            value: json!({"into":Key::root().as_str(),"after":Key::root().as_str()}),
        }],
        EditOptions::default(),
        2.,
    )
    .unwrap();
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_models_relative(
            &read.base,
            &[rel(RelativeModelTarget::After(alias), p("bad"))],
            EditOptions::default(),
            3.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
    let mut descriptor = schema().manifest().clone();
    descriptor["nodes"]["doc"]["childRules"] = json!({"box":{"max":1}});
    let mut doc = RuntimeDocument::new("A", RuntimeSchema::compile(descriptor).unwrap()).unwrap();
    add(&mut doc, &[1], json!({"type":"box","children":[]}));
    let hidden = add(&mut doc, &[2], json!({"type":"box","children":[]}));
    let read = doc.read_model_for_edit().unwrap();
    let before = cp(&mut doc);
    assert!(doc
        .insert_models_relative(
            &read.base,
            &[rel(RelativeModelTarget::Before(hidden), p("bad"))],
            EditOptions::default(),
            3.
        )
        .is_err());
    assert_eq!(cp(&mut doc), before);
}

#[test]
fn virtual_default_prefix_and_required_lines_keep_exact_model_slots() {
    for grouped in [false, true] {
        let descriptor = if grouped {
            json!({"root":"doc","marks":[],"nodes":{
                "doc":{"shape":"flow","children":["list","box"],"default":"item"},
                "list":{"shape":"group","children":["item"],"by":[]},"item":{"shape":"text"},
                "box":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text"}
            }})
        } else {
            json!({"root":"doc","marks":[],"nodes":{
                "doc":{"shape":"flow","children":["p","box","atom"],"default":"p"},"p":{"shape":"text"},
                "box":{"shape":"flow","children":["p"],"default":"p"},"atom":{"shape":"atom"}
            }})
        };
        let mut doc =
            RuntimeDocument::new("A", RuntimeSchema::compile(descriptor).unwrap()).unwrap();
        let id = doc.next_ticket().unwrap();
        let key = Key::from_ticket(&id);
        doc.record(
            vec![Op::Node {
                id,
                origin: Key::root().ticket().unwrap(),
                node_type: if grouped { "box" } else { "atom" }.into(),
                boundary: String::new(),
                attrs: None,
            }],
            EditOptions::default(),
            1.,
        )
        .unwrap();
        doc.reparent_block(&key, None, None, EditOptions::default(), 2.)
            .unwrap();
        let read = doc.read_model_for_edit().unwrap();
        apply(
            &mut doc,
            &read.base,
            &[rel(
                RelativeModelTarget::Before(key),
                json!({"type":if grouped{"item"}else{"p"},"runs":[{"text":"before"}]}),
            )],
        );
        let model = doc.model().unwrap();
        let mut expected = read.model.clone();
        let children = expected["children"].as_array_mut().unwrap();
        let at = children
            .iter()
            .position(|node| node["type"] == if grouped { "box" } else { "atom" })
            .unwrap();
        let inserted = json!({"type":if grouped{"item"}else{"p"},"runs":[{"units":"before".encode_utf16().collect::<Vec<_>>(),"marks":{}}]});
        if grouped {
            assert_eq!(children[at - 1]["type"], "list");
            children[at - 1]["children"]
                .as_array_mut()
                .unwrap()
                .push(inserted);
        } else {
            children.insert(at, inserted);
        }
        assert_eq!(model, expected);
    }
    let products: Value = serde_json::from_str(include_str!(
        "../../runtime-document-unused/product-schemas.json"
    ))
    .unwrap();
    let mut doc = RuntimeDocument::new(
        "A",
        RuntimeSchema::compile(products["word"].clone()).unwrap(),
    )
    .unwrap();
    let section = doc
        .insert_model_at(
            &[1],
            json!({"type":"section","children":[]}),
            EditOptions::default(),
            1.,
        )
        .unwrap()
        .0;
    let read = doc.read_model_for_edit().unwrap();
    apply(
        &mut doc,
        &read.base,
        &[rel(
            RelativeModelTarget::InsideEnd(FlowTarget::Node(section)),
            json!({"type":"paragraph","runs":[{"text":"end"}]}),
        )],
    );
    assert_eq!(
        doc.model().unwrap()["children"][1]["children"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()["type"],
        "paragraph"
    );
}

#[test]
fn explicit_root_and_stored_flow_start_end_keep_the_requested_edges() {
    let mut doc = RuntimeDocument::new("A", schema()).unwrap();
    let read = doc.read_model_for_edit().unwrap();
    apply(
        &mut doc,
        &read.base,
        &[rel(
            RelativeModelTarget::InsideStart(FlowTarget::Root),
            p("root first"),
        )],
    );
    assert_eq!(
        units(&doc.model().unwrap()["children"][0]),
        "root first".encode_utf16().collect::<Vec<_>>()
    );
    let read = doc.read_model_for_edit().unwrap();
    let out = apply(
        &mut doc,
        &read.base,
        &[rel(end(), json!({"type":"box","children":[]}))],
    );
    let owner = out.keys[0].clone().unwrap();
    let read = doc.read_model_for_edit().unwrap();
    apply(
        &mut doc,
        &read.base,
        &[
            rel(
                RelativeModelTarget::InsideStart(FlowTarget::Node(owner.clone())),
                p("first"),
            ),
            rel(
                RelativeModelTarget::InsideEnd(FlowTarget::Node(owner)),
                p("last"),
            ),
        ],
    );
    let model = doc.model().unwrap();
    let children = model["children"].as_array().unwrap().last().unwrap()["children"]
        .as_array()
        .unwrap();
    assert_eq!(
        units(children.first().unwrap()),
        "first".encode_utf16().collect::<Vec<_>>()
    );
    assert_eq!(
        units(children.last().unwrap()),
        "last".encode_utf16().collect::<Vec<_>>()
    );
}
