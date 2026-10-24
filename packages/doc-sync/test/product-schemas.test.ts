import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, checkSchema, canonical, applyEdits, keyOf, type NodeJSON} from "../src/index.ts";
import {buildPmSchema, toPmJSON, fromPmJSON} from "../src/pm/index.ts";
import {toSlate, fromSlate} from "../src/slate/index.ts";
import {buildLexicalSchema, toLexicalJSON, fromLexicalJSON} from "../src/lexical/index.ts";
import {PRODUCT_SCHEMAS} from "../../../fixtures/product-schemas.ts";
import {PRODUCT_MODELS} from "../../../fixtures/product-documents.ts";
import {MemoryNet} from "./harness.ts";
import type {EditOp} from "../src/crdt/model.ts";

import {parseTextStorage, textTicket} from "../src/crdt/text-storage.ts";
import {parseRequired} from "../src/crdt/cardinality.ts";

type Profile = keyof typeof PRODUCT_SCHEMAS;
const nodeAt = (root: NodeJSON, path: number[]) => path.reduce((node, index) => node.children![index], root);
const paths = (node: NodeJSON, predicate: (node: NodeJSON) => boolean, at: number[] = []): number[][] => [
    ...(predicate(node) ? [at] : []), ...(node.children ?? []).flatMap((child, index) => paths(child, predicate, [...at, index])),
];
const first = (root: NodeJSON, type: string) => paths(root, node => node.type === type)[0];
const plain = (node: NodeJSON): string => (node.runs ?? []).map(run => "text" in run ? run.text : plain({type: "", runs: run.runs})).join("") + (node.children ?? []).map(plain).join("");
const load = (name: Profile) => {
    const schema = PRODUCT_SCHEMAS[name], doc = new Doc("seed", schema), model = PRODUCT_MODELS[name];
    doc.edit([{op: "delete", at: [0], count: doc.toJSON().children!.length}, {op: "insert", at: [0], content: model.children!}]);
    return doc;
};
const start = async (name: Profile) => {
    const schema = PRODUCT_SCHEMAS[name], net = new MemoryNet({schema, clientSchema: schema});
    const clients = ["alice", "bob", "carol"].map(actor => net.add(actor));
    clients.forEach(client => client.connect()); await net.settle();
    const doc = clients[0].doc;
    clients[0].commit(doc.edit([{op: "delete", at: [0], count: doc.toJSON().children!.length}, {op: "insert", at: [0], content: PRODUCT_MODELS[name].children!}]).ops);
    await net.settle(); clients.forEach(client => client.clearHistory());
    const mirrors = clients.map(client => client.doc.toJSON());
    clients.forEach((client, i) => { client.onModelEvents = edits => { mirrors[i] = applyEdits(schema, mirrors[i], edits); }; });
    const commit = (i: number, edits: EditOp[]) => { clients[i].commit(clients[i].doc.edit(edits).ops); mirrors[i] = clients[i].doc.toJSON(); };
    const history = (i: number, action: "undo" | "redo") => { clients[i][action](); mirrors[i] = clients[i].doc.toJSON(); };
    const check = () => {
        const expected = net.hub.doc.toJSON();
        clients.forEach((client, i) => {
            assert.deepEqual(client.doc.toJSON(), expected); assert.deepEqual(mirrors[i], expected);
            assert.equal(client.pending.length, 0); assert.equal(client.eventStats.fallbacks, 0);
            assert.deepEqual(Doc.fromSnapshot("fresh", client.doc.snapshot(), schema).toJSON(), expected);
        });
        return expected;
    };
    return {schema, net, clients, commit, history, check, close: () => clients.forEach(client => client.disconnect())};
};

