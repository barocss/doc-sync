import {MAIN} from "../crdt/doc.ts";
import type {Block, Doc} from "../crdt/doc.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";
import {attrValueOk} from "../crdt/schema.ts";
import {fieldJsonOk} from "../crdt/fields.ts";
import {BUILTIN_GRAPHIC_SCHEMA, GRAPHIC_ID_PATTERN, GRAPHIC_LIMITS, GRAPHIC_OVERRIDE_PROPERTIES} from "./schema.ts";
import type {GraphicAttrsByKind, GraphicId, GraphicKind, GraphicNode, GraphicObject, GraphicOverrideAssignment, GraphicOverrideProperty, GraphicOverrideValue, GraphicPatch} from "./types.ts";

const GRAPHIC_REFERENCE_FIELDS = Object.freeze(["from", "to", "targetId", "componentId"]);
const GRAPHIC_NODE_FIELDS = Object.freeze(["type", "attrs", "children", "runs"]);
const GRAPHIC_RUN_FIELDS = Object.freeze(["text", "marks"]);
const GRAPHIC_CONTENT_FIELDS = Object.freeze(["children", "text"]);
const GRAPHIC_OVERRIDE_KINDS = Object.freeze(["source-ref", "instance-override"]);


const fail = (reason: string): never => { throw new Error(`Graphic: ${reason}`); };
const signature = JSON.stringify(BUILTIN_GRAPHIC_SCHEMA);
const idPattern = new RegExp(GRAPHIC_ID_PATTERN);
const assertSchema = (doc: Doc): void => {
    if (JSON.stringify(doc.schema) !== signature) fail("helpers require createGraphicSchema() or BUILTIN_GRAPHIC_SCHEMA");
};
const kindOk = (kind: string): kind is GraphicKind => kind !== "canvas" && Object.hasOwn(BUILTIN_GRAPHIC_SCHEMA.nodes, kind);
/** References are local CRDT marker keys, never child indexes, names or external URLs. */
export const isGraphicId = (id: unknown): id is GraphicId => {
    if (typeof id !== "string" || !id || id.length > GRAPHIC_LIMITS.idLength || !idPattern.test(id)) return false;
    const count = Number(id.slice(0, id.indexOf("@")));
    return Number.isSafeInteger(count) && count > 0;
};
const assertAttrs = (kind: GraphicKind, attrs: unknown): void => {
    if (!fieldJsonOk(attrs) || !attrs || typeof attrs !== "object" || Array.isArray(attrs)) fail("attributes must be safe JSON records");
    const specs = BUILTIN_GRAPHIC_SCHEMA.nodes[kind].attrs!;
    for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
        if (!Object.hasOwn(specs, key) || !attrValueOk(specs[key], value)) fail(`invalid ${kind}.${key}`);
        if (GRAPHIC_REFERENCE_FIELDS.includes(key) && value !== null && value !== "" && !isGraphicId(value)) fail(`invalid ${kind}.${key} reference`);
        if (kind === "instance-override" && key === "assignment" && value !== null) assertAssignment(value);
    }
};
/** Payload validation belongs to the graphic helper contract. The core schema
 * stores this entire object in one atomic register and does not inspect its keys.
 */
const assertAssignment = (assignment: unknown): void => {
    if (!fieldJsonOk(assignment) || !assignment || typeof assignment !== "object" || Array.isArray(assignment)) return fail("override assignment must be a complete object");
    const record = assignment as Record<string, unknown>, keys = Object.keys(record);
    if (keys.length !== 2 || !Object.hasOwn(record, "property") || !Object.hasOwn(record, "value")) return fail("override assignment requires exactly property and value");
    const property = record.property;
    if (typeof property !== "string" || !GRAPHIC_OVERRIDE_PROPERTIES.includes(property as GraphicOverrideProperty)) return fail("invalid override property");
    const parts = property.split(".");
    let rule = BUILTIN_GRAPHIC_SCHEMA.nodes.rectangle.attrs?.[parts[0]];
    for (const part of parts.slice(1)) rule = rule?.fields?.[part];
    if (!rule) return fail("invalid override property");
    if (record.value === null || !attrValueOk(rule, record.value)) return fail("invalid override value");
};

/** Strict validation for the standard node contract; unknown attrs are rejected.
 * Missing attrs use schema defaults. Unbound or deleted references remain valid data.
 */
