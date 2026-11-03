import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import type {Op} from "../src/crdt/doc.ts";
import {History} from "../src/crdt/history.ts";
import {checkSchema} from "../src/crdt/schema.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import {createGraphicSchema, BUILTIN_GRAPHIC_SCHEMA, createGraphicNode as node, assertGraphicNode, graphicInsert, graphicMove, graphicUpdate, graphicDelete, graphicObjectAt, findGraphicObject, createGraphicSegment, createGraphicOverride, resolveGraphicReference, isGraphicId} from "../src/graphic/index.ts";

const seed = (children: NodeJSON[]) => {
    const doc = new Doc("seed", createGraphicSchema());
    doc.edit([{op: "insert", at: [0], content: children}]);
    return doc;
};
const pair = (source: Doc) => {
    const a = Doc.fromSnapshot("a", source.snapshot(), createGraphicSchema()), b = Doc.fromSnapshot("b", source.snapshot(), createGraphicSchema());
    const history = new History();
    const receive = (doc: Doc, ops: Op[]) => { assert.equal(doc.check(ops), null); ops.forEach(op => doc.apply(op)); };
    const edit = (doc: Doc, edits: EditOp[]) => {
        const ops = doc.edit(edits).ops;
        if (doc === a) history.record(ops, doc, {caretBefore: "", caretAfter: ""});
        return ops;
    };
    const exchange = (aOps: Op[], bOps: Op[]) => { receive(b, aOps); receive(a, bOps); assert.deepEqual(a.toJSON(), b.toJSON()); };
    const undo = () => { receive(b, history.undo(a).ops); assert.deepEqual(a.toJSON(), b.toJSON()); };
    const redo = () => { receive(b, history.redo(a).ops); assert.deepEqual(a.toJSON(), b.toJSON()); };
    return {a, b, edit, receive, exchange, undo, redo};
};

test("built-in graphic schema needs no consumer-defined attrs and keeps factory schemas independent", () => {
    assert.deepEqual(checkSchema(BUILTIN_GRAPHIC_SCHEMA), []);
    const custom = createGraphicSchema();
    custom.nodes.rectangle.attrs!.name.default = "changed";
    assert.equal(createGraphicSchema().nodes.rectangle.attrs!.name.default, "");
    assert.equal(BUILTIN_GRAPHIC_SCHEMA.nodes.rectangle.attrs!.name.default, "");
    assert.ok(Object.isFrozen(BUILTIN_GRAPHIC_SCHEMA.nodes.path));
    const doc = seed([
        node("frame", {layout: {mode: "horizontal", gap: 16}}, {children: [node("rectangle", {cornerRadius: 8}), node("ellipse"), node("label", {fontSize: 20}, {text: "한글"})]}),
        node("object-group"), node("component"), node("instance"), node("boolean", {operation: "subtract"}),
        node("path", {closed: true}, {children: [node("vertex", {x: 1, y: 2}), node("segment"), node("paint", {kind: "radial-gradient"}, {children: [node("gradient-stop", {offset: 0.5, color: "#12345678"})]}), node("stroke", {width: 2, cap: "round"})]}),
    ]);
    assert.equal(doc.toJSON().children!.length, 6);
    assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), createGraphicSchema()).toJSON(), doc.toJSON());
    const shape = graphicObjectAt(doc, [0, 0]);
    assert.deepEqual(shape.node.attrs!.transform, {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
    assert.ok(isGraphicId(shape.id));
});

