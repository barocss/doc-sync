import {schemaVersion} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";

const BRIEF_FIELDS = Object.freeze(["version", "objective", "requirements"]);
const MANUAL_REQUIREMENT_FIELDS = Object.freeze(["id", "kind", "description"]);
const TEXT_REQUIREMENT_FIELDS = Object.freeze(["id", "kind", "path", "text"]);
const NODE_REQUIREMENT_FIELDS = Object.freeze(["id", "kind", "path", "type"]);
const OCCURRENCE_REQUIREMENT_FIELDS = Object.freeze(["id", "kind", "path", "text", "count"]);
const CHILD_TYPES_REQUIREMENT_FIELDS = Object.freeze(["id", "kind", "path", "types"]);
const TEXT_RUN_FIELDS = Object.freeze(["text", "marks"]);
const NODE_RUN_FIELDS = Object.freeze(["type", "attrs", "runs"]);
const ATOM_RUN_FIELDS = Object.freeze(["type", "attrs"]);
const MODEL_NODE_FIELDS = Object.freeze(["type", "attrs", "children", "runs"]);

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
const fields = (value: ObjectValue, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const string = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const path = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 64 && Array.from(value).every(index => Number.isSafeInteger(index) && index >= 0);

/** Validate user requirements before persistence and return an independently owned value. */
export function parseBrief(value: unknown): Brief {
    if (!object(value) || !fields(value, BRIEF_FIELDS) || value.version !== 1 || !string(value.objective, 4000) || !value.objective.trim() || !Array.isArray(value.requirements) || value.requirements.length < 1 || value.requirements.length > 32) throw Error("Invalid or oversized structured brief");
    // Keep every previously valid v1 contract valid. The aggregate budget applies to extensions.
    if (value.requirements.some(item => object(item) && (item.kind === "text_occurrences" || item.kind === "child_types"))) boundedJSON(value, 1024 * 1024);
    const ids = new Set<string>();
    const requirements: Requirement[] = Array.from(value.requirements).map(item => {
        if (!object(item) || !string(item.id, 80) || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id)) throw Error("Invalid or duplicate requirement ID");
        ids.add(item.id);
        if (item.kind === "manual" && fields(item, MANUAL_REQUIREMENT_FIELDS) && string(item.description, 2000) && item.description.trim()) return {id: item.id, kind: "manual", description: item.description};
        if (item.kind === "exact_text" && fields(item, TEXT_REQUIREMENT_FIELDS) && path(item.path) && typeof item.text === "string" && item.text.length <= 8192) return {id: item.id, kind: "exact_text", path: [...item.path], text: item.text};
        if (item.kind === "node_type" && fields(item, NODE_REQUIREMENT_FIELDS) && path(item.path) && string(item.type, 120) && item.type.trim()) return {id: item.id, kind: "node_type", path: [...item.path], type: item.type};
        if (item.kind === "text_occurrences" && fields(item, OCCURRENCE_REQUIREMENT_FIELDS) && path(item.path) && string(item.text, 8192) && Number.isSafeInteger(item.count) && (item.count as number) >= 0 && (item.count as number) <= 1024 * 1024) return {id: item.id, kind: "text_occurrences", path: [...item.path], text: item.text, count: item.count as number};
        if (item.kind === "child_types" && fields(item, CHILD_TYPES_REQUIREMENT_FIELDS) && path(item.path) && Array.isArray(item.types) && item.types.length <= 1024 && Array.from(item.types).every(type => string(type, 120) && type.trim())) return {id: item.id, kind: "child_types", path: [...item.path], types: [...item.types]};
        throw Error("Invalid or oversized brief requirement");
    });
    return {version: 1, objective: value.objective, requirements};
}

/** Bound plain JSON before recursive model/schema-shape inspection. No coercion or patterns. */
function boundedJSON(value: unknown, maxLength: number): void {
    const budget: JSONBudget = {visited: 0, length: 0, maxLength, ancestors: new Set<object>()};

    readBoundedJSON(value, 0, budget);
}

