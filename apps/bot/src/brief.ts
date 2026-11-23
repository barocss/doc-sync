import {schemaVersion} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";

export type Requirement =
    | {id: string; kind: "exact_text"; path: number[]; text: string}
    | {id: string; kind: "node_type"; path: number[]; type: string}
    | {id: string; kind: "text_occurrences"; path: number[]; text: string; count: number}
    | {id: string; kind: "child_types"; path: number[]; types: string[]}
    | {id: string; kind: "manual"; description: string};
export type Brief = {version: 1; objective: string; requirements: Requirement[]};
export type CheckedRevision = {epoch: string; serverSeq: number; schemaVersion: string | null};
export type RequirementResult = {id: string; status: "pass" | "fail" | "not_checked"; message: string};
export type VerificationReport = {version: 1; status: "passed" | "failed" | "not_checked"; checkedRevision: CheckedRevision; requirements: RequirementResult[]};

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value);
const fields = (value: ObjectValue, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const string = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const path = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 64 && Array.from(value).every(index => Number.isSafeInteger(index) && index >= 0);

/** Validate user requirements before persistence and return an independently owned value. */
export function parseBrief(value: unknown): Brief {
    if (!object(value) || !fields(value, ["version", "objective", "requirements"]) || value.version !== 1 || !string(value.objective, 4000) || !value.objective.trim() || !Array.isArray(value.requirements) || value.requirements.length < 1 || value.requirements.length > 32) throw Error("Invalid or oversized structured brief");
    // Keep every previously valid v1 contract valid. The aggregate budget applies to extensions.
    if (value.requirements.some(item => object(item) && (item.kind === "text_occurrences" || item.kind === "child_types"))) boundedJSON(value, 1024 * 1024);
    const ids = new Set<string>();
    const requirements: Requirement[] = Array.from(value.requirements).map(item => {
        if (!object(item) || !string(item.id, 80) || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id)) throw Error("Invalid or duplicate requirement ID");
        ids.add(item.id);
        if (item.kind === "manual" && fields(item, ["id", "kind", "description"]) && string(item.description, 2000) && item.description.trim()) return {id: item.id, kind: "manual", description: item.description};
        if (item.kind === "exact_text" && fields(item, ["id", "kind", "path", "text"]) && path(item.path) && typeof item.text === "string" && item.text.length <= 8192) return {id: item.id, kind: "exact_text", path: [...item.path], text: item.text};
        if (item.kind === "node_type" && fields(item, ["id", "kind", "path", "type"]) && path(item.path) && string(item.type, 120) && item.type.trim()) return {id: item.id, kind: "node_type", path: [...item.path], type: item.type};
        if (item.kind === "text_occurrences" && fields(item, ["id", "kind", "path", "text", "count"]) && path(item.path) && string(item.text, 8192) && Number.isSafeInteger(item.count) && (item.count as number) >= 0 && (item.count as number) <= 1024 * 1024) return {id: item.id, kind: "text_occurrences", path: [...item.path], text: item.text, count: item.count as number};
        if (item.kind === "child_types" && fields(item, ["id", "kind", "path", "types"]) && path(item.path) && Array.isArray(item.types) && item.types.length <= 1024 && Array.from(item.types).every(type => string(type, 120) && type.trim())) return {id: item.id, kind: "child_types", path: [...item.path], types: [...item.types]};
        throw Error("Invalid or oversized brief requirement");
    });
    return {version: 1, objective: value.objective, requirements};
}

/** Bound plain JSON before recursive model/schema-shape inspection. No coercion or patterns. */
function boundedJSON(value: unknown, maxLength: number): void {
    let visited = 0, length = 0;
    const ancestors = new Set<object>();
    const read = (item: unknown, depth: number): void => {
        if (++visited > 131072 || depth > 128) throw Error("Verification input exceeds the structural limit");
        if (typeof item === "string") {
            if (item.length > maxLength) throw Error("Verification input exceeds the text budget");
            length += Buffer.byteLength(JSON.stringify(item), "utf8");
        } else if (typeof item === "number") {
            if (!Number.isFinite(item)) throw Error("Verification input requires finite values");
            length += String(item).length;
        } else if (item !== null && typeof item === "object") {
            if (ancestors.has(item)) throw Error("Cyclic verification input");
            ancestors.add(item);
            if (Object.getOwnPropertySymbols(item).length) throw Error("Verification input requires JSON keys");
            length += 2;
            if (Array.isArray(item)) {
                if (item.length > 16384) throw Error("Verification input array exceeds the limit");
                if (Object.getOwnPropertyNames(item).length !== item.length + 1) throw Error("Invalid verification input array keys");
                for (let index = 0; index < item.length; index++) {
                    const descriptor = Object.getOwnPropertyDescriptor(item, index);
                    if (!descriptor || !("value" in descriptor)) throw Error("Sparse or accessor verification input array");
                    length++;
                    read(descriptor.value, depth + 1);
                }
            } else {
                if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw Error("Verification input requires plain JSON objects");
                for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
                    length += Buffer.byteLength(JSON.stringify(key), "utf8") + 2;
                    if (!("value" in descriptor)) throw Error("Verification input cannot contain accessors");
                    read(descriptor.value, depth + 1);
                }
            }
            ancestors.delete(item);
        } else if (item === null || typeof item === "boolean") length += 5;
        else throw Error("Verification input requires JSON values");
        if (length > maxLength) throw Error("Verification input exceeds the text budget");
    };
    read(value, 0);
}

