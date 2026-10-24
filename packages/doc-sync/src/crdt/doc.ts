import {parseJoin, parseSplitBoundary, parseTextStorage, textTicket} from "./text-storage.ts";
import type {TextAddress, JoinValue} from "./text-storage.ts";
import {ANNOTATION_HEAD, ANNOTATION_HEAD_KEY, ANNOTATION_SLOT, ANNOTATION_TYPE, annotationEndpointKeys, annotationJsonOk, validateAnnotationAttributes, validateAnnotationAttribute} from "./annotations.ts";
import {parseRequired, requiredTicket, requiredType} from "./cardinality.ts";
import type {RequiredAddress} from "./cardinality.ts";
import {decodeFieldKey, encodeFieldKey, fieldSpecAt, fieldValueOk, flattenFieldPatch, isFieldSpec, materializeFields} from "./fields.ts";
import {Placements} from "./placement.ts";
import {KeyIndex} from "./key-index.ts";
import type {MoveOp, Placement, PlacementProjection} from "./placement.ts";
import {compileEdits, resolvePath} from "./edit.ts";
import {applyEdits, canonMarks, canonical, canonicalWithTextCache, diffModels, unitsToRuns, withGroupBoundary} from "./model.ts";
import {acceptsText, attrValueOk, checkSchema, gridParts, groupOf, inlineTypes, storedTypes} from "./schema.ts";
import {Clock, ROOT, compareTicket, keyOf, ticketOf} from "./ticket.ts";
import type {EditOp, Marks, NodeJSON, Run, Unit} from "./model.ts";
import type {FlowSpec, NodeSpec, Schema, Shape, TextSpec} from "./schema.ts";
import type {Ticket} from "./ticket.ts";

export type {EditOp, Marks, ModelPath, NodeJSON, Run} from "./model.ts";

/**
 * Doc — 문서를 "토큰 줄"들로 들고 있는 CRDT.
 *
 * ── 저장 (스키마를 모른다) ──
 * 줄(line)은 RGA 순서를 가진 토큰 목록이다. 토큰은 셋이다.
 *   - 글자 토큰: 한 글자. 서식은 글자마다의 LWW 속성
 *   - 노드 토큰: 종류 이름 하나와 LWW 속성들. 흐름 줄에서는 "여기서 블록이 시작한다"는 표지다
 *   - 머리 토큰: 줄 맨 앞. 모든 복제본이 같은 이름표로 만든다
 * 줄은 본문 하나와, 노드마다 이름 붙은 자리(slot)들이 있다: `body`(상자의 안), `rows`·`cols`(표의 행·열),
 * `cell:행,열`(표의 칸). 자리의 머리 이름표는 주인 노드 이름표와 자리 이름에서 정해지므로 따로 만드는 연산이 없다.
 * 연산은 다섯뿐이다 — 글자 넣기, 노드 넣기, 지우기, 지우기 취소, 속성 쓰기. 무엇을 넣든 "어느 토큰 뒤"만 말한다.
 * 트리를 자르거나 노드를 옮기는 연산이 없다.
 *
 * ── 모델 (스키마를 읽는다) ──
 * 블록 구조는 저장하지 않는다. 살아 있는 토큰을 읽어 스키마의 "모양"(text·flow·grid·atom)대로 그때그때 계산한다.
 * Enter 는 text 표지 하나 넣기, 문단 합치기는 표지 하나 지우기, 표는 행 줄 × 열 줄이다.
 *
 * ── 검사 ──
 * 서버는 변경을 적용하기 전에 스키마로 검사한다. 검사는 "바뀌지 않는 사실"만 본다 — 토큰이 어느 줄에 있는지, 노드가
 * 태어날 때 무슨 종류였는지. 지금 상태(지금 종류·살았나)는 복제본마다 다를 수 있어서, 그것으로 거절하면 이미 자기
 * 화면에 적용한 참여자와 서버가 갈라진다.
 */

/** 전선으로 오가는 연산 */
export type Op =
    | MoveOp
    /** 글자 n 개. 이름표는 id, id+1, … (lamport 연속), 각 글자의 기준은 바로 앞 글자다. marks 는 태어날 때의 서식 */
    | {t: "text"; id: Ticket; origin: Ticket; text: string; marks?: Record<string, unknown>}
    /**
     * 노드 하나. 흐름 줄의 text 노드는 boundary(만든 쪽이 본 왼쪽·오른쪽 토큰)를 가진다 — 같은 경계의 동시 Enter 를 한 줄로 본다.
     * 표의 행은 스키마가 정한 행 종류(table-row), 열은 type "col" 인 노드다.
     */
    | {t: "node"; id: Ticket; origin: Ticket; type: string; boundary?: string; attrs?: Record<string, unknown>}
    /** 토큰 지우기. 같은 at 으로 나중에 취소할 수 있다 */
    | {t: "del"; at: Ticket; ids: Ticket[]}
    /** 지정한 지우기(cancels)만 취소한다. 남이 동시에 한 지우기는 그대로 남는다 */
    | {t: "undel"; at: Ticket; cancels: Ticket[]; ids: Ticket[]}
    /** 속성 쓰기 — 노드 속성·글자 서식·text 블록의 종류("$type"). 토큰마다·키마다 마지막 쓰기가 이긴다 */
    | {t: "set"; at: Ticket; ids: Ticket[]; key: string; value: unknown};

type Lww<T> = {value: T; at: Ticket};

export type Line = {
    /** 머리 토큰의 이름표 키 */
    key: string;
    /** 이 줄을 가진 노드 (본문은 null) */
    owner: Item | null;
    slot: string;
    /** 줄 순서대로의 토큰 (죽은 것 포함). 0 번은 머리 */
    items: Item[];
    /**
     * 이 줄에 토큰을 넣은 횟수. 토큰은 끼워 넣기로만 밀리고(빼기는 GC 압축뿐) 한 번에 한 칸씩 밀리므로,
     * 토큰이 기억한 자리(Item.index)는 그 뒤로 넣은 횟수만큼만 오른쪽으로 틀릴 수 있다
     */
    inserted: number;
};

export type Item = {
    id: Ticket;
    key: string;
    /** 넣을 때의 왼쪽 기준 토큰. 머리만 null */
    origin: string | null;
    kind: "char" | "node" | "head";
    ch: string;
    /** 노드가 태어날 때의 종류 — 바뀌지 않는다. 검사는 이것만 본다 */
    born: string;
    /** text 노드: 만든 쪽이 본 경계. 흐름 줄의 머리는 "root" */
    boundary: string;
    /** 노드: 속성과 "$type", 글자: 서식 (모두 LWW) */
    attrs: Map<string, Lww<unknown>>;
    /** 나를 지운 연산들의 이름표 */
    dels: Set<string>;
    /** 취소된 지우기 연산들의 이름표 */
    cancels: Set<string>;
    /**
     * GC 로 압축된 묘비. 내용과 기록은 버리고 자리만 남는다. span 은 이 토큰이 대신하는 글자 수
     * (연달아 친 글자의 묘비는 하나로 합친다).
     */
    compact: boolean;
    span: number;
    line: Line;
    /** 줄 안 자리를 마지막으로 안 값과 그때의 Line.inserted — 자리 찾기용 기억. 틀릴 수 있어 쓸 때 맞춰 본다 */
    index?: number;
    indexAt?: number;
};

/** 압축된 묘비이거나, 지운 연산이 하나라도 취소되지 않고 남아 있으면 죽은 토큰이다 */
export const isAlive = (item: Item): boolean => {
    if (item.compact) {
        return false;
    }

    for (const d of item.dels) {
        if (!item.cancels.has(d)) {
            return false;
        }
    }

    return true;
};

const isHead = (item: Item): boolean => item.boundary === "root" || item.kind === "head";

type BlockBase = {marker: Item; type: string; attrs: Record<string, unknown>};

export type TextBlock = BlockBase & {
    kind: "text";
    /** 같은 경계에서 동시에 만들어져 이 블록에 흡수된 표지들 */
    aliases: Item[];
    /** 표·구분선 바로 뒤에 저절로 생긴 빈 자리. 자기 표지가 없고, marker 는 그 표·구분선이다 */
    virtual: boolean;
    chars: Item[];
    text: string;
    /** Physical fragments retained by logical joins and movement. */
    parts?: TextBlock[];
};

export type GridBlock = BlockBase & {
    kind: "grid";
    rows: Item[];
    cols: Item[];
    /** 합친 칸: "행,열"(번호) → [rowspan, colspan] — 왼쪽 위 칸만 */
    spans: Map<string, [number, number]>;
    /** 가려진 칸: "행,열" → 그 칸을 덮은 왼쪽 위 칸 [행, 열] */
    covered: Map<string, [number, number]>;
};

/** 칸 합치기 값 — 왼쪽 위 칸에서 끝 행·끝 열까지 (이름표로). null 이면 나눔 */
export type SpanValue = {row: string; col: string} | null;

/** 표 노드에 칸 합치기를 적는 속성 키 — 왼쪽 위 칸마다 하나 */
export const cellAttrKey = (row: Item | string, col: Item | string, name: string): string =>
    `$cell:${typeof row === "string" ? row : row.key},${typeof col === "string" ? col : col.key}|${name}`;

const CELL_ATTR = /^\$cell:([^,]+),([^|]+)\|(.+)$/;

export const spanKey = (row: Item | string, col: Item | string): string =>
    `$span:${typeof row === "string" ? row : row.key},${typeof col === "string" ? col : col.key}`;

export type FlowBlock = BlockBase & {kind: "flow"; body: string};

export type AtomBlock = BlockBase & {kind: "atom"};

export type Block = TextBlock | GridBlock | FlowBlock | AtomBlock;

/** 화면 위치. 줄(없으면 본문) + 줄 안 블록 번호 + 블록 안 글자 자리 */
export type Pos = {line?: string; b: number; o: number};

/** 본문 줄의 키 */
export const MAIN = keyOf(ROOT);

const lineKeyOf = (pos: {line?: string}): string => pos.line ?? MAIN;

const posIn = (line: string, b: number, o: number): Pos => (line === MAIN ? {b, o} : {line, b, o});

/** 자리 머리의 이름표 — 주인 노드와 자리 이름에서 정해진다 */
export const slotTicket = (owner: Ticket | string, slot: string): Ticket => ({
    lamport: 0,
    actor: `${typeof owner === "string" ? owner : keyOf(owner)}/${slot}`,
});

export const slotKey = (owner: Ticket | string, slot: string): string => keyOf(slotTicket(owner, slot));

export const cellSlot = (row: Item | string, col: Item | string): string =>
    `cell:${typeof row === "string" ? row : row.key},${typeof col === "string" ? col : col.key}`;

const parseSlot = (key: string): {owner: string; slot: string} | null => {
    const match = /^0@([^/]+)\/(.+)$/.exec(key);

    return match ? {owner: match[1], slot: match[2]} : null;
};

/** 검사가 보는 바뀌지 않는 사실 */
type Fact = {kind: Item["kind"]; born: string; head: boolean; line: {key: string; slot: string; ownerBorn: string | null}};

/**
 * 스냅숏 속 토큰 하나. 기본값은 적지 않는다.
 *   i 이름표 키 (없으면 줄의 바로 앞 토큰 다음 번호 — 같은 참여자가 이어 친 글자, 토큰의 약 9할) · o 기준 (없으면 같은 참여자의 바로 앞 이름표 — 이어 친 글자, null 이면 머리) · k 종류 (없으면 글자, n 노드, h 축 머리)
 *   c 글자 · b 태어난 종류 · y 경계 · a 속성 [이름, 값, 쓴 이름표 키] · d 지우기 · x 취소된 지우기 · z 압축됨 · s 묶음 길이 (없으면 1)
 */
type ItemJSON = {
    i?: string;
    o?: string | null;
    k?: "n" | "h";
    c?: string;
    b?: string;
    y?: string;
    a?: Array<[string, unknown, string]>;
    d?: string[];
    x?: string[];
    z?: 1;
    s?: number;
};

export type Snapshot = {format?: 2; capabilities?: string[]; moves?: MoveOp[]; lamport: number; lines: Array<{key: string; owner: string | null; slot: string; items: ItemJSON[]}>};

/**
 * 줄 하나의 블록 목록과, 글자 하나만 바뀌었을 때 고쳐 쓰기 위한 찾아보기.
 * Internal references point to the current immutable text block, including virtual blocks.
 */
type TextRef = {block: TextBlock};
type BlockCache = {blocks: Block[]; of: Map<Item, TextRef>; byMarker: Map<Item, TextRef>};

const charOf = (item: Item): string => (item.kind === "char" ? item.ch : "\ufffc");

/** 글자를 지나 왼쪽 산 토큰을 찾을 때 이만큼 넘게 묘비를 건너야 하면 줄을 통째로 다시 계산한다 */
const MAX_TOMBSTONE_WALK = 512;

const ACTOR = /^[\w~-]+$/;

/**
 * 비어 있는 그릇 — 토큰 대부분은 서식·지우기 기록이 없으므로 모두 이 공유 그릇을 가리키고, 처음 쓸 때 제 것을 만든다.
 * 공유 그릇에 쓰면 모든 토큰이 함께 바뀌므로, 쓰려 하면 바로 오류를 낸다 (빠뜨린 쓰기를 시험에서 잡도록).
 */
class EmptyMap<K, V> extends Map<K, V> {
    set(): this {
        throw new Error("공유 빈 그릇에 쓰려 했다 — attrsFor 를 써야 한다");
    }

    delete(): boolean {
        throw new Error("공유 빈 그릇에 쓰려 했다");
    }

    clear(): void {
        throw new Error("공유 빈 그릇에 쓰려 했다");
    }
}

class EmptySet<T> extends Set<T> {
    add(): this {
        throw new Error("공유 빈 그릇에 쓰려 했다 — delsFor·cancelsFor 를 써야 한다");
    }

    delete(): boolean {
        throw new Error("공유 빈 그릇에 쓰려 했다");
    }

    clear(): void {
        throw new Error("공유 빈 그릇에 쓰려 했다");
    }
}

const NO_ATTRS: Map<string, Lww<unknown>> = new EmptyMap();
const NO_DELS: Set<string> = new EmptySet();

const attrsFor = (item: Item): Map<string, Lww<unknown>> => (item.attrs === NO_ATTRS ? (item.attrs = new Map()) : item.attrs);
const delsFor = (item: Item): Set<string> => (item.dels === NO_DELS ? (item.dels = new Set()) : item.dels);
const cancelsFor = (item: Item): Set<string> => (item.cancels === NO_DELS ? (item.cancels = new Set()) : item.cancels);

/** 기억한 자리에서 이만큼까지는 오른쪽으로 찾아본다. 더 멀면 줄 전체를 다시 적는다 */
const MAX_DRIFT = 256;
/** 큰 문자열은 글자마다 블록 배열을 복사하지 않고, 다음 읽기 때 줄을 한 번 계산한다. */
const MAX_INCREMENTAL_TEXT = 256;

