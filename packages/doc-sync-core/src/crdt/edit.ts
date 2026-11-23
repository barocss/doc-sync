import {decodeFieldKey, encodeFieldKey, fieldSpecAt, fieldValueOk, flattenFieldPatch, isFieldSpec, materializeFields} from "./fields.ts";
import {MAIN, cellSlot, slotKey, slotTicket} from "./doc.ts";
import {canonMarks, inheritedMarks, runsToUnits} from "./model.ts";
import {attrValueOk, gridParts} from "./schema.ts";
import {keyOf} from "./ticket.ts";
import {parseRequired} from "./cardinality.ts";
import {parseTextStorage} from "./text-storage.ts";
import type {Block, GridBlock, Item, Op, Pos, TextBlock, Doc} from "./doc.ts";
import type {EditOp, ModelPath, NodeJSON, Run, Unit} from "./model.ts";
import type {TextSpec} from "./schema.ts";
import type {Ticket} from "./ticket.ts";

/**
 * 편집 연산(insert · delete · update · split · merge) → 전선 연산.
 *
 * 편집 연산은 모델 경로로 말한다 (모델 = Doc.toJSON 트리, 스키마 기반 문서 에디터의 문서와 같은 꼴). 여기서 그 경로를 저장 위치
 * (줄, 블록, 토큰)로 풀고, 스키마의 **모양**에 따라 전선 연산을 만든다. 블록 종류 이름은 보지 않는다.
 *
 * 한 묶음(edit 호출 하나) 안의 연산은 차례로 — 앞 연산을 적용한 뒤의 상태로 다음 경로를 읽는다 (에디터의 연산 묶음과 같다).
 * 묶음 안에서만 쓰는 기억이 둘 있다.
 * - 비운 머리: 흐름의 첫 블록을 지우면 그 줄 머리(언제나 첫 블록)는 남지만 "빈 자리"가 된다. 묶음 안의 다음 경로는 그
 *   자리를 세지 않고, 맨 앞에 글 블록이 들어오면 그 자리를 채운다. 묶음 끝까지 비어 있으면 다음 글 블록을 당겨 온다.
 * - 열 접기: 스키마 기반 문서 에디터의 트리에는 열이 없어서 열 넣기·지우기는 "행마다 같은 번호의 칸 넣기·지우기"로 온다. 같은 표·같은 칸 번호로
 *   이어지는 것을 열 하나로 접는다. 모든 행에 오지 않아도 열 하나로 바로잡는다 (나머지 행의 칸은 빈 칸).
 */

/** 경로가 가리키는 것 */
type Ref =
    | {kind: "flow"; line: string}
    | {kind: "group"; line: string; flats: number[]}
    | {kind: "block"; line: string; b: number; flat: number}
    | {kind: "row"; grid: GridBlock; r: number}
    | {kind: "cell"; grid: GridBlock; r: number; c: number};

type Batch = {
    /** 비운 머리가 있는 줄 */
    vacant: Set<string>;
    /** 열 접기: 마지막으로 만든·지운 열 */
    column: {grid: string; c: number; col: string; rows: Set<string>; deleted: boolean} | null;
};

// ── 경로 풀기 ────────────────────────────────────────────────────────────

/** 모델에 보이는 블록 — 비어 있는 빈 자리(표 뒤 virtual)와 묶음 안의 비운 머리는 모델에 없다 */
export const visibleBlocks = (doc: Doc, line: string, vacant?: Set<string>): number[] =>
    doc
        .blocks(line)
        .map((block, b) => [block, b] as const)
        .filter(([block, b]) => !(block.kind === "text" && block.virtual && !block.chars.length) && !(b === 0 && vacant?.has(line)))
        .map(([, b]) => b);

/** 흐름의 모델 자식 — 블록 하나, 또는 이어진 묶음 항목들 (model.ts 의 regroup 과 같은 규칙) */
const entriesOf = (doc: Doc, line: string, vacant?: Set<string>): Array<{group: string | null; flats: number[]}> => {
    const blocks = doc.blocks(line);
    const visible = visibleBlocks(doc, line, vacant);
    const entries: Array<{group: string | null; key: string; flats: number[]}> = [];

    visible.forEach((b, flat) => {
        const block = blocks[b];
        const owner = block.kind === "text" ? doc.groupOf(line, block.type) : null;
        const key = owner ? `${owner.type}|${JSON.stringify(owner.spec.by.map(k => block.attrs[k]))}|${doc.groupBoundary(block)}` : "";
        const last = entries.at(-1);

        owner && last?.group === owner.type && last.key === key ? last.flats.push(flat) : entries.push({group: owner?.type ?? null, key, flats: [flat]});
    });

    return entries;
};

const gridAt = (doc: Doc, line: string, b: number): GridBlock => doc.blocks(line)[b] as GridBlock;

/** 같은 표를 다시 찾는다 (행·열을 바꾼 뒤 GridBlock 은 새로 계산된다) */
const refreshGrid = (doc: Doc, grid: GridBlock): GridBlock => {
    const line = grid.marker.line.key;

    return doc.blocks(line).find(x => x.marker === grid.marker) as GridBlock;
};

/** 블록이 흐름 그릇(상자·이미지 그릇)이면 그 몸 줄, 표 칸이면 칸 줄 */
const innerLine = (ref: Ref, doc: Doc): string | null => {
    if (ref.kind === "flow") {
        return ref.line;
    }

    if (ref.kind === "block") {
        const block = doc.blocks(ref.line)[ref.b];

        return block.kind === "flow" ? block.body : null;
    }

    return null;
};

