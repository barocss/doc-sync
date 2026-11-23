use doc_sync_rust_shadow::{
    runtime_schema::{validate_attribute, validate_mark_value, RuntimeSchema},
    Server,
};
use serde_json::{json, Value};

const LINK: &str = r"^(https?://\S+)?$";
const COLOR: &str = "^(#[0-9a-fA-F]{6})?$";

fn manifest() -> Value {
    json!({"root":"doc","marks":[],"markValues":{"link":{"default":"","pattern":LINK}},"nodes":{
        "doc":{"shape":"flow","children":["p","table"],"default":"p"},
        "p":{"shape":"text","attrs":{"url":{"default":"","pattern":LINK},"meta":{"default":{"url":"","color":""},"fields":{"url":{"default":"","pattern":LINK},"color":{"default":"","pattern":COLOR}}}}},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"],"attrs":{"color":{"default":"","pattern":COLOR}}},
        "body":{"shape":"flow","children":["p"],"default":"p"}
    }})
}
fn link_accepted(schema: &RuntimeSchema, value: &Value, accepted: bool) {
    assert_eq!(
        schema.validate_mark_value("link", value).is_ok(),
        accepted,
        "mark {value:?}"
    );
    assert_eq!(
        schema.validate_attribute("p", "url", value).is_ok(),
        accepted,
        "attr {value:?}"
    );
    assert_eq!(
        schema
            .validate_attribute("p", r#"$field:["meta","url"]"#, value)
            .is_ok(),
        accepted,
        "leaf {value:?}"
    );
    assert_eq!(
        validate_mark_value(schema.manifest(), "link", value).is_ok(),
        accepted
    );
    assert_eq!(
        validate_attribute(schema.manifest(), "p", "url", value).is_ok(),
        accepted
    );
}
fn color_accepted(schema: &RuntimeSchema, value: &Value, accepted: bool) {
    assert_eq!(
        schema.validate_attribute("cell", "color", value).is_ok(),
        accepted,
        "cell {value:?}"
    );
    assert_eq!(
        schema
            .validate_attribute("p", r#"$field:["meta","color"]"#, value)
            .is_ok(),
        accepted,
        "leaf {value:?}"
    );
}
fn ask(server: &mut Server, schema: &RuntimeSchema, mut request: Value) -> Value {
    request["replica"] = json!("a");
    request["schema"] = json!(schema.identity());
    server.request(request)
}
fn ticket(n: u64, actor: &str) -> Value {
    json!({"lamport":n,"actor":actor})
}
fn set(key: &str, value: Value) -> Value {
    json!({"t":"set","at":ticket(2,"A"),"ids":[ticket(0,"~root")],"key":key,"value":value})
}

#[test]
fn exact_product_patterns_validate_mark_attribute_and_field_leaves() {
    let schema = RuntimeSchema::compile(manifest()).unwrap();
    for value in [
        "",
        "http://x",
        "https://x",
        "https:///",
        "http://?",
        "https://例え.テスト/😀",
        "https://x\u{0085}",
        "https://x\u{180e}",
        "https://x\0",
        "https://x\u{200b}",
    ] {
        link_accepted(&schema, &json!(value), true);
    }
    for value in [
        "http://",
        "https://",
        "HTTP://x",
        "Https://x",
        "ftp://x",
        " https://x",
        "https://x y",
        "https://x\n",
        "https://x\r",
        "https://x\u{2028}",
        "https://x\u{2029}",
        "https://x\u{feff}",
    ] {
        link_accepted(&schema, &json!(value), false);
    }
    for value in ["", "#000000", "#abcdef", "#ABCDEF", "#aB12Cd"] {
        color_accepted(&schema, &json!(value), true);
    }
    for value in [
        "#fff",
        "abcdef",
        "#abcdef00",
        "#abcdef\n",
        "#abcdeG",
        "#１２３４５６",
        " #abcdef",
    ] {
        color_accepted(&schema, &json!(value), false);
    }
    for value in [json!(false), json!(0), json!([]), json!({})] {
        link_accepted(&schema, &value, false);
        color_accepted(&schema, &value, false);
    }
    link_accepted(&schema, &Value::Null, true);
    color_accepted(&schema, &Value::Null, true);
}

#[test]
fn link_whitespace_matches_ecmascript_in_every_suffix_position() {
    let schema = RuntimeSchema::compile(manifest()).unwrap();
    for cp in [
        9, 10, 11, 12, 13, 32, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
        0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
    ] {
        let c = char::from_u32(cp).unwrap();
        for suffix in [
            format!("{c}"),
            format!("{c}x"),
            format!("x{c}x"),
            format!("x{c}"),
        ] {
            link_accepted(&schema, &json!(format!("https://{suffix}")), false);
        }
    }
    for cp in [
        0, 8, 14, 31, 0x7f, 0x85, 0x180e, 0x200b, 0x2060, 0xfffe, 0x10ffff,
    ] {
        link_accepted(
            &schema,
            &json!(format!("http://{}", char::from_u32(cp).unwrap())),
            true,
        );
    }
}

#[test]
fn arbitrary_pattern_variants_stay_fail_closed_and_defaults_are_checked() {
    for pattern in [
        r"^(https?://\S*)?$",
        r"^(https?://\S+)$",
        r"^(https?://\S+)?$i",
        r"^(HTTPS?://\S+)?$",
        "^(#[0-9a-fA-F]{3})?$",
        "^(#[0-9a-fA-F]{6})*$",
        ".*",
        "^a+$",
    ] {
        let mut dto = manifest();
        dto["markValues"]["link"]["pattern"] = json!(pattern);
        assert!(
            RuntimeSchema::compile(dto).unwrap_err().contains("pattern"),
            "{pattern}"
        );
    }
    for (key, value) in [("link", "http://"), ("link", "https://x\u{feff}")] {
        let mut dto = manifest();
        dto["markValues"][key]["default"] = json!(value);
        assert!(RuntimeSchema::compile(dto).is_err());
    }
    let mut dto = manifest();
    dto["nodes"]["cell"]["attrs"]["color"]["default"] = json!("#fff");
    assert!(RuntimeSchema::compile(dto).is_err());
}

#[test]
fn existing_pattern_grammar_keeps_its_validation_behavior() {
    for (pattern, default, good, bad) in [
        ("^[a-z]*$", "", "abc", "ABC"),
        ("^#[0-9a-fA-F]{6}$", "#123456", "#ABCdef", ""),
        (
            "^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$",
            "#123456",
            "#ABCdef12",
            "#abc",
        ),
        (r"^[^\u0000-\u001f\u007f]{0,2}$", "", "😀", "😀x"),
        (
            "^plain text_1-$",
            "plain text_1-",
            "plain text_1-",
            "plain text_2-",
        ),
    ] {
        let mut dto = manifest();
        dto["markValues"]["link"] = json!({"default":default,"pattern":pattern});
        let schema = RuntimeSchema::compile(dto).unwrap();
        assert!(
            schema.validate_mark_value("link", &json!(good)).is_ok(),
            "{pattern}"
        );
        assert!(
            schema.validate_mark_value("link", &json!(bad)).is_err(),
            "{pattern}"
        );
    }
}

#[test]
fn rejected_pattern_operations_preserve_full_snapshot_and_null_resets() {
    let schema = RuntimeSchema::compile(manifest()).unwrap();
    let mut server = Server::default();
    let created = ask(
        &mut server,
        &schema,
        json!({"cmd":"new","actor":"A","runtimeSchema":schema.dto()}),
    );
    assert_eq!(created["ok"], true, "{created}");
    let applied = ask(
        &mut server,
        &schema,
        json!({"cmd":"apply","ops":[set("url",json!("https://x")),set(r#"$field:["meta","color"]"#,json!("#123aBc"))]}),
    );
    assert_eq!(applied["ok"], true, "{applied}");
    let before = ask(&mut server, &schema, json!({"cmd":"snapshot"}))["snapshot"].clone();
    for op in [
        set("url", json!("http://")),
        set(r#"$field:["meta","color"]"#, json!("#fff")),
        set("url", json!(false)),
        json!({"t":"text","id":ticket(3,"A"),"origin":ticket(0,"~root"),"units":[97],"marks":{"link":"https://x\u{feff}"}}),
    ] {
        let response = ask(&mut server, &schema, json!({"cmd":"apply","ops":[op]}));
        assert_eq!(response["ok"], false, "{response}");
        assert_eq!(
            ask(&mut server, &schema, json!({"cmd":"snapshot"}))["snapshot"],
            before
        );
    }
    let reset =
        json!({"t":"set","at":ticket(4,"A"),"ids":[ticket(0,"~root")],"key":"url","value":null});
    let response = ask(&mut server, &schema, json!({"cmd":"apply","ops":[reset]}));
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(
        response["state"]["model"]["children"][0]["attrs"]["url"],
        ""
    );
}

#[test]
fn lone_surrogates_are_outside_native_json_string_boundary() {
    assert!(serde_json::from_str::<Value>(r#""\ud800""#).is_err());
    assert!(serde_json::from_str::<Value>(r#""\udfff""#).is_err());
    assert_eq!(
        serde_json::from_str::<Value>(r#""\ud83d\ude00""#).unwrap(),
        json!("😀")
    );
}