const newItem = (id: Ticket, origin: string | null, kind: Item["kind"], line: Line): Item => ({
    id,
    key: keyOf(id),
    origin,
    kind,
    ch: "",
    born: "",
    boundary: "",
    attrs: NO_ATTRS,
    dels: NO_DELS,
    cancels: NO_DELS,
    compact: false,
    span: 1,
    line,
});

export class Doc {
    readonly clock: Clock;
    /** 스키마. 없으면 저장·적용·GC 만 한다 (서버가 스키마 없이 돌 때) */
    readonly schema: Schema | null;
    /** 머리 키 → 줄. 본문이 맨 앞 */
    private readonly lineMap = new Map<string, Line>();
    /** 이름표 → 토큰. 압축으로 합쳐진 글자의 이름표는 그것을 대신하는 묶음 토큰을 가리킨다 */
    private readonly byKey = new KeyIndex<Item>();
    private blockCache = new Map<string, BlockCache>();
    /** 구조를 다시 읽을 때 같은 문단을 재사용한다. 줄마다 마지막 캐시 하나만 보관한다. */
    private previousBlocks = new Map<string, BlockCache>();
    /** 시험용 — 켜면 블록 목록 캐시를 쓸 때마다 처음부터 다시 계산해 맞춰 본다 (느리다) */
    static verifyBlocks = false;
    private posCache = new Map<string, Map<Item, {b: number; o: number}>>();
    private visibleCache = new Map<string, boolean>();
    private modelCache: NodeJSON | null = null;
    private textModels = new WeakMap<TextBlock, NodeJSON>();
    private canonicalTexts = new WeakMap<NodeJSON, NodeJSON>();
    private revision = 0;
    private readonly placements = new Placements();
    private readonly movementPriors = new WeakMap<Op, {parent: Ticket; after: Ticket | null; at: Ticket}>();

    constructor(actor: string, schema: Schema | null = null) {
        if (schema && Object.values(schema.nodes).some(spec => spec.shape === "flow" && spec.childRules !== undefined)) {
            const problems = checkSchema(schema);
            if (problems.length) throw new Error(`Invalid cardinality schema: ${problems.join("; ")}`);
        }
        this.clock = new Clock(actor);
        this.schema = schema;

        const main: Line = {key: MAIN, owner: null, slot: "", items: [], inserted: 0};
        const root = newItem(ROOT, null, "node", main);

        root.boundary = "root";
        main.items.push(root);
        this.lineMap.set(MAIN, main);
        this.byKey.set(root.key, root);
    }

    get actor(): string {
        return this.clock.actor;
    }

    /** 적용·압축마다 바뀌는 번호. 커서·presence처럼 문서를 바꾸지 않는 갱신과 구분한다. */
    get version(): number {
        return this.revision;
    }

    /** 본문 줄의 토큰 */
    get items(): Item[] {
        return this.lineMap.get(MAIN)!.items;
    }

    /** 모든 줄 (본문이 맨 앞) */
    lines(): Line[] {
        return [...this.lineMap.values()];
    }

    /** 토큰 찾기. 자리 머리는 처음 찾을 때 만든다 (모든 복제본에서 같은 이름표) */
    get(key: string): Item | undefined {
        const found = this.byKey.get(key);

        if (found) {
            return found;
        }

        if (key === ANNOTATION_HEAD_KEY) {
            const line: Line = {key, owner: this.byKey.get(MAIN)!, slot: ANNOTATION_SLOT, items: [], inserted: 0};
            const head = newItem(ANNOTATION_HEAD, null, "head", line);
            head.boundary = "root"; line.items.push(head); this.lineMap.set(key, line); this.byKey.set(key, head);
            return head;
        }
        const textAddress = parseTextStorage(key);
        if (textAddress) return this.textStorageItem(textAddress);
        const required = parseRequired(key);
        if (required) return this.requiredItem(required, key);
        const parsed = parseSlot(key);
        const owner = parsed && this.byKey.get(parsed.owner);

        if (!parsed || !owner || owner.kind !== "node" || isHead(owner) || !this.slotOk(owner, parsed.slot)) {
            return undefined;
        }

        const axis = parsed.slot === "rows" || parsed.slot === "cols";
        const line: Line = {key, owner, slot: parsed.slot, items: [], inserted: 0};
        const head = newItem(slotTicket(owner.key, parsed.slot), null, axis ? "head" : "node", line);

        head.boundary = "root";
        line.items.push(head);
        this.lineMap.set(key, line);
        this.byKey.set(key, head);

        return head;
    }

    /** 자리 이름이 맞는가 (칸이면 그 행·열이 이 표의 것인가). 스키마가 있으면 주인 모양도 본다 */
    private slotOk(owner: Item, slot: string): boolean {
        const shape = this.schema ? this.schema.nodes[owner.born]?.shape : undefined;

        if (slot === "body") {
            return !this.schema || shape === "flow";
        }

        if (slot === "rows" || slot === "cols") {
            return !this.schema || shape === "grid";
        }

        const cell = /^cell:([^,]+),(.+)$/.exec(slot);

        if (!cell || (this.schema && shape !== "grid")) {
            return false;
        }

        const row = this.byKey.get(cell[1]);
        const col = this.byKey.get(cell[2]);

        return row?.line.key === slotKey(owner.key, "rows") && col?.line.key === slotKey(owner.key, "cols") && !isHead(row) && !isHead(col);
    }

    // ── 연산 검사 · 적용 ─────────────────────────────────────────────────

    /**
     * 연산들을 적용하기 전에 검사한다. 앞 연산이 만든 토큰을 뒤 연산이 기준으로 삼을 수 있으므로 차례로 본다.
     * 서버는 이 검사를 통과한 변경만 받아들인다 — 반쯤 적용된 채 거절되는 일이 없다.
     *
     * @returns 문제가 있으면 그 설명, 없으면 null
     */
    check(ops: Op[]): string | null {
        const created = new Map<string, Fact>();
        const stagedMoves = new Map<string, MoveOp>();
        const births = new Map<string, string>();
        const birthConflict = (id: Ticket, kind: "node" | "char", origin: string, born = "", boundary = "", ch = ""): boolean => {
            const key = keyOf(id), signature = JSON.stringify([kind, origin, born, boundary, ch]);
            const prior = births.get(key);
            if (prior !== undefined && prior !== signature) return true;
            const stored = this.byKey.get(key);
            if (stored) {
                const physicalOrigin = stored.kind === "char" && key !== stored.key ? keyOf({lamport: id.lamport - 1, actor: id.actor}) : stored.origin;
                if (isHead(stored) || stored.kind !== kind || physicalOrigin !== origin || stored.born !== born || stored.boundary !== boundary || kind === "char" && !stored.compact && stored.ch !== ch) return true;
            }
            births.set(key, signature); return false;
        };
        const schema = this.schema;

        const factOf = (key: string): Fact | undefined => {
            const item = this.byKey.get(key);

            if (item) {
                return {
                    kind: item.kind,
                    born: item.born,
                    head: isHead(item),
                    line: {key: item.line.key, slot: item.line.slot, ownerBorn: item.line.owner?.born ?? null},
                };
            }

            if (created.has(key)) {
                return created.get(key);
            }

            if (key === ANNOTATION_HEAD_KEY) return {kind: "head", born: "", head: true, line: {key, slot: ANNOTATION_SLOT, ownerBorn: null}};
            const textAddress = parseTextStorage(key);
            if (textAddress) {
                const parent = factOf(textAddress.parent), after = textAddress.after && (this.placements.get(textAddress.after) || factOf(textAddress.after));
                const flow = parent && parent.head && this.flowSpecOf(parent.line);
                if (!flow) return undefined;
                if (textAddress.detached) {
                    if (!textAddress.after || !/^\d+@[\w~-]+$/.test(textAddress.after) || !Number.isSafeInteger(ticketOf(textAddress.after).lamport)) return undefined;
                } else if (textAddress.after) {
                    const placement = this.placements.get(textAddress.after) ?? stagedMoves.get(textAddress.after);
                    const anchor = placement ? factOf(keyOf(placement.target)) : factOf(textAddress.after);
                    if (!anchor || !["flow", "grid", "atom"].includes(schema?.nodes[anchor.born]?.shape ?? "") || (placement ? keyOf(placement.parent) !== textAddress.parent : anchor.line.key !== textAddress.parent)) return undefined;
                }
                return {kind: "node", born: flow.default, head: true, line: {...parent!.line, key}};
            }
            const required = parseRequired(key);
            if (required && schema) {
                const parent = factOf(required.parent);
                const flow = parent && this.flowSpecOf(parent.line);
                const rule = flow?.childRules?.[required.type];
                if (!parent?.head || !rule || required.ordinal >= (rule.min ?? 0)) return undefined;
                const type = requiredType(schema, required.type);
                const shape = schema.nodes[type]?.shape;
                const lamport = ticketOf(key).lamport, privateKey = keyOf(requiredTicket(required));
                if (lamport === 0) return {kind: "node", born: shape === "text" ? type : flow!.default, head: true, line: {...parent!.line, key: privateKey}};
                if (lamport === 1 && ["flow", "grid", "atom"].includes(shape ?? "")) return {kind: "node", born: type, head: false, line: {...parent!.line, key: privateKey}};
                if ((lamport === 2 || lamport === 3) && shape === "grid") {
                    const owner = keyOf(requiredTicket(required, true)), parts = gridParts(schema, type)!;
                    const slot = lamport === 2 ? "rows" : "cols";
                    return {kind: "node", born: lamport === 2 ? parts.row : "col", head: false, line: {key: slotKey(owner, slot), slot, ownerBorn: type}};
                }
                return undefined;
            }
            const parsed = parseSlot(key);
            const owner = parsed && factOf(parsed.owner);

            if (!parsed || !owner || owner.kind !== "node" || owner.head) {
                return undefined;
            }

            const shape = schema?.nodes[owner.born]?.shape;
            const cell = /^cell:([^,]+),(.+)$/.exec(parsed.slot);
            const ok =
                parsed.slot === "body"
                    ? !schema || shape === "flow"
                    : parsed.slot === "rows" || parsed.slot === "cols"
                      ? !schema || shape === "grid"
                      : !!cell &&
                        (!schema || shape === "grid") &&
                        factOf(cell[1])?.line.key === slotKey(parsed.owner, "rows") &&
                        factOf(cell[2])?.line.key === slotKey(parsed.owner, "cols");

            return ok
                ? {
                      kind: parsed.slot === "rows" || parsed.slot === "cols" ? "head" : "node",
                      born: "",
                      head: true,
                      line: {key, slot: parsed.slot, ownerBorn: owner.born},
                  }
                : undefined;
        };
        const isAxis = (slot: string) => slot === "rows" || slot === "cols";
        const referenceExists = (key: string): boolean => {
            const fact = factOf(key);
            return !!fact && fact.line.slot !== ANNOTATION_SLOT && !isAxis(fact.line.slot) && fact.born !== ANNOTATION_TYPE;
        };
        const textShaped = (f: Fact) => (f.head ? !isAxis(f.line.slot) : schema?.nodes[f.born]?.shape === "text");

        const safeTicket = (ticket: Ticket): boolean => Number.isSafeInteger(ticket.lamport) && ticket.lamport >= 0 && typeof ticket.actor === "string" && ticket.actor.length > 0;
        for (const op of ops) {
            const stamp = "id" in op ? op.id : op.at;
            if (!safeTicket(stamp) || op.t === "text" && !Number.isSafeInteger(op.id.lamport + op.text.length - 1)) return "Invalid operation Lamport identity";
            if (op.t === "move") {
                if (![op.target, op.parent, ...(op.after ? [op.after] : [])].every(safeTicket)) return "Invalid movement reference identity";
                const target = factOf(keyOf(op.target));
                const parentFact = factOf(keyOf(op.parent));
                const parent = parentFact?.head && !parseTextStorage(parentFact.line.key) && !parseRequired(parentFact.line.key) && parentFact.line.slot !== ANNOTATION_SLOT && !isAxis(parentFact.line.slot) ? this.flowSpecOf(parentFact.line) : undefined;
                const shape = target && (target.head ? "text" : schema?.nodes[target.born]?.shape);
                if (target && parseRequired(target.line.key)) return "Required slots have fixed ownership";
                if (!target || target.line.slot === ANNOTATION_SLOT || isAxis(target.line.slot) || !["text", "flow", "grid", "atom"].includes(shape ?? "")) return "Move target must be a text, flow, grid, or atom block";
                if (!parentFact || !parent) return "Move destination must be an existing flow head";
                if (schema && !storedTypes(schema, parent).includes(target.head ? this.flowSpecOf(target.line)?.default ?? "" : target.born)) return "Move destination does not accept the target birth type";
                if (op.after) {
                    const placement = this.placements.get(keyOf(op.after)) ?? stagedMoves.get(keyOf(op.after));
                    const anchor = factOf(keyOf(op.after));
                    const anchorLine = anchor && (parseRequired(anchor.line.key)?.parent ?? parseTextStorage(anchor.line.key)?.parent ?? anchor.line.key);
                    if (placement ? keyOf(placement.parent) !== keyOf(op.parent) : !anchor || anchorLine !== keyOf(op.parent) || anchor.kind === "char") return "Move anchor belongs to another flow";
                }
                if (compareTicket(op.at, op.target) <= 0 || op.after && compareTicket(op.at, op.after) <= 0) return "Move identity must follow its references";
                if (!ACTOR.test(op.at.actor)) return "Invalid movement actor";
                const previous = this.placements.get(keyOf(op.at)) ?? stagedMoves.get(keyOf(op.at));
                if (previous && JSON.stringify(previous) !== JSON.stringify(op)) return "Conflicting movement identity";
                stagedMoves.set(keyOf(op.at), op);
                continue;
            }

            if (op.t === "text" || op.t === "node") {
                const origin = factOf(keyOf(op.origin));

                if (!origin) {
                    return `기준 토큰 ${keyOf(op.origin)} 이 없다`;
                }

                if (!ACTOR.test(op.id.actor)) {
                    return `참여자 이름 "${op.id.actor}" 는 쓸 수 없다`;
                }

                const line = origin.line;
                if (op.t === "node") {
                    if (birthConflict(op.id, "node", keyOf(op.origin), op.type, op.boundary ?? "")) return "Conflicting token birth identity";
                } else {
                    for (let i = 0; i < op.text.length; i++) {
                        const id = {lamport: op.id.lamport + i, actor: op.id.actor};
                        const source = i ? keyOf({lamport: id.lamport - 1, actor: id.actor}) : keyOf(op.origin);
                        if (birthConflict(id, "char", source, "", "", op.text[i])) return "Conflicting token birth identity";
                    }
                }
                if (line.slot === ANNOTATION_SLOT || op.t === "node" && op.type === ANNOTATION_TYPE) {
                    if (op.t !== "node" || line.key !== ANNOTATION_HEAD_KEY || op.type !== ANNOTATION_TYPE) return "Annotation storage accepts annotation nodes only";
                    const problem = validateAnnotationAttributes(op.attrs, referenceExists);
                    if (problem) return problem;
                    created.set(keyOf(op.id), {kind: "node", born: ANNOTATION_TYPE, head: false, line});
                    continue;
                }

                if (op.t === "text") {
                    if (!op.text.length) {
                        return "빈 글자 넣기";
                    }

                    if (isAxis(line.slot)) {
                        return "행·열 줄에는 글자를 넣을 수 없다";
                    }

                    const bad = Object.entries(op.marks ?? {}).find(([k, v]) => schema && !this.markOk(k, v));

                    if (bad) {
                        return `스키마에 없는 서식 "${bad}"`;
                    }

                    const flow = schema ? this.flowSpecOf(line) : undefined;

                    if (schema && flow && !acceptsText(schema, flow)) {
                        return "여기에는 글자를 넣을 수 없다";
                    }

                    for (let i = 0; i < op.text.length; i += 1) {
                        created.set(keyOf({lamport: op.id.lamport + i, actor: op.id.actor}), {kind: "char", born: "", head: false, line});
                    }

                    continue;
                }

                if (isAxis(line.slot)) {
                    const parts = schema && line.ownerBorn !== null ? gridParts(schema, line.ownerBorn) : null;
                    const want = line.slot === "cols" ? "col" : (parts?.row ?? null);

                    if (want !== null && op.type !== want) {
                        return `${line.slot} 줄에는 ${want} 만 넣는다`;
                    }
                } else if (schema) {
                    const flow = this.flowSpecOf(line);

                    if (!flow || ![...storedTypes(schema, flow), ...inlineTypes(schema, flow)].includes(op.type)) {
                        return `여기에는 "${op.type}" 를 넣을 수 없다`;
                    }

                    const spec = schema.nodes[op.type];

                    for (const [k, v] of Object.entries(op.attrs ?? {})) {
                        if (!spec.attrs?.[k] || isFieldSpec(spec.attrs[k]) || !attrValueOk(spec.attrs[k], v)) {
                            return `"${op.type}" 의 속성 ${k}=${JSON.stringify(v)} 이 맞지 않는다`;
                        }
                    }

                    if (spec.shape === "text" && typeof op.boundary !== "string") {
                        return "text 노드에는 경계가 있어야 한다";
                    }
                }

                created.set(keyOf(op.id), {kind: "node", born: op.type, head: false, line});
                continue;
            }

            const targets = op.ids.map(id => factOf(keyOf(id)));

            if (targets.some(f => !f)) {
                return "없는 토큰을 가리킨다";
            }

            if ((op.t === "del" || op.t === "undel") && targets.some((f, i) => f!.kind === "head" || f!.line.slot === ANNOTATION_SLOT && f!.head || parseRequired(keyOf(op.ids[i])))) {
                return "줄 머리는 지울 수 없다";
            }

            if (targets.some(f => f!.line.slot === ANNOTATION_SLOT)) {
                if (targets.some(f => f!.head || f!.born !== ANNOTATION_TYPE)) return "Reserved annotation head is immutable";
                if (op.t === "set") {
                    const problem = validateAnnotationAttribute(op.key, op.value, referenceExists);
                    if (problem) return problem;
                }
                if (targets.some(f => f!.line.slot !== ANNOTATION_SLOT)) return "Annotation operations cannot mix content targets";
                continue;
            }
            if (op.t !== "set" || !schema) {
                continue;
            }

            for (const [i, target] of (targets as Fact[]).entries()) {
                if (op.key === "$join") {
                    const value = op.value === null ? null : parseJoin(op.value);
                    const into = value && factOf(value.into), after = value && factOf(value.after);
                    if (!textShaped(target) || op.value !== null && (!value || !into || !after || !textShaped(into) || !textShaped(after) || into.line.slot === ANNOTATION_SLOT || after.line.slot === ANNOTATION_SLOT)) return "Invalid logical text join";
                } else if (op.key.startsWith("$cell:")) {
                    // 칸 속성: 표 노드에만, 이 표의 행·열, 칸 종류가 받는 (계산하지 않는) 속성이어야 한다
                    const owner = keyOf(op.ids[i]);
                    const [, rowKey, colKey, name] = CELL_ATTR.exec(op.key) ?? [];
                    const parts = gridParts(schema, target.born);
                    const decoded = name?.startsWith("$field:") ? decodeFieldKey(name) : null;
                    const branch = parts ? schema.nodes[parts.cell]?.attrs?.[decoded?.attr ?? name] : undefined;
                    const spec = decoded && branch ? fieldSpecAt(branch, decoded.path) : branch;

                    if (
                        !spec ||
                        factOf(rowKey ?? "")?.line.key !== slotKey(owner, "rows") ||
                        factOf(colKey ?? "")?.line.key !== slotKey(owner, "cols") ||
                        (name?.startsWith("$field:") ? !decoded || !fieldValueOk(spec, op.value) : isFieldSpec(spec) || !attrValueOk(spec, op.value))
                    ) {
                        return `칸 속성 ${name ?? op.key}=${JSON.stringify(op.value)} 이 맞지 않는다`;
                    }
                } else if (op.key.startsWith("$field:")) {
                    const decoded = decodeFieldKey(op.key);
                    const shape: Shape | undefined = textShaped(target) ? "text" : schema.nodes[target.born]?.shape;
                    const ok = target.kind !== "char" && decoded && Object.values(schema.nodes).some(candidate => {
                        const branch = candidate.shape === shape ? candidate.attrs?.[decoded.attr] : undefined;
                        const leaf = branch && fieldSpecAt(branch, decoded.path);
                        return !!leaf && fieldValueOk(leaf, op.value);
                    });
                    if (!ok) return "Invalid nested field path or value";
                } else if (op.key.startsWith("$span:")) {
                    // 칸 합치기: 표 노드에만, 왼쪽 위·끝이 모두 이 표의 행·열이어야 한다
                    const owner = keyOf(op.ids[i]);
                    const [rowKey, colKey] = op.key.slice(6).split(/,(.+)/);
                    const rowOk = (k: unknown) => typeof k === "string" && factOf(k)?.line.key === slotKey(owner, "rows");
                    const colOk = (k: unknown) => typeof k === "string" && factOf(k)?.line.key === slotKey(owner, "cols");
                    const end = op.value as {row?: unknown; col?: unknown} | null;

                    if (schema.nodes[target.born]?.shape !== "grid" || !rowOk(rowKey) || !colOk(colKey) || (end !== null && (!rowOk(end.row) || !colOk(end.col)))) {
                        return "칸 합치기가 이 표의 행·열을 가리키지 않는다";
                    }
                } else if (op.key === "$type") {
                    // null = 태어난 종류(줄 머리면 그 줄의 default)로 — 되돌리기가 쓴다
                    const spec = op.value === null ? null : schema.nodes[String(op.value)];
                    const required = parseRequired(target.line.key);
                    const allowed = required ? op.value === null || op.value === requiredType(schema, required.type) : op.value === null || (spec?.shape === "text" && this.storedIn(target.line).includes(String(op.value)));

                    if (!textShaped(target) || !allowed) {
                        return `종류를 "${String(op.value)}" 로 바꿀 수 없다`;
                    }
                } else if (target.kind === "char") {
                    if (!this.markOk(op.key, op.value)) {
                        return `서식 ${op.key}=${JSON.stringify(op.value)} 이 맞지 않는다`;
                    }
                } else {
                    // 지금 종류는 복제본마다 다를 수 있으니, 같은 모양의 어느 종류든 이 속성을 받으면 통과
                    const shape: Shape | undefined = textShaped(target) ? "text" : schema.nodes[target.born]?.shape;
                    const ok = Object.values(schema.nodes).some(
                        s => s.shape === shape && s.attrs?.[op.key] && !isFieldSpec(s.attrs[op.key]) && attrValueOk(s.attrs[op.key], op.value),
                    );

                    if (!ok) {
                        return `속성 ${op.key}=${JSON.stringify(op.value)} 을 받는 종류가 없다`;
                    }
                }
            }
        }

        return null;
    }

