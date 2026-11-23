import type {ClientCheckpoint, SyncClient} from './client.ts';
import type {LiveRecovery, LiveRecoveryProof, LiveRecoveryRelease} from './live-recovery.ts';

export type BrowserRecoveryIdentity = {server: string; document: string; slot: string};
export type BrowserRecoveryRecord = {
    format: 1; identity: BrowserRecoveryIdentity; actor: string;
    checkpoint: ClientCheckpoint | null; proof: LiveRecoveryProof | null;
    release: LiveRecoveryRelease | null; retired: boolean;
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export type BrowserRecoveryLocks = {
    request<T>(name: string, options: {mode: 'exclusive'; ifAvailable: true}, callback: (lock: unknown | null) => Promise<T>): Promise<T>;
};

/** One origin-local replica. Web Locks fence duplicate tabs; synchronous writes precede network writes. */
export class BrowserRecovery {
    readonly actor: string;
    readonly key: string;
    onFailure: ((error: Error) => void) | null = null;
    private readonly storage: Storage;
    private value: BrowserRecoveryRecord;
    private unlock: (() => void) | null;
    private client: SyncClient | null = null;
    private recovery: LiveRecovery | null = null;
    private failed: Error | null = null;
    private failurePaused = false;
    private priorCheckpoint: (() => void) | null = null;

    private constructor(key: string, storage: Storage, value: BrowserRecoveryRecord, unlock: () => void) {
        this.key = key; this.storage = storage; this.value = value; this.actor = value.actor; this.unlock = unlock;
    }

    static async open(identity: BrowserRecoveryIdentity, options: {storage?: Storage; locks?: BrowserRecoveryLocks} = {}): Promise<BrowserRecovery> {
        if (!identity || Object.values(identity).some(value => typeof value !== 'string' || !value)) throw new Error('Recovery identity is incomplete');
        const storage = options.storage ?? globalThis.localStorage;
        const locks = options.locks ?? globalThis.navigator?.locks;
        if (!storage || !locks) throw new Error('Durable recovery requires local storage and Web Locks');
        const key = `doc-sync:browser-recovery:v1:${JSON.stringify([identity.server, identity.document, identity.slot])}`;
        let resolve!: (session: BrowserRecovery) => void, reject!: (error: unknown) => void;
        const opened = new Promise<BrowserRecovery>((yes, no) => { resolve = yes; reject = no; });
        void locks.request(key, {mode:'exclusive', ifAvailable:true}, async lock => {
            if (!lock) { reject(new Error('This recovery actor is already open in another tab')); return; }
            let release!: () => void;
            const held = new Promise<void>(done => { release = done; });
            try {
                const raw = storage.getItem(key);
                const value = raw === null ? {format:1 as const, identity:structuredClone(identity), actor:`browser-${crypto.randomUUID()}`,
                    checkpoint:null, proof:null, release:null, retired:false} : parseRecord(raw, identity);
                const session = new BrowserRecovery(key, storage, value, release);
                session.write(value); // Detect denied/quota-limited storage before any connection.
                resolve(session);
                await held;
            } catch (error) { reject(error); }
        }).catch(reject);
        return opened;
    }

    get record(): BrowserRecoveryRecord { return structuredClone(this.value); }
    get stopped(): boolean { return this.failed !== null || this.value.release !== null || this.value.retired || this.unlock === null; }

    bind(client: SyncClient, recovery: LiveRecovery): void {
        if (this.client || client.actor !== this.actor) throw new Error('Recovery actor does not match this session');
        this.client = client; this.recovery = recovery; this.priorCheckpoint = client.onCheckpoint;
        client.onCheckpoint = () => { this.persist(); this.priorCheckpoint?.(); };
    }

    private write(value: BrowserRecoveryRecord): void {
        if (!this.unlock) throw new Error('Recovery actor lock is closed');
        const raw = JSON.stringify(value);
        try {
            this.storage.setItem(this.key, raw);
            if (this.storage.getItem(this.key) !== raw) throw new Error('Recovery checkpoint did not persist exactly');
            this.value = structuredClone(value);
        } catch (error) {
            throw this.stop(new Error(`Recovery storage failed: ${error instanceof Error ? error.message : String(error)}`));
        }
    }

    private stop(error: unknown): Error {
        this.failed ??= error instanceof Error ? error : new Error(String(error));
        if (this.client && !this.failurePaused) {
            // Proof and retirement writes also run outside the client send hook.
            try { this.client.disconnect(); } catch { /* The failed hook already stopped the connection. */ }
            if (!this.client.online && !this.client.conditionalPending) { this.client.pauseLocalMutations(); this.failurePaused = true; }
        }
        try { this.onFailure?.(this.failed); } catch { /* Keep the checkpoint failure as the cause. */ }
        return this.failed;
    }

    /** Pass to LiveRecovery.onProof. The reservation ID is durable before its create request. */
    saveProof = (proof: LiveRecoveryProof): void => {
        if (!this.client || this.failed || this.stopped) throw this.failed ?? new Error('Recovery session is stopped');
        this.write({...this.value, checkpoint:this.client.checkpoint(), proof:structuredClone(proof)});
    };

    /** Pass to ClientOptions.beforeSend, and persist each notified local/remote transition. */
    persist = (): void => {
        if (this.failed) throw this.failed;
        if (!this.unlock) throw new Error('Recovery actor lock is closed');
        if (this.value.release || this.value.retired) return; // Never overwrite a release intent with live history.
        try {
            const proof = this.recovery?.proof ?? this.value.proof;
            this.write({...this.value, checkpoint:proof && this.client ? this.client.checkpoint() : null, proof});
        } catch (error) { throw this.stop(error); }
    };

    /** No new subscription or edit is allowed until server proof succeeds. */
    async restore(): Promise<'new' | 'restored' | 'retired'> {
        if (!this.client || !this.recovery) throw new Error('Bind the recovery session first');
        if (this.value.release) {
            await this.recovery.finishRetirement(this.value.release, this.clearRelease);
            return 'retired';
        }
        if (!this.value.proof) return 'new';
        if (!this.value.checkpoint) throw new Error('Recovery proof has no checkpoint');
        await this.recovery.restore(this.value.checkpoint, this.value.proof);
        await this.recovery.recover();
        return 'restored';
    }

    private saveRelease = (release: LiveRecoveryRelease): void => {
        this.write({...this.value, checkpoint:release.client, proof:release.proof, release:structuredClone(release), retired:false});
    };
    private clearRelease = (): void => { this.write({...this.value, retired:true}); };

    async retire(): Promise<void> {
        if (!this.recovery) throw new Error('Bind the recovery session first');
        if (this.value.release) await this.recovery.finishRetirement(this.value.release, this.clearRelease);
        else await this.recovery.retire(this.saveRelease, this.clearRelease);
    }

    /** Call only after disconnecting. The saved checkpoint and server reservation remain. */
    close(): void {
        if (!this.unlock) return;
        if (this.client?.online) throw new Error('Disconnect before releasing the recovery actor lock');
        if (this.client) {
            if (!this.client.conditionalPending) this.client.pauseLocalMutations();
            this.client.onCheckpoint = this.priorCheckpoint;
        }
        this.unlock?.(); this.unlock = null;
    }
}

function parseRecord(raw: string, identity: BrowserRecoveryIdentity): BrowserRecoveryRecord {
    let value: BrowserRecoveryRecord;
    try { value = JSON.parse(raw); } catch { throw new Error('Recovery storage is not valid JSON'); }
    if (!value || value.format !== 1 || JSON.stringify(value.identity) !== JSON.stringify(identity) ||
        typeof value.actor !== 'string' || !value.actor || typeof value.retired !== 'boolean' ||
        !Object.hasOwn(value, 'checkpoint') || !Object.hasOwn(value, 'proof') || !Object.hasOwn(value, 'release') ||
        (value.checkpoint !== null && value.checkpoint.actor !== value.actor) ||
        ((value.proof === null) !== (value.checkpoint === null)) ||
        (value.release !== null && (!value.release || value.release.releasePending !== true ||
            JSON.stringify(value.release.proof) !== JSON.stringify(value.proof) || JSON.stringify(value.release.client) !== JSON.stringify(value.checkpoint))) ||
        (value.retired && value.release === null)) throw new Error('Recovery storage identity or state is invalid');
    return value;
}
