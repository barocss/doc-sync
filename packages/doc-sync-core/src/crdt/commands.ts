import {MAIN} from "./doc.ts";
import {blockPath, childCount, flowPath, gridPath, pathOfPos} from "./edit.ts";
import {attrValueOk, gridParts} from "./schema.ts";
import type {GridBlock, Item, Op, Pos, TextBlock, Doc} from "./doc.ts";
import type {EditOp, ModelPath, NodeJSON} from "./model.ts";

/**
 * 편집기 명령 — 사람의 행위(글자 치기, Enter, Backspace, 표에 열 넣기 …)를 편집 연산(insert · delete · update ·
 * split · merge)으로 바꿔 doc.edit 에 넘긴다. CRDT 의 줄·토큰은 여기서 보지 않는다 — 위치를 모델 경로로 바꿀 뿐이다.
 *
 * 명령마다 하는 일은 "어떤 편집 연산을 만들지"다. 그 연산을 전선 연산으로 옮기는 일(모양별 컴파일)은 edit.ts 가 한다.
 * 그래서 스키마 기반 문서 에디터를 붙일 때는 이 파일 대신 그 에디터의 연산 → 편집 연산 변환만 있으면 된다.
 *
 * 모든 명령은 만든 전선 연산을 돌려준다 (client.commit 에 그대로 넘긴다).
 */

const lineOf = (pos: {line?: string}): string => pos.line ?? MAIN;

const run = (doc: Doc, edits: EditOp[]): Op[] => (edits.length ? doc.edit(edits).ops : []);

/** 모델에 없는 빈 자리(표 뒤, 글 없는 virtual)면 그 자리의 흐름 번호 — 그 앞 표·구분선 다음 */
const hiddenSlot = (doc: Doc, pos: Pos): ModelPath | null => {
    if (pathOfPos(doc, pos)) {
        return null;
    }

    const before = blockPath(doc, lineOf(pos), pos.b - 1)!;

    return [...before.slice(0, -1), before.at(-1)! + 1];
};

// ── 글 ──────────────────────────────────────────────────────────────────

/** 글자 넣기. marks 를 주지 않으면 왼쪽 글자의 서식을 물려받는다 (링크는 빼고) */
export const insertText = (doc: Doc, pos: Pos, text: string, marks?: Record<string, unknown>): Op[] => {
    const block = doc.textAt(pos);

    if (!text || !doc.takesText(block.type)) {
        return [];
    }

    const content = marks ? [{text, marks}] : text;
    const slot = hiddenSlot(doc, pos);

    if (slot) {
        return run(doc, [{op: "insert", at: slot, content: [{type: block.type, runs: [typeof content === "string" ? {text, marks: {}} : content[0]]}]}]);
    }

    return run(doc, [{op: "insert", at: pathOfPos(doc, pos)!, content}]);
};

/** Enter */
export const splitBlock = (doc: Doc, pos: Pos): Op[] => {
    const block = doc.textAt(pos);

    if (!doc.takesText(block.type)) {
        return [];
    }

    const slot = hiddenSlot(doc, pos);

    return run(doc, [slot ? {op: "insert", at: slot, content: [{type: block.type}]} : {op: "split", at: pathOfPos(doc, pos)!}]);
};

/** 두 위치 사이를 지운다 (같은 줄). 사이의 블록은 통째로, 끝 블록은 앞 블록에 합친다 */
export const deleteRange = (doc: Doc, from: Pos, to: Pos): Op[] => {
    if (lineOf(from) !== lineOf(to)) {
        return [];
    }

    const [a, z] = from.b < to.b || (from.b === to.b && from.o <= to.o) ? [from, to] : [to, from];
    const line = lineOf(a);
    const blocks = doc.blocks(line);

    if (a.b === z.b) {
        const path = pathOfPos(doc, a);

        return z.o > a.o && path ? run(doc, [{op: "delete", at: path, count: z.o - a.o}]) : [];
    }

    // 뒤에서부터 — 앞 경로가 흔들리지 않게
    const edits: EditOp[] = [];
    const zPath = pathOfPos(doc, {...z, o: 0});

    z.o > 0 && zPath && edits.push({op: "delete", at: zPath, count: z.o});

    for (let b = z.b - 1; b > a.b; b -= 1) {
        const path = blockPath(doc, line, b);

        path && edits.push({op: "delete", at: path, count: 1});
    }

    const aBlock = blocks[a.b] as TextBlock;
    const aPath = pathOfPos(doc, a);

    aBlock.chars.length > a.o && aPath && edits.push({op: "delete", at: aPath, count: aBlock.chars.length - a.o});

    const zMarker = blocks[z.b].marker;
    const ops = run(doc, edits);
    // 끝 블록을 앞 블록에 합친다 (지운 뒤의 자리로)
    const zNow = doc.blocks(line).findIndex(x => x.marker === zMarker && x.kind === "text" && !x.virtual);
    const mergePath = zNow > 0 ? blockPath(doc, line, zNow) : null;

    return mergePath ? [...ops, ...run(doc, [{op: "merge", at: mergePath}])] : ops;
};