export const resolvePath = (doc: Doc, path: ModelPath, vacant?: Set<string>): Ref => {
    let ref: Ref = {kind: "flow", line: MAIN};

    for (const i of path) {
        const line = innerLine(ref, doc);

        if (line) {
            const entry = entriesOf(doc, line, vacant)[i];
            const visible = visibleBlocks(doc, line, vacant);

            if (!entry) {
                throw new Error(`경로 ${JSON.stringify(path)}: ${i} 번째 자식이 없다`);
            }

            ref = entry.group ? {kind: "group", line, flats: entry.flats} : {kind: "block", line, b: visible[entry.flats[0]], flat: entry.flats[0]};
            continue;
        }

        if (ref.kind === "group") {
            const flat: number | undefined = ref.flats[i];

            if (flat === undefined) {
                throw new Error(`경로 ${JSON.stringify(path)}: 항목 ${i} 이 없다`);
            }

            ref = {kind: "block", line: ref.line, b: visibleBlocks(doc, ref.line, vacant)[flat], flat};
            continue;
        }

        if (ref.kind === "block") {
            const block: Block = doc.blocks(ref.line)[ref.b];

            if (block.kind !== "grid" || !block.rows[i]) {
                throw new Error(`경로 ${JSON.stringify(path)}: 행 ${i} 이 없다`);
            }

            ref = {kind: "row", grid: block, r: i};
            continue;
        }

        if (ref.kind === "row") {
            if (!ref.grid.cols[i]) {
                throw new Error(`경로 ${JSON.stringify(path)}: 칸 ${i} 이 없다`);
            }

            ref = {kind: "cell", grid: ref.grid, r: ref.r, c: i};
            continue;
        }

        if (ref.kind === "cell") {
            // 칸의 자식은 몸 하나
            ref = {kind: "flow", line: doc.cellKey(ref.grid.marker, ref.grid.rows[ref.r], ref.grid.cols[ref.c])};
            continue;
        }

        throw new Error(`경로 ${JSON.stringify(path)} 를 풀 수 없다`);
    }

    return ref;
};

// ── 위치 → 경로 (편집기·명령이 쓴다) ────────────────────────────────────

/** 흐름 줄을 담은 모델 노드의 경로 — 본문은 [], 표 칸이면 [..표, 행, 칸, 0], 상자 안이면 [..상자] */
export const flowPath = (doc: Doc, line: string): ModelPath => {
    if (line === MAIN) {
        return [];
    }

    const cell = doc.cellOf(line);

    if (cell) {
        return [...blockPath(doc, cell.line, cell.b)!, cell.r, cell.c, 0];
    }

    const body = doc.bodyOf(line);

    if (body) {
        return blockPath(doc, body.line, body.b)!;
    }

    throw new Error(`줄 ${line} 이 보이지 않는다`);
};

/** 블록의 모델 경로. 모델에 없는 블록(비어 있는 빈 자리)이면 null */
export const blockPath = (doc: Doc, line: string, b: number): ModelPath | null => {
    // Ordinary flow blocks are already projected into their logical parent.
    // Only private storage lines need to be redirected through token location.
    if ((doc.hasMoves || doc.hasCardinality) && (parseRequired(line) || parseTextStorage(line))) {
        const physical = doc.blocks(line)[b];
        const location = physical && doc.tokenLocation(physical.marker.key);
        if (location?.visible && location.line !== line) {
            const blocks = doc.blocks(location.line);
            const logical = blocks.findIndex(block => block.marker === physical.marker || block.kind === "text" && block.parts?.some(part => part.marker === physical.marker));
            if (logical >= 0) return blockPath(doc, location.line, logical);
        }
    }
    const flat = visibleBlocks(doc, line).indexOf(b);

    if (flat < 0) {
        return null;
    }

    const entries = entriesOf(doc, line);
    const e = entries.findIndex(x => x.flats.includes(flat));
    const entry = entries[e];

    return [...flowPath(doc, line), e, ...(entry.group ? [entry.flats.indexOf(flat)] : [])];
};

/** 글자 자리의 모델 경로. 모델에 없는 블록이면 null */
export const pathOfPos = (doc: Doc, pos: Pos): ModelPath | null => {
    const path = blockPath(doc, pos.line ?? MAIN, pos.b);

    return path && [...path, pos.o];
};

/** 글자 자리의 모델 경로 → 위치. 글 블록 안 자리가 아니면 null */
export const posOfPath = (doc: Doc, path: ModelPath): Pos | null => {
    try {
        const ref = resolvePath(doc, path.slice(0, -1));

        if (ref.kind !== "block" || doc.blocks(ref.line)[ref.b].kind !== "text") {
            return null;
        }

        const o = Math.max(0, Math.min(path.at(-1) ?? 0, (doc.blocks(ref.line)[ref.b] as TextBlock).chars.length));

        return ref.line === MAIN ? {b: ref.b, o} : {line: ref.line, b: ref.b, o};
    } catch {
        return null;
    }
};

/**
 * 커서·선택 끝을 토큰에 붙인다 — 모델 경로를 "그 자리 바로 왼쪽 토큰의 키"로. 남의 편집이 끼어도 이 키는 변하지 않는다.
 * 편집기는 선택을 이 키로 들고 있다가(또는 남의 변경을 받기 직전에 바꿔 두었다가), 받은 뒤 pathAt 으로 되돌린다.
 */
export const anchorAt = (doc: Doc, path: ModelPath): string | null => {
    const pos = posOfPath(doc, path);

    return pos && doc.anchorOf(pos);
};

/** 토큰 키 → 지금 모델 경로. 그 토큰이 지워졌으면 왼쪽으로 가장 가까운 살아 있는 자리, 안 보이는 칸이면 옆 칸 */
export const pathAt = (doc: Doc, key: string): ModelPath | null => {
    const pos = doc.posAfter(key);

    return pathOfPos(doc, pos) ?? (pos.b > 0 ? pathOfPos(doc, {...pos, b: pos.b - 1, o: (doc.blocks(pos.line ?? MAIN)[pos.b - 1] as TextBlock).chars?.length ?? 0}) : null);
};

/** 표 블록의 모델 경로 */
export const gridPath = (doc: Doc, grid: GridBlock): ModelPath => {
    const line = grid.marker.line.key;

    return blockPath(doc, line, doc.blocks(line).indexOf(refreshGrid(doc, grid)))!;
};

/** 흐름 줄의 모델 자식 수 (맨 끝에 붙일 자리) */
export const childCount = (doc: Doc, line: string): number => entriesOf(doc, line).length;

// ── 컴파일 ────────────────────────────────────────────────────────────────

class Compiler {
    readonly doc: Doc;
    readonly out: Op[] = [];
    readonly batch: Batch = {vacant: new Set(), column: null};

    constructor(doc: Doc) {
        this.doc = doc;
    }

