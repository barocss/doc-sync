import type {AttrSpec} from "./schema.ts";

/** Internal set-key namespace. Paths include the outer attribute name. */
export const FIELD_PREFIX = "$field:";
export const MAX_FIELD_PATH = 64;
export type FieldWrite = {path: string[]; value: unknown};
export type FieldKey = {attr: string; path: string[]};
type FieldSpec = AttrSpec & {fields?: Record<string, AttrSpec>};
type JsonRecord = Record<string, unknown>;

const unsafe = new Set(["__proto__", "constructor", "prototype"]);
export const safeFieldName = (name: unknown): name is string =>
    typeof name === "string" && name.length > 0 && !name.startsWith("$") && !unsafe.has(name);
const record = (value: unknown): value is JsonRecord => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
const entries = (value: JsonRecord): Array<[string, unknown]> => Object.entries(value);
const own = (value: unknown, key: string): unknown => record(value) && Object.hasOwn(value, key) ? value[key] : undefined;
const fieldsOf = (spec: AttrSpec): Record<string, AttrSpec> | undefined => spec && typeof spec === "object" ? (spec as FieldSpec).fields : undefined;
export const isFieldSpec = (spec: AttrSpec): boolean => !!spec && typeof spec === "object" && Object.hasOwn(spec, "fields");
const failure = (message: string): never => { throw new Error(`Nested fields: ${message}`); };

