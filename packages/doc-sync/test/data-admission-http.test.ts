import {Client} from "../src/client/index.ts";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {appendFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {test} from "node:test";
import {createDataSchema} from "../src/data/index.ts";
import {createDataHub} from "../src/server/index.ts";
import {NodeHttpTransport} from "../src/sync/node-http-transport.ts";
import {PROTOCOL_VERSION} from "../src/sync/protocol.ts";
import type {Change, Envelope, ServerEvent} from "../src/sync/protocol.ts";

const output = new URL("../../../output/client-data-proof/", import.meta.url);
const root = {lamport: 0, actor: "~root"};
const uuid = () => `data:${crypto.randomUUID()}`;
async function waitFor(condition: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!condition()) { if (Date.now() > deadline) throw new Error("Guarded HTTP convergence timed out"); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function nodes(actor: string, definitions: Array<{type: string; attrs: Record<string, unknown>}>, seq = 1): Change {
    return {actor, seq, ops: definitions.flatMap((definition, index) => {
        const id = {actor, lamport: index * 2 + 1}, at = {actor, lamport: index * 2 + 2};
        return [{t: "node" as const, id, origin: root, ...definition}, {t: "move" as const, at, target: id, parent: root, after: null}];
    })};
}
async function network(journalName: string) {
    mkdirSync(output, {recursive: true});
    const journal = new URL(journalName, output); writeFileSync(journal, "");
    const hub = createDataHub({generation: "data-admission-http-generation"});
    const broadcasts: ServerEvent[] = [], attempts: unknown[] = [], peers: Client[] = [], failures: string[] = [];
    let appends = 0;
    hub.onAppend = envelope => { appends++; appendFileSync(journal, `${JSON.stringify(envelope)}\n`); };
    hub.listen(event => broadcasts.push(event));
    const headers: Array<{action: string; protocol: string; schema: string; epoch: string}> = [];
    const server = createServer(async (req, res) => {
        const reply = (status: number, body: unknown) => { res.writeHead(status, {"content-type": "application/json"}); res.end(JSON.stringify(body)); };
        try {
            const url = new URL(req.url!, "http://localhost"), action = url.pathname.split("/").at(-1)!;
            assert.equal(url.pathname, `/api/docs/data-admission/${action}`);
            if (req.method === "GET" && action === "stream") {
                assert.equal(url.searchParams.get("protocol"), String(PROTOCOL_VERSION)); assert.equal(url.searchParams.get("schemaVersion"), hub.schemaVersion);
                const since = Number(url.searchParams.get("since")), actor = url.searchParams.get("actor")!;
                const hello = hub.hello(since, url.searchParams.get("epoch") ?? undefined);
                res.writeHead(200, {"content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store"});
                const write = (event: ServerEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
                write(hello); if (hello.type === "hello" && !hello.snapshot) hub.since(since).forEach(envelope => write({type: "change", envelope}));
                hub.connect(actor, hub.serverSeq); const stop = hub.listen(write);
                req.on("close", () => { stop(); hub.disconnect(actor); hub.dropPresence(actor); }); return;
            }
            assert.equal(req.method, "POST");
            const protocol = String(req.headers["x-doc-sync-protocol"] ?? ""), schema = String(req.headers["x-doc-sync-schema"] ?? ""), epoch = String(req.headers["x-doc-sync-epoch"] ?? "");
            assert.equal(protocol, String(PROTOCOL_VERSION)); assert.equal(schema, hub.schemaVersion); assert.equal(epoch, hub.epoch); headers.push({action, protocol, schema, epoch});
            let text = ""; for await (const chunk of req) text += String(chunk); const body = JSON.parse(text);
            if (action === "changes") { const envelope = hub.submit(body); reply(200, {serverSeq: envelope?.serverSeq ?? null}); }
            else if (action === "conditional") reply(200, hub.submitConditional(body.change, body.base));
            else if (action === "recovery") reply(200, hub.submitRecovery(hub.generation!, body.reservationId, hub.schemaVersion, body.change));
            else if (action === "ack") { hub.ack(body); reply(200, {}); }
            else if (action === "presence") { hub.setPresence(body); reply(200, {}); }
            else if (action === "leave") { hub.leave(body.actor); reply(200, {}); }
            else reply(404, {});
        } catch (error) { failures.push(String(error)); reply(409, {error: String(error)}); }
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const post = async (action: string, body: unknown) => {
        const response = await fetch(`${origin}/api/docs/data-admission/${action}`, {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": hub.epoch, "x-doc-sync-schema": hub.schemaVersion!}, body: JSON.stringify(body)});
        const result = {status: response.status, body: await response.json()}; attempts.push({action, request: body, response: result}); return result;
    };
    const peer = (actor: string) => { const client = new Client({schema: createDataSchema(), actor, transport: new NodeHttpTransport("data-admission", actor, origin)}); peers.push(client); client.connect(); return client; };
    const settled = async (minimum: number) => { try { await waitFor(() => hub.serverSeq >= minimum && peers.every(peer => peer.synchronized && peer.sync?.serverSeq === hub.serverSeq)); } catch (error) { throw new Error(`${String(error)}; serverSeq=${hub.serverSeq}; failures=${JSON.stringify(failures)}`); } for (const peer of peers) assert.deepEqual(peer.model(), hub.doc.toJSON()); };
    const state = () => ({snapshot: hub.doc.snapshot(), seq: hub.serverSeq, log: hub.log, appends, broadcasts: broadcasts.filter(event => event.type === "change"), receipts: hub.recoveryReceiptState(), hello: hub.hello(0), journal: readFileSync(journal, "utf8"), peers: peers.map(peer => peer.model())});
    return {hub, post, peer, settled, state, journal, headers, attempts, async close() {
        writeFileSync(new URL(`${journalName}.requests.json`, output), JSON.stringify({attempts, failures, headers}, null, 2));
        writeFileSync(new URL(`${journalName}.receipt.json`, output), JSON.stringify({serverSeq: hub.serverSeq, appends, journalSha256: createHash("sha256").update(readFileSync(journal)).digest("hex"), headerRequests: headers.length}, null, 2));
        peers.forEach(peer => { peer.clearHistory(); peer.disconnect(); if (!peer.sync?.pending.length) peer.dispose(); }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }};
}

test("guarded Data HTTP rejects semantic attacks before append, broadcast, sequence and receipt; exact retry and journal reopen", {timeout: 20000}, async () => {
    const net = await network("attacks.jsonl"), observer = net.peer("observer");
    try {
        await net.settled(0);
        const cases: Array<{name: string; definitions: Array<{type: string; attrs: Record<string, unknown>}>}> = [];
        for (const type of ["map", "list", "entry"]) { const id = uuid(), attrs = type === "entry" ? {id, key: "duplicate", value: {scalar: 1}} : {id}; cases.push({name: `duplicate-${type}`, definitions: [{type, attrs}, {type, attrs}]}); }
        for (const [name, value] of Object.entries({scalar: {scalar: {}}, tag: {scalar: 1, extra: true}, kind: {reference: "$root", kind: "entry"}, missingReference: {reference: uuid(), kind: "map"}, referenceType: {reference: 2, kind: "map"}})) cases.push({name, definitions: [{type: "entry", attrs: {id: uuid(), key: name, value}}]});
        cases.push({name: "invalid-id", definitions: [{type: "map", attrs: {id: "not-a-data-uuid"}}]});
        cases.push({name: "invalid-key", definitions: [{type: "entry", attrs: {id: uuid(), key: 42, value: {scalar: 1}}}]});
        for (const [index, attack] of cases.entries()) {
            const actor = `attack-${index}`, bad = nodes(actor, [{type: "entry", attrs: {id: uuid(), key: `valid-prefix-${index}`, value: {scalar: 1}}}, ...attack.definitions]);
            const before = structuredClone(net.state()), response = await net.post("changes", bad);
            assert.equal(response.status, 409, attack.name); assert.deepEqual(net.state(), before, `${attack.name}: rejection must be atomic`);
            assert.deepEqual(net.hub.findChangeReceipt(net.hub.generation!, bad), {status: "unknown"});
            const fixed = nodes(actor, [{type: "entry", attrs: {id: uuid(), key: `fixed-${index}`, value: {scalar: index}}}]);
            assert.equal((await net.post("changes", fixed)).status, 200); await net.settled(index + 1); assert.equal(observer.data.root.get(`fixed-${index}`), index);
            const accepted = structuredClone(net.state()); assert.deepEqual(await net.post("changes", fixed), {status: 200, body: {serverSeq: null}}); assert.deepEqual(net.state(), accepted);
        }
        const unknown: Change = {actor: "unknown-target", seq: 1, ops: [{t: "set", at: {actor: "unknown-target", lamport: 1}, ids: [{actor: "absent", lamport: 900}], key: "value", value: {scalar: 1}}]};
        const beforeUnknown = structuredClone(net.state()); assert.equal((await net.post("changes", unknown)).status, 409); assert.deepEqual(net.state(), beforeUnknown);
        const fixed = nodes(unknown.actor, [{type: "entry", attrs: {id: uuid(), key: "fixed-unknown", value: {scalar: true}}}]); assert.equal((await net.post("changes", fixed)).status, 200); await net.settled(cases.length + 1);
        const reopen = createDataHub({generation: net.hub.generation});
        for (const line of readFileSync(net.journal, "utf8").trim().split("\n")) { const envelope = JSON.parse(line) as Envelope; assert.ok(envelope.change); reopen.submit(envelope.change); }
        assert.deepEqual(reopen.doc.snapshot(), net.hub.doc.snapshot()); assert.equal(reopen.serverSeq, net.hub.serverSeq); assert.equal(reopen.submit(fixed), null);
        assert.ok(net.headers.some(header => header.action === "changes"));
    } finally { await net.close(); }
});

test("guarded Data HTTP keeps three actor map/list edits, selective history and offline pending", {timeout: 20000}, async () => {
    const net = await network("collaboration.jsonl"), a = net.peer("A"), b = net.peer("B"), c = net.peer("C");
    try {
        await net.settled(0); const listA = a.data.createList(), mapA = a.data.createMap(); a.data.root.set("list", listA); a.data.root.set("map", mapA); const first = listA.push("first"); await net.settled(5);
        const listB = b.data.getList(listA.id)!, listC = c.data.getList(listA.id)!, mapB = b.data.getMap(mapA.id)!;
        a.disconnect(); b.disconnect(); c.disconnect(); const x = listA.insert(0, "A"), y = listB.insert(0, "B"); listC.push("C"); mapA.set("same", "A"); mapB.set("same", "B"); a.connect(); b.connect(); c.connect(); await net.settled(10);
        assert.deepEqual(listA.entries(), listB.entries()); assert.deepEqual(listA.entries(), listC.entries()); assert.ok(["A", "B"].includes(mapA.get("same") as string));
        a.clearHistory(); listA.move(first, 0); listB.set(y, "peer edit"); await net.settled(12); const moved = listA.entries(); a.undo(); await net.settled(13); assert.equal(listA.get(y), "peer edit"); assert.equal(listA.get(x), "A"); a.redo(); await net.settled(14); assert.deepEqual(listA.entries(), moved);
        a.disconnect(); a.data.root.set("queued", "offline"); const pending = structuredClone(a.sync!.pending); assert.equal(pending.length, 1); b.data.root.set("online", true); await waitFor(() => net.hub.serverSeq === 15 && b.synchronized && c.synchronized); assert.deepEqual(a.sync!.pending, pending); assert.equal(c.data.root.has("queued"), false); a.connect(); await net.settled(16); assert.equal(a.sync!.pending.length, 0); assert.equal(c.data.root.get("queued"), "offline");
    } finally { await net.close(); }
});

test("guarded Data HTTP conditional and recovery submissions share semantic admission", {timeout: 15000}, async () => {
    const net = await network("conditional-recovery.jsonl"), observer = net.peer("observer");
    try {
        await net.settled(0);
        for (const action of ["conditional", "recovery"]) {
            const actor = `${action}-actor`, id = uuid();
            const bad = nodes(actor, [{type: "entry", attrs: {id: uuid(), key: "valid-prefix", value: {scalar: true}}}, {type: "entry", attrs: {id, key: "bad", value: {reference: "$root", kind: "list"}}}]);
            const base = {epoch: net.hub.epoch, serverSeq: net.hub.serverSeq, schemaVersion: net.hub.schemaVersion};
            const reservationId = `reservation-${actor}`;
            if (action === "recovery") { net.hub.onRecoveryPin = () => {}; assert.equal(net.hub.reserveRecovery(net.hub.generation!, actor, reservationId, null).status, "protected"); }
            const before = structuredClone(net.state());
            assert.equal((await net.post(action, {change: bad, base, reservationId})).status, 409); assert.deepEqual(net.state(), before);
            assert.deepEqual(net.hub.findChangeReceipt(net.hub.generation!, bad), {status: "unknown"});
            assert.deepEqual(net.hub.findConditionalReceipt(net.hub.generation!, base, bad), {status: "unknown"});
            const fixed = nodes(actor, [{type: "entry", attrs: {id, key: action, value: {scalar: true}}}]);
            assert.equal((await net.post(action, {change: fixed, base, reservationId})).status, 200); await net.settled(base.serverSeq + 1); assert.equal(observer.data.root.get(action), true);
            const accepted = structuredClone(net.state()); assert.equal((await net.post(action, {change: fixed, base, reservationId})).status, 200); assert.deepEqual(net.state(), accepted);
        }
    } finally { await net.close(); }
});
