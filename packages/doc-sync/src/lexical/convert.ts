import {
    $createParagraphNode, $createTextNode, $getRoot, $isElementNode, $isTextNode,
    createEditor,
} from "lexical";
import {$createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode} from "@lexical/rich-text";
import {$createTableNode, $createTableRowNode, $createTableCellNode, $isTableNode, $isTableRowNode, $isTableCellNode} from "@lexical/table";
import {$modelChildren} from "./grid.ts";
import {canonical} from "../crdt/model.ts";
import {attrValueOk, gridParts} from "../crdt/schema.ts";
import {$modelData, $setModelData, modelDataFor, SchemaElementNode, SchemaLeafNode} from "./nodes.ts";
import type {ElementNode, LexicalEditor, LexicalNode, SerializedEditorState, TextFormatType} from "lexical";
import type {HeadingTagType} from "@lexical/rich-text";
import type {Marks, NodeJSON, Run} from "../crdt/model.ts";
import type {LexicalSchemaInfo, LexicalCodecContext} from "./schema.ts";

const formats: Record<string, TextFormatType> = {bold: "bold", italic: "italic", underline: "underline", strike: "strikethrough", code: "code", subscript: "subscript", superscript: "superscript", highlight: "highlight"};
const attrsOf = (node: LexicalNode): Record<string, unknown> => structuredClone($modelData(node)?.attrs ?? {});
const withAttrs = (type: string, attrs: Record<string, unknown>): NodeJSON => ({type, ...(Object.keys(attrs).length ? {attrs} : {})});
const context = (info: LexicalSchemaInfo): LexicalCodecContext => ({schema: info.schema, create: model => $createModelNode(info, model), read: node => $readModelNode(info, node)});

/** Build a native node inside editor.update(). All schema data is retained in NodeState. */
export function $createModelNode(info: LexicalSchemaInfo, model: NodeJSON | Run): LexicalNode {
    for (const codec of info.codecs) {
        const custom = codec.toLexical?.(model, context(info));
        if (custom) return custom;
    }
    if ("text" in model) {
        const node = $createTextNode(model.text);
        for (const [mark, format] of Object.entries(formats)) if (model.marks[mark]) node.toggleFormat(format);
        return $setModelData(node, {type: "text", shape: "text-run", marks: model.marks});
    }
    const spec = info.schema.nodes[model.type];
    if (!spec) throw new Error(`Unsupported model node: ${model.type}`);
    const elementModel = model as NodeJSON;
    const data = modelDataFor(model, spec.shape);
    let node: LexicalNode;
    if (spec.shape === "inline" || spec.shape === "atom") return $setModelData(new SchemaLeafNode(), data);
    if (spec.shape === "text") {
        const heading = Object.entries(info.native.headings ?? {}).find(([, type]) => type === model.type)?.[0] as HeadingTagType | undefined;
        node = heading ? $createHeadingNode(heading) : model.type === info.native.quote ? $createQuoteNode() : model.type === info.native.paragraph ? $createParagraphNode() : new SchemaElementNode();
        $setModelData(node, data);
        (node as ElementNode).append(...(model.runs ?? []).map(run => $createModelNode(info, run)));
        return node;
    }
    if (spec.shape === "grid") node = $createTableNode();
    else if (spec.shape === "row") node = $createTableRowNode();
    else if (spec.shape === "cell") {
        const body = elementModel.children?.[0];
        if (!body || info.schema.nodes[body.type]?.shape !== "flow") throw new Error(`Cell ${model.type} requires its schema flow body`);
        data.body = {type: body.type, ...(body.attrs ? {attrs: structuredClone(body.attrs)} : {})};
        const cell = $createTableCellNode(0, Number(model.attrs?.colspan ?? 1));
        cell.setRowSpan(Number(model.attrs?.rowspan ?? 1));
        if (typeof model.attrs?.backgroundColor === "string") cell.setBackgroundColor(model.attrs.backgroundColor);
        $setModelData(cell, data);
        cell.append(...(body.children ?? []).map(child => $createModelNode(info, child)));
        return cell;
    } else node = new SchemaElementNode();
    $setModelData(node, data);
    if (!$isElementNode(node)) throw new Error(`Container must be an element: ${model.type}`);
    const children = spec.shape === "span" ? (model.runs ?? []) : (elementModel.children ?? []);
    if ($isTableNode(node)) {
        const hidden = hiddenCells(elementModel);
        if (hidden.length) $setModelData(node, {...data, hidden});
        node.append(...(elementModel.children ?? []).map((row, r) => {
            const nativeRow = $createModelNode(info, {...row, children: []});
            if (!$isElementNode(nativeRow)) throw new Error("Table row must be an element");
            for (const [c, cell] of (row.children ?? []).entries()) {
                if (cell.attrs?.spanned) continue;
                const nativeCell = $createModelNode(info, cell);
                $setModelData(nativeCell, {...$modelData(nativeCell)!, grid: {row: r, column: c}});
                nativeRow.append(nativeCell);
            }
            return nativeRow;
        }));
    } else node.append(...children.map(child => $createModelNode(info, child)));
    if ($isTableNode(node) && model.attrs?.header === true) {
        const first = node.getFirstChild();
        if ($isTableRowNode(first)) for (const child of first.getChildren()) if ($isTableCellNode(child)) child.setHeaderStyles(1);
    }
    return node;
}

