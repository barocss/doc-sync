import {resolveActorProfile} from "../client/profile.ts";
import type {ActorProfile} from "../client/profile.ts";

export type PresenceTarget =
    | {readonly kind: "document"; readonly anchor: string; readonly focus?: string}
    | {readonly kind: "graphic"; readonly objectIds: readonly string[]; readonly pointer?: {readonly x: number; readonly y: number}}
    | {readonly kind: "spreadsheet"; readonly sheetId: string; readonly rowId: string; readonly columnId: string; readonly endRowId?: string; readonly endColumnId?: string};
export interface PresenceDraft {
    readonly target: PresenceTarget;
    readonly text: string;
    readonly field?: string;
    /** UTF-16 offsets. Composing text is never committed by this store. */
    readonly selection?: {readonly start: number; readonly end: number; readonly direction: "forward" | "backward" | "none"};
    readonly composing: boolean;
}
export interface PresenceState {
    readonly actor: string;
    readonly profile?: ActorProfile;
    readonly cursor?: PresenceTarget;
    readonly selection?: PresenceTarget;
    readonly draft?: PresenceDraft;
    readonly activity?: "active" | "idle" | "away";
    readonly updatedAt: number;
}
export type PresenceSnapshot = readonly PresenceState[];
export type PresenceUpdate = {readonly [K in "profile" | "cursor" | "selection" | "draft" | "activity"]?: PresenceState[K] | null};
export interface PresenceStoreOptions {
    actor: string;
    profile?: ActorProfile;
    /** Expiry is explicit: call expire() from the application's lifecycle. No timer is created. */
    ttlMs?: number;
    maxActors?: number;
    now?: () => number;
}
export interface PresenceStore {
    readonly actor: string;
    getSnapshot(): PresenceSnapshot;
    subscribe(listener: () => void): () => void;
    updateLocal(update: PresenceUpdate): void;
    clearLocal(): void;
    receive(state: PresenceState): void;
    remove(actor: string): void;
    expire(now?: number): void;
    dispose(): void;
}
function fail(): never { throw new TypeError("Invalid presence state"); }
function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
    return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) fail(); }