    private emit(ops: Op[]): Op[] {
        const expanded: Op[] = [];
        const writeFields = (ids: Ticket[], attr: string, value: unknown, spec: import("./schema.ts").AttrSpec, prefix = "") => {
            if (!fieldValueOk(spec, value)) throw new Error(`Invalid nested field patch: ${attr}`);
            for (const field of flattenFieldPatch(spec, value)) expanded.push({t: "set", at: this.next(), ids, key: prefix + encodeFieldKey(attr, field.path), value: field.value});
        };
        for (const original of ops) {
            if (original.t === "node") {
                const op: Extract<Op, {t: "node"}> = {...original, attrs: {...original.attrs}};
                const fields: Array<[string, unknown, import("./schema.ts").AttrSpec]> = [];
                for (const [key, value] of Object.entries(op.attrs!)) {
                    const spec = this.doc.specOf(op.type)?.attrs?.[key];
                    if (spec && isFieldSpec(spec)) { fields.push([key, value, spec]); delete op.attrs![key]; }
                }
                if (!Object.keys(op.attrs!).length) delete op.attrs;
                expanded.push(op);
                for (const [key, value, spec] of fields) writeFields([op.id], key, value, spec);
            } else if (original.t === "set" && !original.key.startsWith("$field:")) {
                const cell = /^(\$cell:[^|]+\|)(.+)$/.exec(original.key);
                let handled = false;
                const scalar: Ticket[] = [];
                for (const id of original.ids) {
                    const item = this.doc.get(keyOf(id));
                    const type = cell && item ? gridParts(this.schema, item.born)?.cell : item && this.doc.typeOf(item);
                    const attr = cell?.[2] ?? original.key;
                    const spec = type ? this.doc.specOf(type)?.attrs?.[attr] : undefined;
                    if (spec && isFieldSpec(spec)) { writeFields([id], attr, original.value, spec, cell?.[1]); handled = true; }
                    else scalar.push(id);
                }
                if (!handled) expanded.push(original);
                else if (scalar.length) expanded.push({...original, ids: scalar});
            } else expanded.push(original);
        }
        this.out.push(...this.doc.emit(expanded));
        return expanded;
    }

    private next(): Ticket {
        return this.doc.clock.next();
    }

    private get schema() {
        return this.doc.schema!;
    }

    private promoted = false;
    compile(op: EditOp): void {
        if (!this.promoted && (this.doc.hasMoves || op.op === "move")) {
            this.promoted = true;
            for (const line of this.doc.lines()) for (const block of this.doc.sourceBlocks(line.key)) {
                if (block.kind === "text" && block.virtual && block.chars.length) this.emit([{t: "node", id: this.next(), origin: block.marker.id, type: block.type, boundary: `virtual:${block.marker.key}|${block.chars[0].key}`}]);
            }
        }
        op.op !== "insert" && op.op !== "delete" && (this.batch.column = null);

        switch (op.op) {
            case "move":
                return this.move(op.from, op.at);
            case "insert":
                return this.insert(op.at, op.content);
            case "delete":
                return this.delete(op.at, op.count);
            case "update":
                return this.update(op.at, op.attrs, op.length);
            case "split":
                return this.split(op.at);
            case "merge":
                return this.merge(op.at);
        }
    }

    /** 묶음 끝 — 비운 머리가 남았으면 뒤의 글 블록을 당겨 온다 */
    finish(): void {
        for (const line of this.batch.vacant) {
            const blocks = this.doc.blocks(line);
            const head = blocks[0] as TextBlock;
            const next = blocks[1];

            if (next?.kind === "text" && !next.virtual && !head.chars.length) {
                this.retype(head, next.type, next.attrs);
                this.emit([{t: "del", at: this.next(), ids: [next.marker.id, ...next.aliases.map(a => a.id)]}]);
            }
        }

        this.batch.vacant.clear();
    }

    // ── 위치 ────────────────────────────────────────────────────────────

    private move(from: ModelPath, at: ModelPath): void {
        const source = this.ref(from);
        if (source.kind !== "block" && source.kind !== "group") throw new Error("Move requires one block or group");
        const moving = source.kind === "group" ? source.flats.map(flat => this.doc.blocks(source.line)[visibleBlocks(this.doc, source.line)[flat]]) : [this.doc.blocks(source.line)[source.b]];
        const destination = this.ref(at.slice(0, -1));
        const line = innerLine(destination, this.doc);
        if (!line) throw new Error("Move destination must be a flow");
        const entries = entriesOf(this.doc, line);
        const children = entries.map(entry => entry.flats.map(flat => this.doc.blocks(line)[visibleBlocks(this.doc, line)[flat]]))
            .filter(entry => !entry.some(block => moving.includes(block)));
        const index = at.at(-1)!;
        if (index < 0 || index > children.length) throw new Error("Move destination index is out of range");
        const previous = children[index - 1]?.at(-1);
        let after = previous ? this.doc.placementOf(this.doc.movementTarget(previous, line).id)?.at ?? this.doc.movementTarget(previous, line).id : null;
        for (const block of moving) {
            const target = this.doc.movementTarget(block, source.line);
            const op: Op = {t: "move", at: this.next(), target: target.id, parent: this.doc.get(line)!.id, after};
            const error = this.doc.check([op]);
            if (error) throw new Error(error);
            this.emit([op]); after = op.at;
        }
    }

    private ref(path: ModelPath): Ref {
        return resolvePath(this.doc, path, this.batch.vacant);
    }

    private textRef(ref: Ref): {line: string; b: number; block: TextBlock} | null {
        if (ref.kind !== "block") {
            return null;
        }

        const block = this.doc.blocks(ref.line)[ref.b];

        return block.kind === "text" ? {line: ref.line, b: ref.b, block} : null;
    }

    /** 흐름 줄의 펼친 번호 f 자리 — 그 앞 토큰(기준)과 뒤 토큰 키(경계) */
    private gapAt(line: string, flat: number): {origin: Item; right: string} {
        const blocks = this.doc.blocks(line);
        const visible = visibleBlocks(this.doc, line, this.batch.vacant);
        const before = flat > 0 ? blocks[visible[flat - 1]] : this.batch.vacant.has(line) ? blocks[0] : null;
        const after = visible[flat] !== undefined ? blocks[visible[flat]] : null;

        return {origin: before ? this.lastToken(before) : blocks[0].marker, right: after ? after.marker.key : "end"};
    }

    /** 블록의 마지막 토큰 (그 줄 안에서) */
    private lastToken(block: Block): Item {
        if (block.kind === "text") {
            return block.chars.at(-1) ?? block.marker;
        }

        return block.marker;
    }

    // ── insert ──────────────────────────────────────────────────────────

