import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {test} from "node:test";
import {sha256, schemaVersion} from "../src/crdt/schema-version.ts";
import type {Schema} from "../src/crdt/schema.ts";

const oracle = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function randomStrings(): string[] {
    let state = 0x3918ac73;
    const next = () => {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        return state >>> 0;
    };
    return Array.from({length: 160}, (_, index) => {
        const units = Array.from({length: index < 64 ? index : next() % 4097}, () => next() & 0xffff);
        return String.fromCharCode(...units);
    });
}

const samples = [
    "", "abc", "한글🙂é", "e\u0301", "\0\u007f\u0080\u07ff\u0800\uffff",
    "\ud800", "\udc00", "\ud800A\udc00", "\udbff\udfff",
    ...[55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 1024, 65536].map(size => "x".repeat(size)),
    ...[18, 19, 21, 22, 40, 41].map(size => "가".repeat(size)),
    ...randomStrings(),
];

test("SHA-256 matches independent Node crypto for Unicode, random UTF-16 and block boundaries", () => {
    for (const text of samples) assert.equal(sha256(text), oracle(text), `UTF-16 length ${text.length}`);
});

test("SHA-256 retains TextEncoder runtime coercion and exception behavior", () => {
    const runtimeHash = sha256 as (value?: unknown) => string;
    for (const [value, encoded] of [[undefined, ""], [null, "null"], [42, "42"], [false, "false"], [{toString: () => "가🙂"}, "가🙂"]] as const) {
        assert.equal(runtimeHash(value), oracle(encoded));
    }
    assert.throws(() => runtimeHash(Symbol("invalid")), TypeError);
    const failure = new Error("coercion failed");
    assert.throws(() => runtimeHash({toString() { throw failure; }}), error => error === failure);
    assert.equal(sha256("abc"), oracle("abc"));
});

test("SHA-256 state is independent for repeated and interleaved calls", () => {
    const expected = samples.map(oracle);
    for (let round = 0; round < 3; round++) {
        for (let index = samples.length - 1; index >= 0; index--) {
            assert.equal(sha256(samples[index]), expected[index]);
            assert.equal(sha256(""), expected[0]);
        }
    }
});

function schema(label: string): Schema {
    return {root: "doc", nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text", ui: {label}}}, marks: []};
}

function identityJSON(label: string): string {
    // Fixed independent canonical form. Do not call the production canonicalizer.
    return `{"marks":[],"nodes":{"doc":{"children":["p"],"default":"p","shape":"flow"},"p":{"shape":"text","ui":{"label":${JSON.stringify(label)}}}},"root":"doc"}`;
}

test("schema identity matches Node crypto across Unicode and multiblock canonical JSON", () => {
    for (const label of samples) {
        const original = schema(label);
        const expected = `sha256:${oracle(identityJSON(label))}`;
        assert.equal(schemaVersion(original), expected);
        assert.equal(schemaVersion({...original, domain: "document"}), expected);
        const reordered: Schema = {marks: [], nodes: {p: original.nodes.p, doc: original.nodes.doc}, root: "doc"};
        assert.equal(schemaVersion(reordered), expected);
    }
});

test("schema UI metadata participates in identity and does not contaminate later calls", () => {
    const original = schema("original");
    const expected = schemaVersion(original);
    for (const label of ["changed", "가🙂", "a".repeat(4096)]) {
        assert.notEqual(schemaVersion(schema(label)), expected);
        assert.equal(schemaVersion(original), expected);
    }
});
