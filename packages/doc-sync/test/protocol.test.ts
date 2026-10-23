import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {DocHub} from "../src/server/hub.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "../src/sync/protocol.ts";
import type {Outbound, ServerEvent, Transport} from "../src/sync/protocol.ts";
import {MemoryNet} from "./harness.ts";
import {InputSession, subscribeClient} from "../src/editor/index.ts";
import {HttpTransport} from "../src/sync/http-transport.ts";
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {request} from "node:http";

function setup(synchronous?: ServerEvent) {
    let receive!: (event: ServerEvent) => void;
    const sent: Outbound[] = [];
    let stopped = 0;
    const transport: Transport = {
        subscribe: (_since, handler) => { receive = handler; if (synchronous) { const event = synchronous; synchronous = undefined; handler(event); } return () => { stopped += 1; }; },
        send: async message => { sent.push(message); },
        sendPresence: () => undefined,
    };
    const client = new SyncClient("A", transport, {schema: DEMO_SCHEMA});
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "offline"}]).ops);
    return {client, sent, receive: (event: ServerEvent) => receive(event), stopped: () => stopped};
}

const hello = () => new DocHub({schema: DEMO_SCHEMA}).hello(0);

test("protocol handshake holds offline edits until all required capabilities are accepted", async () => {
    const c = setup();
    c.client.connect();
    await Promise.resolve();
    assert.equal(c.sent.length, 0);
    const event = hello();
    assert.equal(event.type, "hello");
    if (event.type !== "hello") throw new Error("hello expected");
    assert.equal(event.protocol, PROTOCOL_VERSION);
    assert.deepEqual(event.capabilities, DOCUMENT_CAPABILITIES);
    c.receive(event);
    await Promise.resolve();
    assert.ok(c.sent.some(message => message.kind === "change"));
    assert.equal(c.client.connectionError, null);
    c.client.disconnect();
});

for (const mode of ["legacy", "future", "missing-capability"] as const) {
    test(`protocol rejects ${mode} before sending and preserves local edits for retry`, async () => {
        const event = hello();
        if (event.type !== "hello") throw new Error("hello expected");
        if (mode === "legacy") delete event.protocol;
        if (mode === "future") event.protocol = PROTOCOL_VERSION + 1;
        if (mode === "missing-capability") event.capabilities = DOCUMENT_CAPABILITIES.slice(1);
        const c = setup(event);
        const before = c.client.doc.toJSON();
        c.client.connect();
        await Promise.resolve();
        assert.equal(c.client.online, false);
        assert.match(c.client.connectionError!.message, /Incompatible/);
        assert.equal(c.stopped(), 1, "synchronous rejection unsubscribes the transport");
        assert.equal(c.sent.length, 0);
        assert.equal(c.client.pending.length, 1);
        assert.deepEqual(c.client.doc.toJSON(), before);
        c.client.connect();
        c.receive(hello());
        await Promise.resolve();
        assert.equal(c.client.connectionError, null);
        assert.ok(c.sent.some(message => message.kind === "change"));
        c.client.disconnect();
    });
}

for (const malformed of [undefined, "placement-v1,fields-v1,annotations-v1,cardinality-v1", [...DOCUMENT_CAPABILITIES, 1], null]) {
    test(`protocol rejects malformed capabilities ${JSON.stringify(malformed)} without sending pending edits`, async () => {
        const event = hello();
        if (event.type !== "hello") throw new Error("hello expected");
        event.capabilities = malformed as unknown as string[];
        const c = setup(event), before = c.client.doc.toJSON();
        c.client.connect(); await Promise.resolve();
        assert.equal(c.client.online, false);
        assert.match(c.client.connectionError!.message, /Incompatible/);
        assert.equal(c.stopped(), 1);
        assert.deepEqual(c.client.doc.toJSON(), before);
        assert.equal(c.client.pending.length, 1);
        assert.equal(c.sent.length, 0);
    });
}

test("protocol requires an epoch before accepting hello", () => {
    const event = hello();
    if (event.type !== "hello") throw new Error("hello expected");
    delete event.epoch;
    const c = setup(event);
    c.client.connect();
    assert.equal(c.client.online, false);
    assert.match(c.client.connectionError!.message, /epoch/);
    assert.equal(c.client.pending.length, 1);
    assert.equal(c.sent.length, 0);
});

