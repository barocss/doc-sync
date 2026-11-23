import {createHash} from 'node:crypto';
import {checkSchema} from '../../packages/doc-sync/src/crdt/schema.ts';
import {applyEdits, canonical} from '../../packages/doc-sync/src/crdt/model.ts';

export const DEFAULT_SEEDS = Object.freeze([1701, 1702, 1703, 1704, 1705, 1706]);
const roles = ['root', 'text', 'group', 'member', 'grid', 'row', 'cell', 'body', 'box', 'tone', 'level', 'meta', 'flag', 'label', 'mark'];
const clone = value => structuredClone(value);
function random(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
}
function assertSeed(seed) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be a uint32');
}

/** Fresh, JSON-only fixtures. The generated subset does not imply arbitrary schema support. */
export function generateCase(seed) {
    assertSeed(seed);
    const next = random(seed);
    const names = Object.fromEntries(roles.map((role, i) => [role, `v${seed.toString(36)}_${next().toString(36)}_${i}`]));
    const n = names;
    const rows = 1 + next() % 2, cols = 1 + (next() >>> 8) % 2;
    const text = (value, marked = false) => ({type: n.text, runs: [{text: value, marks: marked ? {[n.mark]: true} : {}}]});
    const member = (value, level) => ({type: n.member, attrs: {[n.tone]: 'ordered', [n.level]: level}, runs: [{text: value, marks: {[n.mark]: true}}]});
    const schema = {root: n.root, marks: [n.mark], nodes: {
        [n.root]: {shape: 'flow', children: [n.text, n.group, n.grid, n.box], default: n.text},
        [n.text]: {shape: 'text'},
        [n.group]: {shape: 'group', children: [n.member], by: [n.tone, n.level]},
        [n.member]: {shape: 'text', attrs: {[n.tone]: {default: '', values: ['', 'ordered']}, [n.level]: {default: 0, min: 0, max: 3}}},
        [n.grid]: {shape: 'grid', children: [n.row]},
        [n.row]: {shape: 'row', children: [n.cell]},
        [n.cell]: {shape: 'cell', children: [n.body], attrs: {[n.meta]: {
            default: {[n.flag]: false, [n.label]: ''}, fields: {[n.flag]: {default: false}, [n.label]: {default: ''}},
        }}},
        [n.body]: {shape: 'flow', children: [n.text, n.group, n.grid, n.box], default: n.text},
        [n.box]: {shape: 'flow', children: [n.text, n.group], default: n.text},
    }};
    const groupModel = {type: n.group, attrs: {[n.tone]: 'ordered', [n.level]: 1}, children: [member(`GROUP😀${seed}`, 1), member(`NEXT한${seed}`, 1)]};
    const gridModel = {type: n.grid, children: Array.from({length: rows}, (_, r) => ({type: n.row, children: Array.from({length: cols}, (_, c) => ({
        type: n.cell, attrs: {[n.meta]: {[n.flag]: (r + c) % 2 === 0, [n.label]: `cell-${r}-${c}`}},
        children: [{type: n.body, children: [text(`CELL😀${r}:${c}`, true)]}],
    }))}))};
    const cellGroupModel = {type: n.group, attrs: {[n.tone]: 'ordered', [n.level]: 2}, children: [member(`NEST한😀${seed}`, 2)]};
    const initialModel = canonical(schema, {type: n.root, children: [text(`HEAD😀${seed}`)]});
    const edits = [
        {op: 'insert', at: [1], content: [clone(groupModel)]},
        {op: 'insert', at: [2], content: [clone(gridModel)]},
        {op: 'insert', at: [2, 0, 0, 0, 1], content: [clone(cellGroupModel)]},
    ];
    const problems = checkSchema(schema);
    if (problems.length) throw new Error(`generated schema rejected: ${problems.join('; ')}`);
    let expectedModel = clone(initialModel);
    const expectedModels = edits.map(edit => { expectedModel = applyEdits(schema, expectedModel, [clone(edit)]); return clone(expectedModel); });
    return {seed, names, dimensions: {rows, cols}, schema, groupModel, gridModel, cellGroupModel, initialModel, edits, expectedModels, expectedModel: clone(expectedModel)};
}

export function generateCases(count = 6) {
    if (!Number.isInteger(count) || count < 4 || count > 8) throw new RangeError('count must be 4..8');
    return Array.from({length: count}, (_, i) => generateCase(DEFAULT_SEEDS[0] + i));
}

export function reproduce(seed) { return generateCase(seed); }
export function modelHash(model) { return createHash('sha256').update(JSON.stringify(model)).digest('hex'); }
export function exportReproducer(seed) {
    const {schema, initialModel, edits, expectedModel} = generateCase(seed);
    return JSON.stringify({format: 'runtime-document-schema-contract/v1', seed, schema, initialModel, edits, expectedModel, expectedModelHash: modelHash(expectedModel)}, null, 2) + '\n';
}
