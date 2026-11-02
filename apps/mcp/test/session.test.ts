import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Doc} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";
import {DocHub} from "@barocss/doc-sync/server";
import type {Change, Outbound, Presence, ServerEvent, Transport} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {DocumentSession} from "../src/session.ts";
import {IntentJournal} from "../src/journal.ts";

class HubTransport implements Transport {
    readonly hub: DocHub;
    readonly actor: string;
    dropEcho = false;
    dropRemote = false;
    loseResponse = false;
    private callback: ((event: ServerEvent) => void) | null = null;
    constructor(hub: DocHub, actor: string) { this.hub = hub; this.actor = actor; }
    subscribe(since: number, onEvent: (event: ServerEvent) => void, epoch?: string): () => void {
        this.callback = onEvent;
        this.hub.connect(this.actor, since);
        const stop = this.hub.listen(event => {
            if (this.dropEcho && event.type === "change" && event.envelope.change?.actor === this.actor) return;
            if (this.dropRemote && event.type === "change" && event.envelope.change?.actor !== this.actor) return;
            onEvent(event);
        });
        onEvent(this.hub.hello(since, epoch));
        return stop;
    }
    async send(message: Outbound): Promise<void> {
        if (message.kind === "change") this.hub.submit(message.change);
        else this.hub.ack(message.ack);
    }
    sendPresence(presence: Presence): void { this.hub.setPresence(presence); }
    async getSchema() { return {schemaVersion: this.hub.schemaVersion, schema: this.hub.getSchema()}; }
    async getRecoveryState() { return {generation: this.hub.generation, epoch: this.hub.epoch, serverSeq: this.hub.serverSeq, schemaVersion: this.hub.schemaVersion}; }
    async transitionSchema(base: {epoch: string; serverSeq: number; schemaVersion: string}, schema: Schema) {
        return {schemaVersion: this.hub.transitionSchema(schema, base)};
    }
    async submitConditional(base: {epoch: string; serverSeq: number}, change: Change) {
        if (base.epoch !== this.hub.epoch) return {status: "rejected" as const, code: "epoch", error: "Epoch changed"};
        const prior = this.hub.log.find(entry => entry.change?.actor === change.actor && entry.change.seq === change.seq);
        if (prior) {
            if (JSON.stringify(prior.change) !== JSON.stringify(change)) return {status: "rejected" as const, code: "conflict", error: "Sequence reused"};
            return {status: "accepted" as const, serverSeq: prior.serverSeq};
        }
        if (base.serverSeq !== this.hub.serverSeq) return {status: "rejected" as const, code: "stale", error: "Revision changed"};
        const envelope = this.hub.submit(change)!;
        if (this.loseResponse) { this.loseResponse = false; throw new Error("response lost"); }
        return {status: "accepted" as const, serverSeq: envelope.serverSeq};
    }
    deliverOwnEcho(): void {
        for (const envelope of this.hub.since(0)) if (envelope.change?.actor === this.actor) this.callback?.({type: "change", envelope});
    }
}

test('a failed mission evidence write prevents the conditional request from being sent', {skip:(process.platform!=='darwin' && process.platform!=='linux')},async()=>{
    const directory=await mkdtemp(join(tmpdir(),'doc-sync-step-write-failure-'));
    const journal=await IntentJournal.open(join(directory,'doc.json'),{document:'doc',actor:'ai'});
    const hub=new DocHub({schema:DEMO_SCHEMA,generation:crypto.randomUUID()}),transport=new HubTransport(hub,'ai');
    const session=new DocumentSession('ai',transport,DEMO_SCHEMA,100,journal,async()=>{throw Error('evidence write failed');});
    try {
        await session.start();const before=await session.read();assert.ok(before.revision);
        await assert.rejects(session.edit(before.revision,[{op:'insert',at:[0,0],content:'X'}],'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/not_sent/);
        assert.equal(hub.serverSeq,0);assert.equal(await journal.read(),null);
    } finally {await session.close();await rm(directory,{recursive:true,force:true});}
});

test("a definitive stale rejection retires its journal and permits a fresh edit", {skip: (process.platform !== "darwin" && process.platform !== "linux")}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-stale-journal-"));
    const journal = await IntentJournal.open(join(directory, "doc.json"), {document: "doc", actor: "ai"});
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    const transport = new HubTransport(hub, "ai"), session = new DocumentSession("ai", transport, DEMO_SCHEMA, 100, journal);
    try {
        await session.start();
        const before = await session.read(); assert.ok(before.revision);
        transport.dropRemote = true;
        const human = new Doc("human", DEMO_SCHEMA);
        hub.submit({actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "human"}]).ops});
        await assert.rejects(session.edit(before.revision, [{op: "insert", at: [0, 0], content: "stale"}]), /rejected \(stale\)/);
        assert.equal(await journal.read(), null);
        assert.equal(session.recoveryRequired, false);
        transport.dropRemote = false;
        session.client.disconnect(); session.client.connect();
        const fresh = await session.read(); assert.ok(fresh.revision);
        assert.equal((await session.edit(fresh.revision, [{op: "insert", at: [0, 0], content: "AI"}])).status, "confirmed");
        assert.equal(await journal.read(), null);
        assert.match(JSON.stringify(hub.doc.toJSON()), /human/);
    } finally { await session.close(); await rm(directory, {recursive: true, force: true}); }
});

