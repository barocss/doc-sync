use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text,"marks":{"bold":true}}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"document","marks":["bold"],"nodes":{
        "document":{"shape":"flow","children":["paragraph","list","table"],"default":"paragraph"},
        "paragraph":{"shape":"text"},
        "list":{"shape":"group","children":["item"],"by":["mode"]},
        "item":{"shape":"text","attrs":{"mode":{"default":"bullet","values":["bullet","numbered"]},"depth":{"default":0,"min":0,"max":8}}},
        "table":{"shape":"grid","children":["row"],"attrs":{"header":{"default":false,"values":[false,true]}}},
        "row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"],"attrs":{
            "rowspan":{"default":1,"min":1,"computed":true},"colspan":{"default":1,"min":1,"computed":true},"spanned":{"default":false,"computed":true},
            "background":{"default":""},"properties":{"default":{"label":"","done":false},"fields":{"label":{"default":""},"done":{"default":false,"values":[false,true]}}}
        }},
        "body":{"shape":"flow","children":["paragraph","list","table"],"default":"paragraph"}
    }}))?;
    let mut alice = RuntimeDocument::new("A", schema.clone())?;
    let mut bob = RuntimeDocument::new("B", schema)?;
    let (_first_member, _) = alice.insert_model_at(
        &[1],
        json!({"type":"list","attrs":{"mode":"numbered"},"children":[{"type":"item","runs":[{"text":"First"}]},{"type":"item","runs":[{"text":"Last"}]}]}),
        EditOptions::default(), 1.,
    )?;
    alice.insert_model_at(
        &[1, 1],
        json!({"type":"item","runs":[{"text":"Middle"}]}),
        EditOptions::default(),
        2.,
    )?;
    let mut first = cell("00");
    first["attrs"] = json!({"properties":{"label":"owned","done":true},"background":"#ffffff"});
    let (grid, _) = alice.insert_model_at(
        &[2],
        json!({"type":"table","children":[{"type":"row","children":[first,cell("01")]},{"type":"row","children":[cell("10"),cell("11")]}]}),
        EditOptions::default(), 3.,
    )?;
    let (_row_axis, _) = alice.insert_model_at(
        &[2, 1],
        json!({"type":"row","children":[cell("Row")]}),
        EditOptions::default(),
        4.,
    )?;
    let (_column_axis, _) =
        alice.insert_model_at(&[2, 0, 1], cell("New😀"), EditOptions::default(), 5.)?;
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let range = Selection {
        anchor: Position(vec![2, 0, 1, 0, 0, 0]),
        focus: Position(vec![2, 0, 1, 0, 0, 5]),
    };
    let anchors = alice.capture_selection(Some(range.clone()))?;
    assert_eq!(
        alice.resolve_selection(anchors.clone())?,
        Some(range.clone())
    );
    let foreign = bob.set_attribute(&grid, "header", json!(true), EditOptions::default(), 6.)?;
    alice.apply_remote(&foreign.ops)?;
    let expected = alice.model()?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(alice.model()?["children"][2]["attrs"]["header"], true);
    let saved = alice.checkpoint()?.to_json()?;
    alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes().to_vec() {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(alice.resolve_selection(anchors)?, Some(range));
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_model_at(
            &[0],
            json!({"type":"table","children":[]}),
            EditOptions::default(),
            7.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!("PASS: model groups, grid axes, cell paths, foreign fields and own checkpoint retry");
    Ok(())
}