/** Only finite, acyclic JSON data is accepted. Accessors and unsafe object keys are rejected. */
export const fieldJsonOk = (value: unknown): boolean => {
    const active = new Set<object>();
    const visit = (item: unknown, depth: number): boolean => {
        if (item === null || typeof item === "string" || typeof item === "boolean") return true;
        if (typeof item === "number") return Number.isFinite(item);
        if (depth >= MAX_FIELD_PATH || typeof item !== "object" || !item || active.has(item)) return false;
        if (!Array.isArray(item) && !record(item)) return false;
        active.add(item);
        const descriptors = Object.getOwnPropertyDescriptors(item);
        const keys = Object.keys(item);
        const keySet = new Set(keys);
        const valid = Reflect.ownKeys(item).every(key => typeof key === "string" && (Array.isArray(item) && key === "length" || keySet.has(key))) &&
            keys.every(key => {
                const descriptor = descriptors[key];
                return safeFieldName(key) && !!descriptor && Object.hasOwn(descriptor, "value") && visit(descriptor.value, depth + 1);
            }) && (!Array.isArray(item) || keys.length === item.length && keys.every((key, index) => key === String(index)));
        active.delete(item);
        return valid;
    };
    return visit(value, 0);
};
const clone = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clone);
    if (record(value)) return Object.fromEntries(entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
};
const equal = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equal(value, b[index]));
    if (!record(a) || !record(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
const leafOk = (spec: AttrSpec, value: unknown): boolean => {
    if (!fieldJsonOk(value)) return false;
    if (value === null) return true;
    if (spec.computed || spec.values && !spec.values.some(candidate => equal(candidate, value))) return false;
    if (spec.pattern) {
        try { if (typeof value !== "string" || !new RegExp(spec.pattern).test(value)) return false; }
        catch { return false; }
    }
    if (typeof spec.default === "number") return typeof value === "number" && Number.isFinite(value) && value >= (spec.min ?? -Infinity) && value <= (spec.max ?? Infinity);
    if (Array.isArray(spec.default)) return Array.isArray(value);
    if (record(spec.default)) return record(value);
    return spec.default === null || spec.default === undefined || typeof value === typeof spec.default;
};

/** A branch accepts a declared partial patch. Null means reset, including for leaf registers. */
export const fieldValueOk = (spec: AttrSpec, value: unknown): boolean => {
    if (!fieldJsonOk(value)) return false;
    const visit = (rule: AttrSpec, item: unknown, depth: number): boolean => {
        if (depth > MAX_FIELD_PATH) return false;
        if (!isFieldSpec(rule)) return leafOk(rule, item);
        const fields = fieldsOf(rule);
        if (!record(fields)) return false;
        if (item === null) return true;
        return record(item) && entries(item).every(([key, child]) => safeFieldName(key) && Object.hasOwn(fields, key) && visit(fields[key], child, depth + 1));
    };
    return visit(spec, value, 0);
};

/** Validate only opt-in field attributes. Existing atomic attribute contracts stay unchanged. */
export const fieldsSchemaProblems = (attrs: Record<string, AttrSpec> | undefined, prefix = "attrs"): string[] => {
    const problems: string[] = [];
    const active = new Set<object>();
    const visit = (spec: AttrSpec, path: string[]): void => {
        const label = `${prefix}.${path.join(".")}`;
        if (path.length > MAX_FIELD_PATH) { problems.push(`${label}: field path exceeds ${MAX_FIELD_PATH} segments`); return; }
        if (!record(spec) || active.has(spec)) { problems.push(`${label}: invalid or cyclic field specification`); return; }
        active.add(spec);
        if (spec.computed) problems.push(`${label}: collaborative fields cannot be computed`);
        if (!fieldJsonOk(spec.default)) problems.push(`${label}: default must be safe JSON data`);
        if (spec.values && (!Array.isArray(spec.values) || !spec.values.every(fieldJsonOk))) problems.push(`${label}: values must be safe JSON data`);
        if (spec.pattern) {
            try { new RegExp(spec.pattern); } catch { problems.push(`${label}: invalid pattern`); }
        }
        if (isFieldSpec(spec)) {
            const fields = fieldsOf(spec);
            if (!record(fields)) problems.push(`${label}: fields must be a plain record`);
            else {
                if (!record(spec.default)) problems.push(`${label}: branch default must be an object`);
                if (spec.values || spec.pattern || spec.min !== undefined || spec.max !== undefined) problems.push(`${label}: branch constraints belong on leaf fields`);
                for (const [name, child] of Object.entries(fields)) {
                    if (!safeFieldName(name)) problems.push(`${label}: unsafe field name ${JSON.stringify(name)}`);
                    visit(child, [...path, name]);
                }
                if (record(spec.default) && !equal(spec.default, Object.fromEntries(Object.entries(fields).map(([key, child]) => [key, child?.default])))) {
                    problems.push(`${label}: branch default must equal its declared child defaults`);
                }
            }
        } else if (!leafOk(spec, spec.default)) problems.push(`${label}: default does not satisfy its leaf rule`);
        active.delete(spec);
    };
    for (const [name, spec] of Object.entries(attrs ?? {})) {
        if (!isFieldSpec(spec)) continue;
        if (!safeFieldName(name)) problems.push(`${prefix}: unsafe field attribute ${JSON.stringify(name)}`);
        visit(spec, [name]);
    }
    return problems;
};

export const encodeFieldKey = (attr: string, path: readonly string[]): string => {
    const parts = [attr, ...path];
    if (parts.length < 2 || parts.length > MAX_FIELD_PATH || !parts.every(safeFieldName)) return failure("invalid field path");
    return `${FIELD_PREFIX}${JSON.stringify(parts)}`;
};
export const decodeFieldKey = (key: string): FieldKey | null => {
    if (!key.startsWith(FIELD_PREFIX)) return null;
    try {
        const parts: unknown = JSON.parse(key.slice(FIELD_PREFIX.length));
        if (!Array.isArray(parts) || parts.length < 2 || parts.length > MAX_FIELD_PATH || !parts.every(safeFieldName) || `${FIELD_PREFIX}${JSON.stringify(parts)}` !== key) return null;
        return {attr: parts[0], path: parts.slice(1)};
    } catch { return null; }
};

/** Resolve declared leaves only. Paths are relative to the outer attribute. */
export const fieldSpecAt = (spec: AttrSpec, path: readonly string[]): AttrSpec | null => {
    if (!path.length || path.length + 1 > MAX_FIELD_PATH || !path.every(safeFieldName)) return null;
    let current = spec;
    for (const segment of path) {
        const fields = fieldsOf(current);
        if (!record(fields) || !Object.hasOwn(fields, segment)) return null;
        current = fields[segment];
    }
    return isFieldSpec(current) ? null : current;
};

/** Explicit same-value writes are retained. Branch resets expand to null writes per leaf. */
export const flattenFieldPatch = (spec: AttrSpec, patch: unknown): FieldWrite[] => {
    if (!isFieldSpec(spec) || !fieldValueOk(spec, patch)) return failure("invalid field patch");
    const output: FieldWrite[] = [];
    const visit = (rule: AttrSpec, value: unknown, path: string[]): void => {
        if (path.length + 1 > MAX_FIELD_PATH) return failure("field path exceeds limit");
        if (!isFieldSpec(rule)) { output.push({path, value: clone(value)}); return; }
        const fields = fieldsOf(rule);
        if (!record(fields)) return failure("invalid field specification");
        if (value === null) Object.entries(fields).forEach(([name, child]) => visit(child, null, [...path, name]));
        else entries(value as JsonRecord).forEach(([name, child]) => visit(fields[name], child, [...path, name]));
    };
    visit(spec, patch, []);
    return output;
};

/** Materialize defaults plus winning leaf registers; invalid values stay hidden for this type. */
export const materializeFields = (spec: AttrSpec, read: (path: readonly string[]) => {value: unknown} | undefined): JsonRecord => {
    if (!isFieldSpec(spec)) return failure("materialization requires a field attribute");
    const visit = (rule: AttrSpec, path: string[]): unknown => {
        if (path.length + 1 > MAX_FIELD_PATH) return failure("field path exceeds limit");
        const fields = fieldsOf(rule);
        if (isFieldSpec(rule)) {
            if (!record(fields)) return failure("invalid field specification");
            return Object.fromEntries(Object.entries(fields).map(([name, child]) => {
                if (!safeFieldName(name)) return failure("unsafe field name");
                return [name, visit(child, [...path, name])];
            }));
        }
        if (!fieldJsonOk(rule.default)) return failure("invalid field default");
        const stored = read(path);
        return clone(stored && stored.value !== null && leafOk(rule, stored.value) ? stored.value : rule.default);
    };
    return visit(spec, []) as JsonRecord;
};
const valueAt = (value: unknown, path: readonly string[]): unknown => path.reduce<unknown>((current, name) => own(current, name), value);

/** Pure model patch. Omitted leaves retain their existing value. */
export const patchFields = (spec: AttrSpec, before: unknown, patch: unknown): JsonRecord => {
    if (before !== undefined && !fieldValueOk(spec, before)) return failure("invalid previous field value");
    const writes = new Map(flattenFieldPatch(spec, patch).map(write => [JSON.stringify(write.path), write.value]));
    return materializeFields(spec, path => {
        const key = JSON.stringify(path);
        const value = writes.has(key) ? writes.get(key) : valueAt(before, path);
        return value === undefined ? undefined : {value};
    });
};

/** Model diffs mention changed leaves only; explicit editing writes are not filtered here. */
export const diffFields = (spec: AttrSpec, before: unknown, after: unknown): JsonRecord | null => {
    if (before !== undefined && !fieldValueOk(spec, before) || after !== undefined && !fieldValueOk(spec, after)) return failure("invalid field diff value");
    const a = materializeFields(spec, path => { const value = valueAt(before, path); return value === undefined ? undefined : {value}; });
    const b = materializeFields(spec, path => { const value = valueAt(after, path); return value === undefined ? undefined : {value}; });
    const visit = (rule: AttrSpec, left: unknown, right: unknown): unknown => {
        if (!isFieldSpec(rule)) return equal(left, right) ? undefined : equal(right, rule.default) ? null : clone(right);
        const pairs: Array<[string, unknown]> = [];
        for (const [name, child] of Object.entries(fieldsOf(rule)!)) {
            const change = visit(child, own(left, name), own(right, name));
            if (change !== undefined) pairs.push([name, change]);
        }
        return pairs.length ? Object.fromEntries(pairs) : undefined;
    };
    return visit(spec, a, b) as JsonRecord | undefined ?? null;
};
