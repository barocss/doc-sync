import {$getState, $setState, createState, DecoratorNode, ElementNode} from "lexical";
import type {EditorConfig, LexicalEditor, NodeKey, RangeSelection, SerializedElementNode, SerializedLexicalNode} from "lexical";
import type {Marks, NodeJSON} from "../crdt/model.ts";
import type {Shape} from "../crdt/schema.ts";

export type LexicalModelData = {
    type: string;
    shape: Shape | "text-run";
    attrs?: Record<string, unknown>;
    marks?: Marks;
    body?: {type: string; attrs?: Record<string, unknown>};
    grid?: {row: number; column: number};
    hidden?: Array<{row: number; column: number; owner: {row: number; column: number}; cell: NodeJSON}>;
};
const dataState = createState("docSync", {
    parse: (value: unknown): LexicalModelData | null => {
        if (!value || typeof value !== "object" || typeof (value as LexicalModelData).type !== "string") return null;
        return structuredClone(value as LexicalModelData);
    },
});
export const $modelData = (node: import("lexical").LexicalNode): LexicalModelData | null => $getState(node, dataState);
export const $setModelData = <T extends import("lexical").LexicalNode>(node: T, data: LexicalModelData): T => $setState(node, dataState, structuredClone(data));
const ownerDocument = (editor?: LexicalEditor): Document => {
    const found = editor?.getRootElement()?.ownerDocument ?? globalThis.document;
    if (!found) throw new Error("A DOM document is required to render Lexical nodes");
    return found;
};

/** Generic containers preserve schema identity and attributes through NodeState JSON. */
export class SchemaElementNode extends ElementNode {
    static getType(): string { return "doc-sync-element"; }
    static clone(node: SchemaElementNode): SchemaElementNode { return new SchemaElementNode(node.__key); }
    static importJSON(value: SerializedElementNode): SchemaElementNode { return new SchemaElementNode().updateFromJSON(value); }
    constructor(key?: NodeKey) { super(key); }
    createDOM(_config: EditorConfig, editor?: LexicalEditor): HTMLElement {
        const data = $modelData(this);
        const tag = data?.shape === "span" ? "span" : data?.shape === "text" ? "p" : "div";
        const element = ownerDocument(editor).createElement(tag);
        element.dataset.docSyncType = data?.type ?? "";
        return element;
    }
    updateDOM(previous: this): boolean { return $modelData(previous)?.type !== $modelData(this)?.type; }
    isInline(): boolean { return $modelData(this)?.shape === "span"; }
    insertNewAfter(_selection: RangeSelection, restoreSelection = true): SchemaElementNode | null {
        const data = $modelData(this);
        if (!data || (data.shape !== "text" && data.shape !== "span")) return null;
        const next = $setModelData(new SchemaElementNode(), data);
        this.insertAfter(next, restoreSelection);
        return next;
    }
}

/** Atomic inline/block nodes retain data without interpreting arbitrary attributes as DOM. */
export class SchemaLeafNode extends DecoratorNode<null> {
    static getType(): string { return "doc-sync-leaf"; }
    static clone(node: SchemaLeafNode): SchemaLeafNode { return new SchemaLeafNode(node.__key); }
    static importJSON(value: SerializedLexicalNode): SchemaLeafNode { return new SchemaLeafNode().updateFromJSON(value); }
    constructor(key?: NodeKey) { super(key); }
    createDOM(_config: EditorConfig, editor?: LexicalEditor): HTMLElement {
        const data = $modelData(this);
        const element = ownerDocument(editor).createElement(this.isInline() ? "span" : "div");
        element.contentEditable = "false";
        element.dataset.docSyncType = data?.type ?? "";
        element.textContent = data?.type ?? "content";
        return element;
    }
    updateDOM(previous: this): boolean { return JSON.stringify($modelData(previous)) !== JSON.stringify($modelData(this)); }
    isInline(): boolean { return $modelData(this)?.shape === "inline"; }
    getTextContent(): string { return "\ufffc"; }
    decorate(): null { return null; }
}

export const modelDataFor = (model: NodeJSON, shape: Shape): LexicalModelData => ({
    type: model.type, shape, ...(model.attrs ? {attrs: structuredClone(model.attrs)} : {}),
});
