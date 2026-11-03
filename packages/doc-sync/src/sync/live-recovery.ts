import {schemaVersion} from '../crdt/schema-version.ts';
import type {Change} from './protocol.ts';
import {SyncClient, type ClientCheckpoint} from './client.ts';

type State = {generation: string | null; epoch: string; serverSeq: number; schemaVersion: string | null; reservationEra?: number};
type Protection = {status: 'unsafe'} | {status: 'protected'; generation: string; pin: number; lastGc: number; existing: boolean};
export type LiveRecoveryProof = {generation: string; id: string; pin: number; version: string; epoch: string};
type Reservation = LiveRecoveryProof;
export type LiveRecoveryRelease = {proof: LiveRecoveryProof; client: ClientCheckpoint; releasePending: true};
export type LiveRecoveryOptions = {onProof?: (proof: LiveRecoveryProof) => void};
export type LiveRecoveryTransport = {
    getRecoveryState(): Promise<State>;
    reserveRecovery(generation: string, id: string, pin: number | null, requireExisting?: boolean): Promise<Protection>;
    getChangeReceipt(generation: string, change: Change): Promise<{status: 'unknown'} | {status: 'accepted'; generation: string; serverSeq: number}>;
    recoverChange(generation: string, id: string, version: string, change: Change): Promise<void>;
    releaseRecovery(generation: string, id: string): Promise<void>;
};

/** Recovery proof for a live client. A durable owner must save every checkpoint before sending. */
export class LiveRecovery {
    private reservation: Reservation | null = null;
    private protection: Reservation | null = null;
    private busy = false;
    private disposed = false;
    private releaseHistoryGuard: (() => void) | null = null;
    private resumeMutations: (() => void) | null = null;
    private releaseIntent: LiveRecoveryRelease | null = null;
    readonly client: SyncClient;
    readonly transport: LiveRecoveryTransport;
    private readonly options: LiveRecoveryOptions;
    constructor(client: SyncClient, transport: LiveRecoveryTransport, options: LiveRecoveryOptions = {}) { this.client = client; this.transport = transport; this.options = options; }
    get proof(): LiveRecoveryProof | null { return structuredClone(this.reservation); }
    get releasePending(): boolean { return this.releaseIntent !== null; }
    get protected(): boolean { return !this.disposed && this.protection !== null; }

    private assertActive(): void {
        if (this.disposed) throw new Error('Recovery controller is disposed');
    }

    private clean(): boolean {
        return this.client.synchronized && this.client.schemaVerified && !this.client.pending.length &&
            !this.client.conditionalPending && !this.client.historyStatus().canUndo && !this.client.historyStatus().canRedo;
    }

    private validProtection(result: Protection, proof: Reservation): boolean {
        return result.status === 'protected' && result.generation === proof.generation &&
            Number.isSafeInteger(result.pin) && result.pin >= 1 && result.pin <= proof.pin &&
            Number.isSafeInteger(result.lastGc) && result.lastGc >= 0 && result.lastGc < result.pin;
    }

    /** Establish before the first local edit, while the synchronized peer still protects the base. */
    async establish(): Promise<void> {
        this.assertActive();
        if (this.busy || this.protection) throw new Error('Recovery protection is already active or starting');
        this.busy = true;
        try {
            if (!this.clean() || !this.client.epoch) throw new Error('Recovery protection requires a clean synchronized client');
            const before = this.client.checkpoint(), epoch = this.client.epoch, version = schemaVersion(this.client.schema);
            const state = await this.transport.getRecoveryState();
            this.assertActive();
            if (!state.generation || state.epoch !== epoch || state.schemaVersion !== version || state.serverSeq < before.serverSeq ||
                !Number.isSafeInteger(state.reservationEra) || state.reservationEra! < 0) throw new Error('Cannot bind the current server generation');
            // Keep the ID before sending: an accepted create can lose its reply.
            // A retry must reuse this floor rather than leave an unreachable durable pin.
            const proof = this.reservation ?? {generation:state.generation, id:`r${state.reservationEra}~${crypto.randomUUID()}`,
                pin:before.serverSeq + 1, version, epoch};
            if (proof.generation !== state.generation || proof.version !== version || proof.epoch !== epoch) throw new Error('Previous recovery reservation belongs to another server or schema');
            this.reservation = proof;
            this.options.onProof?.(structuredClone(proof));
            const result = await this.transport.reserveRecovery(proof.generation, proof.id, proof.pin);
            this.assertActive();
            if (!this.validProtection(result, proof)) throw new Error('Cannot protect the original recovery floor');
            const after = this.client.checkpoint();
            if (!this.clean() || this.client.epoch !== epoch || after.seq !== before.seq) throw new Error('Local state changed while establishing protection');
            const current = await this.transport.getRecoveryState();
            this.assertActive();
            const latest = this.client.checkpoint();
            if (!this.clean() || this.client.epoch !== epoch || latest.seq !== before.seq ||
                current.generation !== proof.generation || current.epoch !== epoch || current.schemaVersion !== version ||
                current.serverSeq < state.serverSeq) throw new Error('Server or local state changed while establishing protection');
            this.protection = {...proof, pin:result.status === 'protected' ? result.pin : proof.pin};
            this.releaseHistoryGuard ??= this.client.protectRecoveryHistory();
        } finally { this.busy = false; }
    }