    private insert(at: ModelPath, content: string | Array<NodeJSON | Run>): void {
        const parent = this.ref(at.slice(0, -1));
        const index = at.at(-1) ?? 0;
        const items = typeof content === "string" ? [content] : content;
        const text = this.textRef(parent);

        if (text) {
            const blocks = items.filter((c): c is NodeJSON => typeof c !== "string" && this.isBlock(c));

            blocks.length ? this.splitInsert(text.line, text.b, index, blocks) : this.insertUnits({line: text.line, b: text.b, o: index}, items);

            return;
        }

        if (parent.kind === "row") {
            this.insertColumns(parent.grid, parent.r, index, items as NodeJSON[]);

            return;
        }

        if (parent.kind === "block") {
            const block = this.doc.blocks(parent.line)[parent.b];

            if (block.kind === "grid") {
                this.insertRows(block, index, items as NodeJSON[]);

                return;
            }
        }

        const line = innerLine(parent, this.doc) ?? (parent.kind === "group" ? parent.line : null);

        if (!line) {
            throw new Error(`insert: ${JSON.stringify(at)} 에는 넣을 수 없다`);
        }

        // 흐름(또는 묶음) 안의 자리 → 펼친 번호
        let flat: number;
        let extra: Record<string, unknown> = {};

        if (parent.kind === "group") {
            flat = (parent.flats[index] ?? parent.flats.at(-1)! + 1);

            const first = this.doc.blocks(line)[visibleBlocks(this.doc, line, this.batch.vacant)[parent.flats[0]]] as TextBlock;
            const owner = this.doc.groupOf(line, first.type)!;

            extra = Object.fromEntries(owner.spec.by.map(k => [k, first.attrs[k]]));
        } else {
            const entries = entriesOf(this.doc, line, this.batch.vacant);

            flat = index < entries.length ? entries[index].flats[0] : visibleBlocks(this.doc, line, this.batch.vacant).length;
        }

        this.insertBlocksAt(line, flat, this.flattenContent(items as NodeJSON[], extra));
    }

    private isBlock(node: NodeJSON | Run): node is NodeJSON {
        if ("text" in node) {
            return false;
        }

        const shape = this.doc.specOf(node.type)?.shape;

        return !!shape && shape !== "inline" && shape !== "span";
    }

    /** 넣을 블록들을 펼친다 — 묶음(목록)은 항목으로, 묶음 속성은 항목에 */
    private flattenContent(nodes: NodeJSON[], extra: Record<string, unknown> = {}): NodeJSON[] {
        return nodes.flatMap(node => {
            const spec = this.doc.specOf(node.type);

            if (spec?.shape === "group") {
                const by = Object.fromEntries(spec.by.map(k => [k, node.attrs?.[k]]).filter(([, v]) => v !== undefined));

                return (node.children ?? []).map(item => ({...item, attrs: {...extra, ...by, ...(item.attrs ?? {})}}));
            }

            // 항목이 제 값을 가지고 있으면 그것이 이긴다 (model.ts 의 펼치기와 같은 규칙)
            return [Object.keys(extra).length ? {...node, attrs: {...extra, ...(node.attrs ?? {})}} : node];
        });
    }

    /** 글 블록 안에 글자·inline 넣기. 문자열은 왼쪽 글자의 서식을 물려받는다 */
    private insertUnits(pos: Pos, items: Array<string | NodeJSON | Run>): void {
        const left = this.doc.leftOf(pos);
        const inherit = left.kind === "char" ? inheritedMarks(this.schema, this.doc.marksOf(left)) : {};
        const units: Unit[] = items.flatMap(item =>
            typeof item === "string" ? [...item].map(ch => ({ch, marks: inherit})) : runsToUnits(this.schema, [item as Run]),
        );

        this.emitUnits(left.id, units);
    }

    /** 글자·inline 줄을 origin 뒤에 차례로 — 서식이 같은 이어진 글자는 연산 하나 */
    private emitUnits(origin: Ticket, units: Unit[]): Ticket {
        let i = 0;

        while (i < units.length) {
            const u = units[i];

            if ("inline" in u) {
                const id = this.next();
                const attrs = this.validAttrs(u.inline, u.attrs);
                const op: Op = {t: "node", id, origin, type: u.inline};

                Object.keys(attrs).length && (op.attrs = attrs);
                this.emit([op]);
                origin = id;
                i += 1;
                continue;
            }

            const marks = canonMarks(this.schema, u.marks);
            let j = i;

            while (j < units.length && "ch" in units[j] && JSON.stringify(canonMarks(this.schema, (units[j] as {marks: Record<string, unknown>}).marks)) === JSON.stringify(marks)) {
                j += 1;
            }

            const text = units
                .slice(i, j)
                .map(x => (x as {ch: string}).ch)
                .join("");
            const first = this.next();

            for (let k = 1; k < text.length; k += 1) {
                this.next();
            }

            const op: Op = {t: "text", id: first, origin, text};

            Object.keys(marks).length && (op.marks = marks);
            this.emit([op]);
            origin = {lamport: first.lamport + text.length - 1, actor: first.actor};
            i = j;
        }

        return origin;
    }

    /** 스키마가 받는 속성만, 기본값이 아닌 것만 */
    private validAttrs(type: string, attrs: Record<string, unknown> = {}): Record<string, unknown> {
        const spec = this.doc.specOf(type)?.attrs ?? {};

        return Object.fromEntries(Object.entries(attrs).filter(([k, v]) => spec[k] && !spec[k].computed && (isFieldSpec(spec[k]) || v !== null && v !== spec[k].default) && attrValueOk(spec[k], v)));
    }

    /** 글 블록 안 자리에서 나누고 그 사이에 블록들 — 뒷글은 같은 종류·속성의 새 블록 */
    private splitInsert(line: string, b: number, o: number, nodes: NodeJSON[]): void {
        const block = this.doc.blocks(line)[b] as TextBlock;
        if (this.doc.hasMoves) {
            const path = blockPath(this.doc, line, b)!;
            const start = this.out.length;
            this.split([...path, o]);
            const birth = this.out.slice(start).find((op): op is Extract<Op, {t: "node"}> => op.t === "node" && !!op.boundary?.startsWith("split:"));
            const tail = birth && this.doc.blocks(line).find(candidate => candidate.marker.key === keyOf(birth.id));
            if (tail?.kind === "text") this.retype(tail, block.type, block.attrs);
            const flat = visibleBlocks(this.doc, line).findIndex(index => this.doc.blocks(line)[index].marker === block.marker);
            this.insertBlocksAt(line, flat + 1, this.flattenContent(nodes));
            return;
        }
        const left = this.doc.leftOf({line, b, o});
        const right = this.doc.rightKeyOf({line, b, o});
        const last = this.chainBlocks(line, left.id, right, this.flattenContent(nodes));
        const rest: Op = {t: "node", id: this.next(), origin: last, type: block.type, boundary: `${keyOf(last)}|${right}`};
        const carried = this.validAttrs(block.type, block.attrs);

        Object.keys(carried).length && (rest.attrs = carried);
        this.emit([rest]);
    }

