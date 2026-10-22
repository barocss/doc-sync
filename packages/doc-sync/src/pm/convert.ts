import {gridParts} from "../crdt/schema.ts";
import {pmName} from "./schema.ts";
import type {Node as PmNode} from "prosemirror-model";
import type {ModelPath, NodeJSON, Run} from "../crdt/model.ts";
import type {GroupSpec, Schema as DocSchema} from "../crdt/schema.ts";
import type {PmSchemaInfo} from "./schema.ts";

/**
 * 우리 모델(NodeJSON, 스키마 기반 문서 에디터의 문서 꼴) ↔ ProseMirror 문서(JSON). 그리고 모델 경로 ↔ ProseMirror 위치.
 *
 * 다른 점은 둘이다.
 * - 묶음(목록·캡션): 우리 모델에는 list > list-item 이 있고, ProseMirror 에는 list_item 만 흐름에 바로 있다 (속성에 listType)
 * - 표: 우리 모델은 모든 행에 모든 칸이 있다(full grid, 가려진 칸은 spanned). ProseMirror 는 가려진 칸이 아예 없다.
 *   그리고 우리 칸은 table-cell > table-cell-body > 블록인데, ProseMirror 칸은 블록을 바로 담는다
 */

type PmJSON = {type: string; attrs?: Record<string, unknown>; content?: PmJSON[]; text?: string; marks?: Array<{type: string; attrs?: Record<string, unknown>}>};

const shape = (schema: DocSchema, type: string) => schema.nodes[type]?.shape;

/** 흐름의 자식을 펼친다 — 묶음은 항목으로, 묶음 속성은 항목 속성으로 */
const flat = (schema: DocSchema, children: NodeJSON[] = []): NodeJSON[] =>
    children.flatMap(child => {
        const spec = schema.nodes[child.type];

        if (spec?.shape !== "group") {
            return [child];
        }

        const by = Object.fromEntries((spec as GroupSpec).by.map(k => [k, child.attrs?.[k]]));

        return (child.children ?? []).map(item => ({...item, attrs: {...(item.attrs ?? {}), ...by}}));
    });

// ── 우리 → ProseMirror ──────────────────────────────────────────────────

export const toPmJSON = (schema: DocSchema, model: NodeJSON): PmJSON => ({type: pmName(schema.root), content: flat(schema, model.children).map(n => blockToPm(schema, n))});

const runsToPm = (schema: DocSchema, runs: Run[] = [], outer: Array<{type: string; attrs?: Record<string, unknown>}> = []): PmJSON[] =>
    runs.flatMap(run => {
        if ("text" in run) {
            const marks = [
                ...Object.entries(run.marks).map(([k, v]) => (schema.markValues?.[k] ? {type: k, attrs: {value: v}} : {type: k})),
                ...outer,
            ];

            return run.text ? [{type: "text", text: run.text, ...(marks.length ? {marks} : {})}] : [];
        }

        const span = schema.nodes[run.type];

        if (span?.shape === "span") {
            return runsToPm(schema, run.runs, [...outer, {type: span.mark, attrs: {value: run.attrs?.[span.attr]}}]);
        }

        return [{type: pmName(run.type), attrs: {...(run.attrs ?? {})}}];
    });

const blockToPm = (schema: DocSchema, node: NodeJSON): PmJSON => {
    const s = shape(schema, node.type);
    const out: PmJSON = {type: pmName(node.type)};

    node.attrs && Object.keys(node.attrs).length && (out.attrs = {...node.attrs});

    if (s === "text") {
        const content = runsToPm(schema, node.runs);

        content.length && (out.content = content);
    } else if (s === "flow") {
        out.content = flat(schema, node.children).map(n => blockToPm(schema, n));
    } else if (s === "grid") {
        // 가려진 칸은 뺀다, 칸의 몸은 벗긴다
        out.content = (node.children ?? []).map(row => ({
            type: pmName(row.type),
            content: (row.children ?? [])
                .filter(cell => !cell.attrs?.spanned)
                .map(cell => {
                    const {colspan, rowspan, ...rest} = cell.attrs ?? {};

                    return {
                        type: pmName(cell.type),
                        attrs: {...rest, colspan: Number(colspan ?? 1), rowspan: Number(rowspan ?? 1)},
                        content: flat(schema, cell.children?.[0]?.children).map(n => blockToPm(schema, n)),
                    };
                }),
        }));
    }

    return out;
};

// ── ProseMirror → 우리 ──────────────────────────────────────────────────

/**
 * ProseMirror 문서를 우리 날것의 모델로 (정리는 canonical 이 한다). 가려진 칸의 글은 ProseMirror 에 없으므로,
 * reference(바꾸기 전 우리 모델)의 같은 자리 칸에서 가져온다 — 숨은 글을 잃지 않게.
 */
export const fromPmJSON = (info: PmSchemaInfo, schema: DocSchema, doc: PmJSON, reference?: NodeJSON): NodeJSON => ({
    type: schema.root,
    children: (doc.content ?? []).map((n, i) => blockFromPm(info, schema, n, flatRef(schema, reference?.children)[i])),
});

