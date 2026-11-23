import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { SEED, KINDS, initialUnits, trace, asString, oracleSplice, equalText, checksum } from './storage-workload.mjs';
import { GAP_CAPACITY } from './js-gap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binary = resolve(root, 'target/release/native-gap-compare');
const jsRunner = resolve(root, 'scripts/native-gap-node.mjs');
const fixtureDir = resolve(root, 'target/native-gap-fixtures');
const receiptPath = resolve(root, 'receipt-native-gap-node24-r1.json');
const seeds = [SEED, 192837465], samples = 7, warmups = 5;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = path => sha(readFileSync(path));
const command = runtime => runtime === 'rust-native' ? [binary, []] : [process.execPath, [jsRunner]];
const sourcePaths = ['scripts/native-gap-compare.mjs', 'scripts/native-gap-node.mjs', 'scripts/js-gap.mjs', 'scripts/storage-workload.mjs', 'src/native_gap_compare.rs', 'src/gap.rs', 'src/lib.rs', 'Cargo.toml', 'Cargo.lock'];
const snapshotSources = () => Object.fromEntries(sourcePaths.map(path => [path, hashFile(resolve(root, path))]));
function encode(initial, ops) {
  const size = 8 + 4 + 4 + initial.length * 2 + 4 + ops.reduce((sum, op) => sum + 12 + 2 * op.insert.length, 0);
  const bytes = Buffer.alloc(size); bytes.write('NGAP0001'); let offset = 8;
  const u32 = n => { bytes.writeUInt32LE(n, offset); offset += 4; };
  const units = value => { for (const unit of value) { bytes.writeUInt16LE(unit, offset); offset += 2; } };
  u32(GAP_CAPACITY); u32(initial.length); units(initial); u32(ops.length);
  for (const op of ops) { u32(op.at); u32(op.remove); u32(op.insert.length); units(op.insert); }
  return bytes;
}
function fixture(name, initial, ops) {
  const bytes = encode(initial, ops), path = resolve(fixtureDir, `${name}.bin`); writeFileSync(path, bytes);
  return { name, path, sha256: sha(bytes), bytes: bytes.length, initial, ops };
}
function expectedState(data) { let text = asString(data.initial); for (const op of data.ops) text = oracleSplice(text, op.at, op.remove, op.insert); return text; }
function execute(runtime, mode, path, extra = []) {
  const [exe, prefix] = command(runtime);
  const result = spawnSync(exe, [...prefix, '--mode', mode, '--trace', path, ...extra], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`${runtime}/${mode}: ${result.error || result.stderr}`);
  return result.stdout.trim().split('\n').map(line => JSON.parse(line));
}
function checkUnits(units, expected, label) { equalText(units, expected, label); }
function correctness(data) {
  const outputs = ['node24-js-gap', 'rust-native'].map(runtime => execute(runtime, 'correctness', data.path));
  let expected = asString(data.initial), rejected = 0;
  if (outputs.some(rows => rows.length !== data.ops.length + 1)) throw Error('correctness row count');
  for (let step = -1; step < data.ops.length; step++) {
    let expectedStatus = 0;
    if (step >= 0) {
      const op = data.ops[step];
      if (op.at > expected.length || op.remove > expected.length - op.at) expectedStatus = -3;
      else if (op.insert.length > GAP_CAPACITY - (expected.length - op.remove)) expectedStatus = -4;
      else expected = oracleSplice(expected, op.at, op.remove, op.insert);
      if (expectedStatus) rejected++;
    }
    for (let runtime = 0; runtime < outputs.length; runtime++) {
      const row = outputs[runtime][step + 1];
      if (row.step !== step || row.status !== expectedStatus) throw Error(`error parity ${data.name}/${step}: ${JSON.stringify({ status: row.status, expectedStatus })}`);
      checkUnits(row.units, expected, `${data.name}/${step}/${runtime}`);
    }
    if (outputs[0][step + 1].storage_units !== outputs[1][step + 1].storage_units) throw Error(`storage growth parity ${data.name}/${step}`);
  }
  return { fixture: data.name, sha256: data.sha256, initialUnits: data.initial.length, operations: data.ops.length, rejected, fullStateAfterEveryOperation: true, finalUnits: expected.length };
}
async function memory(runtime, data, expected) {
  const [exe, prefix] = command(runtime), child = spawn(exe, [...prefix, '--mode', 'memory', '--trace', data.path], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', b => { stderr += b; });
  const done = new Promise((accept, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? accept() : reject(Error(`${runtime} memory: ${code}: ${stderr}`))); });
  const phases = [], rows = createInterface({ input: child.stdout }); let verified = false;
  for await (const line of rows) {
    const row = JSON.parse(line);
    if (row.phase) {
      const rss = spawnSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' });
      if (rss.status !== 0 || !/^\s*\d+\s*$/.test(rss.stdout)) throw Error(`RSS observation failed ${runtime}/${row.phase}`);
      phases.push({ phase: row.phase, rssKiB: Number(rss.stdout.trim()), ...(row.supplementaryNodeMemoryUsage ? { supplementaryNodeMemoryUsageBytes: row.supplementaryNodeMemoryUsage } : {}) });
      child.stdin.write('\n');
    } else if (row.units) { checkUnits(row.units, expected, `${runtime} memory full output`); verified = true; }
  }
  await done;
  if (!verified || phases.map(row => row.phase).join() !== 'baseline,loaded,constructed,edited,materialized,released') throw Error('memory protocol/check');
  const observations = phases.map((row, index) => ({ ...row, observedDeltaFromPriorPhaseKiB: index ? row.rssKiB - phases[index - 1].rssKiB : null }));
  return { runtime, pid: child.pid, phases: observations, fullOutputOracle: 'PASS' };
}
mkdirSync(fixtureDir, { recursive: true });
const started = new Date().toISOString(), sourcesBefore = snapshotSources(), binaryBefore = hashFile(binary);
if (!process.version.startsWith('v24.')) throw Error(`Node24 required: ${process.version}`);
if (process.platform !== 'darwin') throw Error('RSS receipt currently specifies Darwin ps KiB');
const small = [];
for (const seed of seeds) for (const kind of KINDS) small.push(fixture(`small-${seed}-${kind}`, initialUnits(128), trace(kind, 128, 4000, seed)));
small.push(fixture('errors-and-growth', new Uint16Array([0, 0xd800, 0xdfff, 0xffff]), [
  { at: 5, remove: 0, insert: new Uint16Array([1]) }, { at: 0, remove: 5, insert: new Uint16Array() },
  { at: 0xffffffff, remove: 0xffffffff, insert: new Uint16Array() },
  { at: 0, remove: 0, insert: new Uint16Array(GAP_CAPACITY) },
  { at: 0, remove: 0, insert: initialUnits(2000) }, { at: 1, remove: 1999, insert: new Uint16Array([0xd800]) },
  { at: 0, remove: 0, insert: initialUnits(131) }, { at: 137, remove: 0, insert: initialUnits(257) },
  { at: 0, remove: 394, insert: new Uint16Array() },
]));
const differential = small.map(correctness);
const benchmarks = [], memoryResults = [];
for (const seed of seeds) for (const kind of KINDS) {
  const data = fixture(`bench-${seed}-${kind}`, initialUnits(100000), trace(kind, 100000, 10000, seed)), expected = expectedState(data);
  const rows = [], orders = [];
  for (let sample = 0; sample < samples; sample++) {
    const order = (sample + seeds.indexOf(seed) + KINDS.indexOf(kind)) % 2 ? ['rust-native', 'node24-js-gap'] : ['node24-js-gap', 'rust-native']; orders.push(order);
    for (const runtime of order) {
      const [row] = execute(runtime, 'bench', data.path, ['--warmup', String(warmups)]);
      checkUnits(row.units, expected, `${runtime}/${kind}/${seed}/${sample}`);
      const { units, ...timings } = row;
      rows.push({ sample, ...timings, pipeline_ms: row.construction_ms + row.edits_ms + row.materialization_ms, fullOutputOracle: 'PASS' });
    }
  }
  benchmarks.push({ kind, seed, initialUnits: data.initial.length, rounds: data.ops.length, samples, warmupsPerFreshSampleProcess: warmups, fixtureSha256: data.sha256, fixtureBytes: data.bytes, finalUnits: expected.length, checksum: checksum(Uint16Array.from({ length: expected.length }, (_, i) => expected.charCodeAt(i))), orders, rawSamples: rows });
  for (const runtime of ['node24-js-gap', 'rust-native']) memoryResults.push({ kind, seed, fixtureSha256: data.sha256, ...await memory(runtime, data, expected) });
  process.stderr.write(`completed ${seed}/${kind}\n`);
}
const sourcesAfter = snapshotSources(), binaryAfter = hashFile(binary);
if (JSON.stringify(sourcesBefore) !== JSON.stringify(sourcesAfter) || binaryBefore !== binaryAfter) throw Error('source or binary changed during measurements');
const receipt = {
  status: 'PASS', scope: 'Isolated Node24 JavaScript Gap versus native Rust Gap. No WASM, CRDT, editor or production integration.', started, completed: new Date().toISOString(),
  conditions: { node: process.version, nodeExecutable: process.execPath, nodeExecutableSha256: hashFile(process.execPath), platform: process.platform, arch: process.arch, os: os.release(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ambientRustc: spawnSync('rustc', ['--version'], { encoding: 'utf8' }).stdout.trim(), buildCompiler: spawnSync('rustup', ['run', 'stable', 'rustc', '--version'], { encoding: 'utf8' }).stdout.trim(), buildCommand: 'cargo +stable build --release --manifest-path experiments/rust-core/Cargo.toml --bin native-gap-compare', buildCompilerSource: 'Native runner owner build command, independently queried stable toolchain version', binary: relative(root, binary), binarySha256: binaryBefore, optimization: 'cargo build --release, Cargo profile lto=true codegen-units=1 panic=abort', concurrency: 'Sequential child processes; one measured runtime at a time. External machine load not controlled.', warmups, samples },
  algorithm: 'Initial initialized gap 64; overlapping gap movement; delete before growth; extra=max(required-gap,floor(post-delete logical length/2),64); fresh contiguous output. Rust Vec allocator capacity may differ from initialized units.',
  timingBoundary: 'Fresh process per runtime/sample; prepared binary trace parsing and process startup excluded. Five untimed complete warmups in the same process. Construction includes copying initial units. Edit phase includes the runtime native API and validation. Fresh materialization allocates/copies output. Pipeline equals per-sample phase sum. JSON, IPC, independent oracle, hashing, and release excluded.',
  fairnessLimits: 'Node JIT/GC versus Rust release compilation; Vec and TypedArray allocators differ. Native runner uses Result/capacity checks and JS uses RangeError/capacity checks. This is bounded storage/runtime comparison, not a language-wide claim.',
  differential: { status: 'PASS', oracle: 'Independent UTF-16 JavaScript string slice, each full code unit checked after every operation against both runtimes; status and initialized storage growth parity checked.', traces: differential },
  benchmarks, memory: { method: 'Fresh separate subprocess per runtime/trace; parent observes ps -o rss= -p PID on Darwin in KiB while child pauses. Baseline is before trace loading. No forced GC. RSS snapshots are total process/runtime plus retained trace, not allocator heap or peak. Adjacent phase deltas are observed changes only. Released drops Gap and materialized output but retains parsed trace; GC/allocator may retain pages. Full-output JSON serialization occurs after materialized snapshot and before released snapshot. Node memoryUsage is supplementary bytes and not a cross-runtime comparator.', measurements: memoryResults },
  sourceFreeze: { status: 'PASS', before: sourcesBefore, after: sourcesAfter, binaryBefore, binaryAfter },
};
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, receipt: receiptPath, differentialOperations: differential.reduce((n, d) => n + d.operations, 0), pairedSamples: benchmarks.length * samples, memoryRuns: memoryResults.length }));