    /**
     * 연산 하나를 적용한다. 내 연산이든 남의 연산이든 같은 길을 탄다.
     * 같은 연산을 두 번 받아도 결과가 같다(멱등) — 재전송에 안전하다.
     * 대상이 압축된 묘비이거나 없는 토큰이면 조용히 지나간다(지우기·속성은 이미 의미가 없다).
     */
    apply(op: Op): void {
        this.modelCache = null;
        this.revision += 1;

        if (this.hasMoves || this.hasCardinality) this.posCache.clear();
        switch (op.t) {
            case "move": {
                this.placements.apply(op);
                this.clock.observe(op.at);
                this.dirty();
                return;
            }
            case "text": {
                if (op.text.length > MAX_INCREMENTAL_TEXT) {
                    const line = this.get(keyOf(op.origin))?.line;

                    if (line) {
                        this.blockCache.delete(line.key);
                        this.posCache.delete(line.key);
                    }
                }

                // 연달아 친 글자는 바로 앞 글자 뒤에 차례로 들어간다 — 기준 자리를 한 번만 찾는다
                let at = -1;

                for (let i = 0; i < op.text.length; i += 1) {
                    const id = {lamport: op.id.lamport + i, actor: op.id.actor};
                    const origin = i === 0 ? keyOf(op.origin) : keyOf({lamport: id.lamport - 1, actor: id.actor});
                    const item = newItem(id, origin, "char", null as unknown as Line);

                    item.ch = op.text[i];
                    Object.entries(op.marks ?? {}).forEach(([k, v]) => attrsFor(item).set(k, {value: structuredClone(v), at: id}));
                    at = this.integrate(item, i === 0 ? -1 : at);
                    // 중복 토큰의 임시 Item은 줄에 들어가지 않는다. 기존 토큰은 캐시에 이미 있다.
                    if (item.line) this.charAdded(item);
                }

                this.clock.observe({lamport: op.id.lamport + op.text.length - 1, actor: op.id.actor});

                return;
            }
            case "node": {
                const item = newItem(op.id, keyOf(op.origin), "node", null as unknown as Line);

                item.born = op.type;
                item.boundary = op.boundary ?? "";
                attrsFor(item).set("$type", {value: op.type, at: op.id});
                Object.entries(op.attrs ?? {}).forEach(([k, v]) => attrsFor(item).set(k, {value: structuredClone(v), at: op.id}));
                this.integrate(item, -1);
                item.line && this.structureChanged(item);
                this.clock.observe(op.id);

                return;
            }
            case "del": {
                const at = keyOf(op.at);

                op.ids.forEach(id => {
                    const item = this.live(id);

                    if (!item) {
                        return;
                    }

                    const was = isAlive(item);

                    delsFor(item).add(at);

                    if (was && !isAlive(item)) {
                        item.kind === "char" || this.isInline(item) ? this.charRemoved(item) : this.structureChanged(item);
                    }
                });
                this.clock.observe(op.at);

                return;
            }
            case "undel": {
                const cancels = op.cancels.map(keyOf);

                op.ids.forEach(id => {
                    const item = this.live(id);

                    if (item) {
                        const was = isAlive(item);

                        cancels.forEach(c => cancelsFor(item).add(c));
                        !was && isAlive(item) && this.structureChanged(item);
                    }
                });
                this.clock.observe(op.at);

                return;
            }
            case "set": {
                op.ids.forEach(id => {
                    const item = this.live(id);
                    const current = item?.attrs.get(op.key);

                    if (item && (!current || compareTicket(op.at, current.at) > 0)) {
                        // 글자 서식은 Block 객체를 바꾸지 않는다. 실제 LWW 쓰기일 때 그 문단의 모델만 비운다.
                        const block = (this.blockCache.get(item.line.key) ?? this.previousBlocks.get(item.line.key))?.of.get(item)?.block;

                        block && this.textModels.delete(block);
                        attrsFor(item).set(op.key, {value: structuredClone(op.value), at: op.at});
                        item.kind !== "char" && this.structureChanged(item);
                    }
                });
                this.clock.observe(op.at);

                return;
            }
        }
    }

    /** 표의 행·열은 표가 있는 줄에 영향을 준다. 다른 구조 변경은 그 줄만 다시 계산한다. */
    private structureChanged(item: Item): void {
        const line = item.line;
        const key = (line.slot === "rows" || line.slot === "cols") && line.owner ? line.owner.line.key : line.key;
        const cache = this.blockCache.get(key);

        cache && this.previousBlocks.set(key, cache);
        this.blockCache.delete(key);
        this.posCache.delete(key);
        // 부모 삭제·복원, 행·열·합치기 변경은 자손과 숨은 줄의 가시성에도 영향을 준다.
        this.visibleCache.clear();
    }

    private dirty(): void {
        this.blockCache.clear();
        this.previousBlocks.clear();
        this.posCache.clear();
        this.visibleCache.clear();
        this.textModels = new WeakMap();
        this.canonicalTexts = new WeakMap();
    }

    /**
     * 새로 들어온 글자(또는 글 안 노드)를 그 줄의 블록 목록에 끼워 넣는다. 왼쪽 산 토큰이 글자면 그 글자 뒤, 블록을 연 표지면
     * 그 블록 맨 앞. 그 밖(흡수된 표지, 표 뒤 가상 자리, 너무 긴 묘비 줄)은 그 줄만 다시 계산한다.
     * 블록 목록은 바꾸지 않고 새로 만든다 — 이미 받아 간 목록을 들고 있는 쪽이 있어도 그 내용은 그대로다.
     */
    private charAdded(item: Item): void {
        const line = item.line;
        const cache = this.blockCache.get(line.key);

        this.posCache.delete(line.key);
        if (this.hasMoves) { this.blockCache.delete(line.key); return; }

        if (!cache || !isAlive(item)) {
            return;
        }

        const items = line.items;
        let i = this.indexOf(item) - 1;
        let walked = 0;

        while (i >= 0 && !isAlive(items[i]) && walked < MAX_TOMBSTONE_WALK) {
            i -= 1;
            walked += 1;
        }

        const left = i >= 0 && walked < MAX_TOMBSTONE_WALK ? items[i] : undefined;
        const inBlock = left && cache.of.get(left)?.block;
        const opened = left && !inBlock ? cache.byMarker.get(left)?.block : undefined;
        const block = inBlock ?? (opened?.virtual ? undefined : opened);

        if (!block) {
            this.blockCache.delete(line.key);

            return;
        }

        const at = inBlock ? block.chars.indexOf(left!) + 1 : 0;

        cache.of.set(item, cache.byMarker.get(block.marker)!);
        this.replaceBlock(cache, block, [...block.chars.slice(0, at), item, ...block.chars.slice(at)], block.text.slice(0, at) + charOf(item) + block.text.slice(at));
    }

    /** 죽은 글자를 그 줄의 블록 목록에서 뺀다. 표 뒤 가상 자리가 비면 그 자리가 사라질 수 있어 그 줄만 다시 계산한다 */
    private charRemoved(item: Item): void {
        const line = item.line;
        const cache = this.blockCache.get(line.key);

        this.posCache.delete(line.key);

        if (!cache) {
            return;
        }

        const block = cache.of.get(item)?.block;
        const at = block ? block.chars.indexOf(item) : -1;

        if (!block || at < 0 || (block.virtual && block.chars.length === 1)) {
            this.blockCache.delete(line.key);

            return;
        }

        cache.of.delete(item);
        this.replaceBlock(cache, block, [...block.chars.slice(0, at), ...block.chars.slice(at + 1)], block.text.slice(0, at) + block.text.slice(at + 1));
    }

