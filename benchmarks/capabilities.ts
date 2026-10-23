import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {loadavg} from "node:os";
import {applyEdits, createAnnotation, Doc} from "@barocss/doc-sync";
import {SyncClient, DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import type {EditOp, NodeJSON, Schema} from "@barocss/doc-sync";
import type {ServerEvent} from "@barocss/doc-sync/sync";

/** Current-only capability cost. This is not a before/after improvement claim. */
const args = process.argv.slice(2);
const argument = (name: string, fallback: string) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const output = argument("out", ""), samples = Number(argument("samples", "30")), warmups = 5;
const sizes = argument("chars", "10000,100000").split(",").map(Number);
const modes = ["plain", "moved", "cardinality", "annotations", "field-write"] as const;
assert.ok(Number.isSafeInteger(samples) && samples > 0 && samples < 100);
const startedAt = new Date().toISOString(), startedLoad = loadavg();
const rows = sizes.flatMap(chars => modes.map(mode => {
    assert.ok(Number.isSafeInteger(chars) && chars >= 160);
    const schema: Schema = {root: "content", marks: ["bold"], nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph", ...(mode === "cardinality" ? {childRules: {paragraph: {min: 1}}} : {})},
        paragraph: {shape: "text", ...(mode === "field-write" ? {attrs: {appearance: {default: {spacing: 0, tone: "plain"}, fields: {spacing: {default: 0, min: 0}, tone: {default: "plain"}}}}} : {})},
    }};
    const paragraphs = Math.ceil(chars / 160), target = Math.floor(paragraphs / 2);
    const seed = new Doc("seed", schema);
    seed.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: Array.from({length: paragraphs}, (_, index) => ({type: "paragraph", runs: [{text: "x".repeat(Math.min(160, chars - index * 160)), marks: {}}]}))}]);
    if (mode === "moved") seed.edit([{op: "move", from: [paragraphs - 1], at: [0]}]);
    if (mode === "annotations") createAnnotation(seed, {anchor: [target, 50], focus: [target, 60]}, {message: "Persistent range"});
    const baseLength = (seed.toJSON().children![target].runs![0] as {text: string}).text.length;
    let receive!: (event: ServerEvent) => void;
    const client = new SyncClient("receiver", {
        subscribe: (_since, listener) => { receive = listener; return () => undefined; },
        send: async () => undefined, sendPresence: () => undefined,
    }, {schema});
    client.connect();
    receive({type: "hello", protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, epoch: "capability-benchmark", serverSeq: 1, snapshot: seed.snapshot(), delSeqs: [], presence: []});
    const sender = Doc.fromSnapshot("sender", seed.snapshot(), schema);
    let mirror = client.doc.toJSON(), events: EditOp[] = [], reads = 0;
    const read = client.doc.toJSON.bind(client.doc);
    client.doc.toJSON = () => { reads += 1; return read(); };
    client.onModelEvents = next => { events = next; };
    const rawMs: number[] = [], fullModelReads: number[] = [];
    for (let i = 0; i < samples + warmups; i += 1) {
        const edit: EditOp = mode === "field-write"
            ? {op: "update", at: [target], attrs: {appearance: {spacing: i + 1}}}
            : {op: "insert", at: [target, 50 + i], content: "a"};
        const ops = sender.edit([edit]).ops;
        events = []; reads = 0;
        const start = performance.now();
        receive({type: "change", envelope: {serverSeq: i + 2, change: {actor: "sender", seq: i + 1, ops}}});
        const elapsed = performance.now() - start;
        if (i >= warmups) { rawMs.push(elapsed); fullModelReads.push(reads); }
        mirror = applyEdits(schema, mirror, events);
        const expected = sender.toJSON();
        assert.deepEqual(mirror, expected); assert.deepEqual(read(), expected);
        const block = expected.children![target];
        if (mode === "field-write") assert.deepEqual(block.attrs, {appearance: {spacing: i + 1, tone: "plain"}});
        else assert.equal((block.runs![0] as {text: string}).text.replaceAll("a", "").length, baseLength);
    }
    assert.equal(client.eventStats.fallbacks, 0); client.disconnect();
    const sorted = [...rawMs].sort((a, b) => a - b);
    return {chars, paragraphs, mode, samples, warmups, p50: sorted[Math.floor(samples * .5)], p95: sorted[Math.floor(samples * .95)], max: sorted.at(-1), rawMs, fullModelReads, correct: true, fallbacks: client.eventStats.fallbacks};
}));
const sourcePaths = ["benchmarks/capabilities.ts", "packages/doc-sync/src/crdt/doc.ts", "packages/doc-sync/src/crdt/model.ts", "packages/doc-sync/src/sync/client.ts", "packages/doc-sync/src/sync/model-events.ts"];
const result = {startedAt, endedAt: new Date().toISOString(), node: process.version, startedLoad, endedLoad: loadavg(), metric: "synchronous change receipt through model-events callback; excludes initialization, mirror verification, annotation reads, network and DOM", rows, sourceHashes: sourcePaths.map(path => ({path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex")}))};
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n", {flag: "wx"});
console.log(JSON.stringify(rows.map(({rawMs, fullModelReads, ...row}) => ({...row, fullModelReads: [...new Set(fullModelReads)]})), null, 2));
