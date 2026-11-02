import { checksum } from './bridge.mjs';

function assert(condition, message) { if (!condition) throw new Error(message); }
const summarize = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
};

/** Each case owns its input. No caller-provided typed-array properties are read. */
export function boundaryBenchmark(instance, { repeats = 7, targetBatchMs = 10 } = {}) {
  assert(Number.isInteger(repeats) && repeats >= 3 && repeats <= 30, 'invalid repeats');
  assert(Number.isFinite(targetBatchMs) && targetBatchMs >= 1 && targetBatchMs <= 100, 'invalid targetBatchMs');
  const raw = instance.exports;
  const capacity = raw.bridge_capacity();
  for (const name of ['bridge_scalar_echo', 'bridge_probe', 'bridge_transfer']) {
    assert(typeof raw[name] === 'function', `missing export ${name}`);
  }
  const inputPtr = raw.bridge_input_ptr() >>> 0;
  const outputPtr = raw.bridge_output_ptr() >>> 0;
  const cases = [];
  function add(name, units, operation, verify, boundary, maxCalls = 2_000_000) {
    cases.push({ name, units, operation, verify, boundary, maxCalls, calls: 1, samples: [] });
  }
  // Equal arguments and accumulation loops. The JS function-call optimization is
  // part of its observed baseline; this is not a measurement of pure ABI cost.
  const jsEcho = value => value;
  const jsProbe = length => length <= capacity ? length : -3;
  add('jsScalarEcho', 0, i => jsEcho(i & 0xffff), () => 0, 'JS identity call with changing u32 argument and accumulated return');
  add('wasmScalarEcho', 0, i => raw.bridge_scalar_echo(i & 0xffff), () => 0, 'raw WASM identity call with changing u32 argument and accumulated return');
  for (const units of [0, 16, 1024, 100_000]) {
    assert(units <= capacity, 'benchmark units exceed capacity');
    const source = Uint16Array.from({ length: units }, (_, i) => (i * 31 + 7) & 0xffff);
    const expected = checksum(source);
    const jsInput = new Uint16Array(units);
    const jsOutput = new Uint16Array(units);
    const ownedOutput = new Uint16Array(units);
    const wasmInput = new Uint16Array(raw.memory.buffer, inputPtr, units);
    const wasmOutput = new Uint16Array(raw.memory.buffer, outputPtr, units);
    const maxCalls = Math.max(1000, Math.min(2_000_000, Math.floor(500_000_000 / Math.max(1, units))));
    const check = buffer => () => { const hash = checksum(buffer()); assert(hash === expected, `copy mismatch (${units})`); return hash; };
    const suffix = `_${units}u16`;
    add(`jsLengthProbe${suffix}`, units, () => jsProbe(units), () => units, 'JS length bound check and scalar return', 2_000_000);
    add(`wasmLengthProbe${suffix}`, units, () => raw.bridge_probe(units), () => units, 'raw WASM length bound check and scalar return; no payload copy', 2_000_000);
    add(`jsInputCopyReused${suffix}`, units, () => { jsInput.set(source); return units; }, check(() => jsInput), 'JS-owned source to reused JS Uint16Array via set; no WASM call', maxCalls);
    add(`wasmInputCopyReused${suffix}`, units, () => { wasmInput.set(source); return units; }, check(() => wasmInput), 'JS-owned source to reused WASM-memory view via set; no WASM call', maxCalls);
    // Set up read-only sources outside measurements; every copy case uses the same content.
    jsOutput.set(source);
    wasmInput.set(source);
    assert(raw.bridge_transfer(units) === units, 'transfer setup failed');
    add(`jsOutputCopyReused${suffix}`, units, () => { ownedOutput.set(jsOutput); return units; }, check(() => ownedOutput), 'JS source to reused JS destination via set; no allocation', maxCalls);
    add(`wasmOutputCopyReused${suffix}`, units, () => { ownedOutput.set(wasmOutput); return units; }, check(() => ownedOutput), 'WASM-memory source to reused JS destination via set; no WASM call or allocation', maxCalls);
    let fresh = new Uint16Array(units);
    add(`jsOutputCopyFresh${suffix}`, units, () => { fresh = jsOutput.slice(); return units; }, check(() => fresh), 'JS source slice: fresh JS allocation plus output copy', maxCalls);
    add(`wasmOutputCopyFresh${suffix}`, units, () => { fresh = wasmOutput.slice(); return units; }, check(() => fresh), 'WASM-memory source slice: fresh JS allocation plus output copy; no WASM call', maxCalls);
    add(`jsInternalCopyReused${suffix}`, units, () => { jsOutput.set(jsInput); return units; }, check(() => jsOutput), 'JS input scratch to reused JS output scratch via set', maxCalls);
    add(`rustInternalTransfer${suffix}`, units, () => raw.bridge_transfer(units), check(() => wasmOutput), 'one raw WASM call plus Rust input-scratch to output-scratch copy; no host payload copy', maxCalls);
    // Initial values are valid for checks even if rotated order runs output before input.
    jsInput.set(source);
  }
  assert(raw.bridge_probe(capacity + 1) === -3, 'probe accepted oversized length');
  assert(raw.bridge_transfer(capacity + 1) === -3, 'transfer accepted oversized length');
  assert((raw.bridge_scalar_echo(0xffff_ffff) >>> 0) === 0xffff_ffff, 'echo changed u32 bits');
  let sink = 0;
  function batch(entry, calls) {
    let sum = 0;
    const start = performance.now();
    for (let i = 0; i < calls; i++) sum = (sum + entry.operation(i)) >>> 0;
    const elapsedMs = performance.now() - start;
    sink = (sink + sum) >>> 0;
    const expectedReturnChecksum = entry.name.endsWith('ScalarEcho')
      ? (() => { let expected = 0; for (let i = 0; i < calls; i++) expected = (expected + (i & 0xffff)) >>> 0; return expected; })()
      : Math.imul(calls, entry.units) >>> 0;
    assert(sum === expectedReturnChecksum, `return checksum mismatch: ${entry.name}`);
    const contentChecksum = entry.verify();
    return { elapsedMs, calls, nsPerCall: elapsedMs * 1e6 / calls, returnChecksum: sum, contentChecksum };
  }
  for (const entry of cases) {
    // Calibrate per case. Report caps and actual elapsed times, including short batches.
    while (true) {
      const sample = batch(entry, entry.calls);
      if (sample.elapsedMs >= targetBatchMs || entry.calls >= entry.maxCalls) break;
      entry.calls = Math.min(entry.maxCalls, entry.calls * 2);
    }
    batch(entry, entry.calls); // One full extra warmup after calibration.
  }
  const order = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    const names = [];
    for (let j = 0; j < cases.length; j++) {
      const entry = cases[(repeat + j) % cases.length];
      names.push(entry.name);
      entry.samples.push(batch(entry, entry.calls));
    }
    order.push(names);
  }
  return {
    status: 'PASS', repeats, targetBatchMs, warmup: 'doubling calibration plus one full batch per case',
    units: 'UTF-16 code units; 2 bytes per unit', sampleTimeUnit: 'ms', normalizedTimeUnit: 'ns/call',
    controls: ['owned Uint16Array inputs; no caller accessors', 'identical payload pattern across JS and WASM cases',
      'arguments and return values accumulated', 'payload checksum after each batch outside timing',
      'fresh output allocation plus copy reported separately from reused destination copy',
      'length rejection and u32 echo edge checked', 'repeat order rotated'],
    order, sink,
    cases: Object.fromEntries(cases.map(entry => [entry.name, {
      payloadUnitsPerCall: entry.units, payloadBytesPerCall: entry.units * 2, callsPerBatch: entry.calls,
      maxCalls: entry.maxCalls, boundary: entry.boundary, samples: entry.samples,
      nsPerCall: summarize(entry.samples.map(sample => sample.nsPerCall)),
      batchesBelowTarget: entry.samples.filter(sample => sample.elapsedMs < targetBatchMs).length,
    }])),
    limitation: 'Observed standalone path costs. JS optimization, call loop, JIT, GC, typed-array machinery and copies remain in the stated boundaries. No subtraction estimates pure ABI overhead or allocator cost. Reused copies exclude payload allocation; fresh output includes allocation plus copy. No editor or CRDT claim.',
  };
}