    /** 시험용 — 고쳐 쓴 블록 목록이 처음부터 계산한 것과 같은지 */
    private verifyCached(lineKey: string, blocks: Block[]): void {
        const cache = this.blockCache.get(lineKey)!;

        this.blockCache.delete(lineKey);

        const fresh = this.sourceBlocks(lineKey);
        const shape = (list: Block[]) =>
            list.map(b => [b.kind, b.marker.key, b.type, JSON.stringify(b.attrs), ...(b.kind === "text" ? [b.virtual, b.text, b.chars.map(c => c.key).join(","), b.aliases.map(a => a.key).join(",")] : [])].join("|"));
        const got = shape(blocks);
        const want = shape(fresh);

        this.blockCache.set(lineKey, cache);

        if (JSON.stringify(got) !== JSON.stringify(want)) {
            throw new Error(`블록 목록 고쳐 쓰기가 틀렸다 (${lineKey})\n고쳐 쓴 것: ${JSON.stringify(got)}\n다시 계산: ${JSON.stringify(want)}`);
        }
    }

    private replaceBlock(cache: BlockCache, block: TextBlock, chars: Item[], text: string): void {
        const next: TextBlock = {...block, chars, text};
        const blocks = cache.blocks.slice();

        blocks[blocks.indexOf(block)] = next;
        cache.byMarker.get(block.marker)!.block = next;
        cache.blocks = blocks;
    }

    /** 압축되지 않은 토큰만. 압축된 묘비는 더 이상 바뀌지 않는다 */
    private live(id: Ticket): Item | undefined {
        const item = this.get(keyOf(id));

        return item && !item.compact ? item : undefined;
    }

    /**
     * RGA: 기준 토큰이 있는 줄에서, 기준 토큰 바로 뒤. 단 나보다 이름표가 큰 토큰들은 건너뛴다.
     * @param hint 기준 토큰의 자리를 이미 알면 (연달아 친 글자)
     * @returns 들어간 자리
     */
    private integrate(item: Item, hint: number): number {
        const existing = this.byKey.get(item.key);

        if (existing) {
            return this.indexOf(existing);
        }

        const origin = this.get(item.origin!);

        if (!origin) {
            throw new Error(`기준 토큰 ${item.origin} 이 아직 없다 — 인과 순서가 깨졌다`);
        }

        // Share the existing key string. A compacted alias can resolve to a
        // different key, so retain the requested logical ID in that case.
        if (item.origin === origin.key) item.origin = origin.key;
        const line = origin.line;
        let i = (hint >= 0 ? hint : this.indexOf(origin)) + 1;

        while (i < line.items.length && compareTicket(line.items[i].id, item.id) > 0) {
            i += 1;
        }

        item.line = line;
        line.items.splice(i, 0, item);
        line.inserted += 1;
        item.index = i;
        item.indexAt = line.inserted;
        this.byKey.set(item.key, item);

        return i;
    }

    /**
     * 줄 안 자리. 토큰이 기억한 자리가 맞으면 그대로, 아니면 그 뒤로 넣은 횟수만큼 오른쪽을 찾는다.
     * 그래도 없거나 너무 멀면(오래된 기억) 줄 전체의 자리를 다시 적는다 — 넣기 수백 번에 한 번 꼴
     */
    private indexOf(item: Item): number {
        const line = item.line;
        const items = line.items;
        const known = item.index;

        if (known !== undefined) {
            if (items[known] === item) {
                return known;
            }

            const drift = line.inserted - item.indexAt!;

            if (drift <= MAX_DRIFT) {
                for (let i = known + 1, end = Math.min(items.length - 1, known + drift); i <= end; i += 1) {
                    if (items[i] === item) {
                        item.index = i;
                        item.indexAt = line.inserted;

                        return i;
                    }
                }
            }
        }

        this.reindex(line);

        return items[item.index!] === item ? item.index! : -1;
    }

    /** 줄의 모든 토큰에 지금 자리를 적는다 */
    private reindex(line: Line): void {
        const items = line.items;

        for (let i = 0; i < items.length; i += 1) {
            items[i].index = i;
            items[i].indexAt = line.inserted;
        }
    }

    // ── GC: 묘비 압축 ────────────────────────────────────────────────────

    /**
     * 안정된 묘비를 압축한다. 서버가 로그의 정해진 자리에서 지시하므로 모든 복제본이 같은 지점에서 한다.
     *
     * 안정된 묘비 = 죽어 있고, 남아 있는 지우기가 모두 frontier 이하의 서버 번호를 가진 것. 서버는 frontier 를
     * "모두가 받았고, 누구의 되돌리기·다시하기도 그 지우기를 취소할 수 없는" 지점으로 정한다. 그러니 압축된 묘비는
     * 영영 되살아나지 않는다.
     *
     * 묘비를 줄에서 빼지는 않는다 — 빼면 나중에 들어오는 삽입의 자리 판단(RGA 의 건너뛰기)이 복제본마다 달라질 수 있다.
     * 대신 내용·기록을 버리고, 연달아 친 글자의 묘비는 토큰 하나로 합친다. 묶음의 이름표는 첫 글자 것이고, 묶음 안 글자의
     * 이름표가 차례로 커지므로 RGA 비교에서 묶음은 원래 글자들과 똑같이 동작한다. 압축된 노드의 자리 줄(표의 칸 등)은
     * 그대로 둔다 — 그 안을 가리키는 연산이 와도 받을 곳이 있다.
     *
     * @param seqOf 지우기 연산 이름표 → 서버 번호 (아직 서버에 안 들어간 지우기면 undefined)
     * @returns 줄어든 토큰 수
     */
    compact(frontier: number, seqOf: (delKey: string) => number | undefined): number {
        this.modelCache = null;
        this.revision += 1;
        this.dirty();

        let removed = 0;
        const endpointPins = annotationEndpointKeys(this);

        for (const line of this.lineMap.values()) {
            for (const item of line.items) {
                if (item.compact || isAlive(item) || isHead(item) || endpointPins.has(item.key)) {
                    continue;
                }

                if (this.stable(item, frontier, seqOf)) {
                    item.compact = true;
                    item.ch = "";
                    item.dels = NO_DELS;
                    item.cancels = NO_DELS;
                    // 노드는 종류만 남긴다 (검사가 태어난 종류를 본다)
                    item.attrs = NO_ATTRS;
                }
            }

            // 연달아 친 글자의 묘비를 하나로: 같은 참여자, 이름표가 이어지고, 뒤 글자의 기준이 앞 묶음의 마지막 글자
            const merged: Item[] = [];

            for (const item of line.items) {
                const last = merged.at(-1);
                const tail = last && {lamport: last.id.lamport + last.span - 1, actor: last.id.actor};

                if (
                    last &&
                    last.compact &&
                    item.compact &&
                    last.kind === "char" &&
                    item.kind === "char" &&
                    item.id.actor === last.id.actor &&
                    item.id.lamport === tail!.lamport + 1 &&
                    item.origin === keyOf(tail!)
                ) {
                    last.span += item.span;

                    for (let i = 0; i < item.span; i += 1) {
                        this.byKey.set(keyOf({lamport: item.id.lamport + i, actor: item.id.actor}), last);
                    }

                    continue;
                }

                merged.push(item);
            }

            removed += line.items.length - merged.length;
            line.items.length = 0;
            line.items.push(...merged);
            // 압축은 토큰을 빼서 자리가 왼쪽으로도 밀린다 — 다시 적는다
            this.reindex(line);
        }

        if (removed) this.byKey.compact();
        return removed;
    }

    private stable(item: Item, frontier: number, seqOf: (delKey: string) => number | undefined): boolean {
        return [...item.dels].filter(d => !item.cancels.has(d)).every(d => (seqOf(d) ?? Infinity) <= frontier);
    }

    /** 지금 압축할 수 있는 묘비 수 (서버가 GC 를 할지 정할 때) */
    countStable(frontier: number, seqOf: (delKey: string) => number | undefined): number {
        let count = 0;

        for (const line of this.lineMap.values()) {
            for (const item of line.items) {
                !item.compact && !isAlive(item) && !isHead(item) && this.stable(item, frontier, seqOf) && (count += 1);
            }
        }

        return count;
    }

    // ── 스키마 읽기 ──────────────────────────────────────────────────────

    private need(): Schema {
        if (!this.schema) {
            throw new Error("스키마 없이 만든 문서다 — 모델을 계산할 수 없다");
        }

        return this.schema;
    }

    specOf(type: string): NodeSpec | undefined {
        return this.schema?.nodes[type];
    }

    /** 흐름 줄의 명세 — 본문은 root, 상자 안은 그 상자, 표 칸은 그 표의 cell 종류 */
    private flowSpecOf(line: {key?: string; slot: string; owner?: Item | null; ownerBorn?: string | null}): FlowSpec | undefined {
        const schema = this.schema;
        if (line.slot === ANNOTATION_SLOT) return undefined;
        const ownerBorn = "ownerBorn" in line ? line.ownerBorn : (line.owner?.born ?? null);
        const textAddress = parseTextStorage(line.key ?? "");
        if (textAddress) return this.flowSpecOf(this.lineMap.get(textAddress.parent) ?? {...line, key: textAddress.parent});
        const address = parseRequired(line.key ?? "");
        if (schema && address) {
            const parent = this.lineMap.get(address.parent) ?? {...line, key: address.parent};
            const flow = this.flowSpecOf(parent);
            if (flow) return {...flow, childRules: undefined, default: requiredType(schema, address.type)};
        }

        if (!schema) {
            return undefined;
        }

        if (ownerBorn === null || ownerBorn === undefined) {
            return schema.nodes[schema.root] as FlowSpec;
        }

        const owner = schema.nodes[ownerBorn];
        const parts = line.slot.startsWith("cell:") ? gridParts(schema, ownerBorn) : null;
        const spec = line.slot === "body" ? owner : parts ? schema.nodes[parts.body] : undefined;

        return spec?.shape === "flow" ? spec : undefined;
    }

    /** 노드의 지금 종류. 흐름 줄의 머리는 그 줄의 default */
    typeOf(item: Item): string {
        const type = item.attrs.get("$type")?.value as string | undefined;

        return type ?? (item.boundary === "root" ? (this.flowSpecOf(item.line)?.default ?? "") : item.born);
    }

    /** text 블록 안에서 글자 한 자리를 차지하는 노드 (inline-image) */
    isInline(item: Item): boolean {
        return item.kind === "node" && this.specOf(item.born)?.shape === "inline";
    }

    private isTextMarker(item: Item): boolean {
        return item.kind === "node" && (item.boundary === "root" || this.specOf(this.typeOf(item))?.shape === "text");
    }

    /** 종류의 속성 명세 순서대로, 지금 값 (안 쓴 것·null 은 기본값) */
    attrsOf(item: Item, type: string): Record<string, unknown> {
        const attrs: Record<string, unknown> = {};

        Object.entries(this.specOf(type)?.attrs ?? {}).forEach(([k, spec]) => {
            const value = item.attrs.get(k)?.value;

            attrs[k] = isFieldSpec(spec) ? materializeFields(spec, path => item.attrs.get(encodeFieldKey(k, path))) : structuredClone(value === undefined || value === null ? spec.default : value);
        });

        return attrs;
    }

    private defaultsOf(type: string): Record<string, unknown> {
        return Object.fromEntries(Object.entries(this.specOf(type)?.attrs ?? {}).map(([k, spec]) => [k, structuredClone(spec.default)]));
    }

    /** 이 줄에 올 수 있는 블록 종류 (스키마의 children) */
    allowedIn(lineKey: string = MAIN): readonly string[] {
        const line = this.get(lineKey)?.line;

        return line && line.key === lineKey ? this.storedIn(line) : [];
    }

    /** 이 줄의 기본 블록 종류 (스키마의 default) */
    defaultIn(lineKey: string = MAIN): string {
        const line = this.get(lineKey)?.line;

        return (line && this.flowSpecOf(line)?.default) ?? "";
    }

    /** 흐름 줄에 저장되는 블록 종류 — 목록(group)은 그 항목 종류로 */
    private storedIn(line: {slot: string; owner?: Item | null; ownerBorn?: string | null}): string[] {
        const flow = this.flowSpecOf(line);

        return flow && this.schema ? storedTypes(this.schema, flow) : [];
    }

    /** 켜진 서식 (값 서식 포함). 연산이 도착한 순서와 무관하게 스키마의 서식 순서로 낸다 */
    marksOf(item: Item): Marks {
        return this.schema ? canonMarks(this.schema, Object.fromEntries([...item.attrs].map(([k, v]) => [k, v.value]))) : {};
    }

    /** 글자 서식 이름·값이 스키마에 맞는가 — 켜기/끄기 서식은 true·false·null, 값 서식은 그 명세대로 */
    private markOk(key: string, value: unknown): boolean {
        const schema = this.schema;

        if (!schema) {
            return true;
        }

        if (schema.marks.includes(key)) {
            return value === null || typeof value === "boolean";
        }

        const spec = schema.markValues?.[key];

        return !!spec && attrValueOk(spec, value);
    }

    /** 이 줄에서 그 종류를 묶는 group (목록 같은) */
    groupOf(lineKey: string, type: string): ReturnType<typeof groupOf> {
        const line = this.get(lineKey)?.line;
        const flow = line && this.flowSpecOf(line);

        return flow && this.schema ? groupOf(this.schema, flow, type) : null;
    }

    groupBoundary(block: Block): string {
        const required = parseRequired(block.marker.line.key);
        return required && this.schema?.nodes[required.type]?.shape === "group" ? block.marker.line.key : "";
    }

    requiredSlotType(item: Item): string | null {
        const address = parseRequired(item.line.key);
        return address && this.schema ? requiredType(this.schema, address.type) : null;
    }

    constrainedChild(lineKey: string, type: string): boolean {
        const line = this.get(lineKey)?.line, flow = line && this.flowSpecOf(line);
        return !!flow?.childRules?.[this.schema && flow ? groupOf(this.schema, flow, type)?.type ?? type : type];
    }

    // ── 모델 계산 ────────────────────────────────────────────────────────

