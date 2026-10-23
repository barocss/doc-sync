import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {applyEdits, diffModels} from "../src/crdt/model.ts";
import {checkSchema} from "../src/crdt/schema.ts";
import {
    FIELD_PREFIX, MAX_FIELD_PATH, decodeFieldKey, diffFields, encodeFieldKey, fieldJsonOk,
    fieldSpecAt, fieldValueOk, fieldsSchemaProblems, flattenFieldPatch, materializeFields, patchFields,
} from "../src/crdt/fields.ts";
import {MemoryNet} from "./harness.ts";
import type {AttrSpec, Schema} from "../src/crdt/schema.ts";
import type {NodeJSON} from "../src/crdt/model.ts";

type Spec = AttrSpec & {fields?: Record<string, Spec>};
const defaults = {width: 10, theme: "light", layout: {x: 1, y: 2}, tags: ["a"], data: {code: "base"}};
const settings: Spec = {
    default: defaults,
    fields: {
        width: {default: 10, min: 0, max: 1000},
        theme: {default: "light", values: ["light", "dark"]},
        layout: {default: {x: 1, y: 2}, fields: {x: {default: 1}, y: {default: 2}}},
        tags: {default: ["a"]}, data: {default: {code: "base"}},
    },
};
const schema: Schema = {
    root: "content", marks: ["bold"], nodes: {
        content: {shape: "flow", children: ["paragraph", "alternate", "table"], default: "paragraph"},
        paragraph: {shape: "text", children: ["badge"], attrs: {
            settings, title: {default: ""}, legacy: {default: {a: 0, b: 0}},
        }},
        alternate: {shape: "text", children: ["badge"], attrs: {
            settings: {default: {...defaults, width: "auto"}, fields: {...settings.fields, width: {default: "auto", values: ["auto", "fixed"]}}} as Spec,
            title: {default: ""}, legacy: {default: {a: 0, b: 0}},
        }},
        badge: {shape: "inline", attrs: {settings}},
        table: {shape: "grid", children: ["row"]},
        row: {shape: "row", children: ["cell"]},
        cell: {shape: "cell", children: ["body"], attrs: {settings}},
        body: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    },
};
const expectedSettings = (patch: Partial<typeof defaults> = {}) => ({...structuredClone(defaults), ...patch});
const start = async () => {
    const net = new MemoryNet({schema, clientSchema: schema});
    const a = net.add("alice"), b = net.add("bob");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "root"}]).ops);
    await net.settle(); a.clearHistory(); b.clearHistory();
    const same = (value: typeof defaults, legacy = {a: 0, b: 0}) => {
        const expected: NodeJSON = {type: "content", children: [{
            type: "paragraph", attrs: {settings: value, title: "", legacy}, runs: [{text: "root", marks: {}}],
        }]};
        for (const doc of [a.doc, b.doc, net.hub.doc]) assert.deepEqual(doc.toJSON(), expected);
        assert.equal(a.pending.length, 0); assert.equal(b.pending.length, 0);
    };
    const close = () => { a.disconnect(); b.disconnect(); };
    return {net, a, b, same, close};
};

test("fields helper validates fixed schemas and preserves existing atomic attributes", () => {
    assert.deepEqual(fieldsSchemaProblems({settings}), []);
    assert.deepEqual(fieldsSchemaProblems({atomic: {default: undefined}}), []);
    assert.ok(fieldsSchemaProblems({settings: {...settings, default: {width: 99}}}).length > 0);
    assert.ok(fieldsSchemaProblems({settings: {...settings, computed: true}}).length > 0);
    assert.ok(fieldsSchemaProblems({settings: {...settings, pattern: "x"}}).length > 0);
    const cyclic: Spec = {default: {}, fields: {}};
    cyclic.fields!.self = cyclic;
    assert.ok(fieldsSchemaProblems({cyclic}).some(problem => /cyclic/.test(problem)));
    assert.throws(() => flattenFieldPatch(cyclic, null), /limit/);
    assert.throws(() => materializeFields(cyclic, () => undefined), /limit/);
    const unsafe = JSON.parse('{"constructor":{"default":1}}');
    assert.ok(fieldsSchemaProblems({unsafe: {default: {constructor: 1}, fields: unsafe} as Spec}).some(problem => /unsafe/.test(problem)));
});

