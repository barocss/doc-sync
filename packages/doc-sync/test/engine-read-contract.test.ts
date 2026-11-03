import assert from "node:assert/strict";
import {test} from "node:test";
import {Client} from "../src/client/index.ts";
import {Doc} from "../src/crdt/doc.ts";
import {History} from "../src/crdt/history.ts";
import type {Op} from "../src/crdt/doc.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import type {TypeScriptClientCompatibility} from "../src/engine/client-contract.ts";
import {typescriptClientEngineFactory} from "../src/engine/typescript-client.ts";
import {createDataSchema} from "../src/data/index.ts";

const id = "data:00000000-0000-4000-8000-000000000001";
const seed = (): NodeJSON[] => [{type: "entry", attrs: {id, key: "key", value: {scalar: "old"}}}];
function fixture() {
    const engine = typescriptClientEngineFactory.create("receiver", createDataSchema()) as ReturnType<typeof typescriptClientEngineFactory.create> & TypeScriptClientCompatibility;
    engine.setEditHooks({guard: null, listener: null});
    engine.apply([{op: "insert", at: [0], content: seed()}]);
    return {engine};
}
const methods = ["typescriptDocument", "typescriptHistory", "replaceTypeScriptDocument", "replaceTypeScriptHistory"] as const;
type Method = typeof methods[number];
// Self-contained frozen BEFORE behavior: ordinary TS-private fields, no runtime
// private brands. Tests do not load Git, ignored output, or generated dist.
function before(method: Method, receiver: object, arg: Doc | History): unknown {
    const self = receiver as {alive(): void; doc: Doc; history: History; generation: number; guardWrapper: null; attach(): void};
    self.alive();
    if (method === "typescriptDocument") return self.doc;
    if (method === "typescriptHistory") return self.history;
    if (method === "replaceTypeScriptHistory") {self.history = arg as History; return;}
    self.doc = arg as Doc; self.generation = 1; self.guardWrapper = null; self.attach();
}
function invoke(engine: ReturnType<typeof fixture>["engine"], method: Method, arg: Doc | History): unknown {
    if (method === "replaceTypeScriptDocument") return engine[method](arg as Doc);
    if (method === "replaceTypeScriptHistory") return engine[method](arg as History);
    return engine[method]();
}

for (const method of methods) test(`engine receiver transparent Proxy compatibility ${method}`, () => {
    const {engine} = fixture(), proxy = new Proxy(engine, {});
    // Capture pointers through the public compatibility methods.
    const pointer = method.endsWith("Document") ? engine.typescriptDocument() : engine.typescriptHistory();
    try {
        const result = invoke(proxy, method, pointer);
        assert.equal(result, method.startsWith("replace") ? undefined : pointer);
        assert.equal(invoke(engine, method, pointer), result);
        assert.deepEqual(engine.model().children, seed());
    } finally {engine.dispose();}
});

for (const method of methods) for (const throws of [false, true]) test(`engine receiver frozen observation oracle ${method} throws=${throws}`, () => {
    const {engine} = fixture(), doc = new Doc("foreign", createDataSchema()), history = new History();
    const arg = method.endsWith("Document") ? doc : history;
    const observed = (run: (proxy: typeof engine) => unknown) => {
        const seen: string[] = [], sentinel = new Error("first alive failure");
        let proxy: typeof engine;
        const target = {
            alive() {assert.equal(this, proxy); seen.push("alive"); if (throws) throw sentinel;},
            get doc() {assert.equal(this, proxy); seen.push("doc"); return doc;},
            set doc(value: Doc) {assert.equal(this, proxy); assert.equal(value, arg); seen.push("doc=");},
            get history() {assert.equal(this, proxy); seen.push("history"); return history;},
            set history(value: History) {assert.equal(this, proxy); assert.equal(value, arg); seen.push("history=");},
            set generation(_value: number) {seen.push("generation=");},
            set guardWrapper(_value: null) {seen.push("guardWrapper=");},
            attach() {assert.equal(this, proxy); seen.push("attach");},
        };
        proxy = new Proxy(target, {
            get(t, k, r) {seen.push(`get:${String(k)}`); return Reflect.get(t, k, r);},
            set(t, k, v, r) {seen.push(`set:${String(k)}`); return Reflect.set(t, k, v, r);},
        }) as unknown as typeof engine;
        let result: unknown;
        if (throws) assert.throws(() => run(proxy), error => error === sentinel);
        else result = run(proxy);
        return {seen, result};
    };
    try {
        const actual = observed(proxy => Reflect.apply(engine[method], proxy, [arg]));
        const expected = observed(proxy => before(method, proxy, arg));
        assert.deepEqual(actual, expected);
        if (throws) assert.deepEqual(actual.seen, ["get:alive", "alive"]);
    } finally {engine.dispose();}
});