    /**
     * 흐름 줄의 살아 있는 토큰을 앞에서부터 읽어 블록 목록을 만든다. 죽은 토큰은 읽지 않으므로 GC 시점과 무관하다.
     *
     * - text 표지: 같은 경계(boundary)의 살아 있는 표지가 여럿이면 순서상 첫 것만 블록을 열고 나머지는 흡수된다.
     *   둘이 같은 자리에서 동시에 Enter 를 치면 새 줄은 하나다.
     * - 표·상자·구분선: 각자 블록 하나. 바로 뒤에 자기 표지를 가진 text 블록이 없으면 빈 자리(virtual)를 하나 둔다 —
     *   그래서 표 앞뒤에는 언제나 커서를 둘 곳이 있고, 표 바로 뒤에 동시에 들어온 글자도 갈 곳이 있다.
     * - 표는 살아 있는 행과 열이 하나씩은 있어야 보인다.
     */
    sourceBlocks(lineKey: string = MAIN): Block[] {
        const cached = this.blockCache.get(lineKey);

        if (cached) {
            Doc.verifyBlocks && this.verifyCached(lineKey, cached.blocks);

            return cached.blocks;
        }

        const previous = this.previousBlocks.get(lineKey);

        this.previousBlocks.delete(lineKey);
        const head = this.get(lineKey);
        const line = head?.line;
        const flow = line && line.key === lineKey ? this.flowSpecOf(line) : undefined;

        if (!line || !flow) {
            return [];
        }

        this.need();

        const primaryOf = new Map<string, Item>();
        const retained = new Set(this.placements.values().map(op => keyOf(op.target)));
        for (const item of line.items) if (isAlive(item) && this.isTextMarker(item) && !primaryOf.has(item.boundary)) primaryOf.set(item.boundary, item);

        for (const item of line.items) {
            if ((isAlive(item) || isHead(item) || retained.has(item.key)) && this.isTextMarker(item) && !primaryOf.has(item.boundary)) {
                primaryOf.set(item.boundary, item);
            }
        }

        const blocks: Block[] = [];
        let current: TextBlock | null = null;
        let pending: TextBlock | null = null;
        const textBlock = (marker: Item, virtual: boolean): TextBlock => {
            const type = virtual ? flow.default : this.typeOf(marker);

            return {kind: "text", marker, type, attrs: virtual ? this.defaultsOf(type) : this.attrsOf(marker, type), aliases: [], virtual, chars: [], text: ""};
        };
        const flushPending = () => {
            if (pending) {
                blocks.push(pending);
                current = pending;
                pending = null;
            }
        };

        for (const item of line.items) {
            if ((!isAlive(item) && !isHead(item) && !retained.has(item.key)) || item.kind === "head") {
                continue;
            }

            if (item.kind === "char" || this.isInline(item)) {
                flushPending();
                current!.chars.push(item);
                continue;
            }

            if (this.isTextMarker(item)) {
                const primary = primaryOf.get(item.boundary)!;

                if (primary === item) {
                    pending = null;
                    current = textBlock(item, false);
                    blocks.push(current);
                } else {
                    flushPending();
                    (blocks.find(b => b.marker === primary) as TextBlock | undefined)?.aliases.push(item);
                }

                continue;
            }

            const block = this.nonTextBlock(item);

            if (block) {
                flushPending();
                blocks.push(block);
                current = null;
                pending = textBlock(item, true);
            }
        }

        flushPending();
        const of = new Map<Item, TextRef>();
        const byMarker = new Map<Item, TextRef>();

        blocks.forEach((block, i) => {
            if (block.kind === "text") {
                let b: TextBlock = block;
                const prior = !b.virtual && previous?.byMarker.get(b.marker)?.block;

                if (prior && prior.type === b.type && JSON.stringify(prior.attrs) === JSON.stringify(b.attrs) &&
                    prior.chars.length === b.chars.length && prior.chars.every((c, j) => c === b.chars[j]) &&
                    prior.aliases.length === b.aliases.length && prior.aliases.every((a, j) => a === b.aliases[j])) {
                    // 토큰·종류·속성·흡수 표지가 모두 같을 때만 예전 불변 문단과 모델을 쓴다.
                    b = prior;
                    blocks[i] = prior;
                } else {
                    b.text = b.chars.map(charOf).join("");
                }
                const ref = {block: b};
                b.chars.forEach(c => of.set(c, ref));
                byMarker.set(b.marker, ref);
            }
        });
        this.blockCache.set(lineKey, {blocks, of, byMarker});

        return blocks;
    }

    private textStorageItem(address: TextAddress): Item | undefined {
        const id = textTicket(address), key = keyOf(id), found = this.byKey.get(key);
        if (found) return found;
        const parent = this.get(address.parent)?.line, flow = parent && this.flowSpecOf(parent);
        if (!parent || !flow || !address.detached && address.after && !this.placements.get(address.after) && !this.byKey.has(address.after)) return undefined;
        const line: Line = {key, owner: parent.owner, slot: parent.slot, items: [], inserted: 0};
        const head = newItem(id, null, "node", line);
        head.boundary = "root"; head.born = flow.default; line.items.push(head);
        this.lineMap.set(key, line); this.byKey.set(key, head);
        return head;
    }

    get hasCardinality(): boolean { return !!this.schema && Object.values(this.schema.nodes).some(spec => spec.shape === "flow" && Object.keys(spec.childRules ?? {}).length > 0); }
    private readonly overflowBlocks = new Map<string, Block[]>();

    private requiredItem(address: RequiredAddress, requested: string): Item | undefined {
        const parent = this.get(address.parent)?.line;
        const flow = parent && this.flowSpecOf(parent);
        const rule = flow?.childRules?.[address.type];
        if (!this.schema || !parent || parent.key !== address.parent || !isHead(parent.items[0]) || !flow || !rule || address.ordinal >= (rule.min ?? 0)) return undefined;
        const type = requiredType(this.schema, address.type), spec = this.specOf(type);
        if (!spec || !["text", "flow", "atom", "grid"].includes(spec.shape)) return undefined;
        const headId = requiredTicket(address), key = keyOf(headId);
        let line = this.lineMap.get(key);
        if (!line) {
            line = {key, owner: parent.owner, slot: parent.slot, items: [], inserted: 0};
            const head = newItem(headId, null, "node", line);
            head.boundary = "root"; head.born = spec.shape === "text" ? type : flow.default;
            line.items.push(head); this.lineMap.set(key, line); this.byKey.set(key, head);
            if (spec.shape !== "text") {
                const item = newItem(requiredTicket(address, true), key, "node", line);
                item.born = type; line.items.push(item); this.byKey.set(item.key, item);
                if (spec.shape === "grid") {
                    const parts = gridParts(this.schema, type)!;
                    for (const [slot, kind, lamport] of [["rows", parts.row, 2], ["cols", "col", 3]] as const) {
                        const axis = this.get(slotKey(item.key, slot))!.line;
                        const entry = newItem({lamport, actor: headId.actor}, axis.key, "node", axis);
                        entry.born = kind; axis.items.push(entry); this.byKey.set(entry.key, entry);
                    }
                }
            }
        }
        return this.byKey.get(requested);
    }

    private applyChildRules(lineKey: string, blocks: Block[]): Block[] {
        const line = this.get(lineKey)?.line, flow = line && this.flowSpecOf(line);
        if (!flow?.childRules || !this.schema) return blocks;
        type Unit = {type: string; blocks: Block[]; groupKey: string; required: RequiredAddress | null};
        const units: Unit[] = [];
        for (const block of blocks) {
            if (block.kind === "text" && block.virtual && !block.chars.length) continue;
            const required = parseRequired(block.marker.line.key);
            const group = block.kind === "text" ? groupOf(this.schema, flow, block.type) : null;
            const key = group ? JSON.stringify([group.spec.by.map(name => block.attrs[name]), this.groupBoundary(block)]) : "";
            const previous = units.at(-1);
            if (group && previous?.type === group.type && previous.groupKey === key) previous.blocks.push(block);
            else units.push({type: required?.type ?? group?.type ?? block.type, blocks: [block], groupKey: key, required});
        }
        const counts = new Map<string, number>(), selected = new Set<Unit>();
        for (const unit of units) if (!unit.required) {
            const count = counts.get(unit.type) ?? 0;
            if (count < (flow.childRules[unit.type]?.max ?? Infinity)) { selected.add(unit); counts.set(unit.type, count + 1); }
        }
        const visible: Block[] = [], overflow: Block[] = [], seenFallback = new Set<string>();
        for (const unit of units) {
            if (!unit.required) { (selected.has(unit) ? visible : overflow).push(...unit.blocks); continue; }
            const address = unit.required, rule = flow.childRules[address.type];
            const key = keyOf(requiredTicket(address)); seenFallback.add(key);
            if (address.ordinal >= (counts.get(unit.type) ?? 0) && address.ordinal < (rule?.min ?? 0)) visible.push(...unit.blocks);
            else if (unit.blocks.some(block => block.kind !== "text" || block.chars.length || block.marker.attrs.size)) overflow.push(...unit.blocks);
        }
        for (const [type, rule] of Object.entries(flow.childRules)) for (let ordinal = 0; ordinal < (rule.min ?? 0); ordinal++) {
            const address = {parent: lineKey, type, ordinal}, key = keyOf(requiredTicket(address));
            if (seenFallback.has(key)) continue;
            const concrete = requiredType(this.schema, type), text = this.specOf(concrete)?.shape === "text";
            const item = this.get(keyOf(requiredTicket(address, !text)));
            if (!item) throw new Error("Cannot materialize required child");
            const block = this.sourceBlocks(item.line.key).find(candidate => candidate.marker === item);
            if (block) {
                if (ordinal >= (counts.get(type) ?? 0)) visible.push(block);
                else if (block.kind !== "text" || block.chars.length || item.attrs.size) overflow.push(block);
            }
        }
        this.overflowBlocks.set(lineKey, overflow); return visible;
    }

    /** Hidden candidates remain stored and can become visible after deletion or undo. */
    overflow(lineKey: string = MAIN): NodeJSON[] {
        this.blocks(lineKey);
        return (this.overflowBlocks.get(lineKey) ?? []).map(block => copyModel(this.rawBlock(block)));
    }

    private tokenLocationsVersion = -1;
    private readonly tokenLocations = new Map<string, {line: string; visible: boolean}>();

    /** Visibility describes the containing logical block, including retained tombstones. */
    tokenLocation(key: string): {line: string; visible: boolean} | null {
        const item = this.get(key);
        if (!item || item.line.slot === ANNOTATION_SLOT || item.line.slot === "rows" || item.line.slot === "cols") return null;
        if (!this.hasMoves && !this.hasCardinality) return {line: item.line.key, visible: this.visible(item.line.key)};
        if (this.tokenLocationsVersion !== this.revision) {
            this.tokenLocations.clear();
            for (const line of [...this.lineMap.values()]) {
                if (parseRequired(line.key) || parseTextStorage(line.key) || !this.flowSpecOf(line)) continue;
                const location = {line: line.key, visible: this.visible(line.key)};
                for (const block of this.blocks(line.key)) {
                    this.tokenLocations.set(block.marker.key, location);
                    if (block.kind === "text") {
                        for (const alias of block.aliases) this.tokenLocations.set(alias.key, location);
                        for (const char of block.chars) this.tokenLocations.set(char.key, location);
                    }
                }
            }
            for (const line of this.lineMap.values()) {
                let containing: {line: string; visible: boolean} = {line: this.logicalLineOf(line.items[0]), visible: false};
                for (const token of line.items) {
                    if (isAlive(token) && token.kind !== "char" && !this.isInline(token)) containing = this.tokenLocations.get(token.key) ?? {line: this.logicalLineOf(token), visible: false};
                    if (!this.tokenLocations.has(token.key)) this.tokenLocations.set(token.key, containing);
                }
            }
            this.tokenLocationsVersion = this.revision;
        }
        return this.tokenLocations.get(key) ?? {line: this.logicalLineOf(item), visible: false};
    }

    get hasMoves(): boolean { return this.placements.active; }

    /** Replacement gaps use an existing movement stamp as their fragment nonce. */
    private automaticGap(address: TextAddress): TextAddress | null {
        const seen = new Set<string>();
        while (address.detached) {
            if (!address.after || seen.has(address.after)) return null;
            seen.add(address.after);
            const movement = this.placements.get(address.after);
            const original = movement && parseTextStorage(keyOf(movement.target));
            if (!original) {
                const anchor = movement && this.byKey.get(keyOf(movement.target));
                return movement && keyOf(movement.parent) === address.parent && anchor && ["flow", "grid", "atom"].includes(this.specOf(anchor.born)?.shape ?? "")
                    ? {parent: address.parent, after: movement.after ? keyOf(movement.after) : null} : null;
            }
            if (original.parent !== address.parent) return null;
            address = original;
        }
        return address;
    }

    private projectionCache: {version: number; lines: number; value: PlacementProjection} | null = null;
    private placementProjection(): PlacementProjection {
        for (const movement of this.placements.values()) this.get(keyOf(movement.parent));
        const cached = this.projectionCache;
        if (cached?.version === this.revision && cached.lines === this.lineMap.size) return cached.value;
        const base: Placement[] = [];
        const gaps = new Map<string, Ticket>();
        const rank = (key: string, stamps: Ticket[]): void => {
            for (const stamp of stamps) if (!gaps.has(key) || compareTicket(stamp, gaps.get(key)!) < 0) gaps.set(key, stamp);
        };
        for (const line of [...this.lineMap.values()]) {
            if (parseRequired(line.key) || !this.flowSpecOf(line)) continue;
            const address = parseTextStorage(line.key);
            if (address) {
                const gap = this.automaticGap(address);
                let after = gap?.after ?? null;
                if (gap) rank(line.key, [...line.items.slice(1).map(item => item.id), ...[...line.items[0].attrs.values()].map(register => register.at)]);
                for (const item of line.items) {
                    if (item.kind === "char" || this.isInline(item) || address.detached && !gap && isHead(item)) continue;
                    base.push({id: item.id, target: item.key, parent: address.parent, after});
                    if (!parseSplitBoundary(item.boundary)) after = item.key;
                }
                continue;
            }
            let after: string | null = null;
            let virtualByMarker: Map<string, TextBlock> | undefined;
            for (const item of line.items) {
                if (item.kind === "char" || this.isInline(item)) continue;
                base.push({id: item.id, target: item.key, parent: line.key, after});
                // Logical splits carry their own placement. Their physical
                // partition marker must not reanchor existing siblings.
                if (!parseSplitBoundary(item.boundary)) after = item.key;
                if (!this.isTextMarker(item)) {
                    const id = textTicket({parent: line.key, after: item.key});
                    base.push({id, target: keyOf(id), parent: line.key, after});
                    virtualByMarker ??= new Map(this.sourceBlocks(line.key).flatMap(block => block.kind === "text" && block.virtual ? [[block.marker.key, block] as const] : []));
                    const virtual = virtualByMarker.get(item.key);
                    if (virtual) rank(keyOf(id), virtual.chars.map(char => char.id));
                    after = keyOf(id);
                }
            }
        }
        for (const line of [...this.lineMap.values()]) {
            if (parseRequired(line.key) || parseTextStorage(line.key)) continue;
            const flow = this.flowSpecOf(line);
            let after = base.filter(entry => entry.parent === line.key).at(-1)?.target ?? null;
            for (const [type, rule] of Object.entries(flow?.childRules ?? {})) for (let ordinal = 0; ordinal < (rule.min ?? 0); ordinal++) {
                const address = {parent: line.key, type, ordinal};
                const id = requiredTicket(address, this.schema?.nodes[requiredType(this.schema!, type)]?.shape !== "text");
                base.push({id, target: keyOf(id), parent: line.key, after}); after = keyOf(id);
            }
        }
        const value = this.placements.project(base, line => this.get(line)?.line.owner?.key ?? null, gaps);
        this.projectionCache = {version: this.revision, lines: this.lineMap.size, value};
        return value;
    }