test("fields helper permits only finite safe JSON data without prototype or accessor hazards", () => {
    assert.equal(fieldJsonOk({a: [null, 1, "x", true], b: {c: 2}}), true);
    let accessed = false;
    const accessor = Object.defineProperty({}, "value", {enumerable: true, get: () => { accessed = true; return 1; }});
    const cyclic: unknown[] = []; cyclic.push(cyclic);
    const sparse = Array(2);
    const decorated = Object.assign([1], {extra: 2});
    for (const bad of [undefined, NaN, Infinity, 1n, () => 1, Symbol("x"), new Date(), new Map(), new Set(), sparse, decorated, accessor, cyclic, JSON.parse('{"__proto__":{"polluted":true}}'), JSON.parse('{"constructor":{"prototype":{"polluted":true}}}')]) {
        assert.equal(fieldJsonOk(bad), false);
    }
    let deep: unknown = "leaf";
    for (let level = 0; level < MAX_FIELD_PATH; level += 1) deep = {child: deep};
    assert.equal(fieldJsonOk(deep), true);
    assert.equal(fieldJsonOk({child: deep}), false);
    assert.equal(accessed, false);
    assert.equal(({} as {polluted?: boolean}).polluted, undefined);
});

test("fields helper encodes exact canonical paths and rejects ambiguous or reserved names", () => {
    const key = encodeFieldKey("settings.name", ["a/b", 'quote"', "한글"]);
    assert.deepEqual(decodeFieldKey(key), {attr: "settings.name", path: ["a/b", 'quote"', "한글"]});
    for (const key of ["settings.width", `${FIELD_PREFIX}[]`, `${FIELD_PREFIX}["settings"]`, `${FIELD_PREFIX} ["settings","width"]`, `${FIELD_PREFIX}["settings","\\u0077idth"]`, `${FIELD_PREFIX}["settings",1]`, `${FIELD_PREFIX}["settings","__proto__"]`, `${FIELD_PREFIX}["settings","constructor"]`, `${FIELD_PREFIX}["settings","$type"]`, `${FIELD_PREFIX}${JSON.stringify(Array(MAX_FIELD_PATH + 1).fill("x"))}`]) {
        assert.equal(decodeFieldKey(key), null, key);
    }
    assert.throws(() => encodeFieldKey("settings", ["prototype"]), /invalid field path/);
    assert.equal(fieldSpecAt(settings, ["layout"]), null);
    assert.equal(fieldSpecAt(settings, ["missing"]), null);
    assert.equal(fieldSpecAt(settings, ["layout", "x"]), settings.fields!.layout.fields!.x);
});

test("fields helper flattens partial patches, branch resets and explicit same-value writes", () => {
    assert.deepEqual(flattenFieldPatch(settings, {width: 10}), [{path: ["width"], value: 10}]);
    assert.deepEqual(flattenFieldPatch(settings, {layout: {x: 7}}), [{path: ["layout", "x"], value: 7}]);
    assert.deepEqual(flattenFieldPatch(settings, {layout: null}), [{path: ["layout", "x"], value: null}, {path: ["layout", "y"], value: null}]);
    assert.equal(flattenFieldPatch(settings, null).length, 6);
    assert.deepEqual(flattenFieldPatch(settings, {}), []);
    assert.equal(fieldValueOk(settings, {width: -1}), false);
    assert.equal(fieldValueOk(settings, {unknown: 1}), false);
    assert.equal(fieldValueOk(settings, {tags: {a: 1}}), false);
    assert.throws(() => flattenFieldPatch(settings, {theme: "invalid"}), /invalid field patch/);
    assert.throws(() => flattenFieldPatch(settings, JSON.parse('{"__proto__":{"polluted":true}}')), /invalid field patch/);
});

