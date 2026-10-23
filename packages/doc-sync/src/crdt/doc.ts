import {compileEdits, resolvePath} from "./edit.ts";
import {applyEdits, canonMarks, canonical, canonicalWithTextCache, diffModels, unitsToRuns} from "./model.ts";
import {acceptsText, attrValueOk, gridParts, groupOf, inlineTypes, storedTypes} from "./schema.ts";
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

export type Snapshot = {lamport: number; lines: Array<{key: string; owner: string | null; slot: string; items: ItemJSON[]}>};

/**
 * 줄 하나의 블록 목록과, 글자 하나만 바뀌었을 때 고쳐 쓰기 위한 찾아보기.
 * of: 글자·글 안 노드 → 그것이 든 text 블록,  byMarker: 블록을 연 표지 → 그 블록 (흡수된 표지·가상 블록 제외)
 */
type BlockCache = {blocks: Block[]; of: Map<Item, TextBlock>; byMarker: Map<Item, TextBlock>};

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
    private readonly byKey = new Map<string, Item>();
    private blockCache = new Map<string, BlockCache>();
    /** 시험용 — 켜면 블록 목록 캐시를 쓸 때마다 처음부터 다시 계산해 맞춰 본다 (느리다) */
    static verifyBlocks = false;
    private posCache = new Map<string, Map<Item, {b: number; o: number}>>();
    private visibleCache = new Map<string, boolean>();
    private modelCache: NodeJSON | null = null;
    private textModels = new WeakMap<TextBlock, NodeJSON>();
    private canonicalTexts = new WeakMap<NodeJSON, NodeJSON>();
    private revision = 0;

    constructor(actor: string, schema: Schema | null = null) {
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
        const textShaped = (f: Fact) => (f.head ? !isAxis(f.line.slot) : schema?.nodes[f.born]?.shape === "text");

        for (const op of ops) {
            if (op.t === "text" || op.t === "node") {
                const origin = factOf(keyOf(op.origin));

                if (!origin) {
                    return `기준 토큰 ${keyOf(op.origin)} 이 없다`;
                }

                if (!ACTOR.test(op.id.actor)) {
                    return `참여자 이름 "${op.id.actor}" 는 쓸 수 없다`;
                }

                const line = origin.line;

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
                        if (!spec.attrs?.[k] || !attrValueOk(spec.attrs[k], v)) {
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

            if ((op.t === "del" || op.t === "undel") && targets.some(f => f!.head)) {
                return "줄 머리는 지울 수 없다";
            }

            if (op.t !== "set" || !schema) {
                continue;
            }

            for (const [i, target] of (targets as Fact[]).entries()) {
                if (op.key.startsWith("$cell:")) {
                    // 칸 속성: 표 노드에만, 이 표의 행·열, 칸 종류가 받는 (계산하지 않는) 속성이어야 한다
                    const owner = keyOf(op.ids[i]);
                    const [, rowKey, colKey, name] = CELL_ATTR.exec(op.key) ?? [];
                    const parts = gridParts(schema, target.born);
                    const spec = parts ? schema.nodes[parts.cell]?.attrs?.[name] : undefined;

                    if (
                        !spec ||
                        factOf(rowKey ?? "")?.line.key !== slotKey(owner, "rows") ||
                        factOf(colKey ?? "")?.line.key !== slotKey(owner, "cols") ||
                        !attrValueOk(spec, op.value)
                    ) {
                        return `칸 속성 ${name ?? op.key}=${JSON.stringify(op.value)} 이 맞지 않는다`;
                    }
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
                    const allowed = op.value === null || (spec?.shape === "text" && this.storedIn(target.line).includes(String(op.value)));

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
                        s => s.shape === shape && s.attrs?.[op.key] && attrValueOk(s.attrs[op.key], op.value),
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
        // 글자 넣기·지우기·서식은 그 줄의 블록 목록만 고쳐 쓴다. 나머지(표지·노드·되살리기·노드 속성)는 모든 줄을 다시 계산한다
        op.t === "text" || op.t === "del" || (op.t === "set" && op.ids.every(id => this.get(keyOf(id))?.kind === "char")) || this.dirty();

        switch (op.t) {
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
                    Object.entries(op.marks ?? {}).forEach(([k, v]) => attrsFor(item).set(k, {value: v, at: id}));
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
                Object.entries(op.attrs ?? {}).forEach(([k, v]) => attrsFor(item).set(k, {value: v, at: op.id}));
                this.integrate(item, -1);
                this.clock.observe(op.id);

                return;
            }
            case "del": {
                const at = keyOf(op.at);
                let structural = false;

                op.ids.forEach(id => {
                    const item = this.live(id);

                    if (!item) {
                        return;
                    }

                    const was = isAlive(item);

                    delsFor(item).add(at);

                    if (was && !isAlive(item)) {
                        item.kind === "char" || this.isInline(item) ? this.charRemoved(item) : (structural = true);
                    }
                });
                structural && this.dirty();
                this.clock.observe(op.at);

                return;
            }
            case "undel": {
                const cancels = op.cancels.map(keyOf);

                op.ids.forEach(id => {
                    const item = this.live(id);

                    item && cancels.forEach(c => cancelsFor(item).add(c));
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
                        const block = this.blockCache.get(item.line.key)?.of.get(item);

                        block && this.textModels.delete(block);
                        attrsFor(item).set(op.key, {value: op.value, at: op.at});
                    }
                });
                this.clock.observe(op.at);

                return;
            }
        }
    }

    private dirty(): void {
        this.blockCache.clear();
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
        const inBlock = left && cache.of.get(left);
        const opened = left && !inBlock ? cache.byMarker.get(left) : undefined;
        const block = inBlock ?? opened;

        if (!block) {
            this.blockCache.delete(line.key);

            return;
        }

        const at = inBlock ? block.chars.indexOf(left!) + 1 : 0;

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

        const block = cache.of.get(item);
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

        const fresh = this.blocks(lineKey);
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
        chars.forEach(c => cache.of.set(c, next));
        cache.byMarker.get(block.marker) === block && cache.byMarker.set(block.marker, next);
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

        for (const line of this.lineMap.values()) {
            for (const item of line.items) {
                if (item.compact || isAlive(item) || isHead(item)) {
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
    private flowSpecOf(line: {slot: string; owner?: Item | null; ownerBorn?: string | null}): FlowSpec | undefined {
        const schema = this.schema;
        const ownerBorn = "ownerBorn" in line ? line.ownerBorn : (line.owner?.born ?? null);

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

            attrs[k] = value === undefined || value === null ? spec.default : value;
        });

        return attrs;
    }

    private defaultsOf(type: string): Record<string, unknown> {
        return Object.fromEntries(Object.entries(this.specOf(type)?.attrs ?? {}).map(([k, spec]) => [k, spec.default]));
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
    blocks(lineKey: string = MAIN): Block[] {
        const cached = this.blockCache.get(lineKey);

        if (cached) {
            Doc.verifyBlocks && this.verifyCached(lineKey, cached.blocks);

            return cached.blocks;
        }

        const head = this.get(lineKey);
        const line = head?.line;
        const flow = line && line.key === lineKey ? this.flowSpecOf(line) : undefined;

        if (!line || !flow) {
            return [];
        }

        this.need();

        const primaryOf = new Map<string, Item>();

        for (const item of line.items) {
            if (isAlive(item) && this.isTextMarker(item) && !primaryOf.has(item.boundary)) {
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
            if (!isAlive(item) || item.kind === "head") {
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
        const of = new Map<Item, TextBlock>();
        const byMarker = new Map<Item, TextBlock>();

        blocks.forEach(b => {
            if (b.kind === "text") {
                b.text = b.chars.map(charOf).join("");
                b.chars.forEach(c => of.set(c, b));
                b.virtual || byMarker.set(b.marker, b);
            }
        });
        this.blockCache.set(lineKey, {blocks, of, byMarker});

        return blocks;
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
        if (lineKey === MAIN) {
            return true;
        }

        const cached = this.visibleCache.get(lineKey);

        if (cached !== undefined) {
            return cached;
        }

        const line = this.get(lineKey)?.line;
        const owner = line?.owner;
        let result = false;

        if (line && owner && line.key === lineKey && this.visible(owner.line.key)) {
            const block = this.blocks(owner.line.key).find(b => b.marker === owner && b.kind !== "text");

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

        Object.keys(b.attrs).length && (node.attrs = {...b.attrs});

        if (b.kind === "text") {
            const units: Unit[] = b.chars.map(c => (c.kind === "char" ? {ch: c.ch, marks: this.marksOf(c)} : {inline: c.born, attrs: this.attrsOf(c, c.born)}));

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

        if (cell && this.visible(owner.line.key)) {
            const grid = this.blocks(owner.line.key).find(b => b.marker === owner);

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
        const blocks = this.blocks(owner.line.key);
        const b = blocks.findIndex(x => x.marker === owner && x.kind === "grid");
        const grid = blocks[b] as GridBlock | undefined;

        if (!grid) {
            return null;
        }

        return {grid, line: owner.line.key, b, r: grid.rows.findIndex(r => r.key === cell[1]), c: grid.cols.findIndex(c => c.key === cell[2])};
    }

    /** 상자 안 줄이면 그 상자 자리 */
    bodyOf(lineKey: string): {line: string; b: number} | null {
        const line = this.get(lineKey)?.line;

        if (!line?.owner || line.slot !== "body") {
            return null;
        }

        const b = this.blocks(line.owner.line.key).findIndex(x => x.marker === line.owner);

        return b >= 0 ? {line: line.owner.line.key, b} : null;
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
        return {
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
        const doc = new Doc(actor, schema);
        const owners: Array<[Line, string]> = [];

        doc.lineMap.clear();
        doc.byKey.clear();
        snapshot.lines.forEach(s => {
            const line: Line = {key: s.key, owner: null, slot: s.slot, items: [], inserted: 0};

            s.items.forEach(j => {
                const item = itemFromJSON(j, line, line.items.at(-1));

                line.items.push(item);

                for (let i = 0; i < item.span; i += 1) {
                    doc.byKey.set(i === 0 ? item.key : keyOf({lamport: item.id.lamport + i, actor: item.id.actor}), item);
                }
            });
            doc.lineMap.set(s.key, line);
            s.owner && owners.push([line, s.owner]);
        });
        owners.forEach(([line, owner]) => (line.owner = doc.byKey.get(owner) ?? null));
        doc.clock.lamport = snapshot.lamport;

        return doc;
    }
}

const copyRun = (run: Run): Run => "text" in run
    ? {...run, marks: {...run.marks}}
    : {...run, ...(run.attrs && {attrs: {...run.attrs}}), ...(run.runs && {runs: run.runs.map(copyRun)})};

const copyModel = (node: NodeJSON): NodeJSON => ({
    ...node,
    ...(node.attrs && {attrs: {...node.attrs}}),
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
    item.attrs.size && (j.a = [...item.attrs].map(([k, v]) => [k, v.value, keyOf(v.at)]));
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
        origin: j.o === undefined ? previousKey(id) : j.o,
        kind: j.k === "n" ? "node" : j.k === "h" ? "head" : "char",
        ch: j.c ?? "",
        born: j.b ?? "",
        boundary: j.y ?? "",
        attrs: j.a ? new Map(j.a.map(([k, value, at]) => [k, {value, at: ticketOf(at)}])) : NO_ATTRS,
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
