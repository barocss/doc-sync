import { Utf16Bridge, toUnits, fromUnits, checksum } from './bridge.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function rejected(fn, message) {
  let didThrow = false;
  try { fn(); } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    didThrow = true;
  }
  assert(didThrow, message);
}
function nextGenerator(seed) {
  let state = seed;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state >>> 0;
  };
}

export function differential(instance, rounds = 4000) {
  const bridge = new Utf16Bridge(instance);
  const raw = instance.exports;
  const capacity = bridge.capacity;
  let assignmentRejected = false;
  try { bridge.capacity = capacity + 1; } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    assignmentRejected = true;
  }
  assert(assignmentRejected && bridge.capacity === capacity, 'capacity must be immutable');
  const pastInput = (raw.bridge_input_ptr() >>> 0) + capacity * 2;
  const sentinel = new Uint16Array(raw.memory.buffer, pastInput, 1)[0];
  const oversized = new Uint16Array(capacity + 1);
  oversized[capacity] = sentinel ^ 0xffff;
  // A shadowed public getter must not change the private write bound either.
  Object.defineProperty(bridge, 'capacity', { value: capacity + 1, configurable: true });
  rejected(() => bridge.create(oversized), 'shadowed capacity bypassed bound');
  assert(new Uint16Array(raw.memory.buffer, pastInput, 1)[0] === sentinel, 'write crossed input capacity');
  delete bridge.capacity;
  let lengthReads = 0;
  Object.defineProperty(oversized, 'length', { get() { return lengthReads++ === 0 ? capacity : capacity + 1; } });
  rejected(() => bridge.create(oversized), 'overridden typed-array length bypassed bound');
  assert(lengthReads === 0, 'wrapper trusted an overridable length accessor');
  assert(new Uint16Array(raw.memory.buffer, pastInput, 1)[0] === sentinel, 'forged length crossed input capacity');
  let oracle = '가\ud83d\ude00a\u0301\ud800\udfff';
  const handle = bridge.create(toUnits(oracle));
  rejected(() => bridge.splice(handle, 0, 0, oversized), 'forged splice length bypassed bound');
  let checks = 0;
  const equal = () => {
    assert(fromUnits(bridge.read(handle)) === oracle, `UTF-16 mismatch at check ${checks}`);
    assert(bridge.checksum(handle) === checksum(toUnits(oracle)), 'checksum mismatch');
    checks++;
  };
  equal();
  for (const [at, remove, insert] of [[2, 1, ''], [0, 0, '\udfff'], [1, 1, '\ud800'], [0, 0, '😀']]) {
    bridge.splice(handle, at, remove, toUnits(insert));
    oracle = oracle.slice(0, at) + insert + oracle.slice(at + remove);
    equal();
  }
  const random = nextGenerator(0x7f42ab12);
  for (let i = 0; i < rounds; i++) {
    const at = random() % (oracle.length + 1);
    const remove = Math.min(random() % 5, oracle.length - at);
    const insert = String.fromCharCode(...Array.from({ length: random() % 6 }, () => random() & 0xffff));
    bridge.splice(handle, at, remove, toUnits(insert));
    oracle = oracle.slice(0, at) + insert + oracle.slice(at + remove);
    equal();
  }
  for (const value of [-1, 0.5, NaN, Infinity, -Infinity, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
    rejected(() => bridge.splice(handle, value, 0), 'invalid offset accepted');
    rejected(() => bridge.splice(handle, 0, value), 'invalid delete accepted');
    rejected(() => bridge.read(value), 'invalid handle accepted');
    equal();
  }
  for (const [at, remove, count, error] of [
    [oracle.length + 1, 0, 0, -2], [0xffff_ffff, 0, 0, -2],
    [0, 0xffff_ffff, 0, -2], [0, 0, 0xffff_ffff, -3],
    [0, 0, bridge.capacity + 1, -3],
  ]) {
    assert(raw.bridge_splice(handle, at, remove, count) === error, 'raw rejection mismatch');
    equal();
  }
  rejected(() => bridge.splice(handle, 0, 0, new Uint16Array(bridge.capacity + 1)), 'oversized JS input accepted');
  assert(raw.bridge_create(0xffff_ffff) === -3, 'oversized create accepted');
  equal();
  // Read scratch remains unchanged when a raw invalid handle is rejected.
  const ptr = raw.bridge_output_ptr() >>> 0;
  const before = new Uint16Array(raw.memory.buffer, ptr, oracle.length).slice();
  assert(raw.bridge_read(0) === -1, 'invalid handle read accepted');
  const after = new Uint16Array(raw.memory.buffer, ptr, oracle.length);
  assert(before.every((unit, i) => unit === after[i]), 'rejected read changed output');
  bridge.close(handle);
  rejected(() => bridge.read(handle), 'closed JS handle accepted');
  assert(raw.bridge_read(handle) === -1, 'closed WASM handle accepted');
  assert(raw.bridge_splice(handle, 0, 0, 0) === -1, 'stale splice accepted');
  assert(raw.bridge_close(handle) === -1, 'double close accepted');
  const other = bridge.create(toUnits('live\ud800'));
  assert(other !== handle, 'handle reused');
  assert(raw.bridge_splice(handle, 0, 0, 1) === -1, 'stale splice accepted after reuse');
  assert(raw.bridge_close(handle) === -1, 'stale close accepted after reuse');
  assert(raw.bridge_read(handle) === -1, 'stale read accepted after reuse');
  assert(fromUnits(bridge.read(other)) === 'live\ud800', 'stale operation changed live document');
  const full = bridge.create(new Uint16Array(bridge.capacity));
  rejected(() => bridge.splice(full, 0, 0, new Uint16Array([65])), 'document capacity exceeded');
  assert(bridge.read(full).length === bridge.capacity, 'capacity rejection changed length');
  const handles = [other, full];
  for (let i = handles.length; i < raw.bridge_max_handles(); i++) handles.push(bridge.create());
  rejected(() => bridge.create(), 'handle limit exceeded');
  for (const id of handles) bridge.close(id);
  // Host-side views must be refreshed if an embedder grows linear memory.
  raw.memory.grow(1);
  const grown = bridge.create(toUnits('\ud800\udfff'));
  assert(fromUnits(bridge.read(grown)) === '\ud800\udfff', 'memory growth broke views');
  bridge.dispose();
  assert(raw.bridge_read(grown) === -1, 'dispose leaked a handle');
  return { status: 'PASS', randomEdits: rounds, exactReadAndHashChecks: checks,
    coverage: ['UTF16 raw surrogates', 'numeric integer bounds', 'raw ABI bounds', 'failure atomicity',
      'immutable scratch capacity', 'capacity limit', 'handle limit', 'stale handle rejection', 'dispose', 'memory growth'] };
}

