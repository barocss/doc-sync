import {canonical} from "../crdt/model.ts";
import {attrValueOk, checkSchema} from "../crdt/schema.ts";
import type {NodeJSON, Run} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {ModelRange} from "../editor/index.ts";
import type {Descendant, Point, Range} from "slate";

export type SlateText = {text: string; [mark: string]: unknown};
export type SlateElement = {type: string; attrs?: Record<string, unknown>; children: SlateNode[]};
export type SlateNode = SlateText | SlateElement;

function fail(message: string): never { throw new Error(`Slate codec: ${message}`); }
const specOf = (schema: Schema, type: string) => schema.nodes[type] ?? fail(`unknown type "${type}"`);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const leaf = (node: unknown): node is SlateText => object(node) && typeof node.text === "string";

const schemaOk = (schema: Schema): void => {
    const errors = checkSchema(schema);
    if (errors.length) fail(`invalid schema: ${errors.join("; ")}`);
};
const marksOk = (schema: Schema, marks: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(marks)) {
        if (schema.marks.includes(key)) {
            if (typeof value !== "boolean") fail(`mark "${key}" must be boolean`);
        } else if (!schema.markValues?.[key] || !attrValueOk(schema.markValues[key], value)) {
            fail(`unsupported mark "${key}" or value`);
        }
    }
};
const attrsOk = (schema: Schema, type: string, attrs: Record<string, unknown> = {}): void => {
    const spec = specOf(schema, type);
    for (const [key, value] of Object.entries(attrs)) {
        if (spec.shape === "span" && key === spec.attr && attrValueOk(schema.markValues![spec.mark], value)) continue;
        const rule = spec.attrs?.[key] ?? (spec.shape === "group" && spec.by.includes(key) ? schema.nodes[spec.children[0]]?.attrs?.[key] : undefined);
        if (!rule) fail(`unsupported attribute "${type}.${key}"`);
        if (rule.computed) {
            if (key === "spanned" ? typeof value !== "boolean" : typeof value !== "number" || !Number.isInteger(value) || value < 1) {
                fail(`invalid computed attribute "${type}.${key}"`);
            }
        } else if (!attrValueOk(rule, value)) fail(`invalid attribute "${type}.${key}"`);
    }
};

/** Schema type names are preserved; attributes live in attrs and marks are leaf properties. */
export const toSlate = (schema: Schema, model: NodeJSON): Descendant[] => {
    schemaOk(schema);
    if (model.type !== schema.root) fail(`expected root "${schema.root}"`);
    if (model.attrs && Object.keys(model.attrs).length) fail("root attributes are not part of the document model");
    if (model.runs?.length) fail("root cannot contain text runs");
    const runs = (items: Run[], owner: string): SlateNode[] => {
        const spec = specOf(schema, owner);
        const converted = items.map<SlateNode>(run => {
            if ("text" in run) {
                marksOk(schema, run.marks);
                if (spec.shape === "text" && spec.text === false && run.text) fail(`"${owner}" does not accept text`);
                return {text: run.text, ...run.marks};
            }
            const child = specOf(schema, run.type);
            if (spec.shape === "text" && !spec.children?.includes(run.type)) fail(`"${run.type}" is not allowed in "${owner}"`);
            attrsOk(schema, run.type, run.attrs);
            if (child.shape === "inline") {
                if (run.runs?.length) fail(`void "${run.type}" cannot contain runs`);
                return {type: run.type, ...(run.attrs ? {attrs: {...run.attrs}} : {}), children: [{text: ""}]};
            }
            if (child.shape !== "span") return fail(`"${run.type}" is not inline or span`);
            return {type: run.type, ...(run.attrs ? {attrs: {...run.attrs}} : {}), children: runs(run.runs ?? [], run.type)};
        });
        const result: SlateNode[] = [];
        converted.forEach(item => {
            if (!leaf(item) && (!result.length || !leaf(result.at(-1)))) result.push({text: ""});
            result.push(item);
        });
        if (!result.length || !leaf(result.at(-1))) result.push({text: ""});
        return result;
    };
    const node = (item: NodeJSON, allowed?: readonly string[]): SlateElement => {
        const spec = specOf(schema, item.type);
        if (allowed && !allowed.includes(item.type)) fail(`"${item.type}" is not an allowed child`);
        attrsOk(schema, item.type, item.attrs);
        if (spec.shape === "text" && item.children?.length) fail(`text block "${item.type}" cannot contain block children`);
        if (spec.shape !== "text" && item.runs?.length) fail(`block "${item.type}" cannot contain text runs`);
        if (spec.shape === "atom" && item.children?.length) fail(`atom "${item.type}" cannot contain content`);
        const children = spec.shape === "text" ? runs(item.runs ?? [], item.type)
            : spec.shape === "atom" ? [{text: ""}]
            : "children" in spec ? (item.children ?? []).map(child => node(child, spec.children))
            : fail(`"${item.type}" is not a block`);
        return {type: item.type, ...(item.attrs ? {attrs: {...item.attrs}} : {}), children: children.length ? children : [{text: ""}]};
    };
    // Validate the input before normalization can discard unsupported data.
    const root = specOf(schema, schema.root);
    if (root.shape !== "flow") fail("root must be a flow");
    (model.children ?? []).forEach(item => node(item, root.children));
    const normalized = canonical(schema, model);
    return (normalized.children ?? []).map(item => node(item, root.children)) as Descendant[];
};

