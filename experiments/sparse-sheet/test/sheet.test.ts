import assert from 'node:assert/strict';
import test from 'node:test';
import {SparseSheet} from '../src/sheet.ts';

const sheet = (actor = 'a', rows = 1_000_000_000, columns = 1_000_000) =>
    new SparseSheet({actor, sheetId: 'test-sheet', rows, columns});
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('a huge blank sheet stays sparse, including reads and a far first write', () => {
    const s = sheet();
    const before = s.captureState();
    assert.equal(s.stats().registers, 0);
    assert.equal(s.stats().retainedOps, 0);
    for (const [r, c] of [[0, 0], [999_999_999, 999_999]]) assert.deepEqual(s.getCell(r, c), {});
    assert.deepEqual(s.captureState(), before, 'reads must not allocate persistent state');
    assert.ok(JSON.stringify(before).length < 4096, 'extent must not materialize axes or cells');
    s.setCell(999_999_999, 999_999, {value: 'far', bold: true});
    assert.deepEqual(s.getCell(999_999_999, 999_999), {value: 'far', bold: true});
    assert.ok(JSON.stringify(s.captureState()).length < 8192);
});

test('concurrent first writes use deterministic actor ordering and merge independent fields', () => {
    const a = sheet('a');
    const z = sheet('z');
    const ao = a.setCell(7, 9, {value: 'a', fill: '#fff'});
    const zo = z.setCell(7, 9, {value: 'z', bold: true});
    const first = sheet('first');
    const second = sheet('second');
    first.receive([...ao, ...zo]);
    second.receive([...zo, ...ao]);
    assert.deepEqual(first.getCell(7, 9), {value: 'z', fill: '#fff', bold: true});
    assert.deepEqual(second.getCell(7, 9), first.getCell(7, 9));
    a.receive(zo);
    z.receive(ao);
    assert.deepEqual(a.getCell(7, 9), z.getCell(7, 9));
});

test('shuffled and duplicate delivery preserves every field winner', () => {
    const a = sheet('a');
    const one = a.setCell(1, 2, {value: 1, bold: true});
    const two = a.setCell(1, 2, {value: 2, numberFormat: '0.00'});
    const three = a.setCell(3, 4, {formula: '=A1+1'});
    const b = sheet('b');
    b.receive([...three, ...two, ...one, ...two, ...three]);
    assert.deepEqual(b.getCell(1, 2), {value: 2, bold: true, numberFormat: '0.00'});
    assert.deepEqual(b.getCell(3, 4), {formula: '=A1+1'});
    const before = b.captureState();
    b.receive([...one, ...two, ...three]);
    assert.deepEqual(b.captureState(), before);
});

test('consecutive undo and redo work twice and preserve peer fields', () => {
    const a = sheet();
    a.setCell(0, 0, {value: 1});
    a.setCell(0, 0, {value: 2});
    const peer = sheet('peer');
    peer.receive(a.pendingChanges());
    a.receive(peer.setCell(0, 0, {bold: true}));
    a.undo();
    assert.deepEqual(a.getCell(0, 0), {value: 1, bold: true});
    a.undo();
    assert.deepEqual(a.getCell(0, 0), {bold: true});
    a.redo();
    assert.deepEqual(a.getCell(0, 0), {value: 1, bold: true});
    a.redo();
    assert.deepEqual(a.getCell(0, 0), {value: 2, bold: true});
});

test('peer same-value write fences local undo on that field', () => {
    const a = sheet();
    const peer = sheet('peer');
    peer.receive(a.setCell(0, 0, {value: 12, bold: true}));
    a.receive(peer.setCell(0, 0, {value: 12}));
    a.undo();
    assert.deepEqual(a.getCell(0, 0), {value: 12});
    a.redo();
    assert.deepEqual(a.getCell(0, 0), {value: 12, bold: true});
});

test('mixed invalid receive is atomic', () => {
    const target = sheet('target');
    const valid = sheet('source').setCell(2, 3, {value: 'accepted only as full batch'});
    const before = target.captureState();
    assert.throws(() => target.receive([...valid, {} as never]));
    assert.deepEqual(target.captureState(), before);
});

test('unsafe primitives and invalid coordinates fail without changing state', () => {
    const s = sheet();
    const before = s.captureState();
    for (const coordinate of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => s.setCell(coordinate, 0, {value: 'x'}));
        assert.throws(() => s.getCell(0, coordinate));
    }
    for (const value of [NaN, Infinity, -Infinity, {}, [], undefined]) {
        assert.throws(() => s.setCell(0, 0, {value} as never));
    }
    assert.throws(() => s.setCell(1_000_000_000, 0, {value: 1}));
    assert.deepEqual(s.captureState(), before);
    for (const actor of ['', '~root', 'x@y']) assert.throws(() => sheet(actor));
});