test("pre-send journal failure is not_sent and does not leave a conditional lock", {skip: (process.platform !== "darwin" && process.platform !== "linux")}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-not-sent-"));
    const journal = await IntentJournal.open(join(directory, "doc.json"), {document: "doc", actor: "ai"});
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    const session = new DocumentSession("ai", new HubTransport(hub, "ai"), DEMO_SCHEMA, 100, journal);
    const prepare = journal.prepare.bind(journal);
    try {
        await session.start();
        const {revision} = await session.read(); assert.ok(revision);
        journal.prepare = async () => { throw new Error("disk unavailable"); };
        await assert.rejects(session.edit(revision, [{op: "insert", at: [0, 0], content: "not sent"}]), /rejected \(not_sent\)/);
        assert.equal(session.client.conditionalPending, false);
        assert.equal(session.recoveryRequired, false);
        assert.equal(hub.serverSeq, 0);
        assert.equal(await journal.read(), null);
        journal.prepare = prepare;
        assert.equal((await session.edit(revision, [{op: "insert", at: [0, 0], content: "sent"}])).status, "confirmed");
    } finally { await session.close(); await rm(directory, {recursive: true, force: true}); }
});

test("a journal failure after a lost response keeps the original request unconfirmed", {skip: (process.platform !== "darwin" && process.platform !== "linux")}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-unknown-retry-"));
    const journal = await IntentJournal.open(join(directory, "doc.json"), {document: "doc", actor: "ai"});
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    const transport = new HubTransport(hub, "ai"), session = new DocumentSession("ai", transport, DEMO_SCHEMA, 100, journal);
    const prepare = journal.prepare.bind(journal);
    try {
        await session.start();
        const {revision} = await session.read(); assert.ok(revision);
        transport.loseResponse = true;
        assert.equal((await session.edit(revision, [{op: "insert", at: [0, 0], content: "maybe"}])).status, "unconfirmed");
        const record = await journal.read(); assert.ok(record);
        journal.prepare = async () => { throw new Error("retry disk unavailable"); };
        assert.equal((await session.retryEdit()).status, "unconfirmed");
        assert.equal(session.client.conditionalPending, true);
        assert.deepEqual(await journal.read(), record);
        journal.prepare = prepare;
        assert.equal((await session.retryEdit()).status, "confirmed");
        assert.equal(await journal.read(), null);
    } finally { await session.close(); await rm(directory, {recursive: true, force: true}); }
});

test("an uncertain journal cleanup keeps a confirmed edit and blocks a new one", {skip: (process.platform !== "darwin" && process.platform !== "linux")}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-cleanup-unknown-"));
    const journal = await IntentJournal.open(join(directory, "doc.json"), {document: "doc", actor: "ai"});
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    const session = new DocumentSession("ai", new HubTransport(hub, "ai"), DEMO_SCHEMA, 100, journal);
    const clear = journal.clearAfterConfirmed.bind(journal);
    try {
        await session.start();
        const {revision} = await session.read(); assert.ok(revision);
        journal.clearAfterConfirmed = async digest => { await clear(digest); throw new Error("directory sync outcome unknown"); };
        const result = await session.edit(revision, [{op: "insert", at: [0, 0], content: "saved"}]);
        assert.equal(result.status, "confirmed");
        assert.match(JSON.stringify(result), /cleanup outcome is unknown/);
        assert.equal(await journal.read(), null);
        assert.equal(session.recoveryRequired, true);
        assert.match(JSON.stringify(hub.doc.toJSON()), /saved/);
        const status = await session.recoveryStatus();
        assert.equal(status.status, "recovery_required");
        const view = await session.read(); assert.ok(view.revision);
        await assert.rejects(session.edit(view.revision, [{op: "insert", at: [0, 0], content: "duplicate"}]), /cleanup or recovery is unresolved/);
        assert.equal(hub.serverSeq, 1);
    } finally { await session.close(); await rm(directory, {recursive: true, force: true}); }
});

