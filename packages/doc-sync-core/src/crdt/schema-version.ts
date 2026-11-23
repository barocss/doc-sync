import {checkSchema} from "./schema.ts";
import type {Schema} from "./schema.ts";

/** Canonical JSON for schema identity. Schema definitions must be plain finite JSON data. */
function canonical(value: unknown, active = new Set<object>(), depth = 0): string {
    if (depth > 128) throw new Error("Schema JSON exceeds the maximum nesting depth");
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("Schema must contain finite JSON numbers");
        return JSON.stringify(value);
    }
    if (typeof value !== "object") throw new Error("Schema must contain only JSON values");
    if (active.has(value)) throw new Error("Schema must not contain cycles");
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
        throw new Error("Schema must contain only plain JSON objects and arrays");
    }
    active.add(value);
    try {
        const keys = Reflect.ownKeys(value);
        if (keys.some(key => typeof key !== "string")) throw new Error("Schema must not contain symbol properties");
        if (array) {
            const a = value as unknown[];
            if (keys.length !== a.length + 1 || !keys.includes("length")) throw new Error("Schema arrays must be dense and have no extra properties");
            const entries: string[] = [];
            for (let index = 0; index < a.length; index++) {
                const descriptor = Object.getOwnPropertyDescriptor(a, String(index));
                if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("Schema arrays must contain plain values");
                entries.push(canonical(descriptor.value, active, depth + 1));
            }
            return `[${entries.join(",")}]`;
        }
        const properties = (keys as string[]).sort();
        const entries = properties.map(key => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("Schema properties must be enumerable plain values");
            return `${JSON.stringify(key)}:${canonical(descriptor.value, active, depth + 1)}`;
        });
        return `{${entries.join(",")}}`;
    } finally {
        active.delete(value);
    }
}

// A synchronous SHA-256 avoids a Node-only dependency and works in browser clients.
function sha256(text: string): string {
    const bytes = new TextEncoder().encode(text);
    const size = Math.ceil((bytes.length + 9) / 64) * 64;
    const data = new Uint8Array(size);
    data.set(bytes);
    data[bytes.length] = 0x80;
    const view = new DataView(data.buffer);
    const bits = bytes.length * 8;
    view.setUint32(size - 8, Math.floor(bits / 0x100000000));
    view.setUint32(size - 4, bits >>> 0);
    const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < size; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15], b = w[i - 2];
            w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
        }
        let [a, b, c, d, e, f, g, j] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (j + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) >>> 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            j = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        const next = [a, b, c, d, e, f, g, j];
        for (let i = 0; i < 8; i++) h[i] = (h[i] + next[i]) >>> 0;
    }
    return h.map(value => value.toString(16).padStart(8, "0")).join("");
}

/** A fingerprint of the entire validated schema, including UI metadata. */
export function schemaVersion(schema: Schema): string {
    const text = canonical(schema);
    const problems = checkSchema(schema);
    if (problems.length) throw new Error(`Invalid schema: ${problems.join("; ")}`);
    return `sha256:${sha256(text)}`;
}

/** Preserve existing rules and allow append-only new marks and child types. */
export function assertCompatibleSchema(oldSchema: Schema, newSchema: Schema): void {
    schemaVersion(oldSchema);
    schemaVersion(newSchema);
    const {nodes: oldNodes, marks: oldMarks, ...oldOther} = oldSchema;
    const {nodes: newNodes, marks: newMarks, ...newOther} = newSchema;
    if (canonical(oldOther) !== canonical(newOther)) throw new Error("Incompatible schema: existing root, marks, and rules must not change");
    if (newMarks.length < oldMarks.length || oldMarks.some((mark, index) => newMarks[index] !== mark)) {
        throw new Error("Incompatible schema: existing marks must retain their order");
    }
    const addedMarks = newMarks.slice(oldMarks.length);
    if (addedMarks.some((mark, index) => oldMarks.includes(mark) || addedMarks.indexOf(mark) !== index || Object.hasOwn(oldSchema.markValues ?? {}, mark))) {
        throw new Error("Incompatible schema: new marks must not duplicate existing marks or value marks");
    }
    for (const [type, spec] of Object.entries(oldNodes)) {
        const next = newNodes[type];
        if (!Object.hasOwn(newNodes, type)) throw new Error(`Incompatible schema: existing node ${type} must not change`);
        if (spec.shape === "flow" || spec.shape === "text") {
            if (next.shape !== spec.shape) throw new Error(`Incompatible schema: existing node ${type} must not change`);
            const oldChildren = spec.children ?? [], nextChildren = next.children ?? [];
            if (nextChildren.length < oldChildren.length || oldChildren.some((child, index) => nextChildren[index] !== child)) {
                throw new Error(`Incompatible schema: existing children of ${type} must retain their order`);
            }
            for (const child of nextChildren.slice(oldChildren.length)) {
                // Existing types could already occur in stored content; adding an old type
                // can change how that content is grouped or projected.
                if (Object.hasOwn(oldNodes, child)) throw new Error(`Incompatible schema: child ${child} is not new`);
                const added = newNodes[child];
                if (added?.shape === "group" && added.children.some(member => Object.hasOwn(oldNodes, member))) {
                    throw new Error(`Incompatible schema: new group ${child} can regroup existing content`);
                }
                if (added?.shape === "span" && Object.hasOwn(oldSchema.markValues ?? {}, added.mark)) {
                    throw new Error(`Incompatible schema: new span ${child} can rewrap existing content`);
                }
            }
            const copy: Record<string, unknown> = {...next};
            if (Object.hasOwn(spec, "children")) copy.children = spec.children;
            else delete copy.children;
            if (canonical(spec) === canonical(copy)) continue;
        }
        if (canonical(spec) !== canonical(next)) {
            throw new Error(`Incompatible schema: existing node ${type} must not change`);
        }
    }
}