    /** 흐름 줄의 펼친 번호 자리에 블록들 */
    private insertBlocksAt(line: string, flat: number, nodes: NodeJSON[]): void {
        if (!nodes.length) {
            return;
        }

        const blocks = this.doc.blocks(line);
        if (this.doc.hasMoves && flat === 0) {
            const storage = this.doc.fragmentStorage(line, this.next());
            this.chainBlocks(line, storage.id, "end", nodes);
            return;
        }
        if (!blocks.length) {
            this.chainBlocks(line, this.doc.get(line)!.id, "end", nodes);
            return;
        }

        if (flat === 0 && this.batch.vacant.has(line)) {
            // 비운 머리를 채운다 — 첫 블록이 글이면 머리가 그 블록이 된다
            const [first, ...rest] = nodes;

            if (this.doc.specOf(first.type)?.shape === "text") {
                this.batch.vacant.delete(line);
                this.fillHead(line, first);

                const head = this.doc.blocks(line)[0] as TextBlock;

                this.chainBlocks(line, this.lastToken(head).id, this.doc.blocks(line)[1]?.marker.key ?? "end", rest);

                return;
            }

            this.chainBlocks(line, blocks[0].marker.id, blocks[1]?.marker.key ?? "end", nodes);

            return;
        }

        if (flat === 0) {
            // 맨 앞: 머리는 언제나 첫 블록이다. 머리가 새 첫 블록이 되고, 원래 머리 내용은 새 표지 뒤로 이어진다
            const head = blocks[0] as TextBlock;
            const [first, ...rest] = nodes;
            const oldType = head.type;
            const oldAttrs = {...head.attrs};
            const oldRight = head.chars[0]?.key ?? blocks[1]?.marker.key ?? "end";
            const textFirst = this.doc.specOf(first.type)?.shape === "text";

            const oldChars = new Set(head.chars);

            textFirst ? this.fillHead(line, first) : this.retype(head, this.doc.defaultIn(line), {});

            // 새로 넣은 머리 글은 머리 표지 바로 뒤, 원래 글보다 앞에 선다 (이름표가 더 크므로)
            const after = this.doc.blocks(line)[0] as TextBlock;
            const newChars = after.chars.filter(c => !oldChars.has(c));
            const last = this.chainBlocks(line, newChars.at(-1)?.id ?? after.marker.id, oldRight, textFirst ? rest : nodes);
            const tail: Op = {t: "node", id: this.next(), origin: last, type: oldType, boundary: `${keyOf(last)}|${oldRight}`};
            const carried = this.validAttrs(oldType, oldAttrs);

            Object.keys(carried).length && (tail.attrs = carried);
            this.emit([tail]);

            return;
        }

        const {origin, right} = this.gapAt(line, flat);

        this.chainBlocks(line, origin.id, right, nodes);
    }

    /** 머리 블록을 node 의 종류·속성·글로 */
    private fillHead(line: string, node: NodeJSON): void {
        const head = this.doc.blocks(line)[0] as TextBlock;

        this.retype(head, node.type, node.attrs ?? {});
        this.emitUnits(head.marker.id, runsToUnits(this.schema, node.runs ?? []));
    }

    /** 블록 표지의 종류·속성을 바꾼다 (속성은 명세의 것을 모두 — 없는 것은 기본값으로) */
    private retype(block: TextBlock, type: string, attrs: Record<string, unknown>): void {
        const ops: Op[] = [];
        const id = block.marker.id;

        block.type !== type && ops.push({t: "set", at: this.next(), ids: [id], key: "$type", value: type});

        Object.entries(this.doc.specOf(type)?.attrs ?? {}).forEach(([k, s]) => {
            const want = attrs[k] === undefined || attrs[k] === null || !attrValueOk(s, attrs[k]) ? s.default : attrs[k];

            block.attrs[k] !== want && ops.push({t: "set", at: this.next(), ids: [id], key: k, value: want === s.default ? null : want});
        });
        ops.length && this.emit(ops);
    }

    /** 블록들을 origin 뒤에 차례로. @returns 마지막으로 넣은 토큰 (이 줄 안) */
    private chainBlocks(line: string, origin: Ticket, right: string, nodes: NodeJSON[]): Ticket {
        let last = origin;
        const owner = this.doc.blocks(line).find(block => block.marker.id === origin || block.marker.key === keyOf(origin) || block.kind === "text" && block.chars.some(char => char.key === keyOf(origin)));
        let after = owner ? this.doc.placementOf(this.doc.movementTarget(owner, line).id)?.at ?? this.doc.movementTarget(owner, line).id : null;
        for (const node of nodes) {
            const start = this.out.length, previous = last;
            last = this.block(line, last, right, node);
            if (this.doc.hasMoves) {
                const birth = this.out.slice(start).find((op): op is Extract<Op, {t: "node"}> => op.t === "node" && keyOf(op.origin) === keyOf(previous) && op.type === node.type);
                if (birth) {
                    const movement: Op = {t: "move", at: this.next(), target: birth.id, parent: this.doc.get(line)!.id, after};
                    this.emit([movement]); after = movement.at;
                }
            }
        }
        return last;
    }

    /** 블록 하나 (모양별). @returns 이 줄 안의 마지막 토큰 */
    private block(line: string, origin: Ticket, right: string, node: NodeJSON): Ticket {
        const spec = this.doc.specOf(node.type);

        // 행이나 칸이 없는 표는 모델에 없다 — 넣지 않는다
        if (spec?.shape === "grid" && (!(node.children ?? []).length || !Math.max(0, ...(node.children ?? []).map(r => (r.children ?? []).length)))) {
            return origin;
        }

        const id = this.next();

        if (spec?.shape === "text") {
            const op: Op = {t: "node", id, origin, type: node.type, boundary: `${keyOf(origin)}|${right}${this.doc.constrainedChild(line, node.type) ? `|child:${keyOf(id)}` : ""}`};
            const attrs = this.validAttrs(node.type, node.attrs);

            Object.keys(attrs).length && (op.attrs = attrs);
            this.emit([op]);

            return this.emitUnits(id, runsToUnits(this.schema, node.runs ?? []));
        }

        const op: Op = {t: "node", id, origin, type: node.type};
        const attrs = this.validAttrs(node.type, node.attrs);

        Object.keys(attrs).length && (op.attrs = attrs);
        this.emit([op]);

        if (spec?.shape === "flow") {
            this.fillFlow(slotKey(id, "body"), node.children ?? []);
        } else if (spec?.shape === "grid") {
            this.fillGrid(id, node);
        }

        return id;
    }

