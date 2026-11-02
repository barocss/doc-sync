import assert from 'node:assert/strict';
import { JsGapStorage, GAP_CAPACITY } from './js-gap.mjs';

const units = (text) => Uint16Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
const text = (values) => Array.from(values, (unit) => String.fromCharCode(unit)).join('');
const empty = new Uint16Array();
let checks = 0;
function verify(gap, oracle) {
  assert.equal(gap.length(), oracle.length);
  assert.deepEqual(gap.read(), units(oracle));
  const state = gap.snapshot();
  assert.equal(state.length, oracle.length);
  assert.equal(state.storageUnits - (state.end - state.start), oracle.length);
  assert.ok(state.start >= 0 && state.end >= state.start && state.end <= state.storageUnits);
  checks++;
}
function unchanged(gap, action, error) {
  const before = gap.read();
  const snapshot = gap.snapshot();
  assert.throws(action, error);
  assert.deepEqual(gap.read(), before);
  assert.deepEqual(gap.snapshot(), snapshot);
  checks++;
}

const gap = new JsGapStorage();
for (const action of [() => gap.length(), () => gap.read(), () => gap.clear(), () => gap.splice(0, 0, empty)]) assert.throws(action, RangeError);
gap.init(units('ab\ud83d\ude00\ud800\udfff\0가e\u0301'));
let oracle = text(gap.read());
assert.deepEqual(gap.snapshot(), { start: oracle.length, end: oracle.length + 64, storageUnits: oracle.length + 64, length: oracle.length });
// Overlap both ways, divide pairs, insert isolated surrogates and preserve normalization.
for (const [at, remove, insert] of [[1, 0, '\udfff'], [8, 1, '\ud800\0'], [0, 1, 'e\u0301'], [3, 1, ''], [oracle.length, 0, '끝']]) {
  gap.splice(at, remove, units(insert));
  oracle = oracle.slice(0, at) + insert + oracle.slice(at + remove);
  verify(gap, oracle);
}
const fresh = gap.read(); fresh.fill(0); verify(gap, oracle);
const initial = units('detached ownership'); gap.init(initial); initial.fill(0); verify(gap, 'detached ownership');
const inserted = units('copy'); gap.splice(0, 0, inserted); inserted.fill(0); verify(gap, 'copydetached ownership');

// Consume all gap units, then move an empty gap across the entire document.
gap.init(units('z'.repeat(100)));
gap.splice(50, 0, units('x'.repeat(64)));
oracle = 'z'.repeat(50) + 'x'.repeat(64) + 'z'.repeat(50);
assert.equal(gap.snapshot().start, gap.snapshot().end);
for (const at of [0, oracle.length, 1, oracle.length - 1]) {
  gap.splice(at, 0, empty);
  verify(gap, oracle);
}

// Exact growth branches: deficit, floor(logical / 2), and minimum 64.
for (const [initialLength, at, remove, count, expectedExtra] of [[0, 0, 0, 65, 64], [300, 150, 0, 65, 150], [301, 150, 1, 400, 335], [301, 150, 200 - 50, 215, 75]]) {
  const tape = new JsGapStorage(new Uint16Array(initialLength).fill(7));
  const before = tape.snapshot();
  tape.splice(at, remove, new Uint16Array(count).fill(9));
  const actualExtra = Math.max(count - (64 + remove), Math.floor((initialLength - remove) / 2), 64);
  // No growth occurs when deletion supplies a sufficient gap.
  const expectedStorage = before.storageUnits + (count > 64 + remove ? actualExtra : 0);
  assert.equal(tape.snapshot().storageUnits, expectedStorage);
  if (count > 64 + remove) assert.equal(actualExtra, expectedExtra);
  verify(tape, String.fromCharCode(7).repeat(at) + String.fromCharCode(9).repeat(count) + String.fromCharCode(7).repeat(initialLength - at - remove));
}

gap.init(units('abc'));
for (const value of [-1, 0.5, NaN, Infinity, 2 ** 32, Number.MAX_SAFE_INTEGER, '1', undefined, 1n, {}]) {
  unchanged(gap, () => gap.splice(value, 0, empty), RangeError);
  unchanged(gap, () => gap.splice(0, value, empty), RangeError);
}
for (const input of [null, undefined, [], new Uint8Array(1), new DataView(new ArrayBuffer(2)), { [Symbol.toStringTag]: 'Uint16Array', length: 1 }]) {
  unchanged(gap, () => gap.init(input), TypeError);
  unchanged(gap, () => gap.splice(0, 0, input), TypeError);
}
for (const [at, remove] of [[4, 0], [2, 2], [0xffffffff, 0], [0, 0xffffffff]]) unchanged(gap, () => gap.splice(at, remove, empty), RangeError);
for (const length of [0, 2]) {
  const detached = new Uint16Array(length);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  unchanged(gap, () => gap.init(detached), TypeError);
  unchanged(gap, () => gap.splice(0, 0, detached), TypeError);
}
// Own getters and subclass overrides cannot alter input bounds or copying.
class Hostile extends Uint16Array {
  get length() { throw new Error('caller length'); }
  get buffer() { throw new Error('caller buffer'); }
  get byteOffset() { throw new Error('caller offset'); }
  get [Symbol.toStringTag]() { throw new Error('caller tag'); }
  [Symbol.iterator]() { throw new Error('caller iterator'); }
  subarray() { throw new Error('caller subarray'); }
}
const hostile = new Hostile(new Uint16Array([0, 65, 0xd800, 0xdc00, 0xffff]).buffer, 2, 3);
gap.init(hostile); verify(gap, 'A\ud800\udc00');
gap.splice(1, 1, hostile); verify(gap, 'AA\ud800\udc00\udc00');

// Sequential edits use a string oracle; the oracle has no gap movement logic.
let seed = 0xc0ffee;
const random = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
gap.init(empty); oracle = '';
for (let i = 0; i < 4000; i++) {
  const at = random(oracle.length + 1);
  const remove = random(Math.min(oracle.length - at, 60) + 1);
  const insert = Uint16Array.from({ length: random(90) }, () => random(65536));
  gap.splice(at, remove, insert);
  oracle = oracle.slice(0, at) + text(insert) + oracle.slice(at + remove);
  verify(gap, oracle);
}

const capacityInput = new Uint16Array(GAP_CAPACITY).fill(0xdfff);
gap.init(capacityInput);
unchanged(gap, () => gap.splice(0, 0, new Uint16Array([1])), RangeError);
unchanged(gap, () => gap.init(new Uint16Array(GAP_CAPACITY + 1)), RangeError);
gap.splice(0, GAP_CAPACITY, capacityInput);
assert.deepEqual(gap.read(), capacityInput);
gap.splice(GAP_CAPACITY, 0, empty);
assert.equal(gap.length(), GAP_CAPACITY);
gap.splice(0, GAP_CAPACITY, empty); verify(gap, '');
gap.clear(); assert.throws(() => gap.read(), RangeError);
gap.init(empty); verify(gap, '');
console.log(JSON.stringify({ status: 'PASS', checks, sequentialOperations: 4000, capacity: GAP_CAPACITY }));