test("lost echo reports unconfirmed, blocks another edit, and late echo restores the session", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = new HubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 60);
    await session.start();
    try {
        const {revision} = await session.read();
        assert.ok(revision);
        transport.dropEcho = true;
        const result = await session.edit(revision, [{op: "insert", at: [0, 0], content: "saved"}]);
        assert.equal(result.status, "unconfirmed");
        assert.equal(result.pending, 1);
        assert.match(JSON.stringify(hub.doc.toJSON()), /saved/);
        await assert.rejects(session.edit(revision, [{op: "insert", at: [0, 0], content: "duplicate"}]), /unconfirmed/);
        transport.deliverOwnEcho();
        assert.equal((await session.read()).pending, 0);
        assert.equal((await session.history("undo")).status, "unconfirmed");
    } finally { await session.close(); }
});

test("epoch change after lost response keeps the request and local state for inspection", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = new HubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 60);
    await session.start();
    try {
        const {revision} = await session.read(); assert.ok(revision);
        transport.loseResponse = true;
        assert.equal((await session.edit(revision, [{op: "insert", at: [0, 0], content: "maybe"}])).status, "unconfirmed");
        const original = session.client.conditionalRequest;
        hub.epoch = crypto.randomUUID();
        const retried = await session.retryEdit();
        assert.equal(retried.status, "unconfirmed");
        assert.deepEqual(session.client.conditionalRequest, original);
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /maybe/);
        assert.equal(session.client.history.canUndo, false);
        assert.throws(() => session.client.doc.edit([{op: "insert", at: [0, 0], content: "other"}]), /unresolved/);
    } finally { await session.close(); }
});

test("MCP session transitions a compatible schema and preserves actor undo history", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = new HubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 100);
    await session.start();
    try {
        const initial = await session.read(); assert.ok(initial.revision);
        assert.equal((await session.edit(initial.revision, [{op: "insert", at: [0, 0], content: "keep"}])).status, "confirmed");
        const current = await session.read(); assert.ok(current.revision);
        const server = await session.serverSchema(); assert.ok(server.schemaVersion);
        const next = {...DEMO_SCHEMA, marks: [...DEMO_SCHEMA.marks, "highlight"]};
        const result = await session.transitionSchema({...current.revision, schemaVersion: server.schemaVersion}, next);
        assert.equal(result.status, "connected");
        assert.equal((await session.serverSchema()).schemaVersion, result.schemaVersion);
        const updated = await session.read(); assert.ok(updated.revision);
        assert.equal(updated.revision.serverSeq, current.revision.serverSeq);
        assert.notEqual(updated.revision.schemaVersion, current.revision.schemaVersion);
        await assert.rejects(session.edit(current.revision, [{op: "insert", at: [0, 0], content: "stale"}]), /schema changed/);
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /stale/);
        assert.match(JSON.stringify((await session.read()).document), /keep/);
        assert.equal((await session.history("undo")).status, "confirmed");
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /keep/);
    } finally { await session.close(); }
});

test("MCP upgrade adopts server schema while preserving and sending offline pending edits", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const session = new DocumentSession("ai", new HubTransport(hub, "ai"), DEMO_SCHEMA, 100);
    await session.start();
    try {
        session.client.disconnect();
        assert.equal(session.client.schemaVerified, false);
        session.client.commit(session.client.doc.edit([{op: "insert", at: [0, 0], content: "offline"}]).ops);
        assert.equal(session.client.pending.length, 1);
        const next = {...DEMO_SCHEMA, marks: [...DEMO_SCHEMA.marks, "highlight"]};
        assert.ok(hub.schemaVersion);
        hub.transitionSchema(next, {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion});
        assert.deepEqual((await session.serverSchema()).schema, next);
        assert.equal((await session.upgradeSchema()).status, "connected");
        assert.equal(session.client.pending.length, 0);
        assert.match(JSON.stringify(hub.doc.toJSON()), /offline/);
        assert.equal((await session.history("undo")).status, "confirmed");
        assert.doesNotMatch(JSON.stringify(hub.doc.toJSON()), /offline/);
    } finally { await session.close(); }
});