const flatRef = (schema: DocSchema, children?: NodeJSON[]): Array<NodeJSON | undefined> => flat(schema, children ?? []);

const ourType = (info: PmSchemaInfo, name: string): string => info.ours.get(name) ?? name;

const runsFromPm = (info: PmSchemaInfo, schema: DocSchema, content: PmJSON[] = []): Run[] =>
    content.map(n => {
        if (n.type === "text") {
            const marks: Record<string, unknown> = {};

            (n.marks ?? []).forEach(m => (marks[m.type] = schema.markValues?.[m.type] ? m.attrs?.value : true));

            return {text: n.text ?? "", marks};
        }

        return {type: ourType(info, n.type), attrs: {...(n.attrs ?? {})}};
    });

const blockFromPm = (info: PmSchemaInfo, schema: DocSchema, node: PmJSON, ref?: NodeJSON): NodeJSON => {
    const type = ourType(info, node.type);
    const s = shape(schema, type);
    const out: NodeJSON = {type};

    node.attrs && (out.attrs = {...node.attrs});

    if (s === "text") {
        out.runs = runsFromPm(info, schema, node.content);
    } else if (s === "flow") {
        const refs = flatRef(schema, ref?.type === type ? ref.children : undefined);

        out.children = (node.content ?? []).map((n, i) => blockFromPm(info, schema, n, refs[i]));
    } else if (s === "grid") {
        out.children = gridFromPm(info, schema, type, node, ref?.type === type ? ref : undefined);
    }

    return out;
};

/** ProseMirror 표 → full grid. colspan·rowspan 이 덮는 자리에 가려진 칸을 채운다 */
const gridFromPm = (info: PmSchemaInfo, schema: DocSchema, type: string, node: PmJSON, ref?: NodeJSON): NodeJSON[] => {
    const parts = gridParts(schema, type)!;
    const rows = node.content ?? [];
    const taken: boolean[][] = rows.map(() => []);
    const grid: NodeJSON[][] = rows.map(() => []);

    rows.forEach((row, r) => {
        let c = 0;

        (row.content ?? []).forEach(cell => {
            while (taken[r][c]) {
                c += 1;
            }

            const rs = Number(cell.attrs?.rowspan ?? 1);
            const cs = Number(cell.attrs?.colspan ?? 1);
            const {colspan, rowspan, colwidth, ...rest} = cell.attrs ?? {};
            const refBody = ref?.children?.[r]?.children?.[c]?.children?.[0];
            const attrs: Record<string, unknown> = {...rest};

            (Number(colspan) > 1 || Number(rowspan) > 1) && Object.assign(attrs, {colspan: Number(colspan ?? 1), rowspan: Number(rowspan ?? 1)});
            void colwidth;
            grid[r][c] = {
                type: parts.cell,
                attrs,
                children: [{type: parts.body, children: (cell.content ?? []).map((n, i) => blockFromPm(info, schema, n, flatRef(schema, refBody?.children)[i]))}],
            };

            for (let a = r; a < Math.min(rows.length, r + rs); a += 1) {
                for (let b = c; b < c + cs; b += 1) {
                    taken[a][b] = true;

                    if (a !== r || b !== c) {
                        // 가려진 칸 — 글은 바꾸기 전 모델의 같은 자리에서
                        const hidden = ref?.children?.[a]?.children?.[b]?.children?.[0];

                        grid[a][b] = {type: parts.cell, attrs: {spanned: true}, children: [hidden ?? {type: parts.body, children: []}]};
                    }
                }
            }

            c += cs;
        });
    });

    const width = Math.max(0, ...grid.map(row => row.length));

    return grid.map(row => ({
        type: parts.row,
        children: Array.from({length: width}, (_, c) => row[c] ?? {type: parts.cell, children: [{type: parts.body, children: []}]}),
    }));
};

// ── 위치 ↔ 경로 ─────────────────────────────────────────────────────────

/** 흐름 노드(우리 모델)의 펼친 번호 f → 그 자식 경로 (묶음 안이면 두 수) */
const flatToPath = (schema: DocSchema, node: NodeJSON, f: number): number[] => {
    const children = node.children ?? [];
    let n = 0;

    for (let c = 0; c < children.length; c += 1) {
        const group = shape(schema, children[c].type) === "group";
        const size = group ? (children[c].children ?? []).length : 1;

        if (f < n + size) {
            return group ? [c, f - n] : [c];
        }

        n += size;
    }

    return [children.length];
};

const pathToFlat = (schema: DocSchema, node: NodeJSON, path: number[]): {flat: number; used: number} => {
    const children = node.children ?? [];
    let n = 0;

    for (let c = 0; c < path[0] && c < children.length; c += 1) {
        n += shape(schema, children[c].type) === "group" ? (children[c].children ?? []).length : 1;
    }

    const target = children[path[0]];

    return target && shape(schema, target.type) === "group" && path.length > 1 ? {flat: n + path[1], used: 2} : {flat: n, used: 1};
};

