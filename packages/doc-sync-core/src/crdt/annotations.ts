import {anchorAt, pathOfPos, posOfPath} from "./edit.ts";
import {ROOT, keyOf, ticketOf} from "./ticket.ts";
import type {Doc, Item, Op, Pos, TextBlock} from "./doc.ts";
import type {ModelPath} from "./model.ts";
import type {Ticket} from "./ticket.ts";

export const ANNOTATION_SLOT = "$annotations";
export const ANNOTATION_TYPE = "$annotation";
// Same deterministic derivation as slotTicket(ROOT, ANNOTATION_SLOT), without a Doc runtime import.
export const ANNOTATION_HEAD: Ticket = {lamport: 0, actor: `${keyOf(ROOT)}/${ANNOTATION_SLOT}`};
export const ANNOTATION_HEAD_KEY = keyOf(ANNOTATION_HEAD);
export type JSONValue = null | boolean | number | string | JSONValue[] | {[key: string]: JSONValue};
export type AnnotationEndpoint = {left: string; right: string | null; affinity: "left" | "right"};
export type AnnotationRange = {anchor: ModelPath; focus: ModelPath};
export type AnnotationExpansion = "none" | "start" | "end" | "both";
export type AnnotationOptions = {expand?: AnnotationExpansion};
export type AnnotationPatch = AnnotationOptions & {range?: AnnotationRange; data?: Record<string, JSONValue>; removeData?: string[]};
export type AnnotationStatus = "resolved" | "missing" | "hidden" | "cross-slot" | "compacted";
export type AnnotationRecord = {
    id: string;
    anchor: AnnotationEndpoint;
    focus: AnnotationEndpoint;
    data: Record<string, JSONValue>;
    status: AnnotationStatus;
    range: AnnotationRange | null;
    backward: boolean | null;
};
export type AnnotationReferenceCheck = (key: string) => boolean;
const poisoned = new Set(["__proto__", "prototype", "constructor"]);
const plain = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
function validJSON(value: unknown, seen = new Set<object>(), depth = 0, maxDepth = 64): boolean {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (!value || typeof value !== "object" || depth > maxDepth || seen.has(value)) return false;
    if (!Array.isArray(value) && !plain(value)) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    const entries = Array.isArray(value) ? keys.filter(key => key !== "length") : keys;
    const valid = entries.every(key => {
        if (typeof key !== "string" || poisoned.has(key)) return false;
        if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
        const descriptor = descriptors[key];
        return descriptor.enumerable && Object.hasOwn(descriptor, "value") && validJSON(descriptor.value, seen, depth + 1, maxDepth);
    }) && (!Array.isArray(value) || entries.length === value.length);
    seen.delete(value);
    return valid;
}
/** Validate plain JSON without reading accessors. Envelope callers can allow their extra structural depth. */
export const annotationJsonOk = (value: unknown, maxDepth = 64): boolean => validJSON(value, new Set<object>(), 0, maxDepth);

const tokenKey = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^\d+@[^\u0000-\u001f]+$/.test(value)) return false;
    const ticket = ticketOf(value);
    return Number.isSafeInteger(ticket.lamport) && ticket.lamport >= 0 && !!ticket.actor && keyOf(ticket) === value;
};
const dataKey = (name: string): string => {
    if (!name || poisoned.has(name)) throw new Error("Invalid annotation data key");
    return `data:${encodeURIComponent(name)}`;
};
const dataName = (key: string): string | null => {
    if (!key.startsWith("data:")) return null;
    try {
        const name = decodeURIComponent(key.slice(5));
        return name && !poisoned.has(name) && dataKey(name) === key ? name : null;
    } catch { return null; }
};
export const isAnnotationDataKey = (key: string): boolean => dataName(key) !== null;