test("accepted conditional edit survives throwing notification callbacks and remains undoable", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const session = new DocumentSession("ai", new HubTransport(hub, "ai"), DEMO_SCHEMA, 100);
    await session.start();
    try {
        const {revision} = await session.read(); assert.ok(revision);
        const reported: string[] = [];
        let editsSeen = 0;
        session.client.onNotificationError = (_error, callback) => { reported.push(callback); };
        session.client.onLocalEdits = edits => { editsSeen += edits.length; throw new Error("local listener failed"); };
        session.client.onEvent = () => { throw new Error("event listener failed"); };
        session.client.onUpdate = () => { throw new Error("update listener failed"); };
        const outcome = await session.edit(revision, [{op: "insert", at: [0, 0], content: "saved"}]);
        assert.equal(outcome.status, "confirmed");
        assert.equal(editsSeen, 1);
        assert.ok(reported.includes("onLocalEdits"));
        assert.ok(reported.includes("onEvent"));
        assert.ok(reported.includes("onUpdate"));
        assert.match(JSON.stringify(session.client.notificationErrors), /local listener failed/);
        assert.equal(session.client.pending.length, 0);
        assert.equal(session.client.conditionalPending, false);
        assert.equal(session.client.history.canUndo, true);
        assert.match(JSON.stringify(hub.doc.toJSON()), /saved/);
        assert.deepEqual(session.client.doc.toJSON(), hub.doc.toJSON());
        session.client.onLocalEdits = null;
        session.client.onEvent = null;
        session.client.onUpdate = null;
        assert.equal((await session.history("undo")).status, "confirmed");
        assert.doesNotMatch(JSON.stringify(hub.doc.toJSON()), /saved/);
    } finally {
        session.client.onUpdate = null;
        await session.close();
    }
});

test("conditional edit checks a caller guard before submission, not after server acceptance", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const session = new DocumentSession("guarded", new HubTransport(hub, "guarded"), DEMO_SCHEMA, 100);
    await session.start();
    try {
        const {revision} = await session.read(); assert.ok(revision);
        let calls = 0;
        session.client.doc.editGuard = () => { if (++calls > 1) throw new Error("guard changed"); };
        const result = await session.edit(revision, [{op: "insert", at: [0, 0], content: "saved"}]);
        assert.equal(result.status, "confirmed");
        assert.equal(calls, 1);
        assert.equal(session.client.conditionalPending, false);
        assert.match(JSON.stringify(hub.doc.toJSON()), /saved/);
        session.client.doc.editGuard = null;
        assert.equal((await session.history("undo")).status, "confirmed");
        assert.doesNotMatch(JSON.stringify(hub.doc.toJSON()), /saved/);
    } finally { await session.close(); }
});

test("server rejects a stale local view without changing local document, sequence or history", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = new HubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 60);
    await session.start();
    try {
        const {revision} = await session.read(); assert.ok(revision);
        transport.dropRemote = true;
        const human = Doc.fromSnapshot("human", hub.doc.snapshot(), DEMO_SCHEMA);
        const humanOps = human.edit([{op: "insert", at: [0, 0], content: "human"}]).ops;
        hub.submit({actor: "human", seq: 1, ops: humanOps});
        await assert.rejects(session.edit(revision, [{op: "insert", at: [0, 0], content: "ai"}]), /rejected \(stale\)/);
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /ai/);
        assert.equal(session.client.history.canUndo, false);
        assert.equal(session.client.pending.length, 0);
        assert.equal(session.client.conditionalPending, false);
    } finally { await session.close(); }
});

