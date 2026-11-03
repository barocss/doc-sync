import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, attrValueOk, checkSchema} from "../../../packages/doc-sync/src/index.ts";
import {CANVAS_LIMITS, CANVAS_SAMPLE, CANVAS_SCHEMA, makeCanvasScene} from "../../../fixtures/graphic-canvas-schema.ts";
import type {CanvasTransform} from "../../../fixtures/graphic-canvas-schema.ts";
import {
    IDENTITY_TRANSFORM, composeTransforms, containsPoint, isCanvasTransform, localToWorld,
    reparentTransform, worldBounds, worldToLocal, worldTransform,
} from "../graphic/geometry.ts";
import type {Point, SceneTransformNode} from "../graphic/geometry.ts";

// Independent 3x3 affine oracle: it does not call any production geometry helper.
type Matrix = [number, number, number, number, number, number, number, number, number];
const matrix = (t: CanvasTransform): Matrix => {
    const angle = t.rotation * Math.PI / 180, c = Math.cos(angle) * t.scale, s = Math.sin(angle) * t.scale;
    return [c, -s, t.x, s, c, t.y, 0, 0, 1];
};
const multiply = (a: Matrix, b: Matrix): Matrix => Array.from({length: 9}, (_, index) => {
    const row = Math.floor(index / 3), col = index % 3;
    return [0, 1, 2].reduce((sum, k) => sum + a[row * 3 + k] * b[k * 3 + col], 0);
}) as Matrix;
const apply = (m: Matrix, p: Point): Point => ({x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5]});
const closeNumber = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}; absolute tolerance ${tolerance}`);
const closePoint = (actual: Point | null, expected: Point, tolerance = 1e-9) => {
    assert.ok(actual); closeNumber(actual.x, expected.x, tolerance); closeNumber(actual.y, expected.y, tolerance);
};
const parent: CanvasTransform = {x: 123, y: -52, rotation: 37, scale: 2.4};
const child: CanvasTransform = {x: -17, y: 28, rotation: -81, scale: 0.35};
const leaf: CanvasTransform = {x: 13, y: 9, rotation: 19, scale: 1.7};
const probes = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 95.5, y: -42.25}];

test("canvas schema uses stored containers, accepts its sample, and retains empty boxes", () => {
    assert.deepEqual(checkSchema(CANVAS_SCHEMA), []);
    assert.equal(CANVAS_SCHEMA.domain, "graphic");
    assert.equal(CANVAS_SCHEMA.nodes.canvas.attrs, undefined);
    assert.equal(CANVAS_SCHEMA.nodes["object-group"].shape, "container");
    const doc = new Doc("sample", CANVAS_SCHEMA);
    doc.edit([{op: "insert", at: [0], content: CANVAS_SAMPLE.children!}]);
    const model = doc.toJSON();
    assert.deepEqual(model.children![1].children, []);
    assert.deepEqual(model.children![2].children, []);
    const text = model.children![0].children![2].children![1].runs![0];
    assert.ok("text" in text); assert.equal(text.text, "Move us together");
    assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), CANVAS_SCHEMA).toJSON(), model);
});

test("canvas schema bounds reject invalid geometry and appearance atomically", () => {
    const doc = new Doc("invalid", CANVAS_SCHEMA);
    doc.edit([{op: "insert", at: [0], content: [{type: "rectangle"}]}]);
    const before = doc.snapshot();
    const invalid = [
        {transform: {x: Infinity}}, {transform: {y: NaN}}, {transform: {rotation: CANVAS_LIMITS.rotation + 1}},
        {transform: {scale: 0}}, {transform: {scale: -1}}, {transform: {scale: 0.0001}},
        {transform: {scaleX: 2}}, {transform: {skew: 1}}, {size: {width: 0}}, {size: {height: Infinity}},
        {opacity: -0.1}, {opacity: 1.1}, {fill: "red"}, {stroke: "#123"}, {locked: "true"},
        {name: "a".repeat(121)}, {name: "bad\nname"},
    ];
    for (const attrs of invalid) {
        assert.throws(() => doc.edit([{op: "update", at: [0], attrs: {name: "must not stick"}}, {op: "update", at: [0], attrs}]));
        assert.deepEqual(doc.snapshot(), before);
    }
    const attrs = CANVAS_SCHEMA.nodes.rectangle.attrs!;
    assert.equal(attrValueOk(attrs.transform, {x: -CANVAS_LIMITS.position, scale: CANVAS_LIMITS.minScale}), true);
    assert.equal(attrValueOk(attrs.size, {width: CANVAS_LIMITS.maxSize}), true);
});

test("independent transform field edits merge without losing rotation or scale", () => {
    const a = new Doc("a", CANVAS_SCHEMA);
    a.edit([{op: "insert", at: [0], content: [{type: "rectangle", attrs: {transform: {x: 10, y: 20, rotation: 25, scale: 2}}}]}]);
    const b = Doc.fromSnapshot("b", a.snapshot(), CANVAS_SCHEMA);
    const aOps = a.edit([{op: "update", at: [0], attrs: {transform: {x: 31}}}]).ops;
    const bOps = b.edit([{op: "update", at: [0], attrs: {transform: {y: 42}}}]).ops;
    bOps.forEach(op => a.apply(op)); aOps.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.deepEqual(a.toJSON().children![0].attrs!.transform, {x: 31, y: 42, rotation: 25, scale: 2});
});

test("benchmark scenes have exact deterministic object counts and fresh mutable data", () => {
    for (const count of [0, 100, 1_000, 5_000]) {
        const scene = makeCanvasScene(count);
        assert.equal(scene.children!.length, count);
        assert.deepEqual(scene, makeCanvasScene(count));
        for (const node of scene.children!) {
            assert.equal(attrValueOk(CANVAS_SCHEMA.nodes[node.type].attrs!.transform, node.attrs!.transform), true);
        }
    }
    const first = makeCanvasScene(1); first.children![0].attrs!.name = "changed";
    assert.equal(makeCanvasScene(1).children![0].attrs!.name, "Object 1");
    for (const count of [-1, 0.1, Infinity, 5_001]) assert.throws(() => makeCanvasScene(count), RangeError);
});

test("nested rotated and scaled transforms match independent matrix products", () => {
    const two = composeTransforms(parent, child); assert.ok(two);
    const three = composeTransforms(two, leaf); assert.ok(three);
    const expected = multiply(multiply(matrix(parent), matrix(child)), matrix(leaf));
    for (const point of probes) {
        closePoint(localToWorld(point, three), apply(expected, point));
        const world = apply(expected, point);
        closePoint(worldToLocal(world, three), point);
    }
    const nodes = new Map<string, SceneTransformNode>([
        ["p", {id: "p", parentId: null, transform: parent}],
        ["c", {id: "c", parentId: "p", transform: child}],
        ["l", {id: "l", parentId: "c", transform: leaf}],
    ]);
    assert.deepEqual(worldTransform(nodes, "l"), three);
    assert.deepEqual(worldTransform(nodes, null), IDENTITY_TRANSFORM);
    assert.equal(worldTransform(nodes, "missing"), null);
    nodes.set("p", {id: "p", parentId: "l", transform: parent});
    assert.equal(worldTransform(nodes, "l"), null);
});

test("coordinate inverses match an independent determinant inverse and known quarter turn", () => {
    closePoint(localToWorld({x: 3, y: 4}, {x: 10, y: 20, rotation: 90, scale: 2}), {x: 2, y: 26});
    for (const transform of [parent, child, leaf, {x: -500_000, y: 800_000, rotation: -179, scale: 0.001}]) {
        const m = matrix(transform), determinant = m[0] * m[4] - m[1] * m[3];
        for (const point of probes) {
            const x = point.x - m[2], y = point.y - m[5];
            const expected = {x: (m[4] * x - m[1] * y) / determinant, y: (-m[3] * x + m[0] * y) / determinant};
            closePoint(worldToLocal(point, transform), expected, 2e-7);
        }
    }
});

test("reparenting preserves all world points under rotated scaled parents", () => {
    const oldWorld = composeTransforms(parent, child); assert.ok(oldWorld);
    const destination = {x: -110, y: 245, rotation: -125, scale: 0.75};
    const nextLocal = reparentTransform(oldWorld, destination); assert.ok(nextLocal);
    const oldMatrix = multiply(matrix(parent), matrix(child));
    const newMatrix = multiply(matrix(destination), matrix(nextLocal));
    for (const point of probes) closePoint(apply(newMatrix, point), apply(oldMatrix, point));
    const toRoot = reparentTransform(oldWorld, IDENTITY_TRANSFORM); assert.ok(toRoot);
    for (const point of probes) closePoint(apply(matrix(toRoot), point), apply(oldMatrix, point));
});

test("invalid, singular, overflow and out-of-bounds transforms do not mutate inputs", () => {
    const original = structuredClone(parent);
    for (const bad of [{...child, scale: 0}, {...child, scale: -1}, {...child, x: Infinity}, {...child, rotation: NaN}]) {
        assert.equal(localToWorld({x: 1, y: 2}, bad), null);
        assert.equal(worldToLocal({x: 1, y: 2}, bad), null);
        assert.equal(composeTransforms(parent, bad), null);
        assert.equal(reparentTransform(parent, bad), null);
    }
    assert.equal(worldToLocal({x: 1, y: 0}, {...IDENTITY_TRANSFORM, scale: Number.MIN_VALUE}), null);
    assert.equal(composeTransforms({...parent, scale: Number.MAX_VALUE}, {...child, scale: 2}), null);
    assert.equal(reparentTransform({...parent, x: CANVAS_LIMITS.position + 1}, IDENTITY_TRANSFORM), null);
    assert.equal(reparentTransform({...parent, scale: 1_001}, IDENTITY_TRANSFORM), null);
    assert.equal(reparentTransform({...parent, scale: 0.0001}, IDENTITY_TRANSFORM), null);
    assert.deepEqual(parent, original);
    // Valid local scales can produce a world scale below the local minimum.
    const tinyWorld = composeTransforms({...parent, scale: 0.001}, {...child, scale: 0.001});
    assert.ok(tinyWorld); assert.equal(isCanvasTransform(tinyWorld), false);
    closePoint(worldToLocal(localToWorld({x: 2, y: 3}, tinyWorld)!, tinyWorld), {x: 2, y: 3}, 1e-8);
});

test("world bounds and hit test follow the transformed explicit object box", () => {
    const transform = {x: 10, y: 20, rotation: 90, scale: 2};
    const bounds = worldBounds(transform, {width: 30, height: 10}); assert.ok(bounds);
    closePoint(bounds, {x: -10, y: 20}); closeNumber(bounds.width, 20); closeNumber(bounds.height, 60);
    assert.equal(containsPoint({x: 0, y: 40}, transform, {width: 30, height: 10}), true);
    assert.equal(containsPoint({x: -11, y: 40}, transform, {width: 30, height: 10}), false);
    assert.equal(worldBounds(transform, {width: 0, height: 10}), null);
});