/** Reject unknown native types/marks instead of silently dropping editor content. */
export const fromSlate = (schema: Schema, children: readonly Descendant[]): NodeJSON => {
    schemaOk(schema);
    const runs = (items: readonly SlateNode[], owner: string): Run[] => {
        const ownerSpec = specOf(schema, owner);
        return items.flatMap<Run>(item => {
            if (leaf(item)) {
                const {text, ...marks} = item;
                marksOk(schema, marks);
                if (ownerSpec.shape === "text" && ownerSpec.text === false && text) fail(`"${owner}" does not accept text`);
                return text ? [{text, marks}] : [];
            }
            if (!object(item) || typeof item.type !== "string" || !Array.isArray(item.children)) return fail("malformed inline element");
            const spec = specOf(schema, item.type);
            if (ownerSpec.shape === "text" && !ownerSpec.children?.includes(item.type)) fail(`"${item.type}" is not allowed in "${owner}"`);
            attrsOk(schema, item.type, item.attrs);
            if (spec.shape === "inline") {
                if (item.children.some(child => !leaf(child) || child.text !== "")) fail(`void "${item.type}" must have empty text only`);
                return [{type: item.type, ...(item.attrs ? {attrs: {...item.attrs}} : {})}];
            }
            if (spec.shape !== "span") return fail(`"${item.type}" is not inline or span`);
            return [{type: item.type, ...(item.attrs ? {attrs: {...item.attrs}} : {}), runs: runs(item.children, item.type)}];
        });
    };
    const node = (value: unknown, allowed: readonly string[]): NodeJSON => {
        if (!object(value) || typeof value.type !== "string" || !Array.isArray(value.children) || leaf(value)) return fail("expected a block element");
        const item = value as unknown as SlateElement;
        if (!allowed.includes(item.type)) fail(`"${item.type}" is not an allowed child`);
        const spec = specOf(schema, item.type);
        attrsOk(schema, item.type, item.attrs);
        const out: NodeJSON = {type: item.type, ...(item.attrs ? {attrs: {...item.attrs}} : {})};
        if (spec.shape === "text") out.runs = runs(item.children, item.type);
        else if (spec.shape === "atom") {
            if (item.children.some(child => !leaf(child) || child.text !== "")) fail(`atom "${item.type}" cannot contain content`);
        } else if ("children" in spec) out.children = item.children.map(child => node(child, spec.children));
        else fail(`"${item.type}" is not a block`);
        return out;
    };
    const root = specOf(schema, schema.root);
    if (root.shape !== "flow") return fail("root must be a flow");
    return canonical(schema, {type: schema.root, children: children.map(child => node(child, root.children))});
};