/**
 * Backspace — 블록 맨 앞이면 앞 블록과 합친다. 앞이 구분선이면 그것을 지우고, 앞이 표·상자면 지우지 않고
 * 커서만 그 안 끝으로 보낸다. 앞이 글자를 받지 않는 블록(그림)이면 아무것도 하지 않는다.
 * @returns 연산과, 그 뒤 커서를 둘 토큰 키
 */
export const backspace = (doc: Doc, pos: Pos): {ops: Op[]; caret: string} => {
    const line = lineOf(pos);

    if (pos.o > 0) {
        const caret = doc.anchorOf({...pos, o: pos.o - 1});

        return {ops: run(doc, [{op: "delete", at: pathOfPos(doc, {...pos, o: pos.o - 1})!, count: 1}]), caret};
    }

    const prev = doc.blocks(line)[pos.b - 1];

    if (!prev) {
        return {ops: [], caret: doc.anchorOf(pos)};
    }

    if (prev.kind === "text") {
        if (!doc.takesText(prev.type)) {
            return {ops: [], caret: doc.anchorOf(pos)};
        }

        const caret = doc.anchorOf({line: pos.line, b: pos.b - 1, o: prev.chars.length});
        const path = blockPath(doc, line, pos.b);

        return {ops: path ? run(doc, [{op: "merge", at: path}]) : [], caret};
    }

    if (prev.kind === "atom") {
        const caret = doc.anchorOf(pos);

        return {ops: run(doc, [{op: "delete", at: blockPath(doc, line, pos.b - 1)!, count: 1}]), caret};
    }

    return {ops: [], caret: doc.anchorOf(doc.edgeOf(line, pos.b - 1, true))};
};

/** Delete — 블록 끝이면 다음 블록을 당겨 붙인다. 다음이 구분선이면 지우고, 표·상자면 그대로 둔다 */
export const deleteForward = (doc: Doc, pos: Pos): Op[] => {
    const line = lineOf(pos);
    const block = doc.textAt(pos);
    const path = pathOfPos(doc, pos);

    if (!path) {
        return [];
    }

    if (pos.o < block.chars.length) {
        return run(doc, [{op: "delete", at: path, count: 1}]);
    }

    const next = doc.blocks(line)[pos.b + 1];
    const nextPath = next && blockPath(doc, line, pos.b + 1);

    if (next?.kind === "text" && nextPath) {
        return run(doc, [{op: "merge", at: nextPath}]);
    }

    return next?.kind === "atom" && nextPath ? run(doc, [{op: "delete", at: nextPath, count: 1}]) : [];
};

/** 범위의 서식 켜기·끄기 (같은 줄, 블록마다) */
export const setMark = (doc: Doc, from: Pos, to: Pos, key: string, value: unknown): Op[] => {
    if (lineOf(from) !== lineOf(to)) {
        return [];
    }

    const [a, z] = from.b < to.b || (from.b === to.b && from.o <= to.o) ? [from, to] : [to, from];
    const blocks = doc.blocks(lineOf(a));
    const edits: EditOp[] = [];

    for (let b = a.b; b <= z.b; b += 1) {
        const block = blocks[b];

        if (block.kind !== "text") {
            continue;
        }

        const start = b === a.b ? a.o : 0;
        const end = b === z.b ? z.o : block.chars.length;
        const path = pathOfPos(doc, {line: a.line, b, o: start});

        end > start && path && block.chars.slice(start, end).some(c => c.kind === "char") && edits.push({op: "update", at: path, attrs: {[key]: value}, length: end - start});
    }

    return run(doc, edits);
};

/** 범위에 링크 걸기·풀기 (url 이 null 이면 풀기) */
export const setLink = (doc: Doc, from: Pos, to: Pos, url: string | null, mark = "link"): Op[] => setMark(doc, from, to, mark, url);

// ── 블록 ────────────────────────────────────────────────────────────────