type JSONBudget = {visited: number; length: number; maxLength: number; ancestors: Set<object>};
function readBoundedJSON(item: unknown, depth: number, budget: JSONBudget): void {
    if (++budget.visited > 131072 || depth > 128) throw Error("Verification input exceeds the structural limit");
    if (typeof item === "string") {
        if (item.length > budget.maxLength) throw Error("Verification input exceeds the text budget");
        budget.length += Buffer.byteLength(JSON.stringify(item), "utf8");
    } else if (typeof item === "number") {
        if (!Number.isFinite(item)) throw Error("Verification input requires finite values");
        budget.length += String(item).length;
    } else if (item !== null && typeof item === "object") {
        if (budget.ancestors.has(item)) throw Error("Cyclic verification input");
        budget.ancestors.add(item);
        if (Object.getOwnPropertySymbols(item).length) throw Error("Verification input requires JSON keys");
        budget.length += 2;
        if (Array.isArray(item)) {
            if (item.length > 16384) throw Error("Verification input array exceeds the limit");
            if (Object.getOwnPropertyNames(item).length !== item.length + 1) throw Error("Invalid verification input array keys");
            for (let index = 0; index < item.length; index++) {
                const descriptor = Object.getOwnPropertyDescriptor(item, index);
                if (!descriptor || !("value" in descriptor)) throw Error("Sparse or accessor verification input array");
                budget.length++;
                readBoundedJSON(descriptor.value, depth + 1, budget);
            }
        } else {
            if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw Error("Verification input requires plain JSON objects");
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
                budget.length += Buffer.byteLength(JSON.stringify(key), "utf8") + 2;
                if (!("value" in descriptor)) throw Error("Verification input cannot contain accessors");
                readBoundedJSON(descriptor.value, depth + 1, budget);
            }
        }
        budget.ancestors.delete(item);
    } else if (item === null || typeof item === "boolean") budget.length += 5;
    else throw Error("Verification input requires JSON values");
    if (budget.length > budget.maxLength) throw Error("Verification input exceeds the text budget");
}

type ExactTextContext = {visited: number; length: number; allowed: readonly string[]; schema: Schema};
function readExactRuns(runs: unknown[], depth: number, context: ExactTextContext): string {
    if (depth > 64) throw Error("Text span nesting exceeds the verification limit");
    const chunks: string[] = [];
    for (const run of runs) {
        if (++context.visited > 16384 || !object(run)) throw Error("Invalid or oversized text runs");
        if (Object.hasOwn(run, "text")) {
            if (typeof run.text !== "string" || !fields(run, TEXT_RUN_FIELDS) || (run.marks !== undefined && !object(run.marks))) throw Error("Invalid text run");
            context.length += run.text.length;
            if (context.length > 1024 * 1024) throw Error("Text exceeds the verification limit");
            chunks.push(run.text);
        } else {
            if (typeof run.type !== "string" || !context.allowed.includes(run.type) || !Object.hasOwn(context.schema.nodes, run.type) || context.schema.nodes[run.type].shape !== "span" || !Array.isArray(run.runs) || !fields(run, NODE_RUN_FIELDS) || (run.attrs !== undefined && !object(run.attrs))) throw Error("Non-text or undeclared inline content cannot satisfy exact text");
            chunks.push(readExactRuns(run.runs, depth + 1, context));
        }
    }
    return chunks.join("");
}