export async function startupMeasurement(bytes, { repeats = 7, instancesPerBatch = 8 } = {}) {
  const start = performance.now();
  const module = await WebAssembly.compile(bytes);
  const firstCompileMs = performance.now() - start;
  let mark = performance.now();
  const instance = await WebAssembly.instantiate(module);
  const firstInstantiateCompiledModuleMs = performance.now() - mark;
  mark = performance.now();
  const { Utf16Bridge } = await import('./bridge.mjs');
  const wrapperImportMs = performance.now() - mark;
  mark = performance.now();
  new Utf16Bridge(instance).dispose();
  const firstWrapperInitAndDisposeMs = performance.now() - mark;
  const samples = [];
  // Warm the cached-module instantiate path before repeated batches.
  await WebAssembly.instantiate(module);
  for (let repeat = 0; repeat < repeats; repeat++) {
    mark = performance.now();
    const instances = [];
    for (let i = 0; i < instancesPerBatch; i++) instances.push(await WebAssembly.instantiate(module));
    const instantiateMs = performance.now() - mark;
    mark = performance.now();
    for (const fresh of instances) new Utf16Bridge(fresh).dispose();
    const wrapperInitAndDisposeMs = performance.now() - mark;
    samples.push({ calls: instancesPerBatch, instantiateMs, wrapperInitAndDisposeMs,
      instantiateMsPerCall: instantiateMs / instancesPerBatch,
      wrapperInitAndDisposeMsPerCall: wrapperInitAndDisposeMs / instancesPerBatch });
  }
  return { instance, startup: {
    firstCompileMs, firstInstantiateCompiledModuleMs, wrapperImportMs, firstWrapperInitAndDisposeMs,
    cachedCompiledModule: { repeats, instancesPerBatch, samples },
    boundary: 'Byte fetch/file I/O excluded. First explicit compile in this run (engine cache state unknown), then first instantiate from compiled module. Wrapper init includes Rust fixed scratch setup and dispose. Cached-module batches instantiate fresh memories; wrapper init timed as separate batch. Repeated instantiation includes async Promise overhead; no claim of cold engine cache.',
  } };
}