/** Validate immutable endpoint references. The core callback must exclude non-content tokens. */
export function validateAnnotationEndpoint(value: unknown, referenceExists?: AnnotationReferenceCheck): string | null {
    if (!plain(value) || !validJSON(value) || Object.keys(value).sort().join(",") !== "affinity,left,right") return "Annotation endpoint requires left, right, and affinity";
    if (!tokenKey(value.left) || (value.right !== null && !tokenKey(value.right))) return "Invalid annotation endpoint token key";
    if (value.affinity !== "left" && value.affinity !== "right") return "Invalid annotation endpoint affinity";
    if (referenceExists && (!referenceExists(value.left) || (value.right !== null && !referenceExists(value.right)))) return "Unknown or invalid annotation endpoint reference";
    return null;
}
export function validateAnnotationAttribute(key: string, value: unknown, referenceExists?: AnnotationReferenceCheck): string | null {
    if (key === "anchor" || key === "focus") return validateAnnotationEndpoint(value, referenceExists);
    if (!isAnnotationDataKey(key)) return "Unknown annotation attribute";
    if (value === null) return null;
    return plain(value) && validJSON(value) && Object.keys(value).length === 1 && Object.hasOwn(value, "value") && validJSON(value.value)
        ? null : "Annotation data must contain one JSON-safe value";
}
export function validateAnnotationAttributes(attrs: unknown, referenceExists?: AnnotationReferenceCheck): string | null {
    if (!plain(attrs) || !validJSON(attrs) || !Object.hasOwn(attrs, "anchor") || !Object.hasOwn(attrs, "focus")) return "Annotation birth requires both endpoints";
    for (const [key, value] of Object.entries(attrs)) {
        const problem = validateAnnotationAttribute(key, value, referenceExists);
        if (problem) return problem;
    }
    return null;
}
const live = (item: Item): boolean => !item.compact && [...item.dels].every(key => item.cancels.has(key));
const storedItems = (doc: Doc): Item[] => doc.lines().find(line => line.key === ANNOTATION_HEAD_KEY)?.items ?? [];
const annotations = (doc: Doc): Item[] => storedItems(doc).filter(item => item.key !== ANNOTATION_HEAD_KEY && item.kind === "node" && item.born === ANNOTATION_TYPE && live(item));
const values = (item: Item): Record<string, unknown> => Object.fromEntries([...item.attrs].map(([key, entry]) => [key, entry.value]));
const comparePaths = (a: ModelPath, b: ModelPath): number => {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const delta = (a[index] ?? -1) - (b[index] ?? -1);
        if (delta) return delta;
    }
    return 0;
};
function captureEndpoint(doc: Doc, path: ModelPath, affinity: AnnotationEndpoint["affinity"]): AnnotationEndpoint {
    if (!Array.isArray(path) || path.length < 2 || path.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid annotation model path");
    const pos = posOfPath(doc, path);
    if (!pos || pos.o !== path.at(-1)) throw new Error("Annotation endpoint must be an exact text position");
    const line = pos.line ?? keyOf(ROOT);
    if (!doc.visible(line)) throw new Error("Annotation endpoint is hidden");
    const left = anchorAt(doc, path), right = doc.rightKeyOf(pos);
    if (!left || !doc.get(left)) throw new Error("Annotation endpoint has no token anchor");
    const endpoint: AnnotationEndpoint = {left, right: right === "end" ? null : right, affinity};
    const issue = validateAnnotationEndpoint(endpoint, key => !!doc.get(key) && doc.tokenLocation(key)?.visible === true);
    if (issue) throw new Error(issue);
    return endpoint;
}
function captureRange(doc: Doc, range: AnnotationRange, expand: AnnotationExpansion = "none"): {anchor: AnnotationEndpoint; focus: AnnotationEndpoint} {
    if (!["none", "start", "end", "both"].includes(expand)) throw new Error("Invalid annotation expansion policy");
    if (!range || !Array.isArray(range.anchor) || !Array.isArray(range.focus)) throw new Error("Annotation range requires anchor and focus paths");
    const backward = comparePaths(range.anchor, range.focus) > 0;
    const collapsed = comparePaths(range.anchor, range.focus) === 0;
    const startAffinity = expand === "start" || expand === "both" ? "left" : "right";
    const endAffinity = expand === "end" || expand === "both" ? "right" : "left";
    const anchorAffinity = collapsed ? expand === "none" ? "right" : "left" : backward ? endAffinity : startAffinity;
    const focusAffinity = collapsed ? "right" : backward ? startAffinity : endAffinity;
    return {anchor: captureEndpoint(doc, range.anchor, anchorAffinity), focus: captureEndpoint(doc, range.focus, focusAffinity)};
}
function encodedData(data: Record<string, JSONValue>): Record<string, unknown> {
    if (!plain(data) || !validJSON(data)) throw new Error("Annotation data key or value is not JSON-safe");
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        const encoded = dataKey(key);
        const wrapped = {value};
        const problem = validateAnnotationAttribute(encoded, wrapped);
        if (problem) throw new Error(problem);
        attrs[encoded] = structuredClone(wrapped);
    }
    return attrs;
}
function apply(doc: Doc, ops: Op[]): Op[] {
    const problem = doc.check(ops);
    if (problem) throw new Error(problem);
    return doc.emit(ops);
}
function annotationItem(doc: Doc, id: string): Item {
    const item = tokenKey(id) ? doc.get(id) : undefined;
    if (!item || item.born !== ANNOTATION_TYPE || item.line.key !== ANNOTATION_HEAD_KEY) throw new Error("Unknown annotation ID");
    return item;
}
export function createAnnotation(doc: Doc, range: AnnotationRange, data: Record<string, JSONValue> = {}, options: AnnotationOptions = {}): {id: string; ops: Op[]} {
    const attrs = {...captureRange(doc, range, options.expand), ...encodedData(data)};
    const head = doc.get(ANNOTATION_HEAD_KEY);
    if (!head) throw new Error("The document does not support the reserved annotation slot");
    const id = doc.clock.next();
    const op: Op = {t: "node", id, origin: ANNOTATION_HEAD, type: ANNOTATION_TYPE, attrs};
    return {id: keyOf(id), ops: apply(doc, [op])};
}
export function updateAnnotation(doc: Doc, id: string, patch: AnnotationPatch): Op[] {
    const item = annotationItem(doc, id);
    if (!live(item)) throw new Error("Cannot update a deleted annotation");
    if (!plain(patch) || Object.keys(patch).some(key => !["range", "expand", "data", "removeData"].includes(key))) throw new Error("Unknown annotation patch field");
    const attrs = patch.data === undefined ? {} : encodedData(patch.data);
    if (patch.removeData !== undefined) {
        if (!Array.isArray(patch.removeData)) throw new Error("removeData must be an array of keys");
        for (const key of patch.removeData) {
            if (typeof key !== "string") throw new Error("Invalid annotation data key");
            const encoded = dataKey(key);
            if (Object.hasOwn(attrs, encoded)) throw new Error("Cannot set and remove the same annotation data field");
            attrs[encoded] = null;
        }
    }
    if (patch.range || patch.expand !== undefined) {
        const range = patch.range ?? getAnnotations(doc).find(record => record.id === id)?.range;
        if (!range) throw new Error("An unresolved annotation requires an explicit new range");
        Object.assign(attrs, captureRange(doc, range, patch.expand));
    }
    const ops: Op[] = Object.entries(attrs).map(([key, value]) => ({t: "set", at: doc.clock.next(), ids: [item.id], key, value}));
    return ops.length ? apply(doc, ops) : [];
}
export function deleteAnnotation(doc: Doc, id: string): Op[] {
    const item = annotationItem(doc, id);
    return live(item) ? apply(doc, [{t: "del", at: doc.clock.next(), ids: [item.id]}]) : [];
}

