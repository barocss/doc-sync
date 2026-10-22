import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {ENGINES} from "./engines.ts";
import {makeTrace} from "./trace.ts";
import type {Engine, Payload, Replica} from "./engines.ts";

/**
 * 단계 0 기준 측정. 같은 대본을 엔진마다 돌려 시간·크기·메모리를 잰다.
 *
 *   npm run bench                              기본: 1만·10만 자
 *   npm run bench -- --chars 20000 --seed 3    크기·씨앗 바꾸기
 *   npm run bench -- --engines ours            엔진 고르기
 *
 * 잰 것
 *   local    로컬 편집 하나 (연산 만들기 + 적용 + 보낼 꼴로 바꾸기)      p50 · p95 · max · 합계
 *   remote   받은 것 하나 적용 (꼴 풀기 + 적용)                          p50 · p95 · 합계
 *   server   서버가 받은 것 하나 검사 + 적용 (ours 만)                   p50 · p95 · 합계
 *   read     문단 글 한 번 읽기 (ours 는 toJSON — 모델 계산)
 *   bytes    편집 하나가 전선에 싣는 바이트 (평균, 한 글자 넣기 평균). ours 는 JSON, Yjs 는 이진 — 꼴이 달라 공정하지 않다
 *   save     저장 크기와 시간, load 불러오기 시간
 *   heap     받은 것을 모두 적용한 복제본 하나의 힙 증가량 (--expose-gc 필요)
 *
 * 결과는 화면에 표로, benchmarks/results/<날짜>-<크기>.json 에 그대로 남긴다.
 */

const args = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
    const i = args.indexOf(`--${name}`);

    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SIZES = arg("chars", "10000,100000").split(",").map(Number);
const SEED = Number(arg("seed", "1"));
const PICK = arg("engines", ENGINES.map(e => e.name).join(",")).split(",");
const OUT = arg("out-dir", join(dirname(fileURLToPath(import.meta.url)), "results"));

type Stats = {p50: number; p95: number; max: number; total: number};

const now = (): number => Number(process.hrtime.bigint()) / 1e6;

const stats = (ms: number[]): Stats => {
    const sorted = [...ms].sort((a, b) => a - b);
    const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

    return {p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0, total: ms.reduce((a, b) => a + b, 0)};
};

const gc = (): void => (globalThis as {gc?: () => void}).gc?.();

const heap = (): number => {
    gc();
    gc();

    return process.memoryUsage().heapUsed;
};

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

const measure = (engine: Engine, size: number) => {
    const trace = makeTrace(size, SEED);
    const a = engine.create("A");
    const payloads: Payload[] = [];
    const local: number[] = [];

    trace.ops.forEach(op => {
        const t = now();

        payloads.push(a.local(op));
        local.push(now() - t);
    });

    const okLocal = same(a.paragraphs(), trace.final);
    const b = engine.create("B");
    const remote: number[] = [];

    payloads.forEach(p => {
        const t = now();

        b.remote(p);
        remote.push(now() - t);
    });

    const okRemote = same(b.paragraphs(), trace.final);
    let server: Stats | null = null;

    if (engine.server) {
        const s = engine.server();
        const times: number[] = [];

        payloads.forEach(p => {
            const t = now();

            s.submit(p);
            times.push(now() - t);
        });
        server = stats(times);
    }

    let t = now();
    const read = (a.paragraphs(), now() - t);

    t = now();
    const saved = a.encode();
    const saveMs = now() - t;

    t = now();
    const c = engine.load("C", saved);
    const loadMs = now() - t;
    const okLoad = same(c.paragraphs(), trace.final);

    const bytes = payloads.map(p => engine.bytes(p));
    const oneChar = trace.ops.flatMap((op, i) => (op.t === "ins" && op.s.length === 1 ? [bytes[i]] : []));

    // 힙 — 받은 것을 모두 적용한 새 복제본 하나
    const before = heap();
    const keep: Replica = engine.create("D");

    payloads.forEach(p => keep.remote(p));

    const heapBytes = heap() - before;

    keep.paragraphs();

    return {
        engine: engine.name,
        chars: trace.final.reduce((n, p) => n + p.length, 0),
        paragraphs: trace.final.length,
        ops: trace.ops.length,
        correct: okLocal && okRemote && okLoad,
        local: stats(local),
        remote: stats(remote),
        server,
        readMs: read,
        bytes: {total: bytes.reduce((x, y) => x + y, 0), mean: bytes.reduce((x, y) => x + y, 0) / bytes.length, oneChar: oneChar.reduce((x, y) => x + y, 0) / oneChar.length},
        save: {bytes: engine.bytes(saved), ms: saveMs, loadMs},
        heapBytes,
    };
};

const ms = (x: number): string => (x < 0.01 ? x.toFixed(4) : x < 10 ? x.toFixed(3) : x.toFixed(0));
const kb = (x: number): string => `${(x / 1024).toFixed(0)}KB`;

mkdirSync(OUT, {recursive: true});
console.log(`씨앗 ${SEED} · Node ${process.version}${(globalThis as {gc?: unknown}).gc ? "" : " · --expose-gc 없음 (힙 값은 믿지 말 것)"}\n`);

SIZES.forEach(size => {
    const rows = ENGINES.filter(e => PICK.includes(e.name)).map(e => {
        const started = now();
        const r = measure(e, size);

        console.log(`  ${e.name} ${size}자 — ${((now() - started) / 1000).toFixed(1)}초`);

        return r;
    });
    const first = rows[0];

    console.log(`\n## ${first.chars.toLocaleString()}자 · 문단 ${first.paragraphs.toLocaleString()} · 편집 ${first.ops.toLocaleString()}\n`);
    console.log("| 엔진 | 맞음 | local p50/p95/max ms | local 합 ms | remote p50/p95 ms | remote 합 ms | server 합 ms | read ms | 편집당 B (한 글자) | 저장 | 저장/불러오기 ms | 힙 |");
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
    rows.forEach(r =>
        console.log(
            `| ${r.engine} | ${r.correct ? "✓" : "✗"} | ${ms(r.local.p50)} / ${ms(r.local.p95)} / ${ms(r.local.max)} | ${ms(r.local.total)} | ${ms(r.remote.p50)} / ${ms(r.remote.p95)} | ${ms(r.remote.total)} | ${r.server ? ms(r.server.total) : "—"} | ${ms(r.readMs)} | ${r.bytes.mean.toFixed(0)} (${r.bytes.oneChar.toFixed(0)}) | ${kb(r.save.bytes)} | ${ms(r.save.ms)} / ${ms(r.save.loadMs)} | ${kb(r.heapBytes)} |`,
        ),
    );
    console.log("");
    writeFileSync(join(OUT, `${new Date().toISOString().slice(0, 10)}-${size}.json`), `${JSON.stringify({seed: SEED, node: process.version, rows}, null, 1)}\n`);
});
