import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import type {Schema} from "@barocss/doc-sync";
import {DocHub} from "@barocss/doc-sync/server";
import type {Change, Outbound, Presence, ServerEvent, Transport} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";
import {DocumentSession} from "../src/session.ts";

class DurableHubTransport implements Transport {
    dropOwnEcho = false;
    receiptUnknown = false;
    loseRelease = false;
    failReserve: "before" | "after" | null = null;
    releases = 0;
    private callback: ((event: ServerEvent) => void) | null = null;
    readonly hub: DocHub;
    readonly actor: string;
    constructor(hub: DocHub, actor: string) { this.hub = hub; this.actor = actor; }
    subscribe(since: number, onEvent: (event: ServerEvent) => void, epoch?: string): () => void {
        this.callback = onEvent;
        this.hub.connect(this.actor, since);
        const stop = this.hub.listen(event => {
            if (!(this.dropOwnEcho && event.type === "change" && event.envelope.change?.actor === this.actor)) onEvent(event);
        });
        onEvent(this.hub.hello(since, epoch));
        return () => { stop(); this.hub.disconnect(this.actor); };
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
    async submitConditional(base: {epoch: string; serverSeq: number; schemaVersion: string | null}, change: Change) {
        const envelope = this.hub.submitConditional(change, base);
        return {status: "accepted" as const, serverSeq: envelope.serverSeq};
    }
    async getRecoveryReceipt(generation: string, base: {epoch: string; serverSeq: number; schemaVersion: string | null}, change: Change) {
        return this.hub.findConditionalReceipt(generation, base, change);
    }
    async getChangeReceipt(generation: string, change: Change) {
        return this.receiptUnknown ? {status: "unknown" as const} : this.hub.findChangeReceipt(generation, change);
    }
    async reserveRecovery(generation: string, id: string, pin: number | null, requireExisting = false) {
        const fail = this.failReserve; this.failReserve = null;
        if (fail === "before") throw new Error("reservation unavailable");
        const result = this.hub.reserveRecovery(generation, this.actor, id, pin, requireExisting);
        if (fail === "after") throw new Error("reservation response lost");
        return result;
    }
    async releaseRecovery(generation: string, id: string) {
        this.releases++;
        const result = this.hub.releaseRecovery(generation, this.actor, id);
        if (result.status !== "released") throw new Error("release unsafe");
        if (this.loseRelease) { this.loseRelease = false; throw new Error("release response lost"); }
    }
    async recoverChange(generation: string, id: string, version: string, change: Change) {
        if (this.hub.submitRecovery(generation, id, version, change).status !== "accepted") throw new Error("recovery unavailable");
    }
    deliverOwnEcho() {
        for (const envelope of this.hub.since(0)) if (envelope.change?.actor === this.actor) this.callback?.({type: "change", envelope});
    }
}

async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-discard-failure-"));
    const path = join(directory, "doc.json");
    const journal = await IntentJournal.open(path, {document: "doc", actor: "ai"});
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    hub.onRecoveryPin = () => undefined;
    const transport = new DurableHubTransport(hub, "ai");
    const session = new DocumentSession("ai", transport, DEMO_SCHEMA, 100, journal);
    await session.start();
    const {revision} = await session.read(); assert.ok(revision);
    assert.equal((await session.edit(revision, [{op: "insert", at: [0, 0], content: "saved"}])).status, "confirmed");
    assert.equal(session.client.history.canUndo, true);
    return {directory, path, journal, hub, transport, session};
}

async function reopen(path: string, transport: DurableHubTransport) {
    const journal = await IntentJournal.open(path, {document: "doc"});
    const session = new DocumentSession(journal.actor, transport, DEMO_SCHEMA, 100, journal);
    await session.start();
    return {journal, session};
}

