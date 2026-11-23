import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { differential, benchmark } from './suite.mjs';
import { boundaryBenchmark, startupMeasurement, lifecycleBenchmark } from './boundary-suite.mjs';
import { lifetime } from './lifetime.mjs';

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Run final check on Node 24');
const bytes = await readFile(new URL('../target/wasm32-unknown-unknown/release/doc_sync_rust_bridge.wasm', import.meta.url));
const { instance, startup } = await startupMeasurement(bytes);
const manifest = ['Cargo.toml', 'Cargo.lock', 'src/lib.rs', 'scripts/bridge.mjs', 'scripts/suite.mjs',
  'scripts/lifetime.mjs', 'scripts/boundary-suite.mjs', 'scripts/boundary-check.mjs', 'boundary-browser.html',
  '../rust-core/Cargo.toml', '../rust-core/src/lib.rs', '../rust-core/src/gap.rs', '../rust-core/src/storage_wasm.rs'];
const sourceHashes = Object.fromEntries(await Promise.all(manifest.map(async path => [path,
  createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex')])));
const receipt = {
  schema: 'r3-boundary-v1', status: 'PASS', timestamp: new Date().toISOString(),
  runtime: process.version, platform: process.platform, arch: process.arch,
  wasmBytes: bytes.length, wasmSha256: createHash('sha256').update(bytes).digest('hex'), sourceHashes,
  startup, differential: differential(instance, 4000), lifetime: lifetime(instance),
  boundary: boundaryBenchmark(instance), lifecycleBatches: lifecycleBenchmark(instance), combinedTextTape: benchmark(instance),
};
if (process.argv.includes('--write')) await writeFile(new URL('../receipt-boundary-node24.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
