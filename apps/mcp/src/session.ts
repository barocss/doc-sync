import {SyncClient} from "@barocss/doc-sync/sync";
import {Doc, MAIN, anchorAt, posOfPath, readDocumentSlice, validateSliceQuery} from "@barocss/doc-sync";
import {assertCompatibleSchema, schemaVersion} from "@barocss/doc-sync";
import type {NodeHttpTransport} from "@barocss/doc-sync/node";
import type {EditOp, Schema, SliceQuery} from "@barocss/doc-sync";
import type {Transport, BotCharacter, BotExpression, BotActivity} from "@barocss/doc-sync/sync";
import type {IntentJournal, JournalRecord} from "./journal.ts";
import type {RecoveryCheckpoint} from "./journal.ts";
import {randomUUID, randomBytes, createHmac, timingSafeEqual} from "node:crypto";
import {History} from "@barocss/doc-sync";

export type PreparedIntent = NonNullable<SyncClient["conditionalEvidence"]> & {generation: string};
export type PreparedIntentAuthorizer = (intent: PreparedIntent) => void | Promise<void>;

export type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};

/** One persistent actor owns its undo history for the lifetime of this session. */
export class DocumentSession {
    readonly client: SyncClient;
    private readonly readCursorKey = randomBytes(32);
    private readonly readDocumentIds = new WeakMap<Doc, string>();
    private queue: Promise<void> = Promise.resolve();
    readonly timeoutMs: number;
    private readonly submitConditional: NodeHttpTransport["submitConditional"];
    private readonly transport: Transport & Pick<NodeHttpTransport, "submitConditional" | "getSchema" | "transitionSchema"> & Partial<Pick<NodeHttpTransport, "getRecoveryState" | "getRecoveryReceipt" | "reserveRecovery" | "releaseRecovery" | "getChangeReceipt" | "recoverChange">>;
    private readonly journal: IntentJournal | null;
    private recovered: JournalRecord | null = null;
    private acceptedRecord: string | null = null;
    private journalDirty = false;
    private generation: {epoch: string; value: string} | null = null;
    private conditionalMayHaveSent = false;
    private checkpoint: RecoveryCheckpoint | null = null;
    private reservationId: string | null = null;
    private recoveryError: string | null = null;
    private stepId: string | undefined;
    private readonly preservePreparedIntent: boolean;
    private readonly saveStep?: (step: string, record: JournalRecord) => Promise<void>;
    constructor(actor: string, transport: Transport & Pick<NodeHttpTransport, "submitConditional" | "getSchema" | "transitionSchema"> & Partial<Pick<NodeHttpTransport, "getRecoveryState" | "getRecoveryReceipt" | "reserveRecovery" | "releaseRecovery" | "getChangeReceipt" | "recoverChange">>, schema: Schema, timeoutMs = 10_000, journal: IntentJournal | null = null, saveStep?: (step: string, record: JournalRecord) => Promise<void>, authorizePreparedIntent?: PreparedIntentAuthorizer) {
        if (authorizePreparedIntent && !journal) throw new Error("Prepared authorization requires a durable journal");
        this.timeoutMs = timeoutMs;
        this.transport = transport;
        this.journal = journal;
        this.saveStep = saveStep;
        this.preservePreparedIntent = !!authorizePreparedIntent;
        this.client = new SyncClient(actor, transport, {schema});
        this.submitConditional = async (base, change) => {
            try {
                if (this.journal) {
                    const evidence = this.client.conditionalEvidence;
                    if (!evidence || JSON.stringify(evidence.base) !== JSON.stringify(base) || JSON.stringify(evidence.change) !== JSON.stringify(change)) throw new Error("Conditional recovery evidence is unavailable");
                    if (!this.generation || this.generation.epoch !== base.epoch) throw new Error("Server generation or epoch is unavailable; read again before editing");
                    await authorizePreparedIntent?.({...evidence, generation: this.generation.value});
                    this.journalDirty = true;
                    const record=await this.journal.prepare({...evidence, generation: this.generation.value});
                    if (this.saveStep) {
                        if (!this.stepId) throw new Error("A mission step ID is required");
                        await this.saveStep(this.stepId,record);
                    }
                }
            } catch (error) {
                if (this.conditionalMayHaveSent) throw error;
                return {status: "rejected", code: "not_sent", error: error instanceof Error ? error.message : String(error)};
            }
            this.conditionalMayHaveSent = true;
            return transport.submitConditional(base, change);
        };
    }