/** text 블록의 종류 바꾸기 — 속성도 함께 줄 수 있다 (문단 → 번호 목록 = list-item + listType numbered) */
export const setBlockType = (doc: Doc, b: number, type: string, line: string = MAIN, attrs: Record<string, unknown> = {}): Op[] => {
    const block = doc.textAt({line, b, o: 0});
    const spec = doc.specOf(type);

    if (spec?.shape !== "text" || !doc.allowedIn(line).includes(type)) {
        return [];
    }

    const valid = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => spec.attrs?.[k] && attrValueOk(spec.attrs[k], v)));
    const slot = hiddenSlot(doc, {line, b, o: 0});

    if (slot) {
        return run(doc, [{op: "insert", at: slot, content: [{type, attrs: valid}]}]);
    }

    const change: Record<string, unknown> = {};

    block.type !== type && (change.type = type);
    Object.entries(valid).forEach(([k, v]) => (block.type !== type || block.attrs[k] !== v) && (change[k] = v));

    return Object.keys(change).length ? run(doc, [{op: "update", at: blockPath(doc, line, b)!, attrs: change}]) : [];
};

/** 블록 속성 쓰기 (지금 종류가 받는 속성만) */
export const setAttr = (doc: Doc, b: number, key: string, value: unknown, line: string = MAIN): Op[] => {
    const block = doc.blocks(line)[b];
    const spec = doc.specOf(block.type)?.attrs?.[key];
    const path = blockPath(doc, line, b);

    if (!spec || (block.kind === "text" && block.virtual) || !attrValueOk(spec, value) || block.attrs[key] === value || !path) {
        return [];
    }

    return run(doc, [{op: "update", at: path, attrs: {[key]: value}}]);
};

/** 숫자 속성을 범위 안으로 맞춰 쓰기 (목록 항목의 level 같은) */
export const setNumberAttr = (doc: Doc, b: number, key: string, value: number, line: string = MAIN): Op[] => {
    const spec = doc.specOf(doc.blocks(line)[b].type)?.attrs?.[key];

    return spec ? setAttr(doc, b, key, Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, value)), line) : [];
};

/** 표·상자·구분선을 커서 자리에 넣는다. 표는 고른 크기의 빈 표 (스키마는 크기를 정하지 않는다) */
export const insertBlock = (doc: Doc, pos: Pos, type: string, size: {rows: number; cols: number} = {rows: 1, cols: 1}): Op[] => {
    const spec = doc.specOf(type);

    if (!spec || spec.shape === "text" || !doc.allowedIn(lineOf(pos)).includes(type)) {
        return [];
    }

    const node = emptyNode(doc, type, size);
    const slot = hiddenSlot(doc, pos);

    return run(doc, [{op: "insert", at: slot ?? pathOfPos(doc, pos)!, content: [node]}]);
};

/** 빈 블록 노드 — 표면 rows × cols 빈 칸 */
const emptyNode = (doc: Doc, type: string, size: {rows: number; cols: number}): NodeJSON => {
    const parts = gridParts(doc.schema!, type);

    if (!parts) {
        return {type};
    }

    return {
        type,
        children: Array.from({length: Math.max(1, size.rows)}, () => ({type: parts.row, children: Array.from({length: Math.max(1, size.cols)}, () => ({type: parts.cell}))})),
    };
};

/** inline 노드 넣기 (글 안 그림). 글자 한 자리를 차지한다 */
export const insertInline = (doc: Doc, pos: Pos, type: string, attrs: Record<string, unknown> = {}): Op[] => {
    const block = doc.textAt(pos);
    const spec = doc.specOf(block.type);

    if (doc.specOf(type)?.shape !== "inline" || spec?.shape !== "text" || !spec.children?.includes(type)) {
        return [];
    }

    const node = {type, attrs};
    const slot = hiddenSlot(doc, pos);

    return run(doc, [slot ? {op: "insert", at: slot, content: [{type: block.type, runs: [node]}]} : {op: "insert", at: pathOfPos(doc, pos)!, content: [node]}]);
};

/** 토큰 하나의 속성 쓰기 (inline 노드의 크기 같은) */
export const setItemAttr = (doc: Doc, item: Item, key: string, value: unknown): Op[] => {
    const spec = doc.specOf(item.born)?.attrs?.[key];

    if (!spec || !attrValueOk(spec, value) || item.attrs.get(key)?.value === value) {
        return [];
    }

    const after = doc.posAfter(item.key);
    const path = pathOfPos(doc, {...after, o: after.o - 1});

    return path ? run(doc, [{op: "update", at: path, attrs: {[key]: value}}]) : [];
};

