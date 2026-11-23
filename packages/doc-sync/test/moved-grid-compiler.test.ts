import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, keyOf, type GridBlock, type NodeJSON, type Op, type Schema} from "../src/index.ts";
import {blockPath, gridPath} from "../src/crdt/edit.ts";
import {canonical} from "../src/crdt/model.ts";
import {WORD_SCHEMA, PRESENTATION_SCHEMA} from "../../../fixtures/product-schemas.ts";

const p = (text: string): NodeJSON => ({type: "paragraph", runs: text ? [{text, marks: {}}] : []});
const cell = (text: string): NodeJSON => ({type: "cell", children: [{type: "cell-body", children: [p(text)]}]});
const row = (text: string): NodeJSON => ({type: "row", children: [cell(text), cell(text)]});
const table = (): NodeJSON => ({type: "table", children: [row("R0"), row("R1")]});
const options = {caretBefore: "", caretAfter: ""};
function currentGrid(doc: Doc, key: string): {grid: GridBlock; line: string; path: number[]} {
    const item = doc.get(key)!;
    const accepted = doc.placementOf(item.id);
    const line = accepted ? keyOf(accepted.parent) : doc.logicalLineOf(item);
    const blocks = doc.blocks(line), index = blocks.findIndex(block => block.marker.key === key && block.kind === "grid");
    assert.ok(index >= 0);
    return {grid: blocks[index] as GridBlock, line, path: blockPath(doc, line, index)!};
}
function setup(schema: Schema, owner: string) {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [1], content: [{type: owner}]}, {op: "insert", at: [2], content: [{type: owner}]}]);
    doc.edit([{op: "insert", at: [1, 1], content: [table()]}]);
    const [source, destination] = doc.blocks().filter(block => block.kind === "flow");
    assert.equal(source.kind, "flow"); assert.equal(destination.kind, "flow");
    if (source.kind !== "flow" || destination.kind !== "flow") throw new Error("flow expected");
    const grid = doc.blocks(source.body).find(block => block.kind === "grid") as GridBlock;
    const move: Op = {t: "move", at: {lamport: doc.clock.next().lamport, actor: "B"}, target: grid.marker.id,
        parent: doc.get(destination.body)!.id, after: doc.blocks(destination.body)[0].marker.id};
    assert.equal(doc.check([move]), null); doc.apply(move);
    return {doc, key: grid.marker.key, birthLine: grid.marker.line.key, destination: destination.body, move};
}
function nodeAt(model: NodeJSON, path: number[]): NodeJSON {
    return path.reduce((node, index) => node.children![index], model);
}
for (const [schema, owner] of [[WORD_SCHEMA, "section"], [PRESENTATION_SCHEMA, "slide"]] as const) {
    test(`${owner}: moved-grid row and shared-column batch preserves peer placement through history`, () => {
        const {doc, key, birthLine, destination, move} = setup(schema, owner);
        const before = doc.toJSON(), located = currentGrid(doc, key), grid = located.grid;
        assert.notEqual(located.line, birthLine); assert.equal(located.line, destination);
        const result = doc.edit([
            {op: "insert", at: [...located.path, 1], content: [row("NEW")]},
            {op: "insert", at: [...located.path, 0, 1], content: [cell("C0")]},
            {op: "insert", at: [...located.path, 1, 1], content: [cell("C1")]},
        ]);
        assert.equal(result.ops.filter(op => op.t === "node" && op.type === "row").length, 1);
        assert.equal(result.ops.filter(op => op.t === "node" && op.type === "col").length, 1);
        const expected = structuredClone(before), rows = nodeAt(expected, located.path).children!;
        rows.splice(1, 0, row("NEW")); rows.forEach((row, index) => row.children!.splice(1, 0, cell(index === 0 ? "C0" : index === 1 ? "C1" : "")));
        assert.deepEqual(doc.toJSON(), canonical(schema, expected));
        assert.deepEqual(gridPath(doc, grid), currentGrid(doc, key).path);
        const history = new History(); history.record(result.ops, doc, options);
        const foreign: Op = {t: "text", id: {lamport: doc.clock.next().lamport, actor: "B"}, origin: doc.get(doc.cellKey(grid.marker, grid.rows[1], grid.cols[0]))!.id, text: "FOREIGN"};
        assert.equal(doc.check([foreign]), null); doc.apply(foreign);
        const withForeign = doc.toJSON(), expectedUndo = structuredClone(before);
        nodeAt(expectedUndo, located.path).children![1].children![0].children![0].children = [p("FOREIGNR1")];
        history.undo(doc); assert.deepEqual(doc.toJSON(), canonical(schema, expectedUndo)); assert.equal(history.canUndo, false);
        assert.deepEqual(doc.placementOf(grid.marker.id)?.at, move.t === "move" ? move.at : null);
        history.redo(doc); assert.deepEqual(doc.toJSON(), withForeign);
        assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), schema).toJSON(), withForeign);
    });
    test(`${owner}: moved-grid column deletion memo and span edits use current axes`, () => {
        const {doc, key} = setup(schema, owner);
        let located = currentGrid(doc, key);
        doc.edit([{op: "update", at: [...located.path, 0, 0], attrs: {rowspan: 2, colspan: 2}}]);
        assert.deepEqual(currentGrid(doc, key).grid.spans.get("0,0"), [2, 2]);
        doc.edit([{op: "update", at: [...located.path, 0, 0], attrs: {rowspan: 1, colspan: 1}}]);
        const before = doc.toJSON(), columns = located.grid.cols.map(col => col.key);
        const deletion = doc.edit([{op: "delete", at: [...located.path, 0, 1], count: 1}, {op: "delete", at: [...located.path, 1, 1], count: 1}]);
        assert.equal(deletion.ops.filter(op => op.t === "del").length, 1);
        assert.deepEqual(currentGrid(doc, key).grid.cols.map(col => col.key), [columns[0]]);
        const expected = structuredClone(before); nodeAt(expected, located.path).children!.forEach(row => row.children!.splice(1, 1));
        assert.deepEqual(doc.toJSON(), canonical(schema, expected));
        located = currentGrid(doc, key);
        doc.edit([{op: "delete", at: [...located.path, 0, 0], count: 2}]);
        assert.equal(doc.blocks(located.line).some(block => block.marker.key === key), false);
    });
    test(`${owner}: gridPath follows accepted placement after move undo and redo`, () => {
        const {doc, key} = setup(schema, owner), old = currentGrid(doc, key).grid;
        const current = currentGrid(doc, key);
        const source = doc.blocks()[1]; if (source.kind !== "flow") throw new Error("flow expected");
        const at = doc.clock.next();
        const move: Op = {t: "move", at, target: old.marker.id, parent: doc.get(source.body)!.id, after: doc.blocks(source.body)[0].marker.id};
        doc.emit([move]); const history = new History(); history.record([move], doc, options);
        assert.deepEqual(gridPath(doc, old), currentGrid(doc, key).path);
        history.undo(doc); assert.deepEqual(gridPath(doc, old), current.path);
        history.redo(doc); assert.deepEqual(gridPath(doc, old), currentGrid(doc, key).path);
    });
}