    async start(): Promise<void> {
        this.recovered = this.journal ? await this.journal.read() : null;
        this.checkpoint = this.journal ? await this.journal.readCheckpoint() : null;
        this.journalDirty = !!this.recovered;
        if (this.checkpoint) {
            try {
                if (this.checkpoint.releasePending) await this.finishDiscard(this.checkpoint);
                else await this.restoreCheckpoint(this.checkpoint);
            }
            catch (error) {
                this.client.disconnect();
                this.recoveryError = error instanceof Error ? error.message : String(error);
                this.client.doc = Doc.fromSnapshot(this.client.actor, this.checkpoint.client.snapshot, this.checkpoint.schema);
            }
            return;
        }
        if (this.recovered) {
            // Do not connect or acknowledge as this actor: that could release an old undo pin.
            this.client.doc = Doc.fromSnapshot(this.client.actor, this.recovered.snapshot, this.recovered.schema);
            return;
        }
        this.client.connect();
        await this.until(() => this.client.epoch !== undefined, "Document connection was not established");
        if (this.journal) await this.refreshGeneration();
        if (this.journal && this.generation && this.client.schemaVerified && this.transport.reserveRecovery) {
            await this.establishNewReservation();
        }
    }

    private async restoreCheckpoint(checkpoint: RecoveryCheckpoint): Promise<void> {
        if (!this.journal || !this.transport.getRecoveryState || !this.transport.reserveRecovery) throw new Error("Server recovery protection is unavailable");
        let state = await this.transport.getRecoveryState();
        if (state.generation !== checkpoint.generation || state.schemaVersion !== schemaVersion(checkpoint.schema) || state.serverSeq < checkpoint.client.serverSeq) {
            throw new Error("Server generation, schema or history does not match the checkpoint");
        }
        const deletes = new Map(checkpoint.client.delSeq);
        const history = History.fromSnapshot(checkpoint.client.history);
        const pin = history.pin(key => deletes.get(key));
        if (!checkpoint.reservationConfirmed && (checkpoint.client.pending.length || checkpoint.sourceIntentDigest !== null || pin !== null || history.canUndo || history.canRedo || this.recovered)) throw new Error("An unprotected checkpoint contains history that cannot be recovered");
        const reservation = await this.transport.reserveRecovery(checkpoint.generation, checkpoint.reservationId, pin, checkpoint.reservationConfirmed);
        if (reservation.status !== "protected") {
            // The era can advance after the first state read and before reserve.
            state = await this.transport.getRecoveryState();
            const match = /^r(0|[1-9]\d*)~/.exec(checkpoint.reservationId);
            const oldEra = match ? Number(match[1]) : 0;
            // A never-confirmed, empty checkpoint has not authorized an edit.
            // Only this state can change its ID after the server seals an era.
            if (state.generation !== checkpoint.generation || state.schemaVersion !== schemaVersion(checkpoint.schema) || state.serverSeq < checkpoint.client.serverSeq ||
                checkpoint.reservationConfirmed || this.recovered || history.canUndo || history.canRedo ||
                state.reservationEra === undefined || !Number.isSafeInteger(oldEra) || oldEra >= state.reservationEra) {
                throw new Error("The original recovery reservation cannot be proved");
            }
            this.generation = {epoch: state.epoch, value: checkpoint.generation};
            this.client.restoreCheckpoint(checkpoint.client, state.epoch);
            await this.establishNewReservation();
            checkpoint = this.checkpoint!;
        } else if (checkpoint.reservationConfirmed && !reservation.existing) throw new Error("The original recovery reservation cannot be proved");
        let installIntent = false;
        let minimumServerSeq = checkpoint.client.serverSeq;
        if (this.recovered) {
            if (!this.transport.getRecoveryReceipt || this.recovered.generation !== checkpoint.generation ||
                checkpoint.client.pending.length) throw new Error("An unresolved conditional edit needs inspection");
            const receipt = await this.transport.getRecoveryReceipt(this.recovered.generation, this.recovered.base, this.recovered.change);
            if (receipt.status !== "accepted") throw new Error("The conditional edit receipt is unknown");
            minimumServerSeq = Math.max(minimumServerSeq, receipt.serverSeq);
            if (checkpoint.sourceIntentDigest === this.recovered.recordDigest) {
                // Cleanup can stop after the accepted intent and a newer server cursor were saved.
                if (this.recovered.change.seq !== checkpoint.client.seq || this.recovered.base.serverSeq > checkpoint.client.serverSeq) {
                    throw new Error("The accepted intent does not match this checkpoint");
                }
            } else {
                if (this.recovered.base.serverSeq < checkpoint.client.serverSeq || this.recovered.change.seq !== checkpoint.client.seq + 1) {
                    throw new Error("The accepted intent cannot follow this checkpoint");
                }
                installIntent = true;
            }
        }
        for (const change of checkpoint.client.pending) {
            if (!this.transport.recoverChange) throw new Error("Atomic pending recovery is unavailable");
            await this.transport.recoverChange(checkpoint.generation, checkpoint.reservationId, schemaVersion(checkpoint.schema), change);
        }
        // A retried durable proof can reopen the same generation with a new process epoch.
        state = await this.transport.getRecoveryState();
        if (state.generation !== checkpoint.generation || state.schemaVersion !== schemaVersion(checkpoint.schema) || state.serverSeq < minimumServerSeq) {
            throw new Error("Server generation, schema or history does not match the checkpoint");
        }
        this.reservationId = checkpoint.reservationId;
        this.generation = {epoch: state.epoch, value: checkpoint.generation};
        this.client.restoreCheckpoint(checkpoint.client, state.epoch);
        if (installIntent && this.recovered) {
            this.client.restoreAcceptedIntent(this.recovered.snapshot, this.recovered.edits, this.recovered.change);
            await this.saveCheckpoint(this.recovered.recordDigest);
        }
        this.client.connect();
        await this.until(() => this.client.synchronized && this.client.epoch === state.epoch && this.client.schemaVerified && !this.client.pending.length, "Recovered session did not synchronize");
        await this.saveCheckpoint(this.recovered?.recordDigest ?? checkpoint.sourceIntentDigest);
        if (this.recovered) {
            await this.journal.clearAfterConfirmed(this.recovered.recordDigest);
            this.recovered = null; this.journalDirty = false;
        }
    }