test("fields helper materializes independent registers and copies defaults and values", () => {
    const stored = new Map([
        [JSON.stringify(["width"]), {value: 77}],
        [JSON.stringify(["layout", "y"]), {value: null}],
        [JSON.stringify(["theme"]), {value: "invalid-for-this-type"}],
        [JSON.stringify(["data"]), {value: {code: "custom"}}],
    ] as Array<[string, {value: unknown}]>);
    const value = materializeFields(settings, path => stored.get(JSON.stringify(path)));
    assert.deepEqual(value, expectedSettings({width: 77, data: {code: "custom"}}));
    (value.layout as {x: number}).x = 100;
    (value.tags as string[]).push("mutated");
    (value.data as {code: string}).code = "changed";
    assert.deepEqual(defaults, {width: 10, theme: "light", layout: {x: 1, y: 2}, tags: ["a"], data: {code: "base"}});
    assert.deepEqual(stored.get(JSON.stringify(["data"]))!.value, {code: "custom"});
});

test("fields helper deep patch and diff omit unrelated leaves but preserve resets", () => {
    const before = expectedSettings({width: 80, layout: {x: 9, y: 8}, tags: ["b"]});
    const after = patchFields(settings, before, {theme: "dark", layout: {x: null}});
    assert.deepEqual(after, expectedSettings({width: 80, theme: "dark", layout: {x: 1, y: 8}, tags: ["b"]}));
    assert.deepEqual(diffFields(settings, before, after), {theme: "dark", layout: {x: null}});
    assert.deepEqual(patchFields(settings, before, diffFields(settings, before, after)), after);
    assert.equal(diffFields(settings, before, structuredClone(before)), null);
    assert.deepEqual(patchFields(settings, before, null), defaults);
    assert.deepEqual(before.layout, {x: 9, y: 8});
});

for (const reverse of [false, true]) test(`nested fields integrate independent writes in ${reverse ? "BA" : "AB"} server order and deduplicate delivery`, async () => {
    const c = await start();
    try {
        const left = c.a.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 20}}}]).ops;
        const right = c.b.doc.edit([{op: "update", at: [0], attrs: {settings: {theme: "dark"}}}]).ops;
        if (reverse) { c.b.commit(right); c.a.commit(left); } else { c.a.commit(left); c.b.commit(right); }
        const repeated = structuredClone(c.a.pending[0]);
        await c.net.settle();
        c.same(expectedSettings({width: 20, theme: "dark"}));
        assert.equal(c.net.hub.submit(repeated), null);
        left.forEach(op => c.b.doc.apply(op)); right.forEach(op => c.a.doc.apply(op));
        c.same(expectedSettings({width: 20, theme: "dark"}));
    } finally { c.close(); }
});

for (const reverse of [false, true]) test(`nested fields integrate same-leaf Ticket LWW in ${reverse ? "BA" : "AB"} order`, async () => {
    const c = await start();
    try {
        const a = c.a.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 20}}}]).ops;
        const b = c.b.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 30}}}]).ops;
        if (reverse) { c.b.commit(b); c.a.commit(a); } else { c.a.commit(a); c.b.commit(b); }
        await c.net.settle(); c.same(expectedSettings({width: 30}));
    } finally { c.close(); }
});

test("nested fields integrate explicit same-value ownership and preserve remote same-value writes during undo", async () => {
    const c = await start();
    const key = encodeFieldKey("settings", ["width"]);
    try {
        const same = c.a.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 10}}}]).ops;
        assert.equal(same.length, 1);
        assert.equal(same[0].t, "set");
        assert.ok(same[0].t === "set" && same[0].key === key && same[0].value === 10);
        c.a.commit(same); await c.net.settle();
        c.b.commit(c.b.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 10}}}]).ops); await c.net.settle();
        const remoteTicket = structuredClone(c.a.doc.blocks()[0].marker.attrs.get(key)!.at);
        assert.equal(remoteTicket.actor, "bob");
        c.a.undo(); await c.net.settle(); c.same(expectedSettings());
        assert.deepEqual(c.a.doc.blocks()[0].marker.attrs.get(key)!.at, remoteTicket);
    } finally { c.close(); }
});

