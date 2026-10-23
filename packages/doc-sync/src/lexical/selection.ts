import {$createRangeSelection, $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, $setSelection} from "lexical";
import {$isTableCellNode} from "@lexical/table";
import {$lexicalModelType} from "./convert.ts";
import {$modelData, SchemaLeafNode} from "./nodes.ts";
import type {ElementNode, LexicalNode, PointType} from "lexical";
import type {ModelRange} from "../editor/index.ts";
import type {LexicalSchemaInfo} from "./schema.ts";

type Block = {node: ElementNode; path: number[]};
function blocks(info: LexicalSchemaInfo): Block[] {
    const result: Block[] = [];
    const visit = (node: LexicalNode, path: number[]) => {
        if (!$isElementNode(node)) return;
        if ($modelData(node)?.attrs?.spanned === true) return;
        const type = $lexicalModelType(info, node);
        if (info.schema.nodes[type]?.shape === "text") { result.push({node, path}); return; }
        const prefix = $isTableCellNode(node) ? [...path, 0] : path;
        node.getChildren().forEach((child, index) => visit(child, [...prefix, index]));
    };
    $getRoot().getChildren().forEach((node, index) => visit(node, [index]));
    return result;
}
const size = (node: LexicalNode): number => node instanceof SchemaLeafNode ? 1 : node.getTextContentSize();
function offsetIn(node: LexicalNode, point: PointType): number | null {
    if (node.getKey() === point.key) {
        if (point.type === "text" && $isTextNode(node)) return Math.min(point.offset, node.getTextContentSize());
        if (point.type === "element" && $isElementNode(node)) return node.getChildren().slice(0, point.offset).reduce((sum, child) => sum + size(child), 0);
        return null;
    }
    if ($isElementNode(node)) {
        let offset = 0;
        for (const child of node.getChildren()) {
            const found = offsetIn(child, point);
            if (found !== null) return offset + found;
            offset += size(child);
        }
    }
    return null;
}
export function $lexicalSelection(info: LexicalSchemaInfo): ModelRange | null {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const all = blocks(info);
    const resolve = (point: PointType) => {
        for (const block of all) {
            const offset = offsetIn(block.node, point);
            if (offset !== null) return [...block.path, offset];
        }
        return null;
    };
    const anchor = resolve(selection.anchor), focus = resolve(selection.focus);
    return anchor && focus ? {anchor, focus} : null;
}
type NativePoint = {key: string; offset: number; type: "text" | "element"};
function nativePoint(node: ElementNode, offset: number): NativePoint | null {
    const children = node.getChildren();
    if (!children.length) return offset === 0 ? {key: node.getKey(), offset: 0, type: "element"} : null;
    let remaining = offset;
    for (let index = 0; index < children.length; index++) {
        const child = children[index], length = size(child);
        if (remaining <= length) {
            if ($isTextNode(child)) return {key: child.getKey(), offset: remaining, type: "text"};
            if ($isElementNode(child)) return nativePoint(child, remaining);
            return {key: node.getKey(), offset: index + (remaining > 0 ? 1 : 0), type: "element"};
        }
        remaining -= length;
    }
    return null;
}
export function $setLexicalSelection(info: LexicalSchemaInfo, range: ModelRange | null): boolean {
    if (!range) return false;
    const all = blocks(info);
    const resolve = (path: number[]) => {
        const block = all.find(item => JSON.stringify(item.path) === JSON.stringify(path.slice(0, -1)));
        return block ? nativePoint(block.node, path.at(-1)!) : null;
    };
    const anchor = resolve(range.anchor), focus = resolve(range.focus);
    if (!anchor || !focus) return false;
    const selection = $createRangeSelection();
    selection.anchor.set(anchor.key, anchor.offset, anchor.type);
    selection.focus.set(focus.key, focus.offset, focus.type);
    $setSelection(selection);
    return true;
}
