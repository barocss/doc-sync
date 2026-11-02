import assert from "node:assert/strict";
import {test} from "node:test";
import {LocalClient} from "../src/local/client.ts";
import {applyEdits} from "../src/crdt/model.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import {PRODUCT_SCHEMAS} from "../../../fixtures/product-schemas.ts";
import {PRODUCT_MODELS} from "../../../fixtures/product-documents.ts";

type Profile = keyof typeof PRODUCT_SCHEMAS;
const atNode = (root: NodeJSON, path: number[]): NodeJSON => path.reduce((node, index) => node.children![index], root);
const paths = (node: NodeJSON, type: string, path: number[] = []): number[][] => [
    ...(node.type === type ? [path] : []), ...(node.children ?? []).flatMap((child, index) => paths(child, type, [...path, index])),
];
const plain = (node: NodeJSON): string => (node.runs ?? []).map(run => "text" in run ? run.text : plain({type: "", runs: run.runs})).join("") + (node.children ?? []).map(plain).join("");
function setup(name: Profile) {
    const schema = PRODUCT_SCHEMAS[name], client = new LocalClient({schema, actor: `local-${name}`});
    let mirror = structuredClone(client.model()), eventCount = 0, updates = 0;
    client.subscribe({modelEvents(edits, info) {
        assert.equal(info.fallback, false);
        mirror = applyEdits(schema, mirror, [...edits]); eventCount++;
    }, update() {
        updates++; assert.deepEqual(mirror, client.model());
    }});
    client.edit([{op: "delete", at: [0], count: client.model().children!.length}, {op: "insert", at: [0], content: PRODUCT_MODELS[name].children!}], null);
    assert.deepEqual(client.model(), PRODUCT_MODELS[name]);
    assert.equal(client.historyStatus().canUndo, false);
    const check = () => {
        assert.deepEqual(mirror, client.model());
        assert.deepEqual(client.notificationErrors, []);
        return structuredClone(client.model());
    };
    const roundtrip = (edits: EditOp[], verify: (model: NodeJSON) => void) => {
        const before = check(); client.edit(edits); const after = check(); verify(after);
        assert.notDeepEqual(after, before);
        client.undo(); assert.deepEqual(check(), before);
        client.redo(); assert.deepEqual(check(), after);
        client.undo(); assert.deepEqual(check(), before); client.clearHistory();
    };
    return {client, schema, check, roundtrip, counts: () => ({eventCount, updates})};
}

for (const name of Object.keys(PRODUCT_SCHEMAS) as Profile[]) {
    test(`LocalClient ${name} rich model preserves events, text, formatting, structure and field history`, () => {
        const {client, check, roundtrip, counts} = setup(name);
        const original = check(), originalText = plain(original.children![0]);
        roundtrip([{op: "insert", at: [0, 0], content: "Z"}, {op: "update", at: [0, 0], length: 1, attrs: {bold: true, color: "#ff0000"}}], model => {
            assert.equal(plain(model.children![0]), `Z${originalText}`);
            const run = model.children![0].runs![0]; assert.ok("text" in run); assert.equal(run.text, "Z");
            assert.equal(run.marks.bold, true); assert.equal(run.marks.color, "#ff0000");
        });
        roundtrip([{op: "split", at: [0, 3]}], model => {
            assert.equal(model.children!.length, original.children!.length + 1);
            assert.equal(plain(model.children![0]), originalText.slice(0, 3));
            assert.equal(plain(model.children![1]), originalText.slice(3));
        });
        client.edit([{op: "split", at: [0, 3]}], null);
        roundtrip([{op: "merge", at: [1]}], model => assert.equal(plain(model.children![0]), originalText));
        client.edit([{op: "merge", at: [1]}], null); assert.deepEqual(check(), original);
        const movedType = name === "word" ? "section" : name === "notion" ? "toggle" : "slide";
        const from = paths(original, movedType).filter(path => path.length === 1).at(-1)!;
        const moved = structuredClone(atNode(original, from));
        roundtrip([{op: "move", from, at: [1]}], model => assert.deepEqual(model.children![1], moved));
        const fieldType = name === "word" ? "section" : name === "notion" ? "database" : "shape";
        const target = paths(original, fieldType)[0];
        const attrs = name === "word" ? {page: {margin: {top: 40}}} : name === "notion" ? {view: {kind: "board"}} : {frame: {x: 100}};
        roundtrip([{op: "update", at: target, attrs}], model => {
            const actual = atNode(model, target).attrs!;
            if (name === "word") assert.deepEqual((actual.page as {margin: unknown}).margin, {top: 40, right: 72, bottom: 72, left: 72});
            else if (name === "notion") assert.deepEqual(actual.view, {kind: "board", groupBy: ""});
            else assert.deepEqual(actual.frame, {x: 100, y: 0, width: 320, height: 180, rotation: 0, z: 0});
        });
        assert.deepEqual(check(), PRODUCT_MODELS[name]);
        assert.ok(counts().eventCount >= 20); assert.ok(counts().updates >= counts().eventCount);
        client.dispose();
    });

    test(`LocalClient ${name} merged table keeps hidden content and fields through selective undo and redo`, () => {
        const {client, schema, check} = setup(name), before = check();
        const table = paths(before, "table")[0], hidden = [...table, 1, 1], head = [...table, 0, 0];
        assert.equal(plain(atNode(before, hidden)), "Review");
        client.edit([{op: "update", at: head, attrs: {rowspan: 2, colspan: 2}}]);
        const edits: EditOp[] = [{op: "insert", at: [...hidden, 0, 0, 0], content: "X"}, {op: "update", at: hidden, attrs: {properties: {complete: true}}}];
        client.edit(edits, null);
        const merged = check(), retained = atNode(merged, hidden);
        assert.equal(atNode(merged, head).attrs!.rowspan, 2); assert.equal(atNode(merged, head).attrs!.colspan, 2);
        assert.equal(retained.attrs!.spanned, true); assert.equal(plain(retained), "XReview");
        assert.deepEqual(retained.attrs!.properties, {label: "", complete: true});
        const expectedUnmerged = applyEdits(schema, before, edits);
        client.undo(); const unmerged = check(); assert.deepEqual(unmerged, expectedUnmerged);
        assert.equal(atNode(unmerged, hidden).attrs!.spanned, undefined); // canonical models omit the false default
        assert.equal(plain(atNode(unmerged, hidden)), "XReview");
        assert.deepEqual(atNode(unmerged, hidden).attrs!.properties, {label: "", complete: true});
        assert.equal(client.historyStatus().canUndo, false);
        client.redo(); assert.deepEqual(check(), merged);
        client.dispose();
    });
}