test("lost response retains exact request and retry installs accepted edit once with undo history", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = new HubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 100);
    await session.start();
    try {
        const {revision} = await session.read(); assert.ok(revision);
        transport.loseResponse = true;
        const result = await session.edit(revision, [{op: "insert", at: [0, 0], content: "once"}]);
        assert.equal(result.status, "unconfirmed");
        assert.equal(session.client.conditionalPending, true);
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /once/);
        assert.equal(session.client.history.canUndo, false);
        await assert.rejects(session.history("undo"), /conditional edit is unconfirmed/i);
        assert.throws(() => session.client.doc.edit([{op: "insert", at: [0, 0], content: "blocked"}]), /conditional edit is unresolved/i);
        assert.doesNotMatch(JSON.stringify(session.client.doc.toJSON()), /blocked/);
        const human = Doc.fromSnapshot("human", hub.doc.snapshot(), DEMO_SCHEMA);
        hub.submit({actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 4], content: "!"}]).ops});
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /!/);
        assert.equal((await session.retryEdit()).status, "confirmed");
        assert.equal(session.client.conditionalPending, false);
        assert.match(JSON.stringify((await session.read()).document), /once/);
        assert.equal(hub.log.filter(entry => entry.change?.actor === "ai").length, 1);
        assert.equal((await session.history("undo")).status, "confirmed");
        assert.doesNotMatch(JSON.stringify((await session.read()).document), /once/);
        assert.match(JSON.stringify((await session.read()).document), /!/);
    } finally { await session.close(); }
});

test("after process loss the server snapshot keeps accepted edits, but new-session history is empty", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const firstTransport = new HubTransport(hub, "old-ai");
    const first = new DocumentSession("old-ai", firstTransport, DEMO_SCHEMA, 60);
    await first.start();
    firstTransport.dropEcho = true;
    const {revision} = await first.read();
    assert.ok(revision);
    assert.equal((await first.edit(revision, [{op: "insert", at: [0, 0], content: "accepted"}])).status, "unconfirmed");
    await first.close(); // In-memory pending state and history would be lost on process exit.
    const resumed = new DocumentSession("new-ai", new HubTransport(hub, "new-ai"), DEMO_SCHEMA, 60);
    await resumed.start();
    try {
        assert.match(JSON.stringify((await resumed.read()).document), /accepted/);
        assert.equal((await resumed.history("undo")).status, "no_change");
    } finally { await resumed.close(); }
});


test("read remains available after a connection error and retains unconfirmed local changes", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = new HubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 60);
    await session.start();
    transport.dropEcho = true;
    const {revision} = await session.read();
    assert.ok(revision);
    assert.equal((await session.edit(revision, [{op: "insert", at: [0, 0], content: "pending"}])).status, "unconfirmed");
    session.client.connectionError = new Error("epoch conflict");
    session.client.disconnect();
    const view = await session.read();
    assert.match(JSON.stringify(view.document), /pending/);
    assert.equal(view.pending, 1);
    assert.equal(view.sessionOnline, false);
    assert.equal(view.connectionError, "epoch conflict");
    await assert.rejects(session.edit(revision, [{op: "insert", at: [0, 0], content: "more"}]), /unconfirmed/);
});

test("agent presence rejects ranges across table cells and leaves the document unchanged", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const session = new DocumentSession("ai-presence", new HubTransport(hub, "ai-presence"), DEMO_SCHEMA, 100);
    await session.start();
    try {
        const {revision} = await session.read(); assert.ok(revision);
        const cell = () => ({type: "table-cell", children: [{type: "table-cell-body", children: [{type: "paragraph", runs: [{text: "cell"}]}]}]});
        const table = {type: "table", children: [{type: "table-row", children: [cell(), cell()]}]};
        assert.equal((await session.edit(revision, [{op: "insert", at: [1], content: [table]}])).status, "confirmed");
        const before = await session.read(); assert.ok(before.revision);
        await assert.rejects(session.setPresence(before.revision, "AI", "#7c3aed", [1, 0, 0, 0, 0, 2], [1, 0, 1, 0, 0, 2]), /same visible document line/);
        assert.equal(hub.presence.has("ai-presence"), false);
        assert.equal((await session.setPresence(before.revision, "AI", "#7c3aed", [1, 0, 0, 0, 0, 3], [1, 0, 0, 0, 0, 1])).status, "sent");
        assert.equal(hub.serverSeq, before.revision.serverSeq);
    } finally { await session.close(); }
});