test('state and cell reads are detached from caller mutation', () => {
    const s = sheet();
    const ops = s.setCell(1, 1, {value: 'safe'});
    const state = copy(s.captureState());
    const cell = s.getCell(1, 1);
    cell.value = 'tampered';
    const detachedState = s.captureState();
    detachedState.checkpoint.registers[0][1].value = 'tampered state';
    detachedState.checkpoint.pending[0].value = 'tampered pending';
    ops[0].value = 'tampered returned operation';
    const detachedPending = s.pendingChanges();
    detachedPending[0].value = 'tampered pending read';
    assert.deepEqual(s.getCell(1, 1), {value: 'safe'});
    assert.deepEqual(s.captureState(), state);
    assert.ok(ops.length > 0);
});

test('clear tombstones survive late writes and reset all cell fields', () => {
    const a = sheet();
    const old = a.setCell(5, 6, {value: 5, formula: '=5', fill: '#fff', bold: true, numberFormat: '0'});
    const clear = a.setCell(5, 6, {value: null, formula: null, fill: null, bold: null, numberFormat: null});
    const b = sheet('b');
    b.receive([...clear, ...old]);
    assert.deepEqual(b.getCell(5, 6), {});
    assert.deepEqual(b.getRange({row: 0, column: 0, rowCount: 10, columnCount: 10}), []);
    b.receive(old);
    assert.deepEqual(b.getCell(5, 6), {});
    a.undo();
    assert.deepEqual(a.getCell(5, 6), {value: 5, formula: '=5', fill: '#fff', bold: true, numberFormat: '0'});
});

test('same ticket with different payload fails even when original lost the register', () => {
    const a = sheet();
    const old = a.setCell(0, 0, {value: 1});
    const newer = a.setCell(0, 0, {value: 2});
    const b = sheet('b');
    b.receive([...newer, ...old]);
    const before = b.captureState();
    const collision = copy(old);
    collision[0].value = 99;
    assert.throws(() => b.receive(collision));
    assert.deepEqual(b.captureState(), before);
});

test('range reads return ordered sparse entries and enforce output bounds', () => {
    const s = sheet();
    s.setCell(999_999_999, 999_999, {value: 'last'});
    s.setCell(20, 50, {value: 'middle'});
    s.setCell(0, 0, {value: 'first'});
    const range = {row: 0, column: 0, rowCount: 1_000_000_000, columnCount: 1_000_000};
    assert.deepEqual(s.getRange({...range, limit: 3}), [
        {row: 0, column: 0, cell: {value: 'first'}},
        {row: 20, column: 50, cell: {value: 'middle'}},
        {row: 999_999_999, column: 999_999, cell: {value: 'last'}},
    ]);
    assert.throws(() => s.getRange({...range, limit: 2}));
    assert.deepEqual(s.getRange({row: 20, column: 50, rowCount: 1, columnCount: 1, limit: 1}), [
        {row: 20, column: 50, cell: {value: 'middle'}},
    ]);
    const before = s.captureState();
    for (const bad of [{row: -1}, {column: 0.5}, {rowCount: Infinity}, {columnCount: -1}, {limit: -1}]) {
        assert.throws(() => s.getRange({...range, ...bad}));
    }
    assert.deepEqual(s.captureState(), before);
});

test('pending acknowledgement accepts only an exact prefix', () => {
    const s = sheet();
    const first = s.setCell(0, 0, {value: 1});
    const second = s.setCell(0, 1, {value: 2});
    const before = s.captureState();
    assert.throws(() => s.acknowledge(second));
    assert.deepEqual(s.captureState(), before);
    const altered = copy(first);
    altered[0].value = 42;
    assert.throws(() => s.acknowledge(altered));
    assert.deepEqual(s.captureState(), before);
    s.acknowledge(first);
    assert.deepEqual(s.pendingChanges(), second);
    s.acknowledge(second);
    assert.deepEqual(s.pendingChanges(), []);
});

test('restart retains pending operations and undo history; replay twice is exact', () => {
    const s = sheet();
    s.setCell(0, 0, {value: 'one'});
    s.setCell(0, 0, {value: 'two'});
    s.undo();
    const saved = copy(s.captureState());
    const restored = SparseSheet.fromState(saved);
    assert.deepEqual(restored.captureState(), saved);
    assert.deepEqual(restored.pendingChanges(), s.pendingChanges());
    restored.redo();
    s.redo();
    assert.deepEqual(restored.captureState(), s.captureState());
    restored.undo();
    restored.undo();
    assert.deepEqual(restored.getCell(0, 0), {});
    const peer = sheet('peer');
    peer.receive(restored.pendingChanges());
    const once = peer.captureState();
    peer.receive(restored.pendingChanges());
    assert.deepEqual(peer.captureState(), once);
    assert.deepEqual(peer.getCell(0, 0), {});
});