    private async saveCheckpoint(sourceIntentDigest: string | null, reservationConfirmed = true, releasePending = false): Promise<void> {
        if (!this.journal || !this.generation || !this.reservationId || !this.client.epoch) return;
        this.checkpoint = await this.journal.writeCheckpoint({generation: this.generation.value, epoch: this.client.epoch,
            reservationId: this.reservationId, reservationConfirmed, sourceIntentDigest, schema: this.client.schema, client: this.client.checkpoint(),
            ...(releasePending ? {releasePending: true as const} : {})});
    }

    /** Persist a new ID before creation. Retry only a definite stale-era refusal. */
    private async establishNewReservation(): Promise<void> {
        if (!this.journal || !this.generation || !this.transport.getRecoveryState || !this.transport.reserveRecovery) throw new Error("Server recovery protection is unavailable");
        for (let attempt = 0; attempt < 8; attempt++) {
            const state = await this.transport.getRecoveryState();
            if (state.generation !== this.generation.value || state.epoch !== this.client.epoch || state.schemaVersion !== schemaVersion(this.client.schema)) {
                throw new Error("Server generation, epoch or schema changed before reservation");
            }
            this.reservationId = state.reservationEra === undefined ? randomUUID() : `r${state.reservationEra}~${randomUUID()}`;
            await this.saveCheckpoint(null, false);
            const reservation = await this.transport.reserveRecovery(this.generation.value, this.reservationId, null);
            if (reservation.status === "protected") { await this.saveCheckpoint(null); return; }
            const next = await this.transport.getRecoveryState();
            if (state.reservationEra === undefined || next.reservationEra === undefined || next.reservationEra <= state.reservationEra ||
                next.generation !== state.generation || next.epoch !== state.epoch || next.schemaVersion !== state.schemaVersion) break;
        }
        throw new Error("The server cannot protect recovery history");
    }

