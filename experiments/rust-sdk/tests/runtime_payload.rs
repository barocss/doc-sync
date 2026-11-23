use doc_sync_native_sdk::*;
use serde_json::{json, Value};
fn manifest() -> Value {
    json!({"root":"root","marks":[],"markValues":{"paint":{"default":{"x":1},"values":[{"x":1}]}},"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "source":{"default":{"items":[{"x":1}]},"values":[{"items":[{"x":1}]}]},
            "target":{"default":{"x":1},"values":[{"x":1}]},
            "other":{"default":null,"values":[{"x":1}]}}}}})
}
fn path() -> Vec<ValuePathSegment> { vec![ValuePathSegment::Key("items".into()), ValuePathSegment::Index(0)] }
fn schema() -> RuntimeSchema {
    let source = ReferenceSlot::default(&["nodes","line","attrs","source"]).at_value_path(path());
    RuntimeSchema::compile_with_payload_references(manifest(), [ReferenceGroup::new(source.clone(), [
        source,
        ReferenceSlot::default(&["nodes","line","attrs","target"]),
        ReferenceSlot::enum_entry(&["nodes","line","attrs","target"],0),
        ReferenceSlot::default(&["markValues","paint"]),
        ReferenceSlot::enum_entry(&["markValues","paint"],0),
    ]), ReferenceGroup::new(
        ReferenceSlot::default(&["nodes","line","attrs","source"]),
        [ReferenceSlot::default(&["nodes","line","attrs","source"]),ReferenceSlot::enum_entry(&["nodes","line","attrs","source"],0)]
    )]).unwrap()
}
fn source(s: &RuntimeSchema) -> SchemaValue { s.default_value("line","source").unwrap().at_value_path(path()).unwrap() }
fn attrs(key: &str, value: SchemaValue) -> SchemaAttributes { SchemaAttributes::from([(key.into(),value)]) }
fn snapshot(d: &mut RuntimeDocument) -> String { d.checkpoint().unwrap().to_json().unwrap() }
#[test]
fn nested_factories_keep_source_provenance_and_typed_paths() {
    let s = schema();
    assert_eq!(s.dto()["format"],"doc-sync-runtime-schema-payload-v3");
    assert_eq!(s.manifest(), &manifest());
    assert_ne!(s.identity(),s.base_identity());
    let v=source(&s);
    assert_eq!(v.value(),&json!({"x":1}));
    let slot=ReferenceSlot::default(&["nodes","line","attrs","source"]).with_value_path(path());
    assert_eq!(v,s.reference_value_at(&slot).unwrap());
    let op=v.bind(Op::Set{at:Ticket{lamport:1,actor:"A".into()},ids:vec![],key:"target".into(),value:v.value().clone()}, &["value"]).unwrap();
    let encoded=serde_json::to_value(op).unwrap();
    assert_eq!(encoded["references"][0]["valuePath"],json!(["items",0]));
    assert_eq!(encoded["references"][0]["at"],json!(["nodes","line","attrs","source"]));
    assert_eq!(encoded["references"][0]["path"],json!(["value"]));
    assert_eq!(serde_json::from_value::<RuntimeSchema>(s.dto().clone()).unwrap(),s);
    for p in [vec![ValuePathSegment::Key("missing".into())],vec![ValuePathSegment::Key("items".into()),ValuePathSegment::Key("0".into())],vec![ValuePathSegment::Key("items".into()),ValuePathSegment::Index(0),ValuePathSegment::Key("x".into())],vec![ValuePathSegment::Key("__proto__".into())]] {
        assert!(s.default_value("line","source").unwrap().at_value_path(p).is_err());
    }
    assert!(SchemaValue::json(json!({"a":{}})).at_value_path([ValuePathSegment::Key("a".into())]).is_err());
}
#[test]
fn nested_source_admission_is_target_aware_and_atomic() {
    let s=schema(); let mut d=RuntimeDocument::new("A",s.clone()).unwrap();
    let (id,birth)=d.insert_runtime_block("line",None,None,attrs("target",source(&s)),EditOptions::default(),1.).unwrap();
    assert!(matches!(&birth.ops[0],Op::Node{attrs:Some(a),..} if a.is_empty()));
    let before=snapshot(&mut d);
    // Its descriptor is the same, but a child object is not the whole enum root.
    for target in ["source","other"] {
        assert!(d.set_runtime_attribute(&id,target,source(&s),EditOptions::default(),2.).is_err());
        assert_eq!(snapshot(&mut d),before);
    }
    let change=d.set_runtime_attribute(&id,"target",source(&s),EditOptions::default(),3.).unwrap();
    assert!(matches!(&change.ops[0],Op::Reference{references,..} if references[0]["valuePath"]==json!(["items",0])));
    let text=d.insert_runtime_text_at(&Key::root(),Some(&id),"x",attrs("paint",source(&s)),EditOptions::default(),4.).unwrap();
    assert!(matches!(&text.ops[0],Op::Text{marks,..} if marks.is_empty()));
    let before=snapshot(&mut d);
    let mut dto=s.dto().clone(); dto["referenceGroups"][0]["representative"]=json!({"at":["nodes","line","attrs","target"],"source":"default"});
    let foreign=RuntimeSchema::compile(dto).unwrap();
    assert!(d.set_runtime_attribute(&id,"target",source(&foreign),EditOptions::default(),5.).is_err());
    assert_eq!(snapshot(&mut d),before);
}
#[test]
fn nested_pending_history_restart_retry_and_ack_preserve_sources() {
    let s=schema(); let mut a=RuntimeDocument::new("A",s.clone()).unwrap(); let mut b=RuntimeDocument::new("B",s.clone()).unwrap();
    let (id,birth)=a.insert_block("line",None,None,Attributes::new(),EditOptions::default(),1.).unwrap(); b.apply_remote(&birth.ops).unwrap();
    let own=a.set_runtime_attribute(&id,"target",source(&s),EditOptions::default(),2.).unwrap();
    let foreign=b.set_runtime_attribute(&id,"target",s.enum_value("line","target",0).unwrap(),EditOptions::default(),2.).unwrap();
    a.apply_remote(&foreign.ops).unwrap(); b.apply_remote(&own.ops).unwrap();
    assert_eq!(a.model().unwrap(),b.model().unwrap());
    let cp=RuntimeCheckpoint::from_json(&snapshot(&mut a)).unwrap(); let mut a=RuntimeDocument::restore(&cp).unwrap();
    assert_eq!(a.pending_changes()[1],own);
    let before=snapshot(&mut a);
    for c in a.pending_changes().to_vec() { let ops:Vec<Op>=serde_json::from_value(serde_json::to_value(c.ops).unwrap()).unwrap(); a.apply_remote(&ops).unwrap(); }
    assert_eq!(snapshot(&mut a),before);
    for redo in [false,true] { let c=if redo {a.redo().unwrap()}else{a.undo().unwrap()}; b.apply_remote(&c.ops).unwrap(); assert_eq!(a.model().unwrap(),b.model().unwrap()); }
    let pending=a.pending_changes().to_vec(); a.acknowledge(&pending).unwrap();
    let a=RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&snapshot(&mut a)).unwrap()).unwrap(); assert!(a.pending_changes().is_empty());
}
#[test]
fn v3_rejects_malformed_path_graphs_without_mutation() {
    let s=schema(); let mut d=RuntimeDocument::new("A",s.clone()).unwrap(); let before=snapshot(&mut d);
    for path in [json!(["items","0"]),json!(["items",-1]),json!(["items",1]),json!(["items",0,"x"]),json!(["__proto__"]),json!([true]),json!("items")] {
        let mut dto=s.dto().clone(); dto["referenceGroups"][0]["slots"][0]["valuePath"]=path;
        assert!(RuntimeSchema::compile(dto).is_err()); assert_eq!(snapshot(&mut d),before);
    }
    for format in ["doc-sync-runtime-schema-alias-v1","doc-sync-runtime-schema-shared-v2"] {
        let mut dto=s.dto().clone(); dto["format"]=json!(format); assert!(RuntimeSchema::compile(dto).is_err());
    }
}