    /** Recover exact pending changes without discarding the live undo history. */
    async recover(): Promise<void> {
        this.assertActive();
        if (this.busy || !this.protection || this.releaseIntent) throw new Error('Recovery protection is not available');
        if (this.client.online || !this.client.epoch || this.client.conditionalPending) throw new Error('Recovery requires a disconnected client without a conditional request');
        this.busy = true;
        try {
            const proof = this.protection, oldEpoch = this.client.epoch, checkpoint = this.client.checkpoint();
            const state = await this.transport.getRecoveryState();
            this.assertActive();
            if (state.generation !== proof.generation || state.schemaVersion !== proof.version || state.serverSeq < checkpoint.serverSeq) throw new Error('Server generation, schema or history changed');
            const reservation = await this.transport.reserveRecovery(proof.generation, proof.id, proof.pin, true);
            this.assertActive();
            if (!this.validProtection(reservation, proof) || reservation.status !== 'protected' || !reservation.existing) throw new Error('Original recovery protection is unavailable');
            let confirmedSeq = state.serverSeq;
            for (const change of checkpoint.pending) {
                let receipt = await this.transport.getChangeReceipt(proof.generation, change);
                this.assertActive();
                if (receipt.status === 'unknown') {
                    await this.transport.recoverChange(proof.generation, proof.id, proof.version, change);
                    this.assertActive();
                    receipt = await this.transport.getChangeReceipt(proof.generation, change);
                    this.assertActive();
                }
                if (receipt.status !== 'accepted' || receipt.generation !== proof.generation ||
                    !Number.isSafeInteger(receipt.serverSeq) || receipt.serverSeq < 1) throw new Error('Exact change receipt is unknown');
                confirmedSeq = Math.max(confirmedSeq, receipt.serverSeq);
            }
            const latest = await this.transport.getRecoveryState();
            this.assertActive();
            if (latest.generation !== proof.generation || latest.epoch !== state.epoch || latest.schemaVersion !== proof.version || latest.serverSeq < confirmedSeq) throw new Error('Server changed during recovery');
            this.client.resumeProvenEpoch(checkpoint, oldEpoch, latest.epoch);
            this.protection = {...proof, epoch:latest.epoch};
            this.reservation = this.protection;
            this.options.onProof?.(structuredClone(this.protection));
            this.client.connect();
        } finally { this.busy = false; }
    }