function inferredType(info: LexicalSchemaInfo, node: LexicalNode): string {
    const data = $modelData(node);
    if (data?.shape === "text-run") throw new Error("Text runs do not have block types");
    if ($isHeadingNode(node)) {
        const tag = node.getTag();
        const mapped = info.native.headings?.[tag];
        if (!mapped) throw new Error(`Unsupported native heading: ${tag}`);
        return mapped;
    }
    if (data) {
        if (!info.schema.nodes[data.type]) throw new Error(`Unknown schema metadata: ${data.type}`);
        return data.type;
    }
    if ($isQuoteNode(node) && info.native.quote) return info.native.quote;
    if (node.getType() === "paragraph" && info.native.paragraph) return info.native.paragraph;
    if ($isTableNode(node) && info.native.table) return info.native.table;
    if ($isTableRowNode(node) || $isTableCellNode(node)) {
        const table = $isTableRowNode(node) ? node.getParent() : node.getParent()?.getParent();
        if (table && $isTableNode(table)) {
            const parts = gridParts(info.schema, inferredType(info, table));
            if (parts) return $isTableRowNode(node) ? parts.row : parts.cell;
        }
    }
    throw new Error(`Unsupported native Lexical node: ${node.getType()}`);
}

/** Read inside editorState.read() or editor.update(). Unknown native nodes fail explicitly. */
export function $readModelNode(info: LexicalSchemaInfo, node: LexicalNode): NodeJSON | Run {
    for (const codec of info.codecs) {
        const custom = codec.fromLexical?.(node, context(info));
        if (custom) return custom;
    }
    if ($isTextNode(node)) {
        if (node.getFormat() & ~255) throw new Error("Native text case transforms require an explicit Lexical codec");
        const marks: Marks = structuredClone($modelData(node)?.marks ?? {});
        for (const [mark, format] of Object.entries(formats)) {
            if (node.hasFormat(format)) {
                if (!info.schema.marks.includes(mark)) throw new Error(`Unsupported native text format: ${mark}`);
                marks[mark] = true;
            } else delete marks[mark];
        }
        if (node.getStyle()) throw new Error("Native CSS text styles require an explicit Lexical codec");
        return {text: node.getTextContent(), marks};
    }
    const type = inferredType(info, node);
    const spec = info.schema.nodes[type];
    const attrs = attrsOf(node);
    if (spec.shape === "inline" || spec.shape === "atom") {
        if (!(node instanceof SchemaLeafNode)) throw new Error(`Atomic native node requires a codec: ${node.getType()}`);
        return withAttrs(type, attrs);
    }
    if (!$isElementNode(node)) throw new Error(`Unsupported non-element: ${node.getType()}`);
    if (spec.shape === "text" || spec.shape === "span") return {...withAttrs(type, attrs), runs: node.getChildren().map(child => {
        const run = $readModelNode(info, child);
        if (!("text" in run) && !["inline", "span"].includes(info.schema.nodes[run.type]?.shape)) throw new Error(`Unsupported node inside text: ${run.type}`);
        return run as Run;
    })};
    if ($isTableCellNode(node)) {
        for (const [key, value] of [["colspan", node.getColSpan()], ["rowspan", node.getRowSpan()]] as const) {
            if (value > 1) attrs[key] = value; else delete attrs[key];
        }
        const background = node.getBackgroundColor();
        if (background) {
            if (!spec.attrs?.backgroundColor) throw new Error("Native cell background requires a schema backgroundColor attribute");
            if (!attrValueOk(spec.attrs.backgroundColor, background)) throw new Error("Native cell background does not match the schema");
            attrs.backgroundColor = background;
        } else delete attrs.backgroundColor;
        const parts = node.getParent()?.getParent();
        const grid = parts && $isTableNode(parts) ? gridParts(info.schema, inferredType(info, parts)) : null;
        const body = $modelData(node)?.body ?? (grid ? {type: grid.body} : null);
        if (!body) throw new Error("Cannot infer table cell body");
        return {...withAttrs(type, attrs), children: [{...withAttrs(body.type, body.attrs ?? {}), children: node.getChildren().map(child => $readModelNode(info, child) as NodeJSON)}]};
    }
    if ($isTableNode(node)) {
        const rows = node.getChildren();
        const headers = rows.flatMap((row, r) => $isElementNode(row) ? row.getChildren().map(cell => ({r, state: $isTableCellNode(cell) ? cell.getHeaderStyles() : 0})) : []);
        const first = headers.filter(cell => cell.r === 0);
        if (headers.some(cell => cell.state !== 0 && (cell.r !== 0 || cell.state !== 1)) || (first.some(cell => cell.state === 1) && first.some(cell => cell.state === 0))) throw new Error("Mixed native table headers require an explicit codec");
        if (first.some(cell => cell.state === 1)) {
            if (!spec.attrs?.header) throw new Error("Native table headers require a schema header attribute");
            attrs.header = true;
        } else if (spec.attrs?.header) attrs.header = false;
    }
    return {...withAttrs(type, attrs), children: $isTableNode(node) ? readGrid(info, node, type) : node.getChildren().map(child => $readModelNode(info, child) as NodeJSON)};
}

