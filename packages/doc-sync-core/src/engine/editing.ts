import {Doc} from "../crdt/doc.ts";
import type {Op} from "../crdt/doc.ts";
import {applyEdit, runsToUnits} from "../crdt/model.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";

export function commitModelEdits(doc: Doc, before: NodeJSON, edits: EditOp[], apply: (edits: EditOp[]) => Op[] = edits => doc.edit(edits).ops): Op[] {
    const work = structuredClone(before);
    const mapped: EditOp[] = [];
    for (const edit of edits) {
        let parent: NodeJSON | undefined = work;
        for (const index of edit.at.slice(0, -1)) parent = parent?.children?.[index];
        let next = edit;
        const target = edit.at.length ? parent?.children?.[edit.at.at(-1)!] : work;
        if (edit.op === "update" && target && doc.schema!.nodes[target.type]?.shape === "cell") {
            const attrs = {...edit.attrs};
            if (attrs.rowspan === null) attrs.rowspan = 1;
            if (attrs.colspan === null) attrs.colspan = 1;
            next = {...edit, attrs};
        }
        if (parent?.runs && edit.op !== "merge") {
            const units = runsToUnits(doc.schema!, parent.runs);
            const size = (from: number, count: number) => units.slice(from, from + count).reduce((sum, unit) => sum + ("ch" in unit ? unit.ch.length : 1), 0);
            const start = edit.at.at(-1)!;
            next = {...edit, at: [...edit.at.slice(0, -1), size(0, start)]};
            if (next.op === "delete" && edit.op === "delete") next.count = size(start, edit.count);
            if (next.op === "update" && edit.op === "update" && edit.length !== undefined) next.length = size(start, edit.length);
        }
        mapped.push(next);
        applyEdit(doc.schema!, work, edit);
    }
    // Validate movement batches on a disposable replica before changing live state.
    // Native editors can normalize several operations in one update.
    if (mapped.some(edit => edit.op === "move")) {
        Doc.fromSnapshot(doc.clock.actor, doc.snapshot(), doc.schema).edit(mapped);
    }
    return apply(mapped);
}
