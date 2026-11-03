import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {Doc} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";
import {DocHub} from "@barocss/doc-sync/server";
import type {Change, Outbound, Presence, ServerEvent, Transport} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";
import type {RecoveryCheckpoint} from "../src/journal.ts";
import {DocumentSession} from "../src/session.ts";

class CheckpointTransport implements Transport {
    ordinaryChanges = 0;
    subscriptions = 0;
    unknownReceipt = false;
    afterReserve?: () => void;
    afterReceipt?: () => void;
    hub: DocHub;
    readonly actor: string;
    constructor(hub: DocHub, actor: string) { this.hub = hub; this.actor = actor; }
    subscribe(since: number, onEvent: (event: ServerEvent) => void, epoch?: string): () => void {
        this.subscriptions++;
        const hub = this.hub;
        hub.connect(this.actor, since);
        const stop = hub.listen(onEvent);
        onEvent(hub.hello(since, epoch));
        return () => { stop(); hub.disconnect(this.actor); };
    }
    async send(message: Outbound) {
        if (message.kind === "change") { this.ordinaryChanges++; this.hub.submit(message.change); }
        else this.hub.ack(message.ack);
    }
    sendPresence(presence: Presence) { this.hub.setPresence(presence); }
    async getSchema() { return {schemaVersion: this.hub.schemaVersion, schema: this.hub.getSchema()}; }
    async getRecoveryState() {
        return {generation: this.hub.generation, epoch: this.hub.epoch, serverSeq: this.hub.serverSeq, schemaVersion: this.hub.schemaVersion};
    }
    async transitionSchema(base: {epoch: string; serverSeq: number; schemaVersion: string}, schema: Schema) {
        return {schemaVersion: this.hub.transitionSchema(schema, base)};
    }
    async submitConditional(base: {epoch: string; serverSeq: number; schemaVersion: string | null}, change: Change) {
        return {status: "accepted" as const, serverSeq: this.hub.submitConditional(change, base).serverSeq};
    }
    async getRecoveryReceipt(generation: string, base: {epoch: string; serverSeq: number; schemaVersion: string | null}, change: Change) {
        const receipt = this.unknownReceipt ? {status: "unknown" as const} : this.hub.findConditionalReceipt(generation, base, change);
        this.afterReceipt?.();
        return receipt;
    }
    async reserveRecovery(generation: string, id: string, pin: number | null, requireExisting = false) {
        const reply = this.hub.reserveRecovery(generation, this.actor, id, pin, requireExisting);
        this.afterReserve?.();
        return reply;
    }
}

const platformSkip = process.platform !== "darwin" && process.platform !== "linux";
const text = (hub: DocHub) => JSON.stringify(hub.doc.toJSON());
function checkpointInput(checkpoint: RecoveryCheckpoint) {
    const {format: _format, document: _document, actor: _actor, recordDigest: _digest, ...input} = checkpoint;
    return input;
}

async function retainedIntent() {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-accepted-checkpoint-"));
    const path = join(directory, "doc.json");
    const journal = await IntentJournal.open(path, {document: "doc", actor: "ai"});
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    const pins: Array<{actor: string; reservationId: string; pin: number | null}> = [];
    hub.onRecoveryPin = entry => { pins.push(structuredClone(entry)); };
    const session = new DocumentSession("ai", new CheckpointTransport(hub, "ai"), DEMO_SCHEMA, 100, journal);
    await session.start();
    const before = await journal.readCheckpoint(); assert.ok(before);
    const view = await session.read(); assert.ok(view.revision);
    // This is the crash boundary after checkpoint fsync and before journal unlink.
    journal.clearAfterConfirmed = async () => { throw new Error("cleanup interrupted before unlink"); };
    assert.equal((await session.edit(view.revision, [{op: "insert", at: [0, 0], content: "saved"}])).status, "confirmed");
    const record = await journal.read(), checkpoint = await journal.readCheckpoint();
    assert.ok(record); assert.ok(checkpoint);
    assert.equal(checkpoint.sourceIntentDigest, record.recordDigest);
    assert.equal(checkpoint.client.pending.length, 0);
    assert.equal(checkpoint.client.serverSeq, record.base.serverSeq + 1);
    return {directory, path, journal, hub, pins, session, before, record, checkpoint};
}

async function reopen(path: string, transport: CheckpointTransport) {
    const journal = await IntentJournal.open(path, {document: "doc"});
    const session = new DocumentSession(journal.actor, transport, DEMO_SCHEMA, 100, journal);
    await session.start();
    return {journal, session};
}

