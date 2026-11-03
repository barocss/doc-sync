import {Client} from "../client/index.ts";
import {SyncClient} from "../sync/client.ts";
import {createSyncClientEditorHost, getSyncClientEditorHostOwner} from "../editor/sync-client-host.ts";
import type {EditorHost} from "../editor/host-contract.ts";
import type {PresenceInput} from "../sync/protocol.ts";
import {resolveActorProfile} from "../client/profile.ts";
import type {ProfileJSON} from "../client/profile.ts";
import {validatePresenceState} from "./store.ts";
import type {PresenceState, PresenceStore} from "./store.ts";

const REPLACEABLE_PRESENCE_FIELDS = Object.freeze(["cursor", "selection", "draft", "activity"] as const);


export const PRESENCE_METADATA_KEY = "doc-sync.presence.v1";
export interface ClientPresenceOptions {
    intervalMs?: number;
    initialPresence?: PresenceInput;
    onError?: (error: Error) => void;
}
export interface ClientPresenceConnection {
    readonly lastError: Error | null;
    /** Send a normal editor selection through the same metadata-preserving bridge. */
    setPresence(value: PresenceInput): void;
    dispose(): void;
}
const connections = new WeakSet<object>();
/**
 * Use existing ephemeral presence transport. No document model, history, or CRDT operation is read or written.
 * Client and SyncClient sources share the backend wrapper with existing editor bindings. A bare EditorHost
 * uses its known SyncClient owner where available; otherwise only calls through that host are intercepted.
 * Mount before editor bindings, or supply initialPresence; until an editor selection is captured, feature
 * publication is deferred. Reconnect clears draft state. Feature changes use a trailing throttle; clears
 * are immediate. Profile metadata remains in the source profile namespace, not in the feature envelope.
 * Session sequence numbers reject reordered packets for an existing observer, including clear tombstones.
 * History retains at most 1000 actors and eight retired sessions per actor. A new observer or evicted
 * history cannot identify an unseen old session; this does not impose server-wide presence ordering.
 * lastError/onError report a rejected outgoing envelope. Call connection.dispose() before disposing the source or store.
 */