for (const mode of ["before", "after"] as const) {
    test(`checkpoint failure ${mode} durable discard does not send release`, {skip: process.platform !== "darwin"}, async () => {
        const f = await fixture();
        let resumed: Awaited<ReturnType<typeof reopen>> | null = null;
        try {
            const before = await readFile(`${f.path}.checkpoint`);
            const write = f.journal.writeCheckpoint.bind(f.journal);
            f.journal.writeCheckpoint = async input => {
                if (input.releasePending) {
                    if (mode === "after") await write(input);
                    throw new Error("checkpoint flush failed");
                }
                return write(input);
            };
            await assert.rejects(f.session.discardHistory(), /checkpoint flush failed/);
            assert.equal(f.transport.releases, 0);
            assert.equal(f.session.recoveryRequired, true);
            const stored = await f.journal.readCheckpoint(); assert.ok(stored);
            if (mode === "before") assert.deepEqual(await readFile(`${f.path}.checkpoint`), before);
            else assert.equal(stored.releasePending, true);
            await f.session.close();
            resumed = await reopen(f.path, f.transport);
            assert.equal(resumed.session.recoveryRequired, false);
            assert.equal(resumed.session.client.history.canUndo, mode === "before");
            assert.match(JSON.stringify((await resumed.session.read()).document), /saved/);
        } finally {
            await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true});
        }
    });
}

test("lost release response retains marker and is safely retried after restart", {skip: process.platform !== "darwin"}, async () => {
    const f = await fixture();
    let resumed: Awaited<ReturnType<typeof reopen>> | null = null;
    try {
        f.transport.loseRelease = true;
        await assert.rejects(f.session.discardHistory(), /response lost/);
        assert.equal((await f.journal.readCheckpoint())?.releasePending, true);
        assert.equal(f.session.recoveryRequired, true);
        await assert.rejects(f.session.history("undo"), /Recovery is required/);
        await f.session.close();
        resumed = await reopen(f.path, f.transport);
        assert.equal(resumed.session.recoveryRequired, false);
        assert.equal(resumed.session.client.history.canUndo, false);
        assert.equal(f.transport.releases, 2);
        assert.match(JSON.stringify((await resumed.session.read()).document), /saved/);
    } finally { await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true}); }
});

for (const mode of ["before", "after"] as const) {
    test(`new reservation failure ${mode} acceptance retains recoverable checkpoint`, {skip: process.platform !== "darwin"}, async () => {
        const f = await fixture();
        let resumed: Awaited<ReturnType<typeof reopen>> | null = null;
        try {
            const oldId = (await f.journal.readCheckpoint())!.reservationId;
            f.transport.failReserve = mode;
            await assert.rejects(f.session.discardHistory(), /reservation/);
            const stored = await f.journal.readCheckpoint(); assert.ok(stored);
            assert.notEqual(stored.reservationId, oldId);
            assert.equal(stored.reservationConfirmed, false);
            assert.equal(stored.releasePending, undefined);
            assert.equal(f.session.recoveryRequired, true);
            await f.session.close();
            resumed = await reopen(f.path, f.transport);
            assert.equal(resumed.session.recoveryRequired, false);
            assert.equal(resumed.session.client.history.canUndo, false);
            assert.match(JSON.stringify((await resumed.session.read()).document), /saved/);
        } finally { await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true}); }
    });
}

test("late echo with an unknown stored receipt blocks discard without release", {skip: process.platform !== "darwin"}, async () => {
    const f = await fixture();
    let resumed: Awaited<ReturnType<typeof reopen>> | null = null;
    try {
        f.transport.dropOwnEcho = true;
        assert.equal((await f.session.history("undo")).status, "unconfirmed");
        assert.equal((await f.journal.readCheckpoint())?.client.pending.length, 1);
        f.transport.deliverOwnEcho();
        assert.equal(f.session.client.pending.length, 0);
        const before = await readFile(`${f.path}.checkpoint`);
        f.transport.receiptUnknown = true;
        await assert.rejects(f.session.discardHistory(), /stored pending change is not confirmed/);
        assert.equal(f.transport.releases, 0);
        assert.deepEqual(await readFile(`${f.path}.checkpoint`), before);
        assert.equal(f.session.recoveryRequired, true);
        f.transport.dropOwnEcho = false; f.transport.receiptUnknown = false;
        await f.session.close();
        resumed = await reopen(f.path, f.transport);
        assert.equal(resumed.session.recoveryRequired, false);
        assert.equal(resumed.session.client.history.canRedo, true);
        assert.equal((await resumed.session.history("redo")).status, "confirmed");
        assert.match(JSON.stringify((await resumed.session.read()).document), /saved/);
    } finally { await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true}); }
});