/** ProseMirror 표 행에서 k 번째 칸이 있는 열 (앞 행들의 rowspan 이 덮는 자리를 건너뛴다) */
const columnOf = (table: PmNode, r: number, k: number): number => {
    const taken: boolean[][] = [];

    for (let a = 0; a <= r; a += 1) {
        taken[a] = taken[a] ?? [];

        let c = 0;

        for (let i = 0; i < table.child(a).childCount; i += 1) {
            while (taken[a][c]) {
                c += 1;
            }

            if (a === r && i === k) {
                return c;
            }

            const cell = table.child(a).child(i);

            for (let x = a; x < a + cell.attrs.rowspan; x += 1) {
                taken[x] = taken[x] ?? [];

                for (let y = c; y < c + cell.attrs.colspan; y += 1) {
                    taken[x][y] = true;
                }
            }

            c += cell.attrs.colspan;
        }

        if (a === r) {
            return c;
        }
    }

    return 0;
};

/** 열 c 에 있는(또는 그 열을 덮는) 칸의 행 안 번호 */
const cellIndexAt = (table: PmNode, r: number, c: number): number => {
    for (let k = 0; k < table.child(r).childCount; k += 1) {
        const start = columnOf(table, r, k);

        if (c >= start && c < start + table.child(r).child(k).attrs.colspan) {
            return k;
        }

        if (start > c) {
            return k;
        }
    }

    return table.child(r).childCount;
};

/**
 * ProseMirror 위치 → 우리 모델 경로. 글 블록 안이면 마지막 수가 글자 자리, 블록 사이면 흐름의 자식 번호.
 * model 은 ProseMirror 문서와 같은 내용의 우리 모델이어야 한다.
 */
export const pmPosToPath = (schema: DocSchema, pmDoc: PmNode, pos: number, model: NodeJSON): ModelPath => {
    const $pos = pmDoc.resolve(pos);
    const path: number[] = [];
    let ours: NodeJSON = model;

    for (let d = 0; d < $pos.depth; d += 1) {
        const parent = $pos.node(d);
        const index = $pos.index(d);
        const kind = shape(schema, ours.type);

        if (kind === "grid") {
            path.push(index);
            ours = ours.children![index];
            continue;
        }

        if (kind === "row") {
            const c = columnOf($pos.node(d - 1), $pos.index(d - 1), index);

            path.push(c, 0);
            ours = ours.children![c].children![0];
            continue;
        }

        const steps = flatToPath(schema, ours, index);

        path.push(...steps);
        ours = steps.length === 2 ? ours.children![steps[0]].children![steps[1]] : ours.children![steps[0]];
        void parent;
    }

    const last = $pos.parent;

    if (last.isTextblock) {
        path.push($pos.parentOffset);
    } else if (shape(schema, ours.type) === "flow" || ours === model) {
        path.push(...flatToPath(schema, ours, $pos.index()));
    } else if (shape(schema, ours.type) === "grid" || shape(schema, ours.type) === "row") {
        path.push($pos.index());
    }

    return path;
};

/** 우리 모델 경로 → ProseMirror 위치 (pmPosToPath 의 반대) */
export const pathToPmPos = (schema: DocSchema, pmDoc: PmNode, path: ModelPath, model: NodeJSON): number => {
    let pm: PmNode = pmDoc;
    let ours: NodeJSON = model;
    let pos = 0;
    let i = 0;
    let rowIndex = 0;
    let table: PmNode | null = null;

    const enter = (index: number) => {
        let offset = 0;

        for (let k = 0; k < index && k < pm.childCount; k += 1) {
            offset += pm.child(k).nodeSize;
        }

        pos += offset;

        if (index < pm.childCount) {
            pm = pm.child(index);
            pos += 1;
        }
    };

    while (i < path.length) {
        const kind = shape(schema, ours.type);

        if (kind === "text") {
            return pos + path[i];
        }

        const offsetOf = (index: number) => {
            let offset = 0;

            for (let k = 0; k < index && k < pm.childCount; k += 1) {
                offset += pm.child(k).nodeSize;
            }

            return offset;
        };

        if (kind === "grid") {
            if (i === path.length - 1) {
                // 행 사이 자리
                return pos + offsetOf(path[i]);
            }

            table = pm;
            rowIndex = path[i];
            enter(path[i]);
            ours = ours.children![path[i]];
            i += 1;
            continue;
        }

        if (kind === "row") {
            const k = cellIndexAt(table!, rowIndex, path[i]);

            if (i === path.length - 1) {
                // 칸 사이 자리
                return pos + offsetOf(k);
            }

            enter(k);
            ours = ours.children![path[i]].children![0];
            // 몸(0)은 ProseMirror 에 없다
            i += 2;
            continue;
        }

        const {flat: f, used} = pathToFlat(schema, ours, path.slice(i));
        const steps = flatToPath(schema, ours, f);

        if (i + used >= path.length) {
            // 마지막 수 — 흐름의 자식 자리
            let offset = 0;

            for (let k = 0; k < f && k < pm.childCount; k += 1) {
                offset += pm.child(k).nodeSize;
            }

            return pos + offset;
        }

        enter(f);
        ours = steps.length === 2 ? ours.children![steps[0]].children![steps[1]] : ours.children![steps[0]];
        i += used;
    }

    return pos;
};
