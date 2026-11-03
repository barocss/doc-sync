import assert from "node:assert/strict";
import {test} from "node:test";
import {Client, createEditorHost} from "../src/client/index.ts";
import {LocalClient} from "../src/local/client.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DocHub} from "../src/server/hub.ts";
import type {ActorProfile} from "../src/client/profile.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {Transport} from "../src/sync/protocol.ts";
const schema: Schema = {root: "book", marks: [], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const insert = [{op: "insert" as const, at: [0, 0], content: "hello"}];
function transport(hub: DocHub): Transport {
    return {
        subscribe(since, receive, epoch) { receive(hub.hello(since, epoch)); return hub.listen(receive); },
        async send(message) { if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence(presence) { hub.setPresence(presence); },
    };
}

test("profile is detached, deeply frozen metadata and does not alter replica operations or history", () => {
    const metadata = {team: {roles: ["reviewer"]}};
    const first = new Client({schema, actor: "replica-A", profile: {name: "Alice", color: "red", userId: "user-1", kind: "human", metadata}});
    const plain = new Client({schema, actor: "replica-A"});
    metadata.team.roles.push("changed");
    assert.deepEqual(first.profile.metadata, {team: {roles: ["reviewer"]}});
    assert.ok(Object.isFrozen(first.profile));
    assert.ok(Object.isFrozen(first.profile.metadata?.team));
    assert.throws(() => { (first.profile.metadata as typeof metadata).team.roles.push("changed"); }, TypeError);
    assert.deepEqual(first.edit(insert), plain.edit(insert));
    assert.deepEqual(first.historyStatus(), plain.historyStatus());
    first.undo(); plain.undo(); assert.deepEqual(first.model(), plain.model());
    first.redo(); plain.redo(); assert.deepEqual(first.captureState().engine.document, plain.captureState().engine.document);
    assert.deepEqual(first.historyStatus(), plain.historyStatus());
    const state = first.captureState();
    assert.equal(state.actor, "replica-A"); assert.equal("profile" in state, false);
    const restored = Client.fromState(state, {schema, profile: {name: "Restored"}});
    assert.equal(restored.actor, "replica-A"); assert.equal(restored.profile.name, "Restored");
    assert.deepEqual(restored.captureState().engine.document, state.engine.document);
    assert.deepEqual(restored.captureState().engine.history, state.engine.history);
    const local = LocalClient.fromState(state, {schema, profile: {name: "Local"}});
    assert.equal(local.profile.name, "Local");
    [first, plain, restored, local].forEach(client => client.dispose());
});

test("one user can own separate replicas; remote presence includes optional profile fields", () => {
    const hub = new DocHub({schema});
    const profile: ActorProfile = {name: "Alice", color: "blue", avatar: "https://example.test/avatar.png", userId: "same-user", kind: "human", metadata: {team: "docs"}};
    const first = new Client({schema, actor: "tab-A", profile, transport: transport(hub)});
    const second = new SyncClient("tab-B", transport(hub), {schema, profile});
    first.connect(); second.connect();
    createEditorHost(first).setPresence({anchor: null, focus: null});
    const remote = second.others.get("tab-A")!;
    assert.equal(first.actor, "tab-A"); assert.equal(second.actor, "tab-B");
    assert.deepEqual(remote, {...profile, actor: "tab-A", anchor: null, focus: null});
    first.setPresence({name: "Legacy name", color: "red", anchor: null, focus: null});
    assert.equal(second.others.get("tab-A")?.name, "Legacy name");
    assert.equal(first.profile.name, "Alice");
    second.setPresence({anchor: null, focus: null});
    assert.equal([...first.presence()][0].actor, "tab-B");
    const legacy = new SyncClient("legacy", transport(hub), {schema});
    legacy.connect(); legacy.setPresence({name: "Old", color: "gray", anchor: null, focus: null});
    assert.equal(second.others.get("legacy")?.name, "Old");
    [first, second, legacy].forEach(client => client.dispose());
});

test("defaults are stable and invalid or excessive profile values fail before editing", () => {
    const first = new LocalClient({schema, actor: "replica-A"});
    const second = new LocalClient({schema, actor: "replica-A"});
    assert.equal(first.profile.name, first.actor); assert.equal(first.profile.color, second.profile.color);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    const invalid: unknown[] = [null, {name: " "}, {name: "x".repeat(257)}, {color: "x".repeat(129)}, {avatar: "x".repeat(2049)}, {userId: "x".repeat(257)}, {kind: "admin"}, {metadata: cyclic}, {metadata: {date: new Date()}}, {metadata: {bad: NaN}}, {metadata: {bad: undefined}}, {metadata: {large: "x".repeat(16385)}}, {metadata: {many: Array(1025).fill(0)}}];
    let deep: unknown = {}; for (let i = 0; i < 10; i++) deep = {child: deep}; invalid.push({metadata: deep});
    for (const profile of invalid) assert.throws(() => new LocalClient({schema, actor: "A", profile: profile as ActorProfile}), /profile/);
    first.dispose(); second.dispose();
});