for (const reversed of [false, true]) test(`independent vertex and handle edits converge and local undo keeps peer edits, reverse ${reversed}`, () => {
    const source = seed([node("path", {}, {children: [node("vertex", {x: 10, y: 20}), node("vertex", {x: 30, y: 40})]})]);
    const first = graphicObjectAt(source, [0, 0]).id, second = graphicObjectAt(source, [0, 1]).id;
    const s = pair(source);
    const aOps = s.edit(s.a, [graphicUpdate(s.a, first, "vertex", {x: 100, handleOut: {x: 12}})]);
    const bOps = s.edit(s.b, [graphicUpdate(s.b, first, "vertex", {y: 200, handleOut: {y: 24}}), graphicUpdate(s.b, second, "vertex", {x: 300})]);
    if (reversed) { s.receive(s.a, bOps); s.receive(s.b, aOps); } else s.exchange(aOps, bOps);
    assert.deepEqual(s.a.toJSON(), s.b.toJSON());
    assert.deepEqual(findGraphicObject(s.a, first)!.node.attrs, {x: 100, y: 200, handleIn: {x: 0, y: 0}, handleOut: {x: 12, y: 24}});
    s.undo();
    assert.deepEqual(findGraphicObject(s.a, first)!.node.attrs, {x: 10, y: 200, handleIn: {x: 0, y: 0}, handleOut: {x: 0, y: 24}});
    assert.equal(findGraphicObject(s.a, second)!.node.attrs!.x, 300);
    s.redo(); assert.equal(findGraphicObject(s.a, first)!.node.attrs!.x, 100);
    assert.deepEqual(Doc.fromSnapshot("restored", s.a.snapshot(), createGraphicSchema()).toJSON(), s.a.toJSON());
});

test("affine matrix leaves retain independent nonuniform scale, shear and translation through undo", () => {
    const source = seed([node("rectangle")]), id = graphicObjectAt(source, [0]).id, s = pair(source);
    s.exchange(s.edit(s.a, [graphicUpdate(s.a, id, "rectangle", {transform: {a: 2, e: 40}})]), s.edit(s.b, [graphicUpdate(s.b, id, "rectangle", {transform: {d: -3, c: 0.5, f: 60}})]));
    assert.deepEqual(findGraphicObject(s.a, id)!.node.attrs!.transform, {a: 2, b: 0, c: 0.5, d: -3, e: 40, f: 60});
    s.undo(); assert.deepEqual(findGraphicObject(s.a, id)!.node.attrs!.transform, {a: 1, b: 0, c: 0.5, d: -3, e: 0, f: 60});
});

test("gradient stops are separate stable records and paint data supports image references", () => {
    const source = seed([node("rectangle", {}, {children: [node("paint", {kind: "linear-gradient", start: {x: 0, y: 0}, end: {x: 100, y: 0}}, {children: [node("gradient-stop", {offset: 0}), node("gradient-stop", {offset: 1, color: "#ffffff"})]}), node("stroke", {kind: "image", imageRef: "asset:sha256:abc", imageTransform: {a: 2, d: 3}})]})]);
    const stop = graphicObjectAt(source, [0, 0, 0]).id, other = graphicObjectAt(source, [0, 0, 1]).id, s = pair(source);
    s.exchange(s.edit(s.a, [graphicUpdate(s.a, stop, "gradient-stop", {offset: 0.25})]), s.edit(s.b, [graphicUpdate(s.b, stop, "gradient-stop", {color: "#ff0000"}), graphicUpdate(s.b, other, "gradient-stop", {opacity: 0.6})]));
    s.undo();
    assert.deepEqual(findGraphicObject(s.a, stop)!.node.attrs, {offset: 0, color: "#ff0000", opacity: 1});
    assert.equal(findGraphicObject(s.a, other)!.node.attrs!.opacity, 0.6);
});