    /** Complete a durably recorded discard without restoring the discarded history. */
    private async finishDiscard(checkpoint: RecoveryCheckpoint): Promise<void> {
        if (!checkpoint.releasePending || this.recovered || !this.journal || !this.transport.getRecoveryState ||
            !this.transport.reserveRecovery || !this.transport.releaseRecovery) throw new Error("The pending history discard cannot be completed");
        const state = await this.transport.getRecoveryState();
        if (state.generation !== checkpoint.generation || state.schemaVersion !== schemaVersion(checkpoint.schema) || state.serverSeq < checkpoint.client.serverSeq) {
            throw new Error("Server generation, schema or history does not match the discard checkpoint");
        }
        // This request is safe to repeat after a lost response or a process crash.
        await this.transport.releaseRecovery(checkpoint.generation, checkpoint.reservationId);
        this.client.restoreCheckpoint(checkpoint.client, state.epoch);
        this.generation = {epoch: state.epoch, value: checkpoint.generation};
        await this.establishNewReservation();
        this.client.connect();
        await this.until(() => this.client.synchronized && this.client.epoch === state.epoch && this.client.schemaVerified && !this.client.pending.length, "The session did not synchronize after discarding history");
        await this.saveCheckpoint(null);
        this.recoveryError = null;
    }

    /** Discard only this participant's history after all local changes are confirmed. */
    async discardHistory() {
        return this.serial(async () => {
            await this.requireSettled();
            this.revision();
            if (!this.journal || !this.generation || !this.reservationId || !this.transport.releaseRecovery || !this.transport.reserveRecovery) {
                throw new Error("Durable history protection is unavailable; nothing was discarded");
            }
            if (this.client.epoch !== this.generation.epoch) throw new Error("Server epoch changed; recover before discarding history");
            this.client.disconnect();
            try {
                // Recheck after disconnect: an earlier await can race a local or remote event.
                await this.requireSettled();
                const stored = await this.journal.readCheckpoint();
                if (!stored || stored.releasePending || !stored.reservationConfirmed || stored.generation !== this.generation.value ||
                    stored.reservationId !== this.reservationId || stored.client.seq > this.client.checkpoint().seq) throw new Error("The durable checkpoint does not match this session");
                // A late echo may settle memory while the last checkpoint still contains a pending change.
                for (const change of stored.client.pending) {
                    if (!this.transport.getChangeReceipt || (await this.transport.getChangeReceipt(stored.generation, change)).status !== "accepted") {
                        throw new Error("A stored pending change is not confirmed; history was not discarded");
                    }
                }
                this.client.clearHistory();
                await this.saveCheckpoint(null, true, true);
                await this.finishDiscard(this.checkpoint!);
                return {status: "discarded" as const, revision: this.revision()};
            } catch (error) {
                this.client.disconnect();
                this.recoveryError = `History discard requires recovery: ${error instanceof Error ? error.message : String(error)}`;
                throw error;
            }
        });
    }

    /** Wait for all operations admitted before shutdown. */
    async drain(): Promise<void> { await this.queue; }

    /** Stop the local stream while the caller retains the journal lock. */
    disconnect(): void { this.client.disconnect(); }

