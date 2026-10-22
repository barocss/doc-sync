import {ours} from "./engines.ts";
import {makeTrace} from "./trace.ts";

/**
 * ours 의 로컬 편집·받기만 돌린다 — CPU 프로파일용.
 *   node --cpu-prof --cpu-prof-dir=benchmarks/results/prof benchmarks/profile.ts 10000
 */

const size = Number(process.argv[2] ?? 10000);
const trace = makeTrace(size, 1);
const a = ours.create("A");
const payloads = trace.ops.map(op => a.local(op));
const b = ours.create("B");

payloads.forEach(p => b.remote(p));
console.log(trace.ops.length, "ops", b.paragraphs().length, "paragraphs");
