import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {loadavg} from "node:os";
import {performance} from "node:perf_hooks";
import {fileURLToPath} from "node:url";
import {applyEdits, Doc, schemaVersion} from "@barocss/doc-sync";
import {SyncClient, PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA as baseSchema} from "../fixtures/demo-schema.ts";
import type {EditOp, NodeJSON} from "@barocss/doc-sync";
import type {ServerEvent} from "@barocss/doc-sync/sync";

// Structural receipt to model notification. Network, DOM and correctness checks are outside timing.
// Phase wrappers run only in two untimed diagnostic samples; snapshots are checked there.
const args = process.argv.slice(2);
const argument = (key: string, fallback: string): string => {
    const i = args.indexOf(`--${key}`);
    return i < 0 ? fallback : args[i + 1] ?? "";
};
const samples = Number(argument("samples", "30"));
const warmups = 5;
const sizes = argument("chars", "10000,100000").split(",").map(Number);
const scenarios = argument("scenarios", "root-split,callout-split,root-type,cell-split,table-row,table-span,root-list,root-cardinality").split(",");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const startedAt = new Date().toISOString();
const startedLoadAverage = loadavg();
assert.ok(Number.isSafeInteger(samples) && samples > 0);
assert.ok(sizes.every(n => Number.isSafeInteger(n) && n >= 160));
const text = (value: string): NodeJSON => ({type: "paragraph", runs: [{text: value, marks: {}}]});
const rows = sizes.flatMap(mainChars => scenarios.map(scenario => {
    const schema = structuredClone(baseSchema);
    if (scenario === "root-cardinality" && schema.nodes.content.shape === "flow") schema.nodes.content.childRules = {paragraph: {min: 1}};
    const paragraphs = Math.ceil(mainChars / 160);
    const target = Math.floor(paragraphs / 2);
    const initial: NodeJSON[] = Array.from({length: paragraphs}, (_, i) => text("x".repeat(Math.min(160, mainChars - i * 160))));
    initial.push({type: "callout", children: [text("inside".repeat(20))]});
    initial.push({type: "table", children: Array.from({length: 2}, () => ({type: "table-row", children: Array.from({length: 2}, () => ({type: "table-cell", children: [{type: "table-cell-body", children: [text("cell".repeat(30))]}]}))}))});
    const seed = new Doc("seed", schema);
    seed.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: initial}]);
    let receive: (event: ServerEvent) => void = () => undefined;
    const client = new SyncClient("receiver", {
        subscribe: (_since, listener) => { receive = listener; return () => undefined; },
        send: async () => undefined, sendPresence: () => undefined,
    }, {schema});
    client.connect();
    receive({type: "hello", schemaVersion: schemaVersion(schema), epoch: "fixture", protocol: PROTOCOL_VERSION, capabilities: ["placement-v1", "fields-v1", "annotations-v1", "cardinality-v1"], serverSeq: 1, snapshot: seed.snapshot(), delSeqs: [], presence: []});
    const sender = Doc.fromSnapshot("sender", seed.snapshot(), schema);
    let events: EditOp[] = [];
    let callbacks = 0;
    client.onModelEvents = next => { events = next; callbacks += 1; };
    let expected = seed.toJSON();
    let mirror = client.doc.toJSON();
    const rawMs: number[] = [];
    const markReads: number[] = [];
    const phases: Array<Record<string, number>> = [];
    const editsAt = (i: number): EditOp[] => {
        const first = i % 2 === 0;
        switch (scenario) {
            case "root-cardinality":
            case "root-split": return [first ? {op: "split", at: [target, 80]} : {op: "merge", at: [target + 1]}];
            case "callout-split": return [first ? {op: "split", at: [paragraphs, 0, 60]} : {op: "merge", at: [paragraphs, 1]}];
            case "root-list": return [{op: "update", at: first ? [target] : [target, 0], attrs: {type: first ? "list-item" : "paragraph", ...(first ? {listType: "bullet"} : {})}}];
            case "root-type": return [{op: "update", at: [target], attrs: {type: first ? "quote" : "paragraph"}}];
            case "cell-split": return [first ? {op: "split", at: [paragraphs + 1, 0, 0, 0, 0, 60]} : {op: "merge", at: [paragraphs + 1, 0, 0, 0, 1]}];
            case "table-row": return [first ? {op: "insert", at: [paragraphs + 1, 1], content: [{type: "table-row", children: [{type: "table-cell"}, {type: "table-cell"}]}]} : {op: "delete", at: [paragraphs + 1, 1], count: 1}];
            case "table-span": return [{op: "update", at: [paragraphs + 1, 0, 0], attrs: {rowspan: 1, colspan: first ? 2 : 1}}];
            default: throw new Error(`unknown scenario: ${scenario}`);
        }
    };
    for (let i = 0; i < warmups + samples + 2; i += 1) {
        const edits = editsAt(i);
        const ops = sender.edit(edits).ops;
        assert.ok(ops.length);
        events = [];
        callbacks = 0;
        const diagnostic = i >= warmups + samples;
        let reads = 0;
        const marksOf = client.doc.marksOf;
        if (diagnostic) client.doc.marksOf = item => { reads += 1; return marksOf.call(client.doc, item); };
        let applyMs = 0, modelMs = 0, stringifyMs = 0, stringifyCalls = 0, phase = "other";
        const apply = client.doc.apply, toJSON = client.doc.toJSON, stringify = JSON.stringify;
        if (diagnostic) {
            client.doc.apply = op => {const previous = phase; phase = "apply"; const start = performance.now(); try {return apply.call(client.doc, op);} finally {applyMs += performance.now() - start; phase = previous;}};
            client.doc.toJSON = () => {const previous = phase; phase = "model"; const start = performance.now(); try {return toJSON.call(client.doc);} finally {modelMs += performance.now() - start; phase = previous;}};
            JSON.stringify = (value: unknown, replacer?: any, space?: string | number) => {const start = performance.now(); try {return stringify(value, replacer, space);} finally {if (phase === "other") {stringifyMs += performance.now() - start; stringifyCalls += 1;}}};
        }
        const start = performance.now();
        try {receive({type: "change", envelope: {serverSeq: i + 2, change: {actor: "sender", seq: i + 1, ops}}});}
        finally {client.doc.apply = apply; client.doc.toJSON = toJSON; JSON.stringify = stringify;}
        const elapsed = performance.now() - start;
        if (diagnostic) phases.push({totalMs: elapsed, applyMs, modelMs, otherMs: elapsed - applyMs - modelMs, stringifyMs, stringifyCalls});
        client.doc.marksOf = marksOf;
        if (i >= warmups && !diagnostic) rawMs.push(elapsed);
        if (diagnostic) markReads.push(reads);
        assert.equal(callbacks, 1, `${scenario} sample ${i}: expected a changed model`);
        expected = applyEdits(schema, expected, edits);
        mirror = applyEdits(schema, mirror, events);
        assert.deepEqual(mirror, expected);
        assert.deepEqual(client.doc.toJSON(), expected);
        assert.deepEqual(sender.toJSON(), expected);
        if (diagnostic) assert.deepEqual(Doc.fromSnapshot("fresh", client.doc.snapshot(), schema).toJSON(), expected);
    }
    const sorted = [...rawMs].sort((a, b) => a - b);
    return {mainChars, paragraphs, scenario, samples, warmups, diagnosticSamples: 2, markReads, phases, correct: true, fallbacks: client.eventStats.fallbacks,
        p50: sorted[Math.floor(samples * .5)], p95: sorted[Math.floor(samples * .95)], max: sorted.at(-1), rawMs};
}));
const sourcePaths = ["packages/doc-sync/src/crdt/doc.ts", "packages/doc-sync/src/crdt/model.ts", "packages/doc-sync/src/sync/client.ts", "packages/doc-sync/src/sync/model-events.ts", "benchmarks/structural-events.ts"];
const result = {startedAt, endedAt: new Date().toISOString(), node: process.version, startedLoadAverage, endedLoadAverage: loadavg(),
    label: argument("label", "current"), metric: "synchronous remote change receipt through model-events callback; excludes network, DOM and correctness checks", unit: "ms",
    productImports: ["@barocss/doc-sync", "@barocss/doc-sync/sync"].map(specifier => ({specifier, resolved: import.meta.resolve(specifier)})),
    harnessSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
    sourceHashes: sourcePaths.map(path => ({path, sha256: createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")})), rows};
const output = argument("out", "");
if (output) { mkdirSync(dirname(output), {recursive: true}); writeFileSync(output, JSON.stringify(result, null, 2) + "\n", {flag: "wx"}); }
console.log(JSON.stringify(rows.map(({rawMs, ...row}) => row), null, 2));