    async close(): Promise<void> {
        await this.drain();
        this.disconnect();
        await this.journal?.close();
    }

    get recoveryRequired(): boolean { return !!this.recoveryError || !!this.checkpoint?.releasePending || !!this.recovered || this.journalDirty || (!!this.journal && this.client.conditionalPending); }

    private async until(condition: () => boolean, message: string): Promise<void> {
        const deadline = Date.now() + this.timeoutMs;
        while (!condition()) {
            if (this.client.connectionError) throw this.client.connectionError;
            if (Date.now() >= deadline) throw new Error(message);
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }

    private async refreshGeneration(): Promise<void> {
        if (!this.journal) return;
        if (!this.transport.getRecoveryState) throw new Error("Server recovery state is unavailable; edit was not sent");
        const state = await this.transport.getRecoveryState();
        if (state.epoch !== this.client.epoch) throw new Error("Server epoch changed; reconnect before editing");
        if (this.reservationId && (!this.generation || this.generation.epoch !== state.epoch || this.generation.value !== state.generation)) {
            this.recoveryError = "The server epoch or generation changed; restart to verify and restore the protected checkpoint";
            throw new Error(this.recoveryError);
        }
        this.generation = state.generation ? {epoch: state.epoch, value: state.generation} : null;
    }

    private serial<T>(fn: () => Promise<T> | T): Promise<T> {
        const next = this.queue.then(fn);
        this.queue = next.then(() => undefined, () => undefined);
        return next;
    }

    private revision(): Revision {
        if (!this.client.epoch || this.client.connectionError || !this.client.online) throw new Error("Document session is not connected");
        return {epoch: this.client.epoch, serverSeq: this.client.serverSeq, schemaVersion: this.client.schemaVerified ? schemaVersion(this.client.schema) : null};
    }

    private async requireSettled(): Promise<void> {
        if (this.recoveryError) throw new Error(`Recovery is required: ${this.recoveryError}`);
        if (this.recovered) throw new Error("Recovery is required; inspect the journal before editing");
        if (this.client.conditionalPending) throw new Error("A conditional edit is unconfirmed. Call retry_edit to resolve the same request.");
        if (this.client.pending.length) throw new Error("A previous edit is unconfirmed. Wait for synchronization; do not retry the edit blindly.");
        if (this.journalDirty) throw new Error("Journal cleanup or recovery is unresolved; inspect storage before editing");
        if (this.journal && await this.journal.read()) throw new Error("A durable recovery record remains; inspect it before editing");
    }

    private async prepareRead(): Promise<void> {
            if (this.journal && !this.recovered && this.client.online && this.client.epoch && this.generation?.epoch !== this.client.epoch) {
                try { await this.refreshGeneration(); }
                catch (error) { if (!this.recoveryError) throw error; }
            }
            if (this.journal && this.acceptedRecord && !this.client.pending.length && !this.client.conditionalPending) {
                try { await this.saveCheckpoint(this.acceptedRecord); await this.journal.clearAfterConfirmed(this.acceptedRecord); this.acceptedRecord = null; this.journalDirty = false; }
                catch { /* Preserve the record and keep edits blocked until it can be reconciled. */ }
            }
    }

    private readMetadata(includeConditionalRequest = true) {
        return {
            revision: this.client.online && !this.client.connectionError && this.client.epoch ? this.revision() : null,
            pending: this.client.pending.length,
            conditionalPending: this.client.conditionalPending,
            ...(includeConditionalRequest ? {conditionalRequest: this.client.conditionalRequest} : {}),
            recoveryRequired: this.recoveryRequired,
            durability: this.reservationId ? "protected_checkpoint" : this.journal ? "conditional_journal_only" : "disabled",
            schemaVersion: this.client.schemaVerified ? schemaVersion(this.client.schema) : null,
            sessionOnline: this.client.online,
            connectionError: this.client.connectionError?.message ?? null,
            revisionScope: "local replica; edit_document checks the revision atomically on the server",
        };
    }

    read() {
        return this.serial(async () => {
            await this.prepareRead();
            return {document: this.client.doc.toJSON(), ...this.readMetadata()};
        });
    }

    private sliceBinding() {
        let documentInstance = this.readDocumentIds.get(this.client.doc);
        if (!documentInstance) { documentInstance = randomUUID(); this.readDocumentIds.set(this.client.doc, documentInstance); }
        return {documentInstance, epoch: this.client.epoch ?? null, serverSeq: this.client.serverSeq,
            schemaVersion: schemaVersion(this.client.schema), verified: this.client.schemaVerified,
            documentRevision: this.client.doc.version};
    }

    private signCursor(payload: string): string {
        return createHmac("sha256", this.readCursorKey).update(payload).digest("base64url");
    }

    /** Bounded canonical model children, bound to this local replica revision. */
    readSlice(input: SliceQuery & {cursor?: string} = {}) {
        return this.serial(async () => {
            let query = validateSliceQuery(input);
            let cursorBinding: unknown;
            if (input.cursor !== undefined) {
                if (Object.keys(input).some(key => key !== "cursor")) throw new Error("Supply a cursor alone");
                if (input.cursor.length > 4096) throw new Error("Invalid slice cursor");
                const parts = input.cursor.split(".");
                if (parts.length !== 2) throw new Error("Invalid slice cursor");
                const actual = Buffer.from(parts[1]), expected = Buffer.from(this.signCursor(parts[0]));
                if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid slice cursor");
                let decoded;
                try { decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
                catch { throw new Error("Invalid slice cursor"); }
                query = validateSliceQuery(decoded.query);
                cursorBinding = decoded.binding;
                if (JSON.stringify(cursorBinding) !== JSON.stringify(this.sliceBinding())) throw new Error("Stale slice cursor; start a new read");
            }
            // A bounded read never writes a checkpoint or clears a recovery journal.
            const slice = readDocumentSlice(this.client.doc, query);
            const binding = this.sliceBinding();
            let nextCursor: string | null = null;
            if (slice.nextIndex !== null) {
                const payload = Buffer.from(JSON.stringify({query: {...query, start: slice.nextIndex}, binding})).toString("base64url");
                nextCursor = `${payload}.${this.signCursor(payload)}`;
            }
            const response = {...slice, ...this.readMetadata(false), documentRevision: binding.documentRevision, nextCursor,
                responseBytes: 0, byteBudget: query.maxBytes,
                budgetScope: "maxBytes covers this complete response; counts.bytes covers the Core slice",
                pathSemantics: "canonical model child indexes; text offsets and direct grid row/cell slicing are unsupported"};
            for (let i = 0; i < 4; i++) response.responseBytes = Buffer.byteLength(JSON.stringify(response), "utf8");
            if (response.responseBytes > query.maxBytes) throw new Error("Slice response exceeds JSON byte budget");
            return response;
        });
    }

    /** Publish an explicitly supplied position; this is transient and has no delivery receipt. */
    async setPresence(base: Revision, name: string, color: string, anchor: number[] | null, focus: number[] | null, character?: BotCharacter, expression?: BotExpression, activity?: BotActivity) {
        return this.serial(async () => {
            await this.requireSettled();
            const current = this.revision();
            if (!this.client.synchronized) throw new Error("Document session is not synchronized");
            if (base.epoch !== current.epoch || base.serverSeq !== current.serverSeq || base.schemaVersion !== current.schemaVersion) {
                throw new Error("The local document or schema changed since it was read. Read it again before setting presence.");
            }
            if (!anchor && focus) throw new Error("A selection requires an active anchor");
            const endpoint = (path: number[] | null): string | null => {
                if (!path) return null;
                const doc = this.client.doc, pos = posOfPath(doc, path);
                if (!pos || pos.o !== path.at(-1) || !doc.visible(pos.line ?? MAIN)) throw new Error("Presence path is not a visible text position");
                const key = anchorAt(doc, path);
                if (!key || !doc.get(key) || !doc.tokenLocation(key)?.visible) throw new Error("Presence path is not a visible text position");
                return key;
            };
            const active = endpoint(anchor), other = endpoint(focus);
            if (active && other && this.client.doc.tokenLocation(active)?.line !== this.client.doc.tokenLocation(other)?.line) {
                throw new Error("Presence selection endpoints must be in the same visible document line");
            }
            this.client.setPresence({name, color, anchor: active, focus: active === other ? null : other, ...(character ? {character} : {}), ...(expression ? {expression} : {}), ...(activity ? {activity} : {})});
            return {status: "sent", delivery: "unconfirmed"};
        });
    }

    async edit(base: Revision, edits: EditOp[], stepId?: string) {
        return this.serial(async () => {
            if (this.saveStep && (!stepId || !/^[0-9a-f-]{36}$/i.test(stepId))) throw new Error("A valid mission step ID is required");
            this.stepId=stepId;
            await this.requireSettled();
            const current = this.revision();
            if (base.epoch !== current.epoch || base.serverSeq !== current.serverSeq || base.schemaVersion !== current.schemaVersion) {
                throw new Error("The local document or schema changed since it was read. Read it again before editing.");
            }
            this.conditionalMayHaveSent = false;
            return this.finishConditional(await this.client.conditionalEdit(base, edits, this.submitConditional));
        });
    }

    async retryEdit() {
        return this.serial(async () => {
            if (this.recovered) throw new Error("Recovery is required; automatic retry is disabled");
            return this.finishConditional(await this.client.retryConditional(this.submitConditional));
        });
    }

    async recoveryStatus() {
        return this.serial(async () => {
            if (!this.journal) return {status: "disabled" as const, message: "Durable recovery is disabled for this session."};
            const record = await this.journal.read();
            if (this.recoveryError && !record) return {status: "recovery_required" as const, record, checkpoint: this.checkpoint, receipt: {status: "unknown" as const}, message: this.recoveryError};
            if (!record && this.journalDirty) return {status: "recovery_required" as const, record: null, receipt: {status: "unknown" as const}, message: "Journal cleanup outcome is unknown; inspect storage."};
            if (!record) return {status: "clear" as const};
            let receipt: {status: "unknown"} | {status: "accepted"; serverSeq: number; generation: string} = {status: "unknown"};
            let message: string | undefined;
            try {
                if (this.transport.getRecoveryReceipt) receipt = await this.transport.getRecoveryReceipt(record.generation, record.base, record.change);
            } catch (error) { message = error instanceof Error ? error.message : String(error); }
            return {status: "recovery_required" as const, record, receipt, ...((this.recoveryError || message) ? {message: this.recoveryError ?? message} : {})};
        });
    }

    async serverSchema() {
        return this.serial(() => this.transport.getSchema());
    }

    async upgradeSchema() {
        return this.serial(async () => {
            if (this.recoveryError || this.recovered || this.client.conditionalPending || (this.journal && await this.journal.read())) throw new Error("Resolve recovery before changing schema");
            const server = await this.transport.getSchema();
            if (!server.schema || !server.schemaVersion) throw new Error("The server does not enforce a schema");
            return this.installSchema(server.schema, server.schemaVersion);
        });
    }

    async transitionSchema(base: {epoch: string; serverSeq: number; schemaVersion: string}, next: Schema) {
        return this.serial(async () => {
            if (this.recoveryError || this.recovered || this.client.conditionalPending || (this.journal && await this.journal.read())) throw new Error("Resolve recovery before changing schema");
            assertCompatibleSchema(this.client.schema, next);
            const result = await this.transport.transitionSchema(base, next);
            return this.installSchema(next, result.schemaVersion);
        });
    }

    private async installSchema(next: Schema, expected: string) {
        this.client.upgradeSchema(next);
        this.client.connect();
        await this.until(() => this.client.online && this.client.schemaVerified, "Schema upgraded locally, but server reconnection was not confirmed");
        if (schemaVersion(this.client.schema) !== expected) throw new Error("Local schema version does not match the server");
        if (this.reservationId) {
            try { await this.saveCheckpoint(null); }
            catch (error) { this.client.disconnect(); this.recoveryError = "The schema changed but the updated checkpoint could not be persisted"; throw error; }
        }
        return {status: "connected", schemaVersion: expected, pending: this.client.pending.length};
    }

    private async finishConditional(result: Awaited<ReturnType<SyncClient["conditionalEdit"]>>) {
        if (result.status === "rejected") {
            let warning = "";
            // The server checks the exact receipt before rejecting within an epoch;
            // a returned rejection is definitive. An epoch change after a lost reply
            // is handled by SyncClient as unconfirmed and never reaches this branch.
            if (this.journal) {
                try {
                    const record = await this.journal.read();
                    if (record && this.preservePreparedIntent) { this.journalDirty = true; warning = " Approved attempt evidence is retained for owner reconciliation."; }
                    else { if (record) await this.journal.clearAfterConfirmed(record.recordDigest); this.journalDirty = false; }
                } catch { warning = " Journal cleanup could not be confirmed; inspect storage before further edits."; }
            }
            throw new Error(`Conditional edit rejected (${result.code}): ${result.error}. Read the document again.${warning}`);
        }
        if (result.status === "unconfirmed") return {status: "unconfirmed", pending: this.client.pending.length,
            conditionalPending: true, message: `${result.message}. Call retry_edit to resolve this exact request.`};
        if (result.status === "accepted" && this.journal) this.acceptedRecord = (await this.journal.read())?.recordDigest ?? null;
        const reply = await this.confirm(result.status === "accepted");
        if (reply.status === "confirmed" && this.journal && this.acceptedRecord) {
            try { await this.saveCheckpoint(this.acceptedRecord); await this.journal.clearAfterConfirmed(this.acceptedRecord); this.acceptedRecord = null; this.journalDirty = false; }
            catch (error) { return {...reply, journalWarning: `Confirmed edit; journal cleanup outcome is unknown: ${error instanceof Error ? error.message : String(error)}`}; }
        }
        return reply;
    }

    async history(action: "undo" | "redo") {
        return this.serial(async () => {
            await this.requireSettled();
            if (this.journal && !this.reservationId) throw new Error("Durable history protection is unavailable; undo and redo were not sent");
            if (this.reservationId && this.client.epoch !== this.generation?.epoch) {
                this.recoveryError = "The server epoch changed; restart to restore the protected checkpoint";
                throw new Error(this.recoveryError);
            }
            this.revision();
            const before = this.client.pending.length;
            const snapshot = JSON.stringify(this.client.doc.snapshot());
            if (this.reservationId) this.client.disconnect();
            if (action === "undo") this.client.undo();
            else this.client.redo();
            if (this.reservationId) {
                try { await this.saveCheckpoint(null); }
                catch (error) { this.recoveryError = "Could not persist the history operation; no change was sent"; throw error; }
                this.client.connect();
            }
            const result = await this.confirm(this.client.pending.length > before || JSON.stringify(this.client.doc.snapshot()) !== snapshot);
            if (this.reservationId && result.status !== "unconfirmed") {
                try { await this.saveCheckpoint(null); }
                catch (error) { this.client.disconnect(); this.recoveryError = "The history operation was sent but checkpoint persistence is uncertain"; throw error; }
            }
            return result;
        });
    }

    private async confirm(changed: boolean) {
        if (!changed) return {status: "no_change", revision: this.revision(), pending: 0};
        try {
            await this.until(() => this.client.pending.length === 0, "Timed out waiting for server acknowledgement");
            return {status: "confirmed", revision: this.revision(), pending: 0};
        } catch (error) {
            // The server may have accepted the change without delivering its echo.
            return {status: "unconfirmed", revision: this.client.online && !this.client.connectionError && this.client.epoch ? this.revision() : null,
                pending: this.client.pending.length, message: error instanceof Error ? error.message : String(error)};
        }
    }
}
