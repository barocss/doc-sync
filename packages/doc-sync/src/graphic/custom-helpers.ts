import {MAIN} from "../crdt/doc.ts";
import type {Block, Doc} from "../crdt/doc.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";
import {fieldJsonOk, safeFieldName} from "../crdt/fields.ts";
import {attrValueOk} from "../crdt/schema.ts";
import type {AttrSpec, GraphicSchema} from "../crdt/schema.ts";
import {schemaVersion} from "../crdt/schema-version.ts";
import {GRAPHIC_LIMITS} from "./schema.ts";
import {isGraphicId} from "./helpers.ts";
import type {GraphicId, GraphicObject} from "./types.ts";

type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T extends readonly (infer V)[] ? Widen<V>[] : T extends object ? {[K in keyof T]: Widen<T[K]>} : unknown;
/** Field records accept partial leaf patches. Atomic records retain their full value type. */
export type GraphicSchemaValue<T> = T extends {fields: infer F} ? {[K in keyof F]?: GraphicSchemaValue<F[K]>} | null
    : T extends {values: readonly (infer V)[]} ? V | null : T extends {default: infer V} ? Widen<V> | null : unknown;
export type GraphicSchemaKind<S extends GraphicSchema> = string extends S["root"] ? keyof S["nodes"] & string : Exclude<keyof S["nodes"] & string, S["root"]>;
export type GraphicSchemaPatch<S extends GraphicSchema, K extends keyof S["nodes"]> = string extends keyof S["nodes"] ? Record<string, unknown> : S["nodes"][K] extends {attrs: infer A}
    ? {[P in keyof A]?: GraphicSchemaValue<A[P]>} : Record<string, never>;
export type CustomGraphicNode<K extends string> = NodeJSON & {type: K};

/** Schema-bound data operations for container, text and atom graphic objects.
 * These helpers return edits for the caller's normal Doc/history/sync lifecycle.
 * They do not define rendering or application-specific reference semantics.
 */
