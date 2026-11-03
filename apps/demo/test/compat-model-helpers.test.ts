import assert from 'node:assert/strict';
import {test} from 'node:test';
// @ts-expect-error Executable JavaScript demo helper.
import {canon, editsFor, safeSlateRange, toSlate} from '../compat/model.mjs';

const paragraph = (text: string) => ({type: 'paragraph', runs: [{text}]});
const model = (...children: unknown[]) => canon({type: 'content', children});

test('compat range lookup uses the current model on every call', () => {
    const range = {anchor: {path: [0, 0], offset: 10}, focus: {path: [1, 0], offset: 2}};
    const first = toSlate(model(paragraph('abcd'), paragraph('xyz')));
    const second = toSlate(model(paragraph('a'), paragraph('b')));
    assert.deepEqual(safeSlateRange(first, range), {anchor: {path: [0, 0], offset: 4}, focus: range.focus});
    assert.deepEqual(safeSlateRange(second, range), {anchor: {path: [0, 0], offset: 1}, focus: {path: [1, 0], offset: 1}});
    assert.equal(safeSlateRange([], range), null);
    assert.equal(safeSlateRange(first, null), null);
    assert.equal(range.anchor.offset, 10);
});

test('compat split and merge preserve intent with supplementary Unicode text', () => {
    const before = model(paragraph('A😀한글'));
    const after = model(paragraph('A😀'), paragraph('한글'));
    assert.deepEqual(editsFor(before, after), [{op: 'split', at: [0, 2]}]);
    assert.deepEqual(editsFor(after, before), [{op: 'merge', at: [1]}]);
});