for (const method of methods) test(`engine receiver disposed alive error is first ${method}`, () => {
    const {engine} = fixture(); engine.dispose();
    const seen: string[] = [], proxy = new Proxy(engine, {get(t, k, r) {seen.push(String(k)); return Reflect.get(t, k, r);}});
    assert.throws(() => invoke(proxy, method, new History()), {name: "Error", message: "Engine is disposed"});
    assert.deepEqual(seen, [method, "alive", "disposed"]);
});

test("engine receiver Client.fromState and clearHistory preserve the model", () => {
    const client = new Client({actor: "restore", schema: createDataSchema()});
    client.edit([{op: "insert", at: [0], content: seed()}], null);
    const restored = Client.fromState(client.captureState(), {schema: createDataSchema()});
    try {
        const root = restored.data.root;
        assert.equal(root.get("key"), "old");
        root.set("key", "new");
        const model = restored.model();
        assert.equal(restored.historyStatus().canUndo, true);
        restored.clearHistory();
        assert.equal(restored.historyStatus().canUndo, false);
        assert.equal(restored.historyStatus().canRedo, false);
        assert.equal(root.get("key"), "new");
        assert.deepEqual(restored.model(), model);
        assert.equal(client.data.root.get("key"), "old");
    } finally {restored.dispose(); client.dispose();}
});

for (const method of ["apply", "emit", "compact"] as const) test(`engine receiver Doc transparent Proxy ${method} preserves ordinary behavior`, () => {
    const doc = new Doc("doc-receiver", createDataSchema()), proxy = new Proxy(doc, {});
    const op = {t: "set" as const, ids: [], key: "value", value: 1, at: {lamport: 1, actor: "doc-receiver"}};
    if (method === "compact") assert.equal(proxy.compact(0, () => undefined), 0);
    else if (method === "emit") proxy.emit([op]);
    else proxy.apply(op);
    assert.deepEqual(doc.toJSON().children, []);
});

test("engine receiver Doc read projection retains its original guard error", () => {
    const doc = new Doc("projection", createDataSchema());
    assert.throws(() => doc.withReadProjection(read => read.apply({t: "set", ids: [], key: "value", value: 1, at: {lamport: 1, actor: "projection"}})), {name: "Error", message: "Read projection cannot edit the document"});
});

for (const method of methods) test(`engine receiver original accessor failure order ${method}`, () => {
    const {engine} = fixture(), sentinel = new Error("pointer access"), seen: string[] = [];
    const key = method.endsWith("Document") ? "doc" : "history";
    const target = {alive() {seen.push("alive");}};
    Object.defineProperty(target, key, {get() {seen.push("get:pointer"); throw sentinel;}, set() {seen.push("set:pointer"); throw sentinel;}});
    const proxy = new Proxy(target, {get(t, k, r) {seen.push(`get:${String(k)}`); return Reflect.get(t, k, r);}, set(t, k, v, r) {seen.push(`set:${String(k)}`); return Reflect.set(t, k, v, r);}});
    try {
        assert.throws(() => Reflect.apply(engine[method], proxy, [new History()]), error => error === sentinel);
        const mode = method.startsWith("replace") ? "set" : "get";
        assert.deepEqual(seen, ["get:alive", "alive", `${mode}:${key}`, `${mode}:pointer`]);
    } finally {engine.dispose();}
});

for (const throws of [false, true]) test(`engine receiver Doc Proxy original edit guard first throws=${throws}`, () => {
    const doc = new Doc("guard", createDataSchema()), proxy = new Proxy(doc, {}), seen: string[] = [], sentinel = new Error("guard failure");
    doc.editGuard = function() {assert.equal(this, proxy); seen.push("guard"); if (throws) throw sentinel;};
    const op = new Proxy({t: "set" as const, ids: [], key: "value", value: 1, at: {lamport: 1, actor: "guard"}}, {get(t, k, r) {seen.push(String(k)); return Reflect.get(t, k, r);}});
    if (throws) {assert.throws(() => proxy.apply(op), error => error === sentinel); assert.deepEqual(seen, ["guard"]);}
    else {proxy.apply(op); assert.deepEqual(seen, ["guard", "t", "ids", "at"]);}
});


