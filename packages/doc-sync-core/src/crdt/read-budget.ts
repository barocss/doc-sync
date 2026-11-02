/** Count JSON UTF-8 bytes without serializing or cloning attribute subtrees. */
export class JsonReadBudget {
    bytes = 0;
    readonly limit: number;
    constructor(limit: number) { this.limit = limit; }
    add(bytes: number): void {
        this.bytes += bytes;
        if (this.bytes > this.limit) throw new Error("Slice exceeds JSON byte budget before projection");
    }
    string(value: string): void {
        this.add(2);
        // Every UTF-16 unit requires at least one byte in JSON, including surrogate pairs.
        if (value.length > this.limit - this.bytes) this.add(value.length);
        for (let i = 0; i < value.length; i++) {
            const c = value.charCodeAt(i);
            if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) this.add(2);
            else if (c < 32) this.add(6);
            else if (c < 128) this.add(1);
            else if (c < 2048) this.add(2);
            else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { this.add(4); i++; }
            else if (c >= 0xd800 && c <= 0xdfff) this.add(6);
            else this.add(3);
        }
    }
    value(value: unknown): void {
        const active = new Set<object>();
        const visit = (item: unknown, depth: number): void => {
            if (typeof item === "string") { this.string(item); return; }
            if (item === null) { this.add(4); return; }
            if (typeof item === "boolean") { this.add(item ? 4 : 5); return; }
            if (typeof item === "number") { this.add(JSON.stringify(item).length); return; }
            if (typeof item === "bigint") throw new Error("Slice attribute is not JSON data");
            if (!item || typeof item !== "object") return;
            const prototype = Object.getPrototypeOf(item);
            if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error("Slice attribute is not plain JSON data");
            if (typeof (item as {toJSON?: unknown}).toJSON === "function") throw new Error("Slice attribute custom JSON conversion is unsupported");
            if (depth > 64 || active.has(item)) throw new Error("Slice attribute exceeds JSON depth budget");
            active.add(item);
            this.add(2);
            let count = 0;
            if (Array.isArray(item)) {
                for (let i = 0; i < item.length; i++) {
                    if (count++) this.add(1);
                    if (item[i] === undefined || typeof item[i] === "function" || typeof item[i] === "symbol") this.add(4);
                    else visit(item[i], depth + 1);
                }
            } else {
                for (const key in item) if (Object.hasOwn(item, key)) {
                    const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
                    if (!Object.hasOwn(descriptor, "value")) throw new Error("Slice attribute accessors are unsupported");
                    const value = descriptor.value;
                    if (value === undefined || typeof value === "function" || typeof value === "symbol") continue;
                    if (count++) this.add(1);
                    this.string(key); this.add(1); visit(value, depth + 1);
                }
            }
            active.delete(item);
        };
        visit(value, 0);
    }
}

export const assertReadValueBudget = (value: unknown, limit: number): void => { new JsonReadBudget(limit).value(value); };