for (const name of Object.keys(PRODUCT_SCHEMAS) as Profile[]) {
    test(`${name} profile validates, loads its complete model, and restores snapshots`, () => {
        const schema = PRODUCT_SCHEMAS[name], before = JSON.stringify(schema), doc = load(name);
        assert.deepEqual(checkSchema(schema), []);
        assert.deepEqual(doc.toJSON(), PRODUCT_MODELS[name]);
        assert.deepEqual(canonical(schema, doc.toJSON()), doc.toJSON());
        assert.deepEqual(Doc.fromSnapshot("fresh", doc.snapshot(), schema).toJSON(), PRODUCT_MODELS[name]);
        assert.equal(JSON.stringify(schema), before);
    });
    for (const editor of ["Slate", "Lexical", "ProseMirror"] as const) test(`${name} profile preserves all sample data through ${editor} headless conversion`, () => {
        const schema = PRODUCT_SCHEMAS[name], model = PRODUCT_MODELS[name];
        let result: NodeJSON;
        if (editor === "Slate") result = fromSlate(schema, toSlate(schema, model));
        else if (editor === "Lexical") {
            const info = buildLexicalSchema(schema, {table: "table"}); result = fromLexicalJSON(info, toLexicalJSON(info, model));
        } else {
            const info = buildPmSchema(schema); result = canonical(schema, fromPmJSON(info, schema, info.pm.nodeFromJSON(toPmJSON(schema, model)).toJSON(), model));
        }
        assert.deepEqual(result, model);
    });
    for (const reverse of [false, true]) test(`${name} profile concurrent text/delete/format converges in receipt order ${reverse}`, async () => {
        const s = await start(name);
        try {
            const edits: EditOp[][] = [[{op: "delete", at: [0, 1], count: 1}], [{op: "update", at: [0, 1], length: 1, attrs: {bold: true}}], [{op: "insert", at: [0, 2], content: "!"}]];
            for (const i of reverse ? [2, 1, 0] : [0, 1, 2]) s.commit(i, edits[i]);
            await s.net.settle(); s.check();
            s.history(0, "undo"); await s.net.settle();
            const restored = s.check().children![0];
            assert.ok(plain(restored).includes("!")); assert.ok(restored.runs!.some(run => "text" in run && run.marks.bold));
            s.history(1, "undo"); await s.net.settle();
            assert.ok(s.check().children![0].runs!.every(run => !("text" in run) || !run.marks.bold));
            s.history(0, "redo"); await s.net.settle(); s.check();
        } finally { s.close(); }
    });
    test(`${name} profile nested field edits and selective history preserve foreign fields`, async () => {
        const s = await start(name);
        try {
            const model = s.check(), type = name === "word" ? "section" : name === "notion" ? "database" : "shape", at = first(model, type);
            const attrs = name === "word" ? [{page: {margin: {top: 40}}}, {page: {margin: {right: 48}}}]
                : name === "notion" ? [{view: {kind: "board"}}, {view: {groupBy: "status"}}]
                : [{frame: {x: 100}}, {frame: {y: 200}}];
            s.commit(0, [{op: "update", at, attrs: attrs[0]}]); s.commit(1, [{op: "update", at, attrs: attrs[1]}]);
            await s.net.settle(); const updated = nodeAt(s.check(), at).attrs!;
            if (name === "word") assert.deepEqual((updated.page as {margin: unknown}).margin, {top: 40, right: 48, bottom: 72, left: 72});
            if (name === "notion") assert.deepEqual(updated.view, {kind: "board", groupBy: "status"});
            if (name === "presentation") assert.deepEqual(updated.frame, {x: 100, y: 200, width: 320, height: 180, rotation: 0, z: 0});
            s.history(0, "undo"); await s.net.settle(); const undone = nodeAt(s.check(), at).attrs!;
            if (name === "word") assert.deepEqual((undone.page as {margin: unknown}).margin, {top: 72, right: 48, bottom: 72, left: 72});
            if (name === "notion") assert.deepEqual(undone.view, {kind: "table", groupBy: "status"});
            if (name === "presentation") assert.equal((undone.frame as {y: number}).y, 200);
            s.history(0, "redo"); await s.net.settle(); assert.deepEqual(nodeAt(s.check(), at).attrs, updated);
        } finally { s.close(); }
    });
    test(`${name} profile merged grids retain hidden foreign content, fields, and rich codecs`, async () => {
        const s = await start(name);
        try {
            const at = first(s.check(), "table"), hidden = [...at, 1, 1];
            s.commit(0, [{op: "update", at: [...at, 0, 0], attrs: {rowspan: 2, colspan: 2}}]);
            s.commit(1, [{op: "insert", at: [...hidden, 0, 0, 0], content: "X"}, {op: "update", at: hidden, attrs: {properties: {complete: true}}}]);
            await s.net.settle(); const merged = s.check(), retained = nodeAt(merged, hidden);
            assert.ok(retained.attrs!.spanned); assert.equal(plain(retained), "XReview"); assert.deepEqual(retained.attrs!.properties, {label: "", complete: true});
            const pm = buildPmSchema(s.schema); assert.deepEqual(canonical(s.schema, fromPmJSON(pm, s.schema, pm.pm.nodeFromJSON(toPmJSON(s.schema, merged)).toJSON(), merged)), merged);
            const lexical = buildLexicalSchema(s.schema, {table: "table"}); assert.deepEqual(fromLexicalJSON(lexical, toLexicalJSON(lexical, merged)), merged);
            assert.deepEqual(fromSlate(s.schema, toSlate(s.schema, merged)), merged);
            s.history(0, "undo"); await s.net.settle(); assert.equal(plain(nodeAt(s.check(), hidden)), "XReview");
            s.history(0, "redo"); await s.net.settle(); assert.ok(nodeAt(s.check(), hidden).attrs!.spanned);
        } finally { s.close(); }
    });
    test(`${name} profile moving a structured block preserves concurrent descendant text through history`, async () => {
        const s = await start(name);
        try {
            const model = s.check(), type = name === "word" ? "section" : name === "notion" ? "toggle" : "slide";
            const candidates = paths(model, node => node.type === type).filter(path => path.length === 1), from = candidates.at(-1)!;
            const textPath = paths(nodeAt(model, from), node => !!node.runs && plain(node).length > 0, from)[0];
            const original = plain(nodeAt(model, from));
            s.commit(0, [{op: "move", from, at: [1]}]); s.commit(1, [{op: "insert", at: [...textPath, 0], content: "!"}]);
            await s.net.settle(); assert.equal(plain(s.check().children![1]), "!" + original);
            s.history(0, "undo"); await s.net.settle(); assert.ok(plain(s.check()).includes("!" + original));
            s.history(0, "redo"); await s.net.settle(); assert.equal(plain(s.check().children![1]), "!" + original);
        } finally { s.close(); }
    });
    test(`${name} profile required children remain editable after deletion and snapshot restore`, () => {
        const doc = load(name), schema = PRODUCT_SCHEMAS[name], type = name === "word" ? "header" : name === "notion" ? "column" : "notes";
        const at = first(doc.toJSON(), type), parent = at.slice(0, -1), history = new History();
        const ops = doc.edit([{op: "delete", at, count: 1}]).ops; history.record(ops, doc, {caretBefore: "", caretAfter: ""});
        const minimum = name === "notion" ? 2 : 1;
        assert.ok(nodeAt(doc.toJSON(), parent).children!.filter(node => node.type === type).length >= minimum);
        const children = nodeAt(doc.toJSON(), parent).children!;
        const requiredIndex = children.findIndex(node => node.type === type);
        doc.edit([{op: "insert", at: [...parent, requiredIndex, 0, 0], content: "Required child input"}]);
        assert.ok(plain(nodeAt(doc.toJSON(), [...parent, requiredIndex])).includes("Required child input"));
        assert.deepEqual(Doc.fromSnapshot("fresh", doc.snapshot(), schema).toJSON(), doc.toJSON());
        history.undo(doc); history.redo(doc);
        assert.ok(nodeAt(doc.toJSON(), parent).children!.filter(node => node.type === type).length >= minimum);
    });
    test(`${name} profile snapshots reject malformed required identities and foreign trailing anchors`, () => {
        const doc = load(name), schema = PRODUCT_SCHEMAS[name];
        doc.edit([{op: "move", from: [doc.toJSON().children!.length - 1], at: [1]}]);
        doc.toJSON();
        const snapshot = doc.snapshot();
        const trailing = snapshot.lines.find(line => {
            const address = parseTextStorage(line.key);
            return address?.after && parseRequired(address.after);
        });
        assert.ok(trailing, "fixture must contain trailing storage after a required flow child");
        const address = parseTextStorage(trailing.key)!;
        const rootBlocks = doc.blocks();
        const paragraph = rootBlocks[0]; assert.equal(paragraph.kind, "text");
        if (paragraph.kind !== "text") return;
        const foreign = rootBlocks.find(block => block.kind === "flow")!.marker.key;
        for (const after of [paragraph.chars[0].key, foreign]) {
            const malformed = structuredClone(snapshot), line = malformed.lines.find(line => line.key === trailing.key)!;
            line.key = keyOf(textTicket({...address, after})); line.items[0].i = line.key;
            assert.throws(() => Doc.fromSnapshot("fresh", malformed, schema), /Invalid trailing storage anchor/);
        }
        const malformed = structuredClone(snapshot), required = malformed.lines.find(line => parseRequired(line.key))!;
        required.key = "0@~required:malformed"; required.items[0].i = required.key;
        assert.throws(() => Doc.fromSnapshot("fresh", malformed, schema), /Invalid reserved storage identity/);
    });
}