test("nested fields integrate leaf-specific undo/redo and preserve source Tickets in snapshots", async () => {
    const c = await start();
    const key = encodeFieldKey("settings", ["width"]);
    try {
        c.a.commit(c.a.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 20}}}]).ops); await c.net.settle();
        c.b.commit(c.b.doc.edit([{op: "update", at: [0], attrs: {settings: {theme: "dark"}}}]).ops); await c.net.settle();
        c.a.undo(); await c.net.settle(); c.same(expectedSettings({theme: "dark"}));
        c.a.redo(); await c.net.settle(); c.same(expectedSettings({width: 20, theme: "dark"}));
        const clone = Doc.fromSnapshot("snapshot", c.a.doc.snapshot(), schema);
        assert.deepEqual(clone.toJSON(), c.a.doc.toJSON());
        assert.deepEqual(clone.blocks()[0].marker.attrs.get(key), c.a.doc.blocks()[0].marker.attrs.get(key));
    } finally { c.close(); }
});

test("nested fields integrate partial model updates and changed-leaf model diffs", async () => {
    const c = await start();
    try {
        const before = c.a.doc.toJSON();
        const edit = {op: "update" as const, at: [0], attrs: {settings: {layout: {x: 7}}}};
        const after = applyEdits(schema, before, [edit]);
        assert.deepEqual(after.children![0].attrs!.settings, expectedSettings({layout: {x: 7, y: 2}}));
        assert.deepEqual(diffModels(schema, before, after), [edit]);
        c.a.commit(c.a.doc.edit(diffModels(schema, before, after)).ops); await c.net.settle();
        c.same(expectedSettings({layout: {x: 7, y: 2}}));
        assert.deepEqual(diffModels(schema, after, before), [{op: "update", at: [0], attrs: {settings: {layout: {x: null}}}}]);
    } finally { c.close(); }
});

test("nested fields integrate branch reset racing an independent descendant write", async () => {
    const c = await start();
    try {
        c.a.commit(c.a.doc.edit([{op: "update", at: [0], attrs: {settings: {layout: {x: 9, y: 8}}}}]).ops); await c.net.settle();
        const reset = c.a.doc.edit([{op: "update", at: [0], attrs: {settings: {layout: null}}}]).ops;
        const concurrent = c.b.doc.edit([{op: "update", at: [0], attrs: {settings: {layout: {y: 7}}}}]).ops;
        c.a.commit(reset); c.b.commit(concurrent); await c.net.settle();
        // Reset emits x then y; its second Ticket is later than the concurrent first Ticket.
        const resetY = reset.find(op => op.t === "set" && op.key === encodeFieldKey("settings", ["layout", "y"]));
        const remoteY = concurrent.find(op => op.t === "set" && op.key === encodeFieldKey("settings", ["layout", "y"]));
        assert.ok(resetY?.t === "set" && remoteY?.t === "set");
        assert.equal(resetY.at.lamport, remoteY.at.lamport + 1);
        c.same(expectedSettings({layout: {x: 1, y: 2}}));
    } finally { c.close(); }
});

test("nested fields integrate supplied inline values and later leaf updates", async () => {
    const c = await start();
    try {
        c.a.commit(c.a.doc.edit([{op: "insert", at: [0, 2], content: [{type: "badge", attrs: {settings: {width: 30, theme: "dark"}}}]}]).ops); await c.net.settle();
        c.b.commit(c.b.doc.edit([{op: "update", at: [0, 2], attrs: {settings: {layout: {x: 7}}}}]).ops); await c.net.settle();
        const expected: NodeJSON = {type: "content", children: [{type: "paragraph", attrs: {
            settings: expectedSettings(), title: "", legacy: {a: 0, b: 0},
        }, runs: [
            {text: "ro", marks: {}}, {type: "badge", attrs: {settings: expectedSettings({width: 30, theme: "dark", layout: {x: 7, y: 2}})}}, {text: "ot", marks: {}},
        ]}]};
        for (const doc of [c.a.doc, c.b.doc, c.net.hub.doc]) assert.deepEqual(doc.toJSON(), expected);
    } finally { c.close(); }
});