const recursive: Schema = {root: "doc", marks: [], nodes: {
    doc: {shape: "flow", children: ["paragraph", "box", "table"], default: "paragraph"},
    paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph", "table"], default: "paragraph"},
    table: {shape: "grid", children: ["row"]}, row: {shape: "row", children: ["cell"]},
    cell: {shape: "cell", children: ["cell-body"]}, "cell-body": {shape: "flow", children: ["paragraph", "table"], default: "paragraph"},
}};
test("a newer retained cyclic grid move does not override its accepted compiler parent", () => {
    const doc = new Doc("A", recursive);
    doc.edit([{op: "insert", at: [1], content: [table(), {type: "box"}]}]);
    const grid = doc.blocks().find(block => block.kind === "grid") as GridBlock;
    const box = doc.blocks().find(block => block.kind === "flow"); if (box?.kind !== "flow") throw new Error("box expected");
    const accepted: Op = {t: "move", at: doc.clock.next(), target: grid.marker.id, parent: doc.get(box.body)!.id, after: doc.blocks(box.body)[0].marker.id};
    assert.equal(doc.check([accepted]), null); doc.apply(accepted);
    const cyclic: Op = {t: "move", at: doc.clock.next(), target: grid.marker.id, parent: doc.get(doc.cellKey(grid.marker, grid.rows[0], grid.cols[0]))!.id, after: null};
    assert.equal(doc.check([cyclic]), null); doc.apply(cyclic);
    assert.equal(doc.snapshot().moves!.length, 2);
    assert.deepEqual(doc.placementOf(grid.marker.id)?.at, accepted.at);
    const located = currentGrid(doc, grid.marker.key);
    assert.equal(located.line, box.body); assert.deepEqual(gridPath(doc, grid), located.path);
    const before = doc.toJSON(), expected = structuredClone(before);
    nodeAt(expected, located.path).children!.splice(1, 0, row("accepted parent"));
    doc.edit([{op: "insert", at: [...located.path, 1], content: [row("accepted parent")]}]);
    assert.deepEqual(doc.toJSON(), canonical(recursive, expected));
    assert.deepEqual(doc.placementOf(grid.marker.id)?.at, accepted.at);
});
test("ordinary nonprojected grid insertion keeps its existing row and column contract", () => {
    const doc = new Doc("A", recursive);
    doc.edit([{op: "insert", at: [1], content: [table()]}]);
    assert.equal(doc.usesProjection, false);
    const grid = doc.blocks().find(block => block.kind === "grid") as GridBlock;
    doc.edit([{op: "insert", at: [1, 1], content: [row("new")]}, {op: "insert", at: [1, 0, 1], content: [cell("column")]}]);
    const current = currentGrid(doc, grid.marker.key);
    assert.equal(current.grid.rows.length, 3); assert.equal(current.grid.cols.length, 3);
    assert.deepEqual(gridPath(doc, grid), [1]); assert.equal(doc.usesProjection, false);
});