    /** 새 흐름 줄(머리만 있는)을 채운다 */
    private fillFlow(line: string, children: NodeJSON[]): void {
        const nodes = this.flattenContent(children);

        if (!nodes.length) {
            return;
        }

        this.doc.get(line);

        const [first, ...rest] = nodes;
        const textFirst = this.doc.specOf(first.type)?.shape === "text";

        textFirst && this.fillHead(line, first);

        const head = this.doc.blocks(line)[0] as TextBlock;

        this.chainBlocks(line, this.lastToken(head).id, "end", textFirst ? rest : nodes);
    }

    /** 새 표의 행·열·칸 */
    private fillGrid(id: Ticket, node: NodeJSON): void {
        const parts = gridParts(this.schema, node.type)!;
        const rows = node.children ?? [];
        const width = Math.max(0, ...rows.map(r => (r.children ?? []).length));
        const rowIds: Ticket[] = [];
        const colIds: Ticket[] = [];
        let origin = slotTicket(id, "rows");

        for (let i = 0; i < rows.length; i += 1) {
            const rid = this.next();

            this.emit([{t: "node", id: rid, origin, type: parts.row}]);
            rowIds.push(rid);
            origin = rid;
        }

        origin = slotTicket(id, "cols");

        for (let j = 0; j < width; j += 1) {
            const cid = this.next();

            this.emit([{t: "node", id: cid, origin, type: "col"}]);
            colIds.push(cid);
            origin = cid;
        }

        rows.forEach((row, i) => (row.children ?? []).forEach((cell, j) => this.fillCell(id, rowIds[i], colIds[j], rowIds, colIds, i, j, cell)));
    }

    /** 칸 하나 — 몸 내용, 칸 속성, 칸 합치기 */
    private fillCell(grid: Ticket, row: Ticket, col: Ticket | undefined, rowIds: Ticket[], colIds: Ticket[], i: number, j: number, cell: NodeJSON): void {
        if (!col) {
            return;
        }

        this.fillFlow(slotKey(grid, cellSlot(keyOf(row), keyOf(col))), cell.children?.[0]?.children ?? []);
        this.cellAttrs(grid, row, col, cell.attrs ?? {}, rowIds, colIds, i, j);
    }

    private cellAttrs(
        grid: Ticket,
        row: Ticket,
        col: Ticket,
        attrs: Record<string, unknown>,
        rowIds: Ticket[],
        colIds: Ticket[],
        i: number,
        j: number,
    ): void {
        const ops: Op[] = [];
        const rs = Math.max(1, Number(attrs.rowspan ?? 1) || 1);
        const cs = Math.max(1, Number(attrs.colspan ?? 1) || 1);

        if (rs > 1 || cs > 1) {
            const endRow = rowIds[Math.min(rowIds.length, i + rs) - 1];
            const endCol = colIds[Math.min(colIds.length, j + cs) - 1];

            ops.push({t: "set", at: this.next(), ids: [grid], key: `$span:${keyOf(row)},${keyOf(col)}`, value: {row: keyOf(endRow), col: keyOf(endCol)}});
        }

        const node = this.doc.get(keyOf(grid));
        const parts = node && gridParts(this.schema, node.born);
        const spec = parts ? (this.doc.specOf(parts.cell)?.attrs ?? {}) : {};

        Object.entries(attrs).forEach(([k, v]) => {
            spec[k] && !spec[k].computed && (isFieldSpec(spec[k]) || v !== null && v !== spec[k].default) && attrValueOk(spec[k], v) &&
                ops.push({t: "set", at: this.next(), ids: [grid], key: `$cell:${keyOf(row)},${keyOf(col)}|${k}`, value: v});
        });
        ops.length && this.emit(ops);
    }

    /** 표에 행 넣기 — 칸은 지금 열마다 하나 (넘치는 칸은 버린다) */
    private insertRows(grid: GridBlock, r: number, rows: NodeJSON[]): void {
        const parts = gridParts(this.schema, grid.type)!;
        let origin = r > 0 ? grid.rows[r - 1].id : slotTicket(grid.marker.id, "rows");
        const fresh: Ticket[] = [];

        for (let n = 0; n < rows.length; n += 1) {
            const id = this.next();

            this.emit([{t: "node", id, origin, type: parts.row}]);
            fresh.push(id);
            origin = id;
        }

        const now = refreshGrid(this.doc, grid);
        const rowIds = now.rows.map(x => x.id);
        const colIds = now.cols.map(x => x.id);

        rows.forEach((row, n) =>
            (row.children ?? []).forEach((cell, j) => this.fillCell(grid.marker.id, fresh[n], colIds[j], rowIds, colIds, rowIds.findIndex(x => keyOf(x) === keyOf(fresh[n])), j, cell)),
        );
    }

    /** 한 행에 칸 넣기 = 열 넣기 (열 접기, 위 설명) */
    private insertColumns(grid: GridBlock, r: number, c: number, cells: NodeJSON[]): void {
        cells.forEach((cell, t) => {
            const index = c + t;
            const now = refreshGrid(this.doc, grid);
            const row = now.rows[r];
            const memo = this.batch.column;

            if (memo && !memo.deleted && memo.grid === now.marker.key && memo.c === index && !memo.rows.has(row.key)) {
                // 같은 열을 다른 행에서 — 이미 만든 열의 그 칸을 채운다
                memo.rows.add(row.key);
                this.fillExisting(now, r, index, cell);

                return;
            }

            const origin = index > 0 ? now.cols[index - 1].id : slotTicket(now.marker.id, "cols");
            const id = this.next();

            this.emit([{t: "node", id, origin, type: "col"}]);
            this.batch.column = {grid: now.marker.key, c: index, col: keyOf(id), rows: new Set([row.key]), deleted: false};
            this.fillExisting(refreshGrid(this.doc, grid), r, index, cell);
        });
    }

