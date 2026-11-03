import {JsonReadBudget, assertReadValueBudget} from "./read-budget.ts";
import {SlicePreflight} from "./read-preflight.ts";
import {entriesOf, resolvePath, visibleBlocks} from "./edit.ts";
import type {Block, Doc} from "./doc.ts";
import type {NodeJSON, Run} from "./model.ts";
import type {GroupSpec} from "./schema.ts";

const READ_LIMIT_FIELDS = Object.freeze(["limit", "maxNodes", "maxTextUnits", "maxBytes"] as const);


export type SliceQuery = {path?: number[]; start?: number; limit?: number; maxNodes?: number; maxTextUnits?: number; maxBytes?: number};
export const SLICE_LIMITS = Object.freeze({limit: 100, maxNodes: 4096, maxTextUnits: 65_536, maxBytes: 262_144, depth: 32});
type LineIndex = {blocks: Block[]; visible: number[]; entries: ReturnType<typeof entriesOf>};
const indexes = new WeakMap<Doc, {version: number; lines: Map<string, LineIndex>}>();
const indexLine = (doc: Doc, line: string): {index: LineIndex; indexedBlocks: number} => {
    let state = indexes.get(doc);
    if (!state || state.version !== doc.version) {
        state = {version: doc.version, lines: new Map()};
        indexes.set(doc, state);
    }
    const cached = state.lines.get(line);
    if (cached) return {index: cached, indexedBlocks: 0};
    const blocks = doc.blocks(line);
    const index = {blocks, visible: visibleBlocks(doc, line), entries: entriesOf(doc, line)};
    state.lines.set(line, index);
    return {index, indexedBlocks: blocks.length};
};

export type DocumentSlice = {
    view: "model"; path: number[]; start: number; total: number;
    children: Array<{path: number[]; blockId: string | null; node: NodeJSON}>;
    nextIndex: number | null;
    counts: {nodes: number; textUnits: number; bytes: number; projectedBlocks: number; indexedBlocks: number};
};

/** Validate before reading: failed queries cannot create model addresses. */
export function validateSliceQuery(query: SliceQuery): Required<SliceQuery> {
    if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("Invalid slice query");
    const path = query.path ?? [];
    if (!Array.isArray(path) || path.length > SLICE_LIMITS.depth || path.some(i => !Number.isSafeInteger(i) || i < 0)) throw new Error("Invalid slice path");
    const out = {path: [...path], start: query.start ?? 0, limit: query.limit ?? 20,
        maxNodes: query.maxNodes ?? SLICE_LIMITS.maxNodes, maxTextUnits: query.maxTextUnits ?? SLICE_LIMITS.maxTextUnits, maxBytes: query.maxBytes ?? SLICE_LIMITS.maxBytes};
    if (!Number.isSafeInteger(out.start) || out.start < 0) throw new Error("Invalid slice start");
    for (const key of READ_LIMIT_FIELDS) {
        if (!Number.isSafeInteger(out[key]) || out[key] < 1 || out[key] > SLICE_LIMITS[key]) throw new Error(`Invalid slice ${key}`);
    }
    return out;
}

/**
 * Read canonical flow/group children. Model paths contain child indexes, never text offsets.
 * Grid rows/cells are address steps only. Covered-cell data matches the retained canonical model.
 * Sibling indexing can scan the containing line; model materialization is limited to returned subtrees.
 */
export function readDocumentSlice(doc: Doc, query: SliceQuery = {}): DocumentSlice {
    const q = validateSliceQuery(query);
    return doc.withReadProjection(projection => readProjectedSlice(projection, q), value => assertReadValueBudget(value, q.maxBytes));
}