export function $toLexical(info: LexicalSchemaInfo, model: NodeJSON): void {
    if (model.type !== info.schema.root) throw new Error(`Expected model root ${info.schema.root}`);
    if (model.attrs && Object.keys(model.attrs).length) throw new Error("Root attributes are not represented by the core canonical model");
    $setModelData($getRoot(), modelDataFor(model, "flow"));
    $getRoot().clear().append(...(model.children ?? []).map(child => $createModelNode(info, child)));
}
export function $fromLexical(info: LexicalSchemaInfo): NodeJSON {
    const root = $getRoot();
    return canonical(info.schema, {...withAttrs(info.schema.root, attrsOf(root)), children: root.getChildren().map(child => $readModelNode(info, child) as NodeJSON)});
}
export function toLexicalJSON(info: LexicalSchemaInfo, model: NodeJSON): SerializedEditorState {
    const editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    editor.update(() => $toLexical(info, model), {discrete: true});
    return editor.getEditorState().toJSON();
}
export function fromLexicalJSON(info: LexicalSchemaInfo, json: SerializedEditorState): NodeJSON {
    const editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    const state = editor.parseEditorState(json);
    return state.read(() => $fromLexical(info), {editor});
}
export function readLexicalModel(editor: LexicalEditor, info: LexicalSchemaInfo): NodeJSON {
    return editor.getEditorState().read(() => $fromLexical(info), {editor});
}

