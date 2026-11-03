use doc_sync_native_sdk::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
fn task() -> SpreadsheetSchema {
    SpreadsheetSchema::compile(json!({"domain":"spreadsheet","version":1,"fields":{"title":{"type":"string","default":"Untitled","maxLength":30},"progress":{"type":"number","default":0,"min":0,"max":100},"archived":{"type":"boolean","default":false}}})).unwrap()
}
fn options(actor: &str, schema: SpreadsheetSchema) -> RuntimeSheetOptions {
    RuntimeSheetOptions {
        actor: actor.into(),
        sheet_id: "tasks".into(),
        rows: 100,
        columns: 100,
        schema,
    }
}
fn patch(v: Value) -> RuntimeCellPatch {
    serde_json::from_value(v).unwrap()
}
#[test]
fn arbitrary_registry_resolves_defaults_and_roundtrips_shared_history() {
    let mut a = RuntimeSheet::new(options("A", task())).unwrap();
    let mut b = RuntimeSheet::new(options("B", task())).unwrap();
    assert_eq!(
        a.get_cell_value(0, 0, "title").unwrap(),
        RuntimeValue::Text("Untitled".into())
    );
    assert_eq!(a.stats().registers, 0);
    let first = a
        .set_cell(0, 0, patch(json!({"title":"work","progress":10})))
        .unwrap();
    assert_eq!(first[0].field, "progress");
    b.receive(&first).unwrap();
    let foreign = b.set_cell(0, 0, patch(json!({"title":"work"}))).unwrap();
    a.receive(&foreign).unwrap();
    let own = a.set_cell(0, 0, patch(json!({"progress":40}))).unwrap();
    b.receive(&own).unwrap();
    let cp = a.checkpoint();
    let mut resumed = RuntimeSheet::from_state(cp.to_value()).unwrap();
    assert_eq!(resumed.pending_changes(), a.pending_changes());
    assert_eq!(resumed.undo().unwrap().len(), 1);
    assert_eq!(
        resumed.get_cell_value(0, 0, "progress").unwrap(),
        RuntimeValue::Number(10.)
    );
    assert_eq!(resumed.undo().unwrap().len(), 1);
    assert_eq!(
        resumed.get_cell_value(0, 0, "title").unwrap(),
        RuntimeValue::Text("work".into())
    );
    assert_eq!(
        resumed.get_cell_value(0, 0, "progress").unwrap(),
        RuntimeValue::Number(0.)
    );
    assert_eq!(resumed.redo().unwrap().len(), 1);
    let mut schema = json!({"domain":"spreadsheet","version":1,"fields":{}});
    for i in 0..20 {
        schema["fields"][format!("custom_{i:02}")] = json!({"type":"number","default":0});
    }
    let mut many =
        RuntimeSheet::new(options("C", SpreadsheetSchema::compile(schema).unwrap())).unwrap();
    let changes = many
        .set_cell(
            2,
            4,
            (0..20)
                .map(|i| (format!("custom_{i:02}"), RuntimeValue::Number(i as f64)))
                .collect::<BTreeMap<_, _>>(),
        )
        .unwrap();
    assert_eq!(changes.len(), 20);
    assert_eq!(many.get_cell(2, 4).unwrap().len(), 20);
}
#[test]
fn invalid_schema_op_and_snapshot_are_atomic_and_schema_bound() {
    let mut a = RuntimeSheet::new(options("A", task())).unwrap();
    let ops = a.set_cell(0, 0, patch(json!({"progress":12}))).unwrap();
    let before = a.checkpoint().to_value();
    assert!(a
        .set_cell(0, 0, patch(json!({"progress":101,"title":"hello"})))
        .is_err());
    assert_eq!(a.checkpoint().to_value(), before);
    let mut bad = ops[0].clone();
    bad.at.actor = "B".into();
    bad.schema_version = "sha256:other".into();
    assert!(a.receive(&[bad]).is_err());
    assert_eq!(a.checkpoint().to_value(), before);
    let mut bad = before.clone();
    bad["options"]["schema"]["fields"]["progress"]["max"] = json!(999);
    assert!(a.restore_state(bad).is_err());
    assert_eq!(a.checkpoint().to_value(), before);
    for spec in [
        json!({"type":"number","default":1,"min":null}),
        json!({"type":"number","default":1,"max":0}),
        json!({"type":"string","default":"bad","values":["ok"]}),
        json!({"type":"boolean","default":false,"maxLength":2}),
    ] {
        assert!(SpreadsheetSchema::compile(
            json!({"domain":"spreadsheet","version":1,"fields":{"x":spec}})
        )
        .is_err());
    }
}