    private fillExisting(grid: GridBlock, r: number, c: number, cell: NodeJSON): void {
        const row = grid.rows[r];
        const col = grid.cols[c];

        this.fillFlow(this.doc.cellKey(grid.marker, row, col), cell.children?.[0]?.children ?? []);
        this.cellAttrs(
            grid.marker.id,
            row.id,
            col.id,
            cell.attrs ?? {},
            grid.rows.map(x => x.id),
            grid.cols.map(x => x.id),
            r,
            c,
        );
    }

    // ── delete ──────────────────────────────────────────────────────────

    private delete(at: ModelPath, count: number): void {
        if (count <= 0) {
            return;
        }

        const parent = this.ref(at.slice(0, -1));
        const index = at.at(-1) ?? 0;
        const text = this.textRef(parent);

        if (text) {
            const ids = text.block.chars.slice(index, index + count).map(c => c.id);

            ids.length && this.emit([{t: "del", at: this.next(), ids}]);

            return;
        }

        if (parent.kind === "row") {
            this.deleteColumns(parent.grid, parent.r, index, count);

            return;
        }

        if (parent.kind === "block") {
            const block = this.doc.blocks(parent.line)[parent.b];

            if (block.kind === "grid") {
                const rows = block.rows.slice(index, index + count);

                rows.length && this.emit([{t: "del", at: this.next(), ids: rows.map(x => x.id)}]);

                return;
            }
        }

        const line = innerLine(parent, this.doc) ?? (parent.kind === "group" ? parent.line : null);

        if (!line) {
            throw new Error(`delete: ${JSON.stringify(at)} 에서는 지울 수 없다`);
        }

        let flats: number[];

        if (parent.kind === "group") {
            flats = parent.flats.slice(index, index + count);
        } else {
            flats = entriesOf(this.doc, line, this.batch.vacant)
                .slice(index, index + count)
                .flatMap(e => e.flats);
        }

        const visible = visibleBlocks(this.doc, line, this.batch.vacant);
        const blocks = this.doc.blocks(line);
        const ids: Ticket[] = [];
        let head = false;

        flats.forEach(f => {
            const b = visible[f];
            const block = blocks[b];

            if (this.doc.requiredSlotType(block.marker) && block.kind !== "text") {
                const clear = (contentLine: string): void => {
                    for (const child of this.doc.blocks(contentLine)) {
                        if (child.kind === "text") ids.push(...child.chars.map(char => char.id));
                        else if (child.kind === "flow") clear(child.body);
                        else if (child.kind === "grid") for (const row of child.rows) for (const col of child.cols) clear(this.doc.cellKey(child.marker, row, col));
                        if (child.marker.boundary !== "root" && !this.doc.requiredSlotType(child.marker)) ids.push(child.marker.id);
                    }
                };
                if (block.kind === "flow") clear(block.body);
                if (block.kind === "grid") for (const row of block.rows) for (const col of block.cols) clear(this.doc.cellKey(block.marker, row, col));
                return;
            }
            if (this.doc.hasMoves && block.kind === "text" && !this.doc.requiredSlotType(block.marker)) {
                for (const part of block.parts ?? [block]) {
                    ids.push(part.marker.id, ...part.aliases.map(alias => alias.id), ...part.chars.map(char => char.id));
                }
                return;
            }
            if (b === 0) {
                head = true;
                (block as TextBlock).chars.forEach(c => ids.push(c.id));

                return;
            }

            if (block.kind === "text") {
                block.virtual || block.marker.boundary === "root" || ids.push(block.marker.id, ...block.aliases.map(a => a.id));
                block.chars.forEach(c => ids.push(c.id));
            } else {
                ids.push(block.marker.id);
            }
        });

        ids.length && this.emit([{t: "del", at: this.next(), ids}]);

        if (head) {
            // 줄 머리는 지울 수 없다 — 비워 두고, 묶음 안에서는 없는 것으로 센다
            this.retype(this.doc.blocks(line)[0] as TextBlock, this.doc.defaultIn(line), {});
            this.batch.vacant.add(line);
        }
    }

    /** 한 행의 칸 지우기 = 열 지우기 (열 접기) */
    private deleteColumns(grid: GridBlock, r: number, c: number, count: number): void {
        for (let t = 0; t < count; t += 1) {
            const now = refreshGrid(this.doc, grid);

            if (!now) {
                return;
            }

            const row = now.rows[r];
            const memo = this.batch.column;

            if (memo && memo.deleted && memo.grid === now.marker.key && memo.c === c && !memo.rows.has(row.key)) {
                // 이미 지운 열을 다른 행에서
                memo.rows.add(row.key);
                continue;
            }

            const col = now.cols[c];

            if (!col) {
                return;
            }

            this.emit([{t: "del", at: this.next(), ids: [col.id]}]);
            this.batch.column = {grid: now.marker.key, c, col: col.key, rows: new Set([row.key]), deleted: true};
        }
    }

    // ── update ──────────────────────────────────────────────────────────

    private update(at: ModelPath, attrs: Record<string, unknown>, length?: number): void {
        const parent = at.length ? this.ref(at.slice(0, -1)) : null;
        const text = parent && this.textRef(parent);

        if (text) {
            const o = at.at(-1)!;

            if (length !== undefined) {
                const chars = text.block.chars.slice(o, o + length).filter(c => c.kind === "char");

                Object.entries(attrs).forEach(([key, value]) => {
                    chars.length && this.emit([{t: "set", at: this.next(), ids: chars.map(c => c.id), key, value}]);
                });

                return;
            }

            const item = text.block.chars[o];

            item && item.kind !== "char" && Object.entries(attrs).forEach(([key, value]) => this.emit([{t: "set", at: this.next(), ids: [item.id], key, value}]));

            return;
        }

        const ref = this.ref(at);

        if (ref.kind === "cell") {
            this.updateCell(ref.grid, ref.r, ref.c, attrs);

            return;
        }

        if (ref.kind === "group") {
            const visible = visibleBlocks(this.doc, ref.line, this.batch.vacant);
            const blocks = this.doc.blocks(ref.line);
            const ids = ref.flats.map(f => blocks[visible[f]].marker.id);

            Object.entries(attrs).forEach(([key, value]) => this.emit([{t: "set", at: this.next(), ids, key, value}]));

            return;
        }

        if (ref.kind !== "block") {
            return;
        }

        const block = this.doc.blocks(ref.line)[ref.b];

        if (block.kind === "text" && block.virtual) {
            // 표 뒤 빈 자리(표지 없음) — 그 종류·속성의 표지를 새로 넣는다
            const {type, ...rest} = attrs;
            const kind = String(type ?? block.type);
            const op: Op = {t: "node", id: this.next(), origin: block.marker.id, type: kind, boundary: `${block.marker.key}|${this.doc.rightKeyOf({line: ref.line, b: ref.b, o: 0})}`};
            const valid = this.validAttrs(kind, {...block.attrs, ...rest});

            Object.keys(valid).length && (op.attrs = valid);
            this.emit([op]);

            return;
        }

        if (block.kind === "text") {
            const {type, ...rest} = attrs;

            if (type !== undefined && type !== block.type && this.doc.requiredSlotType(block.marker)) throw new Error("Required child type is fixed");
            type !== undefined && type !== block.type && this.emit([{t: "set", at: this.next(), ids: [block.marker.id], key: "$type", value: type}]);
            Object.entries(rest).forEach(([key, value]) => this.emit([{t: "set", at: this.next(), ids: [block.marker.id], key, value}]));

            return;
        }

        Object.entries(attrs).forEach(([key, value]) => key !== "type" && this.emit([{t: "set", at: this.next(), ids: [block.marker.id], key, value}]));
    }

