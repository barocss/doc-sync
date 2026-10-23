import assert from "node:assert/strict";
import {test} from "node:test";
import {InputSession, commitModelEdits, modelEdits, sameModel, subscribeClient} from "../src/editor/index.ts";
import {applyEdits, canonical} from "../src/crdt/model.ts";
import {MemoryNet} from "./harness.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";

const p = (text: string): NodeJSON => ({type: "paragraph", runs: text ? [{text, marks: {}}] : []});
const start = async (children: NodeJSON[] = [p("ab")]) => {
    const net = new MemoryNet();
    const a = net.add("alice"), b = net.add("bob");
    a.connect(); b.connect();
    await net.settle();
    a.commit(a.doc.edit([
        {op: "delete", at: [0], count: 1},
        {op: "insert", at: [0], content: children},
    ]).ops);
    await net.settle();
    a.clearHistory(); b.clearHistory();
    const same = (expected: NodeJSON) => {
        assert.deepEqual(a.doc.toJSON(), expected);
        assert.deepEqual(b.doc.toJSON(), expected);
        assert.deepEqual(net.hub.doc.toJSON(), expected);
        assert.equal(a.pending.length, 0); assert.equal(b.pending.length, 0);
    };
    const close = () => { a.disconnect(); b.disconnect(); };
    return {net, a, b, same, close};
};

const table = (): NodeJSON => ({type: "table", children: [{type: "table-row", children: ["left", "right"].map(text => ({
    type: "table-cell", children: [{type: "table-cell-body", children: [p(text)]}],
}))}]});

test("editor session maps codepoint edits to UTF16 through spans and inline positions", async () => {
    const c = await start([{type: "paragraph", runs: [
        {text: "A😀", marks: {}},
        {type: "inline-image", attrs: {src: "image.png"}},
        {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "BC", marks: {}}]},
        {text: "D", marks: {}},
    ]}]);
    try {
        const before = c.a.doc.toJSON();
        const edits: EditOp[] = [
            {op: "insert", at: [0, 2], content: "X"},
            {op: "update", at: [0, 4], length: 2, attrs: {italic: true}},
            {op: "delete", at: [0, 1], count: 1},
        ];
        const ops = commitModelEdits(c.a.doc, before, edits);
        assert.equal(ops.filter(op => op.t === "del")[0].ids.length, 2, "both UTF16 emoji tokens are deleted");
        c.a.commit(ops);
        await c.net.settle();
        const expected: NodeJSON = {type: "content", children: [{type: "paragraph", runs: [
            {text: "AX", marks: {}},
            {type: "inline-image", attrs: {src: "image.png", width: 160, height: 90}},
            {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "BC", marks: {italic: true}}]},
            {text: "D", marks: {}},
        ]}]};
        assert.deepEqual(applyEdits(c.net.schema, before, edits), expected);
        c.same(expected);
    } finally { c.close(); }
});

for (const nested of ["callout", "cell"] as const) test(`editor session preserves semantic split/merge in nested ${nested} text`, async () => {
    const initial: NodeJSON = nested === "callout"
        ? {type: "callout", children: [p("A😀BC")]}
        : {type: "table", children: [{type: "table-row", children: [{type: "table-cell", children: [{type: "table-cell-body", children: [p("A😀BC")]}]}]}]};
    const c = await start([p("root"), initial]);
    try {
        const before = c.a.doc.toJSON();
        const blockPath = nested === "callout" ? [1, 0] : [1, 0, 0, 0, 0];
        const split: EditOp = {op: "split", at: [...blockPath, 2]};
        const after = applyEdits(c.net.schema, before, [split]);
        assert.deepEqual(modelEdits(c.net.schema, before, after), [split]);
        const ops = commitModelEdits(c.a.doc, before, modelEdits(c.net.schema, before, after));
        assert.equal(ops.some(op => op.t === "del"), false, "split must retain existing trailing token identities");
        assert.equal(ops.filter(op => op.t === "node").length, 1);
        c.a.commit(ops); await c.net.settle();
        const splitNode = nested === "callout" ? c.a.doc.toJSON().children![1]
            : c.a.doc.toJSON().children![1].children![0].children![0].children![0];
        assert.deepEqual(splitNode.children!.map(node => node.runs), [[{text: "A😀", marks: {}}], [{text: "BC", marks: {}}]]);
        const merge: EditOp = {op: "merge", at: [...blockPath.slice(0, -1), 1]};
        assert.deepEqual(modelEdits(c.net.schema, after, before), [merge]);
        c.a.commit(commitModelEdits(c.a.doc, after, [merge])); await c.net.settle();
        c.same(before);
    } finally { c.close(); }
});

