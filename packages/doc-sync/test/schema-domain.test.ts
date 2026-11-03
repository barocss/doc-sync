import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {test} from "node:test";
import {checkSchema, groupOf, storedTypes} from "../dist/crdt/schema.js";
import {assertCompatibleSchema, schemaVersion} from "../dist/crdt/schema-version.js";
import type {DocumentSchema, GraphicSchema, Schema} from "../dist/crdt/schema.js";

const document = (): DocumentSchema => ({root: "doc", nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}, marks: []});
const graphic = (): GraphicSchema => ({domain: "graphic", root: "canvas", nodes: {canvas: {shape: "container", children: ["frame", "object"]}, frame: {shape: "container", children: ["frame", "object"]}, object: {shape: "atom"}}, marks: []});

test("legacy and explicit document domains retain the original fingerprint", () => {
    const legacy = document();
    const marked: DocumentSchema = {...legacy, domain: "document"};
    const original = '{"marks":[],"nodes":{"doc":{"children":["p"],"default":"p","shape":"flow"},"p":{"shape":"text"}},"root":"doc"}';
    assert.equal(schemaVersion(legacy), `sha256:${createHash("sha256").update(original).digest("hex")}`);
    assert.equal(schemaVersion(marked), schemaVersion(legacy));
    assert.doesNotThrow(() => assertCompatibleSchema(legacy, marked));
    assert.doesNotThrow(() => assertCompatibleSchema(marked, legacy));
    assert.equal(marked.domain, "document");
});

test("document domain normalization does not skip original JSON validation", () => {
    const accessor = document();
    let read = false;
    Object.defineProperty(accessor, "domain", {enumerable: true, get() { read = true; return "document"; }});
    assert.throws(() => schemaVersion(accessor), /plain values/);
    assert.equal(read, false);
    const symbol = {...document(), domain: "document" as const, [Symbol("hidden")]: true};
    assert.throws(() => schemaVersion(symbol), /symbol/);
    const invalid = {...document(), domain: "document" as const, extra: NaN};
    assert.throws(() => schemaVersion(invalid), /finite/);
});

test("graphic schemas allow empty and recursive stored containers", () => {
    const schema = graphic();
    assert.deepEqual(checkSchema(schema), []);
    const canvas = schema.nodes.canvas;
    assert.equal(canvas.shape, "container");
    if (canvas.shape !== "container") throw new Error("Expected container");
    assert.deepEqual(storedTypes(schema, canvas), ["frame", "object"]);
    assert.equal(groupOf(schema, canvas, "object"), null);
    schema.nodes.canvas = {shape: "container", children: []};
    assert.deepEqual(checkSchema(schema), []);
    assert.doesNotThrow(() => schemaVersion(schema));
});

test("schema domains reject wrong roots and document containers", () => {
    const badDocument: Schema = {...graphic(), domain: "document"};
    assert.match(checkSchema(badDocument).join("; "), /root.*flow/);
    assert.match(checkSchema(badDocument).join("; "), /container requires/);
    const badGraphic: Schema = {...document(), domain: "graphic"};
    assert.match(checkSchema(badGraphic).join("; "), /root.*container/);
    assert.throws(() => assertCompatibleSchema(document(), graphic()), /Incompatible schema/);
    assert.throws(() => assertCompatibleSchema(graphic(), document()), /Incompatible schema/);
    const unknown = {...document(), domain: "other"} as unknown as Schema;
    assert.match(checkSchema(unknown).join("; "), /Unknown schema domain/);
});

test("containers reject computed children and unsupported flow rules", () => {
    for (const node of [{shape: "inline"}, {shape: "span", mark: "link", attr: "url"}, {shape: "group", children: ["p"], by: []}, {shape: "row", children: ["cell"]}, {shape: "cell", children: ["body"]}] as const) {
        const schema = graphic();
        schema.nodes.invalid = node as Schema["nodes"][string];
        schema.nodes.canvas = {shape: "container", children: ["invalid"]};
        assert.match(checkSchema(schema).join("; "), /stored object types/);
    }
    for (const extra of [{default: "p"}, {childRules: {object: {min: 1}}}]) {
        const schema = graphic();
        schema.nodes.canvas = {...schema.nodes.canvas, ...extra};
        assert.match(checkSchema(schema).join("; "), /not supported on a container/);
    }
});

test("graphic schema upgrades append new stored child types only", () => {
    const base = graphic(), next = graphic();
    next.nodes.newObject = {shape: "atom"};
    next.nodes.canvas = {shape: "container", children: ["frame", "object", "newObject"]};
    assert.doesNotThrow(() => assertCompatibleSchema(base, next));
    assert.notEqual(schemaVersion(base), schemaVersion(next));
    assert.throws(() => assertCompatibleSchema(next, base), /Incompatible schema/);
    const reordered = graphic();
    reordered.nodes.canvas = {shape: "container", children: ["object", "frame"]};
    assert.throws(() => assertCompatibleSchema(base, reordered), /retain their order/);
    const existing = graphic();
    existing.nodes.canvas = {shape: "container", children: ["frame", "object", "canvas"]};
    assert.throws(() => assertCompatibleSchema(base, existing), /not new/);
});


test("graphic root attributes are rejected while nested container attributes are valid", () => {
    const schema = graphic();
    schema.nodes.frame.attrs = {x: {default: 0}, settings: {default: {locked: false}, fields: {locked: {default: false}}}};
    assert.deepEqual(checkSchema(schema), []);
    schema.nodes.canvas.attrs = {x: {default: 0}};
    assert.match(checkSchema(schema).join("; "), /attrs are not supported on the graphic root/);
});
