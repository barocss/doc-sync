import { WasmStorage } from './storage-wasm.mjs';
import { SEED, KINDS, initialUnits, trace, asString, oracleSplice, equalText, checksum } from './storage-workload.mjs';
function mustThrow(action, context) {
  try { action(); } catch { return; }
  throw new Error(`${context}: expected rejection`);
}
export function differential(exports, { rounds = 10000, initialLength = 100000 } = {}) {
  const backends = [new WasmStorage(exports, 0), new WasmStorage(exports, 1)];
  let operations = 0, invalid = 0;
  let text;
  function init(units) { text = asString(units); for (const b of backends) b.init(units); }
  function check(context) { for (const b of backends) equalText(b.read(), text, context); }
  function apply(at, remove, insert, rejects = false) {
    if (rejects) {
      for (const b of backends) mustThrow(() => b.splice(at, remove, insert), 'invalid splice'); invalid++;
    } else {
      text = oracleSplice(text, at, remove, insert);
      for (const b of backends) b.splice(at, remove, insert);
    }
    check(`operation ${operations++}`);
  }
  init(new Uint16Array([0xac00, 0xd83d, 0xde00, 0x61, 0x301, 0, 0xffff]));
  apply(2, 1, new Uint16Array());
  apply(text.length, 0, new Uint16Array([0xde00, 0xd800]));
  apply(text.length, 0, new Uint16Array());
  for (const [at, count] of [[text.length + 1, 0], [0, text.length + 1], [-1, 0], [0, -1], [NaN, 0], [0, Infinity], [2 ** 32, 0], [0, 1.5], [Object(1), 0]]) apply(at, count, new Uint16Array([42]), true);
  for (const bad of [[], new Uint8Array([1]), null, { valueOf() { throw Error('coercion'); } }]) apply(0, 0, bad, true);
  const hostile = new Uint16Array([0xdfff, 0, 0xd800]);
  Object.defineProperties(hostile, {
    length: { get() { throw Error('own length'); } }, buffer: { get() { throw Error('own buffer'); } },
    byteOffset: { get() { throw Error('own offset'); } }, set: { get() { throw Error('own set'); } },
  });
  for (const b of backends) b.splice(0, 0, hostile);
  text = String.fromCharCode(0xdfff, 0, 0xd800) + text; check('hostile intrinsic bounds'); operations++;
  const oversized = new Uint16Array((exports.storage_capacity() >>> 0) + 1);
  Object.defineProperty(oversized, 'length', { value: 0 });
  apply(0, 0, oversized, true);
  for (const b of backends) mustThrow(() => b.init(oversized), 'oversized init'); check('failed init atomic');
  // Mutating the shared TypedArray length getter after import must not affect
  // captured bounds. Restore it before string/oracle or receipt code executes.
  const typedPrototype = Object.getPrototypeOf(Uint16Array.prototype);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(typedPrototype, 'length');
  let prototypeGetterReads = 0;
  Object.defineProperty(typedPrototype, 'length', { configurable: true, get() {
    prototypeGetterReads++; return prototypeGetterReads % 2 ? 0 : oversized.byteLength / 2;
  } });
  try {
    for (const b of backends) {
      mustThrow(() => b.init(oversized), 'prototype getter oversized init');
      mustThrow(() => b.splice(0, 0, oversized), 'prototype getter oversized edit');
      b.splice(0, 0, new Uint16Array([7]));
    }
  } finally { Object.defineProperty(typedPrototype, 'length', lengthDescriptor); }
  if (prototypeGetterReads !== 0) throw new Error('wrapper consulted mutable TypedArray length getter');
  text = String.fromCharCode(7) + text; check('prototype getter bounds and atomicity'); operations++; invalid += 2;
  const detached = new Uint16Array([12]);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  apply(0, 0, detached, true);
  const coercion = { valueOf() { throw new Error('no coercion'); } };
  apply(coercion, 0, new Uint16Array([1]), true);
  apply(0, text.length, new Uint16Array());
  apply(0, 0, new Uint16Array([0xdfff, 0, 0xd800]));
  let state = 0x72f09a31;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  for (let step = 0; step < 512; step++) {
    const at = next() % (text.length + 3), remove = next() % 7;
    const insert = Uint16Array.from({ length: next() % 9 }, () => next() & 65535);
    apply(at, remove, insert, at > text.length || remove > text.length - at);
  }
  // Force allocation growth and shrink; each result is checked in full.
  apply(0, 0, initialUnits(200000)); apply(1, 199999, new Uint16Array([0xd800]));
  const oldBuffer = exports.memory.buffer;
  const oldBytes = oldBuffer.byteLength;
  exports.memory.grow(1);
  apply(text.length, 0, new Uint16Array([0xdfff]));
  const memoryGrowth = { oldBytes, newBytes: exports.memory.buffer.byteLength, detachedOldBuffer: oldBuffer.byteLength === 0 };
  for (const b of backends) { b.clear(); mustThrow(() => b.read(), 'read after clear'); mustThrow(() => b.splice(0, 0, new Uint16Array()), 'edit after clear'); b.init(new Uint16Array()); equalText(b.read(), '', 'reinit empty'); }
  const traces = [];
  const nativeHashes = { 'cursor-local': 1250648887, 'far-jump': 3733865730, 'alternating-ends': 971030360 };
  for (const kind of KINDS) {
    init(initialUnits(initialLength));
    for (const op of trace(kind, initialLength, rounds)) apply(op.at, op.remove, op.insert);
    const hash = checksum(backends[0].read());
    if (rounds === 10000 && initialLength === 100000 && hash !== nativeHashes[kind]) throw new Error(`${kind}: native trace hash mismatch`);
    traces.push({ kind, operations: rounds, checksum: hash, finalUnits: text.length });
  }
  for (const b of backends) b.clear();
  return { status: 'PASS', operations, invalid, fullStateAfterEveryOperation: true, oracle: 'independent JavaScript UTF-16 string slice', memoryGrowth, traces };
}
class JsStringStorage {
  init(input) { this.text = asString(input); }
  splice(at, remove, insert) { this.text = oracleSplice(this.text, at, remove, insert); }
  read() { return Uint16Array.from({ length: this.text.length }, (_, i) => this.text.charCodeAt(i)); }
  clear() { this.text = ''; }
}
export function benchmark(exports, { rounds = 10000, samples = 7, initialLength = 100000 } = {}) {
  const input = initialUnits(initialLength), result = [];
  for (const kind of KINDS) {
    const edits = trace(kind, initialLength, rounds);
    let expected = asString(input);
    for (const op of edits) expected = oracleSplice(expected, op.at, op.remove, op.insert);
    const backends = [new JsStringStorage(), new WasmStorage(exports, 0), new WasmStorage(exports, 1)];
    const names = ['javascript-string', 'wasm-vec', 'wasm-gap'];
    const times = names.map(runtime => ({ runtime, construction_ms: [], edits_ms: [], materialization_ms: [] }));
    function run(index, record) {
      const b = backends[index], t = times[index];
      let start = performance.now(); b.init(input); const construction = performance.now() - start;
      start = performance.now(); for (const op of edits) b.splice(op.at, op.remove, op.insert); const editTime = performance.now() - start;
      start = performance.now(); const output = b.read(); const materialization = performance.now() - start;
      equalText(output, expected, `${kind} ${names[index]}`); b.clear();
      if (record) { t.construction_ms.push(construction); t.edits_ms.push(editTime); t.materialization_ms.push(materialization); }
    }
    for (let index = 0; index < 3; index++) run(index, false);
    const orders = [];
    for (let sample = 0; sample < samples; sample++) {
      const first = sample % 3;
      const order = sample % 2 === 0 ? [first, (first + 1) % 3, (first + 2) % 3] : [first, (first + 2) % 3, (first + 1) % 3];
      orders.push(order.map(i => names[i]));
      for (const index of order) run(index, true);
    }
    result.push({ kind, seed: SEED, initialUnits: initialLength, rounds, samples, warmups: 1, finalUnits: expected.length,
      checksum: checksum(Uint16Array.from({ length: expected.length }, (_, i) => expected.charCodeAt(i))), orders, results: times });
  }
  return result;
}
export function runStorageSuite(exports, options) {
  if (exports.storage_api_version() !== 1) throw new Error('storage API version');
  return { status: 'PASS', scope: 'isolated UTF-16 storage; no production CRDT/editor integration',
    costs: 'Construction includes input copy. WASM edits include per-operation JS validation, input copy, and ABI calls. Materialization includes WASM read and fresh JS copy. Trace generation, correctness checks, hash, and drops are outside timers.',
    tracePattern: 'src/storage_trace.rs exact xorshift32 seed 305419896; one draw per edit; even delete1 insert[low16,d83d,de00], odd delete3 insert[low16]; positions local +/-16, random far jump, alternating ends',
    differential: differential(exports, options), benchmarks: benchmark(exports, options) };
}
