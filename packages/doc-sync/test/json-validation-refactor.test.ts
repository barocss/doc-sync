import assert from 'node:assert/strict';
import {test} from 'node:test';
import {annotationJsonOk} from '../src/crdt/annotations.ts';
import {legacyAnnotationJsonOk} from './json-validation-legacy.fixture.ts';
import {Doc} from '../src/crdt/doc.ts';
import {ROOT} from '../src/crdt/ticket.ts';
import {createDataHub} from '../src/server/index.ts';
import {validateDataPayload} from '../src/data/admission.ts';
import {createDataSchema} from '../src/data/schema.ts';
import type {GraphicSchema} from '../src/crdt/schema.ts';
import type {Change} from '../src/sync/protocol.ts';

type Validator = (value: unknown, maxDepth?: number) => boolean;
type Probe = {value: unknown; trace: string[]; sentinel?: unknown};
type Factory = () => Probe;
function observed(validate: Validator, make: Factory, maxDepth = 64) {
    // Never reuse a proxy, trap counter, revoked target or throw object across lanes.
    const probe = make();
    try { return {result: validate(probe.value, maxDepth), trace: probe.trace}; }
    catch (error) {
        const isError = error instanceof Error;
        if (probe.sentinel !== undefined) assert.equal(error, probe.sentinel, 'same sentinel object must propagate');
        return {thrown: {name: isError ? error.name : typeof error, message: isError ? error.message : null,
            sentinel: probe.sentinel !== undefined && error === probe.sentinel}, trace: probe.trace};
    }
}
function agrees(make: Factory, expected: boolean, maxDepth = 64) {
    const legacy = observed(legacyAnnotationJsonOk, make, maxDepth);
    assert.equal(legacy.result, expected, 'fixed old admission contract');
    assert.deepEqual(observed(annotationJsonOk, make, maxDepth), legacy);
}
const inert = (make: () => unknown): Factory => () => ({value: make(), trace: []});
function nested(objects: number, leaf: unknown): unknown {
    let value = leaf; for (let i = 0; i < objects; i++) value = {next: value}; return value;
}
const cases: Array<[string, () => unknown, boolean]> = [
    ['null', () => null, true], ['true', () => true, true], ['false', () => false, true],
    ['zero', () => 0, true], ['negative zero', () => -0, true], ['finite', () => Number.MAX_VALUE, true],
    ['Unicode', () => '한글😀e\u0301\u0000', true], ['empty object', () => ({}), true], ['empty array', () => [], true],
    ['dense mixed', () => [null, -0, true, '한글', {a: [1]}], true],
    ['undefined', () => undefined, false], ['function', () => () => 1, false], ['symbol', () => Symbol('x'), false],
    ['bigint', () => 1n, false], ['NaN', () => NaN, false], ['Infinity', () => Infinity, false], ['negative Infinity', () => -Infinity, false],
    ['Date', () => new Date(0), false], ['Map', () => new Map(), false], ['Set', () => new Set(), false],
    ['typed array', () => new Uint8Array(), false], ['boxed scalar', () => new Number(1), false],
    ['sparse', () => new Array(2), false], ['hole', () => [1, , 3], false],
    ['array extra', () => Object.assign([1], {extra: 2}), false], ['array padded index', () => Object.assign([1], {'01': 2}), false],
    ['array negative key', () => Object.assign([1], {'-1': 2}), false],
    ['array symbol', () => Object.assign([1], {[Symbol('x')]: 2}), false],
    ['object symbol', () => ({[Symbol('x')]: 2}), false],
    ['nonenumerable', () => Object.defineProperty({}, 'x', {value: 1}), false],
    ['nonenumerable array index', () => Object.defineProperty([1], '0', {value: 1, enumerable: false}), false],
    ['object custom prototype', () => Object.assign(Object.create({tag: 1}), {x: 1}), false],
    // Arrays intentionally do not use the plain-object prototype test.
    ['array custom prototype', () => Object.setPrototypeOf([1], null), true],
    ['null prototype', () => Object.assign(Object.create(null), {x: 1}), true],
    ['frozen', () => Object.freeze({x: Object.freeze([1])}), true], ['sealed', () => Object.seal({x: 1}), true],
    ['reordered attributes', () => ({z: 1, b: 2, a: 3}), true],
    ['nonwritable data', () => Object.defineProperty({}, 'x', {value: 1, enumerable: true}), true],
    ['cycle object', () => { const a: Record<string, unknown> = {}; a.a = a; return a; }, false],
    ['cycle array', () => { const a: unknown[] = []; a.push(a); return a; }, false],
    ['mutual cycle', () => { const a = {b: {} as unknown}; a.b = {a}; return a; }, false],
    ['shared DAG', () => { const a = {v: [1]}; return {a, b: a}; }, true],
];
for (const key of ['__proto__', 'prototype', 'constructor']) cases.push([
    `poison ${key}`, () => Object.defineProperty({}, key, {value: 1, enumerable: true}), false,
]);
for (const [name, make, expected] of cases) test(`JSON original contract: ${name}`, () => agrees(inert(make), expected));
for (const maxDepth of [0, 64, 121, 122, 128]) {
    test(`JSON object depth ${maxDepth} is inclusive`, () => {
        agrees(inert(() => nested(maxDepth, {})), true, maxDepth);
        agrees(inert(() => nested(maxDepth + 1, {})), false, maxDepth);
    });
    for (const leaf of [null, true, '한글😀', 1, -0]) test(`JSON primitive before depth ${maxDepth}: ${String(leaf)}`, () => {
        agrees(inert(() => nested(maxDepth + 1, leaf)), true, maxDepth);
    });
}
for (const kind of ['object', 'array'] as const) test(`JSON ${kind} accessor is rejected without getter reads`, () => {
    const make: Factory = () => {
        const trace: string[] = [], value = kind === 'array' ? [1] : {};
        Object.defineProperty(value, kind === 'array' ? '0' : 'x', {enumerable: true, get() { trace.push('GETTER'); throw new Error('must not read'); }});
        return {value, trace};
    };
    agrees(make, false); assert.deepEqual(observed(annotationJsonOk, make).trace, []);
});