test("stable component/source/override references survive move, delete and undo with remote target attrs", () => {
    const source = seed([node("component", {}, {children: [node("rectangle", {name: "original"})]}), node("frame"), node("boolean")]);
    const component = graphicObjectAt(source, [0]).id, target = graphicObjectAt(source, [0, 0]).id, frame = graphicObjectAt(source, [1]).id, boolean = graphicObjectAt(source, [2]).id;
    source.edit([graphicInsert(source, boolean, 0, node("source-ref", {targetId: target})), graphicInsert(source, null, 3, node("instance", {componentId: component}, {children: [createGraphicOverride(target, "opacity", 0.5), createGraphicOverride(target, "name", "instance name")]}))]);
    const sourceRef = graphicObjectAt(source, [2, 0]).id, instance = graphicObjectAt(source, [3]).id, override = graphicObjectAt(source, [3, 0]).id;
    const s = pair(source);
    s.exchange(s.edit(s.a, [graphicMove(s.a, component, frame, 0)]), s.edit(s.b, [graphicUpdate(s.b, target, "rectangle", {size: {width: 320}})]));
    assert.equal(resolveGraphicReference(s.a, instance, "componentId")!.id, component);
    assert.equal(resolveGraphicReference(s.a, override, "targetId")!.id, target);
    assert.deepEqual(findGraphicObject(s.a, target)!.path, [0, 0, 0]);
    s.exchange(s.edit(s.a, [graphicDelete(s.a, component)]), s.edit(s.b, [graphicUpdate(s.b, target, "rectangle", {opacity: 0.7})]));
    for (const [record, field] of [[instance, "componentId"], [override, "targetId"], [sourceRef, "targetId"]] as const) assert.equal(resolveGraphicReference(s.a, record, field), null);
    assert.equal(findGraphicObject(s.a, override)!.node.attrs!.targetId, target);
    s.undo();
    assert.equal(resolveGraphicReference(s.a, sourceRef, "targetId")!.id, target);
    assert.equal(findGraphicObject(s.a, target)!.node.attrs!.opacity, 0.7);
    assert.deepEqual(findGraphicObject(s.a, target)!.node.attrs!.size, {width: 320, height: 100});
    s.undo(); assert.deepEqual(findGraphicObject(s.a, target)!.path, [0, 0]);
    assert.equal(findGraphicObject(s.a, target)!.id, target);
    s.redo(); assert.deepEqual(findGraphicObject(s.a, target)!.path, [0, 0, 0]);
});

test("segments address vertices by ID and their references survive vertex deletion and undo", () => {
    const source = seed([node("path", {}, {children: [node("vertex", {x: 1}), node("vertex", {x: 2})]}), node("path", {}, {children: [node("vertex")]})]);
    const path = graphicObjectAt(source, [0]).id, first = graphicObjectAt(source, [0, 0]).id, second = graphicObjectAt(source, [0, 1]).id, foreign = graphicObjectAt(source, [1, 0]).id;
    assert.throws(() => createGraphicSegment(source, path, first, foreign), /in its path/);
    source.edit([graphicInsert(source, path, 2, createGraphicSegment(source, path, first, second, "cubic"))]);
    const segment = graphicObjectAt(source, [0, 2]).id, s = pair(source);
    s.exchange(s.edit(s.a, [graphicDelete(s.a, first)]), s.edit(s.b, [graphicUpdate(s.b, first, "vertex", {handleOut: {x: 12}})]));
    assert.equal(resolveGraphicReference(s.a, segment, "from"), null);
    assert.equal(findGraphicObject(s.a, segment)!.node.attrs!.from, first);
    s.undo();
    assert.equal(resolveGraphicReference(s.a, segment, "from")!.id, first);
    assert.deepEqual(findGraphicObject(s.a, first)!.node.attrs!.handleOut, {x: 12, y: 0});
});

