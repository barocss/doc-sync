import { JsGapStorage, GAP_CAPACITY } from './js-gap.mjs';
import { WasmStorage } from './storage-wasm.mjs';
import { SEED, KINDS, initialUnits, trace, asString, oracleSplice, equalText, checksum } from './storage-workload.mjs';

export const SOURCE_FILES = ['scripts/gap-compare-suite.mjs', 'scripts/gap-compare-check.mjs', 'scripts/gap-compare-browser.html', 'scripts/js-gap.mjs', 'scripts/storage-wasm.mjs', 'scripts/storage-workload.mjs', 'src/lib.rs', 'src/gap.rs', 'src/storage_wasm.rs', 'src/storage_trace.rs', 'Cargo.toml', 'Cargo.lock'];
export const WASM_FILE = 'target/wasm32-unknown-unknown/release/doc_sync_rust_experiment.wasm';
export const SEEDS = [SEED, 192837465];
function rejected(action, label) {
  try { action(); } catch (error) { return error.constructor.name; }
  throw new Error(`${label}: expected rejection`);
}
function paired(exports) { return [new JsGapStorage(), new WasmStorage(exports, 1)]; }
function assertFresh(backends, text) {
  for (const backend of backends) {
    const first = backend.read(), second = backend.read();
    if (first === second || first.buffer === second.buffer) throw new Error('read must return fresh storage');
    if (first.length) first[0] ^= 0xffff;
    equalText(backend.read(), text, 'read copy isolation');
  }
}
export function gapDifferential(exports, { rounds = 10000, initialLength = 100000, seeds = SEEDS } = {}) {
  const backends = paired(exports);
  let text = '', operations = 0, invalid = 0, maximumInitializedUnits = 0;
  function check(label) {
    for (const backend of backends) equalText(backend.read(), text, label);
    maximumInitializedUnits = Math.max(maximumInitializedUnits, backends[0].snapshot().storageUnits);
  }
  function init(units) { for (const backend of backends) backend.init(units); text = asString(units); check('init'); }
  function apply(at, remove, insert, fails = false) {
    if (fails) {
      const errors = backends.map(backend => rejected(() => backend.splice(at, remove, insert), 'invalid edit'));
      if (errors[0] !== errors[1]) throw new Error(`rejection types differ: ${errors}`);
      invalid++;
    } else {
      text = oracleSplice(text, at, remove, insert);
      for (const backend of backends) backend.splice(at, remove, insert);
    }
    check(`full state after operation ${operations++}`);
  }
  for (const backend of backends) {
    for (const action of [() => backend.length(), () => backend.read(), () => backend.splice(0, 0, new Uint16Array()), () => backend.clear()]) rejected(action, 'missing state');
  }
  init(new Uint16Array([0, 0xac00, 0xd83d, 0xde00, 0xd800, 0xffff, 0x301]));
  apply(3, 1, new Uint16Array([0xdfff]));
  apply(text.length, 0, new Uint16Array([0xde00, 0]));
  apply(0, 0, new Uint16Array()); apply(-0, 0, new Uint16Array([1]));
  for (const [at, remove] of [[-1, 0], [NaN, 0], [Infinity, 0], [0, -1], [0, 1.5], [2 ** 32, 0], [Number.MAX_SAFE_INTEGER, 0], [Object(1), 0], ['1', 0], [text.length + 1, 0], [0, text.length + 1]]) apply(at, remove, new Uint16Array([42]), true);
  for (const input of [[], new Uint8Array([1]), null, {}, new DataView(new ArrayBuffer(2))]) apply(0, 0, input, true);
  const hostile = new Uint16Array([0xd800, 0, 0xdfff]);
  Object.defineProperties(hostile, { length: { get() { throw Error('own length'); } }, buffer: { get() { throw Error('own buffer'); } }, byteOffset: { get() { throw Error('own offset'); } }, set: { get() { throw Error('own set'); } } });
  // The oracle reads ordinary inputs only; the tested adapters must use intrinsic bounds.
  for (const backend of backends) backend.splice(0, 0, hostile);
  text = String.fromCharCode(0xd800, 0, 0xdfff) + text; operations++; check('hostile own properties');
  const detached = new Uint16Array([12]); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  apply(0, 0, detached, true);
  const oversized = new Uint16Array(GAP_CAPACITY + 1);
  Object.defineProperty(oversized, 'length', { value: 0 });
  apply(0, 0, oversized, true);
  for (const backend of backends) rejected(() => backend.init(oversized), 'oversized init'); check('failed init atomic');
  apply(0, text.length, new Uint16Array());
  // Growth, movement in both directions, shrink, and replacement at capacity.
  apply(0, 0, initialUnits(200000)); apply(1, 199999, new Uint16Array([0xd800]));
  apply(0, 0, initialUnits(131)); apply(text.length, 0, initialUnits(257));
  init(initialUnits(GAP_CAPACITY));
  apply(0, 0, new Uint16Array([1]), true);
  apply(0, 1, new Uint16Array([0xdfff]));
  apply(0, GAP_CAPACITY, initialUnits(GAP_CAPACITY));
  assertFresh(backends, text);
  apply(0, GAP_CAPACITY, new Uint16Array());
  const previousBuffer = exports.memory.buffer; exports.memory.grow(1);
  apply(0, 0, new Uint16Array([0xd800, 0, 0xdfff]));
  const memoryGrowth = { oldBufferDetached: previousBuffer.byteLength === 0, currentBytes: exports.memory.buffer.byteLength };
  const traces = [];
  for (const seed of seeds) for (const kind of KINDS) {
    init(initialUnits(initialLength));
    for (const op of trace(kind, initialLength, rounds, seed)) apply(op.at, op.remove, op.insert);
    assertFresh(backends, text);
    traces.push({ seed, kind, operations: rounds, finalUnits: text.length, checksum: checksum(backends[0].read()), initializedGapUnits: backends[0].snapshot().storageUnits });
  }
  for (const backend of backends) { backend.clear(); rejected(() => backend.read(), 'clear'); backend.init(new Uint16Array()); equalText(backend.read(), '', 'reinit'); backend.clear(); }
  return { status: 'PASS', operations, invalid, fullStateAfterEveryOperation: true, oracle: 'independent JavaScript UTF-16 string slice; each code unit compared', readCopies: 'fresh output and mutation isolation checked', memoryGrowth, maximumJsInitializedGapUnits: maximumInitializedUnits, traces };
}
export function gapBenchmark(exports, { rounds = 10000, samples = 7, initialLength = 100000, seeds = SEEDS } = {}) {
  const benchmarks = [];
  for (const seed of seeds) for (const kind of KINDS) {
    const input = initialUnits(initialLength), edits = trace(kind, initialLength, rounds, seed);
    let expected = asString(input);
    for (const op of edits) expected = oracleSplice(expected, op.at, op.remove, op.insert);
    const names = ['javascript-gap', 'rust-wasm-gap'];
    const backends = paired(exports);
    const results = names.map(runtime => ({ runtime, construction_ms: [], edits_ms: [], materialization_ms: [], pipeline_ms: [] }));
    let jsInitializedGapUnits;
    function run(index, record) {
      const backend = backends[index], times = results[index];
      let start = performance.now(); backend.init(input); const construction = performance.now() - start;
      start = performance.now(); for (const op of edits) backend.splice(op.at, op.remove, op.insert); const edit = performance.now() - start;
      start = performance.now(); const output = backend.read(); const materialization = performance.now() - start;
      equalText(output, expected, `${kind}/${seed}/${names[index]}`);
      if (index === 0) jsInitializedGapUnits = backend.snapshot().storageUnits;
      backend.clear();
      if (record) { times.construction_ms.push(construction); times.edits_ms.push(edit); times.materialization_ms.push(materialization); times.pipeline_ms.push(construction + edit + materialization); }
    }
    for (let index = 0; index < 2; index++) run(index, false);
    const orders = [];
    for (let sample = 0; sample < samples; sample++) {
      const order = (sample + seeds.indexOf(seed) + KINDS.indexOf(kind)) % 2 ? [1, 0] : [0, 1];
      orders.push(order.map(index => names[index]));
      for (const index of order) run(index, true);
    }
    benchmarks.push({ kind, seed, initialUnits: initialLength, rounds, samples, warmupsPerRuntime: 1, finalUnits: expected.length, checksum: checksum(Uint16Array.from({ length: expected.length }, (_, i) => expected.charCodeAt(i))), orders, storage: { jsInitializedGapUnits, rustInitializedGapUnitsFromSameAlgorithm: jsInitializedGapUnits, rustStorageDirectlyObserved: false, wasmScratchUnits: 2 * GAP_CAPACITY, note: 'Initialized lengths only. Vec allocator capacity, JavaScript heap, and RSS are not measured.' }, results });
  }
  return benchmarks;
}
export function runGapSuite(exports, options) {
  if (exports.storage_api_version() !== 1 || exports.storage_capacity() !== GAP_CAPACITY) throw new Error('storage ABI mismatch');
  return { status: 'PASS', scope: 'Same gap algorithm in JavaScript and existing Rust WASM backend 1; isolated UTF-16 storage, no editor or CRDT integration', algorithm: 'Initial gap 64; move gap with overlapping copy; delete before growth; extra=max(required-gap,floor(logicalLength/2),64); fresh read output', timingBoundary: 'API-inclusive JavaScript to WASM path. Includes input validation, per-edit scratch copy, ABI calls and Rust mutex. Rust Vec allocation and JavaScript TypedArray allocation differ. No pure-language speed claim.', timers: 'Construction includes input copy. Edits use identical prepared Uint16Array inputs. Materialization includes fresh output copy. Pipeline is the per-sample sum of the three phases. Trace preparation, oracle, checks, hashing, drop and module instantiation are excluded.', differential: gapDifferential(exports, options), benchmarks: gapBenchmark(exports, options) };
}
