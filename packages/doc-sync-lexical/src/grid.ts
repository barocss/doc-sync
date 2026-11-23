import {$isElementNode} from "lexical";
import {$computeTableMapSkipCellCheck, $isTableNode, $isTableRowNode} from "@lexical/table";
import type {LexicalNode} from "lexical";

export type GridColumns = Map<string, Map<string, number>>;

/** Native rows omit covered cells. Their model indices are logical columns. */
export function $modelChildren(node: LexicalNode, columns: GridColumns = new Map()): Array<{node: LexicalNode; index: number}> {
    if (!$isElementNode(node)) return [];
    const table = node.getParent();
    if ($isTableRowNode(node) && $isTableNode(table)) {
        let positions = columns.get(table.getKey());
        if (!positions) {
            const [map] = $computeTableMapSkipCellCheck(table, null, null);
            positions = new Map(map.flatMap(row => row.flatMap(value => value ? [[value.cell.getKey(), value.startColumn] as const] : [])));
            columns.set(table.getKey(), positions);
        }
        return node.getChildren().map(child => ({node: child, index: positions!.get(child.getKey())!}));
    }
    return node.getChildren().map((child, index) => ({node: child, index}));
}