function readProjectedSlice(doc: Doc, q: Required<SliceQuery>): DocumentSlice {
    // resolvePath's edit convenience accepts any cell-body index. Reads require exactly zero.
    for (let n = 0; n < q.path.length; n++) {
        const parent = resolvePath(doc, q.path.slice(0, n));
        if (parent.kind === "cell" && q.path[n] !== 0) throw new Error("Invalid cell body path");
    }
    const ref = resolvePath(doc, q.path);
    let line: string, flats: number[] | null = null, groupType: string | null = null;
    if (ref.kind === "flow") line = ref.line;
    else if (ref.kind === "group") {
        line = ref.line; flats = ref.flats;
        const first = doc.blocks(line)[visibleBlocks(doc, line)[flats[0]]];
        groupType = doc.groupOf(line, first.type)?.type ?? null;
    } else if (ref.kind === "block") {
        const block = doc.blocks(ref.line)[ref.b];
        if (block.kind !== "flow") throw new Error("Slice parent must be a flow or group");
        line = block.body;
    } else throw new Error("Slice parent must be a flow or group");
    const {index, indexedBlocks} = indexLine(doc, line);
    const {blocks, visible} = index;
    const entries = flats ? flats.map(flat => ({group: null, flats: [flat]})) : index.entries;
    if (q.start > entries.length) throw new Error("Slice start exceeds child count");
    let projectedBlocks = 0;
    const selected = entries.slice(q.start, q.start + q.limit);
    const preflight = new SlicePreflight(doc, q);
    for (const entry of selected) preflight.entry(entry.flats.map(flat => blocks[visible[flat]]), entry.group, 0, groupType);
    const nextIndex = q.start + selected.length < entries.length ? q.start + selected.length : null;
    const skeleton = {view: "model", path: q.path, start: q.start, total: entries.length,
        children: selected.map((entry, index) => { const block = blocks[visible[entry.flats[0]]]; return {
            path: [...q.path, q.start + index], blockId: entry.group || (block.kind === "text" && block.virtual) ? null : block.marker.key, node: null}; }), nextIndex,
        counts: {nodes: preflight.nodes, textUnits: preflight.textUnits, bytes: 0,
            projectedBlocks: selected.reduce((sum, entry) => sum + entry.flats.length, 0), indexedBlocks}};
    for (let i = 0; i < 4; i++) {
        const metadata = new JsonReadBudget(q.maxBytes); metadata.value(skeleton);
        skeleton.counts.bytes = metadata.bytes + preflight.json.bytes - 4 * selected.length;
        if (skeleton.counts.bytes > q.maxBytes) throw new Error("Slice exceeds JSON byte budget before projection");
    }
    const stripGroup = (node: NodeJSON, type: string): NodeJSON => {
        const by = (doc.schema!.nodes[type] as GroupSpec).by;
        if (node.attrs) {
            for (const key of by) delete node.attrs[key];
            if (!Object.keys(node.attrs).length) delete node.attrs;
        }
        return node;
    };
    const children = selected.map((entry, index) => {
        const source = entry.flats.map(flat => blocks[visible[flat]]);
        const nodes = source.map(block => { projectedBlocks++; return doc.projectVisibleBlock(block); });
        let node = nodes[0];
        if (entry.group) {
            const by = (doc.schema!.nodes[entry.group] as GroupSpec).by;
            const attrs = Object.fromEntries(by.map(key => [key, node.attrs?.[key]]));
            node = {type: entry.group, ...(by.length ? {attrs} : {}), children: nodes.map(child => stripGroup(child, entry.group!))};
        } else if (groupType) node = stripGroup(node, groupType);
        return {path: [...q.path, q.start + index], blockId: entry.group || (source[0].kind === "text" && source[0].virtual) ? null : source[0].marker.key, node};
    });
    let nodes = 0, textUnits = 0;
    const countRun = (run: Run): void => { nodes++; if ("text" in run) textUnits += run.text.length; else run.runs?.forEach(countRun); };
    const count = (node: NodeJSON): void => { nodes++; node.runs?.forEach(countRun); node.children?.forEach(count); };
    children.forEach(child => count(child.node));
    if (nodes > q.maxNodes) throw new Error("Slice exceeds node budget");
    if (textUnits > q.maxTextUnits) throw new Error("Slice exceeds text budget");
    const out: DocumentSlice = {view: "model", path: [...q.path], start: q.start, total: entries.length, children, nextIndex, counts: {nodes, textUnits, bytes: 0, projectedBlocks, indexedBlocks}};
    // Count the complete Core result, including paths, identities, and counters.
    for (let i = 0; i < 4; i++) out.counts.bytes = new TextEncoder().encode(JSON.stringify(out)).length;
    if (out.counts.bytes > q.maxBytes) throw new Error("Slice exceeds JSON byte budget");
    return out;
}
