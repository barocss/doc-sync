import {isAlive} from "../crdt/doc.ts";
import {blockPath} from "../crdt/edit.ts";
import {canonical, unitsToRuns} from "../crdt/model.ts";
import {keyOf} from "../crdt/ticket.ts";
import type {Doc, Item, Op, TextBlock} from "../crdt/doc.ts";
import type {NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";

/**
 * 구조와 모델 경로가 그대로인 글 블록 하나만 읽는다. 불확실하면 전체 경로에 맡긴다.
 * 특히 오래된 동시 삽입은 origin 뒤의 표지를 건너뛸 수 있으므로 시계가 앞선 삽입만 좁힌다.
 * undo/redo·되살리기·노드 변경·가상 블록·새 토큰을 다시 참조하는 묶음은 대상이 아니다.
 */
export const textEventScope = (doc: Doc, ops: Op[]) => {
    if (!doc.schema || !ops.length) {
        return null;
    }

    let chosen: TextBlock | null = null;
    let line = "";
    let clock = doc.clock.lamport;

    const include = (item: Item | undefined, origin: boolean): boolean => {
        if (!item || !isAlive(item) || (!origin && item.kind !== "char") || !doc.visible(item.line.key)) {
            return false;
        }

        const block = doc.blocks(item.line.key).find(b => b.kind === "text" &&
            (b.chars.includes(item) || (origin && b.marker === item)));

        if (block?.kind !== "text" || block.virtual || (chosen && chosen !== block)) {
            return false;
        }

        chosen = block;
        line = item.line.key;

        return true;
    };

    for (const op of ops) {
        if (op.t === "text") {
            // id が既知の全トークンより大きければ、RGA の挿入先は origin の直後だ。
            if (!op.text.length || op.id.lamport <= clock || !include(doc.get(keyOf(op.origin)), true)) {
                return null;
            }

            clock = op.id.lamport + op.text.length - 1;
        } else if (op.t === "del" || op.t === "set") {
            if (!op.ids.length || !op.ids.every(id => include(doc.get(keyOf(id)), false))) {
                return null;
            }

            clock = Math.max(clock, op.at.lamport);
        } else {
            return null;
        }
    }

    const block = chosen as TextBlock | null;

    if (!block) {
        return null;
    }

    const b = doc.blocks(line).indexOf(block);
    const path = blockPath(doc, line, b);

    if (!path) {
        return null;
    }

    const source = doc.schema;
    const schema: Schema = {...source, nodes: {...source.nodes,
        [source.root]: {shape: "flow", children: [block.type], default: block.type}}};
    const read = (): NodeJSON => {
        const current = doc.blocks(line)[b] as TextBlock;
        const node: NodeJSON = {type: current.type, runs: unitsToRuns(source, current.chars.map(c =>
            c.kind === "char" ? {ch: c.ch, marks: doc.marksOf(c)} : {inline: c.born, attrs: doc.attrsOf(c, c.born)}))};

        Object.keys(current.attrs).length && (node.attrs = {...current.attrs});

        return canonical(schema, {type: source.root, children: [node]});
    };

    return {schema, path, read, before: read()};
};
