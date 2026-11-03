import {resolveActorProfile} from "../client/profile.ts";
import type {ActorProfile} from "../client/profile.ts";

const RECORD_PROTOTYPES = Object.freeze([Object.prototype, null]);
const TEXT_TARGET_FIELDS = Object.freeze(["kind", "anchor", "focus"]);
const SHEET_TARGET_FIELDS = Object.freeze(["kind", "sheetId", "rowId", "columnId", "endRowId", "endColumnId"]);
const GRAPHIC_TARGET_FIELDS = Object.freeze(["kind", "objectIds", "pointer"]);
const POINTER_FIELDS = Object.freeze(["x", "y"]);
const DRAFT_FIELDS = Object.freeze(["target", "text", "selection", "composing", "field"]);
const TEXT_SELECTION_FIELDS = Object.freeze(["start", "end", "direction"]);
const PRESENCE_STATE_FIELDS = Object.freeze(["actor", "profile", "cursor", "selection", "draft", "activity", "updatedAt"]);
const PROFILE_FIELDS = Object.freeze(["name", "color", "avatar", "userId", "kind", "metadata"]);
const PRESENCE_PATCH_FIELDS = Object.freeze(["profile", "cursor", "selection", "draft", "activity"]);

const SELECTION_DIRECTIONS = Object.freeze(["forward", "backward", "none"]);
const PRESENCE_ACTIVITY_STATES = Object.freeze(["active", "idle", "away"]);

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
    if (!value || typeof value !== "object" || Array.isArray(value) || !RECORD_PROTOTYPES.includes(Object.getPrototypeOf(value))) fail();
    return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) fail(); }
