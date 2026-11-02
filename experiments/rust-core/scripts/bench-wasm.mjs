import { javascript as workload } from './workload.mjs';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const rounds = Number(process.argv[2] ?? 1000);
const samples = Number(process.argv[3] ?? 7);
if (!Number.isInteger(rounds) || rounds < 0 || rounds > 100_000 ||
    !Number.isInteger(samples) || samples < 1 || samples > 1000) {
  throw new Error('rounds must be 0..100000; samples must be 1..1000');
}
const path = new URL('../target/wasm32-unknown-unknown/release/doc_sync_rust_experiment.wasm', import.meta.url);
const { instance } = await WebAssembly.instantiate(await readFile(path), {});
const javascript = () => workload(rounds);
const wasm = () => instance.exports.benchmark_checksum(rounds) >>> 0;


const expected = javascript();
if (wasm() !== expected) throw new Error('JavaScript/WASM checksum mismatch');
if ((instance.exports.benchmark_checksum(100_001) >>> 0) !== 0) throw new Error('missing bounds check');
for (const [runtime, run] of [['javascript-typed-array', javascript], ['rust-wasm', wasm]]) {
  for (let i = 0; i < 3; i++) run();
  const milliseconds = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const checksum = run();
    milliseconds.push(performance.now() - start);
    if (checksum !== expected) throw new Error(`${runtime} checksum mismatch`);
  }
  console.log(JSON.stringify({ runtime, node: process.version, executable: process.execPath, rounds, samples, checksum: expected, milliseconds }));
}