test("editor session composition keeps remote input and records one undo/redo unit", async () => {
    const c = await start();
    const session = new InputSession(c.a);
    try {
        session.begin(); session.begin();
        const first = session.capture({anchor: [0, 2], focus: [0, 2]})!;
        let ops = commitModelEdits(session.doc, session.doc.toJSON(), [{op: "insert", at: [0, 2], content: "한"}]);
        const middle = session.capture({anchor: [0, 3], focus: [0, 3]})!;
        session.commit(ops, {caretBefore: first.focus, caretAfter: middle.focus, typing: true});
        ops = commitModelEdits(session.doc, session.doc.toJSON(), [{op: "insert", at: [0, 3], content: "글"}]);
        const last = session.capture({anchor: [0, 4], focus: [0, 4]})!;
        session.commit(ops, {caretBefore: middle.focus, caretAfter: last.focus, typing: true});
        assert.deepEqual(c.a.doc.toJSON().children![0].runs, [{text: "ab", marks: {}}]);
        assert.equal(c.a.pending.length, 0);
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops);
        await c.net.settle();
        assert.deepEqual(session.doc.toJSON().children![0].runs, [{text: "ab한글", marks: {}}]);
        assert.deepEqual(c.a.doc.toJSON().children![0].runs, [{text: "Rab", marks: {}}]);
        const committed = session.end();
        assert.equal(committed.filter(op => op.t === "text").length, 2);
        assert.equal(session.active, false);
        assert.deepEqual(session.end(), []);
        await c.net.settle();
        const expected = canonical(c.net.schema, {type: "content", children: [p("Rab한글")]});
        c.same(expected);
        c.a.undo(); await c.net.settle();
        c.same(canonical(c.net.schema, {type: "content", children: [p("Rab")]}));
        c.a.redo(); await c.net.settle(); c.same(expected);
    } finally { session.cancel(); c.close(); }
});

test("editor session reserves draft actor tickets and cancellation never reuses them", async () => {
    const c = await start();
    const session = new InputSession(c.a);
    try {
        session.begin();
        const draft = session.doc;
        const ops = draft.edit([{op: "insert", at: [0, 2], content: "😀"}]).ops;
        session.commit(ops);
        const reserved = draft.clock.lamport;
        assert.ok(c.a.doc.clock.lamport >= reserved);
        const live = c.a.doc.edit([{op: "update", at: [0, 0], length: 1, attrs: {bold: true}}]).ops;
        assert.ok(live.every(op => op.t === "set" && op.at.lamport > reserved));
        c.a.commit(live); await c.net.settle();
        session.reserveClock();
        assert.ok(draft.clock.lamport >= c.a.doc.clock.lamport);
        session.cancel(); session.cancel();
        assert.equal(session.doc, c.a.doc);
        assert.equal(session.active, false);
        const next = c.a.doc.edit([{op: "insert", at: [0, 2], content: "Z"}]).ops;
        assert.ok(next.every(op => op.t === "text" && op.id.lamport > reserved));
        session.commit(next); await c.net.settle();
        c.same({type: "content", children: [{type: "paragraph", runs: [
            {text: "a", marks: {bold: true}}, {text: "bZ", marks: {}},
        ]}]});
    } finally { session.cancel(); c.close(); }
});

test("editor session captures UTF16 ranges, tracks remote shifts and rejects missing endpoints", async () => {
    const c = await start([p("A😀B")]);
    const session = new InputSession(c.a);
    try {
        const saved = session.capture({anchor: [0, 4], focus: [0, 3]});
        assert.ok(saved);
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await c.net.settle();
        assert.deepEqual(session.resolve(saved), {anchor: [0, 5], focus: [0, 4]});
        for (const path of [[9, 0], [0, 999], [0, -1], [0, 0.5], [0], []]) {
            assert.equal(session.capture({anchor: path, focus: [0, 0]}), null);
        }
        assert.equal(session.capture(null), null);
        assert.equal(session.resolve(null), null);
        assert.equal(session.resolve({anchor: "missing-token", focus: saved.focus}), null);
    } finally { c.close(); }
});