    fragmentStorage(parent: string, nonce: Ticket): Item {
        return this.get(keyOf(textTicket({parent, after: keyOf(nonce), detached: true})))!;
    }

    movementTarget(block: Block, line: string): Item {
        return block.kind === "text" && block.virtual && !parseTextStorage(block.marker.key) ? this.get(keyOf(textTicket({parent: line, after: block.marker.key})))! : block.marker;
    }

    placementOf(id: Ticket): {parent: Ticket; after: Ticket | null; at: Ticket} | null {
        const entry = this.placementProjection().current.get(keyOf(id));
        return entry ? {parent: ticketOf(entry.parent), after: entry.after ? ticketOf(entry.after) : null, at: entry.id} : null;
    }

    priorPlacementOf(op: Op): {parent: Ticket; after: Ticket | null; at: Ticket} | undefined {
        return this.movementPriors.get(op);
    }

    logicalLineOf(item: Item): string {
        const required = parseRequired(item.line.key);
        if (required) return required.parent;
        const textAddress = parseTextStorage(item.line.key);
        if (textAddress && !this.hasMoves) return textAddress.parent;
        return this.hasMoves ? this.placementProjection().current.get(item.key)?.parent ?? item.line.key : item.line.key;
    }

    private logicalBlocksVersion = -1;
    private logicalBlocksLines = -1;
    private readonly logicalBlocks = new Map<string, Block[]>();
    blocks(lineKey: string = MAIN): Block[] {
        if (!this.hasMoves || parseRequired(lineKey) || parseTextStorage(lineKey)) return this.projectedBlocks(lineKey);
        for (const movement of this.placements.values()) this.get(keyOf(movement.parent));
        if (this.logicalBlocksVersion !== this.revision || this.logicalBlocksLines !== this.lineMap.size) this.logicalBlocks.clear();
        const cached = this.logicalBlocks.get(lineKey);
        if (cached) return cached;
        const blocks = this.projectedBlocks(lineKey);
        this.logicalBlocksVersion = this.revision; this.logicalBlocksLines = this.lineMap.size;
        this.logicalBlocks.set(lineKey, blocks); return blocks;
    }

    private projectedBlocks(lineKey: string = MAIN): Block[] {
        if (parseRequired(lineKey) || parseTextStorage(lineKey)) return this.sourceBlocks(lineKey);
        if (!this.hasMoves) return this.applyChildRules(lineKey, this.sourceBlocks(lineKey));
        const line = this.get(lineKey)?.line;
        if (!line || !this.flowSpecOf(line)) return [];
        const available = new Map<string, Block>();
        const physicalVirtual = new Map<string, TextBlock>();
        for (const source of [...this.lineMap.values()]) {
            if (parseRequired(source.key) || parseTextStorage(source.key) || !this.flowSpecOf(source)) continue;
            for (const block of this.sourceBlocks(source.key)) {
                if (block.kind === "text" && block.virtual) {
                    const key = keyOf(textTicket({parent: source.key, after: block.marker.key}));
                    physicalVirtual.set(key, block);
                    this.get(key);
                } else if (isAlive(block.marker)) available.set(block.marker.key, block);
            }
        }
        for (const source of [...this.lineMap.values()]) {
            if (!parseTextStorage(source.key)) continue;
            const sourceBlocks = this.sourceBlocks(source.key);
            const address = parseTextStorage(source.key)!;
            for (const child of sourceBlocks.slice(1)) if (!(child.kind === "text" && child.virtual) && isAlive(child.marker)) available.set(child.marker.key, child);
            const gap = this.automaticGap(address);
            if (address.detached && !gap) continue;
            const physicalHead = sourceBlocks[0] as TextBlock;
            // A detached replacement stores a move nonce, not its logical gap.
            // Leading gaps must stay visible to both model paths and toJSON.
            const block = (gap ?? address).after !== null && source.items.length === 1 && !physicalHead.marker.attrs.size && !this.placements.values().some(op => keyOf(op.target) === source.key) ? {...physicalHead, virtual: true} : physicalHead;
            const original = physicalVirtual.get(source.key);
            if (original) {
                const parts = [block, original];
                available.set(source.key, {...block, parts, chars: parts.flatMap(part => part.chars), text: parts.map(part => part.text).join("")});
            } else available.set(source.key, block);
        }
        for (const source of [...this.lineMap.values()]) {
            if (parseRequired(source.key) || parseTextStorage(source.key)) continue;
            const flow = this.flowSpecOf(source);
            for (const [type, rule] of Object.entries(flow?.childRules ?? {})) for (let ordinal = 0; ordinal < (rule.min ?? 0); ordinal++) {
                const address = {parent: source.key, type, ordinal};
                const item = this.get(keyOf(requiredTicket(address, this.schema?.nodes[requiredType(this.schema!, type)]?.shape !== "text")));
                const block = item && this.sourceBlocks(item.line.key).find(block => block.marker === item);
                if (block) available.set(item!.key, block);
            }
        }
        const projection = this.placementProjection();
        // Resolve join aliases in Ticket order. A concurrent cycle suppresses the
        // edge that would close it, and every original marker remains stored.
        const joins = new Map<string, {value: JoinValue; at: Ticket}>();
        const candidates = [...available.values()].filter((block): block is TextBlock => block.kind === "text")
            .map(block => ({block, entry: block.marker.attrs.get("$join")}))
            .filter(entry => parseJoin(entry.entry?.value))
            .sort((a, b) => compareTicket(a.entry!.at, b.entry!.at));
        for (const {block, entry} of candidates) {
            const value = parseJoin(entry!.value)!;
            if (!available.has(value.into) || !available.has(value.after)) continue;
            let target = value.into; const seen = new Set<string>([block.marker.key]);
            while (joins.has(target) && !seen.has(target)) { seen.add(target); target = joins.get(target)!.value.into; }
            if (!seen.has(target)) joins.set(block.marker.key, {value, at: entry!.at});
        }
        const joinedInto = (key: string): string => { while (joins.has(key)) key = joins.get(key)!.value.into; return key; };
        const appendParts = (head: TextBlock): TextBlock => {
            const keys = [...joins.keys()].filter(key => joinedInto(key) === head.marker.key);
            if (!keys.length) return head;
            const parts: TextBlock[] = [...(head.parts ?? [head])], emitted = new Set<string>([head.marker.key]);
            while (keys.some(key => !emitted.has(key))) {
                const next = keys.filter(key => !emitted.has(key) && emitted.has(joins.get(key)!.value.after))
                    .sort((a, b) => compareTicket(joins.get(b)!.at, joins.get(a)!.at));
                if (!next.length) break;
                for (const key of next) { const block = available.get(key) as TextBlock; parts.push(...(block.parts ?? [block])); emitted.add(key); }
            }
            return {...head, parts, aliases: parts.flatMap(part => part.marker === head.marker ? part.aliases : [part.marker, ...part.aliases]), chars: parts.flatMap(part => part.chars), text: parts.map(part => part.text).join("")};
        };
        const fallback = (after: string | null, before?: Block): TextBlock => {
            let key = keyOf(textTicket({parent: lineKey, after}));
            let item = this.get(key)!;
            let placement = projection.current.get(item.key);
            while (placement && keyOf(placement.id) !== key) {
                key = keyOf(textTicket({parent: lineKey, after: keyOf(placement.id), detached: true}));
                item = this.get(key)!;
                placement = projection.current.get(item.key);
            }
            let block = available.get(item.key) as TextBlock ?? this.sourceBlocks(item.line.key)[0] as TextBlock;
            if (before && (block.chars.length || item.attrs.size) && result.some(candidate => candidate.marker === item)) {
                const boundary = projection.current.get(before.marker.key);
                if (boundary && this.placements.get(keyOf(boundary.id))) {
                    item = this.fragmentStorage(lineKey, boundary.id);
                    block = available.get(item.key) as TextBlock ?? this.sourceBlocks(item.line.key)[0] as TextBlock;
                }
            }
            return after !== null && item.line.items.length === 1 && !item.attrs.size ? {...block, virtual: true} : block;
        };
        const result: Block[] = [];
        for (const key of projection.order.get(lineKey) ?? []) {
            const block = available.get(key);
            if (block && !joins.has(key)) result.push(block.kind === "text" ? appendParts(block) : block);
        }
        const out: Block[] = [];
        const emitted = new Set<string>();
        const append = (block: Block): void => {
            if (emitted.has(block.marker.key)) return;
            emitted.add(block.marker.key); out.push(block);
        };
        for (let i = 0; i < result.length; i++) {
            const block = result[i];
            if (emitted.has(block.marker.key)) continue;
            // Unedited automatic paragraphs do not create duplicate gaps beside
            // a real text block. Once edited, their identity and contents persist.
            if (block.kind === "text" && parseTextStorage(block.marker.key) && !block.chars.length && !this.placements.values().some(op => keyOf(op.target) === block.marker.key) && (result[i + 1]?.kind === "text" || out.at(-1)?.kind === "text")) continue;
            if (!out.length && block.kind !== "text") append(fallback(null, block));
            if (out.length && out.at(-1)!.kind !== "text" && block.kind !== "text") append(fallback(keyOf(this.placementOf(out.at(-1)!.marker.id)?.at ?? out.at(-1)!.marker.id), block));
            append(block);
        }
        if (!out.length) append(fallback(null));
        if (out.at(-1)!.kind !== "text") append(fallback(keyOf(this.placementOf(out.at(-1)!.marker.id)?.at ?? out.at(-1)!.marker.id)));
        return this.applyChildRules(lineKey, out);
    }

    private nonTextBlock(item: Item): Block | null {
        const type = this.typeOf(item);
        const spec = this.specOf(type);
        const attrs = this.attrsOf(item, type);

        if (spec?.shape === "grid") {
            const rows = this.aliveIn(slotKey(item.key, "rows"));
            const cols = this.aliveIn(slotKey(item.key, "cols"));

            return rows.length && cols.length ? {kind: "grid", marker: item, type, attrs, rows, cols, ...this.spansOf(item, rows, cols)} : null;
        }

        if (spec?.shape === "flow") {
            return {kind: "flow", marker: item, type, attrs, body: slotKey(item.key, "body")};
        }

        return {kind: "atom", marker: item, type, attrs};
    }

    /**
     * 칸 합치기를 계산한다. 합치기는 표 노드의 속성 `$span:왼쪽위행,왼쪽위열` = {끝 행, 끝 열} (모두 이름표)이다.
     * - 크기는 "왼쪽 위부터 끝까지 사이의 살아 있는 행·열 수" — 그 사이에 동시에 넣은 열은 함께 덮이고, 지운 열만큼 줄어든다
     * - 왼쪽 위 칸의 행이나 열이 지워졌으면 그 합치기는 없다 (덮였던 칸이 다시 보인다)
     * - 겹치는 합치기가 있으면 나중 이름표 것부터 받고, 이미 받은 것과 겹치는 것은 버린다 — 모든 복제본에서 같은 결과
     */
    private spansOf(grid: Item, rows: Item[], cols: Item[]): {spans: Map<string, [number, number]>; covered: Map<string, [number, number]>} {
        const spans = new Map<string, [number, number]>();
        const covered = new Map<string, [number, number]>();
        const rowLine = this.get(slotKey(grid.key, "rows"))!.line;
        const colLine = this.get(slotKey(grid.key, "cols"))!.line;
        const extent = (axis: Item[], line: Line, start: number, endKey: string): number => {
            const end = this.byKey.get(endKey);
            const endAt = end && end.line === line ? this.indexOf(end) : -1;

            if (endAt < 0) {
                return 1;
            }

            let n = 0;

            for (let i = start; i < axis.length && this.indexOf(axis[i]) <= endAt; i += 1) {
                n += 1;
            }

            return Math.max(1, n);
        };
        const entries = [...grid.attrs]
            .filter(([k, v]) => k.startsWith("$span:") && v.value)
            .sort(([, a], [, b]) => compareTicket(b.at, a.at));

        for (const [key, {value}] of entries) {
            const [rowKey, colKey] = key.slice(6).split(/,(.+)/);
            const r = rows.findIndex(x => x.key === rowKey);
            const c = cols.findIndex(x => x.key === colKey);
            const end = value as {row: string; col: string};

            if (r < 0 || c < 0) {
                continue;
            }

            const rowspan = extent(rows, rowLine, r, end.row);
            const colspan = extent(cols, colLine, c, end.col);
            const cells: string[] = [];

            for (let i = r; i < r + rowspan; i += 1) {
                for (let j = c; j < c + colspan; j += 1) {
                    cells.push(`${i},${j}`);
                }
            }

            if ((rowspan === 1 && colspan === 1) || cells.some(x => spans.has(x) || covered.has(x))) {
                continue;
            }

            spans.set(`${r},${c}`, [rowspan, colspan]);
            cells.slice(1).forEach(x => covered.set(x, [r, c]));
        }

        return {spans, covered};
    }

    private aliveIn(lineKey: string): Item[] {
        const line = this.get(lineKey)?.line;

        return line ? line.items.filter(i => !isHead(i) && isAlive(i)) : [];
    }

    /** 칸의 저장된 속성 (스키마 순서, 기본값과 다른 것만). 칸에는 토큰이 없어 표 노드에 `$cell:행,열|이름` 으로 적는다 */
    cellAttrs(grid: GridBlock, row: Item, col: Item): Record<string, unknown> {
        const parts = gridParts(this.need(), grid.type);
        const out: Record<string, unknown> = {};

        Object.entries((parts && this.specOf(parts.cell)?.attrs) ?? {}).forEach(([name, spec]) => {
            if (isFieldSpec(spec)) {
                out[name] = materializeFields(spec, path => grid.marker.attrs.get(cellAttrKey(row, col, encodeFieldKey(name, path))));
                return;
            }
            const value = spec.computed ? undefined : grid.marker.attrs.get(cellAttrKey(row, col, name))?.value;

            value !== undefined && value !== null && value !== spec.default && (out[name] = value);
        });

        return out;
    }

    /** 표 칸의 줄 키 */
    cellKey(grid: Item, row: Item, col: Item): string {
        return slotKey(grid.key, cellSlot(row, col));
    }

    /** 줄이 지금 화면에 보이는가 — 주인이 보이고 살아 있고, 칸이면 그 행·열이 살아 있다 */
    visible(lineKey: string): boolean {
        if (lineKey === MAIN) return true;
        const required = parseRequired(lineKey);
        if (required) {
            const item = this.get(lineKey);
            return !!item && this.visible(required.parent) && this.blocks(required.parent).some(block => block.marker.line.key === lineKey);
        }
        const cached = this.visibleCache.get(lineKey);

        if (cached !== undefined) {
            return cached;
        }

        const line = this.get(lineKey)?.line;
        const owner = line?.owner;
        let result = false;

        if (line && owner && line.key === lineKey && this.visible(this.logicalLineOf(owner))) {
            const block = this.blocks(this.logicalLineOf(owner)).find(b => b.marker === owner && b.kind !== "text");

            if (block?.kind === "flow") {
                result = line.slot === "body";
            } else if (block?.kind === "grid") {
                const [, row, col] = /^cell:([^,]+),(.+)$/.exec(line.slot) ?? [];

                const r = block.rows.findIndex(x => x.key === row);
                const c = block.cols.findIndex(x => x.key === col);

                // 합친 칸에 가려진 칸은 안 보인다
                result = r >= 0 && c >= 0 && !block.covered.has(`${r},${c}`);
            }
        }

        this.visibleCache.set(lineKey, result);

        return result;
    }