/** Retain covered content outside native table geometry and serialized DOM nodes. */
function hiddenCells(table: NodeJSON) {
    const hidden: NonNullable<import("./nodes.ts").LexicalModelData["hidden"]> = [];
    for (const [r, row] of (table.children ?? []).entries()) for (const [c, cell] of (row.children ?? []).entries()) {
        if (cell.attrs?.spanned) continue;
        for (let dr = 0; dr < Number(cell.attrs?.rowspan ?? 1); dr++) for (let dc = 0; dc < Number(cell.attrs?.colspan ?? 1); dc++) {
            const covered = table.children?.[r + dr]?.children?.[c + dc];
            if ((dr || dc) && covered) hidden.push({row: r + dr, column: c + dc, owner: {row: r, column: c}, cell: structuredClone(covered)});
        }
    }
    return hidden;
}
function readGrid(info: LexicalSchemaInfo, table: import("@lexical/table").TableNode, type: string): NodeJSON[] {
    const parts = gridParts(info.schema, type)!;
    const rows = table.getChildren();
    // Older exported states kept covered cells as native row children.
    if (rows.some(row => $isElementNode(row) && row.getChildren().some(cell => $modelData(cell)?.attrs?.spanned))) {
        return rows.map(row => $readModelNode(info, row) as NodeJSON);
    }
    const grid: NodeJSON[][] = rows.map(() => []);
    const native = new Map<string, LexicalNode>();
    const origins = new Map<string, {row: number; column: number}>(), columns = new Map();
    rows.forEach((row, r) => $modelChildren(row, columns).forEach(({node, index}) => {
        const origin = $modelData(node)?.grid;
        const key = origin && `${origin.row}:${origin.column}`;
        if (key && !origins.has(key)) origins.set(key, {row: r, column: index});
    }));
    // Retained native cell identity remaps covered data when rows/columns are
    // inserted before a merge. Split-cell clones follow the original master.
    const hidden = ($modelData(table)?.hidden ?? []).flatMap(item => {
        const origin = origins.get(`${item.owner.row}:${item.owner.column}`);
        return origin ? [{...item, row: item.row + origin.row - item.owner.row, column: item.column + origin.column - item.owner.column}] : [];
    });
    const covered = new Map(hidden.map(item => [`${item.row}:${item.column}`, item.cell]));
    for (const [r, row] of rows.entries()) {
        for (const {node, index: c} of $modelChildren(row, columns)) {
            if (!$isTableCellNode(node)) throw new Error("Table row requires native cells");
            native.set(`${r}:${c}`, node);
            grid[r][c] = $readModelNode(info, node) as NodeJSON;
            for (let dr = 0; dr < node.getRowSpan() && r + dr < rows.length; dr++) {
                for (let dc = 0; dc < node.getColSpan(); dc++) if (dr || dc) {
                    grid[r + dr][c + dc] = structuredClone(covered.get(`${r + dr}:${c + dc}`) ?? {type: parts.cell, children: [{type: parts.body, children: []}]});
                }
            }
        }
    }
    // Native unmerge creates blank cells. Restore their retained data before the
    // binding projects the canonical grid back into those native cells.
    for (const item of hidden) {
        if (!grid[item.row]) continue;
        const node = native.get(`${item.row}:${item.column}`);
        if (!grid[item.row][item.column] || node && !node.getTextContent()) grid[item.row][item.column] = structuredClone(item.cell);
    }
    const width = Math.max(0, ...grid.map(row => row.length));
    return rows.map((row, r) => ({...withAttrs(parts.row, attrsOf(row)), children: Array.from({length: width}, (_, c) => grid[r][c] ?? {type: parts.cell, children: [{type: parts.body, children: []}]})}));
}

/** Refresh canonical metadata and restored content without replacing selections. */
export function $syncLexicalCells(info: LexicalSchemaInfo, model: NodeJSON): void {
    const columns = new Map();
    const visit = (node: LexicalNode, current: NodeJSON | undefined, r = 0, c = 0) => {
        if (!current || !$isElementNode(node)) return;
        if ($isTableCellNode(node)) {
            const next = {...$modelData(node)!, ...modelDataFor(current, "cell"), grid: {row: r, column: c}};
            if (!current.attrs) delete next.attrs;
            if (JSON.stringify($modelData(node)) !== JSON.stringify(next)) $setModelData(node, next);
            const columnSpan = Number(current.attrs?.colspan ?? 1), rowSpan = Number(current.attrs?.rowspan ?? 1);
            if (node.getColSpan() !== columnSpan) node.setColSpan(columnSpan);
            if (node.getRowSpan() !== rowSpan) node.setRowSpan(rowSpan);
            const background = typeof current.attrs?.backgroundColor === "string" ? current.attrs.backgroundColor : null;
            if (node.getBackgroundColor() !== background) node.setBackgroundColor(background);
            const body = current.children?.[0];
            const actual = node.getChildren().map(child => $readModelNode(info, child));
            if (JSON.stringify(actual) !== JSON.stringify(body?.children ?? [])) {
                node.clear().append(...(body?.children ?? []).map(child => $createModelNode(info, child)));
            }
            return;
        }
        if ($isTableNode(node)) {
            const data = $modelData(node);
            if (data) {
                const next = {...data}, hidden = hiddenCells(current);
                if (hidden.length) next.hidden = hidden; else delete next.hidden;
                if (JSON.stringify(data) !== JSON.stringify(next)) $setModelData(node, next);
            }
            node.getChildren().forEach((row, index) => visit(row, current.children?.[index], index));
        } else if ($isTableRowNode(node)) {
            $modelChildren(node, columns).forEach(({node: cell, index}) => visit(cell, current.children?.[index], r, index));
        } else node.getChildren().forEach((child, index) => visit(child, current.children?.[index]));
    };
    $getRoot().getChildren().forEach((node, index) => visit(node, model.children?.[index]));
}
export {inferredType as $lexicalModelType};