test('independent ticket oracle matches randomized three-replica delivery', () => {
    const replicas = [sheet('a'), sheet('b'), sheet('c')];
    const operations: ReturnType<SparseSheet['pendingChanges']> = [];
    let seed = 8675309;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let i = 0; i < 240; i++) {
        const replica = replicas[random() % replicas.length];
        const row = random() % 7;
        const column = random() % 5;
        const patch = random() % 2 ? {value: random() % 11} : {bold: Boolean(random() % 2)};
        operations.push(...replica.setCell(row, column, patch));
        if (i % 4 === 0) replicas[random() % replicas.length].receive([operations[random() % operations.length]]);
    }
    const winners = new Map<string, (typeof operations)[number]>();
    for (const op of operations) {
        const key = `${op.row},${op.column},${op.field}`;
        const prior = winners.get(key);
        if (!prior || op.at.lamport > prior.at.lamport || (op.at.lamport === prior.at.lamport && op.at.actor > prior.at.actor)) winners.set(key, op);
    }
    for (const replica of replicas) {
        const shuffled = [...operations];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = random() % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        replica.receive([...shuffled, ...shuffled.slice(0, 40)]);
        for (let row = 0; row < 7; row++) for (let column = 0; column < 5; column++) {
            const expected: Record<string, unknown> = {};
            for (const field of ['value', 'bold']) {
                const winner = winners.get(`${row},${column},${field}`);
                if (winner && winner.value !== null) expected[field] = winner.value;
            }
            assert.deepEqual(replica.getCell(row, column), expected);
        }
    }
});

test('operation envelope rejects unsafe fields, clocks, actors, and cross-sheet writes atomically', () => {
    const valid = sheet('source').setCell(0, 0, {value: 'ok'})[0];
    const target = sheet('target');
    const before = target.captureState();
    const mutations = [
        {sheetId: 'other-sheet'}, {row: -1}, {column: Number.MAX_SAFE_INTEGER + 1},
        {field: '__proto__'}, {field: 'value', value: {nested: true}},
        {field: 'bold', value: 'true'}, {at: {lamport: 0, actor: 'a'}},
        {at: {lamport: Number.MAX_SAFE_INTEGER + 1, actor: 'a'}},
        {at: {lamport: NaN, actor: 'a'}}, {at: {lamport: 1, actor: ''}},
        {at: {lamport: 1, actor: '~root'}},
    ];
    for (const mutation of mutations) {
        assert.throws(() => target.receive([valid, {...valid, ...mutation}] as never), JSON.stringify(mutation));
        assert.deepEqual(target.captureState(), before);
    }
});

test('invalid constructor extents are rejected', () => {
    for (const extent of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => new SparseSheet({actor: 'a', sheetId: 'test-sheet', rows: extent, columns: 10}));
        assert.throws(() => new SparseSheet({actor: 'a', sheetId: 'test-sheet', rows: 10, columns: extent}));
    }
});

test('malformed snapshot clock, pending, history, and journal fail without mutating live state', () => {
    const s = sheet();
    s.setCell(0, 0, {value: 1, bold: true});
    s.setCell(0, 0, {value: 2});
    s.undo();
    const before = copy(s.captureState());
    const mutations: Array<(state: any) => void> = [
        state => {state.checkpoint.clock = -1;},
        state => {state.checkpoint.clock += 1;},
        state => {state.checkpoint.clock = Number.MAX_SAFE_INTEGER + 1;},
        state => {state.checkpoint.pending.pop();},
        state => {state.checkpoint.pending.reverse();},
        state => {state.checkpoint.undo[0][0].before.value = 'forged';},
        state => {state.checkpoint.redo[0][0].after.at.lamport += 1;},
        state => {state.checkpoint.registers[0][1].value = 'forged';},
        state => {state.journal[0].ops[0].value = 'forged';},
        state => {state.options.actor = 'other';},
    ];
    for (const mutate of mutations) {
        const malformed = copy(before);
        mutate(malformed);
        assert.throws(() => s.restoreState(malformed));
        assert.deepEqual(s.captureState(), before);
    }
    for (const mutate of mutations.slice(0, -1)) {
        const malformed = copy(before);
        mutate(malformed);
        assert.throws(() => SparseSheet.fromState(malformed));
    }
});

test('receiving maximum clock is valid but subsequent local write fails atomically', () => {
    const s = sheet();
    const op = sheet('peer').setCell(0, 0, {value: 'last-clock'})[0];
    op.at.lamport = Number.MAX_SAFE_INTEGER;
    s.receive([op]);
    const before = s.captureState();
    assert.throws(() => s.setCell(0, 1, {value: 1}));
    assert.deepEqual(s.captureState(), before);
});
