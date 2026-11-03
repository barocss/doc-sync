import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Doc} from '../src/crdt/doc.ts';
import type {Item} from '../src/crdt/doc.ts';
import {compileEdits} from '../src/crdt/edit.ts';
import {History} from '../src/crdt/history.ts';
import type {EditOp} from '../src/crdt/model.ts';
import type {GraphicSchema} from '../src/crdt/schema.ts';
import {ROOT, keyOf} from '../src/crdt/ticket.ts';

const schema: GraphicSchema = {domain: 'graphic', root: 'stage', marks: [], nodes: {
    stage: {shape: 'container', children: ['box', 'dot']},
    box: {shape: 'container', children: ['dot']},
    dot: {shape: 'atom', attrs: {value: {default: null}, radius: {default: 1, min: 0},
        position: {default: {x: 0, y: 0}, fields: {x: {default: 0}, y: {default: 0}}}}},
}};
const insert: EditOp[] = [{op: 'insert', at: [0], content: [{type: 'dot', attrs: {radius: 2}}]}];
const update: EditOp[] = [{op: 'update', at: [0], attrs: {radius: 3}}];
function raw(value: unknown): Doc {
    const doc = new Doc('A', schema);
    doc.apply({t: 'node', id: {lamport: 1, actor: 'seed'}, origin: ROOT, type: 'dot', attrs: {value, radius: 2}});
    return doc;
}
const token = (doc: Doc): Item => [...doc.lines()].flatMap(line => line.items).find(item => item.born === 'dot')!;
// Public legacy composition, not an independent frozen decoder. A separate
// frozen-source process checks the old behavior; no private bypass is used.
const legacyProof = (doc: Doc, edits: EditOp[] = []): Doc => {
    const staged = Doc.fromSnapshot(doc.actor, doc.snapshot(), doc.schema);
    compileEdits(staged, edits);
    return staged;
};
function outcome(action: () => unknown): {ok: true} | {ok: false; name: string; message: string} {
    try { action(); return {ok: true}; }
    catch (error) { assert.ok(error instanceof Error); return {ok: false, name: error.name, message: error.message}; }
}
function state(doc: Doc) { return {snapshot: doc.snapshot(), version: doc.version, clock: doc.clock.lamport}; }
function nested(objects: number, leaf: unknown = 1): unknown {
    let value = leaf;
    for (let i = 0; i < objects; i++) value = {next: value};
    return value;
}
for (const [depth, accepted] of [[121, true], [122, false]] as const) test(`graphic copy unknown object depth ${depth}: ${accepted}`, () => {
    const doc = raw(nested(depth, {}));
    const before = state(doc);
    const expected = outcome(() => legacyProof(doc));
    assert.equal(expected.ok, accepted, 'frozen envelope boundary');
    assert.deepEqual(outcome(() => doc.edit([])), expected);
    assert.deepEqual(state(doc), before);
});
for (const leaf of [null, true, 'end', 1, -0]) test(`graphic copy primitives precede depth limit: ${String(leaf)}`, () => {
    const doc = raw(nested(122, leaf));
    assert.doesNotThrow(() => legacyProof(doc));
    assert.doesNotThrow(() => doc.edit([]));
});
const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
const shared = {tag: [1]};
const poison = JSON.parse('{"constructor":1}');
for (const [name, value] of [
    ['undefined', undefined], ['bigint', 1n], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
    ['Date', new Date(0)], ['Map', new Map([['x', 1]])], ['Set', new Set([1])],
    ['typed array', new Uint8Array([1])], ['cycle', cyclic], ['sparse array', new Array(2)], ['poison key', poison],
] as const) test(`graphic copy rejects raw retained ${name} before live mutation`, () => {
    const doc = raw(value), before = state(doc);
    const expected = outcome(() => legacyProof(doc, update));
    assert.equal(expected.ok, false);
    assert.deepEqual(outcome(() => doc.edit(update)), expected);
    assert.deepEqual(state(doc), before);
});
test('graphic copy accepts shared noncyclic values and detaches retained objects', () => {
    const input = {a: shared, b: shared}, doc = raw(input);
    input.a.tag.push(2);
    const staged = legacyProof(doc);
    assert.deepEqual(token(staged).attrs.get('value')!.value, {a: {tag: [1]}, b: {tag: [1]}});
    (token(staged).attrs.get('value')!.value as typeof input).a.tag.push(3);
    assert.deepEqual(token(doc).attrs.get('value')!.value, {a: {tag: [1]}, b: {tag: [1]}});
    doc.edit(update);
    assert.deepEqual(token(doc).attrs.get('value')!.value, {a: {tag: [1]}, b: {tag: [1]}});
});
const corruptions: Array<[string, (doc: Doc, item: Item) => void]> = [
    ['lamport', doc => { doc.clock.lamport = NaN; }],
    ['line key', (_doc, item) => { item.line.key = undefined as never; }],
    ['origin', (_doc, item) => { item.origin = undefined as never; /* full image admission still rejects this corruption */ }],
    ['birth', (_doc, item) => { item.born = new Date(0) as never; }],
    ['span', (_doc, item) => { item.span = 1.5; }],
    ['attribute key', (_doc, item) => { item.attrs.set(undefined as never, {value: 1, at: {lamport: 3, actor: 'seed'}}); }],
    ['attribute ticket', (_doc, item) => { item.attrs.get('value')!.at.lamport = NaN; }],
    ['deletion array', (_doc, item) => { item.dels = new Set([undefined as never]); }],
    ['cancel array', (_doc, item) => { item.cancels = new Set([undefined as never]); }],
];
for (const [name, corrupt] of corruptions) test(`graphic copy exposed ${name} matches legacy admission`, () => {
    const doc = raw(null); corrupt(doc, token(doc));
    const before = state(doc), expected = outcome(() => legacyProof(doc));
    assert.equal(expected.ok, false, 'frozen legacy rejection contract');
    assert.deepEqual(outcome(() => doc.edit([])), expected);
    assert.deepEqual(state(doc), before);
});
test('graphic copy completes capture before finite JSON rejection', () => {
    const doc = raw(NaN), failure = new Error('later copied getter'), item = token(doc);
    item.attrs.set('later', {value: {get value() { throw failure; }}, at: {lamport: 4, actor: 'seed'}});
    assert.throws(() => legacyProof(doc), error => error === failure);
    assert.throws(() => doc.edit([]), error => error === failure);
});
test('graphic rejected late batch does not read live projection, notify, allocate or replace storage', () => {
    const doc = raw(null), before = state(doc), item = token(doc), lines = [...doc.lines()];
    let notifications = 0, projections = 0;
    doc.editListener = () => { notifications++; };
    const projection = doc.withReadProjection.bind(doc);
    doc.withReadProjection = (...args) => { projections++; return projection(...args); };
    const invalid: EditOp[] = [...update, {op: 'update', at: [99], attrs: {radius: 4}}];
    assert.equal(outcome(() => legacyProof(doc, invalid)).ok, false);
    assert.throws(() => doc.edit(invalid, {normalize: true}));
    assert.equal(notifications, 0); assert.equal(projections, 0);
    assert.equal(token(doc), item); assert.deepEqual([...doc.lines()], lines);
    assert.deepEqual(state(doc), before);
});
test('graphic late clock exhaustion preserves exact snapshot, version and listener state', () => {
    const doc = raw(null); doc.clock.lamport = Number.MAX_SAFE_INTEGER - 1;
    const before = state(doc); let calls = 0; doc.editListener = () => { calls++; };
    const edits: EditOp[] = [{op: 'update', at: [0], attrs: {radius: 4, value: 'second ticket'}}];
    assert.equal(outcome(() => legacyProof(doc, edits)).ok, false);
    assert.throws(() => doc.edit(edits), /clock|safe|range|exhaust/i);
    assert.deepEqual(state(doc), before); assert.equal(calls, 0);
});
// Snapshot dispatch is observable. Ignoring an override is not a safe fallback.
for (const mode of ['instance', 'subclass', 'getter', 'throwing'] as const) test(`graphic snapshot ${mode} override preserves old rejection and atomicity`, () => {
    const sentinel = new Error('snapshot override sentinel');
    let calls = 0, reads = 0, receiver: unknown;
    const base = Doc.prototype.snapshot;
    function overridden(this: Doc) {
        calls++; receiver = this;
        if (mode === 'throwing') throw sentinel;
        const image = base.call(this); image.lamport = NaN; return image;
    }
    class OverriddenDoc extends Doc { override snapshot() { return overridden.call(this); } }
    const doc = mode === 'subclass' ? new OverriddenDoc('A', schema) : raw(null);
    if (mode === 'subclass') doc.apply({t: 'node', id: {lamport: 1, actor: 'seed'}, origin: ROOT, type: 'dot', attrs: {value: null, radius: 2}});
    const history = new History();
    history.record(compileEdits(doc, update), doc, {caretBefore: 'before', caretAfter: 'after'});
    const historyBefore = history.snapshot();
    if (mode === 'getter') Object.defineProperty(doc, 'snapshot', {configurable: true, get() { reads++; return overridden; }});
    else if (mode !== 'subclass') doc.snapshot = overridden;
    const before = {image: base.call(doc), version: doc.version, clock: doc.clock.lamport};
    const lines = [...doc.lines()], items = lines.flatMap(line => line.items);
    let notified = 0; doc.editListener = () => { notified++; };
    // Check the old public composition separately, then reset only observation counters.
    if (mode === 'throwing') assert.throws(() => legacyProof(doc, insert), error => error === sentinel);
    else assert.deepEqual(outcome(() => legacyProof(doc, insert)), {ok: false, name: 'Error', message: 'Snapshot must contain finite plain JSON data without accessors'});
    assert.equal(calls, 1); assert.equal(reads, mode === 'getter' ? 1 : 0); assert.equal(receiver, doc);
    calls = 0; reads = 0;
    if (mode === 'throwing') assert.throws(() => doc.edit(insert), error => error === sentinel);
    else assert.deepEqual(outcome(() => doc.edit(insert)), {ok: false, name: 'Error', message: 'Snapshot must contain finite plain JSON data without accessors'});
    assert.equal(calls, 1); assert.equal(reads, mode === 'getter' ? 1 : 0); assert.equal(receiver, doc);
    assert.deepEqual({image: base.call(doc), version: doc.version, clock: doc.clock.lamport}, before);
    assert.deepEqual(history.snapshot(), historyBefore); assert.equal(notified, 0);
    assert.deepEqual([...doc.lines()], lines);
    lines.forEach((line, i) => assert.equal([...doc.lines()][i], line));
    items.forEach(item => assert.equal(doc.get(item.key), item));
});
test('graphic benign snapshot getter runs once with the old receiver and side effects', () => {
    const doc = raw(null), base = Doc.prototype.snapshot;
    let reads = 0, calls = 0, effect = 0;
    Object.defineProperty(doc, 'snapshot', {get() { reads++; return function(this: Doc) {
        assert.equal(this, doc); calls++; effect += 7; return base.call(this);
    }; }});
    const expected = legacyProof(doc, update).snapshot();
    assert.equal(reads, 1); assert.equal(calls, 1); assert.equal(effect, 7);
    reads = 0; calls = 0; effect = 0;
    doc.edit(update);
    assert.equal(reads, 1); assert.equal(calls, 1); assert.equal(effect, 7);
    assert.deepEqual(base.call(doc), expected);
});
test('graphic public snapshot cannot opt out of validation', () => {
    const malicious = raw(null).snapshot(); malicious.lamport = NaN;
    for (const flag of [{trusted: true}, {skipValidation: true}, {certified: true}]) {
        assert.throws(() => Doc.fromSnapshot('B', Object.assign(structuredClone(malicious), flag), schema),
            {name: 'Error', message: 'Snapshot must contain finite plain JSON data without accessors'});
    }
    assert.equal(Object.getOwnPropertyNames(Doc).some(name => /trusted|certif|decodeSnapshot|forkForGraphicProof/i.test(name)), false);
    assert.equal(Object.getOwnPropertyNames(Doc.prototype).some(name => /trusted|certif|decodeSnapshot|forkForGraphicProof/i.test(name)), false);
});
test('graphic public loader revalidates mutated previously emitted snapshots and feature declarations', () => {
    const doc = raw(null);
    for (const mutate of [
        (s: ReturnType<Doc['snapshot']>) => { s.lines[0].items[1].a!.find(([key]) => key === 'value')![1] = undefined; },
        (s: ReturnType<Doc['snapshot']>) => { delete s.format; delete s.capabilities; },
        (s: ReturnType<Doc['snapshot']>) => { s.lines.push(structuredClone(s.lines[0])); },
        (s: ReturnType<Doc['snapshot']>) => { s.lines[0].items[1].s = 0; },
    ]) { const image = doc.snapshot(); mutate(image); assert.throws(() => Doc.fromSnapshot('B', image, schema)); }
});
test('graphic exact ops, normalization, priors and retained History preserve foreign ownership', () => {
    const doc = new Doc('A', schema), history = new History();
    const oldNow = Date.now; Date.now = () => 123456;
    try {
        doc.edit(insert);
        const reference = Doc.fromSnapshot('A', doc.snapshot(), schema), otherHistory = new History();
        const id = token(doc).id;
        const record = {caretBefore: 'before', caretAfter: 'after'};
        for (const edits of [update, [{op: 'update', at: [0], attrs: {position: {x: 7}}}] as EditOp[]]) {
            const staged = legacyProof(reference, edits), actual = doc.edit(edits, {normalize: true});
            const expectedOps = compileEdits(reference, edits);
            assert.deepEqual(actual.ops, expectedOps); assert.deepEqual(actual.normalize, []);
            assert.deepEqual(doc.snapshot(), staged.snapshot());
            for (let i = 0; i < actual.ops.length; i++) assert.deepEqual(doc.priorOf(actual.ops[i]), reference.priorOf(expectedOps[i]));
            history.record(actual.ops, doc, record); otherHistory.record(expectedOps, reference, record);
        }
        // A foreign same-value write wins radius ownership; own undo must retain it.
        const remote = {t: 'set' as const, at: {lamport: doc.clock.lamport + 1, actor: 'foreign'}, ids: [id], key: 'radius', value: 3};
        doc.apply(remote); reference.apply(structuredClone(remote));
        const restored = History.fromSnapshot(history.snapshot());
        assert.deepEqual(restored.snapshot(), otherHistory.snapshot());
        for (const action of ['undo', 'undo', 'redo', 'redo'] as const) {
            assert.deepEqual(restored[action](doc), otherHistory[action](reference));
            assert.deepEqual(doc.snapshot(), reference.snapshot());
            assert.equal(token(doc).attrs.get('radius')!.value, 3);
            assert.equal(doc.setTicket(id, 'radius')!.actor, 'foreign');
        }
        const edits: EditOp[] = [{op: 'delete', at: [0], count: 1}];
        const deletion = doc.edit(edits).ops; const expectedDeletion = compileEdits(reference, edits);
        assert.deepEqual(deletion, expectedDeletion);
        restored.record(deletion, doc, record); otherHistory.record(expectedDeletion, reference, record);
        const del = deletion.find(op => op.t === 'del')!; assert.equal(del.t, 'del');
        assert.equal(restored.pin(key => key === keyOf(del.at) ? 17 : undefined), 17);
        assert.equal(restored.pin(() => undefined), null);
        assert.deepEqual(restored.undo(doc), otherHistory.undo(reference));
        assert.deepEqual(doc.snapshot(), reference.snapshot());
    } finally { Date.now = oldNow; }
});

