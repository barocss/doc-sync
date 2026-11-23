import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// This oracle uses JS strings and slice, rather than Rust Vec or typed arrays.
// Invalid ranges are explicitly rejected before JS slice can clamp them.
const initial = [0xac00, 0xd83d, 0xde00, 0x61, 0x301, 0, 0xffff];
let text = String.fromCharCode(...initial);
const operations = [];
const expected = [];
function apply(at, count, insert) {
  operations.push(`${at}\t${count}\t${insert.join(',')}`);
  const valid = at <= text.length && count <= text.length - at;
  if (valid) text = text.slice(0, at) + String.fromCharCode(...insert) + text.slice(at + count);
  const result = Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
  expected.push(`${valid ? 'ok' : 'error'}\t${result.join(',')}`);
}
// End, empty, isolated-surrogate, invalid offset, and invalid deletion cases.
apply(2, 1, []);
apply(text.length, 0, [0xde00, 0xd800]);
apply(text.length, 0, []);
apply(text.length + 1, 0, [42]);
apply(0, text.length + 1, [42]);
apply(1, Number.MAX_SAFE_INTEGER, [42]);
apply(Number.MAX_SAFE_INTEGER, 0, [42]);
apply(0, text.length, []);
apply(0, 0, [0xdfff, 0, 0xd800]);
let state = 0x72f09a31;
function next() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
for (let step = 0; step < 256; step++) {
  const at = next() % (text.length + 3);
  const count = next() % 7;
  const insert = Array.from({ length: next() % 5 }, () => next() & 0xffff);
  apply(at, count, insert);
}
const binary = fileURLToPath(new URL('../target/release/splice-cases', import.meta.url));
const result = spawnSync(binary, [], {
  input: `${initial.join(',')}\n${operations.join('\n')}\n`, encoding: 'utf8',
});
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
const actual = result.stdout.replace(/\n$/, '').split('\n');
assert.equal(actual.length, expected.length);
for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i], `operation ${i}: ${operations[i]}`);
console.log(JSON.stringify({ status: 'PASS', node: process.version, executable: process.execPath,
  operations: operations.length, valid: expected.filter(line => line.startsWith('ok')).length,
  invalid: expected.filter(line => line.startsWith('error')).length,
  scope: 'native Rust UTF-16 splice vs JS string oracle; full state checked after each operation' }));