const containers = new Set(["flow", "group", "grid", "row", "cell"]);
function nodeAt(document: unknown, schema: Schema, indices: number[]): ObjectValue {
    let node = document;
    if (!object(node) || node.type !== schema.root) throw Error("Document root does not match the schema");
    for (const index of indices) {
        if (!object(node) || typeof node.type !== "string") throw Error("Invalid model node");
        const spec = Object.hasOwn(schema.nodes, node.type) ? schema.nodes[node.type] : undefined;
        if (!spec || !containers.has(spec.shape) || !("children" in spec) || !Array.isArray(node.children)) throw Error("Path does not select model children");
        const child = node.children[index];
        if (!object(child) || typeof child.type !== "string" || !spec.children?.includes(child.type)) throw Error("Node is missing or is not allowed at this path");
        node = child;
    }
    if (!object(node) || typeof node.type !== "string" || !Object.hasOwn(schema.nodes, node.type)) throw Error("Unknown model node type");
    return node;
}

/** Read only text runs and declared spans in one text node. Inline objects are not text. */
function exactNodeText(node: ObjectValue, schema: Schema): string {
    const spec = schema.nodes[node.type as string];
    if (spec.shape !== "text" || !Array.isArray(node.runs) || node.children !== undefined) throw Error("Exact text requires a text node with runs");
    let visited = 0, length = 0;
    const allowed = spec.children ?? [];
    const read = (runs: unknown[], depth: number): string => {
        if (depth > 64) throw Error("Text span nesting exceeds the verification limit");
        const chunks: string[] = [];
        for (const run of runs) {
            if (++visited > 16384 || !object(run)) throw Error("Invalid or oversized text runs");
            if (Object.hasOwn(run, "text")) {
                if (typeof run.text !== "string" || !fields(run, ["text", "marks"]) || (run.marks !== undefined && !object(run.marks))) throw Error("Invalid text run");
                length += run.text.length;
                if (length > 1024 * 1024) throw Error("Text exceeds the verification limit");
                chunks.push(run.text);
            } else {
                if (typeof run.type !== "string" || !allowed.includes(run.type) || !Object.hasOwn(schema.nodes, run.type) || schema.nodes[run.type].shape !== "span" || !Array.isArray(run.runs) || !fields(run, ["type", "attrs", "runs"]) || (run.attrs !== undefined && !object(run.attrs))) throw Error("Non-text or undeclared inline content cannot satisfy exact text");
                chunks.push(read(run.runs, depth + 1));
            }
        }
        return chunks.join("");
    };
    return read(node.runs, 0);
}

/**
 * New checks inspect the canonical model tree, including retained spanned table cells.
 * This checks JSON bounds and declared shapes/children, not attr patterns or cardinality.
 * It does not normalize the model, mutate inputs, or execute schema patterns.
 */
function validateModel(document: unknown, schema: Schema): void {
    boundedJSON(document, 1024 * 1024);
    const runs = (items: unknown[], allowed: readonly string[], acceptsText: boolean): void => {
        for (const run of items) {
            if (!object(run)) throw Error("Invalid model run");
            if (Object.hasOwn(run, "text")) {
                if (!fields(run, ["text", "marks"]) || typeof run.text !== "string" || (!acceptsText && run.text.length > 0) || (run.marks !== undefined && !object(run.marks))) throw Error("Invalid model text run");
            } else {
                if (typeof run.type !== "string" || !allowed.includes(run.type) || !Object.hasOwn(schema.nodes, run.type)) throw Error("Undeclared model inline node");
                const spec = schema.nodes[run.type];
                if (run.attrs !== undefined && !object(run.attrs)) throw Error("Invalid inline attributes");
                if (spec.shape === "span" && fields(run, ["type", "attrs", "runs"]) && Array.isArray(run.runs)) runs(run.runs, allowed, acceptsText);
                else if (spec.shape !== "inline" || !fields(run, ["type", "attrs"])) throw Error("Invalid inline shape");
            }
        }
    };
    const read = (node: unknown): void => {
        if (!object(node) || !fields(node, ["type", "attrs", "children", "runs"]) || typeof node.type !== "string" || !Object.hasOwn(schema.nodes, node.type)) throw Error("Invalid model node");
        if (node.attrs !== undefined && !object(node.attrs)) throw Error("Invalid model attributes");
        const spec = schema.nodes[node.type];
        if (containers.has(spec.shape) && "children" in spec) {
            if (!Array.isArray(node.children) || node.runs !== undefined) throw Error("Invalid model container");
            for (const child of node.children) {
                if (!object(child) || typeof child.type !== "string" || !spec.children?.includes(child.type)) throw Error("Undeclared model child");
                read(child);
            }
        } else if (spec.shape === "text") {
            if (!Array.isArray(node.runs) || node.children !== undefined) throw Error("Invalid model text node");
            runs(node.runs, spec.children ?? [], spec.text !== false);
        } else if (spec.shape !== "atom" || node.children !== undefined || node.runs !== undefined) throw Error("Invalid model node shape");
    };
    if (!object(document) || document.type !== schema.root) throw Error("Document root does not match the schema");
    read(document);
}

