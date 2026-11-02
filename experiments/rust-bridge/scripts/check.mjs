import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { differential, benchmark } from './suite.mjs';
import { Utf16Bridge } from './bridge.mjs';

const wasmUrl = new URL('../target/wasm32-unknown-unknown/release/doc_sync_rust_bridge.wasm', import.meta.url);
const bytes = await readFile(wasmUrl);
let start = performance.now();
const { instance } = await WebAssembly.instantiate(bytes);
const instantiateMs = performance.now() - start;
start = performance.now();
new Utf16Bridge(instance).dispose();
const firstWrapperInitMs = performance.now() - start;
const sourceHashes = Object.fromEntries(await Promise.all(['bridge.mjs', 'suite.mjs'].map(async name => [
  name, createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex'),
])));
const receipt = {
  timestamp: new Date().toISOString(), runtime: process.version, platform: process.platform,
  arch: process.arch, wasmBytes: bytes.length,
  wasmSha256: createHash('sha256').update(bytes).digest('hex'),
  sourceHashes,
  startup: { instantiateMs, firstWrapperInitMs,
    boundary: 'One cold instantiate from bytes, then first wrapper including fixed scratch allocation; file I/O excluded; single sample' },
  differential: differential(instance), benchmark: benchmark(instance),
};
if (process.argv.includes('--write')) {
  await writeFile(new URL('../receipt-node24.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify(receipt, null, 2));
