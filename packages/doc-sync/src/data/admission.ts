import {Doc, MAIN} from "../crdt/doc.ts";
import type {Item} from "../crdt/doc.ts";
import {annotationJsonOk} from "../crdt/annotations.ts";
import {keyOf} from "../crdt/ticket.ts";
import type {Change} from "../sync/protocol.ts";
import {createDataSchema} from "./schema.ts";

const DATA_OPERATION_KINDS = Object.freeze(["node", "set", "del", "undel", "move"]);
const DATA_RECORD_KINDS = Object.freeze(["map", "list", "entry"]);


function fail(message: string): never { throw new Error(`Data: ${message}`); }
const validId = (id: unknown): id is string => typeof id === "string" && /^data:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
type Identity = {id: string; kind: string; key: string};

/** Check descriptors before cloning can hide malformed payloads or invoke getters. */
export function validateDataPayload(change: Change): void {
    if (!annotationJsonOk(change, 128)) fail("payload must contain finite plain JSON data without accessors");
    if (typeof change.actor !== "string" || !/^[\w~-]+$/.test(change.actor) || change.actor === "~root" || !Number.isSafeInteger(change.seq) || change.seq < 1) fail("invalid change actor or sequence");
    if (!Array.isArray(change.ops) || change.ops.some(op => !op || !DATA_OPERATION_KINDS.includes(op.t))) fail("invalid storage operation");
}

function encoded(value: unknown, identities: Map<string, Identity>): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid encoded value");
    const record = value as Record<string, unknown>, fields = Object.keys(record);
    if (fields.length === 1 && Object.hasOwn(record, "scalar")) {
        const scalar = record.scalar;
        if (scalar === null || typeof scalar === "string" || typeof scalar === "boolean" || typeof scalar === "number" && Number.isFinite(scalar)) return;
        fail("invalid encoded scalar");
    }
    if (fields.length === 2 && Object.hasOwn(record, "reference") && Object.hasOwn(record, "kind")) {
        const {reference, kind} = record;
        if (kind !== "map" && kind !== "list") fail("invalid reference kind");
        if (reference === "$root" && kind === "map") return;
        const target = typeof reference === "string" && identities.get(reference);
        if (target && target.kind === kind) return;
        fail("unknown reference or reference kind mismatch");
    }
    fail("invalid encoded value");
}

function retained(doc: Doc): {tokens: Map<string, Identity>; ids: Map<string, Identity>} {
    const tokens = new Map<string, Identity>(), ids = new Map<string, Identity>();
    for (const line of doc.lines()) for (const item of line.items) {
        if (item.kind === "head" || item.key === line.key || item.key === MAIN) continue;
        if (item.compact) fail("compacted data identities are unavailable");
        if (item.kind !== "node" || !DATA_RECORD_KINDS.includes(item.born)) fail("invalid storage node kind");
        const id = item.attrs.get("id")?.value, key = item.attrs.has("key") ? item.attrs.get("key")!.value : "";
        if (!validId(id)) fail("invalid storage ID");
        if (typeof key !== "string") fail("invalid encoded map key");
        if (item.born === "entry" && !item.attrs.has("value")) fail("missing encoded value");
        if ((item.attrs.has("$type") ? item.attrs.get("$type")!.value : item.born) !== item.born) fail("storage node kind is immutable");
        if (ids.has(id)) fail("duplicate storage ID");
        const identity = {id, kind: item.born, key};
        tokens.set(item.key, identity); ids.set(id, identity);
    }
    return {tokens, ids};
}

function valueOf(item: Item): unknown { return item.attrs.get("value")?.value; }

/** Pure semantic admission. Deleted nodes remain identities and reference targets. */
export function validateDataChange(doc: Doc, change: Change): void {
    const before = retained(doc);
    const tokens = new Map(before.tokens), ids = new Map(before.ids);
    // Collect every birth first. Atomic batches can contain forward references.
    for (const op of change.ops) if (op.t === "node") {
        const id = op.attrs?.id, key = op.attrs && Object.hasOwn(op.attrs, "key") ? op.attrs.key : "";
        if (!validId(id)) fail("invalid storage ID");
        if (!DATA_RECORD_KINDS.includes(op.type)) fail("invalid storage node kind");
        if (typeof key !== "string") fail("invalid encoded map key");
        const token = keyOf(op.id), previous = tokens.get(token), identity = {id, kind: op.type, key};
        if (previous && (previous.id !== id || previous.kind !== op.type || previous.key !== key)) fail("storage identity is immutable");
        if (!previous && ids.has(id)) fail("duplicate storage ID");
        tokens.set(token, identity); ids.set(id, identity);
    }
    // Check authored values even when their LWW write would lose or be hidden.
    for (const op of change.ops) {
        if (op.t === "node" && op.type === "entry") encoded(op.attrs?.value, ids);
        if (op.t !== "set") continue;
        for (const target of op.ids) {
            const identity = tokens.get(keyOf(target));
            if (!identity) fail("invalid storage attribute target");
            if (op.key === "id" && op.value !== identity.id || op.key === "$type" && op.value !== identity.kind || op.key === "key" && op.value !== identity.key) fail("storage identity is immutable");
            if (op.key === "value") {
                if (identity.kind !== "entry") fail("invalid storage value target");
                encoded(op.value, ids);
            }
        }
    }
    // Apply only to a private candidate. Model defaults and visibility cannot hide bad state.
    const candidate = Doc.fromSnapshot("~data-admission", doc.snapshot(), createDataSchema());
    for (const op of change.ops) candidate.apply(op);
    for (const op of change.ops) if (op.t === "move") {
        const target = candidate.get(keyOf(op.target));
        if (!target || target.line.key !== keyOf(op.parent)) fail("storage collection membership is immutable");
    }
    const after = retained(candidate);
    for (const line of candidate.lines()) for (const item of line.items) {
        if (item.born === "entry") encoded(valueOf(item), after.ids);
    }
}
