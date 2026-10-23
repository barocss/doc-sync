import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {performance} from "node:perf_hooks";
import {fileURLToPath} from "node:url";
import {applyEdits, Doc} from "@barocss/doc-sync";
import {SyncClient} from "@barocss/doc-sync/sync";
import type {EditOp, Schema} from "@barocss/doc-sync";
import type {ServerEvent} from "@barocss/doc-sync/sync";

/** 이벤트 수신부터 구독 콜백 종료까지. 거울 적용·네트워크·DOM은 측정 밖에서 검증한다. */
const args = process.argv.slice(2);
const argument = (name: string, fallback: string): string => {
    const index = args.indexOf(`--${name}`);

    return index < 0 ? fallback : args[index + 1] ?? "";
};
const samples = Number(argument("samples", "30"));
const warmups = 5;
const sizes = argument("chars", "10000,100000").split(",").map(Number);
const output = argument("out", "");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema: Schema = {
    root: "content", marks: ["bold"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text", children: []},
    },
};

assert.ok(Number.isSafeInteger(samples) && samples > 0, "samples must be a positive integer");
assert.ok(sizes.length && sizes.every(n => Number.isSafeInteger(n) && n >= 160), "chars must be integers >= 160");

const rows = sizes.map(chars => {
    const paragraphs = Math.ceil(chars / 160);
    const seed = new Doc("seed", schema);

    seed.edit([
        {op: "delete", at: [0], count: 1},
        {op: "insert", at: [0], content: Array.from({length: paragraphs}, (_, i) => ({type: "paragraph",
            runs: [{text: "x".repeat(Math.min(160, chars - i * 160)), marks: {}}]}))},
    ]);

    let receive: (event: ServerEvent) => void = () => undefined;
    const client = new SyncClient("receiver", {
        subscribe: (_since, listener) => { receive = listener; return () => undefined; },
        send: async () => undefined,
        sendPresence: () => undefined,
    }, {schema});

    client.connect();
    receive({type: "hello", serverSeq: 1, snapshot: seed.snapshot(), delSeqs: [], presence: []});
    client.disconnect();

    const sender = Doc.fromSnapshot("sender", seed.snapshot(), schema);
    let events: EditOp[] = [];

    client.onModelEvents = next => { events = next; };

    let mirror = client.doc.toJSON();
    const read = client.doc.toJSON.bind(client.doc);
    let reads = 0;

    client.doc.toJSON = () => { reads += 1; return read(); };

    const rawMs: number[] = [];
    const fullModelReads: number[] = [];

    for (let i = 0; i < warmups + samples; i += 1) {
        const ops = sender.edit([{op: "insert", at: [Math.floor(paragraphs / 2), 50 + i], content: "a"}]).ops;

        events = [];
        reads = 0;
        const start = performance.now();

        receive({type: "change", envelope: {serverSeq: i + 2, change: {actor: "sender", seq: i + 1, ops}}});

        const elapsed = performance.now() - start;

        if (i >= warmups) {
            rawMs.push(elapsed);
            fullModelReads.push(reads);
        }

        mirror = applyEdits(schema, mirror, events);
        assert.deepEqual(mirror, read());
    }

    assert.deepEqual(mirror, sender.toJSON());
    assert.equal(client.eventStats.fallbacks, 0);
    const sorted = [...rawMs].sort((a, b) => a - b);

    return {chars, paragraphs, samples, warmups,
        p50: sorted[Math.floor(samples * 0.5)], p95: sorted[Math.floor(samples * 0.95)], max: sorted.at(-1),
        fullModelReads, correct: true, fallbacks: client.eventStats.fallbacks, rawMs};
});
const sources = ["packages/doc-sync/src/sync/client.ts", "packages/doc-sync/src/sync/model-events.ts",
    "packages/doc-sync/src/crdt/doc.ts", "packages/doc-sync/src/crdt/model.ts", "benchmarks/remote.ts"];
const result = {
    at: new Date().toISOString(), node: process.version, label: argument("label", "current"),
    metric: "synchronous event receipt through model-events callback; excludes mirror application, network, DOM",
    unit: "ms", rows,
    sourceHashes: sources.filter(path => existsSync(resolve(root, path)))
        .map(path => ({path, sha256: createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")})),
};

if (output) {
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, JSON.stringify(result, null, 2) + "\n", {flag: "wx"});
}

console.log(JSON.stringify(rows.map(({rawMs, fullModelReads, ...row}) => ({...row, fullModelReads: [...new Set(fullModelReads)]})), null, 2));