/**
 * Count exact, non-overlapping UTF-16 matches in each text sequence of this subtree.
 * Text runs and spans join. Inline objects break a sequence. Text nodes never join.
 * Metadata and inline attributes are not text. Hidden retained cells remain model text.
 */
function textOccurrences(node: ObjectValue, schema: Schema, text: string): number {
    let count = 0;
    const readNode = (current: ObjectValue): void => {
        if (schema.nodes[current.type as string].shape === "text") {
            let sequence = "";
            const flush = (): void => {
                let offset = 0, found: number;
                while ((found = sequence.indexOf(text, offset)) !== -1) {count++; offset = found + text.length;}
                sequence = "";
            };
            const readRuns = (runs: ObjectValue[]): void => {
                for (const run of runs) {
                    if (typeof run.text === "string") sequence += run.text;
                    else if (schema.nodes[run.type as string].shape === "span") readRuns(run.runs as ObjectValue[]);
                    else flush();
                }
            };
            readRuns(current.runs as ObjectValue[]);
            flush();
        } else if (Array.isArray(current.children)) for (const child of current.children) readNode(child as ObjectValue);
    };
    readNode(node);
    return count;
}

/** Evaluate settled document evidence. Model messages and planner claims are not inputs. */
export function verifyBrief(input: Brief, document: unknown, schema: Schema, revision: CheckedRevision): VerificationReport {
    const brief = parseBrief(input);
    if (!object(revision) || !string(revision.epoch, 512) || !Number.isSafeInteger(revision.serverSeq) || revision.serverSeq < 0 || !(revision.schemaVersion === null || string(revision.schemaVersion, 512))) throw Error("Invalid checked revision");
    if (revision.schemaVersion !== schemaVersion(schema)) throw Error("Checked revision schema version does not match the supplied schema");
    let modelError: string | undefined;
    if (brief.requirements.some(item => item.kind === "text_occurrences" || item.kind === "child_types")) {
        try {validateModel(document, schema);} catch (error) {modelError = error instanceof Error ? error.message : "Invalid model";}
    }
    const requirements: RequirementResult[] = brief.requirements.map(requirement => {
        if (requirement.kind === "manual") return {id: requirement.id, status: "not_checked", message: "This requirement needs manual review."};
        try {
            if ((requirement.kind === "text_occurrences" || requirement.kind === "child_types") && modelError) throw Error(modelError);
            const node = nodeAt(document, schema, requirement.path);
            let passed: boolean;
            if (requirement.kind === "node_type") passed = node.type === requirement.type;
            else if (requirement.kind === "exact_text") passed = exactNodeText(node, schema) === requirement.text;
            else if (requirement.kind === "text_occurrences") passed = textOccurrences(node, schema, requirement.text) === requirement.count;
            else {
                if (!containers.has(schema.nodes[node.type as string].shape) || !Array.isArray(node.children)) throw Error("Child types requires a model container");
                const actual = node.children.map(child => (child as ObjectValue).type);
                passed = actual.length === requirement.types.length && actual.every((type, index) => type === requirement.types[index]);
            }
            return {id: requirement.id, status: passed ? "pass" : "fail", message: passed ? "The document satisfies this requirement." : "The document does not match the required value at this path."};
        } catch (error) {
            return {id: requirement.id, status: "fail", message: error instanceof Error ? error.message : "Document verification failed."};
        }
    });
    return {version: 1, status: requirements.some(item => item.status === "fail") ? "failed" : requirements.some(item => item.status === "not_checked") ? "not_checked" : "passed", checkedRevision: {epoch: revision.epoch, serverSeq: revision.serverSeq, schemaVersion: revision.schemaVersion}, requirements};
}
