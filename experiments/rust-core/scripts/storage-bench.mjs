import { readFile, writeFile } from 'node:fs/promises';
import { runStorageSuite } from './storage-suite.mjs';
const rounds = Number(process.argv[2] ?? 10000), samples = Number(process.argv[3] ?? 7);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100000 || !Number.isInteger(samples) || samples < 1 || samples > 100) throw new Error('rounds 1..100000; samples 1..100');
const wasmPath = new URL('../target/wasm32-unknown-unknown/release/doc_sync_rust_experiment.wasm', import.meta.url);
const { instance } = await WebAssembly.instantiate(await readFile(wasmPath), {});
const receipt = { ...runStorageSuite(instance.exports, { rounds, samples }), node: process.version, executable: process.execPath };
if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
