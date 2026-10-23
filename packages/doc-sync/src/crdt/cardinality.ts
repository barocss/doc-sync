import type {FlowSpec, Schema} from "./schema.ts";
import type {Ticket} from "./ticket.ts";

export type ChildRule = {min?: number; max?: number};
export type RequiredAddress = {parent: string; type: string; ordinal: number};
const PREFIX = "~required:";
export const requiredTicket = (address: RequiredAddress, node = false): Ticket => ({
    lamport: node ? 1 : 0,
    actor: `${PREFIX}${encodeURIComponent(address.parent)}:${encodeURIComponent(address.type)}:${address.ordinal}`,
});
export function parseRequired(key: string): RequiredAddress | null {
    const match = /^[0-3]@~required:([^:]+):([^:]+):(\d+)$/.exec(key);
    if (!match) return null;
    try {
        const address = {parent: decodeURIComponent(match[1]), type: decodeURIComponent(match[2]), ordinal: Number(match[3])};
        return Number.isSafeInteger(address.ordinal) && key === `${key.split("@")[0]}@${requiredTicket(address).actor}` ? address : null;
    } catch { return null; }
}
export function requiredType(schema: Schema, type: string): string {
    const spec = schema.nodes[type];
    return spec?.shape === "group" ? spec.children[0] : type;
}
export function childRuleProblems(schema: Schema, type: string, spec: FlowSpec): string[] {
    const problems: string[] = [];
    for (const [child, rule] of Object.entries(spec.childRules ?? {})) {
        if (!["text", "flow", "grid", "atom", "group"].includes(schema.nodes[child]?.shape ?? "")) problems.push(`${type}.childRules.${child} must name a block or group`);
        if (!spec.children.includes(child)) problems.push(`${type}.childRules.${child} is not a declared child`);
        if (!rule || typeof rule !== "object" || Array.isArray(rule)) { problems.push(`${type}.childRules.${child} must be an object`); continue; }
        for (const value of [rule.min, rule.max]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 1000)) problems.push(`${type}.childRules.${child} bounds must be integers from 0 to 1000`);
        if ((rule.min ?? 0) > (rule.max ?? Infinity)) problems.push(`${type}.childRules.${child} min exceeds max`);
    }
    return problems;
}