type ProxyMode = 'plain' | 'null prototype' | 'reordered' | 'array' | 'sparse' | 'extra' | 'symbol' | 'accessor'
    | 'invalid array child' | 'array poison' | 'prototype throws' | 'keys1 throws' | 'descriptor throws' | 'keys2 throws' | 'length throws'
    | 'keys2 adds' | 'keys2 omits' | 'keys2 duplicates' | 'descriptor mutates' | 'length changes' | 'revoked' | 'revoke on keys2' | 'non-Error sentinel';
function proxyProbe(mode: ProxyMode): Factory {
    return () => {
        const trace: string[] = [], sentinel = mode === 'non-Error sentinel' ? {sentinel: 'object'} : new RangeError('trap sentinel');
        const array = ['array', 'sparse', 'extra', 'length throws', 'length changes', 'invalid array child', 'array poison'].includes(mode);
        const target = array ? (mode === 'sparse' ? new Array(1) : [1]) : {a: 1, b: 2};
        if (mode === 'invalid array child') Reflect.set(target, '0', NaN);
        if (mode === 'array poison') Object.defineProperty(target, 'constructor', {value: 1, enumerable: true});
        if (mode === 'extra') Object.assign(target, {extra: 3});
        if (mode === 'symbol') Object.assign(target, {[Symbol('x')]: 3});
        if (mode === 'null prototype') Object.setPrototypeOf(target, null);
        if (mode === 'accessor') Object.defineProperty(target, 'a', {enumerable: true, get() { trace.push('GETTER'); return 1; }});
        let keys = 0, lengths = 0;
        const revocable = Proxy.revocable(target, {
            getPrototypeOf(t) { trace.push('getPrototypeOf'); if (mode === 'prototype throws') throw sentinel; return Reflect.getPrototypeOf(t); },
            ownKeys(t) {
                trace.push(`ownKeys:${++keys}`);
                if (mode === 'keys1 throws' && keys === 1 || mode === 'keys2 throws' && keys === 2 || mode === 'non-Error sentinel') throw sentinel;
                if (keys === 2 && mode === 'revoke on keys2') revocable.revoke();
                const result = Reflect.ownKeys(t);
                if (mode === 'reordered') result.reverse();
                if (keys === 2 && mode === 'keys2 adds') result.push('missing');
                if (keys === 2 && mode === 'keys2 omits') return [];
                if (keys === 2 && mode === 'keys2 duplicates') result.push('a');
                return result;
            },
            getOwnPropertyDescriptor(t, key) {
                trace.push(`descriptor:${String(key)}`);
                if (mode === 'descriptor throws') throw sentinel;
                const descriptor = Reflect.getOwnPropertyDescriptor(t, key);
                if (mode === 'descriptor mutates' && key === 'a') Reflect.set(t, 'b', NaN);
                return descriptor;
            },
            get(t, key, receiver) {
                trace.push(`get:${String(key)}`);
                if (key === 'length') {
                    lengths++;
                    if (mode === 'length throws') throw sentinel;
                    if (mode === 'length changes') return lengths === 1 ? 1 : 2;
                }
                return Reflect.get(t, key, receiver);
            },
        });
        if (mode === 'revoked') revocable.revoke();
        const throwsSentinel = ['prototype throws', 'keys1 throws', 'descriptor throws', 'keys2 throws', 'length throws', 'non-Error sentinel'].includes(mode);
        return {value: revocable.proxy, trace, ...(throwsSentinel ? {sentinel} : {})};
    };
}
const proxyExpectations: Array<[ProxyMode, boolean | 'throw']> = [
    ['plain', true], ['null prototype', true], ['reordered', true], ['array', true], ['sparse', false],
    ['invalid array child', false], ['array poison', false], ['extra', false], ['symbol', false], ['accessor', false], ['prototype throws', 'throw'],
    ['keys1 throws', 'throw'], ['descriptor throws', 'throw'], ['keys2 throws', 'throw'], ['length throws', 'throw'],
    ['keys2 adds', 'throw'], ['keys2 omits', true], ['keys2 duplicates', 'throw'], ['descriptor mutates', false],
    ['length changes', false], ['revoked', 'throw'], ['revoke on keys2', 'throw'], ['non-Error sentinel', 'throw'],
];
for (const [mode, expected] of proxyExpectations) test(`JSON fresh Proxy result, trace and throw order: ${mode}`, () => {
    const make = proxyProbe(mode), legacy = observed(legacyAnnotationJsonOk, make);
    if (expected === 'throw') assert.ok('thrown' in legacy); else assert.equal(legacy.result, expected);
    assert.deepEqual(observed(annotationJsonOk, make), legacy);
    if (mode === 'plain') assert.deepEqual(legacy.trace, ['getPrototypeOf', 'ownKeys:1', 'descriptor:a', 'descriptor:b', 'ownKeys:2']);
    if (mode === 'array') assert.deepEqual(legacy.trace, ['ownKeys:1', 'descriptor:0', 'descriptor:length', 'ownKeys:2', 'get:length', 'get:length']);
    if (mode === 'invalid array child') assert.equal(legacy.trace.filter(event => event === 'get:length').length, 1, 'no final length read after failed child');
    if (mode === 'keys2 throws') assert.deepEqual(legacy.trace, ['getPrototypeOf', 'ownKeys:1', 'descriptor:a', 'descriptor:b', 'ownKeys:2']);
    assert.ok(!legacy.trace.includes('GETTER'));
});
test('JSON bulk descriptor collection precedes recursion and second keys are not replaced by descriptor keys', () => {
    const make: Factory = () => {
        const trace: string[] = [], sentinel = new Error('later descriptor before child');
        const child = new Proxy({}, {getPrototypeOf() { trace.push('child'); throw new Error('wrong first error'); }});
        const value = new Proxy({first: child, later: 1}, {ownKeys(t) { trace.push('keys'); return Reflect.ownKeys(t); },
            getOwnPropertyDescriptor(t, key) { trace.push(`descriptor:${String(key)}`); if (key === 'later') throw sentinel; return Reflect.getOwnPropertyDescriptor(t, key); }});
        return {value, trace, sentinel};
    };
    const legacy = observed(legacyAnnotationJsonOk, make);
    assert.deepEqual(legacy.trace, ['keys', 'descriptor:first', 'descriptor:later']);
    assert.deepEqual(observed(annotationJsonOk, make), legacy);
});

