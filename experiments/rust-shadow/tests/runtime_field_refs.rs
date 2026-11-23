use doc_sync_rust_shadow::runtime_schema::{RuntimeSchema, ReferenceGroup as Group, ReferenceSlot as Slot, ValuePathSegment as Segment, PAYLOAD_FORMAT, SHARED_FORMAT, ALIAS_FORMAT};
use serde_json::{json, Value};

fn manifest() -> Value {
    json!({"root":"doc","marks":[],"nodes":{"doc":{"shape":"flow","children":["p"],"default":"p"},"p":{"shape":"text","attrs":{
        "data":{"default":{"inner":{"leaf":{"box":{"x":1},"list":[{"x":1}]}}},"fields":{"inner":{"default":{"leaf":{"box":{"x":1},"list":[{"x":1}]}},"fields":{"leaf":{"default":{"box":{"x":1},"list":[{"x":1}]},"values":[{"list":[{"x":1}],"box":{"x":1}}]}}}}},
        "target":{"default":null,"values":[{"x":1}]},"independent":{"default":null,"values":[{"x":1}]}
    }}}})
}
fn leaf() -> Slot { Slot::default(&["nodes","p","attrs","data","fields","inner","fields","leaf"]) }
fn choice() -> Slot { Slot::enum_entry(&["nodes","p","attrs","data","fields","inner","fields","leaf"],0) }
fn target() -> Slot { Slot::enum_entry(&["nodes","p","attrs","target"],0) }
fn schema() -> RuntimeSchema {
    RuntimeSchema::compile_with_payload_references(manifest(), [Group::new(target(), [target(), leaf().nested([Segment::key("box")]), choice().nested([Segment::key("list"),Segment::index(0)])])]).unwrap()
}
#[test]
fn leaf_sources_keep_descriptor_and_payload_paths_separate() {
    let schema=schema();
    for slot in [leaf(), choice()] {
        let reference=schema.reference_value_at(&slot).unwrap();
        assert_eq!(schema.reference_payload(&reference).unwrap(), json!({"box":{"x":1},"list":[{"x":1}]}));
        assert!(schema.accepts_reference_at(&reference, &["nodes","p","attrs","data","fields","inner","fields","leaf"]).is_err());
    }
    for slot in [leaf().nested([Segment::key("box")]),choice().nested([Segment::key("list"),Segment::index(0)])] {
        let reference=schema.reference_value_at(&slot).unwrap();
        assert_eq!(schema.reference_payload(&reference).unwrap(), json!({"x":1}));
        schema.accepts_reference_at(&reference, &["nodes","p","attrs","target"]).unwrap();
        assert!(schema.accepts_reference_at(&reference, &["nodes","p","attrs","independent"]).is_err());
    }
}
#[test]
fn field_leaf_raw_validation_stays_deep_and_type_specific() {
    let schema=schema();
    let key=r#"$field:["data","inner","leaf"]"#;
    assert!(schema.validate_attribute("p",key,&json!({"list":[{"x":1}],"box":{"x":1}})).is_ok());
    assert!(schema.validate_attribute("p",key,&json!({"list":[{"x":2}],"box":{"x":1}})).is_err());
    assert!(schema.validate_attribute("p",key,&json!([])).is_err());
    assert!(schema.validate_attribute("p",key,&Value::Null).is_ok());
}
#[test]
fn branches_and_malformed_field_paths_remain_rejected() {
    let schema=schema();
    for at in [vec!["nodes","p","attrs","data"],vec!["nodes","p","attrs","data","fields","inner"],vec!["nodes","p","attrs","data","inner","leaf"],vec!["nodes","p","attrs","data","fields","missing"],vec!["nodes","p","attrs","data","fields","$bad"]] {
        assert!(schema.reference_value(&at,None).is_err(),"{at:?}");
    }
    assert!(schema.reference_value_at(&leaf().nested([Segment::key("list"),Segment::key("0")])).is_err());
    assert!(schema.reference_value_at(&leaf().nested([Segment::key("box"),Segment::key("x")])).is_err());
}
#[test]
fn nested_sources_require_v3_and_do_not_relax_leaf_constraints() {
    let group=Group::new(target(),[target(),leaf().nested([Segment::key("box")])]);
    assert!(RuntimeSchema::compile(json!({"format":SHARED_FORMAT,"manifest":manifest(),"referenceGroups":[group]})).is_err());
    assert!(RuntimeSchema::compile(json!({"format":ALIAS_FORMAT,"manifest":manifest(),"defaultReferences":[{"at":leaf().at,"enumIndex":0}]})).is_err());
    let mut bad=manifest();
    bad["nodes"]["p"]["attrs"]["data"]["fields"]["inner"]["fields"]["leaf"]["values"]=json!([{"wrong":1}]);
    assert!(RuntimeSchema::compile(json!({"format":PAYLOAD_FORMAT,"manifest":bad,"referenceGroups":[group]})).is_err());
}
#[test]
fn unrelated_enum_entries_cannot_bypass_source_leaf_type() {
    let mut manifest=manifest();
    manifest["nodes"]["p"]["attrs"]["data"]["fields"]["inner"]["fields"]["leaf"]["values"].as_array_mut().unwrap().push(json!([{"x":1}]));
    let schema=RuntimeSchema::compile_with_payload_references(manifest,[Group::new(target(),[target(),leaf().nested([Segment::key("box")])])]).unwrap();
    let wrong=Slot::enum_entry(&["nodes","p","attrs","data","fields","inner","fields","leaf"],1);
    assert!(schema.reference_value_at(&wrong).is_err());
    assert!(schema.reference_value_at(&wrong.nested([Segment::index(0)])).is_err());
}
