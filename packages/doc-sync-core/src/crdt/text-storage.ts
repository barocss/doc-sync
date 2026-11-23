import type {Ticket} from "./ticket.ts";

/** Stable storage for logical default and trailing paragraphs. Physical origins never change. */
export type TextAddress = {parent: string; after: string | null; detached?: boolean};
export const textTicket = ({parent, after, detached}: TextAddress): Ticket => ({lamport: 0, actor: `~${detached ? "fragment" : "text"}:${encodeURIComponent(parent)}:${after === null ? "" : encodeURIComponent(after)}`});
export function parseTextStorage(key: string): TextAddress | null {
    const match = /^0@~(text|fragment):([^:]+):(.*)$/.exec(key);
    if (!match) return null;
    try { const address: TextAddress = {parent: decodeURIComponent(match[2]), after: match[3] ? decodeURIComponent(match[3]) : null, ...(match[1] === "fragment" ? {detached: true} : {})}; return `0@${textTicket(address).actor}` === key ? address : null; } catch { return null; }
}
export type JoinValue = {into: string; after: string};
export function parseJoin(value: unknown): JoinValue | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length !== 2 || !["into", "after"].every(key => descriptors[key]?.enumerable && Object.hasOwn(descriptors[key], "value") && typeof descriptors[key].value === "string")) return null;
    return {into: descriptors.into.value, after: descriptors.after.value};
}

export type SplitBirth = {into: string; after: string; left: string; right: string};
export function parseSplitBoundary(boundary: string): SplitBirth | null {
    if (!boundary.startsWith("split:")) return null;
    try {
        const value = JSON.parse(boundary.slice(6));
        return value && Object.keys(value).sort().join(",") === "after,into,left,right" && Object.values(value).every(part => typeof part === "string") ? value : null;
    } catch { return null; }
}