test('JSON deterministic generated Unicode trees agree with the frozen original', () => {
    let seed = 0x51a7c0de;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
    const scalars = [null, false, true, -0, 1.5, -9, '한글😀', 'e\u0301\u0000'];
    function generate(depth: number): unknown {
        const choice = random() % (depth ? 10 : 8);
        if (choice < 8) return scalars[choice];
        const size = random() % 5;
        if (choice === 8) return Array.from({length: size}, () => generate(depth - 1));
        return Object.fromEntries(Array.from({length: size}, (_, i) => [`키${i}`, generate(depth - 1)]));
    }
    for (let i = 0; i < 400; i++) {
        const value = generate(4);
        agrees(inert(() => structuredClone(value)), true);
        agrees(inert(() => ({value: structuredClone(value), invalid: NaN})), false);
    }
});

const graphic: GraphicSchema = {domain: 'graphic', root: 'stage', marks: [], nodes: {
    stage: {shape: 'container', children: ['dot']}, dot: {shape: 'atom', attrs: {value: {default: null}}},
}};
function image(value: unknown) {
    const doc = new Doc('author', graphic);
    doc.apply({t: 'node', id: {lamport: 1, actor: 'author'}, origin: ROOT, type: 'dot', attrs: {value: null}});
    const snapshot = doc.snapshot(); snapshot.lines[0].items[1].a!.find(([key]) => key === 'value')![1] = value;
    return snapshot;
}
for (const [name, make, valid] of cases) test(`JSON public Doc.fromSnapshot admission: ${name}`, () => {
    const value = image(make()); assert.equal(legacyAnnotationJsonOk(value, 128), valid);
    if (valid) assert.doesNotThrow(() => Doc.fromSnapshot('peer', value, graphic));
    else assert.throws(() => Doc.fromSnapshot('peer', value, graphic), {name: 'Error', message: 'Snapshot must contain finite plain JSON data without accessors'});
});
for (const [depth, valid] of [[121, true], [122, false]] as const) test(`JSON public snapshot payload depth ${depth}`, () => {
    const value = image(nested(depth, {})); assert.equal(legacyAnnotationJsonOk(value, 128), valid);
    if (valid) assert.doesNotThrow(() => Doc.fromSnapshot('peer', value, graphic));
    else assert.throws(() => Doc.fromSnapshot('peer', value, graphic), /finite plain JSON/);
    assert.doesNotThrow(() => Doc.fromSnapshot('peer', image(nested(depth, null)), graphic));
    assert.throws(() => Doc.fromSnapshot('peer', image(nested(123, null)), graphic), /finite plain JSON/);
});

