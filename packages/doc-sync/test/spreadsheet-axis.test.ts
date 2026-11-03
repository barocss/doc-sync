import assert from "node:assert/strict";
import test from "node:test";
import {IntervalAxis, axisSource} from "../src/spreadsheet/axis.ts";
import type {AxisAction, AxisId, AxisSpan} from "../src/spreadsheet/axis.ts";
import {compareTicket, keyOf} from "../src/crdt/ticket.ts";

const initial = (offset: number): AxisId => ({source: "initial", offset});
const at = (lamport: number, actor = "a") => ({lamport, actor});
const ids = (axis: IntervalAxis) => Array.from({length: axis.length}, (_, index) => axis.idAt(index));
const selected = (list: AxisId[]): AxisSpan[] => list.map(id => ({source: id.source, start: id.offset, count: 1}));
const same = (a: AxisId, b: AxisId) => a.source === b.source && a.offset === b.offset;

/** Deliberately dense oracle: one object per ID, with no interval arithmetic. */
function oracle(initialCount: number, actions: AxisAction[]): AxisId[] {
    const ordered = [...actions].sort((a, b) => compareTicket(a.at, b.at));
    const active = new Map<string, boolean>();
    for (const action of ordered) if (action.kind === "toggle") active.set(keyOf(action.target), action.active);
    let rows = Array.from({length: initialCount}, (_, offset) => ({id: initial(offset), visible: true, enabled: true}));
    for (const action of ordered) {
        if (action.kind === "toggle") continue;
        const enabled = active.get(keyOf(action.at)) ?? true;
        if (action.kind === "insert") {
            const index = action.before === null ? rows.length : rows.findIndex(row => same(row.id, action.before!));
            if (index < 0) continue;
            rows.splice(index, 0, ...Array.from({length: action.count}, (_, offset) => ({id: {source: axisSource(action.at), offset}, visible: true, enabled})));
        } else if (enabled) {
            const match = (id: AxisId) => action.targets.some(span => id.source === span.source && id.offset >= span.start && id.offset < span.start + span.count);
            if (action.kind === "visibility") {
                rows = rows.map(row => match(row.id) ? {...row, visible: action.visible} : row);
            } else {
                const moved = rows.filter(row => match(row.id)), remaining = rows.filter(row => !match(row.id));
                const index = action.before === null ? remaining.length : remaining.findIndex(row => same(row.id, action.before!));
                if (index >= 0) { remaining.splice(index, 0, ...moved); rows = remaining; }
            }
        }
    }
    return rows.filter(row => row.visible && row.enabled).map(row => row.id);
}
function random(seed: number) {
    let state = seed;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function shuffle<T>(values: T[], next: () => number): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
        const other = Math.floor(next() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

test("interval axis keeps a billion initial IDs implicit and splits only touched intervals", () => {
    const axis = new IntervalAxis(1_000_000_000);
    assert.deepEqual(axis.stats(), {runs: 1, actions: 0, total: 1_000_000_000, visible: 1_000_000_000});
    assert.deepEqual(axis.idAt(999_999_999), initial(999_999_999));
    assert.deepEqual(axis.spans(400_000_000, 500_000_000), [{source: "initial", start: 400_000_000, count: 500_000_000}]);
    const deletion: AxisAction = {kind: "visibility", at: at(1), targets: axis.spans(400_000_000, 500_000_000), visible: false};
    axis.apply([deletion]);
    assert.equal(axis.length, 500_000_000);
    assert.equal(axis.stats().runs, 3);
    assert.equal(axis.indexOf(initial(500_000_000)), -1);
    assert.equal(axis.has(initial(500_000_000)), true);
    assert.deepEqual(axis.idAt(400_000_000), initial(900_000_000));
    axis.apply([{kind: "toggle", at: at(2), target: deletion.at, active: false}]);
    assert.equal(axis.length, 1_000_000_000);
    assert.equal(axis.stats().runs, 1);
});

test("concurrent boundary inserts, deletes and opposite moves converge for arbitrary deliveries", () => {
    const insertA: AxisAction = {kind: "insert", at: at(1, "a"), before: initial(2), count: 2};
    const insertB: AxisAction = {kind: "insert", at: at(1, "b"), before: initial(2), count: 1};
    const actions: AxisAction[] = [insertA, insertB,
        {kind: "visibility", at: at(2, "c"), targets: [{source: "initial", start: 1, count: 2}], visible: false},
        {kind: "move", at: at(2, "a"), targets: [{source: "initial", start: 0, count: 1}], before: initial(3)},
        {kind: "move", at: at(2, "b"), targets: [{source: "initial", start: 3, count: 1}], before: initial(0)},
        {kind: "move", at: at(3, "c"), targets: [{source: axisSource(insertA.at), start: 0, count: 2}], before: null},
        {kind: "toggle", at: at(4, "a"), target: insertA.at, active: false},
        {kind: "toggle", at: at(5, "a"), target: insertA.at, active: true},
    ];
    const expected = oracle(5, actions), next = random(811);
    for (let pass = 0; pass < 100; pass++) {
        const axis = new IntervalAxis(5);
        for (const action of shuffle(actions, next)) axis.apply([action]);
        assert.deepEqual(ids(axis), expected);
        axis.apply(shuffle(actions, next));
        assert.deepEqual(ids(axis), expected);
        expected.forEach((id, index) => assert.equal(axis.indexOf(id), index));
    }
    assert.deepEqual(expected.filter(id => id.source !== "initial"), [
        {source: axisSource(insertB.at), offset: 0},
        {source: axisSource(insertA.at), offset: 0}, {source: axisSource(insertA.at), offset: 1},
    ]);
});

test("axis undo retains birth anchors and peer move/delete effects through repeated redo", () => {
    const birth: AxisAction = {kind: "insert", at: at(1, "a"), before: initial(1), count: 2};
    const peerMove: AxisAction = {kind: "move", at: at(2, "b"), targets: [{source: axisSource(birth.at), start: 0, count: 2}], before: null};
    const peerDelete: AxisAction = {kind: "visibility", at: at(3, "b"), targets: [{source: axisSource(birth.at), start: 1, count: 1}], visible: false};
    const axis = new IntervalAxis(3);
    axis.apply([birth, peerMove, peerDelete]);
    assert.deepEqual(ids(axis), [initial(0), initial(1), initial(2), {source: axisSource(birth.at), offset: 0}]);
    axis.apply([{kind: "toggle", at: at(4, "a"), target: birth.at, active: false}]);
    assert.equal(axis.has({source: axisSource(birth.at), offset: 0}), true);
    assert.equal(axis.indexOf({source: axisSource(birth.at), offset: 0}), -1);
    axis.apply([{kind: "visibility", at: at(5, "b"), targets: [{source: axisSource(birth.at), start: 0, count: 1}], visible: true}]);
    assert.deepEqual(ids(axis), [initial(0), initial(1), initial(2)]);
    axis.apply([{kind: "toggle", at: at(6, "a"), target: birth.at, active: true}]);
    assert.deepEqual(ids(axis), [initial(0), initial(1), initial(2), {source: axisSource(birth.at), offset: 0}]);
    axis.apply([{kind: "toggle", at: at(7, "b"), target: peerMove.at, active: false}]);
    assert.deepEqual(ids(axis), [initial(0), {source: axisSource(birth.at), offset: 0}, initial(1), initial(2)]);
    axis.apply([{kind: "toggle", at: at(8, "b"), target: peerMove.at, active: true}]);
    assert.deepEqual(ids(axis), [initial(0), initial(1), initial(2), {source: axisSource(birth.at), offset: 0}]);
});

test("late causal sources and anchors activate without allocating missing identities", () => {
    const a: AxisAction = {kind: "insert", at: at(1, "a"), before: initial(0), count: 2};
    const b: AxisAction = {kind: "insert", at: at(2, "b"), before: {source: axisSource(a.at), offset: 1}, count: 1};
    const move: AxisAction = {kind: "move", at: at(3, "c"), targets: [{source: axisSource(b.at), start: 0, count: 1}], before: null};
    const axis = new IntervalAxis(1);
    axis.apply([move, b]);
    assert.deepEqual(ids(axis), [initial(0)]);
    assert.equal(axis.has({source: axisSource(b.at), offset: 0}), true);
    assert.equal(axis.indexOf({source: axisSource(b.at), offset: 0}), -1);
    axis.apply([a]);
    assert.deepEqual(ids(axis), oracle(1, [a, b, move]));
});

test("interval operations match a dense oracle under seeded mixed histories and deliveries", () => {
    const next = random(0x251c), actions: AxisAction[] = [];
    for (let lamport = 1; lamport <= 70; lamport++) {
        const visible = oracle(6, actions), choice = Math.floor(next() * 4);
        const actor = next() < 0.5 ? "a" : "b";
        if (choice === 0 || !visible.length) {
            const index = Math.floor(next() * (visible.length + 1));
            actions.push({kind: "insert", at: at(lamport, actor), before: visible[index] ?? null, count: 1 + Math.floor(next() * 3)});
        } else if (choice === 3 && actions.some(action => action.kind !== "toggle")) {
            const targets = actions.filter(action => action.kind !== "toggle"), target = targets[Math.floor(next() * targets.length)];
            actions.push({kind: "toggle", at: at(lamport, target.at.actor), target: target.at, active: next() < 0.5});
        } else {
            const index = Math.floor(next() * visible.length), count = 1 + Math.floor(next() * Math.min(3, visible.length - index));
            const targets = selected(visible.slice(index, index + count));
            if (choice === 1) actions.push({kind: "visibility", at: at(lamport, actor), targets, visible: false});
            else {
                const remaining = [...visible.slice(0, index), ...visible.slice(index + count)];
                actions.push({kind: "move", at: at(lamport, actor), targets, before: remaining[Math.floor(next() * (remaining.length + 1))] ?? null});
            }
        }
    }
    const expected = oracle(6, actions);
    for (let pass = 0; pass < 20; pass++) {
        const axis = new IntervalAxis(6), delivered: AxisAction[] = [];
        for (const action of shuffle(actions, next)) {
            delivered.push(action); axis.apply([action]);
            assert.deepEqual(ids(axis), oracle(6, delivered));
        }
        assert.deepEqual(ids(axis), expected);
        assert.deepEqual(axis.spans(0, axis.length).flatMap(span => Array.from({length: span.count}, (_, offset) => ({source: span.source, offset: span.start + offset}))), expected);
        const restored = new IntervalAxis(6); restored.apply(axis.actions());
        assert.deepEqual(restored.stats(), axis.stats());
        assert.deepEqual(ids(restored), expected);
    }
});

test("axis validation is atomic for collisions, unsafe bounds, sources and history ownership", () => {
    const axis = new IntervalAxis(4), birth: AxisAction = {kind: "insert", at: at(1), before: initial(2), count: 2};
    axis.apply([birth]);
    const before = axis.actions(), state = ids(axis);
    const invalid: unknown[] = [
        {...birth, count: 3},
        {kind: "insert", at: at(2), before: {source: "2@b", offset: 0}, count: 1},
        {kind: "insert", at: at(2), before: initial(4), count: 1},
        {kind: "move", at: at(2), targets: [{source: "initial", start: 0, count: 2}, {source: "initial", start: 1, count: 2}], before: null},
        {kind: "move", at: at(2), targets: [{source: "initial", start: 0, count: 2}], before: initial(1)},
        {kind: "visibility", at: at(2), targets: [{source: axisSource(birth.at), start: 1, count: 2}], visible: false},
        {kind: "visibility", at: at(2), targets: [{source: "initial", start: Number.MAX_SAFE_INTEGER, count: 1}], visible: false},
        {kind: "toggle", at: at(2, "b"), target: birth.at, active: false},
        {kind: "insert", at: at(2), before: null, count: Number.MAX_SAFE_INTEGER},
    ];
    for (const action of invalid) {
        assert.throws(() => axis.apply([{kind: "insert", at: at(10, "z"), before: null, count: 1}, action as AxisAction]));
        assert.deepEqual(axis.actions(), before); assert.deepEqual(ids(axis), state);
    }
    let getterRead = false;
    const getter = {kind: "insert" as const, at: at(2), before: null, get count() { getterRead = true; return 1; }};
    assert.throws(() => axis.apply([getter])); assert.equal(getterRead, false);
    axis.apply([{before: initial(2), count: 2, kind: "insert", at: {actor: "a", lamport: 1}}]);
    assert.deepEqual(axis.actions(), before);
    assert.throws(() => axis.idAt(axis.length));
    assert.throws(() => axis.spans(0, axis.length + 1));
    assert.equal(axis.indexOf(initial(99)), -1);
    const empty = new IntervalAxis(0);
    assert.deepEqual(empty.spans(0, 0), []); assert.equal(empty.length, 0);
});