const at = (children: readonly Descendant[], path: readonly number[]): SlateNode | null => {
    let list = children as SlateNode[];
    let value: SlateNode | undefined;
    for (const index of path) {
        value = list[index];
        if (!value) return null;
        list = leaf(value) ? [] : value.children;
    }
    return value ?? null;
};
const width = (schema: Schema, node: SlateNode): number => leaf(node) ? node.text.length
    : specOf(schema, node.type).shape === "inline" ? 1 : node.children.reduce((sum, child) => sum + width(schema, child), 0);
const hidden = (children: readonly Descendant[], path: readonly number[]): boolean =>
    path.some((_, index) => {
        const value = at(children, path.slice(0, index + 1));
        return !!value && !leaf(value) && value.attrs?.spanned === true;
    });

/** Native offsets and returned model offsets are UTF-16; each inline node counts as one. */
export const slatePointToModel = (schema: Schema, children: readonly Descendant[], point: Point): number[] | null => {
    if (!Number.isInteger(point.offset) || point.offset < 0 || hidden(children, point.path)) return null;
    for (let depth = 1; depth < point.path.length; depth += 1) {
        const blockPath = point.path.slice(0, depth);
        const block = at(children, blockPath);
        if (!block || leaf(block) || specOf(schema, block.type).shape !== "text") continue;
        let current: SlateNode = block;
        let offset = 0;
        for (const index of point.path.slice(depth)) {
            if (leaf(current) || !current.children[index]) return null;
            if (specOf(schema, current.type).shape === "inline") return [...blockPath, offset];
            offset += current.children.slice(0, index).reduce((sum, child) => sum + width(schema, child), 0);
            current = current.children[index];
        }
        return leaf(current) && point.offset <= current.text.length ? [...blockPath, offset + point.offset] : null;
    }
    return null;
};

export const modelPointToSlate = (schema: Schema, children: readonly Descendant[], path: readonly number[]): Point | null => {
    const blockPath = path.slice(0, -1);
    const offset = path.at(-1);
    const block = at(children, blockPath);
    if (!block || leaf(block) || specOf(schema, block.type).shape !== "text" || offset === undefined || !Number.isInteger(offset) || offset < 0 || offset > width(schema, block) || hidden(children, blockPath)) return null;
    const leaves: Array<{path: number[]; start: number; text: string}> = [];
    const visit = (item: SlateNode, nativePath: number[], start: number): number => {
        if (leaf(item)) {
            leaves.push({path: nativePath, start, text: item.text});
            return item.text.length;
        }
        if (specOf(schema, item.type).shape === "inline") return 1;
        let consumed = 0;
        item.children.forEach((child, index) => { consumed += visit(child, [...nativePath, index], start + consumed); });
        return consumed;
    };
    visit(block, blockPath, 0);
    const found = leaves.find(entry => entry.start <= offset && offset <= entry.start + entry.text.length);
    return found ? {path: found.path, offset: offset - found.start} : null;
};
export const slateRangeToModel = (schema: Schema, children: readonly Descendant[], range: Range | null): ModelRange | null => {
    if (!range) return null;
    const anchor = slatePointToModel(schema, children, range.anchor);
    const focus = slatePointToModel(schema, children, range.focus);
    return anchor && focus ? {anchor, focus} : null;
};
export const modelRangeToSlate = (schema: Schema, children: readonly Descendant[], range: ModelRange | null): Range | null => {
    if (!range) return null;
    const anchor = modelPointToSlate(schema, children, range.anchor);
    const focus = modelPointToSlate(schema, children, range.focus);
    return anchor && focus ? {anchor, focus} : null;
};