test("nested fields integrate cell namespace with independent writers", async () => {
    const c = await start();
    try {
        c.a.commit(c.a.doc.edit([{op: "insert", at: [1], content: [{type: "table", children: [{type: "row", children: [{type: "cell"}]}]}]}]).ops); await c.net.settle();
        const a = c.a.doc.edit([{op: "update", at: [1, 0, 0], attrs: {settings: {width: 50}}}]).ops;
        const b = c.b.doc.edit([{op: "update", at: [1, 0, 0], attrs: {settings: {theme: "dark"}}}]).ops;
        assert.ok(a.every(op => op.t === "set" && op.key.startsWith("$cell:") && op.key.includes(`|${FIELD_PREFIX}`)));
        c.a.commit(a); c.b.commit(b); await c.net.settle();
        for (const doc of [c.a.doc, c.b.doc, c.net.hub.doc]) assert.deepEqual(doc.toJSON().children![1].children![0].children![0].attrs!.settings, expectedSettings({width: 50, theme: "dark"}));
    } finally { c.close(); }
});

test("nested fields reject coarse writes, unknown leaves, poison paths and field mark schemas", async () => {
    const c = await start();
    try {
        const before = c.net.hub.doc.toJSON();
        const id = c.a.doc.blocks()[0].marker.id;
        for (const [key, value] of [
            ["settings", {width: 40}],
            [`${FIELD_PREFIX}["settings","missing"]`, 1],
            [`${FIELD_PREFIX}["settings","__proto__"]`, {polluted: true}],
            [`${FIELD_PREFIX}["settings","layout"]`, {x: 1}],
            [`${FIELD_PREFIX} ["settings","width"]`, 1],
        ] as Array<[string, unknown]>) {
            assert.throws(() => c.net.hub.submit({actor: "invalid", seq: 1, ops: [{t: "set", at: {lamport: 999, actor: "invalid"}, ids: [id], key, value}]}));
            assert.deepEqual(c.net.hub.doc.toJSON(), before);
        }
        assert.equal(({} as {polluted?: boolean}).polluted, undefined);
        assert.ok(checkSchema({...schema, markValues: {bad: settings}}).length > 0);
    } finally { c.close(); }
});

test("nested fields leave non-opted-in object attributes atomic", async () => {
    const c = await start();
    try {
        const a = c.a.doc.edit([{op: "update", at: [0], attrs: {legacy: {a: 1, b: 0}}}]).ops;
        const b = c.b.doc.edit([{op: "update", at: [0], attrs: {legacy: {a: 0, b: 2}}}]).ops;
        c.a.commit(a); c.b.commit(b); await c.net.settle();
        c.same(expectedSettings(), {a: 0, b: 2});
    } finally { c.close(); }
});


test("nested fields validate immutable shape facts and hide incompatible current-type leaf values", async () => {
    const c = await start();
    try {
        const priorTypeWrite = c.b.doc.edit([{op: "update", at: [0], attrs: {settings: {width: 20}}}]).ops;
        c.a.commit(c.a.doc.edit([{op: "update", at: [0], attrs: {type: "alternate"}}]).ops);
        c.b.commit(priorTypeWrite);
        await c.net.settle();
        const expected: NodeJSON = {type: "content", children: [{type: "alternate", attrs: {
            settings: {...expectedSettings(), width: "auto"}, title: "", legacy: {a: 0, b: 0},
        }, runs: [{text: "root", marks: {}}]}]};
        for (const doc of [c.a.doc, c.b.doc, c.net.hub.doc]) assert.deepEqual(doc.toJSON(), expected);
        c.a.commit(c.a.doc.edit([{op: "update", at: [0], attrs: {type: "paragraph"}}]).ops);
        await c.net.settle();
        c.same(expectedSettings({width: 20}));
    } finally { c.close(); }
});
