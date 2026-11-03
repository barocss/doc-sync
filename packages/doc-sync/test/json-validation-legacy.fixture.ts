// TEST ONLY. Frozen post-refactor original, not HEAD/ec962.
// Source: packages/doc-sync/src/crdt/annotations.ts (poisoned through annotationJsonOk).
// Full source SHA-256: cc2257ad38afdb18a803eedda7968af05ab2be434b8ccfd064b0b04c64f0cac3
// Preserve bulk descriptors, second Reflect.ownKeys, filter/every and read order exactly.
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
export const legacyAnnotationJsonOk = (value: unknown, maxDepth = 64): boolean => validJSON(value, new Set<object>(), 0, maxDepth);