const rawId = (n: number) => `data:00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const entry = (n: number, key: string, value: unknown): NodeJSON => ({type: "entry", attrs: {id: rawId(n), key, value: {scalar: value}}});
const rawSeed = (): NodeJSON[] => [entry(90, "key", "winner"), entry(1, "other", 1), entry(5, "key", "loser"),
    {type: "list", attrs: {id: rawId(100)}, children: [entry(101, "stored-first", 1), entry(102, "stored-second", 2)]}];
function docFixture() {
    const doc = new Doc("trace-test", createDataSchema());
    doc.edit([{op: "insert", at: [0], content: rawSeed()}]);
    const result = doc.edit([{op: "update", at: [0], attrs: {value: {scalar: "current"}}}]);
    const op = result.ops[0]; assert.equal(op.t, "set");
    return {doc, op};
}

for (const throws of [false, true]) test(`trace raw Doc guard preserves receiver, order and failure throws=${throws}`, () => {
    const {doc, op} = docFixture(), before = doc.snapshot(), sentinel = new Error("guard"), seen: string[] = [];
    const proxy = new Proxy({...op, at: {actor: "remote", lamport: 100}, value: {scalar: "remote"}}, {get(target, key, receiver) {seen.push(String(key)); return Reflect.get(target, key, receiver);}});
    doc.editGuard = function() {assert.equal(this, doc); seen.push("guard"); if (throws) throw sentinel;};
    if (throws) {assert.throws(() => doc.apply(proxy), error => error === sentinel); assert.deepEqual(seen, ["guard"]); assert.deepEqual(doc.snapshot(), before);}
    else {doc.apply(proxy); assert.equal(seen[0], "guard"); assert.deepEqual(doc.toJSON().children![0].attrs!.value, {scalar: "remote"});}
});

for (const action of ["winning", "losing", "multi-id", "missing-id", "non-value", "replay"] as const) test(`trace raw physical ${action} storage and clock are authoritative`, () => {
    const {doc, op} = docFixture(), plain = Doc.fromSnapshot("trace-test", doc.snapshot(), createDataSchema());
    const second = doc.edit([{op: "update", at: [1], attrs: {value: {scalar: 2}}}]).ops[0]; assert.equal(second.t, "set");
    plain.apply(second);
    const at = {actor: "remote", lamport: 100};
    let operation: Op = {...op, at, value: {scalar: "new"}};
    if (action === "losing") operation = {...operation, at: {actor: "remote", lamport: 0}};
    if (action === "multi-id") operation = {...operation, ids: [...op.ids, ...second.ids]};
    if (action === "missing-id") operation = {...operation, ids: [{actor: "absent", lamport: 999}]};
    if (action === "non-value") operation = {...operation, key: "key", value: "changed"};
    const version = doc.version, plainVersion = plain.version;
    doc.apply(operation); plain.apply(structuredClone(operation));
    if (action === "replay") {doc.apply(operation); plain.apply(structuredClone(operation));}
    assert.deepEqual(doc.snapshot(), plain.snapshot()); assert.deepEqual(doc.toJSON(), plain.toJSON());
    assert.equal(doc.clock.lamport, plain.clock.lamport); assert.equal(doc.version - version, plain.version - plainVersion);
    if (action === "losing" || action === "missing-id") assert.deepEqual(doc.toJSON().children![0].attrs!.value, {scalar: "current"});
    else if (action === "non-value") assert.equal(doc.toJSON().children![0].attrs!.key, "changed");
    else assert.deepEqual(doc.toJSON().children![0].attrs!.value, {scalar: "new"});
    if (action === "multi-id") assert.deepEqual(doc.toJSON().children![1].attrs!.value, {scalar: "new"});
});

// Exact inactive raw-DTO observation order captured from the frozen post-refactor
// Doc.apply. This oracle does not instrument engine or replace Doc methods.
for (const action of ["winning", "losing", "multi-id", "missing-id"] as const) test(`trace inactive raw proxy observation order ${action}`, () => {
    const {doc, op} = docFixture();
    const second = doc.edit([{op: "update", at: [1], attrs: {value: {scalar: 2}}}]).ops[0]; assert.equal(second.t, "set");
    const raw = {...op, at: {actor: "remote", lamport: action === "losing" ? 0 : 100}, value: {scalar: 5}};
    if (action === "multi-id") raw.ids = [...op.ids, ...second.ids];
    if (action === "missing-id") raw.ids = [{actor: "absent", lamport: 999}];
    const seen: string[] = [];
    doc.apply(new Proxy(raw, {
        get(target, key, receiver) {seen.push(`get:${String(key)}`); return Reflect.get(target, key, receiver);},
        ownKeys(target) {seen.push("ownKeys"); return Reflect.ownKeys(target);},
        getOwnPropertyDescriptor(target, key) {seen.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key);},
    }));
    const winning = ["get:key", "get:at", "get:key", "get:value", "get:at"];
    assert.deepEqual(seen, ["get:t", "get:ids", ...(action === "missing-id" ? [] : action === "losing" ? ["get:key", "get:at"] : action === "multi-id" ? [...winning, ...winning] : winning), "get:at"]);
});