const INITIAL = 100_000;
function workload(rounds) {
  const initial = Uint16Array.from({ length: INITIAL }, (_, i) => i & 0xffff);
  const edits = [];
  const random = nextGenerator(0x12345678);
  let length = INITIAL;
  for (let i = 0; i < rounds; i++) {
    const at = random() % (length - 2);
    const unit = random() & 0xffff;
    const remove = i % 2 === 0 ? 1 : 3;
    const insert = i % 2 === 0 ? new Uint16Array([unit, 0xd83d, 0xde00]) : new Uint16Array([unit]);
    edits.push({ at, remove, insert, text: fromUnits(insert) });
    length += insert.length - remove;
  }
  return { initial, edits };
}
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samplesMs: samples, medianMs: sorted[Math.floor(sorted.length / 2)],
    minMs: sorted[0], maxMs: sorted.at(-1) };
}

export function benchmark(instance, { rounds = 2000, repeats = 5 } = {}) {
  assert(Number.isInteger(rounds) && rounds > 0 && rounds <= 100000, 'invalid benchmark rounds');
  assert(Number.isInteger(repeats) && repeats > 0 && repeats <= 30, 'invalid benchmark repeats');
  const bridge = new Utf16Bridge(instance);
  const { initial, edits } = workload(rounds);
  const initialText = fromUnits(initial);
  let oracle = initialText;
  for (const edit of edits) oracle = oracle.slice(0, edit.at) + edit.text + oracle.slice(edit.at + edit.remove);
  const expected = checksum(toUnits(oracle));
  const methods = {
    jsString: () => {
      let text = initialText;
      const start = performance.now();
      for (const edit of edits) text = text.slice(0, edit.at) + edit.text + text.slice(edit.at + edit.remove);
      const ms = performance.now() - start;
      assert(checksum(toUnits(text)) === expected, 'JS benchmark mismatch');
      return ms;
    },
    wasmPerEditInputCopy: () => {
      const handle = bridge.create(initial);
      const start = performance.now();
      for (const edit of edits) bridge.splice(handle, edit.at, edit.remove, edit.insert);
      const ms = performance.now() - start;
      assert(bridge.checksum(handle) === expected, 'per-edit input benchmark mismatch');
      assert(fromUnits(bridge.read(handle)) === oracle, 'per-edit input exact mismatch');
      bridge.close(handle);
      return ms;
    },
    wasmPerEditInputAndFullOutputCopy: () => {
      const handle = bridge.create(initial);
      let output;
      const start = performance.now();
      for (const edit of edits) {
        bridge.splice(handle, edit.at, edit.remove, edit.insert);
        output = bridge.read(handle);
      }
      const ms = performance.now() - start;
      assert(fromUnits(output) === oracle, 'per-edit readback mismatch');
      bridge.close(handle);
      return ms;
    },
    wasmWholeBatch: () => {
      const start = performance.now();
      const hash = Number(instance.exports.bridge_batch_checksum(rounds));
      const ms = performance.now() - start;
      assert(hash === expected, 'whole batch benchmark mismatch');
      return ms;
    },
  };
  // Warm each path once. Rotate ordering to reduce a fixed order bias.
  for (const run of Object.values(methods)) run();
  const samples = Object.fromEntries(Object.keys(methods).map(name => [name, []]));
  const names = Object.keys(methods);
  for (let i = 0; i < repeats; i++) {
    for (let j = 0; j < names.length; j++) {
      const name = names[(i + j) % names.length];
      samples[name].push(methods[name]());
    }
  }
  const lifecycle = Object.fromEntries(['encode', 'createAndInputCopy', 'readAndOutputCopy', 'decode', 'close'].map(name => [name, []]));
  for (let i = 0; i < repeats; i++) {
    let start = performance.now();
    const units = toUnits(initialText);
    lifecycle.encode.push(performance.now() - start);
    start = performance.now();
    const handle = bridge.create(units);
    lifecycle.createAndInputCopy.push(performance.now() - start);
    start = performance.now();
    const output = bridge.read(handle);
    lifecycle.readAndOutputCopy.push(performance.now() - start);
    start = performance.now();
    const text = fromUnits(output);
    lifecycle.decode.push(performance.now() - start);
    assert(text === initialText, 'lifecycle read mismatch');
    start = performance.now();
    bridge.close(handle);
    lifecycle.close.push(performance.now() - start);
  }
  bridge.dispose();
  return { initialUnits: INITIAL, rounds, repeats, warmups: 1, expectedChecksum: expected,
    insertionUnitsCopiedPerRun: edits.reduce((n, edit) => n + edit.insert.length, 0),
    outputUnitsCopiedPerRun: edits.reduce((acc, _, i) => acc + INITIAL + (i % 2 === 0 ? 2 : 0), 0),
    methods: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summary(values)])),
    lifecycle: { units: INITIAL, samples: Object.fromEntries(Object.entries(lifecycle).map(([name, values]) => [name, summary(values)])),
      boundary: 'Independent initial-document encode, create+input copy, materialize+output copy, decode and single-handle close phases; no edits; instance and buffers already initialized' },
    timingBoundary: {
      jsString: 'string edits only; initial text, operation preparation and final hash excluded',
      wasmPerEditInputCopy: 'one wrapper call, integer checks, input UTF16 copy and Rust splice per edit; initial create and final read/hash excluded',
      wasmPerEditInputAndFullOutputCopy: 'same per-edit input path plus Rust output copy, read call and JS-owned Uint16Array copy per edit; string conversion excluded',
      wasmWholeBatch: 'one call including Rust initial allocation, PRNG, edits and final hash; no text crosses ABI',
    },
    limitation: 'TextTape Vec baseline, no CRDT/editor integration. Cross-path times have different boundaries; no isolated estimate of ABI overhead or production speedup.' };
}
