import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, applyEdits, readDocumentSlice, type EditOp, type NodeJSON} from "../../doc-sync/dist/index.js";
import {MemoryNet} from "./harness.ts";
import {GRAPHIC_SCHEMA as schema, emptyCanvas, graphicShape as shape, graphicLabel as label, graphicFrame as frame, graphicGroup as group} from "../../../fixtures/graphic-schema.ts";

async function start(content: NodeJSON[] = []) {
    const net = new MemoryNet({schema, clientSchema: schema}), clients = [net.add("alice"), net.add("bob"), net.add("carol")];
    clients.forEach(client => client.connect()); await net.settle();
    if (content.length) { clients[0].commit(clients[0].doc.edit([{op: "insert", at: [0], content}]).ops); await net.settle(); }
    clients.forEach(client => client.clearHistory());
    const mirrors = clients.map(client => client.doc.toJSON());
    clients.forEach((client, index) => { client.onModelEvents = edits => { mirrors[index] = applyEdits(schema, mirrors[index], edits); }; });
    const edit = (index: number, edits: EditOp[]) => { const client = clients[index]; client.commit(client.doc.edit(edits).ops); mirrors[index] = client.doc.toJSON(); };
    const history = (index: number, action: "undo" | "redo") => { clients[index][action](); mirrors[index] = clients[index].doc.toJSON(); };
    const check = () => {
        const model = net.hub.doc.toJSON();
        clients.forEach((client, index) => {
            assert.deepEqual(client.doc.toJSON(), model); assert.deepEqual(mirrors[index], model);
            assert.equal(client.pending.length, 0); assert.equal(client.eventStats.fallbacks, 0);
            assert.deepEqual(Doc.fromSnapshot("fresh", client.doc.snapshot(), schema).toJSON(), model);
        }); return model;
    };
    return {net, clients, edit, history, check, close: () => clients.forEach(client => client.disconnect())};
}

for (const reverse of [false, true]) test(`graphic concurrent insert into empty canvas converges, order ${reverse}`, async () => {
    const s = await start();
    try {
        for (const index of reverse ? [2, 1, 0] : [0, 1, 2]) s.edit(index, [{op: "insert", at: [0], content: [shape(String(index))]}]);
        await s.net.settle();
        const model = s.check(); assert.equal(model.children!.length, 3);
        assert.deepEqual(model.children!.map(node => node.attrs!.name).sort(), ["0", "1", "2"]);
        s.history(0, "undo"); await s.net.settle();
        assert.deepEqual(s.check().children!.map(node => node.attrs!.name).sort(), ["1", "2"]);
        s.history(0, "redo"); await s.net.settle(); assert.deepEqual(s.check(), model);
    } finally { s.close(); }
});

for (const reverse of [false, true]) test(`graphic delete, descendant edit and move converge, order ${reverse}`, async () => {
    const s = await start([frame([label("abc"), shape("moving")]), group(), shape("delete")]);
    try {
        const edits: EditOp[][] = [
            [{op: "delete", at: [2], count: 1}],
            [{op: "insert", at: [0, 0, 1], content: "한😀"}],
            [{op: "move", from: [0, 1], at: [1, 0]}],
        ];
        for (const index of reverse ? [2, 1, 0] : [0, 1, 2]) s.edit(index, edits[index]);
        await s.net.settle();
        assert.deepEqual(s.check(), {type: "canvas", children: [frame([label("a한😀bc")]), group([shape("moving")])]});
        s.history(2, "undo"); await s.net.settle();
        assert.deepEqual(s.check(), {type: "canvas", children: [frame([label("a한😀bc"), shape("moving")]), group()]});
        s.history(2, "redo"); await s.net.settle(); s.check();
    } finally { s.close(); }
});

test("graphic selective field undo keeps the peer field on a moved object", async () => {
    const s = await start([shape("one"), frame()]);
    try {
        s.edit(0, [{op: "update", at: [0], attrs: {position: {x: 12}}}]);
        s.edit(1, [{op: "update", at: [0], attrs: {position: {y: 34}}}]);
        s.edit(2, [{op: "move", from: [0], at: [1, 0]}]);
        await s.net.settle();
        assert.deepEqual(s.check().children![0].children![0].attrs!.position, {x: 12, y: 34});
        s.history(0, "undo"); await s.net.settle();
        assert.deepEqual(s.check().children![0].children![0].attrs!.position, {x: 0, y: 34});
        s.history(2, "undo"); await s.net.settle();
        assert.deepEqual(s.check().children![0].attrs!.position, {x: 0, y: 34});
    } finally { s.close(); }
});

