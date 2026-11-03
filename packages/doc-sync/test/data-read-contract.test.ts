import assert from "node:assert/strict";
import {test} from "node:test";
import {Client, clientOwner, createEditorHost} from "../src/client/index.ts";
import {LocalClient} from "../src/local/client.ts";
import {createDataSchema} from "../src/data/index.ts";
import type {DataValue} from "../src/data/access.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import {typescriptClientEngineFactory} from "../src/engine/typescript-client.ts";
import type {ClientEngineFactory} from "../src/engine/client-contract.ts";

// Fixed IDs and a single detached seed edit. No Git, output files, random IDs,
// timing thresholds, or private receipt access is needed to execute this suite.
const id = (n: number) => `data:00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const entry = (n: number, key: string, scalar: null | boolean | number | string): NodeJSON =>
    ({type: "entry", attrs: {id: id(n), key, value: {scalar}}});
const seed = (): NodeJSON[] => [
    entry(90, "duplicate", "winner"), entry(1, "", null), entry(2, "__proto__", false),
    entry(3, "constructor", -0), entry(4, "한글🙂", "seed"), entry(5, "duplicate", "loser"),
    {type: "map", attrs: {id: id(100)}, children: [entry(190, "duplicate", "winner"), entry(101, "first", 1), entry(102, "mid", 2), entry(103, "last", 3), entry(105, "duplicate", "loser")]},
    {type: "list", attrs: {id: id(200)}, children: [entry(201, "first-key", 1), entry(202, "mid-key", 2), entry(203, "last-key", 3)]},
];
function fixture(options: Partial<ConstructorParameters<typeof Client>[0]> = {}, control = false) {
    const client = new Client({actor: "point-cache", schema: createDataSchema(), ...options});
    if (control) clientOwner(client); // Existing public compatibility escape, not a test bypass.
    client.edit([{op: "insert", at: [0], content: seed()}], null);
    const root = client.data.root, map = client.data.getMap(id(100))!, list = client.data.getList(id(200))!;
    root.get("duplicate"); map.get("mid"); list.at(1);
    return {client, root, map, list};
}
type Fixture = ReturnType<typeof fixture>;
const locations = ["root", "map", "list-first", "list-mid", "list-last"] as const;
type Location = typeof locations[number];
function point(f: Fixture, location: Location) {
    if (location === "root" || location === "map") {
        const map = location === "root" ? f.root : f.map;
        return {set: (v: DataValue) => map.set("duplicate", v), get: () => map.get("duplicate"), item: () => map.candidates("duplicate").at(-1)!};
    }
    const n = location === "list-first" ? 201 : location === "list-mid" ? 202 : 203;
    return {set: (v: DataValue) => f.list.set(id(n), v), get: () => f.list.get(id(n)), item: () => f.list.entry(id(n))};
}
// Minimal independent public-model oracle: fixed data layout only. It does not
// use DataAccess indexes, its decoder, cache version, or the candidate algorithm.
function publicProjection(client: Client) {
    const model = client.model();
    const rows = (nodes: NodeJSON[] = []) => nodes.filter(n => n.type === "entry").map(n => ({id: n.attrs!.id, key: n.attrs!.key, value: n.attrs!.value}));
    return {root: rows(model.children), containers: model.children?.filter(n => n.type !== "entry").map(n => ({id: n.attrs!.id, type: n.type, entries: rows(n.children)}))};
}
function freezeTree(value: unknown): void {
    if (!value || typeof value !== "object") return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) freezeTree(child);
}
function samePublic(a: Fixture, b: Fixture) {
    assert.deepEqual(publicProjection(a.client), publicProjection(b.client));
    assert.deepEqual(a.client.snapshot(), b.client.snapshot());
    assert.deepEqual(a.client.historyStatus(), b.client.historyStatus());
}
for (const location of locations) for (const value of [null, false, true, 0, -0, -3.25, Number.MAX_VALUE, "", "한글🙂\u0000"] as const) {
    test(`point semantic ${location} scalar ${Object.is(value, -0) ? "-0" : String(value)}`, () => {
        const a = fixture(), b = fixture({}, true);
        try {
            const pa = point(a, location), pb = point(b, location), old = pa.item(), oldCopy = structuredClone(old);
            pa.set(value); pb.set(value);
            assert.ok(Object.is(pa.get(), value)); assert.ok(Object.is(pb.get(), value));
            samePublic(a, b); assert.deepEqual(old, oldCopy); freezeTree(old);
            const current = pa.item(); freezeTree(current);
            assert.deepEqual(current.path, old.path); assert.equal(current.id, old.id);
            const parent = location === "root" ? a.root : location === "map" ? a.map : a.list;
            const indexed = parent.owner.children(parent.id, location.startsWith("list") ? "list" : "map");
            assert.equal(indexed.find(item => item.id === current.id), current);
            const tree = parent.owner.collection(parent.id, location.startsWith("list") ? "list" : "map");
            assert.equal(tree.node.children![current.path.at(-1)!], current.node);
        } finally {a.client.dispose(); b.client.dispose();}
    });
}

for (const location of locations) test(`point immutable old cross-index graph ${location}`, () => {
    const f = fixture(), p = point(f, location);
    try {
        const parent = location === "root" ? f.root : location === "map" ? f.map : f.list;
        const kind = location.startsWith("list") ? "list" : "map";
        const oldRoot = f.root.owner.collection("$root", "map"), oldParent = parent.owner.collection(parent.id, kind);
        const oldChildren = parent.owner.children(parent.id, kind), oldEntry = p.item();
        const oldCandidates = kind === "map" ? (parent === f.root ? f.root : f.map).candidates("duplicate") : undefined;
        const held = {oldRoot, oldParent, oldChildren, oldEntry, oldCandidates}, copy = structuredClone(held);
        p.set("next"); assert.equal(p.get(), "next");
        assert.deepEqual(held, copy); freezeTree(oldRoot); freezeTree(oldParent); freezeTree(oldChildren); if (oldCandidates) freezeTree(oldCandidates);
        assert.notEqual(p.item(), oldEntry);
        const nowRoot = f.root.owner.collection("$root", "map");
        if (parent !== f.root) assert.equal(nowRoot.node.children![oldParent.path[0]], parent.owner.collection(parent.id, kind).node);
        if (oldCandidates) {
            assert.equal(oldCandidates.at(-1)!.id, location === "root" ? id(90) : id(190));
            assert.equal(oldCandidates[0].node.attrs!.value && (oldCandidates[0].node.attrs!.value as {scalar: string}).scalar, "loser");
        }
    } finally {f.client.dispose();}
});

for (const location of locations) test(`point reference identity cycles ${location}`, () => {
    const f = fixture();
    try {
        f.root.set("self", f.root); f.map.set("self", f.map); f.map.set("list", f.list); f.list.set(id(202), f.map);
        const p = point(f, location);
        for (const value of [f.root, f.map, f.list, -0, null]) {p.set(value); assert.ok(Object.is(p.get(), value));}
        assert.equal(f.root.get("self"), f.root); assert.equal(f.map.get("self"), f.map); assert.equal(f.map.get("list"), f.list);
    } finally {f.client.dispose();}
});

for (const readBetween of [false, true]) test(`point repeated sets read-between=${readBetween}`, () => {
    const a = fixture(), b = fixture({}, true);
    try {
        for (let n = 0; n < 12; n++) {
            point(a, "list-mid").set(n); point(b, "list-mid").set(n);
            if (readBetween) {assert.equal(a.list.at(1)!.value, n); assert.equal(b.list.at(1)!.value, n);}
        }
        assert.equal(a.list.at(1)!.value, 11); samePublic(a, b);
        a.client.undo(); b.client.undo(); assert.equal(a.list.at(1)!.value, 10); samePublic(a, b);
        a.client.redo(); b.client.redo(); samePublic(a, b);
    } finally {a.client.dispose(); b.client.dispose();}
});

test("point raw Client.edit and generic owner.write retain whole-document validation", () => {
    for (const generic of [false, true]) {
        const f = fixture();
        try {
            const edits: EditOp[] = [{op: "update", at: [1], attrs: {value: {scalar: {invalid: true}}}}];
            if (generic) f.root.owner.write({collection: "$root", kind: "map", operation: "set", key: "duplicate", value: 7}, edits);
            else f.client.edit(edits);
            assert.throws(() => f.root.get("duplicate"), /invalid encoded scalar/);
            assert.throws(() => f.list.at(0), /invalid encoded scalar/);
        } finally {f.client.dispose();}
    }
});

for (const attrs of [{id: id(90)}, {value: {reference: id(999), kind: "map"}}]) test(`point unrelated malformed raw edit ${JSON.stringify(attrs)}`, () => {
    const f = fixture();
    try {
        f.client.edit([{op: "update", at: [1], attrs}]);
        assert.throws(() => f.map.get("mid"), /duplicate storage ID|invalid encoded reference|invalid encoded map key/);
    } finally {f.client.dispose();}
});

test("point raw structural edits re-resolve paths and hidden references", () => {
    const f = fixture();
    try {
        f.root.set("held-map", f.map); f.list.set(id(201), f.map);
        const path = f.map.owner.collection(f.map.id, "map").path;
        f.client.edit([{op: "delete", at: path, count: 1}]);
        assert.equal(f.root.get("held-map"), f.map); assert.equal(f.list.at(0)!.value, f.map);
        assert.equal(f.client.data.getMap(f.map.id), undefined); assert.throws(() => f.map.get("mid"), /not visible/);
        f.list.set(id(203), "last after path shift"); assert.equal(f.list.at(2)!.value, "last after path shift");
        f.client.undo(); f.client.undo(); assert.equal(f.client.data.getMap(f.map.id), f.map);
    } finally {f.client.dispose();}
});

for (const method of ["edit", "model", "stamp", "snapshot"] as const) for (const scope of ["instance", "prototype", "subclass"] as const) test(`point override ${scope}.${method} preserves setter/read calls`, () => {
    const trace: string[] = [];
    const base = Client.prototype[method];
    class Derived extends Client {}
    const target = scope === "prototype" ? Client.prototype : scope === "subclass" ? Derived.prototype : null;
    const saved = target ? Object.getOwnPropertyDescriptor(target, method) : undefined;
    const f = scope === "subclass" ? (() => {
        const client = new Derived({schema: createDataSchema(), actor: "point-cache"});
        client.edit([{op: "insert", at: [0], content: seed()}], null);
        return {client, root: client.data.root, map: client.data.getMap(id(100))!, list: client.data.getList(id(200))!};
    })() : fixture();
    const object = target ?? f.client;
    try {
        f.root.get("duplicate");
        Object.defineProperty(object, method, {configurable: true, get() {
            assert.equal(this, f.client); trace.push(`get:${method}`);
            return function(this: Client, ...args: unknown[]) {assert.equal(this, f.client); trace.push(`call:${method}`); return Reflect.apply(base, this, args);};
        }});
        f.root.set("duplicate", 7);
        assert.equal(trace.filter(s => s === "call:model").length, 0, "setter must not eagerly call model override");
        assert.equal(f.root.get("duplicate"), 7);
        assert.equal(trace.filter(s => s === "call:model").length, method === "model" ? 1 : 0);
        assert.equal(trace.filter(s => s === "call:edit").length, method === "edit" ? 1 : 0);
        assert.equal(trace.filter(s => s === "call:snapshot").length, 0);
    } finally {
        if (saved) Object.defineProperty(object, method, saved); else Reflect.deleteProperty(object, method);
        f.client.dispose();
    }
});

for (const method of ["edit", "model", "stamp"] as const) test(`point throwing ${method} getter preserves sentinel and order`, () => {
    const f = fixture(), sentinel = new Error(`sentinel:${method}`); let calls = 0;
    try {
        Object.defineProperty(f.client, method, {configurable: true, get() {calls++; throw sentinel;}});
        if (method === "model") {
            assert.doesNotThrow(() => f.root.set("duplicate", 7)); assert.equal(calls, 0);
            assert.throws(() => f.root.get("duplicate"), error => error === sentinel); assert.equal(calls, 1);
        } else {assert.throws(() => f.root.set("duplicate", 7), error => error === sentinel); assert.equal(calls, 1);}
    } finally {Reflect.deleteProperty(f.client, method); f.client.dispose();}
});

for (const property of ["schema", "mode"] as const) test(`point ${property} getter has no new optional reads`, () => {
    const f = fixture(), saved = f.client[property]; let reads = 0;
    try {
        Object.defineProperty(f.client, property, {configurable: true, get() {reads++; return saved;}});
        f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
        if (property === "mode") assert.equal(reads, 0); else assert.ok(reads > 0);
    } finally {Reflect.deleteProperty(f.client, property); f.client.dispose();}
});

test("point policy reads old value, preserves sentinel, releases recursive guard", () => {
    let action = () => {}; let enabled = false;
    const f = fixture({data: {validate() {if (enabled) {assert.equal(this, f.client); assert.equal(f.root.get("duplicate"), "winner"); action();}}}});
    const sentinel = new Error("policy sentinel");
    try {
        const before = f.client.captureState(); enabled = true; action = () => {throw sentinel;};
        assert.throws(() => f.root.set("duplicate", 7), error => error === sentinel); assert.deepEqual(f.client.captureState(), before);
        action = () => f.root.set("recursive", 1); assert.throws(() => f.root.set("duplicate", 7), /validator mutation/);
        assert.deepEqual(f.client.captureState(), before); action = () => {}; f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
    } finally {f.client.dispose();}
});

test("point policy backend mutation preserves the original pre-policy path", () => {
    let action = () => {};
    const f = fixture({data: {validate() {action();}}});
    const backend = clientOwner(f.client); assert.ok(backend instanceof LocalClient);
    try {
        action = () => backend.edit([{op: "delete", at: [0], count: 1}]);
        f.root.set("duplicate", 77);
        // Legacy resolves the winner path [0] before policy. After deletion that
        // same path names the empty-key entry, not the remaining duplicate.
        assert.equal(f.root.get(""), 77); assert.equal(f.root.get("duplicate"), "loser");
    } finally {f.client.dispose();}
});

test("point observer read cache is retained; mutation/removal/throw order is unchanged", () => {
    const f = fixture(), order: string[] = []; let stopRemoved = () => {};
    let captured: ReturnType<typeof f.root.candidates> | undefined;
    try {
        const observer = {update() {
            assert.equal(this, observer); order.push("first"); assert.equal(f.root.get("duplicate"), 7);
            captured = f.root.candidates("duplicate"); stopRemoved();
            assert.throws(() => f.root.set("duplicate", 8), /observer/); throw new Error("observer sentinel");
        }};
        f.client.subscribe(observer); stopRemoved = f.client.subscribe({update() {order.push("removed");}});
        f.client.subscribe({update() {order.push("last"); assert.equal(f.root.get("duplicate"), 7);}});
        f.root.set("duplicate", 7); assert.deepEqual(order, ["first", "last"]);
        assert.equal(f.root.candidates("duplicate"), captured); assert.ok(Object.isFrozen(captured));
        assert.equal(f.client.notificationErrors.at(-1)!.message, "observer sentinel");
    } finally {f.client.dispose();}
});

test("point failed observer refresh does not make setter throw or hide later read failure", () => {
    const f = fixture(), original = f.client.model, sentinel = new Error("observer model"); let captured = false;
    try {
        f.client.subscribe({update() {
            Object.defineProperty(f.client, "model", {configurable: true, value() {throw sentinel;}});
            captured = true; f.root.get("duplicate");
        }});
        assert.doesNotThrow(() => f.root.set("duplicate", 7)); assert.ok(captured);
        assert.equal(f.client.notificationErrors.at(-1)!.message, sentinel.message);
        assert.throws(() => f.root.get("duplicate"), error => error === sentinel);
        Object.defineProperty(f.client, "model", {configurable: true, value: original});
        assert.equal(f.root.get("duplicate"), 7);
    } finally {Reflect.deleteProperty(f.client, "model"); f.client.dispose();}
});

test("point observer DTO mutation does not change accepted encoded payload", () => {
    const f = fixture();
    try {
        f.client.subscribe({modelEvents(edits) {
            const update = edits.find(edit => edit.op === "update");
            if (update?.op === "update" && update.attrs?.value) (update.attrs.value as {scalar: string}).scalar = "observer changed";
        }});
        f.root.set("duplicate", "accepted"); assert.equal(f.root.get("duplicate"), "accepted");
        assert.equal((f.client.model().children![0].attrs!.value as {scalar: string}).scalar, "accepted");
    } finally {f.client.dispose();}
});

for (const active of [false, true]) test(`point other host pending origin active-composition=${active}`, () => {
    const f = fixture(), host = createEditorHost(f.client), session = host.createSession();
    try {
        if (active) session.begin();
        const edits: EditOp[] = [{op: "update", at: [1], attrs: {value: {scalar: "pending"}}}];
        const ops = active ? session.apply(edits) : host.apply(edits);
        if (!active) {
            assert.throws(() => f.root.set("duplicate", 7), /pending/);
            assert.equal(f.root.get("duplicate"), "winner"); host.commit(ops);
        } else {
            // Active composition alone does not reject legacy complete edits.
            f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
            session.commit(ops); session.cancel();
        }
    } finally {session.cancel(); f.client.dispose();}
});

test("point restored local state retains undo/redo and subsequent writes", () => {
    const f = fixture(); let restored: Client | undefined;
    try {
        f.root.set("duplicate", 7); f.client.undo(); const state = f.client.captureState();
        restored = Client.fromState(state, {schema: createDataSchema()});
        assert.equal(restored.data.root.get("duplicate"), "winner"); restored.redo(); assert.equal(restored.data.root.get("duplicate"), 7);
        restored.data.root.set("duplicate", -0); assert.ok(Object.is(restored.data.root.get("duplicate"), -0));
        restored.undo(); assert.equal(restored.data.root.get("duplicate"), 7);
    } finally {restored?.dispose(); f.client.dispose();}
});

for (const connected of [false, true]) test(`point custom engine seven-step stamp sync connected=${connected}`, () => {
    const factory: ClientEngineFactory = {...typescriptClientEngineFactory, create(actor, schema) {
        const engine = typescriptClientEngineFactory.create(actor, schema), stamp = engine.stamp.bind(engine);
        engine.stamp = () => {const s = stamp(); return {...s, revision: s.revision * 7};}; return engine;
    }};
    const f = fixture({actor: "custom", transport: {subscribe() {return () => {};}, async send() {}, sendPresence() {}}, syncOptions: {engineFactory: factory}});
    try {
        if (connected) f.client.connect(); else f.client.disconnect();
        const before = f.client.stamp(); f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
        assert.equal(f.client.stamp().revision - before.revision, 7);
        f.list.set(id(202), -0); assert.ok(Object.is(f.list.at(1)!.value, -0));
    } finally {f.client.disconnect(); assert.throws(() => f.client.dispose(), /protected local state or history/);}
});

for (const value of [NaN, Infinity, -Infinity, {}, [], () => {}, Symbol("invalid"), 1n, undefined]) test(`point invalid input ${typeof value}:${String(value)}`, () => {
    const f = fixture();
    try {
        const before = f.client.captureState();
        assert.throws(() => f.root.set("duplicate", value as never), /finite scalar/);
        assert.deepEqual(f.client.captureState(), before); assert.equal(f.root.get("duplicate"), "winner");
    } finally {f.client.dispose();}
});

test("point foreign handles reject without freezing the caller or its owner", () => {
    const a = fixture(), b = fixture();
    try {
        assert.throws(() => a.root.set("duplicate", b.map), /another client/);
        assert.equal(Object.isFrozen(b.map.owner), false); b.map.set("mid", 44); assert.equal(b.map.get("mid"), 44);
    } finally {a.client.dispose(); b.client.dispose();}
});

test("point raw edit and escaped owner preserve the accepted value", () => {
    for (const raw of [false, true]) {
        const f = fixture({}, !raw), p = point(f, "root");
        try {
            if (raw) f.client.edit([{op: "update", at: [0], attrs: {value: {scalar: "fallback"}}}]); else p.set("fallback");
            assert.equal(p.get(), "fallback");
            assert.deepEqual(p.item().node.attrs!.value, {scalar: "fallback"});
        } finally {f.client.dispose();}
    }
});

test("point raw key type rejection is atomic, not a deferred read failure", () => {
    const f = fixture();
    try {
        const before = f.client.captureState();
        assert.throws(() => f.client.edit([{op: "update", at: [1], attrs: {key: 17}}]), /Invalid graphic edit/);
        assert.deepEqual(f.client.captureState(), before); assert.equal(f.root.get("duplicate"), "winner");
    } finally {f.client.dispose();}
});

function offlineFixture() {
    return fixture({actor: "offline-point", transport: {subscribe() {return () => {};}, async send() {}, sendPresence() {}}});
}

test("point raw Doc.apply corruption elsewhere must throw on the next unrelated read", () => {
    const f = offlineFixture();
    try {
        const doc = f.client.sync!.doc;
        const ops = f.client.edit([{op: "update", at: [1], attrs: {value: {scalar: 8}}}]);
        assert.equal(ops.length, 1); assert.equal(ops[0].t, "set");
        assert.equal(f.root.get("duplicate"), "winner");
        const op = ops[0]; assert.equal(op.t, "set");
        doc.apply({...op, at: doc.clock.next(), value: {scalar: {invalid: true}}});
        assert.throws(() => f.root.get("duplicate"), /invalid encoded scalar/);
        assert.throws(() => f.list.at(1), /invalid encoded scalar/);
    } finally {f.client.disconnect();}
});

for (const escape of ["owner", "doc", "history"] as const) test(`point compatibility ${escape} values unchanged and subsequent writes are coherent`, () => {
    const f = escape === "owner" ? fixture() : offlineFixture();
    try {
        if (escape === "owner") assert.equal(clientOwner(f.client), clientOwner(f.client));
        else if (escape === "doc") assert.equal(f.client.sync!.doc, f.client.sync!.doc);
        else assert.equal(f.client.sync!.history, f.client.sync!.history);
        f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
        f.client.undo(); assert.equal(f.root.get("duplicate"), "winner"); f.client.redo(); assert.equal(f.root.get("duplicate"), 7);
    } finally {if (escape === "owner") f.client.dispose(); else f.client.disconnect();}
});

test("point exhausted clock preserves document, history, stamp and notifications", () => {
    const f = fixture(); let restored: Client | undefined;
    try {
        const state = f.client.captureState();
        (state.engine.document as {lamport: number}).lamport = Number.MAX_SAFE_INTEGER;
        restored = Client.fromState(state, {schema: createDataSchema()});
        const root = restored.data.root; assert.equal(root.get("duplicate"), "winner");
        const before = restored.captureState(), stamp = restored.stamp(); let notifications = 0;
        restored.subscribe({update() {notifications++;}});
        assert.throws(() => root.set("duplicate", 7), /safe integer range/);
        assert.deepEqual(restored.captureState(), before); assert.deepEqual(restored.stamp(), stamp); assert.equal(notifications, 0);
        assert.equal(root.get("duplicate"), "winner");
    } finally {restored?.dispose(); f.client.dispose();}
});

test("point mutable schema override rejects even at the same stamp and recovers", () => {
    const f = fixture(), schema = createDataSchema();
    try {
        Object.defineProperty(f.client, "schema", {configurable: true, value: schema});
        const stamp = f.client.stamp(); assert.equal(f.root.get("duplicate"), "winner");
        schema.nodes.unused = {shape: "atom"};
        assert.deepEqual(f.client.stamp(), stamp);
        assert.throws(() => f.root.get("duplicate"), /requires createDataSchema/);
        assert.throws(() => f.list.at(0), /requires createDataSchema/);
        assert.throws(() => f.root.set("duplicate", 7), /requires createDataSchema/);
        Reflect.deleteProperty(f.client, "schema"); f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
    } finally {Reflect.deleteProperty(f.client, "schema"); f.client.dispose();}
});

test("point input edit DTO is detached from cached and encoded payloads", () => {
    const f = fixture();
    try {
        const encoded = {scalar: "accepted"}, attrs = {value: encoded};
        const edits: EditOp[] = [{op: "update", at: [0], attrs}];
        f.client.edit(edits); encoded.scalar = "caller mutation"; edits.length = 0;
        assert.equal(Object.isFrozen(encoded), false); assert.equal(Object.isFrozen(attrs), false);
        assert.equal(f.root.get("duplicate"), "accepted");
        const held = f.root.candidates("duplicate").at(-1)!; freezeTree(held);
        f.root.set("duplicate", "next"); assert.equal(f.root.get("duplicate"), "next");
        assert.deepEqual(held.node.attrs!.value, {scalar: "accepted"});
    } finally {f.client.dispose();}
});

test("point policy method replacement keeps legacy edit getter failure", () => {
    let enabled = false, calls = 0;
    const sentinel = new Error("policy installed getter");
    const f = fixture({data: {validate() {
        if (enabled) Object.defineProperty(f.client, "edit", {configurable: true, get() {calls++; throw sentinel;}});
    }}});
    try {
        enabled = true; assert.throws(() => f.root.set("duplicate", 7), error => error === sentinel);
        assert.equal(calls, 1); assert.equal(f.root.get("duplicate"), "winner");
    } finally {Reflect.deleteProperty(f.client, "edit"); f.client.dispose();}
});

test("point fallback captures public model once even after a reentrant data read", () => {
    const f = fixture(), original = f.client.model; let calls = 0, nested = false;
    try {
        Object.defineProperty(f.client, "model", {configurable: true, value() {
            calls++;
            if (!nested) {nested = true; assert.equal(f.list.at(1)!.value, 2);}
            return original.call(f.client);
        }});
        f.root.set("duplicate", 7); assert.equal(calls, 0);
        assert.equal(f.root.get("duplicate"), 7); assert.equal(calls, 2, "one outer capture and one independent nested refresh");
        assert.equal(f.root.get("duplicate"), 7); assert.equal(calls, 2);
    } finally {Reflect.deleteProperty(f.client, "model"); f.client.dispose();}
});

test("point pending delta cannot replay across undo, structural edit or another client", () => {
    const a = fixture(), b = fixture();
    try {
        a.root.set("duplicate", 7); a.client.undo(); assert.equal(a.root.get("duplicate"), "winner");
        b.root.set("duplicate", 8); assert.equal(b.root.get("duplicate"), 8); assert.equal(a.root.get("duplicate"), "winner");
        a.root.set("duplicate", 9);
        a.client.edit([{op: "update", at: [1], attrs: {value: {scalar: {invalid: true}}}}]);
        assert.throws(() => a.root.get("duplicate"), /invalid encoded scalar/);
        assert.equal(b.root.get("duplicate"), 8);
    } finally {a.client.dispose(); b.client.dispose();}
});

for (const property of ["schema", "mode"] as const) for (const scope of ["prototype", "subclass"] as const) test(`point ${scope} ${property} getter preserves legacy access`, () => {
    class Derived extends Client {}
    const f = scope === "prototype" ? fixture() : (() => {
        const client = new Derived({schema: createDataSchema(), actor: "point-cache"});
        client.edit([{op: "insert", at: [0], content: seed()}], null);
        return {client, root: client.data.root, map: client.data.getMap(id(100))!, list: client.data.getList(id(200))!};
    })();
    const object = scope === "prototype" ? Client.prototype : Derived.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(object, property), original = Object.getOwnPropertyDescriptor(Client.prototype, property)!.get!;
    let calls = 0;
    try {
        f.root.get("duplicate");
        Object.defineProperty(object, property, {configurable: true, get() {assert.equal(this, f.client); calls++; return original.call(this);}});
        f.root.set("duplicate", 7); assert.equal(f.root.get("duplicate"), 7);
        if (property === "mode") assert.equal(calls, 0); else assert.ok(calls > 0);
    } finally {if (descriptor) Object.defineProperty(object, property, descriptor); else Reflect.deleteProperty(object, property); f.client.dispose();}
});

test("point raw losing LWW set must retain the actual winner", () => {
    const f = offlineFixture();
    try {
        const ops = f.client.edit([{op: "update", at: [0], attrs: {value: {scalar: "latest"}}}]);
        const op = ops[0]; assert.equal(op.t, "set"); assert.equal(f.root.get("duplicate"), "latest");
        const doc = f.client.sync!.doc, stamp = f.client.stamp();
        doc.apply({...op, at: {actor: "older", lamport: 1}, value: {scalar: "losing"}});
        assert.ok(f.client.stamp().revision > stamp.revision); assert.equal(f.root.get("duplicate"), "latest");
    } finally {f.client.disconnect();}
});

test("point DTO accessor rejection preserves getter order and atomicity", () => {
    const f = fixture(), sentinel = new Error("DTO scalar getter"); let calls = 0;
    try {
        const before = f.client.captureState();
        const value = {get scalar(): string {calls++; throw sentinel;}};
        assert.throws(() => f.client.edit([{op: "update", at: [0], attrs: {value}}]), /Engine DTO must contain plain values/);
        assert.equal(calls, 0); assert.deepEqual(f.client.captureState(), before); assert.equal(f.root.get("duplicate"), "winner");
    } finally {f.client.dispose();}
});
