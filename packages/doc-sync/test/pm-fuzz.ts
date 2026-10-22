import {chainCommands, deleteSelection, joinBackward, selectNodeBackward, setBlockType, splitBlock, toggleMark} from "prosemirror-commands";
import {TextSelection} from "prosemirror-state";
import {CellSelection, addColumnAfter, addRowAfter, deleteColumn, deleteRow, mergeCells, splitCell} from "prosemirror-tables";
import {PmBinding} from "../src/pm/binding.ts";
import {toPmJSON} from "../src/pm/convert.ts";
import {buildPmSchema} from "../src/pm/schema.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet, rng} from "./harness.ts";
import type {Node as PmNode} from "prosemirror-model";
import type {Command, EditorState} from "prosemirror-state";

/**
 * ProseMirror 무작위 동시편집. 참여자마다 ProseMirror 편집기 상태(EditorState)를 두고, 진짜 ProseMirror 명령
 * (splitBlock · joinBackward · deleteSelection · toggleMark · setBlockType · 표 넣기 · prosemirror-tables 의 행·열·합치기)으로
 * 편집한다. 네트워크는 무작위로 흘리고 끊고 잇는다. 끝에 모든 참여자의 ProseMirror 문서가 같고 CRDT 문서와도 같은지 본다.
 */

export const INFO = buildPmSchema(DEMO_SCHEMA);

const pm = INFO.pm;

/** 글자를 받는 textblock 들의 [시작 위치, 노드] */
const textblocks = (doc: PmNode): Array<[number, PmNode]> => {
    const out: Array<[number, PmNode]> = [];

    doc.descendants((node, pos) => {
        node.isTextblock && node.type.contentMatch.matchType(pm.nodes.text) && out.push([pos, node]);

        return true;
    });

    return out;
};

const cells = (doc: PmNode): number[] => {
    const out: number[] = [];

    doc.descendants((node, pos) => {
        node.type.spec.tableRole === "cell" && out.push(pos);

        return true;
    });

    return out;
};

const run = (b: PmBinding, command: Command, state?: EditorState): boolean => command(state ?? b.state, b.dispatch);

const caret = (b: PmBinding, r: () => number): number => {
    const blocks = textblocks(b.state.doc);
    const [pos, node] = blocks[Math.floor(r() * blocks.length)];

    return pos + 1 + Math.floor(r() * (node.content.size + 1));
};

/** 커서를 옮긴 뒤 명령 */
const at = (b: PmBinding, pos: number, command: Command, head?: number) => {
    b.dispatch(b.state.tr.setSelection(TextSelection.create(b.state.doc, pos, head ?? pos)));
    run(b, command);
};

