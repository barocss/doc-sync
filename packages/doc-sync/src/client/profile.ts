/** Display metadata only. Actor IDs remain separate replica identities. */
export type ProfileJSON = null | boolean | number | string | readonly ProfileJSON[] | {readonly [key: string]: ProfileJSON};
export interface ActorProfile {
    readonly name?: string;
    readonly color?: string;
    readonly avatar?: string;
    readonly userId?: string;
    readonly kind?: "human" | "bot";
    readonly metadata?: {readonly [key: string]: ProfileJSON};
}
export type ResolvedActorProfile = ActorProfile & {readonly name: string; readonly color: string};

function copyMetadata(value: unknown): ActorProfile["metadata"] {
    let count = 0;
    const seen = new Set<object>();
    const visit = (value: unknown, depth: number): ProfileJSON => {
        if (++count > 1024 || depth > 8) throw new Error("Actor profile metadata exceeds limits");
        if (value === null || typeof value === "boolean" || typeof value === "string") return value;
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (!value || typeof value !== "object" || seen.has(value)) throw new Error("Invalid actor profile metadata");
        const array = Array.isArray(value);
        if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error("Invalid actor profile metadata");
        seen.add(value);
        let result: ProfileJSON;
        if (array) {
            if (value.length > 1024) throw new Error("Actor profile metadata exceeds limits");
            const items: ProfileJSON[] = [];
            for (let at = 0; at < value.length; at++) items.push(visit(value[at], depth + 1));
            result = Object.freeze(items);
        } else {
            const entries = Object.entries(value);
            if (entries.length > 1024) throw new Error("Actor profile metadata exceeds limits");
            result = Object.freeze(Object.fromEntries(entries.map(([key, item]) => [key, visit(item, depth + 1)])));
        }
        seen.delete(value);
        return result;
    };
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Actor profile metadata must be a JSON object");
    const result = visit(value, 0) as ActorProfile["metadata"];
    if (JSON.stringify(result).length > 16384) throw new Error("Actor profile metadata exceeds limits");
    return result;
}

export function resolveActorProfile(actor: string, input: ActorProfile = {}): ResolvedActorProfile {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid actor profile");
    const result: Record<string, unknown> = {};
    const limits = {name: 256, color: 128, avatar: 2048, userId: 256};
    for (const [key, limit] of Object.entries(limits)) {
        const value = input[key as keyof typeof limits];
        if (value === undefined) continue;
        if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`Invalid actor profile ${key}`);
        result[key] = value;
    }
    if (input.kind !== undefined) {
        if (input.kind !== "human" && input.kind !== "bot") throw new Error("Invalid actor profile kind");
        result.kind = input.kind;
    }
    if (input.metadata !== undefined) result.metadata = copyMetadata(input.metadata);
    let hash = 2166136261;
    for (let at = 0; at < actor.length; at++) hash = Math.imul(hash ^ actor.charCodeAt(at), 16777619);
    result.name ??= actor;
    result.color ??= `hsl(${(hash >>> 0) % 360}, 65%, 45%)`;
    return Object.freeze({...result, name: result.name as string, color: result.color as string});
}
