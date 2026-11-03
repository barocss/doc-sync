import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {History} from "../src/crdt/history.ts";
import type {GraphicSchema} from "../src/crdt/schema.ts";
import {createGraphicHelpers} from "../src/graphic/index.ts";

const scene = {domain: "graphic", root: "stage", marks: ["accent"], markValues: {tone: {default: ""}}, nodes: {
    stage: {shape: "container", children: ["layer", "dot", "caption"]},
    layer: {shape: "container", children: ["dot", "caption"], attrs: {title: {default: ""}}},
    dot: {shape: "atom", attrs: {radius: {default: 1, min: 0}, location: {default: {x: 0, y: 0}, fields: {x: {default: 0}, y: {default: 0}}}}},
    caption: {shape: "text", attrs: {font: {default: "mono"}}},
}} as const satisfies GraphicSchema;
const board = {domain: "graphic", root: "board", marks: [], nodes: {
    board: {shape: "container", children: ["cluster", "tile"]},
    cluster: {shape: "container", children: ["tile"]},
    tile: {shape: "atom", attrs: {label: {default: ""}, rank: {default: 0}, position: {default: {x: 0, y: 0}, fields: {x: {default: 0}, y: {default: 0}}}}},
}} as const satisfies GraphicSchema;

for (const [schema, kind, parent, aKey, aValue, peerKey, peerValue] of [
    [scene, "dot", "layer", "radius", 9, "location", {y: 8}],
    [board, "tile", "cluster", "label", "peer-safe", "position", {y: 8}],
] as const) test(`custom ${schema.root}: concurrent attributes, own undo, stable move/delete/restore/snapshot`, () => {
    // The factory also accepts schemas loaded at runtime. Literal callers get stricter patch types below.
    const h = createGraphicHelpers(schema as GraphicSchema), source = new Doc("seed", schema);
    source.edit([h.insert(source, null, 0, h.createNode(parent, {}, {children: [h.createNode(kind)]})), h.insert(source, null, 0, h.createNode(kind))]);
    const id = h.objectAt(source, [1, 0]).id;
    const a = Doc.fromSnapshot("a", source.snapshot(), schema), b = Doc.fromSnapshot("b", source.snapshot(), schema), history = new History();
    const aOps = a.edit([h.update(a, id, kind, {[aKey]: aValue})]).ops;
    history.record(aOps, a, {caretBefore: "", caretAfter: ""});
    const bOps = b.edit([h.update(b, id, kind, {[peerKey]: peerValue})]).ops;
    assert.equal(a.check(bOps), null); bOps.forEach(op => a.apply(op));
    assert.equal(b.check(aOps), null); aOps.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    history.undo(a).ops.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.deepEqual(h.findObject(a, id)!.node.attrs![peerKey], {x: 0, y: 8});
    assert.notEqual(h.findObject(a, id)!.node.attrs![aKey], aValue);
    a.edit([h.move(a, id, null, 0)]);
    assert.deepEqual(h.findObject(a, id)!.path, [0]);
    const deletion = a.edit([h.delete(a, id)]).ops;
    const deletionHistory = new History(); deletionHistory.record(deletion, a, {caretBefore: "", caretAfter: ""});
    assert.equal(h.findObject(a, id), null);
    assert.throws(() => h.update(a, id, kind, {}), /not visible/);
    assert.throws(() => h.delete(a, id), /not visible/);
    deletionHistory.undo(a);
    assert.equal(h.objectAt(a, [0]).id, id);
    const restored = Doc.fromSnapshot("restored", a.snapshot(), schema);
    assert.equal(h.findObject(restored, id)!.id, id);
    assert.deepEqual(restored.toJSON(), a.toJSON());
});