    /**
     * 비교·출력용 모델 — 스키마의 종류 이름으로 된 트리 (스키마 기반 문서 에디터의 문서와 같은 꼴). 저장에서 날것의 트리를 만들고
     * model.ts 의 모양 정리(canonical)를 거친다 — 편집기 쪽 모델이 같은 규칙으로 정리되므로 둘이 같은 꼴이 된다.
     * 비어 있는 빈 자리(표 뒤 virtual)는 모델에 없다.
     */
    toJSON(): NodeJSON {
        this.modelCache ??= canonicalWithTextCache(this.need(), {type: this.need().root, children: this.rawFlow(MAIN)}, this.canonicalTexts);

        // 변하지 않은 문서는 토큰·서식을 다시 읽지 않는다. 호출자는 예전처럼 모델을 자유롭게 고칠 수 있다.
        return copyModel(this.modelCache);
    }

    private rawFlow(lineKey: string): NodeJSON[] {
        return this.blocks(lineKey)
            .filter(b => !(b.kind === "text" && b.virtual && !b.chars.length))
            .map(b => this.rawBlock(b));
    }

    private rawBlock(b: Block): NodeJSON {
        const cached = b.kind === "text" ? this.textModels.get(b) : null;

        if (cached) {
            return cached;
        }

        const node: NodeJSON = {type: b.type};
        const boundary = this.groupBoundary(b);
        if (boundary) withGroupBoundary(node, boundary);

        Object.keys(b.attrs).length && (node.attrs = {...b.attrs});

        if (b.kind === "text") {
            const units: Unit[] = [];
            const spanMarks = Object.values(this.need().nodes).flatMap(spec => spec.shape === "span" ? [spec.mark] : []);
            let last: Extract<Unit, {ch: string}> | undefined;
            let signature = "";
            for (const c of b.chars) {
                if (c.kind !== "char") {
                    units.push({inline: c.born, attrs: this.attrsOf(c, c.born)});
                    last = undefined;
                    continue;
                }
                const marks = this.marksOf(c), key = JSON.stringify(marks);
                // Span grouping compares values by identity, including JSON objects.
                if (last && signature === key && spanMarks.every(mark => last!.marks[mark] === marks[mark])) last.ch += c.ch;
                else {
                    last = {ch: c.ch, marks};
                    signature = key;
                    units.push(last);
                }
            }

            node.runs = unitsToRuns(this.need(), units);
            this.textModels.set(b, node);
        } else if (b.kind === "grid") {
            const parts = gridParts(this.need(), b.type)!;

            // table > table-row > table-cell > table-cell-body > 블록들. 모든 행에 모든 칸이 있다 (에디터 표와 같은 full grid) —
            // 합친 칸의 왼쪽 위는 colspan·rowspan, 가려진 칸은 spanned
            node.children = b.rows.map((r, i) => ({
                type: parts.row,
                children: b.cols.map((c, j) => {
                    const span = b.spans.get(`${i},${j}`);
                    const attrs: Record<string, unknown> = span ? {colspan: span[1], rowspan: span[0]} : {};

                    Object.entries(this.cellAttrs(b, r, c)).forEach(([k, v]) => (attrs[k] = v));

                    return {type: parts.cell, attrs, children: [{type: parts.body, children: this.rawFlow(this.cellKey(b.marker, r, c))}]};
                }),
            }));
        } else if (b.kind === "flow") {
            node.children = this.rawFlow(b.body);
        }

        return node;
    }

    // ── 편집 연산 ────────────────────────────────────────────────────────

    /** 편집 연산이 들어올 때마다 — 편집기 쪽 모델을 맞춰 가는 데 (fuzz 의 거울 검사 같은) */
    editListener: ((edits: EditOp[], normalize: EditOp[]) => void) | null = null;

    /**
     * 같은 글 블록의 글자·서식만 바꾸는 묶음은 그 블록만 검산한다. 경로와 블록 모양은 그대로다.
     * 묶음·표의 구조 변경, 나누기·합치기·가상 블록은 기존 전체 검산에 맡긴다.
     */
    private textEditScope(edits: EditOp[]) {
        const path = edits[0]?.at.slice(0, -1);

        if (!path?.length || !edits.every(edit =>
            edit.at.length === path.length + 1 &&
            path.every((n, i) => edit.at[i] === n) &&
            Array.from(edit.at).every(n => Number.isInteger(n) && n >= 0) &&
            (edit.op === "delete" || (edit.op === "update" && edit.length !== undefined) ||
                (edit.op === "insert" && (typeof edit.content === "string" || Array.from(edit.content).every(item => item && "text" in item))))
        )) {
            return null;
        }

        const ref = resolvePath(this, path);

        if (ref.kind !== "block") {
            return null;
        }

        const block = this.blocks(ref.line)[ref.b];

        if (block.kind !== "text" || block.virtual || !this.visible(ref.line)) {
            return null;
        }

        // 검산용 문서는 글 블록 하나만 담는다. 목록·캡션의 묶음 속성은 rawBlock 에 남아 있고,
        // 글자 편집으로 바뀌지 않는다. 루트에서 다시 묶지 않아 경로는 늘 [0, 글자 자리]다.
        const source = this.need();
        const schema: Schema = {...source, nodes: {...source.nodes, [source.root]: {shape: "flow", children: [block.type], default: block.type}}};
        const read = (): NodeJSON => canonical(schema, {type: schema.root, children: [this.rawBlock(this.blocks(ref.line)[ref.b])]});

        return {schema, path, read, edits: edits.map(edit => ({...edit, at: [0, edit.at.at(-1)!]}))};
    }

    /**
     * 편집 연산(insert · delete · update · split · merge) 묶음을 적용하고, 만든 전선 연산을 돌려준다 (edit.ts).
     *
     * normalize: 편집기가 이 묶음을 자기 모델에 그대로 적용했을 때와 이 문서의 모델이 다르면, 그 차이를 메우는 연산.
     * 보통은 비어 있다. CRDT 쪽 규칙 때문에 모양이 달라지는 드문 경우에만 생긴다 — 흐름은 언제나 글 블록으로 시작한다,
     * 행마다 칸 수가 다른 열 넣기는 열 하나로 바로잡는다, 같은 칸을 겹쳐 합치면 하나만 받는다 …
     */
    edit(edits: EditOp[], options: {normalize?: boolean} = {}): {ops: Op[]; normalize: EditOp[]} {
        const want = options.normalize || !!this.editListener;
        const scope = want ? this.textEditScope(edits) : null;
        const before = want ? (scope ? scope.read() : this.toJSON()) : null;
        const ops = compileEdits(this, edits);
        let normalize: EditOp[] = [];

        if (before) {
            const schema = scope?.schema ?? this.need();
            const expected = applyEdits(schema, before, scope?.edits ?? edits);
            const after = scope ? scope.read() : this.toJSON();

            normalize = JSON.stringify(expected) === JSON.stringify(after) ? [] : diffModels(schema, expected, after);
            scope && (normalize = normalize.map(edit => ({...edit, at: [...scope.path, ...edit.at.slice(1)]})));
        }

        this.editListener?.(edits, normalize);

        return {ops, normalize};
    }

    /** 내부용 — 만든 전선 연산을 적용한다 (edit.ts 가 쓴다). 속성 쓰기는 되돌리기에 쓰도록 직전 값을 기억한다 */
    emit(ops: Op[]): Op[] {
        return this.run(ops);
    }

    // ── 위치 ↔ 토큰 ─────────────────────────────────────────────────────

    /** 위치가 있는 text 블록 */
    textAt(pos: Pos): TextBlock {
        const block = this.blocks(lineKeyOf(pos))[pos.b];

        if (block?.kind !== "text") {
            throw new Error(`글자 자리가 아니다: ${JSON.stringify(pos)}`);
        }

        return block;
    }

    /** 위치의 왼쪽 토큰 (블록 맨 앞이면 그 블록의 표지. 빈 자리면 앞의 표·구분선) */
    leftOf(pos: Pos): Item {
        const block = this.textAt(pos);

        return pos.o > 0 ? block.chars[pos.o - 1] : block.marker;
    }

    /** 위치의 오른쪽 토큰 키 (블록 끝이면 다음 블록 표지, 줄 끝이면 "end") */
    rightKeyOf(pos: Pos): string {
        const blocks = this.blocks(lineKeyOf(pos));
        const block = this.textAt(pos);

        if (pos.o < block.chars.length) {
            return block.chars[pos.o].key;
        }

        return blocks[pos.b + 1]?.marker.key ?? "end";
    }

    private posMap(lineKey: string): Map<Item, {b: number; o: number}> {
        const cached = this.posCache.get(lineKey);

        if (cached) {
            return cached;
        }

        const map = new Map<Item, {b: number; o: number}>();

        this.blocks(lineKey).forEach((block, b) => {
            if (block.kind !== "text") {
                // 표·구분선 "바로 뒤" = 다음 블록 맨 앞 (언제나 text 블록이 뒤따른다)
                map.set(block.marker, {b: b + 1, o: 0});

                return;
            }

            block.virtual || map.set(block.marker, {b, o: 0});
            let offset = 0;
            for (const part of block.parts ?? []) {
                map.set(part.marker, {b, o: offset});
                part.aliases.forEach(alias => map.set(alias, {b, o: offset}));
                offset += part.chars.length;
            }
            block.chars.forEach((c, o) => map.set(c, {b, o: o + 1}));
        });
        this.posCache.set(lineKey, map);

        return map;
    }

    /**
     * 토큰 키(그 토큰 "바로 뒤" 자리)를 화면 위치로 바꾼다. 커서를 토큰에 붙여 두면 남의 편집이 끼어도 제자리에 있다.
     * 죽은 토큰이나 흡수된 표지면 왼쪽으로 걸어가 가장 가까운 살아 있는 자리를 찾는다. 줄이 통째로 안 보이게 됐으면
     * (내가 있던 열을 남이 지웠다) 옆 칸, 그것도 없으면 그 표 자리로 나온다.
     */
    posAfter(key: string): Pos {
        const item = this.get(key);

        return item ? this.posFrom(item) : {b: 0, o: 0};
    }

    private posFrom(item: Item): Pos {
        if (this.hasMoves || this.hasCardinality) {
            const location = this.tokenLocation(item.key);
            if (location?.visible) {
                const map = this.posMap(location.line);
                for (let index = this.indexOf(item); index >= 0; index--) {
                    const position = map.get(item.line.items[index]);
                    if (position) return posIn(location.line, position.b, position.o);
                }
            }
        }
        const line = item.line;

        if (!this.visible(line.key)) {
            return this.escape(line);
        }

        const map = this.posMap(line.key);

        for (let i = this.indexOf(item); i >= 0; i -= 1) {
            const p = map.get(line.items[i]);

            if (p) {
                return posIn(line.key, p.b, p.o);
            }
        }

        return posIn(line.key, 0, 0);
    }

    private escape(line: Line): Pos {
        const owner = line.owner!;
        const cell = /^cell:([^,]+),(.+)$/.exec(line.slot);

        if (cell && this.visible(this.logicalLineOf(owner))) {
            const grid = this.blocks(this.logicalLineOf(owner)).find(b => b.marker === owner);

            if (grid?.kind === "grid") {
                // 지워진 행·열이면 그 앞(없으면 뒤)의 살아 있는 것으로
                const near = (axis: Item[], slot: "rows" | "cols", key: string) => {
                    const all = this.get(slotKey(owner.key, slot))!.line.items;
                    const at = all.findIndex(i => i.key === key);
                    const before = all.slice(0, at + 1).filter(i => axis.includes(i)).at(-1);

                    return before ?? axis[0];
                };
                let row = near(grid.rows, "rows", cell[1]);
                let col = near(grid.cols, "cols", cell[2]);
                // 합친 칸에 가려졌으면 그 왼쪽 위 칸으로
                const cover = grid.covered.get(`${grid.rows.indexOf(row)},${grid.cols.indexOf(col)}`);

                if (cover) {
                    row = grid.rows[cover[0]];
                    col = grid.cols[cover[1]];
                }

                return posIn(this.cellKey(owner, row, col), 0, 0);
            }
        }

        return this.posFrom(owner);
    }

    /** 화면 위치를 커서용 토큰 키로 */
    anchorOf(pos: Pos): string {
        return this.leftOf(pos).key;
    }

    /** 두 위치 사이의 글자 토큰 (같은 줄만) */
    charsBetween(from: Pos, to: Pos): Item[] {
        if (lineKeyOf(from) !== lineKeyOf(to)) {
            return [];
        }

        const [a, z] = comparePos(from, to) <= 0 ? [from, to] : [to, from];
        const blocks = this.blocks(lineKeyOf(a));
        const chars: Item[] = [];

        for (let b = a.b; b <= z.b; b += 1) {
            const block = blocks[b];

            if (block.kind === "text") {
                chars.push(...block.chars.slice(b === a.b ? a.o : 0, b === z.b ? z.o : block.chars.length));
            }
        }

        return chars;
    }

    /** 칸 줄이면 그 표와 행·열 자리 */
    cellOf(lineKey: string): {grid: GridBlock; line: string; b: number; r: number; c: number} | null {
        const line = this.get(lineKey)?.line;
        const cell = line && /^cell:([^,]+),(.+)$/.exec(line.slot);

        if (!line?.owner || !cell) {
            return null;
        }

        const owner = line.owner;
        const blocks = this.blocks(this.logicalLineOf(owner));
        const b = blocks.findIndex(x => x.marker === owner && x.kind === "grid");
        const grid = blocks[b] as GridBlock | undefined;

        if (!grid) {
            return null;
        }

        return {grid, line: this.logicalLineOf(owner), b, r: grid.rows.findIndex(r => r.key === cell[1]), c: grid.cols.findIndex(c => c.key === cell[2])};
    }

    /** 상자 안 줄이면 그 상자 자리 */
    bodyOf(lineKey: string): {line: string; b: number} | null {
        const line = this.get(lineKey)?.line;

        if (!line?.owner || line.slot !== "body") {
            return null;
        }

        const b = this.blocks(this.logicalLineOf(line.owner)).findIndex(x => x.marker === line.owner);

        return b >= 0 ? {line: this.logicalLineOf(line.owner), b} : null;
    }

    /** 블록의 맨 앞·맨 끝 글자 자리. 표·상자면 그 안으로 들어간다 */
    edgeOf(lineKey: string, b: number, end: boolean): Pos {
        const block = this.blocks(lineKey)[b];

        if (block.kind === "text") {
            return posIn(lineKey, b, end ? block.chars.length : 0);
        }

        if (block.kind === "grid") {
            const row = end ? block.rows.at(-1)! : block.rows[0];
            const col = end ? block.cols.at(-1)! : block.cols[0];

            return this.lineEdge(this.cellKey(block.marker, row, col), end);
        }

        if (block.kind === "flow") {
            return this.lineEdge(block.body, end);
        }

        // 구분선은 건너뛴다
        return this.edgeOf(lineKey, end ? b - 1 : b + 1, end);
    }