/** 줄 맨 끝에 text 블록 하나 더하기 (이미지 그릇의 캡션 같은) */
export const appendBlock = (doc: Doc, line: string, type: string, attrs: Record<string, unknown> = {}): Op[] => {
    if (doc.specOf(type)?.shape !== "text" || !doc.allowedIn(line).includes(type)) {
        return [];
    }

    return run(doc, [{op: "insert", at: [...flowPath(doc, line), childCount(doc, line)], content: [{type, attrs}]}]);
};

/** 표·상자·구분선 하나를 통째로 지우기 */
export const deleteBlock = (doc: Doc, b: number, line: string = MAIN): Op[] => {
    const block = doc.blocks(line)[b];
    const path = blockPath(doc, line, b);

    return block && block.kind !== "text" && path ? run(doc, [{op: "delete", at: path, count: 1}]) : [];
};

// ── 표 ──────────────────────────────────────────────────────────────────

/**
 * 표에 행·열 넣기. index 는 살아 있는 행(열) 사이의 자리 (0 = 맨 앞).
 * 열은 스키마 기반 문서 에디터처럼 "행마다 같은 번호의 칸 넣기"로 보낸다 — edit.ts 가 열 하나로 접는다.
 */
export const insertAxis = (doc: Doc, grid: GridBlock, axis: "rows" | "cols", index: number): Op[] => {
    const parts = gridParts(doc.schema!, grid.type)!;
    const at = gridPath(doc, grid);

    if (axis === "rows") {
        return run(doc, [{op: "insert", at: [...at, index], content: [{type: parts.row, children: grid.cols.map(() => ({type: parts.cell}))}]}]);
    }

    return run(doc, grid.rows.map((_, r) => ({op: "insert" as const, at: [...at, r, index], content: [{type: parts.cell}]})));
};

/** 표의 행·열 지우기. 마지막 하나를 지우면 표를 지운다. 열은 행마다 같은 번호의 칸 지우기로 보낸다 */
export const deleteAxis = (doc: Doc, grid: GridBlock, axis: "rows" | "cols", index: number): Op[] => {
    const list = axis === "rows" ? grid.rows : grid.cols;
    const at = gridPath(doc, grid);

    if (!list[index]) {
        return [];
    }

    if (list.length === 1) {
        return run(doc, [{op: "delete", at, count: 1}]);
    }

    return axis === "rows"
        ? run(doc, [{op: "delete", at: [...at, index], count: 1}])
        : run(doc, grid.rows.map((_, r) => ({op: "delete" as const, at: [...at, r, index], count: 1})));
};

/** 칸 합치기·나누기. (r, c) 를 왼쪽 위로 rowspan × colspan. 1×1 이면 나눈다. 가려진 칸의 글은 지우지 않는다 */
export const setSpan = (doc: Doc, grid: GridBlock, r: number, c: number, rowspan: number, colspan: number): Op[] => {
    if (!grid.rows[r] || !grid.cols[c]) {
        return [];
    }

    const rs = Math.min(grid.rows.length - r, Math.max(1, rowspan));
    const cs = Math.min(grid.cols.length - c, Math.max(1, colspan));
    // 적혀 있는 값(끝 행·끝 열 이름표)이 같으면 아무것도 하지 않는다 — 겹쳐서 지금은 밀려난 합치기도 다시 쓰지 않는다
    const want = rs === 1 && cs === 1 ? null : {row: grid.rows[r + rs - 1].key, col: grid.cols[c + cs - 1].key};
    const stored = grid.marker.attrs.get(`$span:${grid.rows[r].key},${grid.cols[c].key}`)?.value ?? null;

    if (JSON.stringify(stored) === JSON.stringify(want)) {
        return [];
    }

    return run(doc, [{op: "update", at: [...gridPath(doc, grid), r, c], attrs: {rowspan: rs, colspan: cs}}]);
};

/** 칸 속성 쓰기 (배경색 같은) */
export const setCellAttr = (doc: Doc, grid: GridBlock, r: number, c: number, name: string, value: unknown): Op[] => {
    const parts = gridParts(doc.schema!, grid.type);
    const spec = parts ? doc.specOf(parts.cell)?.attrs?.[name] : undefined;
    const row = grid.rows[r];
    const col = grid.cols[c];

    if (!spec || spec.computed || !row || !col || !attrValueOk(spec, value)) {
        return [];
    }

    if ((grid.marker.attrs.get(`$cell:${row.key},${col.key}|${name}`)?.value ?? spec.default) === value) {
        return [];
    }

    return run(doc, [{op: "update", at: [...gridPath(doc, grid), r, c], attrs: {[name]: value}}]);
};