test("synchronous rejection and reentrant retry retain only the current subscription", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA}), stopped: number[] = [], handlers: Array<(event: ServerEvent) => void> = [];
    let subscriptions = 0, retried = false;
    const client = new SyncClient("reentrant", {
        subscribe: (_since, handler) => {
            const id = ++subscriptions;
            handlers.push(handler);
            const event = hub.hello(0);
            if (event.type !== "hello") throw new Error("hello expected");
            if (id === 1) delete event.protocol;
            handler(event);
            return () => { stopped.push(id); };
        },
        send: async () => undefined, sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});
    client.onUpdate = () => { if (client.connectionError && !retried) { retried = true; client.connect(); } };
    client.connect();
    assert.equal(subscriptions, 2);
    assert.equal(client.online, true);
    assert.deepEqual(stopped, [1]);
    handlers[0]({type: "reset", epoch: "stale"});
    assert.equal(client.epoch, hub.epoch);
    client.disconnect();
    assert.deepEqual(stopped, [1, 2]);
    handlers[1]({type: "reset", epoch: "disposed"});
    assert.equal(client.epoch, hub.epoch);
});

test("synchronous subscribe failure preserves pending edits and permits retry", async () => {
    let attempts = 0;
    const sent: Outbound[] = [];
    const client = new SyncClient("retry", {
        subscribe: (_since, handler) => {
            if (++attempts === 1) throw new Error("transport unavailable");
            handler(hello()); return () => undefined;
        },
        send: async message => { sent.push(message); }, sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "offline"}]).ops);
    const before = client.doc.toJSON(), pending = [...client.pending];
    client.connect();
    assert.equal(client.online, false);
    assert.match(client.connectionError!.message, /transport unavailable/);
    assert.deepEqual(client.pending, pending);
    assert.deepEqual(client.doc.toJSON(), before);
    client.connect(); await Promise.resolve();
    assert.equal(attempts, 2);
    assert.equal(client.connectionError, null);
    assert.ok(sent.some(message => message.kind === "change"));
    client.disconnect();
});

test("missed reset with equal sequence numbers pulls the new epoch and clears old history", async () => {
    const net = new MemoryNet(), a = net.add("epoch-a"), b = net.add("epoch-b");
    a.connect(); b.connect(); await net.settle();
    try {
        a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "old"}]).ops); await net.settle();
        const previous = a.epoch;
        a.disconnect(); net.hub.reset(); await net.settle();
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "new"}]).ops); await net.settle();
        assert.equal(a.serverSeq, net.hub.serverSeq);
        const events: string[] = [];
        a.onEvent = event => events.push(event.type);
        a.connect(); await net.settle();
        assert.notEqual(a.epoch, previous);
        assert.equal(a.epoch, net.hub.epoch);
        assert.deepEqual(events.slice(0, 2), ["reset", "hello"]);
        assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
        assert.equal(a.undo(), null);
        a.commit(a.doc.edit([{op: "insert", at: [0, 3], content: "!"}]).ops); await net.settle();
        assert.equal(a.pending.length, 0);
        assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
        assert.equal(net.hub.log.at(-1)!.change?.seq, 1);
    } finally { a.disconnect(); b.disconnect(); }
});

test("missed reset with unconfirmed edits blocks reconnect and preserves the local document", async () => {
    const net = new MemoryNet(), a = net.add("pending-a"), b = net.add("pending-b");
    a.connect(); b.connect(); await net.settle();
    try {
        a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "old"}]).ops); await net.settle();
        a.disconnect();
        a.commit(a.doc.edit([{op: "insert", at: [0, 3], content: " pending"}]).ops);
        const doc = a.doc, before = doc.toJSON(), pending = [...a.pending], epoch = a.epoch, history = a.history;
        net.hub.reset(); await net.settle();
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "new"}]).ops); await net.settle();
        a.connect(); await net.settle();
        assert.equal(a.online, false);
        assert.match(a.connectionError!.message, /epoch changed with unconfirmed edits/);
        assert.equal(a.doc, doc);
        assert.equal(a.history, history);
        assert.equal(a.epoch, epoch);
        assert.deepEqual(a.doc.toJSON(), before);
        assert.deepEqual(a.pending, pending);
        assert.deepEqual(net.hub.doc.toJSON().children![0].runs, [{text: "new", marks: {}}]);
    } finally { a.disconnect(); b.disconnect(); }
});