export const assertGraphicNode = (node: NodeJSON): void => {
    if (!fieldJsonOk(node)) fail("node must be finite safe JSON");
    const pending: Array<{node: NodeJSON; depth: number}> = [{node, depth: 0}];
    let count = 0;
    while (pending.length) {
        const {node: current, depth} = pending.pop()!;
        if (++count > GRAPHIC_LIMITS.nodes || depth > GRAPHIC_LIMITS.depth) fail("node limits exceeded");
        if (!current || typeof current !== "object" || !kindOk(current.type)) fail("unknown node kind");
        if (Object.keys(current).some(key => !GRAPHIC_NODE_FIELDS.includes(key))) fail("unknown node property");
        assertAttrs(current.type as GraphicKind, current.attrs === undefined ? {} : current.attrs);
        const spec = BUILTIN_GRAPHIC_SCHEMA.nodes[current.type];
        if (spec.shape === "container") {
            if (current.runs !== undefined || current.children !== undefined && !Array.isArray(current.children)) fail("invalid container content");
            for (const child of current.children ?? []) {
                if (!child || !spec.children.includes(child.type)) fail(`invalid child of ${current.type}`);
                pending.push({node: child, depth: depth + 1});
            }
        } else if (spec.shape === "text") {
            if (current.children !== undefined || current.runs !== undefined && !Array.isArray(current.runs)) fail("invalid label content");
            for (const run of current.runs ?? []) {
                if (!run || typeof run !== "object" || !("text" in run) || typeof run.text !== "string" || !run.marks || typeof run.marks !== "object" || Array.isArray(run.marks) || Object.keys(run).some(key => !GRAPHIC_RUN_FIELDS.includes(key)) || Object.entries(run.marks).some(([key, value]) => !BUILTIN_GRAPHIC_SCHEMA.marks.includes(key) || typeof value !== "boolean")) fail("invalid label run");
            }
        } else if (current.children !== undefined || current.runs !== undefined) fail("atom cannot contain content");
    }
};

/** Build a standard node without defining a schema or custom attributes. */
export const createGraphicNode = <K extends GraphicKind>(kind: K, attrs: GraphicPatch<GraphicAttrsByKind[K]> = {}, content: {children?: NodeJSON[]; text?: string} = {}): GraphicNode<K> => {
    if (!kindOk(kind)) return fail("unknown node kind");
    if (!fieldJsonOk(content) || !content || typeof content !== "object" || Array.isArray(content) || Object.keys(content).some(key => !GRAPHIC_CONTENT_FIELDS.includes(key))) return fail("invalid content options");
    if (content.text !== undefined && (kind !== "label" || typeof content.text !== "string")) return fail("text is only supported on labels");
    const node: GraphicNode<K> = {type: kind, attrs: attrs as Record<string, unknown>,
        ...(content.children !== undefined ? {children: content.children} : {}),
        ...(kind === "label" ? {runs: content.text ? [{text: content.text, marks: {}}] : []} : {}),
    };
    assertGraphicNode(node);
    return structuredClone(node);
};

const walk = (doc: Doc, visit: (block: Block, path: number[]) => boolean): void => {
    const pending: Array<{line: string; path: number[]}> = [{line: MAIN, path: []}];
    let count = 0;
    while (pending.length) {
        const {line, path} = pending.pop()!;
        if (path.length > GRAPHIC_LIMITS.depth) fail("object depth limit exceeded");
        const blocks = doc.blocks(line);
        for (let i = 0; i < blocks.length; i++) {
            if (++count > GRAPHIC_LIMITS.nodes) fail("object count limit exceeded");
            const block = blocks[i], at = [...path, i];
            if (visit(block, at)) return;
            if (block.kind === "flow") pending.push({line: block.body, path: at});
        }
    }
};
/** Resolve a visible marker ID after any reorder or reparent operation.
 * Deleted targets return null. Their stored reference strings are not rewritten.
 */
export const findGraphicObject = (doc: Doc, id: GraphicId): GraphicObject | null => {
    assertSchema(doc);
    if (!isGraphicId(id)) return fail("invalid object ID");
    return doc.withReadProjection(projection => {
        let result: GraphicObject | null = null;
        walk(projection, (block, path) => {
            if (block.marker.key !== id) return false;
            result = {id, path, node: projection.projectVisibleBlock(block)};
            return true;
        });
        return result;
    });
};

/** Capture an object's actual CRDT ID. Numeric paths are used only for this read. */
export const graphicObjectAt = (doc: Doc, path: readonly number[]): GraphicObject => {
    assertSchema(doc);
    if (!Array.isArray(path) || !path.length || path.length > GRAPHIC_LIMITS.depth || path.some(index => !Number.isSafeInteger(index) || index < 0)) return fail("invalid object path");
    return doc.withReadProjection(projection => {
        let line = MAIN, block: Block | undefined;
        for (let i = 0; i < path.length; i++) {
            block = projection.blocks(line)[path[i]];
            if (!block) return fail("object path not found");
            if (i < path.length - 1) {
                if (block.kind !== "flow") return fail("object path crosses a leaf");
                line = block.body;
            }
        }
        return {id: block!.marker.key, path: [...path], node: projection.projectVisibleBlock(block!)};
    });
};
const needObject = (doc: Doc, id: GraphicId): GraphicObject => findGraphicObject(doc, id) ?? fail("object is not visible");