function id(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.length > 1024) fail(); return value; }
function finite(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) fail(); return value; }
function target(value: unknown): PresenceTarget {
    const v = record(value);
    if (v.kind === "document") {
        keys(v, ["kind", "anchor", "focus"]);
        return Object.freeze({kind: "document", anchor: id(v.anchor), ...(v.focus === undefined ? {} : {focus: id(v.focus)})});
    }
    if (v.kind === "spreadsheet") {
        keys(v, ["kind", "sheetId", "rowId", "columnId", "endRowId", "endColumnId"]);
        if ((v.endRowId === undefined) !== (v.endColumnId === undefined)) fail();
        return Object.freeze({kind: "spreadsheet", sheetId: id(v.sheetId), rowId: id(v.rowId), columnId: id(v.columnId), ...(v.endRowId === undefined ? {} : {endRowId: id(v.endRowId), endColumnId: id(v.endColumnId)})});
    }
    if (v.kind === "graphic") {
        keys(v, ["kind", "objectIds", "pointer"]);
        if (!Array.isArray(v.objectIds) || v.objectIds.length > 256) fail();
        const objectIds = Object.freeze(v.objectIds.map(id));
        let pointer: {readonly x: number; readonly y: number} | undefined;
        if (v.pointer !== undefined) { const p = record(v.pointer); keys(p, ["x", "y"]); pointer = Object.freeze({x: finite(p.x), y: finite(p.y)}); }
        return Object.freeze({kind: "graphic", objectIds, ...(pointer ? {pointer} : {})});
    }
    return fail();
}
function draft(value: unknown): PresenceDraft {
    const v = record(value); keys(v, ["target", "text", "selection", "composing", "field"]);
    if (typeof v.text !== "string" || v.text.length > 4096 || typeof v.composing !== "boolean") fail();
    let selection: PresenceDraft["selection"];
    if (v.selection !== undefined) {
        const s = record(v.selection); keys(s, ["start", "end", "direction"]);
        const start = finite(s.start), end = finite(s.end);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > v.text.length || !["forward", "backward", "none"].includes(s.direction as string)) fail();
        const split = (offset: number) => offset > 0 && offset < (v.text as string).length && /[\uD800-\uDBFF]/.test((v.text as string)[offset - 1]) && /[\uDC00-\uDFFF]/.test((v.text as string)[offset]);
        if (split(start) || split(end)) fail();
        selection = Object.freeze({start, end, direction: s.direction as "forward" | "backward" | "none"});
    }
    return Object.freeze({target: target(v.target), text: v.text, composing: v.composing, ...(v.field === undefined ? {} : {field: id(v.field)}), ...(selection ? {selection} : {})});
}
/** Validate and copy before a store or transport accepts any state. */
export function validatePresenceState(value: unknown): PresenceState {
    const v = record(value); keys(v, ["actor", "profile", "cursor", "selection", "draft", "activity", "updatedAt"]);
    const actor = id(v.actor), updatedAt = finite(v.updatedAt);
    if (updatedAt < 0) fail();
    const result: {actor: string; updatedAt: number; profile?: ActorProfile; cursor?: PresenceTarget; selection?: PresenceTarget; draft?: PresenceDraft; activity?: PresenceState["activity"]} = {actor, updatedAt};
    if (v.profile !== undefined) {
        const p = record(v.profile); keys(p, ["name", "color", "avatar", "userId", "kind", "metadata"]);
        result.profile = resolveActorProfile(actor, p as ActorProfile);
    }
    if (v.cursor !== undefined) result.cursor = target(v.cursor);
    if (v.selection !== undefined) result.selection = target(v.selection);
    if (v.draft !== undefined) result.draft = draft(v.draft);
    if (v.activity !== undefined) { if (!["active", "idle", "away"].includes(v.activity as string)) fail(); result.activity = v.activity as PresenceState["activity"]; }
    if (JSON.stringify(result).length > 12288) fail();
    return Object.freeze(result);
}
export function createPresenceStore(options: PresenceStoreOptions): PresenceStore {
    const actor = id(options.actor), now = options.now ?? Date.now, ttl = options.ttlMs ?? 30000, max = options.maxActors ?? 100;
    if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isSafeInteger(max) || max < 1 || max > 10000) throw new TypeError("Invalid presence limits");
    const entries = new Map<string, PresenceState>(), received = new Map<string, number>(), listeners = new Set<() => void>();
    let snapshot: PresenceSnapshot = Object.freeze([]), disposed = false;
    const assertLive = () => { if (disposed) throw new Error("Presence store is disposed"); };
    const time = (value = now()) => { if (!Number.isFinite(value) || value < 0) fail(); return value; };
    const emit = () => {
        snapshot = Object.freeze([...entries.values()].sort((a, b) => a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0));
        for (const listener of [...listeners]) { try { listener(); } catch { /* One subscriber cannot block other subscribers. */ } }
    };
    const put = (state: PresenceState, at: number) => {
        if (!entries.has(state.actor) && entries.size >= max) throw new RangeError("Presence actor limit exceeded");
        const old = entries.get(state.actor); received.set(state.actor, at);
        if (old && JSON.stringify(old) === JSON.stringify(state)) return;
        entries.set(state.actor, state); emit();
    };
    if (options.profile !== undefined) put(validatePresenceState({actor, profile: options.profile, updatedAt: time()}), time());
    return {
        actor,
        getSnapshot: () => snapshot,
        subscribe(listener) { assertLive(); if (typeof listener !== "function") throw new TypeError("Invalid presence listener"); listeners.add(listener); return () => { listeners.delete(listener); }; },
        updateLocal(update) {
            assertLive(); const patch = record(update); keys(patch, ["profile", "cursor", "selection", "draft", "activity"]);
            const next: Record<string, unknown> = {...entries.get(actor), actor, updatedAt: time()};
            for (const [key, value] of Object.entries(patch)) { if (value === null) delete next[key]; else if (value !== undefined) next[key] = value; }
            put(validatePresenceState(next), time());
        },
        clearLocal() { assertLive(); if (entries.delete(actor)) { received.delete(actor); emit(); } },
        receive(value) { assertLive(); const state = validatePresenceState(value); if (state.actor === actor) return; const at = time(); put(state, at); },
        remove(key) { assertLive(); id(key); if (entries.delete(key)) { received.delete(key); emit(); } },
        expire(value) { assertLive(); const at = time(value); let changed = false; for (const [key, last] of received) { if (key !== actor && at - last >= ttl) { entries.delete(key); received.delete(key); changed = true; } } if (changed) emit(); },
        dispose() { if (disposed) return; disposed = true; entries.clear(); received.clear(); emit(); listeners.clear(); },
    };
}