function validateModelRuns(schema: Schema, items: unknown[], allowed: readonly string[], acceptsText: boolean): void {
    for (const run of items) {
        if (!object(run)) throw Error("Invalid model run");
        if (Object.hasOwn(run, "text")) {
            if (!fields(run, TEXT_RUN_FIELDS) || typeof run.text !== "string" || (!acceptsText && run.text.length > 0) || (run.marks !== undefined && !object(run.marks))) throw Error("Invalid model text run");
        } else {
            if (typeof run.type !== "string" || !allowed.includes(run.type) || !Object.hasOwn(schema.nodes, run.type)) throw Error("Undeclared model inline node");
            const spec = schema.nodes[run.type];
            if (run.attrs !== undefined && !object(run.attrs)) throw Error("Invalid inline attributes");
            if (spec.shape === "span" && fields(run, NODE_RUN_FIELDS) && Array.isArray(run.runs)) validateModelRuns(schema, run.runs, allowed, acceptsText);
            else if (spec.shape !== "inline" || !fields(run, ATOM_RUN_FIELDS)) throw Error("Invalid inline shape");
        }
    }
}

function validateModelNode(schema: Schema, node: unknown): void {
    if (!object(node) || !fields(node, MODEL_NODE_FIELDS) || typeof node.type !== "string" || !Object.hasOwn(schema.nodes, node.type)) throw Error("Invalid model node");
    if (node.attrs !== undefined && !object(node.attrs)) throw Error("Invalid model attributes");
    const spec = schema.nodes[node.type];
    if (containers.has(spec.shape) && "children" in spec) {
        if (!Array.isArray(node.children) || node.runs !== undefined) throw Error("Invalid model container");
        for (const child of node.children) {
            if (!object(child) || typeof child.type !== "string" || !spec.children?.includes(child.type)) throw Error("Undeclared model child");
            validateModelNode(schema, child);
        }
    } else if (spec.shape === "text") {
        if (!Array.isArray(node.runs) || node.children !== undefined) throw Error("Invalid model text node");
        validateModelRuns(schema, node.runs, spec.children ?? [], spec.text !== false);
    } else if (spec.shape !== "atom" || node.children !== undefined || node.runs !== undefined) throw Error("Invalid model node shape");
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
    const context: ExactTextContext = {visited: 0, length: 0, allowed: spec.children ?? [], schema};

    return readExactRuns(node.runs, 0, context);
}

/**
 * New checks inspect the canonical model tree, including retained spanned table cells.
 * This checks JSON bounds and declared shapes/children, not attr patterns or cardinality.
 * It does not normalize the model, mutate inputs, or execute schema patterns.
 */
function validateModel(document: unknown, schema: Schema): void {
    boundedJSON(document, 1024 * 1024);

    if (!object(document) || document.type !== schema.root) throw Error("Document root does not match the schema");
    validateModelNode(schema, document);
}

/**
 * Count exact, non-overlapping UTF-16 matches in each text sequence of this subtree.
 * Text runs and spans join. Inline objects break a sequence. Text nodes never join.
 * Metadata and inline attributes are not text. Hidden retained cells remain model text.
 */
type OccurrenceContext = {schema: Schema; text: string; count: number};
function countSequence(sequence: string, context: OccurrenceContext): void {
    let offset = 0, found: number;
    while ((found = sequence.indexOf(context.text, offset)) !== -1) {
        context.count++;
        offset = found + context.text.length;
    }
}
function readOccurrenceRuns(runs: ObjectValue[], context: OccurrenceContext, sequence: {text: string}): void {
    for (const run of runs) {
        if (typeof run.text === "string") sequence.text += run.text;
        else if (context.schema.nodes[run.type as string].shape === "span") readOccurrenceRuns(run.runs as ObjectValue[], context, sequence);
        else { countSequence(sequence.text, context); sequence.text = ""; }
    }
}
function readOccurrenceNode(current: ObjectValue, context: OccurrenceContext): void {
    if (context.schema.nodes[current.type as string].shape === "text") {
        const sequence = {text: ""};
        readOccurrenceRuns(current.runs as ObjectValue[], context, sequence);
        countSequence(sequence.text, context);
    } else if (Array.isArray(current.children)) for (const child of current.children) readOccurrenceNode(child as ObjectValue, context);
}
function textOccurrences(node: ObjectValue, schema: Schema, text: string): number {
    const context: OccurrenceContext = {schema, text, count: 0};
    readOccurrenceNode(node, context);
    return context.count;
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
