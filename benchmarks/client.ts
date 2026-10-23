import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {Doc} from "@barocss/doc-sync";
import {SyncClient} from "@barocss/doc-sync/sync";
import {BENCH_SCHEMA} from "./engines.ts";
import type {EditOp, NodeJSON, Snapshot} from "@barocss/doc-sync";
import type {ServerEvent, Transport} from "@barocss/doc-sync/sync";

/** 로컬 편집 경로 비교. 기존 benchmarks 결과는 덮어쓰지 않는다.
 * node benchmarks/client.ts --label before --out benchmarks/results/client-before.json
 * 같은 머신·Node 에서 다른 시험과 겹치지 않게 실행한다. 네트워크·화면 갱신은 제외한다.
 */
const args = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
    const i = args.indexOf(`--${name}`);

    return i < 0 ? fallback : (args[i + 1] ?? fallback);
};
const SAMPLES = Number(arg("samples", "30"));
const WARMUPS = 5;

const makeClient = (snapshot: Snapshot): SyncClient => {
    const transport: Transport = {
        subscribe: (_since, receive) => {
            receive({type: "hello", epoch: "fixture", protocol: 2, capabilities: ["placement-v1", "fields-v1", "annotations-v1", "cardinality-v1"], serverSeq: 1, snapshot, delSeqs: [], presence: []} satisfies ServerEvent);

            return () => undefined;
        },
        send: async () => undefined,
        sendPresence: () => undefined,
    };
    const client = new SyncClient("edit", transport, {schema: BENCH_SCHEMA});

    client.connect();

    return client;
};

const rows = [10000, 100000].map(chars => {
    const paragraphs = Math.ceil(chars / 160);
    const seed = new Doc("seed", BENCH_SCHEMA);

    seed.edit([
        {op: "delete", at: [0], count: 1},
        {op: "insert", at: [0], content: Array.from({length: paragraphs}, (_, i) => ({type: "paragraph", runs: [{text: "x".repeat(Math.min(160, chars - i * 160)), marks: {}}]}))},
    ]);

    const snapshot = seed.snapshot();
    let expected: NodeJSON | null = null;
    const paths = ["doc", "client", "client-observed"] as const;
    const cases = paths.map(path => {
        const client = path === "doc" ? null : makeClient(snapshot);
        const doc = client?.doc ?? Doc.fromSnapshot("edit", snapshot, BENCH_SCHEMA);
        let notices = 0;
        let normalizations = 0;

        if (client && path === "client-observed") {
            client.onLocalEdits = (_edits, normalize) => {
                notices += 1;
                normalizations += normalize.length;
            };
        }

        doc.toJSON();
        const times: number[] = [];

        for (let i = 0; i < WARMUPS + SAMPLES; i += 1) {
            const edits: EditOp[] = [{op: "insert", at: [Math.floor(paragraphs / 2), 50 + i], content: "a"}];
            const start = performance.now();

            doc.edit(edits);
            const elapsed = performance.now() - start;

            i >= WARMUPS && times.push(elapsed);
        }

        const model = doc.toJSON();

        expected ? assert.deepEqual(model, expected) : (expected = model);
        path === "client-observed" && assert.equal(notices, WARMUPS + SAMPLES);
        assert.equal(normalizations, 0);
        times.sort((a, b) => a - b);

        return {path, p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times.at(-1), notices, normalizations};
    });

    return {chars, paragraphs, correct: true, cases};
});

const result = {
    work_id: "sync-client-local-edit-20261022",
    label: arg("label", "current"),
    node: process.version,
    samples: SAMPLES,
    warmups: WARMUPS,
    unit: "ms",
    rows,
};
const json = `${JSON.stringify(result, null, 2)}\n`;
const out = arg("out", "");

out && writeFileSync(out, json, {flag: "wx"});
console.log(json);
