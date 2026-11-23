import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { JsGapStorage, GAP_CAPACITY } from './js-gap.mjs';

export function decodeTrace(path) {
  const bytes = readFileSync(path); let offset = 8;
  if (bytes.subarray(0, 8).toString() !== 'NGAP0001') throw Error('trace magic');
  const u32 = () => { const n = bytes.readUInt32LE(offset); offset += 4; return n; };
  const units = n => { const result = new Uint16Array(n); for (let i = 0; i < n; i++, offset += 2) result[i] = bytes.readUInt16LE(offset); return result; };
  const capacity = u32(); if (capacity !== GAP_CAPACITY) throw Error('capacity mismatch');
  const initial = units(u32()); const count = u32(), ops = [];
  for (let i = 0; i < count; i++) { const at = u32(), remove = u32(), insert = units(u32()); ops.push({ at, remove, insert }); }
  if (offset !== bytes.length) throw Error('trailing trace bytes');
  return { initial, ops };
}
const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1];
const mode = arg('--mode'), path = arg('--trace'), warmups = args.includes('--warmup') ? Number(arg('--warmup')) : 0;
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
function status(gap, op) { try { gap.splice(op.at, op.remove, op.insert); return 0; } catch (error) { if (!(error instanceof RangeError)) throw error; return op.at > gap.length() || op.remove > gap.length() - op.at ? -3 : -4; } }
function run(data) {
  let start = performance.now(); const gap = new JsGapStorage(data.initial); const construction_ms = performance.now() - start;
  start = performance.now(); for (const op of data.ops) gap.splice(op.at, op.remove, op.insert); const edits_ms = performance.now() - start;
  start = performance.now(); const units = gap.read(); const materialization_ms = performance.now() - start;
  return { gap, units, construction_ms, edits_ms, materialization_ms };
}
if (mode === 'memory') {
  const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  const pause = async phase => { emit({ phase, supplementaryNodeMemoryUsage: process.memoryUsage() }); await lines.next(); };
  await pause('baseline');
  let data = decodeTrace(path); await pause('loaded');
  let gap = new JsGapStorage(data.initial); await pause('constructed');
  for (const op of data.ops) gap.splice(op.at, op.remove, op.insert); await pause('edited');
  let units = gap.read(); await pause('materialized');
  emit({ runtime: 'node24-js-gap', units: Array.from(units), storage_units: gap.snapshot().storageUnits });
  units = null; gap.clear(); gap = null; await pause('released');
  data = null; process.exit(0);
} else {
  const data = decodeTrace(path);
  if (mode === 'correctness') {
    const gap = new JsGapStorage(data.initial);
    emit({ step: -1, status: 0, units: Array.from(gap.read()), storage_units: gap.snapshot().storageUnits });
    for (let step = 0; step < data.ops.length; step++) { const result = status(gap, data.ops[step]); emit({ step, status: result, units: Array.from(gap.read()), storage_units: gap.snapshot().storageUnits }); }
  } else if (mode === 'bench') {
    const warmup_times = [];
    for (let i = 0; i < warmups; i++) { const warm = run(data); warmup_times.push({ construction_ms: warm.construction_ms, edits_ms: warm.edits_ms, materialization_ms: warm.materialization_ms }); warm.gap.clear(); }
    const result = run(data);
    emit({ runtime: 'node24-js-gap', warmup_times, construction_ms: result.construction_ms, edits_ms: result.edits_ms, materialization_ms: result.materialization_ms, units: Array.from(result.units), storage_units: result.gap.snapshot().storageUnits });
  } else throw Error('unknown mode');
}