test("strict built-in validators reject invalid attrs, bounds, references and content", () => {
    for (const attrs of [{transform: {a: Infinity}}, {transform: {g: 1}}, {opacity: 2}, {size: {width: -1}}, {unknown: 1}, {name: "bad\nname"}]) assert.throws(() => node("rectangle", attrs as never), /Graphic/);
    assert.throws(() => node("paint", {color: "red"}), /Graphic/);
    assert.throws(() => node("gradient-stop", {offset: 1.01}), /Graphic/);
    assert.throws(() => node("instance", {componentId: "9007199254740992@actor"}), /Graphic/);
    assert.throws(() => node("source-ref", {targetId: "../object/0"}), /Graphic/);
    assert.throws(() => node("instance", {componentId: `1@${"a".repeat(513)}`}), /Graphic/);
    assert.throws(() => node("rectangle", {}, {children: [node("vertex")]}), /Graphic/);
    assert.throws(() => node("vertex", {}, {children: []}), /Graphic/);
    assert.throws(() => assertGraphicNode({type: "rectangle", attrs: null} as never), /attributes/);
    assert.throws(() => assertGraphicNode({type: "label", runs: [null]} as never), /label run/);
    assert.throws(() => assertGraphicNode({type: "rectangle", attrs: Object.defineProperty({}, "opacity", {get: () => 0.5, enumerable: true})}), /safe JSON/);
    assert.throws(() => createGraphicOverride("1@a", "opacity", 2), /override value/);
    assert.throws(() => node("instance-override", {assignment: {property: "opacity", value: 2}}), /override value/);
    // @ts-expect-error Boolean properties require boolean values.
    assert.throws(() => createGraphicOverride("1@a", "visible", "yes"), /override value/);
    assert.throws(() => createGraphicOverride("1@a", "transform.unknown" as never, 2 as never), /override property/);
    const doc = seed([node("frame", {}, {children: [node("rectangle")]})]), frame = graphicObjectAt(doc, [0]).id, shape = graphicObjectAt(doc, [0, 0]).id;
    assert.throws(() => graphicUpdate(doc, shape, "ellipse", {}), /kind does not match/);
    assert.throws(() => graphicMove(doc, frame, frame, 0), /own descendants/);
    assert.throws(() => graphicInsert(doc, null, -1, node("rectangle")), /index/);
    assert.throws(() => graphicObjectAt(doc, [0, -1]), /path/);
    assert.throws(() => graphicObjectAt(doc, [0, 0, 0]), /leaf|not found/);
    assert.throws(() => resolveGraphicReference(doc, shape, "componentId"), /does not belong/);
    assert.throws(() => findGraphicObject(new Doc("other"), shape), /require/);
    assert.equal(doc.check([{t: "set", at: {lamport: 100, actor: "peer"}, ids: [doc.get(shape)!.id], key: "$field:[\"transform\",\"a\"]", value: Infinity}]) !== null, true);
});

test("standard override records can be edited concurrently without replacing a whole instance map", () => {
    const source = seed([node("component", {}, {children: [node("rectangle")]})]), component = graphicObjectAt(source, [0]).id, target = graphicObjectAt(source, [0, 0]).id;
    source.edit([graphicInsert(source, null, 1, node("instance", {componentId: component}, {children: [createGraphicOverride(target, "opacity", 0.5), createGraphicOverride(target, "name", "first")]}))]);
    const numeric = graphicObjectAt(source, [1, 0]).id, text = graphicObjectAt(source, [1, 1]).id, s = pair(source);
    s.exchange(s.edit(s.a, [graphicUpdate(s.a, numeric, "instance-override", {assignment: {property: "opacity", value: 0.3}})]), s.edit(s.b, [graphicUpdate(s.b, text, "instance-override", {assignment: {property: "name", value: "peer"}})]));
    s.undo();
    assert.deepEqual(findGraphicObject(s.a, numeric)!.node.attrs!.assignment, {property: "opacity", value: 0.5});
    assert.deepEqual(findGraphicObject(s.a, text)!.node.attrs!.assignment, {property: "name", value: "peer"});
    assert.equal(resolveGraphicReference(s.a, numeric, "targetId")!.id, target);
});