test("hub restart changes epoch and clean clients resume their accepted actor sequence", async () => {
    let hub = new DocHub({schema: DEMO_SCHEMA});
    const client = new SyncClient("restarted", {
        subscribe: (since, handler, epoch) => {
            const event = hub.hello(since, epoch); handler(event);
            if (event.type === "hello" && !event.snapshot) hub.since(since).forEach(envelope => handler({type: "change", envelope}));
            return hub.listen(handler);
        },
        send: async message => { if (message.kind === "change") hub.submit(message.change); }, sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});
    client.connect();
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "same"}]).ops); await Promise.resolve();
    client.disconnect();
    const saved = [...hub.log], previous = hub.epoch;
    hub = new DocHub({schema: DEMO_SCHEMA});
    saved.forEach(envelope => envelope.change && hub.submit(envelope.change));
    assert.notEqual(hub.epoch, previous);
    client.connect();
    client.commit(client.doc.edit([{op: "insert", at: [0, 4], content: "!"}]).ops); await Promise.resolve(); await Promise.resolve();
    assert.equal(hub.log.at(-1)!.change?.seq, 2);
    assert.equal(client.pending.length, 0);
    assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
    client.disconnect();
});

test("clean epoch replacement cancels an uncommitted native composition through reset hooks", async () => {
    const net = new MemoryNet(), a = net.add("draft-a"), b = net.add("draft-b");
    a.connect(); b.connect(); await net.settle();
    const session = new InputSession(a);
    let resets = 0;
    const stop = subscribeClient(a, {beforeEvent: event => { if (event.type === "reset") { resets++; session.cancel(); } }});
    try {
        a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "old"}]).ops); await net.settle();
        a.disconnect(); session.begin();
        session.commit(session.doc.edit([{op: "insert", at: [0, 3], content: " draft"}]).ops);
        assert.equal(a.pending.length, 0);
        net.hub.reset(); await net.settle();
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "new"}]).ops); await net.settle();
        a.connect(); await net.settle();
        assert.equal(resets, 1);
        assert.equal(session.active, false);
        assert.deepEqual(session.end(), []);
        assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
        assert.equal(a.pending.length, 0);
    } finally { stop(); session.cancel(); a.disconnect(); b.disconnect(); }
});

test("HTTP transport sends generation headers and ignores stale stream callbacks", async () => {
    const eventSource = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
    const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const originalFetch = globalThis.fetch;
    class Source {
        static instances: Source[] = [];
        onmessage: ((message: {data: string}) => void) | null = null;
        closed = false;
        readonly url: string;
        constructor(url: string) { this.url = url; Source.instances.push(this); }
        close() { this.closed = true; }
    }
    const requests: Array<{url: string; headers: Headers}> = [], beacons: string[] = [];
    Object.defineProperty(globalThis, "EventSource", {configurable: true, value: Source});
    Object.defineProperty(globalThis, "navigator", {configurable: true, value: {sendBeacon: (url: string) => { beacons.push(url); return true; }}});
    globalThis.fetch = async (url, options) => { requests.push({url: String(url), headers: new Headers(options?.headers)}); return new Response("{}"); };
    try {
        const transport = new HttpTransport("example", "http-actor", "http://example.test");
        const received: ServerEvent[] = [];
        const stopOld = transport.subscribe(7, event => received.push(event), "old generation");
        const old = Source.instances[0], stale = old.onmessage!;
        assert.equal(new URL(old.url).searchParams.get("epoch"), "old generation");
        const stop = transport.subscribe(0, event => received.push(event));
        const current = Source.instances[1];
        const event = hello();
        if (event.type !== "hello") throw new Error("hello expected");
        current.onmessage!({data: JSON.stringify(event)});
        stale({data: JSON.stringify({type: "reset", epoch: "stale"})});
        await transport.send({kind: "ack", ack: {actor: "http-actor", serverSeq: 0, pin: null}});
        const first = requests[0].headers;
        assert.equal(first.get("x-doc-sync-epoch"), event.epoch);
        current.onmessage!({data: JSON.stringify({type: "reset", epoch: "new generation"})});
        transport.sendPresence({actor: "http-actor", name: "A", color: "blue", anchor: null, focus: null});
        transport.leave();
        assert.equal(requests[1].headers.get("x-doc-sync-epoch"), "new generation");
        assert.equal(first.get("x-doc-sync-epoch"), event.epoch, "already dispatched requests keep their original epoch");
        assert.equal(new URL(beacons[0]).searchParams.get("epoch"), "new generation");
        assert.deepEqual(received.map(value => value.type), ["hello", "reset"]);
        stopOld(); stop();
        stale({data: JSON.stringify({type: "reset", epoch: "disposed"})});
        assert.ok(Source.instances.every(source => source.closed));
        assert.equal(received.length, 2);
    } finally {
        globalThis.fetch = originalFetch;
        if (eventSource) Object.defineProperty(globalThis, "EventSource", eventSource); else Reflect.deleteProperty(globalThis, "EventSource");
        if (navigator) Object.defineProperty(globalThis, "navigator", navigator); else Reflect.deleteProperty(globalThis, "navigator");
    }
});