const act = (b: PmBinding, r: () => number): string => {
    const roll = r();
    const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)];

    if (roll < 0.3) {
        const pos = caret(b, r);

        b.dispatch(b.state.tr.setSelection(TextSelection.create(b.state.doc, pos)).insertText("xyz".slice(0, 1 + Math.floor(r() * 2))));

        return "type";
    }

    if (roll < 0.42) {
        at(b, caret(b, r), splitBlock);

        return "enter";
    }

    if (roll < 0.52) {
        at(b, caret(b, r), chainCommands(deleteSelection, joinBackward, selectNodeBackward));

        return "backspace";
    }

    if (roll < 0.58) {
        // 같은 흐름 안의 두 자리 사이를 지운다
        const a = caret(b, r);
        const z = caret(b, r);
        const $a = b.state.doc.resolve(Math.min(a, z));
        const $z = b.state.doc.resolve(Math.max(a, z));

        $a.depth === $z.depth && $a.node($a.depth - 1) === $z.node($z.depth - 1) && at(b, $a.pos, deleteSelection, $z.pos);

        return "range";
    }

    if (roll < 0.64) {
        const a = caret(b, r);
        const $a = b.state.doc.resolve(a);
        const end = Math.min($a.end(), a + 1 + Math.floor(r() * 4));

        r() < 0.5 ? at(b, a, toggleMark(pm.marks.bold), end) : b.dispatch(b.state.tr.addMark(a, end, pm.marks.link.create({value: "https://example.com/" + Math.floor(r() * 3)})));

        return "mark";
    }

    if (roll < 0.7) {
        const type = pick(["paragraph", "heading1", "quote", "list_item"]);
        const attrs = type === "list_item" ? {listType: pick(["bullet", "numbered"]), level: Math.floor(r() * 2)} : {};

        at(b, caret(b, r), setBlockType(pm.nodes[type], attrs));

        return "type-change";
    }

    if (roll < 0.74) {
        // 표 넣기 (2×2 빈 표) — 커서가 본문에 있을 때
        const pos = caret(b, r);
        const $pos = b.state.doc.resolve(pos);

        if ($pos.depth === 1) {
            const cell = () => pm.nodes.table_cell.create(null, pm.nodes.paragraph.create());
            const table = pm.nodes.table.create(null, [pm.nodes.table_row.create(null, [cell(), cell()]), pm.nodes.table_row.create(null, [cell(), cell()])]);

            b.dispatch(b.state.tr.setSelection(TextSelection.create(b.state.doc, pos)).replaceSelectionWith(table));
        }

        return "table";
    }

    if (roll < 0.84) {
        const list = cells(b.state.doc);

        if (!list.length) {
            return "none";
        }

        const cellPos = pick(list);
        const inside = cellPos + 2;
        const command = pick([addColumnAfter, addRowAfter, deleteColumn, deleteRow, splitCell]);

        if (r() < 0.3 && list.length > 1) {
            // 이웃한 두 칸 합치기
            const other = pick(list);

            try {
                const sel = CellSelection.create(b.state.doc, cellPos, other);

                run(b, mergeCells, b.state.apply(b.state.tr.setSelection(sel)));
            } catch {
                // 다른 표의 칸
            }

            return "merge";
        }

        try {
            at(b, inside, command);
        } catch {
            // 칸 안 첫 자리가 글 자리가 아니면
        }

        return "table-op";
    }

    if (roll < 0.9) {
        b.undo();

        return "undo";
    }

    if (roll < 0.94) {
        b.redo();

        return "redo";
    }

    b.client.online ? b.client.disconnect() : b.client.connect();

    return "net";
};

export type PmSeed = {same: boolean; detail: string; bindings: PmBinding[]};

export const runPmSeed = async (seed: number, peers: number, steps = 24): Promise<PmSeed> => {
    const r = rng(seed);
    const net = new MemoryNet();
    const clients = Array.from({length: peers}, (_, i) => net.add(String.fromCharCode(65 + i)));

    clients.forEach(c => c.connect());
    await net.settle();

    const bindings = clients.map(c => new PmBinding(c, INFO));

    bindings[0].dispatch(bindings[0].state.tr.insertText("abcdefgh", 1));
    await net.settle();

    for (let step = 0; step < steps; step += 1) {
        act(bindings[Math.floor(r() * peers)], r);

        const flow = r();

        if (flow < 0.3) {
            net.up();
        } else if (flow < 0.55) {
            net.down(clients[Math.floor(r() * peers)].actor);
        } else if (flow < 0.7) {
            await net.settle();
        }

        await new Promise(resolve => setImmediate(resolve));
    }

    clients.forEach(c => c.connect());
    await net.settle();

    const server = JSON.stringify(net.hub.doc.toJSON());
    const crdtSame = clients.every(c => JSON.stringify(c.doc.toJSON()) === server);
    const first = bindings[0].state.doc;
    const pmSame = bindings.every(b => b.state.doc.eq(first));
    // 편집기 문서 = CRDT 문서를 ProseMirror 로 옮긴 것
    const mirrored = bindings.every(b => pm.nodeFromJSON(toPmJSON(DEMO_SCHEMA, b.client.doc.toJSON())).eq(b.state.doc));
    const same = crdtSame && pmSame && mirrored;

    return {
        same,
        bindings,
        detail: same ? "" : `crdt ${crdtSame} pm ${pmSame} mirrored ${mirrored}\n${bindings.map(b => `${b.client.actor} ${JSON.stringify(b.state.doc.toJSON()).slice(0, 600)}`).join("\n")}\n서버 ${server.slice(0, 600)}`,
    };
};