test("editor session rejects hidden merged-cell and deleted-axis endpoints without neighbor fallback", async () => {
    const c = await start([p("root"), table()]);
    const session = new InputSession(c.a);
    try {
        const right = [1, 0, 1, 0, 0, 3];
        const saved = session.capture({anchor: right, focus: right});
        assert.ok(saved);
        c.b.commit(c.b.doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 2}}]).ops); await c.net.settle();
        assert.equal(session.capture({anchor: right, focus: right}), null);
        assert.equal(session.resolve(saved), null);
        c.b.commit(c.b.doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 1, rowspan: 1}}]).ops); await c.net.settle();
        assert.deepEqual(session.resolve(saved), {anchor: right, focus: right});
        c.b.commit(c.b.doc.edit([{op: "delete", at: [1, 0, 1], count: 1}]).ops); await c.net.settle();
        assert.equal(session.resolve(saved), null);
    } finally { c.close(); }
});

test("editor session subscriptions preserve original callback order and dispose out of order", async () => {
    const c = await start();
    const log: string[] = [];
    const original = {
        event: () => { log.push("original:event"); }, model: () => { log.push("original:model"); }, update: () => { log.push("original:update"); },
    };
    c.a.onEvent = original.event; c.a.onModelEvents = original.model; c.a.onUpdate = original.update;
    const first = subscribeClient(c.a, {beforeEvent: () => log.push("first:event"), modelEvents: () => log.push("first:model"), update: () => log.push("first:update")});
    const second = subscribeClient(c.a, {beforeEvent: () => log.push("second:event"), modelEvents: () => log.push("second:model"), update: () => log.push("second:update")});
    try {
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await c.net.settle();
        assert.deepEqual(log, ["original:event", "first:event", "second:event", "original:model", "first:model", "second:model", "original:update", "first:update", "second:update"]);
        first(); log.length = 0;
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "S"}]).ops); await c.net.settle();
        assert.deepEqual(log, ["original:event", "second:event", "original:model", "second:model", "original:update", "second:update"]);
        second();
        assert.equal(c.a.onEvent, original.event);
        assert.equal(c.a.onModelEvents, original.model);
        assert.equal(c.a.onUpdate, original.update);
    } finally { first(); second(); c.close(); }
});

test("editor session repeated stale unsubscribe cannot detach a newer subscription registry", async () => {
    const c = await start();
    const original = {event: () => {}, model: () => {}, update: () => {}};
    c.a.onEvent = original.event; c.a.onModelEvents = original.model; c.a.onUpdate = original.update;
    const old = subscribeClient(c.a, {});
    old();
    const current = subscribeClient(c.a, {});
    old(); // A stale cleanup must not delete the newer registry.
    const newest = subscribeClient(c.a, {});
    try {
        current(); newest();
        assert.equal(c.a.onEvent, original.event);
        assert.equal(c.a.onModelEvents, original.model);
        assert.equal(c.a.onUpdate, original.update);
    } finally { current(); newest(); c.close(); }
});

test("editor session stale cleanup preserves callbacks installed by the application", async () => {
    const c = await start();
    const stop = subscribeClient(c.a, {});
    const replacement = {event: () => {}, model: () => {}, update: () => {}};
    c.a.onEvent = replacement.event; c.a.onModelEvents = replacement.model; c.a.onUpdate = replacement.update;
    try {
        stop(); stop();
        assert.equal(c.a.onEvent, replacement.event);
        assert.equal(c.a.onModelEvents, replacement.model);
        assert.equal(c.a.onUpdate, replacement.update);
    } finally { c.close(); }
});

test("editor session reset cancellation uses beforeEvent/update even when model events are omitted", async () => {
    const c = await start([p("")]);
    const session = new InputSession(c.a);
    let reset = false, updates = 0, models = 0;
    const stop = subscribeClient(c.a, {
        beforeEvent: event => { if (event.type === "reset") { reset = true; session.cancel(); } },
        modelEvents: () => { models += 1; },
        update: () => { if (reset) updates += 1; },
    });
    try {
        session.begin();
        session.commit(session.doc.edit([{op: "insert", at: [0, 0], content: "draft"}]).ops);
        assert.deepEqual(c.a.doc.toJSON().children![0].runs, []);
        c.net.hub.reset(); await c.net.settle();
        assert.equal(models, 0, "equal live models do not produce onModelEvents");
        assert.equal(updates, 1);
        assert.equal(session.active, false);
        assert.equal(session.doc, c.a.doc);
        assert.deepEqual(session.end(), []);
        const expected = canonical(c.net.schema, {type: "content", children: [p("")]});
        c.same(expected);
        assert.equal(sameModel(c.a.doc.toJSON(), expected), true);
    } finally { stop(); session.cancel(); c.close(); }
});