for (const reversed of [false, true]) test(`override property/value replacements stay valid in both delivery orders, reverse ${reversed}`, () => {
    const source = seed([node("component", {}, {children: [node("rectangle"), node("rectangle")]})]);
    const component = graphicObjectAt(source, [0]).id, target = graphicObjectAt(source, [0, 0]).id, alternate = graphicObjectAt(source, [0, 1]).id;
    source.edit([graphicInsert(source, null, 1, node("instance", {componentId: component}, {children: [createGraphicOverride(target, "transform.e", 0.5)]}))]);
    const override = graphicObjectAt(source, [1, 0]).id, s = pair(source);
    // The old independent property/number registers merged these valid edits
    // into the invalid opacity=500 state. Both edits now replace one register.
    const aOps = s.edit(s.a, [graphicUpdate(s.a, override, "instance-override", {assignment: {property: "transform.e", value: 500}})]);
    const bOps = s.edit(s.b, [graphicUpdate(s.b, override, "instance-override", {assignment: {property: "opacity", value: 0.5}})]);
    assert.equal(aOps.filter(op => op.t === "set" && op.key === "assignment").length, 1);
    assert.equal(bOps.filter(op => op.t === "set" && op.key === "assignment").length, 1);
    assert.ok([...aOps, ...bOps].every(op => op.t !== "set" || !op.key.startsWith("$field:")));
    const observer = Doc.fromSnapshot("observer", source.snapshot(), createGraphicSchema());
    for (const ops of reversed ? [bOps, aOps] : [aOps, bOps]) s.receive(observer, ops);
    s.exchange(aOps, bOps);
    assert.deepEqual(observer.toJSON(), s.a.toJSON());
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs!.assignment, {property: "opacity", value: 0.5});
    assertGraphicNode(findGraphicObject(s.a, override)!.node);
    const refOps = s.edit(s.a, [graphicUpdate(s.a, override, "instance-override", {targetId: alternate})]);
    s.receive(s.b, refOps);
    assert.equal(resolveGraphicReference(s.a, override, "targetId")!.id, alternate);
    s.undo(); assert.equal(resolveGraphicReference(s.a, override, "targetId")!.id, target);
    s.redo(); assert.equal(resolveGraphicReference(s.a, override, "targetId")!.id, alternate);
    s.undo(); s.undo();
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs!.assignment, {property: "opacity", value: 0.5});
    s.redo();
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs!.assignment, {property: "opacity", value: 0.5});
    assertGraphicNode(findGraphicObject(s.a, override)!.node);
    assert.deepEqual(Doc.fromSnapshot("restored", s.a.snapshot(), createGraphicSchema()).toJSON(), s.a.toJSON());
});

test("override assignment updates require complete typed payloads and retain independent reference undo", () => {
    const source = seed([node("component", {}, {children: [node("rectangle"), node("rectangle")]})]);
    const component = graphicObjectAt(source, [0]).id, target = graphicObjectAt(source, [0, 0]).id, alternate = graphicObjectAt(source, [0, 1]).id;
    source.edit([graphicInsert(source, null, 1, node("instance", {componentId: component}, {children: [createGraphicOverride(target, "opacity", 0.5)]}))]);
    const override = graphicObjectAt(source, [1, 0]).id, s = pair(source);
    // @ts-expect-error A partial atomic assignment must not compile or pass runtime validation.
    assert.throws(() => graphicUpdate(s.a, override, "instance-override", {assignment: {value: 0.3}}), /exactly property and value/);
    // @ts-expect-error The property's value type is part of the assignment contract.
    assert.throws(() => graphicUpdate(s.a, override, "instance-override", {assignment: {property: "visible", value: 0.3}}), /override value/);
    assert.throws(() => graphicUpdate(s.a, override, "instance-override", {assignment: {property: "opacity", value: 500}}), /override value/);
    assert.throws(() => graphicUpdate(s.a, override, "instance-override", {assignment: {property: "opacity", value: 0.5, extra: true}} as never), /exactly property and value/);
    assert.throws(() => graphicUpdate(s.a, override, "instance-override", {assignment: {property: "opacity", value: null}} as never), /override value/);
    assert.throws(() => graphicUpdate(s.a, override, "instance-override", {property: "opacity", numberValue: 500} as never), /invalid instance-override.property/);
    s.exchange(s.edit(s.a, [graphicUpdate(s.a, override, "instance-override", {assignment: {property: "transform.e", value: 500}})]), s.edit(s.b, [graphicUpdate(s.b, override, "instance-override", {targetId: alternate})]));
    s.undo();
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs, {targetId: alternate, assignment: {property: "opacity", value: 0.5}});
    s.redo();
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs, {targetId: alternate, assignment: {property: "transform.e", value: 500}});
    const reset = s.edit(s.a, [graphicUpdate(s.a, override, "instance-override", {assignment: null})]);
    s.receive(s.b, reset);
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs!.assignment, {property: "name", value: ""});
    assert.equal(findGraphicObject(s.a, override)!.node.attrs!.targetId, alternate);
    s.undo();
    assert.deepEqual(findGraphicObject(s.a, override)!.node.attrs!.assignment, {property: "transform.e", value: 500});
});