    /** Validate a stored proof before installing any stored local state. Reconnect through recover(). */
    async restore(checkpoint: ClientCheckpoint, value: LiveRecoveryProof): Promise<void> {
        this.assertActive();
        if (this.busy || this.reservation || this.client.online || this.client.pending.length || this.client.conditionalPending ||
            this.client.historyStatus().canUndo || this.client.historyStatus().canRedo) throw new Error('Restore requires a fresh disconnected recovery controller');
        const proof = structuredClone(value), stored = structuredClone(checkpoint);
        if (!proof || typeof proof.generation !== 'string' || !proof.generation || typeof proof.id !== 'string' || !proof.id ||
            typeof proof.epoch !== 'string' || !proof.epoch || proof.version !== schemaVersion(this.client.schema) ||
            !Number.isSafeInteger(proof.pin) || proof.pin < 1 || proof.pin > stored.serverSeq + 1) throw new Error('Invalid stored recovery proof');
        // Validate detached data before contacting the server or replacing the live replica.
        const validator = new SyncClient(this.client.actor, {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}}, {schema:this.client.schema, engineFactory:this.client.engineFactory});
        validator.restoreCheckpoint(stored, proof.epoch);
        validator.engine.dispose();
        const before = this.client.checkpoint();
        this.busy = true;
        try {
            const state = await this.transport.getRecoveryState(); this.assertActive();
            if (state.generation !== proof.generation || state.schemaVersion !== proof.version || state.serverSeq < stored.serverSeq) throw new Error('Server generation, schema or history changed');
            const result = await this.transport.reserveRecovery(proof.generation, proof.id, proof.pin, true); this.assertActive();
            if (!this.validProtection(result, proof) || result.status !== 'protected' || !result.existing) throw new Error('Original recovery protection is unavailable');
            if (this.client.online || JSON.stringify(this.client.checkpoint()) !== JSON.stringify(before)) throw new Error('Local recovery state changed during restore');
            this.client.restoreCheckpoint(stored, proof.epoch);
            this.reservation = proof; this.protection = proof;
            this.releaseHistoryGuard ??= this.client.protectRecoveryHistory();
        } finally { this.busy = false; }
    }

    /** Explicitly discard settled local undo/redo history and retire its durable reservation. */
    async retire(saveReleaseIntent: (record: LiveRecoveryRelease) => void | Promise<void>, clearIntent: () => void | Promise<void>): Promise<void> {
        this.assertActive();
        if (this.releaseIntent) return this.finishRetirement(this.releaseIntent, clearIntent);
        if (this.busy || !this.protection || !this.client.synchronized || !this.client.schemaVerified ||
            this.client.pending.length || this.client.conditionalPending) throw new Error('Retirement requires a protected synchronized client without pending changes');
        this.busy = true;
        this.client.disconnect();
        this.resumeMutations = this.client.pauseLocalMutations();
        let durable = false;
        try {
            const before = this.client.checkpoint();
            if (before.pending.length || this.client.conditionalPending || this.client.epoch !== this.protection.epoch) throw new Error('Recover the current epoch before retirement');
            const draft = new SyncClient(this.client.actor, {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}}, {schema:this.client.schema, engineFactory:this.client.engineFactory});
            draft.restoreCheckpoint(before, this.protection.epoch);
            draft.clearHistory();
            const empty = draft.checkpoint();
            draft.dispose();
            const record: LiveRecoveryRelease = {proof: structuredClone(this.protection), client: empty, releasePending:true};
            await saveReleaseIntent(structuredClone(record));
            durable = true;
            this.releaseIntent = record;
            this.assertActive();
            if (JSON.stringify(this.client.checkpoint()) !== JSON.stringify(before)) throw new Error('Local recovery state changed during retirement');
            // Only the durable intent authorizes removal of the live undo/redo history.
            this.client.engine.clearHistory();
        } catch (error) {
            if (!durable) { this.resumeMutations?.(); this.resumeMutations = null; }
            throw error;
        } finally { this.busy = false; }
        return this.finishRetirement(this.releaseIntent!, clearIntent);
    }

    /** Retry the same durable release after a lost response or a reload. Never restore discarded history. */
    async finishRetirement(value: LiveRecoveryRelease, clearIntent: () => void | Promise<void>): Promise<void> {
        this.assertActive();
        if (this.busy || this.client.online || this.client.pending.length || this.client.conditionalPending) throw new Error('Pending retirement requires a disconnected client without pending changes');
        const record = structuredClone(value), proof = record.proof;
        if (record.releasePending !== true || record.client.pending.length ||
            proof.version !== schemaVersion(this.client.schema) || record.client.actor !== this.client.actor ||
            !proof.generation || !proof.id || !proof.epoch || !Number.isSafeInteger(proof.pin) || proof.pin < 1) throw new Error('Invalid durable release intent');
        const validator = new SyncClient(this.client.actor, {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}}, {schema:this.client.schema, engineFactory:this.client.engineFactory});
        validator.restoreCheckpoint(record.client, proof.epoch);
        const history = validator.historyStatus();
        if (history.canUndo || history.canRedo) throw new Error('Invalid durable release history');
        validator.dispose();
        if ((this.releaseIntent && JSON.stringify(this.releaseIntent) !== JSON.stringify(record)) ||
            (this.reservation && (this.reservation.id !== proof.id || this.reservation.generation !== proof.generation))) throw new Error('A different recovery retirement is already pending');
        this.busy = true;
        this.releaseIntent = record;
        this.resumeMutations ??= this.client.pauseLocalMutations();
        try {
            const state = await this.transport.getRecoveryState(); this.assertActive();
            if (state.generation !== proof.generation || state.schemaVersion !== proof.version || state.serverSeq < record.client.serverSeq) throw new Error('Server generation, schema or history changed during retirement');
            await this.transport.releaseRecovery(proof.generation, proof.id); this.assertActive();
            this.client.restoreCheckpoint(record.client, state.epoch);
            // A failed cleanup leaves the same idempotent release available for another retry.
            await clearIntent(); this.assertActive();
            this.protection = null; this.reservation = null; this.releaseIntent = null;
            this.releaseHistoryGuard?.(); this.releaseHistoryGuard = null;
            this.resumeMutations?.(); this.resumeMutations = null;
        } finally { this.busy = false; }
    }

    /** Cancel in-flight work. The durable pin remains because local history can still need it. */
    dispose(): void { this.disposed = true; }
}