export function lifecycleBenchmark(instance, { callsPerBatch = 1000, repeats = 7, units = 100_000 } = {}) {
  const raw = instance.exports;
  assert(units <= raw.bridge_capacity(), 'lifecycle payload exceeds capacity');
  const inputPtr = raw.bridge_input_ptr() >>> 0;
  const outputPtr = raw.bridge_output_ptr() >>> 0;
  const input = Uint16Array.from({ length: units }, (_, i) => (i * 31 + 7) & 0xffff);
  const expected = checksum(input);
  const run = () => {
    let output;
    const start = performance.now();
    for (let i = 0; i < callsPerBatch; i++) {
      new Uint16Array(raw.memory.buffer, inputPtr, units).set(input);
      const handle = raw.bridge_create(units);
      assert(handle > 0, 'lifecycle create failed');
      assert(raw.bridge_read(handle) === units, 'lifecycle read failed');
      output = new Uint16Array(raw.memory.buffer, outputPtr, units).slice();
      assert(raw.bridge_close(handle) === 0, 'lifecycle close failed');
    }
    const elapsedMs = performance.now() - start;
    assert(checksum(output) === expected, 'lifecycle output mismatch');
    return { cycles: callsPerBatch, wasmCalls: callsPerBatch * 3, elapsedMs,
      nsPerCycle: elapsedMs * 1e6 / callsPerBatch, contentChecksum: expected };
  };
  run();
  const samples = Array.from({ length: repeats }, run);
  return { status: 'PASS', unitsPerCycle: units, repeats, cyclesPerBatch: callsPerBatch, warmupBatches: 1, samples,
    boundary: 'Complete raw create/read/close cycle batches with one live handle at a time. Includes host input copy, Rust document allocation/copy, Rust read materialization, fresh host output allocation/copy, Rust drop, assertions and view creation. Prepared UTF-16 input and checksum excluded. Phase observations remain in combinedTextTape.lifecycle; these aggregate cycles avoid interpreting short single-operation times as zero. No pure allocator estimate.',
  };
}