export function createGraphicHelpers<const S extends GraphicSchema>(input: S) {
    const version = schemaVersion(input);
    if (input.domain !== "graphic") throw new Error("Graphic: helpers require the graphic domain");
    const schema = structuredClone(input);
    const assertAttrSpecs = (attrs: Record<string, AttrSpec>): void => {
        for (const [name, spec] of Object.entries(attrs)) {
            if (!safeFieldName(name) || !spec || typeof spec !== "object" || Array.isArray(spec) || !Object.hasOwn(spec, "default") || !fieldJsonOk(spec.default)) throw new Error(`Graphic: malformed attribute descriptor ${name}`);
            if (Object.keys(spec).some(key => !["fields", "default", "values", "min", "max", "inherit", "pattern", "computed"].includes(key))) throw new Error(`Graphic: unsupported attribute descriptor ${name}`);
            if (spec.values !== undefined && (!Array.isArray(spec.values) || !spec.values.every(fieldJsonOk)) || [spec.min, spec.max].some(value => value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) || spec.min !== undefined && spec.max !== undefined && spec.min > spec.max || [spec.inherit, spec.computed].some(value => value !== undefined && typeof value !== "boolean")) throw new Error(`Graphic: malformed attribute constraints ${name}`);
            if (spec.pattern !== undefined) {
                if (typeof spec.pattern !== "string") throw new Error(`Graphic: malformed pattern ${name}`);
                new RegExp(spec.pattern);
            }
            if (!spec.computed && !attrValueOk(spec, spec.default)) throw new Error(`Graphic: invalid attribute default ${name}`);
            if (spec.fields) assertAttrSpecs(spec.fields);
        }
    };
    if (schema.marks.some(mark => typeof mark !== "string" || !safeFieldName(mark)) || new Set(schema.marks).size !== schema.marks.length || schema.marks.some(mark => Object.hasOwn(schema.markValues ?? {}, mark))) throw new Error("Graphic: malformed marks");
    assertAttrSpecs(schema.markValues ?? {});
    for (const [type, spec] of Object.entries(schema.nodes)) {
        if (!["container", "text", "atom"].includes(spec.shape) || spec.shape === "text" && (spec.children?.length ?? 0) > 0) {
            throw new Error(`Graphic: unsupported descriptor ${type}.${spec.shape}`);
        }
        if (spec.shape === "text" && (spec.text !== undefined && typeof spec.text !== "boolean" || spec.next !== undefined && typeof spec.next !== "string")) throw new Error(`Graphic: malformed text descriptor ${type}`);
        assertAttrSpecs(spec.attrs ?? {});
        const allowed = spec.shape === "container" ? ["shape", "children", "attrs", "ui"] : spec.shape === "text" ? ["shape", "children", "attrs", "ui", "text", "next"] : ["shape", "attrs", "ui"];
        if (Object.keys(spec).some(key => !allowed.includes(key))) throw new Error(`Graphic: unsupported descriptor properties for ${type}`);
    }
    const fail = (reason: string): never => { throw new Error(`Graphic: ${reason}`); };
    const assertDoc = (doc: Doc): void => {
        if (!doc.schema || schemaVersion(doc.schema) !== version) fail("schema identity does not match");
    };
    const attrsOk = (type: string, attrs: unknown): void => {
        if (!attrs || !fieldJsonOk(attrs) || typeof attrs !== "object" || Array.isArray(attrs)) fail("attributes must be safe JSON records");
        const specs = schema.nodes[type]?.attrs ?? {};
        for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
            if (!Object.hasOwn(specs, key) || !attrValueOk(specs[key], value)) fail(`invalid ${type}.${key}`);
        }
    };
    const assertNode = (node: NodeJSON): void => {
        if (!fieldJsonOk(node)) fail("node must be finite safe JSON");
        const pending = [{node, depth: 0}];
        let count = 0;
        while (pending.length) {
            const {node: n, depth} = pending.pop()!;
            if (++count > GRAPHIC_LIMITS.nodes || depth > GRAPHIC_LIMITS.depth) fail("node limits exceeded");
            if (!n || typeof n !== "object" || !Object.hasOwn(schema.nodes, n.type) || n.type === schema.root) fail("unknown object type");
            if (Object.keys(n).some(key => !["type", "attrs", "children", "runs"].includes(key))) fail("unknown node property");
            attrsOk(n.type, n.attrs === undefined ? {} : n.attrs);
            const spec = schema.nodes[n.type];
            if (spec.shape === "container") {
                if (n.runs !== undefined || n.children !== undefined && !Array.isArray(n.children)) fail("invalid container content");
                for (const child of n.children ?? []) {
                    if (!child || !spec.children.includes(child.type)) fail(`invalid child of ${n.type}`);
                    pending.push({node: child, depth: depth + 1});
                }
            } else if (spec.shape === "text") {
                if (n.children !== undefined || n.runs !== undefined && !Array.isArray(n.runs)) fail("invalid text content");
                for (const run of n.runs ?? []) {
                    if (!run || !("text" in run) || typeof run.text !== "string" || !run.marks || typeof run.marks !== "object" || Array.isArray(run.marks) || Object.keys(run).some(key => !["text", "marks"].includes(key))) fail("invalid text run");
                    if (!("text" in run)) return fail("inline runs are not supported");
                    if (spec.text === false && run.text) fail("text is disabled");
                    for (const [key, value] of Object.entries(run.marks)) {
                        if (schema.marks.includes(key) ? typeof value !== "boolean" : !Object.hasOwn(schema.markValues ?? {}, key) || !attrValueOk(schema.markValues![key], value)) fail("invalid text mark");
                    }
                }
            } else if (n.children !== undefined || n.runs !== undefined) fail("atom cannot contain content");
        }
    };
    const createNode = <K extends GraphicSchemaKind<S>>(type: K, attrs: GraphicSchemaPatch<S, K> = {} as GraphicSchemaPatch<S, K>, content: {children?: NodeJSON[]; text?: string} = {}): CustomGraphicNode<K> => {
        if (!content || typeof content !== "object" || Array.isArray(content) || !fieldJsonOk(content) || Object.keys(content).some(key => !["children", "text"].includes(key))) return fail("invalid content options");
        if (content.text !== undefined && (typeof content.text !== "string" || schema.nodes[type]?.shape !== "text")) return fail("text requires a text object");
        const node: CustomGraphicNode<K> = {type, attrs: attrs as Record<string, unknown>, ...(content.children !== undefined ? {children: content.children} : {}),
            ...(schema.nodes[type]?.shape === "text" ? {runs: content.text ? [{text: content.text, marks: {}}] : []} : {})};
        assertNode(node);
        return structuredClone(node);
    };
    const findObject = (doc: Doc, id: GraphicId): GraphicObject | null => {
        assertDoc(doc);
        if (!isGraphicId(id)) return fail("invalid object ID");
        return doc.withReadProjection(projection => {
            const pending = [{line: MAIN, path: [] as number[]}];
            let count = 0;
            while (pending.length) {
                const {line, path} = pending.pop()!;
                if (path.length > GRAPHIC_LIMITS.depth) return fail("object depth limit exceeded");
                const blocks = projection.blocks(line);
                for (let i = 0; i < blocks.length; i++) {
                    if (++count > GRAPHIC_LIMITS.nodes) return fail("object count limit exceeded");
                    const block = blocks[i], at = [...path, i];
                    if (block.marker.key === id) return {id, path: at, node: projection.projectVisibleBlock(block)};
                    if (block.kind === "flow") pending.push({line: block.body, path: at});
                }
            }
            return null;
        });
    };
    const objectAt = (doc: Doc, path: readonly number[]): GraphicObject => {
        assertDoc(doc);
        if (!Array.isArray(path) || !path.length || path.length > GRAPHIC_LIMITS.depth || path.some(i => !Number.isSafeInteger(i) || i < 0)) return fail("invalid object path");
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
    const needObject = (doc: Doc, id: GraphicId): GraphicObject => findObject(doc, id) ?? fail("object is not visible");
    const insertion = (doc: Doc, parentId: GraphicId | null, index: number, type: string): number[] => {
        assertDoc(doc);
        const parent = parentId === null ? {path: [], node: doc.toJSON()} : needObject(doc, parentId);
        const spec = schema.nodes[parent.node.type];
        if (spec?.shape !== "container" || !spec.children.includes(type)) return fail("parent cannot contain this type");
        if (!Number.isSafeInteger(index) || index < 0 || index > (parent.node.children?.length ?? 0)) return fail("invalid insertion index");
        return [...parent.path, index];
    };
    const insert = (doc: Doc, parentId: GraphicId | null, index: number, node: NodeJSON): EditOp => {
        assertNode(node);
        return {op: "insert", at: insertion(doc, parentId, index, node.type), content: [structuredClone(node)]};
    };
    const update = <K extends GraphicSchemaKind<S>>(doc: Doc, id: GraphicId, type: K, attrs: GraphicSchemaPatch<S, K>): EditOp => {
        const object = needObject(doc, id);
        if (object.node.type !== type) return fail("object type does not match");
        attrsOk(type, attrs);
        return {op: "update", at: object.path, attrs: structuredClone(attrs) as Record<string, unknown>};
    };
    const move = (doc: Doc, id: GraphicId, parentId: GraphicId | null, index: number): EditOp => {
        const source = needObject(doc, id), at = insertion(doc, parentId, index, source.node.type);
        if (source.path.every((part, i) => at[i] === part)) return fail("cannot move into own descendants");
        return {op: "move", from: source.path, at};
    };
    const remove = (doc: Doc, id: GraphicId): EditOp => ({op: "delete", at: needObject(doc, id).path, count: 1});
    return {schemaVersion: version, assertNode, createNode, findObject, objectAt, insert, update, move, delete: remove};
}
