import assert from "node:assert/strict";
import {test} from "node:test";
import {LocalClient} from "../src/local/client.ts";
import {Client, clientOwner, createEditorHost} from "../src/client/index.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {TypeScriptEngineCheckpoint} from "../src/engine/contract.ts";
import {PRODUCT_SCHEMAS} from "../../../fixtures/product-schemas.ts";
import {PRODUCT_MODELS} from "../../../fixtures/product-documents.ts";

const schema: Schema = {root: "book", marks: ["bold"], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const insert = (content: string, offset = 0) => [{op: "insert" as const, at: [0, offset], content}];
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Revision and generation are live cache stamps, not persistent document identities.
const comparable = (state: ReturnType<LocalClient["captureState"]>) => ({...state, engine: {...state.engine, revision: 0}});

test("local state JSON preserves actor, CRDT IDs, selection, redo and subsequent clock allocation", () => {
    const original = new LocalClient({schema, actor: "saved-actor"});
    original.edit(insert("A😀한B"), {caretBefore: "before", caretAfter: "after"});
    original.edit(insert("x"));
    original.undo();
    const selection = original.captureSelection({anchor: [0, 4], focus: [0, 1]});
    const state = json(original.captureState()), restored = LocalClient.fromState(state, {schema});
    assert.equal(restored.actor, original.actor);
    assert.deepEqual(comparable(restored.captureState()), comparable(state));
    assert.deepEqual(restored.resolveSelection(selection), original.resolveSelection(selection));
    assert.deepEqual(restored.historyStatus(), {canUndo: true, canRedo: true});
    for (const action of ["redo", "undo", "undo", "redo", "redo"] as const) {
        assert.equal(restored[action](), original[action]());
        assert.deepEqual(restored.model(), original.model());
        assert.deepEqual(comparable(restored.captureState()), comparable(original.captureState()));
    }
    const floor = (restored.captureState().engine as TypeScriptEngineCheckpoint).document.lamport;
    assert.deepEqual(restored.edit(insert("next")), original.edit(insert("next")));
    assert.ok((restored.captureState().engine as TypeScriptEngineCheckpoint).document.lamport > floor);
    restored.dispose(); original.dispose();
});

for (const name of Object.keys(PRODUCT_SCHEMAS) as Array<keyof typeof PRODUCT_SCHEMAS>) test(`local state restores ${name} structure, marks, fields and retained table content`, () => {
    const schema = PRODUCT_SCHEMAS[name], client = new LocalClient({schema, actor: `saved-${name}`});
    client.edit([{op: "delete", at: [0], count: client.model().children!.length}, {op: "insert", at: [0], content: PRODUCT_MODELS[name].children!}], null);
    client.edit([{op: "split", at: [0, 3]}]);
    client.edit([{op: "merge", at: [1]}]);
    client.undo();
    const findTable = (node: typeof PRODUCT_MODELS[typeof name], path: number[] = []): number[] | null => {
        if (node.type === "table") return path;
        for (const [index, child] of (node.children ?? []).entries()) { const found = findTable(child, [...path, index]); if (found) return found; }
        return null;
    };
    const table = findTable(client.model())!;
    client.edit([{op: "update", at: [...table, 0, 0], attrs: {rowspan: 2, colspan: 2}}]);
    client.edit([{op: "insert", at: [...table, 1, 1, 0, 0, 0], content: "retained"}], null);
    const restored = LocalClient.fromState(json(client.captureState()), {schema});
    assert.deepEqual(comparable(restored.captureState()), comparable(client.captureState()));
    for (const action of ["redo", "undo", "undo", "redo", "redo"] as const) {
        assert.equal(restored[action](), client[action]());
        assert.deepEqual(restored.model(), client.model());
    }
    client.dispose(); restored.dispose();
});

test("capture rejects pending host work, empty and edited composition, callback reentry and disposed clients", () => {
    const client = new Client({schema, actor: "A"}), host = createEditorHost(client);
    const ops = host.apply(insert("live"));
    assert.throws(() => client.captureState(), /pending/);
    host.commit(ops);
    const input = host.createSession(); input.begin(); input.begin();
    assert.throws(() => client.captureState(), /composition/);
    input.end(); assert.doesNotThrow(() => client.captureState());
    const sibling = createEditorHost(client), otherInput = sibling.createSession();
    input.begin(); otherInput.begin(); input.cancel();
    assert.throws(() => client.captureState(), /composition/);
    otherInput.cancel(); assert.doesNotThrow(() => client.captureState());
    const siblingOps = sibling.apply(insert("sibling"));
    assert.throws(() => client.captureState(), /pending/);
    sibling.commit(siblingOps);
    input.begin(); const draft = input.apply(insert("draft"));
    assert.throws(() => client.captureState(), /composition/);
    input.commit(draft); assert.throws(() => client.captureState(), /composition/);
    input.cancel(); input.cancel(); assert.doesNotThrow(() => client.captureState());
    let callbacks = 0;
    client.subscribe({update() { callbacks++; assert.throws(() => client.captureState(), /observer/); }});
    client.edit(insert("x")); assert.equal(callbacks, 1);
    client.dispose(); input.cancel(); assert.throws(() => client.captureState(), /disposed/);
});

test("state capture and restore own detached finite plain JSON without invoking accessors", () => {
    const source = new LocalClient({schema, actor: "A"}); source.edit(insert("safe"));
    const state = source.captureState(), restored = LocalClient.fromState(state, {schema});
    (state.engine as TypeScriptEngineCheckpoint).document.lines.length = 0;
    assert.deepEqual(restored.model(), source.model());
    assert.ok((source.captureState().engine as TypeScriptEngineCheckpoint).document.lines.length);
    let reads = 0;
    assert.throws(() => LocalClient.fromState({get format() { reads++; return "doc-sync-local-state-v1"; }}, {schema}), /plain/);
    assert.equal(reads, 0);
    for (const value of [NaN, Infinity, undefined, () => {}, new Date(), [,], {extra: undefined}]) assert.throws(() => LocalClient.fromState(value, {schema}));
    source.dispose(); restored.dispose();
});

test("local validation does not interpret user attribute JSON as history records", () => {
    const definition: Schema = {...schema, nodes: {...schema.nodes, line: {shape: "text", attrs: {payload: {default: null}}}}};
    const client = new LocalClient({schema: definition, actor: "A"});
    client.edit(insert("text"));
    client.edit([{op: "update", at: [0], attrs: {payload: {type: "existence", ids: [{lamport: 999999, actor: "absent"}], delAt: null}}}]);
    const restored = LocalClient.fromState(json(client.captureState()), {schema: definition});
    assert.deepEqual(restored.model(), client.model());
    restored.undo(); client.undo(); assert.deepEqual(restored.model(), client.model());
    restored.dispose(); client.dispose();
});

test("corrupt state rejects before caller replacement and preserves its document and history", () => {
    const live = new LocalClient({schema, actor: "A"}); live.edit(insert("keep"));
    const saved = live.captureState();
    const mutations: Array<(state: typeof saved) => void> = [
        state => { state.format = "future" as never; },
        state => { state.actor = "B"; },
        state => { state.schemaVersion = "wrong"; },
        state => { state.engine.format = "future"; },
        state => { state.engine.identity.contractVersion = 99 as never; },
        state => { (state.engine as TypeScriptEngineCheckpoint).history.version = 2 as never; },
        state => { (state.engine as TypeScriptEngineCheckpoint).document.lamport = 0; },
        state => { ((state.engine as TypeScriptEngineCheckpoint).history.undo[0] as any).steps[0].ids[0] = {lamport: 0, actor: "absent"}; },
        state => { ((state.engine as TypeScriptEngineCheckpoint).history.undo[0] as any).steps[0].delAt = {lamport: 1, actor: "B"}; },
    ];
    for (const mutate of mutations) {
        const damaged = json(saved); mutate(damaged);
        assert.throws(() => LocalClient.fromState(damaged, {schema}));
        assert.deepEqual(live.captureState(), saved);
    }
    assert.throws(() => LocalClient.fromState(saved, {schema: {...schema, marks: []}}), /schema/);
    live.dispose();
});

test("saved clock below token allocations rejects even with empty History", () => {
    const client = new LocalClient({schema, actor: "A"}); client.edit(insert("unrecorded"), null);
    const state = client.captureState();
    assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
    (state.engine as TypeScriptEngineCheckpoint).document.lamport = 0;
    assert.throws(() => LocalClient.fromState(state, {schema}), /saved clock/);
    client.dispose();
});

test("root and nested movement retain physical split targets through save, open, undo and redo", () => {
    const definition: Schema = {root: "book", marks: [], nodes: {
        book: {shape: "flow", children: ["line", "box"], default: "line"}, line: {shape: "text"},
        box: {shape: "flow", children: ["line", "box"], default: "line"},
    }};
    const client = new LocalClient({schema: definition, actor: "A"});
    const p = (text: string) => ({type: "line", runs: [{text, marks: {}}]});
    client.edit([{op: "insert", at: [0], content: [p("abc"), p("DEFG"), {type: "box", children: [p("inside")]}]}], null);
    client.edit([{op: "move", from: [1], at: [0]}]);
    let restored = LocalClient.fromState(json(client.captureState()), {schema: definition});
    assert.deepEqual(restored.model(), client.model()); restored.dispose();
    client.undo(); client.clearHistory();
    client.edit([{op: "move", from: [1], at: [2, 1]}]);
    client.edit([{op: "split", at: [1, 1, 2]}]);
    client.edit([{op: "move", from: [1, 2], at: [1]}]);
    client.undo();
    restored = LocalClient.fromState(json(client.captureState()), {schema: definition});
    for (const action of ["undo", "undo", "redo", "redo", "redo", "undo", "undo"] as const) {
        assert.equal(restored[action](), client[action]());
        assert.deepEqual(restored.model(), client.model());
        assert.deepEqual(comparable(restored.captureState()), comparable(client.captureState()));
        const reopened = LocalClient.fromState(json(restored.captureState()), {schema: definition});
        assert.deepEqual(reopened.model(), restored.model()); reopened.dispose();
    }
    const broken = json(client.captureState());
    ((broken.engine as TypeScriptEngineCheckpoint).history.moves[0] as any).parent = {lamport: 0, actor: "missing-parent"};
    assert.throws(() => LocalClient.fromState(broken, {schema: definition}), /absent/);
    const missingAnchor = json(client.captureState());
    ((missingAnchor.engine as TypeScriptEngineCheckpoint).history.moves[0] as any).after = {lamport: 0, actor: "missing-anchor"};
    assert.throws(() => LocalClient.fromState(missingAnchor, {schema: definition}), /absent/);
    restored.dispose(); client.dispose();
});

test("Client restore uses an ordinary local backend and sync capture retains its existing API", () => {
    const local = new Client({schema, actor: "A"}); local.edit(insert("local"));
    const restored = Client.fromState(json(local.captureState()), {schema});
    assert.ok(clientOwner(restored) instanceof LocalClient);
    assert.equal(restored.mode, "local"); assert.equal(restored.sync, null);
    assert.deepEqual(restored.capabilities, {sync: false, presence: false});
    assert.deepEqual(comparable(restored.captureState()), comparable(local.captureState()));
    const sync = new Client({schema, actor: "A", transport: {subscribe() { return () => {}; }, async send() {}, sendPresence() {}}});
    assert.throws(() => sync.captureState(), /SyncClient.captureState/);
    assert.equal(sync.sync!.captureState().format, 2);
    sync.dispose(); local.dispose(); restored.dispose();
});