for (const phase of ["settled", "before-snapshot", "before-install"] as const) {
    test(`accepted intent cleanup interruption restores ${phase} checkpoint once`, {skip: platformSkip}, async () => {
        const f = await retainedIntent();
        let resumed: Awaited<ReturnType<typeof reopen>> | undefined;
        try {
            if (phase === "before-snapshot") {
                await f.journal.writeCheckpoint({...checkpointInput(f.checkpoint), client: {...f.checkpoint.client, serverSeq: f.record.base.serverSeq}});
            } else if (phase === "before-install") {
                await f.journal.writeCheckpoint(checkpointInput(f.before));
            }
            const human = Doc.fromSnapshot("human", f.hub.doc.snapshot(), DEMO_SCHEMA);
            f.hub.submit({actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "Human "}]).ops});
            await f.session.close();
            const transport = new CheckpointTransport(f.hub, "ai");
            resumed = await reopen(f.path, transport);
            assert.equal((await resumed.session.recoveryStatus()).status, "clear");
            assert.equal(transport.ordinaryChanges, 0, "accepted edit must not be sent again");
            assert.equal(f.hub.serverSeq, 2);
            assert.match(text(f.hub), /Human saved/);
            assert.equal(await resumed.journal.read(), null);
            assert.equal((await resumed.journal.readCheckpoint())?.client.serverSeq, 2);
            // Reopen again before using History to prove the settled evidence survives.
            await resumed.session.close();
            resumed = await reopen(f.path, new CheckpointTransport(f.hub, "ai"));
            assert.equal((await resumed.session.recoveryStatus()).status, "clear");
            assert.equal((await resumed.session.history("undo")).status, "confirmed");
            assert.match(text(f.hub), /Human /);
            assert.doesNotMatch(text(f.hub), /saved/);
            assert.equal((await resumed.session.history("undo")).status, "no_change", "the accepted intent has one history group");
            assert.equal((await resumed.session.history("redo")).status, "confirmed");
            assert.match(text(f.hub), /Human saved/);
            assert.equal(f.hub.serverSeq, 4);
        } finally {
            await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true});
        }
    });
}

for (const mismatch of ["digest", "sequence", "receipt", "reservation", "generation", "schema", "history"] as const) {
    test(`accepted checkpoint with ${mismatch} mismatch keeps recovery evidence and blocks edits`, {skip: platformSkip}, async () => {
        const f = await retainedIntent();
        let resumed: Awaited<ReturnType<typeof reopen>> | undefined;
        try {
            if (mismatch === "digest") await f.journal.writeCheckpoint({...checkpointInput(f.checkpoint), sourceIntentDigest: "f".repeat(64)});
            if (mismatch === "sequence") await f.journal.writeCheckpoint({...checkpointInput(f.checkpoint), client: {
                ...f.checkpoint.client, seq: f.record.change.seq + 1, serverSeq: f.record.base.serverSeq,
            }});
            if (mismatch === "history") await f.journal.writeCheckpoint({...checkpointInput(f.checkpoint), client: {
                ...f.checkpoint.client, serverSeq: f.record.base.serverSeq,
            }});
            const originalCheckpoint = await readFile(`${f.path}.checkpoint`), originalIntent = await readFile(f.path);
            await f.session.close();
            const transport = new CheckpointTransport(f.hub, "ai");
            transport.unknownReceipt = mismatch === "receipt";
            if (mismatch === "reservation") {
                assert.equal(f.hub.releaseRecovery(f.checkpoint.generation, "ai", f.checkpoint.reservationId).status, "released");
            }
            transport.afterReceipt = () => {
                transport.afterReceipt = undefined;
                if (mismatch === "generation") f.hub.generation = crypto.randomUUID();
                if (mismatch === "schema") {
                    assert.ok(f.hub.schemaVersion);
                    f.hub.transitionSchema({...DEMO_SCHEMA, marks: [...DEMO_SCHEMA.marks, "highlight"]}, {
                        epoch: f.hub.epoch, serverSeq: f.hub.serverSeq, schemaVersion: f.hub.schemaVersion,
                    });
                }
                if (mismatch === "history") transport.hub = new DocHub({schema: DEMO_SCHEMA, generation: f.hub.generation});
            };
            resumed = await reopen(f.path, transport);
            assert.equal((await resumed.session.recoveryStatus()).status, "recovery_required");
            assert.equal(transport.subscriptions, 0, "unproven state must not join as this actor");
            assert.equal(transport.ordinaryChanges, 0);
            assert.equal(f.hub.serverSeq, 1);
            await assert.rejects(resumed.session.history("undo"), /Recovery is required/);
            assert.deepEqual(await readFile(`${f.path}.checkpoint`), originalCheckpoint);
            assert.deepEqual(await readFile(f.path), originalIntent);
        } finally {
            await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true});
        }
    });
}

test("restore refreshes epoch after a durable reservation proof reopens the same generation", {skip: platformSkip}, async () => {
    const f = await retainedIntent();
    let resumed: Awaited<ReturnType<typeof reopen>> | undefined;
    try {
        await f.session.close();
        const transport = new CheckpointTransport(f.hub, "ai");
        transport.afterReserve = () => {
            transport.afterReserve = undefined;
            const replacement = new DocHub({schema: DEMO_SCHEMA, generation: f.hub.generation});
            const receipts = new Map(f.hub.recoveryReceiptState().map(receipt => [receipt.serverSeq, receipt.base]));
            for (const envelope of f.hub.log) { assert.ok(envelope.change); replacement.submit(envelope.change, receipts.get(envelope.serverSeq)); }
            for (const pin of f.pins) replacement.replayRecoveryPin(pin);
            replacement.onRecoveryPin = () => undefined;
            assert.notEqual(replacement.epoch, f.hub.epoch);
            transport.hub = replacement;
        };
        resumed = await reopen(f.path, transport);
        assert.equal((await resumed.session.recoveryStatus()).status, "clear");
        assert.equal(resumed.session.client.epoch, transport.hub.epoch);
        assert.equal(transport.hub.serverSeq, 1);
        assert.equal(transport.ordinaryChanges, 0);
        assert.match(text(transport.hub), /saved/);
        assert.equal((await resumed.session.history("undo")).status, "confirmed");
        assert.doesNotMatch(text(transport.hub), /saved/);
    } finally {
        await resumed?.session.close(); await f.session.close(); await rm(f.directory, {recursive: true, force: true});
    }
});