    lineEdge(lineKey: string, end: boolean): Pos {
        const blocks = this.blocks(lineKey);

        return this.edgeOf(lineKey, end ? blocks.length - 1 : 0, end);
    }

    // ── 내 편집 → 연산 ───────────────────────────────────────────────────
    //
    // 아래 함수들은 연산을 만들어 바로 적용하고, 만든 연산을 돌려준다. 돌려받은 연산을 그대로 상대에게 보내면 된다.

    /** 글자를 받는 블록 종류인가 (image 는 inline-image 만 담는다) */
    takesText(type: string): boolean {
        const spec = this.specOf(type);

        return spec?.shape === "text" && spec.text !== false;
    }

    /** 이 줄의 text 블록에 올 수 있는 inline 종류 */
    inlinesIn(lineKey: string = MAIN): string[] {
        const line = this.get(lineKey)?.line;
        const flow = line && line.key === lineKey ? this.flowSpecOf(line) : undefined;

        return flow && this.schema ? inlineTypes(this.schema, flow) : [];
    }

    /** 내 편집으로 만든 연산을 적용한다. 속성 undo가 이전 상태를 식별하도록 값과 쓰기 ID를 기억한다 */
    private run(ops: Op[]): Op[] {
        ops.forEach(op => {
            op.t === "set" && this.priors.set(op, op.ids.map(id => {
                const prior = this.live(id)?.attrs.get(op.key);

                return {id, value: prior?.value, at: prior?.at};
            }));
            if (op.t === "move") {
                const prior = this.placementOf(op.target);
                if (prior) this.movementPriors.set(op, prior);
            }
            this.apply(op);
        });

        return ops;
    }

    private readonly priors = new WeakMap<Op, Array<{id: Ticket; value: unknown; at?: Ticket}>>();

    /** run() 으로 적용한 속성 쓰기의 직전 값과 쓰기 ID (wire나 snapshot에는 포함하지 않는다) */
    priorOf(op: Op): Array<{id: Ticket; value: unknown; at?: Ticket}> {
        return this.priors.get(op) ?? [];
    }

    /** 속성의 지금 값을 쓴 연산 이름표 — 되돌리기가 "그 사이 남이 바꿨나"를 볼 때 */
    setTicket(id: Ticket, key: string): Ticket | undefined {
        return this.live(id)?.attrs.get(key)?.at;
    }

    // ── 스냅숏 ────────────────────────────────────────────────────────────

    snapshot(): Snapshot {
        const fields = !!this.schema && Object.values(this.schema.nodes).some(spec => Object.values(spec.attrs ?? {}).some(isFieldSpec));
        const annotations = this.lineMap.has(ANNOTATION_HEAD_KEY);
        const capabilities = [...(this.hasMoves ? ["placement-v1"] : []), ...(this.hasCardinality ? ["cardinality-v1"] : []), ...(fields ? ["fields-v1"] : []), ...(annotations ? ["annotations-v1"] : [])];
        return {
            ...(capabilities.length ? {format: 2 as const, capabilities, moves: structuredClone(this.placements.values())} : {}),
            lamport: this.clock.lamport,
            lines: [...this.lineMap.values()].map(line => ({
                key: line.key,
                owner: line.owner?.key ?? null,
                slot: line.slot,
                items: line.items.map((item, i) => itemToJSON(item, line.items[i - 1])),
            })),
        };
    }

    static fromSnapshot(actor: string, snapshot: Snapshot, schema: Schema | null = null): Doc {
        if (!annotationJsonOk(snapshot, 128)) throw new Error("Snapshot must contain finite plain JSON data without accessors");
        if (!Number.isSafeInteger(snapshot.lamport) || snapshot.lamport < 0) throw new Error("Invalid snapshot Lamport clock");
        if (snapshot.format !== undefined && snapshot.format !== 2) throw new Error("Unsupported snapshot format");
        if (snapshot.capabilities?.some(capability => !["placement-v1", "cardinality-v1", "fields-v1", "annotations-v1"].includes(capability))) throw new Error("Unsupported snapshot capability");
        const features = new Set(snapshot.capabilities ?? []);
        const fields = !!schema && Object.values(schema.nodes).some(spec => Object.values(spec.attrs ?? {}).some(isFieldSpec));
        const cardinality = !!schema && Object.values(schema.nodes).some(spec => spec.shape === "flow" && Object.keys(spec.childRules ?? {}).length);
        const annotationState = snapshot.lines.some(line => line.key === ANNOTATION_HEAD_KEY || line.slot === ANNOTATION_SLOT || line.items.some(item => item.b === ANNOTATION_TYPE));
        const placementState = !!snapshot.moves?.length || snapshot.lines.some(line => !!parseTextStorage(line.key) || line.items.some(item => item.a?.some(([key]) => key === "$join")));
        const fieldState = fields || snapshot.lines.some(line => line.items.some(item => item.a?.some(([key]) => key.startsWith("$field:") || key.startsWith("$cell:") && key.includes("|$field:"))));
        const requiredCapabilities = [...(annotationState ? ["annotations-v1"] : []), ...(placementState ? ["placement-v1"] : []), ...(fieldState ? ["fields-v1"] : []), ...(cardinality || snapshot.lines.some(line => !!parseRequired(line.key)) ? ["cardinality-v1"] : [])];
        if ((requiredCapabilities.length || features.size) && snapshot.format !== 2) throw new Error("Feature snapshots require format 2");
        if (requiredCapabilities.some(capability => !features.has(capability))) throw new Error("Feature snapshot is missing its required capability");
        const doc = new Doc(actor, schema);
        const owners: Array<[Line, string]> = [];

        doc.lineMap.clear();
        doc.byKey.clear();
        const snapshotKeys = new Set<string>();
        snapshot.lines.forEach(s => {
            if (doc.lineMap.has(s.key)) throw new Error("Duplicate snapshot line identity");
            const line: Line = {key: s.key, owner: null, slot: s.slot, items: [], inserted: 0};

            s.items.forEach(j => {
                const item = itemFromJSON(j, line, line.items.at(-1));

                if (!Number.isSafeInteger(item.span) || item.span < 1 || !Number.isSafeInteger(item.id.lamport) || item.id.lamport < 0 || !Number.isSafeInteger(item.id.lamport + item.span - 1)) throw new Error("Invalid snapshot token identity or span");
                line.items.push(item);

                for (let i = 0; i < item.span; i += 1) {
                    const tokenKey = keyOf({lamport: item.id.lamport + i, actor: item.id.actor});
                    if (snapshotKeys.has(tokenKey)) throw new Error("Duplicate snapshot token identity");
                    snapshotKeys.add(tokenKey);
                    doc.byKey.set(i === 0 ? item.key : keyOf({lamport: item.id.lamport + i, actor: item.id.actor}), item);
                }
            });
            if (line.items[0]?.key !== line.key || !isHead(line.items[0])) throw new Error("Snapshot line is missing its canonical head");
            doc.lineMap.set(s.key, line);
            s.owner && owners.push([line, s.owner]);
        });
        owners.forEach(([line, owner]) => (line.owner = doc.byKey.get(owner) ?? null));
        const endpointExists = (key: string): boolean => {
            const item = doc.byKey.get(key);
            return !!item && item.line.slot !== ANNOTATION_SLOT && item.line.slot !== "rows" && item.line.slot !== "cols" && item.born !== ANNOTATION_TYPE;
        };
        for (const line of doc.lineMap.values()) {
            if (line.key === ANNOTATION_HEAD_KEY || line.slot === ANNOTATION_SLOT) {
                if (line.key !== ANNOTATION_HEAD_KEY || line.slot !== ANNOTATION_SLOT || line.owner?.key !== MAIN || line.items[0]?.key !== ANNOTATION_HEAD_KEY || line.items[0].kind !== "head") throw new Error("Invalid annotation storage head");
                for (const item of line.items.slice(1)) {
                    if (item.kind !== "node" || item.born !== ANNOTATION_TYPE) throw new Error("Invalid annotation storage item");
                    if (!item.compact) {
                        const type = item.attrs.get("$type");
                        if (type && type.value !== ANNOTATION_TYPE) throw new Error("Invalid annotation type register");
                        const problem = validateAnnotationAttributes(Object.fromEntries([...item.attrs].filter(([key]) => key !== "$type").map(([key, entry]) => [key, entry.value])), endpointExists);
                        if (problem) throw new Error(`Invalid snapshot annotation: ${problem}`);
                    }
                }
            } else if (line.items.some(item => item.born === ANNOTATION_TYPE)) throw new Error("Annotation node outside reserved storage");
            const text = parseTextStorage(line.key), required = parseRequired(line.key);
            if ((line.key.startsWith("0@~text:") || line.key.startsWith("0@~fragment:")) && !text || /^\d+@~required:/.test(line.key) && !required) throw new Error("Invalid reserved storage identity");
            if (text || required) {
                const address = text ?? required!;
                const parent = doc.lineMap.get(address.parent), head = parent?.items[0];
                const flow = parent && doc.flowSpecOf(parent);
                if (!flow || head?.key !== address.parent || line.owner !== parent!.owner || line.slot !== parent!.slot || line.items[0]?.key !== line.key || line.items[0].kind !== "node") throw new Error("Invalid derived storage head");
                if (required) {
                    if (!flow.childRules?.[required.type] || required.ordinal >= (flow.childRules[required.type].min ?? 0)) throw new Error("Invalid required storage address");
                    const concrete = requiredType(schema!, required.type);
                    for (const item of line.items) if (parseRequired(item.key)) {
                        const lamport = item.id.lamport;
                        if (lamport > 1 || item.key !== keyOf(requiredTicket(required, lamport === 1))) throw new Error("Invalid required object identity");
                        const expected = lamport === 0 && schema!.nodes[concrete].shape !== "text" ? flow.default : concrete;
                        if (item.born !== expected || item.attrs.has("$type") && item.attrs.get("$type")!.value !== expected) throw new Error("Required child type is fixed");
                    }
                }
                if (text?.after && !text.detached) {
                    const movement = snapshot.moves?.find(move => keyOf(move.at) === text.after);
                    const anchor = doc.byKey.get(movement ? keyOf(movement.target) : text.after);
                    const origin = anchor && (parseRequired(anchor.line.key)?.parent ?? parseTextStorage(anchor.line.key)?.parent ?? anchor.line.key);
                    if (!anchor || !["flow", "grid", "atom"].includes(schema?.nodes[anchor.born]?.shape ?? "") || (movement ? keyOf(movement.parent) !== text.parent : origin !== text.parent)) throw new Error("Invalid trailing storage anchor");
                }
            }
            for (const item of line.items) for (const [key, entry] of item.attrs) {
                if (!Number.isSafeInteger(entry.at.lamport) || entry.at.lamport < 0 || !entry.at.actor) throw new Error("Invalid snapshot register identity");
                if (key === "$join" || key.startsWith("$field:") || key.startsWith("$cell:") && key.includes("|$field:")) {
                    const problem = doc.check([{t: "set", at: entry.at, ids: [item.id], key, value: entry.value}]);
                    if (problem) throw new Error(`Invalid snapshot register: ${problem}`);
                }
            }
        }
        for (const move of snapshot.moves ?? []) {
            const error = doc.check([move]);
            if (error) throw new Error(`Invalid snapshot movement: ${error}`);
            doc.apply(move);
        }
        doc.clock.lamport = Math.max(doc.clock.lamport, snapshot.lamport);

        return doc;
    }
}

const copyRun = (run: Run): Run => "text" in run
    ? {...run, marks: structuredClone(run.marks)}
    : {...run, ...(run.attrs && {attrs: structuredClone(run.attrs)}), ...(run.runs && {runs: run.runs.map(copyRun)})};

const copyModel = (node: NodeJSON): NodeJSON => ({
    ...node,
    ...(node.attrs && {attrs: structuredClone(node.attrs)}),
    ...(node.runs && {runs: node.runs.map(copyRun)}),
    ...(node.children && {children: node.children.map(copyModel)}),
});

/** 이어 친 글자의 기준 — 같은 참여자의 바로 앞 이름표. 스냅숏은 이때 기준을 적지 않는다 */
const previousKey = (id: Ticket): string => keyOf({lamport: id.lamport - 1, actor: id.actor});

/** 줄에서 바로 앞 토큰 다음 번호 — 같은 참여자가 이어 친 글자면 이 이름표다 (묶인 묘비는 그 길이만큼 건너뛴다) */
const nextTicket = (prev: Item): Ticket => ({lamport: prev.id.lamport + prev.span, actor: prev.id.actor});

const itemToJSON = (item: Item, prev: Item | undefined): ItemJSON => {
    const j: ItemJSON = {};
    const next = prev && nextTicket(prev);

    (!next || next.actor !== item.id.actor || next.lamport !== item.id.lamport) && (j.i = item.key);

    item.origin !== previousKey(item.id) && (j.o = item.origin);
    item.kind !== "char" && (j.k = item.kind === "node" ? "n" : "h");
    item.ch && (j.c = item.ch);
    item.born && (j.b = item.born);
    item.boundary && (j.y = item.boundary);
    item.attrs.size && (j.a = [...item.attrs].map(([k, v]) => [k, structuredClone(v.value), keyOf(v.at)]));
    item.dels.size && (j.d = [...item.dels]);
    item.cancels.size && (j.x = [...item.cancels]);
    item.compact && (j.z = 1);
    item.span !== 1 && (j.s = item.span);

    return j;
};

const itemFromJSON = (j: ItemJSON, line: Line, prev: Item | undefined): Item => {
    if (j.i === undefined && !prev) {
        throw new Error("스냅숏이 틀렸다 — 줄의 첫 토큰에 이름표가 없다");
    }

    const id = j.i === undefined ? nextTicket(prev!) : ticketOf(j.i);

    return {
        id,
        key: j.i ?? keyOf(id),
        origin: j.o === undefined
            ? prev && prev.span === 1 && prev.id.actor === id.actor && prev.id.lamport + 1 === id.lamport ? prev.key : previousKey(id)
            : j.o,
        kind: j.k === "n" ? "node" : j.k === "h" ? "head" : "char",
        ch: j.c ?? "",
        born: j.b ?? "",
        boundary: j.y ?? "",
        attrs: j.a ? new Map(j.a.map(([k, value, at]) => [k, {value: structuredClone(value), at: ticketOf(at)}])) : NO_ATTRS,
        dels: j.d ? new Set(j.d) : NO_DELS,
        cancels: j.x ? new Set(j.x) : NO_DELS,
        compact: j.z === 1,
        span: j.s ?? 1,
        line,
    };
};

/** 같은 줄 안의 두 위치 비교 */
export const comparePos = (a: Pos, b: Pos): number => (a.b !== b.b ? a.b - b.b : a.o - b.o);

export const samePos = (a: Pos, b: Pos): boolean => lineKeyOf(a) === lineKeyOf(b) && a.b === b.b && a.o === b.o;
