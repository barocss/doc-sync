import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {assertCompatibleSchema, schemaVersion} from "../src/crdt/schema-version.ts";
import type {Schema} from "../src/crdt/schema.ts";

const minimal = (): Schema => ({root: "doc", nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}, marks: []});

test("schema fingerprint hashes canonical UTF-8 JSON with SHA-256", () => {
    // Exercise empty, multi-byte, and long strings across SHA-256 block boundaries.
    for (const label of ["", "가🙂", "a".repeat(48), "b".repeat(1000)]) {
        const schema = minimal();
        schema.nodes.p.ui = {label};
        const text = `{"marks":[],"nodes":{"doc":{"children":["p"],"default":"p","shape":"flow"},"p":{"shape":"text","ui":{"label":${JSON.stringify(label)}}}},"root":"doc"}`;
        assert.equal(schemaVersion(schema), `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`);
    }
});

test("object key order does not change the fingerprint, but rules and UI do", () => {
    const schema = minimal();
    const reordered: Schema = {marks: [], nodes: {p: {shape: "text"}, doc: {default: "p", children: ["p"], shape: "flow"}}, root: "doc"};
    assert.equal(schemaVersion(schema), schemaVersion(reordered));
    reordered.nodes.p.ui = {label: "Paragraph"};
    assert.notEqual(schemaVersion(schema), schemaVersion(reordered));
    reordered.nodes.p.ui.label = "다른 이름";
    assert.notEqual(schemaVersion(schema), schemaVersion(reordered));
});

test("schema fingerprints reject non-JSON state without calling accessors", () => {
    for (const value of [undefined, NaN, Infinity, 1n, () => undefined, new Date(), new Map()]) {
        const schema = minimal();
        (schema.nodes.p as unknown as Record<string, unknown>).extra = value;
        assert.throws(() => schemaVersion(schema));
    }
    const cyclic = minimal();
    (cyclic.nodes.p as unknown as Record<string, unknown>).extra = cyclic;
    assert.throws(() => schemaVersion(cyclic), /cycles/);
    const sparse = minimal();
    (sparse.nodes.p as unknown as Record<string, unknown>).extra = Array(2);
    assert.throws(() => schemaVersion(sparse), /dense/);
    const symbol = minimal();
    (symbol.nodes.p as unknown as Record<symbol, unknown>)[Symbol("extra")] = 1;
    assert.throws(() => schemaVersion(symbol), /symbol/);
    const getter = minimal();
    let invoked = false;
    Object.defineProperty(getter.nodes.p, "extra", {enumerable: true, get() { invoked = true; return 1; }});
    assert.throws(() => schemaVersion(getter), /plain values/);
    assert.equal(invoked, false);
});

test("invalid schemas are rejected before versioning or transition", () => {
    const invalid = minimal();
    invalid.root = "missing";
    assert.throws(() => schemaVersion(invalid), /Invalid schema/);
    assert.throws(() => assertCompatibleSchema(minimal(), invalid), /Invalid schema/);
});

test("new node definitions, children, and marks can be appended", () => {
    const base = structuredClone(DEMO_SCHEMA);
    const extended = structuredClone(base);
    extended.nodes["future-image"] = {shape: "inline", attrs: {src: {default: ""}}};
    const paragraph = extended.nodes.paragraph;
    if (paragraph.shape !== "text") throw new Error("Expected text");
    paragraph.children = [...(paragraph.children ?? []), "future-image"];
    extended.nodes["future-block"] = {shape: "atom"};
    const content = extended.nodes.content;
    if (content.shape !== "flow") throw new Error("Expected flow");
    content.children = [...content.children, "future-block"];
    extended.marks = [...extended.marks, "highlight"];
    assert.doesNotThrow(() => assertCompatibleSchema(base, extended));
    assert.notEqual(schemaVersion(base), schemaVersion(extended));
    assert.throws(() => assertCompatibleSchema(extended, base), /Incompatible schema/);
    for (const mutate of [
        (schema: Schema) => { schema.root = "callout"; },
        (schema: Schema) => { schema.marks = ["new", ...schema.marks]; },
        (schema: Schema) => { schema.nodes.paragraph.ui = {label: "Changed"}; },
        (schema: Schema) => { schema.nodes.paragraph.attrs = {color: {default: ""}}; },
        (schema: Schema) => { const flow = schema.nodes.content; if (flow.shape === "flow") flow.children = [...flow.children, "paragraph"]; },
        (schema: Schema) => { delete schema.nodes.quote; },
    ]) {
        const changed = structuredClone(base);
        mutate(changed);
        assert.throws(() => assertCompatibleSchema(base, changed));
    }
    assert.doesNotThrow(() => assertCompatibleSchema(base, structuredClone(base)));
});

test("extensions cannot regroup existing content or rewrap existing value marks", () => {
    const regroup = structuredClone(DEMO_SCHEMA);
    regroup.nodes["new-group"] = {shape: "group", children: ["paragraph"], by: []};
    const content = regroup.nodes.content;
    if (content.shape !== "flow") throw new Error("Expected flow");
    content.children = [...content.children, "new-group"];
    assert.throws(() => assertCompatibleSchema(DEMO_SCHEMA, regroup), /regroup/);

    const rewrap = structuredClone(DEMO_SCHEMA);
    rewrap.nodes["new-span"] = {shape: "span", mark: "link", attr: "url"};
    const paragraph = rewrap.nodes.paragraph;
    if (paragraph.shape !== "text") throw new Error("Expected text");
    paragraph.children = [...(paragraph.children ?? []), "new-span"];
    assert.throws(() => assertCompatibleSchema(DEMO_SCHEMA, rewrap), /rewrap/);
});