import {typescriptClientEngineFactory} from '../src/engine/typescript-client.ts';
import {LocalClient} from '../src/local/client.ts';
import type {TypeScriptEngineCheckpoint} from '../src/engine/contract.ts';
import {DocHub} from '../src/server/hub.ts';

test('graphic external engine checkpoint and local state retain full JSON validation', () => {
    const engine = typescriptClientEngineFactory.create('A', schema);
    engine.apply(insert);
    const before = engine.checkpoint();
    const bad = structuredClone(before) as TypeScriptEngineCheckpoint;
    bad.document.lines[0].items[1].a!.push(['external-bad', Infinity, '1@A']);
    assert.throws(() => engine.prepareCheckpoint(bad));
    assert.deepEqual(engine.checkpoint(), before);
    const local = new LocalClient({schema, actor: 'A'});
    try {
        local.edit(insert);
        const good = local.captureState(), invalid = structuredClone(good);
        (invalid.engine as TypeScriptEngineCheckpoint).document.lamport = Infinity;
        assert.throws(() => LocalClient.fromState(invalid, {schema}));
        assert.deepEqual(local.captureState(), good);
    } finally { local.dispose(); engine.dispose(); }
});
test('graphic server snapshot remains external untrusted input at client admission', () => {
    const hub = new DocHub({schema}), author = new Doc('author', schema);
    const ops = author.edit(insert).ops;
    hub.submit({actor: 'author', seq: 1, ops});
    const image = hub.doc.snapshot();
    assert.deepEqual(Doc.fromSnapshot('peer', image, schema).toJSON(), author.toJSON());
    image.lines[0].items[1].a!.push(['external-bad', new Date(0), '1@author']);
    assert.throws(() => Doc.fromSnapshot('peer', image, schema));
    assert.deepEqual(hub.doc.toJSON(), author.toJSON());
});
function inventory(doc: Doc) {
    return [...doc.lines()].map(line => ({key: line.key, owner: line.owner?.key ?? null, slot: line.slot,
        items: line.items.map(item => ({id: {...item.id}, key: item.key, origin: item.origin, kind: item.kind,
            born: item.born, span: item.span, boundary: item.boundary, compact: item.compact,
            attrs: [...item.attrs].map(([key, entry]) => [key, structuredClone(entry.value), {...entry.at}]),
            dels: [...item.dels], cancels: [...item.cancels]}))}));
}
test('graphic nested parent movement and hidden deletion preserve full storage and exact priors', () => {
    const doc = new Doc('A', schema), history = new History(), reference = new Doc('A', schema), otherHistory = new History();
    const now = Date.now; Date.now = () => 123456;
    try {
        const edits: EditOp[][] = [
            [{op: 'insert', at: [0], content: [{type: 'box', children: [{type: 'dot'}]}, {type: 'dot'}]}],
            [{op: 'move', from: [1], at: [0, 0]}],
            [{op: 'delete', at: [0], count: 1}],
        ];
        for (const batch of edits) {
            const staged = legacyProof(reference, batch), expected = compileEdits(reference, batch);
            const actual = doc.edit(batch, {normalize: true});
            assert.deepEqual(actual.ops, expected); assert.deepEqual(actual.normalize, []);
            assert.deepEqual(inventory(doc), inventory(staged));
            for (let i = 0; i < actual.ops.length; i++) assert.deepEqual(doc.priorPlacementOf(actual.ops[i]), reference.priorPlacementOf(expected[i]));
            history.record(actual.ops, doc, {caretBefore: 'from', caretAfter: 'to'});
            otherHistory.record(expected, reference, {caretBefore: 'from', caretAfter: 'to'});
            assert.deepEqual(history.snapshot(), otherHistory.snapshot());
        }
        assert.deepEqual(doc.toJSON(), {type: 'stage', children: []});
        assert.ok(inventory(doc).flatMap(line => line.items).some(item => item.dels.length > 0));
        for (const action of ['undo', 'undo', 'redo', 'redo'] as const) {
            assert.deepEqual(history[action](doc), otherHistory[action](reference));
            assert.deepEqual(inventory(doc), inventory(reference));
        }
        assert.deepEqual(Doc.fromSnapshot('copy', doc.snapshot(), schema).snapshot(), doc.snapshot());
    } finally { Date.now = now; }
});
