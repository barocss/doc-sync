import {sha256} from "../crdt/schema-version.ts";

export type SpreadsheetScalar = string | number | boolean | null;
export interface SpreadsheetFieldSpec {
    type: "string" | "number" | "boolean" | "scalar";
    default: SpreadsheetScalar;
    values?: readonly SpreadsheetScalar[];
    min?: number;
    max?: number;
    maxLength?: number;
}
export interface SpreadsheetSchema {
    domain: "spreadsheet";
    version: 1;
    fields: Record<string, SpreadsheetFieldSpec>;
}
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
function fail(): never { throw new Error("Invalid spreadsheet schema"); }
function plain(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
}
function json(value: unknown, active = new Set<object>(), depth = 0): void {
    if (value === null || typeof value === "boolean" || typeof value === "string") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (!value || typeof value !== "object" || depth > 8 || active.has(value)) fail();
    if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : !plain(value)) fail();
    active.add(value);
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value) && (value.length > 256 || keys.length !== value.length + 1 ||
        !Array.from({length: value.length}, (_, index) => String(index)).every(key => Object.hasOwn(value, key)))) fail();
    for (const key of keys) {
        if (Array.isArray(value) && key === "length") continue;
        if (typeof key !== "string" || forbidden.has(key)) fail();
        const desc = Object.getOwnPropertyDescriptor(value, key)!;
        if (!desc.enumerable || !("value" in desc)) fail();
        json(desc.value, active, depth + 1);
    }
    active.delete(value);
}
function accepts(spec: SpreadsheetFieldSpec, value: unknown): value is SpreadsheetScalar {
    if (value === null) return true; // Null clears a register; the resolved value is the default.
    if (!(typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))) return false;
    if (spec.type !== "scalar" && typeof value !== spec.type) return false;
    if (spec.values && !spec.values.includes(value)) return false;
    if (typeof value === "number" && (spec.min !== undefined && value < spec.min || spec.max !== undefined && value > spec.max)) return false;
    if (typeof value === "string" && spec.maxLength !== undefined && value.length > spec.maxLength) return false;
    return true;
}
export function assertSpreadsheetSchema(value: unknown): asserts value is SpreadsheetSchema {
    json(value);
    if (!plain(value) || Object.keys(value).length !== 3 || value.domain !== "spreadsheet" || value.version !== 1 || !plain(value.fields)) fail();
    const names = Object.keys(value.fields);
    if (!names.length || names.length > 128) fail();
    for (const name of names) {
        if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(name) || forbidden.has(name)) fail();
        const spec = value.fields[name];
        if (!plain(spec) || !Object.hasOwn(spec, "type") || !Object.hasOwn(spec, "default") ||
            Object.keys(spec).some(key => !["type", "default", "values", "min", "max", "maxLength"].includes(key)) ||
            !["string", "number", "boolean", "scalar"].includes(spec.type as string)) fail();
        if (Object.hasOwn(spec, "values")) {
            if (!Array.isArray(spec.values) || !spec.values.length || spec.values.length > 256 || new Set(spec.values).size !== spec.values.length) fail();
            if (!spec.values.every(item => item !== null && accepts({type: spec.type as SpreadsheetFieldSpec["type"], default: null}, item))) fail();
        }
        for (const key of ["min", "max"] as const) if (Object.hasOwn(spec, key) &&
            (spec.type !== "number" || typeof spec[key] !== "number" || !Number.isFinite(spec[key]))) fail();
        if (spec.min !== undefined && spec.max !== undefined && (spec.min as number) > (spec.max as number)) fail();
        if (Object.hasOwn(spec, "maxLength") && (spec.type !== "string" || !Number.isSafeInteger(spec.maxLength) || (spec.maxLength as number) < 0 || (spec.maxLength as number) > 1_000_000)) fail();
        const typed = spec as unknown as SpreadsheetFieldSpec;
        if (!accepts(typed, spec.default) || typeof spec.default === "string" && spec.default.length > 1_000_000 ||
            typed.values?.some(item => !accepts(typed, item) || typeof item === "string" && item.length > 1_000_000)) fail();
    }
}
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
}
export function createSpreadsheetSchema(value: SpreadsheetSchema): SpreadsheetSchema {
    assertSpreadsheetSchema(value);
    return structuredClone(value);
}
export function spreadsheetSchemaVersion(value: SpreadsheetSchema): string {
    assertSpreadsheetSchema(value);
    return `sha256:${sha256(canonical(value))}`;
}
export function validateSpreadsheetFieldValue(schema: SpreadsheetSchema, field: string, value: unknown): value is SpreadsheetScalar {
    return Object.hasOwn(schema.fields, field) && accepts(schema.fields[field], value);
}
export const DEFAULT_SPREADSHEET_SCHEMA: SpreadsheetSchema = {
    domain: "spreadsheet", version: 1, fields: {
        value: {type: "scalar", default: null}, formula: {type: "string", default: null},
        fill: {type: "string", default: null}, bold: {type: "boolean", default: null}, numberFormat: {type: "string", default: null},
    },
};