/** Return an ordinary EditOp. Apply it through Doc, Client or LocalClient to retain their history/sync lifecycle. */
export const graphicUpdate = <K extends GraphicKind>(doc: Doc, id: GraphicId, kind: K, attrs: GraphicPatch<GraphicAttrsByKind[K]>): EditOp => {
    const object = needObject(doc, id);
    if (object.node.type !== kind) return fail("object kind does not match");
    assertAttrs(kind, attrs);
    return {op: "update", at: object.path, attrs: structuredClone(attrs) as Record<string, unknown>};
};
export const graphicDelete = (doc: Doc, id: GraphicId): EditOp => ({op: "delete", at: needObject(doc, id).path, count: 1});
const parentAt = (doc: Doc, id: GraphicId | null): {path: number[]; node: NodeJSON} => id === null ? (assertSchema(doc), {path: [], node: doc.toJSON()}) : needObject(doc, id);
const insertion = (doc: Doc, parentId: GraphicId | null, index: number, type: string): number[] => {
    const parent = parentAt(doc, parentId), spec = BUILTIN_GRAPHIC_SCHEMA.nodes[parent.node.type];
    if (spec?.shape !== "container" || !spec.children.includes(type)) return fail("parent cannot contain this kind");
    if (!Number.isSafeInteger(index) || index < 0 || index > (parent.node.children?.length ?? 0)) return fail("invalid insertion index");
    return [...parent.path, index];
};
export const graphicInsert = (doc: Doc, parentId: GraphicId | null, index: number, node: NodeJSON): EditOp => {
    assertGraphicNode(node);
    return {op: "insert", at: insertion(doc, parentId, index, node.type), content: [structuredClone(node)]};
};
export const graphicMove = (doc: Doc, id: GraphicId, parentId: GraphicId | null, index: number): EditOp => {
    const source = needObject(doc, id), at = insertion(doc, parentId, index, source.node.type);
    if (source.path.every((part, i) => at[i] === part)) return fail("cannot move into own descendants");
    return {op: "move", from: source.path, at};
};

/** Build a segment whose two endpoints are vertices in this path. Cubic handles
 * are offsets on the source handleOut and destination handleIn vertices.
 */
export const createGraphicSegment = (doc: Doc, pathId: GraphicId, from: GraphicId, to: GraphicId, kind: "line" | "cubic" = "line"): GraphicNode<"segment"> => {
    const path = needObject(doc, pathId);
    if (path.node.type !== "path") return fail("segment owner must be a path");
    for (const id of [from, to]) {
        const vertex = needObject(doc, id);
        if (vertex.node.type !== "vertex" || vertex.path.length !== path.path.length + 1 || !path.path.every((part, i) => vertex.path[i] === part)) return fail("segment endpoints must be vertices in its path");
    }
    return createGraphicNode("segment", {from, to, kind});
};

/** Validate a property override against its built-in leaf contract. */
export const createGraphicOverride = <P extends GraphicOverrideProperty>(targetId: GraphicId, property: P, value: GraphicOverrideValue<P>): GraphicNode<"instance-override"> => {
    if (!isGraphicId(targetId)) return fail("invalid override target");
    const assignment = {property, value};
    assertAssignment(assignment);
    return createGraphicNode("instance-override", {targetId, assignment: assignment as GraphicOverrideAssignment});
};

/** Resolve standard reference fields, including segment endpoints. A missing target
 * is explicit data state, not a deleted or retargeted reference record.
 */
export const resolveGraphicReference = (doc: Doc, recordId: GraphicId, field: "targetId" | "componentId" | "from" | "to"): GraphicObject | null => {
    const record = needObject(doc, recordId), value = record.node.attrs?.[field];
    const valid = field === "componentId" ? record.node.type === "instance" : field === "from" || field === "to" ? record.node.type === "segment" : GRAPHIC_OVERRIDE_KINDS.includes(record.node.type);
    if (!valid) return fail("reference field does not belong to this record");
    if (value === "") return null;
    if (!isGraphicId(value)) return fail("invalid stored reference");
    const target = findGraphicObject(doc, value);
    if (target && (field === "componentId" && target.node.type !== "component" || (field === "from" || field === "to") && target.node.type !== "vertex")) return fail("reference target has the wrong kind");
    if (target && (field === "from" || field === "to") && (target.path.length !== record.path.length || !target.path.slice(0, -1).every((part, i) => record.path[i] === part))) return fail("segment endpoint belongs to another path");
    return target;
};