test("bounded reads bind continuation to the replica and reject forged or stale pages", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA}), transport = new HubTransport(hub, "slice");
    const session = new DocumentSession("slice", transport, DEMO_SCHEMA, 100);
    await session.start();
    try {
        session.client.doc.edit([{op: "insert", at: [0], content: Array.from({length: 24}, (_, i) => ({type: "paragraph", runs: [{text: `p${i}😀`, marks: {}}]}))}], {normalize: false});
        const expected = session.client.doc.toJSON().children!;
        session.client.doc.toJSON = () => { throw new Error("full model read"); };
        const first = await session.readSlice({limit: 5});
        assert.equal(first.view, "model"); assert.ok(first.nextCursor);
        assert.equal(first.responseBytes, Buffer.byteLength(JSON.stringify(first), "utf8"));
        assert.equal("conditionalRequest" in first, false);
        await assert.rejects(session.readSlice({limit: 5, maxBytes: Math.floor(first.responseBytes * 0.75)}), /byte budget/);
        assert.equal(first.counts.projectedBlocks, 5);
        const collected = first.children.map(child => child.node);
        let cursor: string | null = first.nextCursor;
        while (cursor) {
            const page = await session.readSlice({cursor});
            collected.push(...page.children.map(child => child.node)); cursor = page.nextCursor;
        }
        assert.deepEqual(collected, expected);
        const before = JSON.stringify(session.client.doc.snapshot()), version = session.client.doc.version;
        const pending = session.client.pending.length, undo = session.client.history.canUndo;
        await assert.rejects(session.readSlice({cursor: first.nextCursor + "x"}), /Invalid slice cursor/);
        await assert.rejects(session.readSlice({cursor: first.nextCursor, limit: 1}), /cursor alone/);
        await assert.rejects(session.readSlice({path: [99]}));
        await assert.rejects(session.readSlice({maxBytes: 1}), /byte budget/);
        assert.equal(JSON.stringify(session.client.doc.snapshot()), before); assert.equal(session.client.doc.version, version);
        assert.equal(session.client.pending.length, pending); assert.equal(session.client.history.canUndo, undo);
        session.client.serverSeq++;
        await assert.rejects(session.readSlice({cursor: first.nextCursor}), /Stale slice cursor/);
        session.client.serverSeq--;
        const oldEpoch = session.client.epoch; session.client.epoch = "replacement-epoch";
        await assert.rejects(session.readSlice({cursor: first.nextCursor}), /Stale slice cursor/);
        session.client.epoch = oldEpoch;
        const verified = session.client.schemaVerified; session.client.schemaVerified = !verified;
        await assert.rejects(session.readSlice({cursor: first.nextCursor}), /Stale slice cursor/);
        session.client.schemaVerified = verified;
        session.client.doc.edit([{op: "insert", at: [0, 0], content: "new"}], {normalize: false});
        await assert.rejects(session.readSlice({cursor: first.nextCursor}), /Stale slice cursor/);
        const afterInsert = await session.readSlice({limit: 1}); assert.ok(afterInsert.nextCursor);
        session.client.doc.edit([{op: "move", from: [1], at: [3]}], {normalize: false});
        await assert.rejects(session.readSlice({cursor: afterInsert.nextCursor}), /Stale slice cursor/);
        const afterMove = await session.readSlice({limit: 1}); assert.ok(afterMove.nextCursor);
        session.client.doc.edit([{op: "delete", at: [2], count: 1}], {normalize: false});
        await assert.rejects(session.readSlice({cursor: afterMove.nextCursor}), /Stale slice cursor/);
        session.client.doc = Doc.fromSnapshot(session.client.actor, session.client.doc.snapshot(), session.client.schema);
        const beforeReplacement = await session.readSlice({limit: 1}); assert.ok(beforeReplacement.nextCursor);
        const priorVersion = session.client.doc.version;
        session.client.doc = Doc.fromSnapshot(session.client.actor, session.client.doc.snapshot(), session.client.schema);
        assert.equal(session.client.doc.version, priorVersion);
        await assert.rejects(session.readSlice({cursor: beforeReplacement.nextCursor}), /Stale slice cursor/);
        const end = await session.readSlice({start: (await session.readSlice({limit: 1})).total});
        assert.deepEqual(end.children, []); assert.equal(end.nextCursor, null);
        const other = new DocumentSession("other-slice", new HubTransport(hub, "other-slice"), DEMO_SCHEMA, 100);
        await other.start();
        try { await assert.rejects(other.readSlice({cursor: first.nextCursor}), /Invalid slice cursor/); }
        finally { await other.close(); }
    } finally { await session.close(); }
});