test("custom graphics validate real attrs, shape, children, content and canonical identity before editing", () => {
    const h = createGraphicHelpers(scene), doc = new Doc("a", scene);
    const node = h.createNode("dot", {radius: 3, location: {x: 2}});
    doc.edit([h.insert(doc, null, 0, node)]);
    const before = doc.snapshot();
    for (const invalid of [
        {type: "dot", attrs: {missing: 1}}, {type: "dot", attrs: {radius: -1}}, {type: "dot", children: []},
        {type: "layer", children: [{type: "layer"}]}, {type: "caption", runs: [{text: "x", marks: {unknown: true}}]},
        {type: "dot", attrs: null}, {type: "stage"}, {type: "dot", attrs: {location: {z: 1}}},
    ]) assert.throws(() => h.insert(doc, null, 0, invalid as never), /Graphic/);
    const other = new Doc("other", board);
    assert.throws(() => h.insert(other, null, 0, node), /identity/);
    assert.deepEqual(doc.snapshot(), before);
    assert.deepEqual(other.toJSON().children, []);
    const reverse = (v: unknown): unknown => Array.isArray(v) ? v.map(reverse) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, value]) => [k, reverse(value)])) : v;
    assert.equal(h.objectAt(Doc.fromSnapshot("r", before, reverse(scene) as GraphicSchema), [0]).node.type, "dot");
    assert.throws(() => createGraphicHelpers({...board, nodes: {...board.nodes, flow: {shape: "flow", children: ["text"], default: "text"}, text: {shape: "text"}}}), /unsupported descriptor/);
    assert.throws(() => createGraphicHelpers({...board, domain: "document"} as never), /root|graphic/);
    assert.throws(() => createGraphicHelpers({...board, nodes: {...board.nodes, tile: {shape: "unknown"}}} as never), /unsupported|Invalid schema/);
    assert.throws(() => h.createNode("caption", {}, {text: "valid", children: []}), /text content/);
    const caption = {type: "caption", runs: [{text: "custom", marks: {accent: true, tone: "warm"}}]};
    h.assertNode(caption);
    for (const invalid of [null, [], 1, true, "text"]) {
        assert.throws(() => h.createNode("caption", {}, invalid as never), /Graphic: invalid content options/);
    }
    assert.throws(() => createGraphicHelpers({...board, nodes: {...board.nodes, tile: {shape: "atom", attrs: {rank: {default: 0, min: "bad"}}}}} as never), /malformed attribute/);
    assert.throws(() => createGraphicHelpers({...scene, nodes: {...scene.nodes, caption: {shape: "text", text: "yes"}}} as never), /malformed text/);
});

// Compile-time contracts: schemas with literal names retain their node/attribute types.
function typeContracts() {
    const h = createGraphicHelpers(scene);
    h.createNode("dot", {radius: 2, location: {x: 1}});
    // @ts-expect-error unknown custom attribute
    h.createNode("dot", {color: "red"});
    // @ts-expect-error wrong custom attribute type
    h.createNode("dot", {radius: "large"});
    // @ts-expect-error wrong custom kind
    h.createNode("rectangle");
}
void typeContracts;

test("detached graphic helpers keep their cloned schema and reject another factory's document", () => {
    const input = structuredClone(scene) as GraphicSchema;
    const {assertNode, createNode, insert, objectAt, findObject, update, delete: remove} = createGraphicHelpers(input);
    const other = createGraphicHelpers(board);
    const doc = new Doc("scene", scene), otherDoc = new Doc("board", board);
    // Caller mutation must not alter the factory's validation schema or identity.
    delete input.nodes.dot;
    const node = createNode("dot", {radius: 7});
    assertNode(node); doc.edit([insert(doc, null, 0, node)]);
    const object = objectAt(doc, [0]);
    assert.equal(findObject(doc, object.id)?.node.attrs?.radius, 7);
    doc.edit([update(doc, object.id, "dot", {radius: 9})]);
    assert.equal(objectAt(doc, [0]).node.attrs?.radius, 9);
    otherDoc.edit([other.insert(otherDoc, null, 0, other.createNode("tile"))]);
    const before = otherDoc.snapshot();
    assert.throws(() => findObject(otherDoc, object.id), /identity/);
    assert.throws(() => objectAt(otherDoc, [0]), /identity/);
    assert.throws(() => remove(otherDoc, object.id), /identity/);
    assert.throws(() => other.assertNode(node), /unknown object type/);
    assert.deepEqual(otherDoc.snapshot(), before);
    doc.edit([remove(doc, object.id)]);
    assert.deepEqual(doc.toJSON().children, []);
});
