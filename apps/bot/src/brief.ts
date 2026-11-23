import {schemaVersion} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";

export type Requirement =
    | {id: string; kind: "exact_text"; path: number[]; text: string}
    | {id: string; kind: "node_type"; path: number[]; type: string}
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
    const ids = new Set<string>();
    const requirements: Requirement[] = Array.from(value.requirements).map(item => {
        if (!object(item) || !string(item.id, 80) || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id)) throw Error("Invalid or duplicate requirement ID");
        ids.add(item.id);
        if (item.kind === "manual" && fields(item, ["id", "kind", "description"]) && string(item.description, 2000) && item.description.trim()) return {id: item.id, kind: "manual", description: item.description};
        if (item.kind === "exact_text" && fields(item, ["id", "kind", "path", "text"]) && path(item.path) && typeof item.text === "string" && item.text.length <= 8192) return {id: item.id, kind: "exact_text", path: [...item.path], text: item.text};
        if (item.kind === "node_type" && fields(item, ["id", "kind", "path", "type"]) && path(item.path) && string(item.type, 120) && item.type.trim()) return {id: item.id, kind: "node_type", path: [...item.path], type: item.type};
        throw Error("Invalid or oversized brief requirement");
    });
    return {version: 1, objective: value.objective, requirements};
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

/** Evaluate settled document evidence. Model messages and planner claims are not inputs. */
export function verifyBrief(input: Brief, document: unknown, schema: Schema, revision: CheckedRevision): VerificationReport {
    const brief = parseBrief(input);
    if (!object(revision) || !string(revision.epoch, 512) || !Number.isSafeInteger(revision.serverSeq) || revision.serverSeq < 0 || !(revision.schemaVersion === null || string(revision.schemaVersion, 512))) throw Error("Invalid checked revision");
    if (revision.schemaVersion !== schemaVersion(schema)) throw Error("Checked revision schema version does not match the supplied schema");
    const requirements: RequirementResult[] = brief.requirements.map(requirement => {
        if (requirement.kind === "manual") return {id: requirement.id, status: "not_checked", message: "This requirement needs manual review."};
        try {
            const node = nodeAt(document, schema, requirement.path);
            const passed = requirement.kind === "node_type" ? node.type === requirement.type : exactNodeText(node, schema) === requirement.text;
            return {id: requirement.id, status: passed ? "pass" : "fail", message: passed ? "The document satisfies this requirement." : "The document does not match the required value at this path."};
        } catch (error) {
            return {id: requirement.id, status: "fail", message: error instanceof Error ? error.message : "Document verification failed."};
        }
    });
    return {version: 1, status: requirements.some(item => item.status === "fail") ? "failed" : requirements.some(item => item.status === "not_checked") ? "not_checked" : "passed", checkedRevision: {epoch: revision.epoch, serverSeq: revision.serverSeq, schemaVersion: revision.schemaVersion}, requirements};
}