    /** 칸 속성 — colspan·rowspan 은 칸 합치기로, 나머지는 칸 속성으로 */
    private updateCell(grid: GridBlock, r: number, c: number, attrs: Record<string, unknown>): void {
        const row = grid.rows[r];
        const col = grid.cols[c];
        const span = grid.spans.get(`${r},${c}`) ?? [1, 1];

        if ("colspan" in attrs || "rowspan" in attrs) {
            const rs = Math.max(1, Number(attrs.rowspan === null ? 1 : attrs.rowspan ?? span[0]) || 1);
            const cs = Math.max(1, Number(attrs.colspan === null ? 1 : attrs.colspan ?? span[1]) || 1);
            const endRow = grid.rows[Math.min(grid.rows.length, r + rs) - 1];
            const endCol = grid.cols[Math.min(grid.cols.length, c + cs) - 1];
            const value = endRow === row && endCol === col ? null : {row: endRow.key, col: endCol.key};

            this.emit([{t: "set", at: this.next(), ids: [grid.marker.id], key: `$span:${row.key},${col.key}`, value}]);
        }

        const parts = gridParts(this.schema, grid.type)!;
        const spec = this.doc.specOf(parts.cell)?.attrs ?? {};

        Object.entries(attrs).forEach(([k, v]) => {
            spec[k] &&
                !spec[k].computed &&
                (v === null || attrValueOk(spec[k], v)) &&
                this.emit([{t: "set", at: this.next(), ids: [grid.marker.id], key: `$cell:${row.key},${col.key}|${k}`, value: v}]);
        });
    }

    // ── split · merge ───────────────────────────────────────────────────

    /** Enter — 경계 키는 지금 이 순간의 왼쪽·오른쪽 토큰. 끝에서 나누면 스키마의 next, 속성은 inherit 인 것만 */
    private split(at: ModelPath): void {
        const text = this.textRef(this.ref(at.slice(0, -1)));

        if (!text || !this.doc.takesText(text.block.type)) {
            return;
        }

        const pos = {line: text.line, b: text.b, o: at.at(-1)!};
        const block = text.block;
        let left = this.doc.leftOf(pos);
        if (this.doc.hasMoves && block.parts) {
            let offset = 0;
            for (const part of block.parts) {
                if (pos.o >= offset && pos.o <= offset + part.chars.length) {
                    left = pos.o === offset ? part.marker : part.chars[pos.o - offset - 1];
                    break;
                }
                offset += part.chars.length;
            }
        }
        const spec = this.doc.specOf(block.type) as TextSpec;
        const type = pos.o === block.chars.length && spec.next ? spec.next : block.type;
        const attrs: Record<string, unknown> = {};

        Object.entries(this.doc.specOf(type)?.attrs ?? {}).forEach(
            ([k, s]) => s.inherit && block.attrs[k] !== undefined && block.attrs[k] !== s.default && (attrs[k] = block.attrs[k]),
        );

        const boundary = this.doc.hasMoves ? `split:${JSON.stringify({into: block.marker.key, after: block.marker.key, left: left.key, right: this.doc.rightKeyOf(pos)})}` : `${left.key}|${this.doc.rightKeyOf(pos)}`;
        const op: Op = {t: "node", id: this.next(), origin: left.id, type, boundary};

        Object.keys(attrs).length && (op.attrs = attrs);
        this.emit([op]);
        if (this.doc.hasMoves) {
            const placement = this.doc.placementOf(block.marker.id)!;
            this.emit([{t: "move", at: this.next(), target: op.id, parent: this.doc.get(text.line)!.id, after: placement.at}]);
            let offset = 0, after = keyOf(op.id);
            for (const part of block.parts ?? [block]) {
                const end = offset + part.chars.length;
                if (offset >= pos.o && part.marker !== block.marker && part.marker.id !== left.id) {
                    this.emit([{t: "set", at: this.next(), ids: [part.marker.id], key: "$join", value: {into: keyOf(op.id), after}}]);
                    after = part.marker.key;
                }
                offset = end;
            }
        }
    }

    /** 블록을 앞 글 블록에 합친다 = 그 블록의 표지를 지운다. 앞이 글자를 받지 않는 블록이면 하지 않는다 */
    private merge(at: ModelPath): void {
        const ref = this.ref(at);

        if (ref.kind !== "block" || ref.flat === 0) {
            return;
        }

        const blocks = this.doc.blocks(ref.line);
        const block = blocks[ref.b];
        const prev = blocks[visibleBlocks(this.doc, ref.line, this.batch.vacant)[ref.flat - 1]];

        if (block.kind !== "text" || block.virtual || prev?.kind !== "text" || !this.doc.takesText(prev.type)) {
            return;
        }

        if (this.doc.hasMoves) {
            let after = (prev.parts?.at(-1) ?? prev).marker.key;
            for (const part of block.parts ?? [block]) {
                this.emit([{t: "set", at: this.next(), ids: [part.marker.id], key: "$join", value: {into: prev.marker.key, after}}]);
                after = part.marker.key;
            }
        } else this.emit([{t: "del", at: this.next(), ids: [block.marker.id, ...block.aliases.map(a => a.id)]}]);
    }
}

/** 편집 연산 묶음 → 전선 연산 (바로 적용된다) */
export const compileEdits = (doc: Doc, ops: EditOp[]): Op[] => {
    const compiler = new Compiler(doc);

    ops.forEach(op => compiler.compile(op));
    compiler.finish();

    return compiler.out;
};