test("demo HTTP rejects old-generation changes, acknowledgements, presence, and leave after reset", {timeout: 15_000}, async () => {
    const data = mkdtempSync(join(tmpdir(), "doc-sync-epoch-"));
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../../apps/demo/server.ts", import.meta.url))], {
        env: {...process.env, PORT: "0", DATA_DIR: data}, stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    try {
        const origin = await new Promise<string>((resolve, reject) => {
            let output = "";
            const timer = setTimeout(() => reject(new Error("demo server did not start")), 8_000);
            child.stdout.on("data", chunk => {
                output += String(chunk);
                const match = output.match(/http:\/\/localhost:\d+/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            });
            child.once("error", error => { clearTimeout(timer); reject(error); });
            child.once("exit", () => { clearTimeout(timer); reject(new Error("demo server exited before startup")); });
        });
        const base = `${origin}/api/docs/epoch-test`;
        const before = await (await fetch(`${base}/state`)).json() as {epoch: string};
        const inflightBody = JSON.stringify({actor: "inflight", seq: 1, ops: []});
        let finish!: () => void;
        const inflight = new Promise<number | undefined>((resolve, reject) => {
            const req = request(`${base}/changes`, {
                method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": before.epoch},
            }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); });
            req.once("error", reject);
            req.write(inflightBody.slice(0, 1));
            finish = () => req.end(inflightBody.slice(1));
        });
        await fetch(`${base}/reset`, {method: "POST"});
        finish();
        assert.equal(await inflight, 409, "an old request that finishes after reset must not enter the new generation");
        const after = await (await fetch(`${base}/state`)).json() as {epoch: string};
        assert.notEqual(after.epoch, before.epoch);
        const node = new SyncClient("old-request", {subscribe: () => () => undefined, send: async () => undefined, sendPresence: () => undefined}, {schema: DEMO_SCHEMA});
        node.commit(node.doc.edit([{op: "insert", at: [0, 0], content: "stale"}]).ops);
        const bodies = {changes: node.pending[0], ack: {actor: node.actor, serverSeq: 99, pin: null}, presence: {actor: node.actor, name: "stale", color: "red", anchor: null, focus: null}, leave: {actor: node.actor}};
        for (const [action, body] of Object.entries(bodies)) {
            const response = await fetch(`${base}/${action}${action === "leave" ? `?epoch=${encodeURIComponent(before.epoch)}` : ""}`, {
                method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": before.epoch}, body: JSON.stringify(body),
            });
            assert.equal(response.status, 409, action);
        }
        const untouched = await (await fetch(`${base}/state`)).json() as {serverSeq: number; peers: unknown[]};
        assert.equal(untouched.serverSeq, 0);
        assert.deepEqual(untouched.peers, []);
        const accepted = await fetch(`${base}/changes`, {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": after.epoch}, body: JSON.stringify(node.pending[0])});
        assert.equal(accepted.status, 200);
        const current = await (await fetch(`${base}/state`)).json() as {serverSeq: number};
        assert.equal(current.serverSeq, 1);
    } finally { child.kill(); await exited; rmSync(data, {recursive: true, force: true}); }
});