export function connectClientPresence(store: PresenceStore, source: Client | SyncClient | EditorHost, options: ClientPresenceOptions = {}): ClientPresenceConnection {
    const interval = options.intervalMs ?? 50;
    if (!Number.isFinite(interval) || interval < 0 || interval > 60000) throw new TypeError("Invalid presence interval");
    let timer: ReturnType<typeof setTimeout> | undefined, lastSent = -Infinity, lastError: Error | null = null;
    let captured = options.initialPresence !== undefined, connectedOnce = false;
    const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const host = source instanceof SyncClient ? createSyncClientEditorHost(source) : source;
    const owner = source instanceof Client ? source.sync ?? source : source instanceof SyncClient ? source : getSyncClientEditorHostOwner(source);
    const sender = owner instanceof SyncClient ? owner : host;
    if (source.actor !== store.actor) throw new Error("Presence source actor does not match store actor");
    if (connections.has(sender)) throw new Error("Presence source already has a bridge");
    const ownDescriptor = Object.getOwnPropertyDescriptor(sender, "setPresence"), original = sender.setPresence;
    const sourceProfile = source instanceof Client || source instanceof SyncClient ? source.profile : undefined;
    let editor: PresenceInput = options.initialPresence ?? {anchor: null, focus: null, ...(sourceProfile ?? {})};
    let local = store.getSnapshot().find(state => state.actor === store.actor), disposed = false, ready = false;
    const known = new Map<string, string>();
    const session = globalThis.crypto.randomUUID();
    let sequence = 0;
    // Session history survives clear/leave but stays bounded. Eviction ends ordering protection for that history.
    const highwater = new Map<string, {session: string; seq: number; retired: string[]}>();
    const merge = (value: PresenceInput): PresenceInput => {
        const metadata: Record<string, ProfileJSON> = {...(value.metadata ?? sourceProfile?.metadata)};
        delete metadata[PRESENCE_METADATA_KEY];
        if (local) {
            // Profile metadata stays at its existing wire depth, outside the feature envelope.
            const profile = local.profile ? Object.fromEntries(Object.entries(local.profile).filter(([key]) => key !== "metadata")) : undefined;
            const state = {...local, ...(profile ? {profile} : {})};
            metadata[PRESENCE_METADATA_KEY] = {version: 1, session, seq: ++sequence, state: state as unknown as ProfileJSON};
        } else metadata[PRESENCE_METADATA_KEY] = {version: 1, session, seq: ++sequence, state: null};
        resolveActorProfile(store.actor, {...value, metadata});
        return {...value, metadata};
    };
    const publish = () => {
        cancel();
        if (!captured || disposed) return;
        try { const value = merge(editor); original.call(sender, value); lastSent = Date.now(); lastError = null; }
        catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); options.onError?.(lastError); }
    };
    const wrapped = (value: PresenceInput) => {
        if (disposed) { original.call(sender, value); return; }
        // Keep the caller's newest anchors and unrelated metadata. Never replay an older editor selection.
        const next = {...value, ...(value.metadata === undefined ? {} : {metadata: {...value.metadata}})};
        const merged = merge(next); // Validate the full envelope before changing captured editor state.
        editor = next; captured = true; cancel();
        original.call(sender, merged); lastSent = Date.now(); lastError = null;
    };
    const refresh = () => {
        if (disposed) return;
        const status = host.status(), nextReady = status.online && (ready || status.synchronized);
        const republish = nextReady && !ready;
        ready = nextReady;
        if (republish) {
            const reconnect = connectedOnce; connectedOnce = true;
            if (reconnect && local?.draft) store.updateLocal({draft: null});
            else if (local) publish();
        }
        const present = new Set<string>();
        for (const peer of host.presence()) {
            if (peer.actor === store.actor) continue;
            const encoded = peer.metadata?.[PRESENCE_METADATA_KEY];
            if (!encoded || typeof encoded !== "object" || Array.isArray(encoded) || !("version" in encoded) || encoded.version !== 1 || !("state" in encoded)) continue;
            present.add(peer.actor);
            try {
                if (!("session" in encoded) || typeof encoded.session !== "string" || !encoded.session || encoded.session.length > 128 || !("seq" in encoded) || typeof encoded.seq !== "number" || !Number.isSafeInteger(encoded.seq) || encoded.seq < 1) continue;
                const state = encoded.state === null ? null : validatePresenceState(encoded.state);
                if (state && state.actor !== peer.actor) continue;
                present.add(peer.actor);
                const previous = highwater.get(peer.actor);
                if (previous && (previous.retired.includes(encoded.session) || (previous.session === encoded.session && encoded.seq <= previous.seq))) continue;
                const fingerprint = JSON.stringify(state);
                // Apply before advancing high-water: a bounded store rejection must remain atomic.
                if (state) store.receive(state);
                else store.remove(peer.actor);
                if (state) known.set(peer.actor, fingerprint);
                else known.delete(peer.actor);
                const retired = previous && previous.session !== encoded.session ? [...previous.retired, previous.session].slice(-8) : previous?.retired ?? [];
                if (!highwater.has(peer.actor) && highwater.size >= 1000) { const evicted = highwater.keys().next().value!; highwater.delete(evicted); known.delete(evicted); }
                highwater.set(peer.actor, {session: encoded.session, seq: encoded.seq, retired});
            } catch { /* Reject an invalid peer atomically; it cannot interrupt source notifications. */ }
        }
        for (const actor of known.keys()) if (!present.has(actor)) { store.remove(actor); known.delete(actor); }
    };
    connections.add(sender);
    sender.setPresence = wrapped;
    let stopSource: (() => void) | undefined, stopStore: (() => void) | undefined;
    const cleanup = () => {
        if (sender.setPresence === wrapped) {
            if (ownDescriptor) Object.defineProperty(sender, "setPresence", ownDescriptor);
            else delete (sender as unknown as {setPresence?: unknown}).setPresence;
        }
        connections.delete(sender);
    };
    try {
        stopSource = host.subscribe({update: refresh});
        stopStore = store.subscribe(() => {
            if (disposed) return;
            const next = store.getSnapshot().find(state => state.actor === store.actor);
            if (next === local) return;
            const cleared = !next || (!!local && (REPLACEABLE_PRESENCE_FIELDS).some(key => local?.[key] !== undefined && next[key] === undefined));
            local = next;
            if (cleared || interval === 0 || Date.now() - lastSent >= interval) publish();
            else if (timer === undefined) { timer = setTimeout(publish, Math.max(0, interval - (Date.now() - lastSent))); timer.unref?.(); }
        });
        refresh();
    } catch (error) { disposed = true; cancel(); stopSource?.(); stopStore?.(); cleanup(); throw error; }
    return {
        get lastError() { return lastError; },
        setPresence(value) { if (disposed) throw new Error("Presence connection is disposed"); sender.setPresence(value); },
        dispose() {
            if (disposed) return;
            disposed = true; cancel(); stopSource?.(); stopStore?.();
            const owned = sender.setPresence === wrapped;
            cleanup();
            // Clear only this feature namespace; a newer wrapper retains ownership of its method.
            if (owned && captured) { local = undefined; try { original.call(sender, merge(editor)); } catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); options.onError?.(lastError); } }
            for (const actor of known.keys()) store.remove(actor);
            known.clear(); highwater.clear();
        },
    };
}