function id(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.length > 1024) fail(); return value; }
function finite(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) fail(); return value; }
function target(value: unknown): PresenceTarget {
    const v = record(value);
    if (v.kind === "document") {
        keys(v, TEXT_TARGET_FIELDS);
        return Object.freeze({kind: "document", anchor: id(v.anchor), ...(v.focus === undefined ? {} : {focus: id(v.focus)})});
    }
    if (v.kind === "spreadsheet") {
        keys(v, SHEET_TARGET_FIELDS);
        if ((v.endRowId === undefined) !== (v.endColumnId === undefined)) fail();
        return Object.freeze({kind: "spreadsheet", sheetId: id(v.sheetId), rowId: id(v.rowId), columnId: id(v.columnId), ...(v.endRowId === undefined ? {} : {endRowId: id(v.endRowId), endColumnId: id(v.endColumnId)})});
    }
    if (v.kind === "graphic") {
        keys(v, GRAPHIC_TARGET_FIELDS);
        if (!Array.isArray(v.objectIds) || v.objectIds.length > 256) fail();
        const objectIds = Object.freeze(v.objectIds.map(id));
        let pointer: {readonly x: number; readonly y: number} | undefined;
        if (v.pointer !== undefined) { const p = record(v.pointer); keys(p, POINTER_FIELDS); pointer = Object.freeze({x: finite(p.x), y: finite(p.y)}); }
        return Object.freeze({kind: "graphic", objectIds, ...(pointer ? {pointer} : {})});
    }
    return fail();
}
function splitsSurrogate(text: string, offset: number): boolean {
    return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
}
function draft(value: unknown): PresenceDraft {
    const v = record(value); keys(v, DRAFT_FIELDS);
    if (typeof v.text !== "string" || v.text.length > 4096 || typeof v.composing !== "boolean") fail();
    let selection: PresenceDraft["selection"];
    if (v.selection !== undefined) {
        const s = record(v.selection); keys(s, TEXT_SELECTION_FIELDS);
        const start = finite(s.start), end = finite(s.end);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > v.text.length || !SELECTION_DIRECTIONS.includes(s.direction as string)) fail();
        if (splitsSurrogate(v.text, start) || splitsSurrogate(v.text, end)) fail();
        selection = Object.freeze({start, end, direction: s.direction as "forward" | "backward" | "none"});
    }
    return Object.freeze({target: target(v.target), text: v.text, composing: v.composing, ...(v.field === undefined ? {} : {field: id(v.field)}), ...(selection ? {selection} : {})});
}
/** Validate and copy before a store or transport accepts any state. */
export function validatePresenceState(value: unknown): PresenceState {
    const v = record(value); keys(v, PRESENCE_STATE_FIELDS);
    const actor = id(v.actor), updatedAt = finite(v.updatedAt);
    if (updatedAt < 0) fail();
    const result: {actor: string; updatedAt: number; profile?: ActorProfile; cursor?: PresenceTarget; selection?: PresenceTarget; draft?: PresenceDraft; activity?: PresenceState["activity"]} = {actor, updatedAt};
    if (v.profile !== undefined) {
        const p = record(v.profile); keys(p, PROFILE_FIELDS);
        result.profile = resolveActorProfile(actor, p as ActorProfile);
    }
    if (v.cursor !== undefined) result.cursor = target(v.cursor);
    if (v.selection !== undefined) result.selection = target(v.selection);
    if (v.draft !== undefined) result.draft = draft(v.draft);
    if (v.activity !== undefined) { if (!PRESENCE_ACTIVITY_STATES.includes(v.activity as string)) fail(); result.activity = v.activity as PresenceState["activity"]; }
    if (JSON.stringify(result).length > 12288) fail();
    return Object.freeze(result);
}
interface PresenceStoreState {
    readonly entries: Map<string, PresenceState>;
    readonly received: Map<string, number>;
    readonly listeners: Set<() => void>;
    readonly now: () => number;
    readonly max: number;
    snapshot: PresenceSnapshot;
    disposed: boolean;
}
function assertLive(state: PresenceStoreState): void {
    if (state.disposed) throw new Error("Presence store is disposed");
}
function time(state: PresenceStoreState, value?: number): number {
    const now = state.now;
    const at = value === undefined ? now() : value;
    if (!Number.isFinite(at) || at < 0) fail();
    return at;
}
function compareActors(a: PresenceState, b: PresenceState): number {
    return a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0;
}
function emit(state: PresenceStoreState): void {
    state.snapshot = Object.freeze([...state.entries.values()].sort(compareActors));
    for (const listener of [...state.listeners]) { try { listener(); } catch { /* One subscriber cannot block other subscribers. */ } }
}
function put(store: PresenceStoreState, state: PresenceState, at: number): void {
    if (!store.entries.has(state.actor) && store.entries.size >= store.max) throw new RangeError("Presence actor limit exceeded");
    const old = store.entries.get(state.actor); store.received.set(state.actor, at);
    if (old && JSON.stringify(old) === JSON.stringify(state)) return;
    store.entries.set(state.actor, state); emit(store);
}
export function createPresenceStore(options: PresenceStoreOptions): PresenceStore {
    const actor = id(options.actor), now = options.now ?? Date.now, ttl = options.ttlMs ?? 30000, max = options.maxActors ?? 100;
    if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isSafeInteger(max) || max < 1 || max > 10000) throw new TypeError("Invalid presence limits");
    const state: PresenceStoreState = {
        entries: new Map(), received: new Map(), listeners: new Set(), now, max,
        snapshot: Object.freeze([]), disposed: false,
    };
    const {entries, received, listeners} = state;
    if (options.profile !== undefined) put(state, validatePresenceState({actor, profile: options.profile, updatedAt: time(state)}), time(state));
    return {
        actor,
        getSnapshot: () => state.snapshot,
        subscribe(listener) { assertLive(state); if (typeof listener !== "function") throw new TypeError("Invalid presence listener"); listeners.add(listener); return () => { listeners.delete(listener); }; },
        updateLocal(update) {
            assertLive(state); const patch = record(update); keys(patch, PRESENCE_PATCH_FIELDS);
            const next: Record<string, unknown> = {...entries.get(actor), actor, updatedAt: time(state)};
            for (const [key, value] of Object.entries(patch)) { if (value === null) delete next[key]; else if (value !== undefined) next[key] = value; }
            put(state, validatePresenceState(next), time(state));
        },
        clearLocal() { assertLive(state); if (entries.delete(actor)) { received.delete(actor); emit(state); } },
        receive(value) { assertLive(state); const next = validatePresenceState(value); if (next.actor === actor) return; const at = time(state); put(state, next, at); },
        remove(key) { assertLive(state); id(key); if (entries.delete(key)) { received.delete(key); emit(state); } },
        expire(value) { assertLive(state); const at = time(state, value); let changed = false; for (const [key, last] of received) { if (key !== actor && at - last >= ttl) { entries.delete(key); received.delete(key); changed = true; } } if (changed) emit(state); },
        dispose() { if (state.disposed) return; state.disposed = true; entries.clear(); received.clear(); emit(state); listeners.clear(); },
    };
}