test("graphic deletion history preserves concurrent text when a frame is restored", async () => {
    const s = await start([frame([label("abc")])]);
    try {
        s.edit(0, [{op: "delete", at: [0], count: 1}]);
        s.edit(1, [{op: "insert", at: [0, 0, 1], content: "peer"}]);
        await s.net.settle(); assert.deepEqual(s.check(), emptyCanvas());
        s.history(0, "undo"); await s.net.settle();
        assert.deepEqual(s.check(), {type: "canvas", children: [frame([label("apeerbc")])]});
        s.history(0, "redo"); await s.net.settle(); assert.deepEqual(s.check(), emptyCanvas());
    } finally { s.close(); }
});

test("graphic deleted label hides concurrent input until actor undo restores its marker", async () => {
    const s = await start([label("first"), label("second"), shape("last")]);
    try {
        s.edit(0, [{op: "delete", at: [1], count: 1}]);
        s.edit(1, [{op: "insert", at: [1, 2], content: "peer"}]);
        await s.net.settle();
        assert.deepEqual(s.check(), {type: "canvas", children: [label("first"), shape("last")]});
        s.history(0, "undo"); await s.net.settle();
        assert.deepEqual(s.check(), {type: "canvas", children: [label("first"), label("sepeercond"), shape("last")]});
        s.history(0, "redo"); await s.net.settle();
        assert.deepEqual(s.check(), {type: "canvas", children: [label("first"), shape("last")]});
    } finally { s.close(); }
});

for (const reverse of [false, true]) test(`graphic concurrent label split keeps a peer reparent, order ${reverse}`, async () => {
    const s = await start([label("abcd"), frame()]);
    try {
        const original = readDocumentSlice(s.clients[0].doc, {limit: 1}).children[0].blockId;
        const edits: EditOp[][] = [[{op: "split", at: [0, 2]}], [{op: "move", from: [0], at: [1, 0]}]];
        for (const index of reverse ? [1, 0] : [0, 1]) s.edit(index, edits[index]);
        await s.net.settle(); const model = s.check();
        const frameIndex = model.children!.findIndex(node => node.type === "frame");
        const inside = readDocumentSlice(s.clients[0].doc, {path: [frameIndex]}).children;
        assert.ok(inside.some(child => child.blockId === original), "the peer move must retain the original label in its destination frame");
        const texts: string[] = [];
        const visit = (node: NodeJSON) => { if (node.type === "label") texts.push((node.runs ?? []).map(run => "text" in run ? run.text : "").join("")); (node.children ?? []).forEach(visit); };
        visit(model); assert.deepEqual(texts.sort(), ["ab", "cd"]);
        s.history(0, "undo"); await s.net.settle(); const undone = s.check();
        const movedFrame = undone.children!.findIndex(node => node.type === "frame");
        assert.ok(readDocumentSlice(s.clients[0].doc, {path: [movedFrame]}).children.some(child => child.blockId === original));
    } finally { s.close(); }
});

for (const reverse of [false, true]) test(`graphic concurrent container cycle resolves to one acyclic hierarchy, order ${reverse}`, async () => {
    const s = await start([frame(), group()]);
    try {
        const originalIds = readDocumentSlice(s.clients[0].doc, {}).children.map(child => child.blockId).sort();
        const edits: EditOp[][] = [[{op: "move", from: [0], at: [1, 0]}], [{op: "move", from: [1], at: [0, 0]}]];
        for (const index of reverse ? [1, 0] : [0, 1]) s.edit(index, edits[index]);
        await s.net.settle(); s.check();
        for (const client of s.clients) {
            const ids: string[] = [];
            const visit = (path: number[]) => {
                for (const child of readDocumentSlice(client.doc, {path}).children) {
                    assert.ok(child.blockId); assert.ok(!ids.includes(child.blockId), "an object must not occur in its own ancestry or in two parents");
                    ids.push(child.blockId);
                    if (child.node.children) visit(child.path);
                }
            };
            visit([]); assert.deepEqual(ids.sort(), originalIds);
        }
    } finally { s.close(); }
});

test("graphic empty frame survives disconnect, peer insertion, and reconnect", async () => {
    const s = await start([frame()]);
    try {
        s.clients[1].disconnect();
        s.edit(0, [{op: "insert", at: [0, 0], content: [shape("peer")]}]); await s.net.settle();
        s.clients[1].connect(); await s.net.settle();
        // A reconnect snapshot replaces the model without a remote edit callback.
        assert.deepEqual(s.clients[1].doc.toJSON(), s.net.hub.doc.toJSON());
        assert.deepEqual(s.clients[1].doc.toJSON(), {type: "canvas", children: [frame([shape("peer")])]});
        assert.equal(s.clients[1].pending.length, 0);
    } finally { s.close(); }
});
