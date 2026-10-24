import {$modelChildren} from "./grid.ts";
import {$getRoot, $isElementNode} from "lexical";
import {$isTableCellNode} from "@lexical/table";
import {$lexicalModelType} from "./convert.ts";
import type {LexicalNode} from "lexical";
import type {EditOp} from "../crdt/model.ts";
import type {LexicalSchemaInfo} from "./schema.ts";

type Placement = {path: number[]; parent: string; index: number};
type NativePlacements = {blocks: Map<string, Placement>; containers: Map<string, number[]>};
/** Native keys identify a reparented node; model equality alone cannot do so. */
export function $nativePlacements(info: LexicalSchemaInfo): NativePlacements {
    const blocks = new Map<string, Placement>(), containers = new Map<string, number[]>();
    const root = $getRoot();
    const columns = new Map();
    containers.set(root.getKey(), []);
    const visit = (node: LexicalNode, path: number[], parent: string, index: number) => {
        const type = $lexicalModelType(info, node), shape = info.schema.nodes[type]?.shape;
        if (["text", "flow", "grid", "atom", "group"].includes(shape ?? "")) blocks.set(node.getKey(), {path, parent, index});
        if (!$isElementNode(node) || shape === "text" || shape === "span") return;
        const prefix = $isTableCellNode(node) ? [...path, 0] : path;
        containers.set(node.getKey(), prefix);
        $modelChildren(node, columns).forEach(({node: child, index: i}) => visit(child, [...prefix, i], node.getKey(), i));
    };
    root.getChildren().forEach((node, index) => visit(node, [index], root.getKey(), index));
    return {blocks, containers};
}
export function nativeReparent(before: NativePlacements, after: NativePlacements): EditOp | null {
    const moved = [...before.blocks].filter(([key, placement]) => after.blocks.has(key) && after.blocks.get(key)!.parent !== placement.parent);
    if (!moved.length) return null;
    if (moved.length !== 1) throw new Error("Move one block between containers in each Lexical update");
    const [key, source] = moved[0], target = after.blocks.get(key)!;
    const parent = before.containers.get(target.parent);
    if (!parent) throw new Error("Create a Lexical container before moving content into it");
    return {op: "move", from: source.path, at: [...parent, target.index]};
}
