import {isAlive} from "../crdt/doc.ts";
import {blockPath} from "../crdt/edit.ts";
import {canonical, unitsToRuns} from "../crdt/model.ts";
import {keyOf} from "../crdt/ticket.ts";
import type {Doc, Item, Op, TextBlock} from "../crdt/doc.ts";
import type {NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";

// 전후 측정으로 확인한 범위까지만 좁힌다. 많은 블록은 기존 전체 모델 캐시 경로를 유지한다.
const MAX_TEXT_SCOPES = 8;

/**
 * 구조와 모델 경로가 그대로인 글 블록들만 읽는다. 하나라도 불확실하면 전체 경로에 맡긴다.
 * 특히 오래된 동시 삽입은 origin 뒤의 표지를 건너뛸 수 있으므로 시계가 앞선 삽입만 좁힌다.
 * undo/redo·되살리기·노드 변경·가상 블록·새 토큰을 다시 참조하는 묶음은 대상이 아니다.
 */
export const textEventScopes = (doc: Doc, ops: Op[]) => {
    if (!doc.schema || !ops.length || doc.hasMoves || doc.hasCardinality) {
        return null;
    }

    const chosen = new Map<TextBlock, string>();
    const members = new Map<Item, TextBlock>();
    let clock = doc.clock.lamport;
    const remember = (block: TextBlock): void => {
        members.set(block.marker, block);
        block.chars.forEach(item => members.set(item, block));
    };

    const include = (item: Item | undefined, origin: boolean): boolean => {
        if (!item || !isAlive(item) || (!origin && item.kind !== "char") || !doc.visible(item.line.key)) {
            return false;
        }

        const block = members.get(item) ?? doc.blocks(item.line.key).find(b => b.kind === "text" &&
            (b.chars.includes(item) || (origin && b.marker === item)));

        if (block?.kind !== "text" || block.virtual) {
            return false;
        }

        if (!chosen.has(block)) {
            if (chosen.size === MAX_TEXT_SCOPES) {
                return false;
            }

            chosen.set(block, item.line.key);

            // 한 블록은 기존 검색을 유지한다. 두 번째 블록부터 이미 찾은 글자들을 다시 검색하지 않는다.
            if (chosen.size === 2) {
                chosen.forEach((_line, selected) => remember(selected));
            } else if (chosen.size > 2) {
                remember(block);
            }
        }

        return true;
    };

    for (const op of ops) {
        if (op.t === "text") {
            // 알려진 모든 토큰보다 ID가 크면 RGA 삽입 위치는 origin 바로 뒤다.
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

    const blocks: Array<{block: TextBlock; line: string; b: number; path: number[]}> = [];

    for (const [block, line] of chosen) {
        const b = doc.blocks(line).indexOf(block);
        const path = blockPath(doc, line, b);

        if (!path) {
            return null;
        }

        blocks.push({block, line, b, path});
    }

    const source = doc.schema;

    // 모든 연산과 경로를 확인한 뒤 before를 읽는다. 글자만 바뀌므로 블록 번호와 모델 경로는 고정이다.
    return blocks.map(({block, line, b, path}) => {
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
    });
};