test('JSON public snapshot copy preserves getter effects and a later clone sentinel before validation', () => {
    const doc = new Doc('A', graphic);
    doc.edit([{op: 'insert', at: [0], content: [{type: 'dot'}]}]);
    const item = doc.lines().flatMap(line => line.items).find(item => item.born === 'dot')!;
    const trace: string[] = [], sentinel = new Error('late snapshot getter');
    item.attrs.set('value', {at: {lamport: 4, actor: 'A'}, value: {get first() { trace.push('first'); return NaN; }}});
    item.attrs.set('later', {at: {lamport: 5, actor: 'A'}, value: {get later() { trace.push('later'); throw sentinel; }}});
    const before = {clock: doc.clock.lamport, version: doc.version};
    assert.throws(() => Doc.fromSnapshot('peer', doc.snapshot(), graphic), error => error === sentinel);
    assert.deepEqual(trace, ['first', 'later']); trace.length = 0;
    assert.throws(() => doc.edit([]), error => error === sentinel);
    assert.deepEqual(trace, ['first', 'later']); assert.deepEqual({clock: doc.clock.lamport, version: doc.version}, before);
    assert.equal(doc.get(item.key), item);
});

for (const [name, make, valid] of cases) test(`JSON Data payload admission before clone: ${name}`, () => {
    const change = {actor: 'A', seq: 1, ops: [], extra: make()} as Change;
    assert.equal(legacyAnnotationJsonOk(change, 128), valid);
    if (valid) assert.doesNotThrow(() => validateDataPayload(change));
    else assert.throws(() => validateDataPayload(change), {name: 'Error', message: 'Data: payload must contain finite plain JSON data without accessors'});
});
test('JSON guarded server rejects malformed payload before append, broadcast, clock and retry consumption', () => {
    const hub = createDataHub({generation: 'json-validation'}), author = new Doc('A', createDataSchema());
    const change: Change = {actor: 'A', seq: 1, ops: author.edit([{op: 'insert', at: [0], content: [{type: 'entry', attrs: {
        id: 'data:00000000-0000-4000-8000-000000000001', key: '한글', value: {scalar: '😀'},
    }}]}]).ops};
    const before = hub.doc.snapshot(); let append = 0, broadcast = 0, reads = 0;
    hub.onAppend = () => { append++; }; hub.listen(() => { broadcast++; });
    const malformed = [NaN, Infinity, 1n, new Date(0), new Map(), new Set(), new Array(1), JSON.parse('{"__proto__":1}')];
    for (const value of malformed) {
        const invalid = {...change, extra: value};
        assert.equal(legacyAnnotationJsonOk(invalid, 128), false);
        assert.throws(() => hub.submit(invalid), /Data: payload must contain finite plain JSON/);
    }
    const accessor = {...change}; Object.defineProperty(accessor, 'ops', {enumerable: true, get() { reads++; throw new Error('must not read'); }});
    assert.throws(() => hub.submit(accessor), /Data: payload must contain finite plain JSON/);
    assert.equal(reads, 0); assert.deepEqual(hub.doc.snapshot(), before); assert.equal(hub.serverSeq, 0);
    assert.equal(append, 0); assert.equal(broadcast, 0); assert.deepEqual(hub.log, []);
    assert.equal(hub.submit(change)!.serverSeq, 1); assert.equal(append, 1); assert.equal(broadcast, 1);
});

for (const admission of ['snapshot', 'data'] as const) test(`JSON ${admission} rejects nested accessors without executing them`, () => {
    let reads = 0;
    const hostile = {get x() { reads++; throw new Error('not read'); }};
    if (admission === 'snapshot') assert.throws(() => Doc.fromSnapshot('B', image(hostile), graphic), /finite plain JSON/);
    else assert.throws(() => validateDataPayload({actor: 'A', seq: 1, ops: [], extra: hostile} as Change), /finite plain JSON/);
    assert.equal(reads, 0);
});