type ResolvedEndpoint = {status: AnnotationStatus; path: ModelPath | null; line: string | null};
function resolveEndpoint(doc: Doc, endpoint: AnnotationEndpoint): ResolvedEndpoint {
    const fail = (status: AnnotationStatus): ResolvedEndpoint => ({status, path: null, line: null});
    const left = doc.get(endpoint.left), right = endpoint.right === null ? null : doc.get(endpoint.right);
    if (!left || (endpoint.right !== null && !right)) return fail("missing");
    if (left.compact || right?.compact) return fail("compacted");
    const leftLocation = doc.tokenLocation(endpoint.left), rightLocation = endpoint.right === null ? null : doc.tokenLocation(endpoint.right);
    if (!leftLocation || (endpoint.right !== null && !rightLocation)) return fail("missing");
    const location = endpoint.affinity === "right" && rightLocation ? rightLocation : leftLocation;
    if (!location.visible) return fail("hidden");
    const line = location.line;
    let pos: Pos;
    if (endpoint.affinity === "left") pos = doc.posAfter(endpoint.left);
    else if (right) {
        pos = doc.posAfter(endpoint.right!);
        if (live(right)) {
            const blocks = doc.blocks(line);
            let found = false;
            for (let b = 0; b < blocks.length; b++) {
                const block = blocks[b];
                if (block.kind === "text") {
                    const offset = block.chars.indexOf(right);
                    if (offset >= 0) {pos = {line, b, o: offset}; found = true; break;}
                }
                if (block.marker !== right && !(block.kind === "text" && block.aliases.includes(right))) continue;
                let previous = b - 1;
                while (previous >= 0 && blocks[previous].kind !== "text") previous--;
                pos = previous >= 0 ? {line, b: previous, o: (blocks[previous] as TextBlock).chars.length} : {line, b, o: 0};
                found = true;
                break;
            }
            if (!found) return fail("missing");
        }
    } else {
        // A null right reference follows the end of its owning text block.
        pos = doc.posAfter(endpoint.left);
        if ((pos.line ?? keyOf(ROOT)) !== line) return fail("cross-slot");
        const block = doc.blocks(line)[pos.b];
        if (block?.kind !== "text") return fail("missing");
        pos = {...pos, o: block.chars.length};
    }
    if ((pos.line ?? keyOf(ROOT)) !== line) return fail("cross-slot");
    const block = doc.blocks(line)[pos.b];
    if (block?.kind !== "text" || pos.o < 0 || pos.o > block.chars.length) return fail("missing");
    const path = pathOfPos(doc, pos);
    return path ? {status: "resolved", path, line} : fail("missing");
}
export function getAnnotations(doc: Doc): AnnotationRecord[] {
    return annotations(doc).map(item => {
        const attrs = values(item);
        const anchor = structuredClone(attrs.anchor as AnnotationEndpoint), focus = structuredClone(attrs.focus as AnnotationEndpoint);
        const data: Record<string, JSONValue> = {};
        for (const [key, value] of Object.entries(attrs)) {
            const name = dataName(key);
            if (name && value !== null && plain(value) && Object.hasOwn(value, "value")) data[name] = structuredClone(value.value as JSONValue);
        }
        const a = resolveEndpoint(doc, anchor), f = resolveEndpoint(doc, focus);
        const status = a.status !== "resolved" ? a.status : f.status !== "resolved" ? f.status : a.line !== f.line ? "cross-slot" : "resolved";
        const range = status === "resolved" ? {anchor: a.path!, focus: f.path!} : null;
        return {id: item.key, anchor, focus, data, status, range, backward: range ? comparePaths(range.anchor, range.focus) > 0 : null};
    });
}
/** Live annotation endpoints pin token identities, including their deleted tombstones. */
export function annotationEndpointKeys(doc: Doc): Set<string> {
    const keys = new Set<string>();
    for (const item of annotations(doc)) {
        const attrs = values(item);
        for (const name of ["anchor", "focus"]) {
            const endpoint = attrs[name] as AnnotationEndpoint;
            if (endpoint && tokenKey(endpoint.left)) keys.add(endpoint.left);
            if (endpoint && tokenKey(endpoint.right)) keys.add(endpoint.right);
        }
    }
    return keys;
}
