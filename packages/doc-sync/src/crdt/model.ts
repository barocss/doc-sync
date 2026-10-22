import {attrValueOk, groupOf, gridParts} from "./schema.ts";
import type {FlowSpec, GroupSpec, Schema, SpanSpec} from "./schema.ts";

/**
 * 모델 — 편집기가 보는 문서 트리 (스키마 기반 문서 에디터의 문서 JSON 과 같은 꼴). 순수 함수만 있다. CRDT 를 모른다.
 *
 * - 모양 정리(canonical): 같은 뜻의 트리를 언제나 같은 꼴로 — 목록 묶기, 속성 기본값 채우기, 글 조각(run) 합치기,
 *   표 칸 수 맞추기, 칸 합치기 다시 세기. Doc.toJSON 도 이것을 거쳐 나온다.
 * - 편집 연산 적용(applyEdits): insert · delete · update · split · merge 를 모델에 바로 적용한다. 에디터가 자기
 *   모델에 하는 일과 같다. 받는 쪽 이벤트가 맞는지 검산하는 데, 그리고 편집 결과가 CRDT 와 같은지 보는 데 쓴다.
 * - 비교(diffModels): 앞 모델을 뒤 모델로 바꾸는 편집 연산들. 받는 쪽 이벤트가 된다.
 *
 * 흐름(flow) 안의 목록·캡션 같은 묶음(group)은 저장에는 없고 보일 때만 생긴다. 그래서 흐름 안을 고칠 때는 언제나
 * "펼친 항목 줄"에서 고치고 다시 묶는다 — CRDT 가 흐름 줄을 평평하게 들고 있는 것과 같은 뜻이 된다.
 */

/** text 블록 안의 조각 — 서식이 같은 글자 묶음, inline 노드 하나, 또는 값 서식으로 묶인 span (링크) */
export type Run =
    | {text: string; marks: Marks}
    | {type: string; attrs?: Record<string, unknown>; runs?: Run[]};

export type Marks = Record<string, unknown>;

export type NodeJSON = {type: string; attrs?: Record<string, unknown>; runs?: Run[]; children?: NodeJSON[]};

/** 모델 경로 — 트리의 자식 번호. text 블록 안은 마지막 수가 글자 자리 (inline 노드도 한 자리) */
export type ModelPath = number[];

export type EditOp =
    /** 넣기. text 안이면 글(문자열)·조각(Run)·inline 노드, 블록이면 그 자리에서 나누고 사이에. 흐름·묶음·표·행이면 자식으로 */
    | {op: "insert"; at: ModelPath; content: string | Array<NodeJSON | Run>}
    | {op: "delete"; at: ModelPath; count: number}
    /** 속성 쓰기. text 안 자리 + length 면 그 범위의 서식, length 없이 text 안 자리면 그 inline 노드, 아니면 그 노드. `type` 은 종류 바꾸기 */
    | {op: "update"; at: ModelPath; attrs: Record<string, unknown>; length?: number}
    | {op: "split"; at: ModelPath}
    /** 그 블록을 바로 앞 글 블록에 합친다 */
    | {op: "merge"; at: ModelPath};

/** 글 한 자리 */
export type Unit = {ch: string; marks: Marks} | {inline: string; attrs: Record<string, unknown>};

// ── 스키마 읽기 ─────────────────────────────────────────────────────────

const shapeOf = (schema: Schema, type: string) => schema.nodes[type]?.shape;

const spanSpecs = (schema: Schema): Array<{type: string; spec: SpanSpec}> =>
    Object.entries(schema.nodes)
        .filter(([, s]) => s.shape === "span")
        .map(([type, spec]) => ({type, spec: spec as SpanSpec}));

/** 서식 이름 순서 — 켜기/끄기 서식, 그다음 값 서식 */
export const markOrder = (schema: Schema): string[] => [...schema.marks, ...Object.keys(schema.markValues ?? {})];

/** 서식을 정해진 순서·꼴로 (꺼진 것·빈 값은 뺀다) */
export const canonMarks = (schema: Schema, marks: Marks): Marks => {
    const out: Marks = {};

    schema.marks.forEach(k => marks[k] === true && (out[k] = true));
    Object.entries(schema.markValues ?? {}).forEach(([k, spec]) => {
        const v = marks[k];

        v !== undefined && v !== null && v !== spec.default && (out[k] = v);
    });

    return out;
};

/** 새로 친 글자가 왼쪽 글자에서 물려받는 서식 — 켜기/끄기 서식 전부, 값 서식은 inherit 인 것만 (링크는 안 물려받는다) */
export const inheritedMarks = (schema: Schema, marks: Marks): Marks => {
    const out: Marks = {};

    Object.entries(canonMarks(schema, marks)).forEach(([k, v]) => {
        const spec = schema.markValues?.[k];

        (!spec || spec.inherit) && (out[k] = v);
    });

    return out;
};

/** 종류의 속성: 명세 순서대로, 없는 것은 기본값. 계산되는 속성(computed)은 넣지 않는다 */
const fullAttrs = (schema: Schema, type: string, attrs: Record<string, unknown> = {}): Record<string, unknown> | undefined => {
    const spec = schema.nodes[type]?.attrs;

    if (!spec) {
        return undefined;
    }

    const out: Record<string, unknown> = {};

    Object.entries(spec).forEach(([k, s]) => {
        if (s.computed) {
            return;
        }

        const v = attrs[k];

        out[k] = v === undefined || v === null || !attrValueOk(s, v) ? s.default : v;
    });

    return Object.keys(out).length ? out : undefined;
};

const isTextNode = (schema: Schema, node: NodeJSON): boolean => shapeOf(schema, node.type) === "text";

// ── 글 조각 ↔ 글자 ──────────────────────────────────────────────────────

export const runsToUnits = (schema: Schema, runs: Run[] = [], outer: Marks = {}): Unit[] => {
    const spans = spanSpecs(schema);
    const units: Unit[] = [];

    for (const run of runs) {
        if ("text" in run) {
            [...run.text].forEach(ch => units.push({ch, marks: {...run.marks, ...outer}}));
            continue;
        }

        const span = spans.find(s => s.type === run.type);

        if (span) {
            // 링크 묶음 — 안의 글자에 값 서식으로 펼친다
            units.push(...runsToUnits(schema, run.runs ?? [], {...outer, [span.spec.mark]: run.attrs?.[span.spec.attr]}));
        } else {
            units.push({inline: run.type, attrs: {...(run.attrs ?? {})}});
        }
    }

    return units;
};

/** 글자들을 조각으로 — 서식이 같은 이어진 글자를 합치고, 같은 링크로 이어진 글자를 span 하나로 묶는다 */
export const unitsToRuns = (schema: Schema, units: Unit[]): Run[] => {
    const spans = spanSpecs(schema);
    const out: Run[] = [];
    let i = 0;

    const plain = (list: Unit[], skip: string[]): Run[] => {
        const runs: Run[] = [];

        list.forEach(u => {
            if ("inline" in u) {
                const attrs = fullAttrs(schema, u.inline, u.attrs);

                runs.push(attrs ? {type: u.inline, attrs} : {type: u.inline});

                return;
            }

            const marks = canonMarks(schema, u.marks);

            skip.forEach(k => delete marks[k]);

            const last = runs.at(-1);

            last && "text" in last && JSON.stringify(last.marks) === JSON.stringify(marks) ? (last.text += u.ch) : runs.push({text: u.ch, marks});
        });

        return runs;
    };

    while (i < units.length) {
        const u = units[i];
        const span = "ch" in u ? spans.find(s => canonMarks(schema, u.marks)[s.spec.mark] !== undefined) : undefined;

        if (!span) {
            let j = i;

            while (j < units.length && !("ch" in units[j] && spans.some(s => canonMarks(schema, (units[j] as {marks: Marks}).marks)[s.spec.mark] !== undefined))) {
                j += 1;
            }

            out.push(...plain(units.slice(i, j), []));
            i = j;
            continue;
        }

        const value = canonMarks(schema, (u as {marks: Marks}).marks)[span.spec.mark];
        let j = i;

        while (j < units.length && "ch" in units[j] && canonMarks(schema, (units[j] as {marks: Marks}).marks)[span.spec.mark] === value) {
            j += 1;
        }

        out.push({type: span.type, attrs: {[span.spec.attr]: value}, runs: plain(units.slice(i, j), [span.spec.mark])});
        i = j;
    }

    return out;
};

// ── 흐름 펼치기 · 묶기 ──────────────────────────────────────────────────

/** 흐름의 자식을 펼친 항목 줄로 — 묶음(group)은 항목으로 풀고, 묶음 속성을 항목에 내린다 */
const flatten = (schema: Schema, children: NodeJSON[] = []): NodeJSON[] =>
    children.flatMap(child => {
        const spec = schema.nodes[child.type];

        if (spec?.shape !== "group") {
            return [child];
        }

        const by = Object.fromEntries((spec as GroupSpec).by.map(k => [k, child.attrs?.[k]]).filter(([, v]) => v !== undefined));

        // 항목이 제 값을 가지고 있으면 그것이 이긴다 (항목 속성을 바꾼 직후·다른 목록 항목을 끼워 넣은 직후)
        return (child.children ?? []).map(item => ({...item, attrs: {...by, ...(item.attrs ?? {})}}));
    });

/** 펼친 항목 줄을 다시 묶는다 — 이어진 같은 묶음 항목(묶음 속성이 같은 것)끼리 */
const regroup = (schema: Schema, flow: FlowSpec, items: NodeJSON[]): NodeJSON[] => {
    const out: NodeJSON[] = [];
    let group: {node: NodeJSON; key: string} | null = null;

    for (const item of items) {
        const owner = isTextNode(schema, item) ? groupOf(schema, flow, item.type) : null;

        if (!owner) {
            group = null;
            out.push(item);
            continue;
        }

        const attrs = item.attrs ?? {};
        const key = `${owner.type}|${JSON.stringify(owner.spec.by.map(k => attrs[k]))}`;

        if (!group || group.key !== key) {
            const by = Object.fromEntries(owner.spec.by.map(k => [k, attrs[k]]));

            group = {node: Object.keys(by).length ? {type: owner.type, attrs: by, children: []} : {type: owner.type, children: []}, key};
            out.push(group.node);
        }

        const rest = {...attrs};

        owner.spec.by.forEach(k => delete rest[k]);

        const node: NodeJSON = {type: item.type};

        Object.keys(rest).length && (node.attrs = rest);
        item.runs && (node.runs = item.runs);
        group.node.children!.push(node);
    }

    return out;
};

// ── 모양 정리 ───────────────────────────────────────────────────────────

const defaultBlock = (schema: Schema, flow: FlowSpec): NodeJSON => canonText(schema, {type: flow.default, runs: []});

const canonText = (schema: Schema, node: NodeJSON): NodeJSON => {
    const out: NodeJSON = {type: node.type};
    const attrs = fullAttrs(schema, node.type, node.attrs);

    attrs && (out.attrs = attrs);
    out.runs = unitsToRuns(schema, runsToUnits(schema, node.runs));

    return out;
};

/**
 * 흐름의 자식들을 정리한다. 펼쳐서 블록마다 정리하고, 행·열이 없는 표는 빼고, 다시 묶는다.
 * 흐름은 언제나 글 블록으로 시작한다 (CRDT 의 줄 머리가 글 블록이라서) — 아니면 맨 앞에 빈 기본 블록을 둔다.
 */
const canonFlow = (schema: Schema, flowType: string, children: NodeJSON[] = []): NodeJSON[] => {
    const flow = schema.nodes[flowType] as FlowSpec;
    const items = flatten(schema, children)
        .map(child => canonBlock(schema, child))
        .filter((child): child is NodeJSON => child !== null);

    (!items.length || !isTextNode(schema, items[0])) && items.unshift(defaultBlock(schema, flow));

    return regroup(schema, flow, items);
};

const canonBlock = (schema: Schema, node: NodeJSON): NodeJSON | null => {
    const shape = shapeOf(schema, node.type);

    if (shape === "text") {
        return canonText(schema, node);
    }

    if (shape === "grid") {
        return canonGrid(schema, node);
    }

    const out: NodeJSON = {type: node.type};
    const attrs = fullAttrs(schema, node.type, node.attrs);

    attrs && (out.attrs = attrs);
    shape === "flow" && (out.children = canonFlow(schema, node.type, node.children));

    return out;
};

/** 표: 칸 수를 가장 긴 행에 맞추고, 칸 합치기를 다시 센다 (왼쪽 위 칸의 colspan·rowspan → 가려진 칸의 spanned) */
const canonGrid = (schema: Schema, node: NodeJSON): NodeJSON | null => {
    const parts = gridParts(schema, node.type);
    const rows = node.children ?? [];
    const width = Math.max(0, ...rows.map(r => (r.children ?? []).length));

    if (!parts || !rows.length || !width) {
        return null;
    }

    const cells = rows.map(r => {
        const list = [...(r.children ?? [])];

        while (list.length < width) {
            list.push({type: parts.cell});
        }

        return list;
    });
    const covered = new Set<string>();
    const spans = new Map<string, [number, number]>();

    cells.forEach((row, i) =>
        row.forEach((cell, j) => {
            const rs = Math.min(rows.length - i, Math.max(1, Number(cell.attrs?.rowspan ?? 1) || 1));
            const cs = Math.min(width - j, Math.max(1, Number(cell.attrs?.colspan ?? 1) || 1));
            const area: string[] = [];

            for (let a = i; a < i + rs; a += 1) {
                for (let b = j; b < j + cs; b += 1) {
                    area.push(`${a},${b}`);
                }
            }

            if ((rs > 1 || cs > 1) && !covered.has(`${i},${j}`) && area.every(x => !spans.has(x) && !covered.has(x))) {
                spans.set(`${i},${j}`, [rs, cs]);
                area.slice(1).forEach(x => covered.add(x));
            }
        }),
    );

    const out: NodeJSON = {type: node.type};
    const attrs = fullAttrs(schema, node.type, node.attrs);
    const cellSpec = schema.nodes[parts.cell]?.attrs ?? {};

    attrs && (out.attrs = attrs);
    out.children = cells.map((row, i) => ({
        type: parts.row,
        children: row.map((cell, j) => {
            const span = spans.get(`${i},${j}`);
            const a: Record<string, unknown> = span ? {colspan: span[1], rowspan: span[0]} : covered.has(`${i},${j}`) ? {spanned: true} : {};

            Object.entries(cellSpec).forEach(([k, s]) => {
                const v = cell.attrs?.[k];

                !s.computed && v !== undefined && v !== null && v !== s.default && attrValueOk(s, v) && (a[k] = v);
            });

            const body = cell.children?.[0];
            const c: NodeJSON = {type: parts.cell};

            Object.keys(a).length && (c.attrs = a);
            c.children = [{type: parts.body, children: canonFlow(schema, parts.body, body?.children)}];

            return c;
        }),
    }));

    return out;
};

/** 문서 전체를 정리한 꼴로 */
export const canonical = (schema: Schema, doc: NodeJSON): NodeJSON => ({type: schema.root, children: canonFlow(schema, schema.root, doc.children)});

// ── 편집 연산 적용 ──────────────────────────────────────────────────────

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 경로를 따라 내려가며 지나간 노드들 */
type Step = {node: NodeJSON; parent: NodeJSON | null; index: number};

const walk = (root: NodeJSON, path: ModelPath): Step[] => {
    const steps: Step[] = [{node: root, parent: null, index: -1}];
    let node = root;

    for (const i of path) {
        const next = node.children?.[i];

        if (!next) {
            throw new Error(`경로 ${JSON.stringify(path)} 에 노드가 없다`);
        }

        steps.push({node: next, parent: node, index: i});
        node = next;
    }

    return steps;
};

/** 노드가 흐름 그릇이면 그 종류 (cell 의 몸, 문서 맨 위 포함) */
const flowTypeOf = (schema: Schema, node: NodeJSON): string | null => (shapeOf(schema, node.type) === "flow" ? node.type : null);

/**
 * 흐름 안의 위치를 펼친 항목 줄의 번호로. (흐름 노드, 그 자식 번호) 또는 (묶음 노드, 항목 번호) 를 받는다.
 * @returns 흐름 노드와 펼친 줄, 그 안의 번호
 */
const flatIndex = (schema: Schema, steps: Step[], depth: number, index: number): {flow: NodeJSON; items: NodeJSON[]; at: number} => {
    const holder = steps[depth].node;

    if (flowTypeOf(schema, holder)) {
        const children = holder.children ?? [];
        const before = flatten(schema, children.slice(0, index)).length;

        return {flow: holder, items: flatten(schema, children), at: before};
    }

    // 묶음 안: 묶음 앞까지 펼친 수 + 항목 번호
    const flow = steps[depth - 1].node;
    const children = flow.children ?? [];
    const before = flatten(schema, children.slice(0, steps[depth].index)).length;

    return {flow, items: flatten(schema, children), at: before + index};
};

const setFlow = (schema: Schema, flow: NodeJSON, items: NodeJSON[]): void => {
    flow.children = regroup(schema, schema.nodes[flow.type] as FlowSpec, items.map(i => ({...i})));
};

/** 블록의 펼친 속성 (묶음 안 항목이면 묶음 속성을 더한다) */
const textAttrsAt = (schema: Schema, steps: Step[]): Record<string, unknown> => {
    const last = steps.at(-1)!;
    const holder = last.parent;
    const group = holder && shapeOf(schema, holder.type) === "group" ? holder : null;

    return {...(last.node.attrs ?? {}), ...(group?.attrs ?? {})};
};

/** split 으로 생기는 뒤 블록의 종류·속성 — 끝에서 나누면 스키마의 next, 속성은 inherit 인 것만 */
const splitTail = (schema: Schema, type: string, attrs: Record<string, unknown>, atEnd: boolean): NodeJSON => {
    const spec = schema.nodes[type];
    const next = atEnd && spec?.shape === "text" && spec.next ? spec.next : type;
    const out: Record<string, unknown> = {};

    Object.entries(schema.nodes[next]?.attrs ?? {}).forEach(([k, s]) => s.inherit && attrs[k] !== undefined && attrs[k] !== s.default && (out[k] = attrs[k]));

    return Object.keys(out).length ? {type: next, attrs: out, runs: []} : {type: next, runs: []};
};

const isBlockContent = (schema: Schema, item: NodeJSON | Run): item is NodeJSON =>
    !("text" in item) && !!schema.nodes[item.type] && !["inline", "span"].includes(shapeOf(schema, item.type) ?? "");

/** 연산 하나를 모델에 적용한다 (제자리에서). 묶음은 바로 다시 묶고, 표 칸 수는 묶음 끝(applyEdits)에서 맞춘다 */
export const applyEdit = (schema: Schema, root: NodeJSON, op: EditOp): void => {
    const parentPath = op.at.slice(0, -1);
    const index = op.at.at(-1) ?? 0;

    if (op.op === "insert" || op.op === "delete") {
        const steps = walk(root, parentPath);
        const holder = steps.at(-1)!.node;
        const shape = shapeOf(schema, holder.type);

        if (shape === "text") {
            const units = runsToUnits(schema, holder.runs);

            if (op.op === "delete") {
                units.splice(index, op.count);
                holder.runs = unitsToRuns(schema, units);

                return;
            }

            const content = typeof op.content === "string" ? [op.content] : op.content;

            if (content.some(c => typeof c !== "string" && isBlockContent(schema, c))) {
                // 블록을 넣으면 그 자리에서 나누고 사이에 — 뒷글은 같은 종류·같은 속성의 블록으로
                const attrs = textAttrsAt(schema, steps);
                const head: NodeJSON = {type: holder.type, attrs, runs: unitsToRuns(schema, units.slice(0, index))};
                const tail: NodeJSON = {type: holder.type, attrs, runs: unitsToRuns(schema, units.slice(index))};
                const {flow, items, at} = flatIndex(schema, steps, steps.length - 2, steps.at(-1)!.index);

                items.splice(at, 1, head, ...(content as NodeJSON[]).map(clone), tail);
                setFlow(schema, flow, items);

                return;
            }

            const left = units[index - 1];
            const added: Unit[] = [];

            content.forEach(c => {
                if (typeof c === "string") {
                    const marks = left && "ch" in left ? inheritedMarks(schema, left.marks) : {};

                    [...c].forEach(ch => added.push({ch, marks}));
                } else if ("text" in c) {
                    [...c.text].forEach(ch => added.push({ch, marks: {...c.marks}}));
                } else {
                    added.push(...runsToUnits(schema, [c]));
                }
            });
            units.splice(index, 0, ...added);
            holder.runs = unitsToRuns(schema, units);

            return;
        }

        if (shape === "flow" || shape === "group") {
            const {flow, items, at} = flatIndex(schema, steps, steps.length - 1, index);

            if (op.op === "delete") {
                // 묶음 하나를 지우면 그 항목 전부
                const span = shape === "flow" ? flatten(schema, (holder.children ?? []).slice(index, index + op.count)).length : op.count;

                items.splice(at, span);
            } else {
                const group = shape === "group" ? holder.attrs ?? {} : {};

                items.splice(at, 0, ...flatten(schema, (op.content as NodeJSON[]).map(clone)).map(n => (shape === "group" ? {...n, attrs: {...group, ...(n.attrs ?? {})}} : n)));
            }

            setFlow(schema, flow, items);

            return;
        }

        // 표·행: 자식을 그대로 넣고 뺀다 (칸 수는 묶음 끝에서 맞춘다)
        holder.children = holder.children ?? [];
        op.op === "delete" ? holder.children.splice(index, op.count) : holder.children.splice(index, 0, ...(op.content as NodeJSON[]).map(clone));

        return;
    }

    if (op.op === "split" || op.op === "merge") {
        const steps = walk(root, op.op === "split" ? parentPath : op.at);
        const block = steps.at(-1)!;

        if (op.op === "split") {
            const units = runsToUnits(schema, block.node.runs);
            const attrs = textAttrsAt(schema, steps);
            const head: NodeJSON = {type: block.node.type, attrs, runs: unitsToRuns(schema, units.slice(0, index))};
            const tail = splitTail(schema, block.node.type, attrs, index === units.length);
            const {flow, items, at} = flatIndex(schema, steps, steps.length - 2, block.index);

            tail.runs = unitsToRuns(schema, units.slice(index));
            items.splice(at, 1, head, tail);
            setFlow(schema, flow, items);

            return;
        }

        const {flow, items, at} = flatIndex(schema, steps, steps.length - 2, block.index);
        const prev = items[at - 1];
        const prevSpec = prev && schema.nodes[prev.type];

        if (!prev || prevSpec?.shape !== "text" || prevSpec.text === false || !isTextNode(schema, items[at])) {
            return;
        }

        items.splice(at - 1, 2, {...prev, runs: unitsToRuns(schema, [...runsToUnits(schema, prev.runs), ...runsToUnits(schema, items[at].runs)])});
        setFlow(schema, flow, items);

        return;
    }

    // update
    const parentSteps = walk(root, parentPath);
    const holder = parentSteps.at(-1)!.node;

    if (shapeOf(schema, holder.type) === "text" && op.at.length) {
        const units = runsToUnits(schema, holder.runs);

        if (op.length !== undefined) {
            for (let i = index; i < Math.min(units.length, index + op.length); i += 1) {
                const u = units[i];

                "ch" in u && Object.entries(op.attrs).forEach(([k, v]) => (v === null || v === false ? delete u.marks[k] : (u.marks[k] = v)));
            }
        } else {
            const u = units[index];

            u && "inline" in u && Object.entries(op.attrs).forEach(([k, v]) => (v === null ? delete u.attrs[k] : (u.attrs[k] = v)));
        }

        holder.runs = unitsToRuns(schema, units);

        return;
    }

    const steps = walk(root, op.at);
    const target = steps.at(-1)!.node;
    const shape = shapeOf(schema, target.type);

    if (shape === "group") {
        // 묶음 속성을 바꾸면 그 묶음의 모든 항목이 바뀐다
        const {flow, items, at} = flatIndex(schema, steps, steps.length - 2, steps.at(-1)!.index);
        const count = (target.children ?? []).length;

        for (let i = at; i < at + count; i += 1) {
            items[i] = {...items[i], attrs: {...(items[i].attrs ?? {}), ...op.attrs}};
        }

        setFlow(schema, flow, items);

        return;
    }

    const attrs = {...(target.attrs ?? {})};

    Object.entries(op.attrs).forEach(([k, v]) => {
        if (k === "type") {
            target.type = String(v);
        } else {
            v === null ? delete attrs[k] : (attrs[k] = v);
        }
    });
    target.attrs = attrs;

    if (shape === "text" || shapeOf(schema, target.type) === "text") {
        // 종류·묶음 속성이 바뀌면 묶음이 달라질 수 있다 — 펼쳐서 다시 묶는다
        const holderSteps = steps.slice(0, -1);
        const depth = holderSteps.length - 1;
        const {flow, items} = flatIndex(schema, steps, depth, steps.at(-1)!.index);

        setFlow(schema, flow, items);
    }
};

/** 연산 묶음을 차례로 적용하고, 끝에서 모양을 정리한다. 원본은 건드리지 않는다 */
export const applyEdits = (schema: Schema, doc: NodeJSON, ops: EditOp[]): NodeJSON => {
    const root = clone(doc);

    ops.forEach(op => applyEdit(schema, root, op));

    return canonical(schema, root);
};

// ── 비교 ────────────────────────────────────────────────────────────────

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 두 목록의 같은 원소 짝 (LCS) — [앞 번호, 뒤 번호] */
const lcs = (a: string[], b: string[]): Array<[number, number]> => {
    const n = a.length;
    const m = b.length;
    const table: number[][] = Array.from({length: n + 1}, () => new Array<number>(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }

    const pairs: Array<[number, number]> = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
        if (a[i] === b[j]) {
            pairs.push([i, j]);
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            i += 1;
        } else {
            j += 1;
        }
    }

    return pairs;
};

const attrsDelta = (a: Record<string, unknown> = {}, b: Record<string, unknown> = {}): Record<string, unknown> | null => {
    const delta: Record<string, unknown> = {};

    Object.keys({...a, ...b}).forEach(k => !same(a[k], b[k]) && (delta[k] = b[k] === undefined ? null : b[k]));

    return Object.keys(delta).length ? delta : null;
};

/**
 * 앞 모델을 뒤 모델로 바꾸는 편집 연산들. 바뀐 곳만 — 글이면 바뀐 글자 범위, 표면 바뀐 행·칸.
 * 둘 다 정리된 꼴(canonical)이어야 한다. 나온 연산을 applyEdits 로 앞 모델에 적용하면 뒤 모델이 된다.
 *
 * 흐름은 펼친 항목 줄에서 비교한다. 연산을 하나 만들 때마다 작업 사본에 바로 적용하고, 다음 연산의 경로는 그 사본에서
 * 계산한다 — 목록이 붙었다 떨어져도(다시 묶기) 경로가 어긋나지 않는다. 펼친 번호는 다시 묶기에 흔들리지 않는다.
 */
export const diffModels = (schema: Schema, before: NodeJSON, after: NodeJSON): EditOp[] => {
    const work = clone(before);
    const ops: EditOp[] = [];
    const emit = (op: EditOp) => {
        ops.push(op);
        applyEdit(schema, work, op);
    };

    diffFlow(schema, work, [], after.children ?? [], emit);

    return ops;
};

type Emit = (op: EditOp) => void;

const nodeAt = (root: NodeJSON, path: ModelPath): NodeJSON => walk(root, path).at(-1)!.node;

/** 흐름의 펼친 번호 f 에 있는 항목의 경로 (묶음 안이면 [묶음, 항목]) */
const flatPath = (schema: Schema, root: NodeJSON, flowPath: ModelPath, f: number): ModelPath => {
    const children = nodeAt(root, flowPath).children ?? [];
    let n = 0;

    for (let c = 0; c < children.length; c += 1) {
        const size = schema.nodes[children[c].type]?.shape === "group" ? (children[c].children ?? []).length : 1;

        if (f < n + size) {
            return size === 1 && schema.nodes[children[c].type]?.shape !== "group" ? [...flowPath, c] : [...flowPath, c, f - n];
        }

        n += size;
    }

    return [...flowPath, children.length];
};

/** 펼친 번호 f 자리에 넣을 때의 경로 — 묶음 맨 앞이면 그 묶음 앞(흐름 단계), 묶음 가운데면 묶음 안 */
const insertPath = (schema: Schema, root: NodeJSON, flowPath: ModelPath, f: number): ModelPath => {
    const path = flatPath(schema, root, flowPath, f);

    return path.length === flowPath.length + 2 && path.at(-1) === 0 ? path.slice(0, -1) : path;
};

const diffFlow = (schema: Schema, work: NodeJSON, path: ModelPath, target: NodeJSON[], emit: Emit): void => {
    const a = flatten(schema, nodeAt(work, path).children);
    const b = flatten(schema, target);
    const pairs = lcs(a.map(x => JSON.stringify(x)), b.map(x => JSON.stringify(x)));
    const gaps: Array<{ai: number; an: number; bi: number; bn: number}> = [];
    let pa = 0;
    let pb = 0;

    [...pairs, [a.length, b.length] as [number, number]].forEach(([i, j]) => {
        (i > pa || j > pb) && gaps.push({ai: pa, an: i - pa, bi: pb, bn: j - pb});
        pa = i + 1;
        pb = j + 1;
    });

    // 뒤 구간부터 — 앞 항목의 펼친 번호가 흔들리지 않게
    for (const gap of gaps.reverse()) {
        const k = Math.min(gap.an, gap.bn);

        for (let left = gap.an - k; left > 0; ) {
            // 묶음 경계를 넘는 지우기는 여러 번에 나눈다
            const at = flatPath(schema, work, path, gap.ai + k);
            const holder = at.length === path.length + 2 ? nodeAt(work, at.slice(0, -1)) : null;
            const count = holder ? Math.min(left, (holder.children ?? []).length - at.at(-1)!) : 1;

            emit({op: "delete", at, count});
            left -= count;
        }

        gap.bn > k && emit({op: "insert", at: insertPath(schema, work, path, gap.ai + k), content: b.slice(gap.bi + k, gap.bi + gap.bn).map(clone)});

        for (let x = k - 1; x >= 0; x -= 1) {
            diffItem(schema, work, path, gap.ai + x, a[gap.ai + x], b[gap.bi + x], emit);
        }
    }
};

/** 흐름의 항목 하나 — 같은 모양이면 안으로, 아니면 바꿔 넣는다 */
const diffItem = (schema: Schema, work: NodeJSON, flowPath: ModelPath, f: number, a: NodeJSON, b: NodeJSON, emit: Emit): void => {
    if (same(a, b)) {
        return;
    }

    const shapeA = shapeOf(schema, a.type);
    const shapeB = shapeOf(schema, b.type);
    const at = flatPath(schema, work, flowPath, f);

    if (shapeA === "text" && shapeB === "text") {
        diffText(schema, at, a, b, emit);

        const delta = attrsDelta(a.attrs, b.attrs);
        const attrs = a.type !== b.type ? {...(delta ?? {}), type: b.type} : delta;

        attrs && emit({op: "update", at: flatPath(schema, work, flowPath, f), attrs});

        return;
    }

    if (a.type !== b.type) {
        emit({op: "delete", at, count: 1});
        emit({op: "insert", at: insertPath(schema, work, flowPath, f), content: [clone(b)]});

        return;
    }

    diffBox(schema, work, at, a, b, emit);
};

/** 표·그릇·구분선 — 속성, 그리고 안 */
const diffBox = (schema: Schema, work: NodeJSON, path: ModelPath, a: NodeJSON, b: NodeJSON, emit: Emit): void => {
    const delta = attrsDelta(a.attrs, b.attrs);

    delta && emit({op: "update", at: path, attrs: delta});

    const shape = shapeOf(schema, a.type);

    if (shape === "flow") {
        diffFlow(schema, work, path, b.children ?? [], emit);
    } else if (shape === "grid") {
        diffList(schema, work, path, a.children ?? [], b.children ?? [], emit, (rowPath, ra, rb) =>
            diffList(schema, work, rowPath, ra.children ?? [], rb.children ?? [], emit, (cellPath, ca, cb) => {
                const cellDelta = attrsDelta(ca.attrs, cb.attrs);

                cellDelta && emit({op: "update", at: cellPath, attrs: cellDelta});
                diffFlow(schema, work, [...cellPath, 0], cb.children?.[0]?.children ?? [], emit);
            }),
        );
    }
};

/** 행·칸 목록 — 같은 것은 LCS 로, 사이는 앞에서부터 짝지어 안으로 */
const diffList = (
    schema: Schema,
    work: NodeJSON,
    path: ModelPath,
    a: NodeJSON[],
    b: NodeJSON[],
    emit: Emit,
    inner: (path: ModelPath, a: NodeJSON, b: NodeJSON) => void,
): void => {
    const pairs = lcs(a.map(x => JSON.stringify(x)), b.map(x => JSON.stringify(x)));
    const gaps: Array<{ai: number; an: number; bi: number; bn: number}> = [];
    let pa = 0;
    let pb = 0;

    [...pairs, [a.length, b.length] as [number, number]].forEach(([i, j]) => {
        (i > pa || j > pb) && gaps.push({ai: pa, an: i - pa, bi: pb, bn: j - pb});
        pa = i + 1;
        pb = j + 1;
    });

    for (const gap of gaps.reverse()) {
        const k = Math.min(gap.an, gap.bn);

        gap.an > k && emit({op: "delete", at: [...path, gap.ai + k], count: gap.an - k});
        gap.bn > k && emit({op: "insert", at: [...path, gap.ai + k], content: b.slice(gap.bi + k, gap.bi + gap.bn).map(clone)});

        for (let x = k - 1; x >= 0; x -= 1) {
            !same(a[gap.ai + x], b[gap.bi + x]) && inner([...path, gap.ai + x], a[gap.ai + x], b[gap.bi + x]);
        }
    }
};

/** 글 비교 — 같은 머리·꼬리를 남기고 가운데를 바꾼다. 남긴 곳의 서식·그림 속성 차이는 update 로 */
const diffText = (schema: Schema, path: ModelPath, a: NodeJSON, b: NodeJSON, emit: Emit): void => {
    const ua = runsToUnits(schema, a.runs);
    const ub = runsToUnits(schema, b.runs);
    const content = (u: Unit) => ("ch" in u ? `c${u.ch}` : `i${u.inline}`);
    let head = 0;

    while (head < ua.length && head < ub.length && content(ua[head]) === content(ub[head])) {
        head += 1;
    }

    let tail = 0;

    while (tail < ua.length - head && tail < ub.length - head && content(ua[ua.length - 1 - tail]) === content(ub[ub.length - 1 - tail])) {
        tail += 1;
    }

    const kept: Array<[number, number]> = [];

    for (let i = 0; i < head; i += 1) {
        kept.push([i, i]);
    }

    for (let t = 0; t < tail; t += 1) {
        kept.push([ua.length - tail + t, ub.length - tail + t]);
    }

    const fixes: EditOp[] = [];

    for (const [i, j] of kept) {
        const x = ua[i];
        const y = ub[j];

        if ("ch" in x && "ch" in y) {
            const delta = attrsDelta(canonMarks(schema, x.marks), canonMarks(schema, y.marks));

            delta && fixes.push({op: "update", at: [...path, j], attrs: delta, length: 1});
        } else if ("inline" in x && "inline" in y) {
            const delta = attrsDelta(fullAttrs(schema, x.inline, x.attrs), fullAttrs(schema, y.inline, y.attrs));

            delta && fixes.push({op: "update", at: [...path, j], attrs: delta});
        }
    }

    const midA = ua.length - head - tail;
    const midB = ub.slice(head, ub.length - tail);

    midA > 0 && emit({op: "delete", at: [...path, head], count: midA});
    midB.length && emit({op: "insert", at: [...path, head], content: unitsToRuns(schema, midB)});
    // 서식 고치기는 글을 바꾼 뒤의 자리(뒤 모델 기준)로 — 이웃한 같은 고치기는 하나로
    mergeFixes(fixes).forEach(emit);
};

const mergeFixes = (fixes: EditOp[]): EditOp[] => {
    const out: Array<Extract<EditOp, {op: "update"}>> = [];

    for (const fix of fixes as Array<Extract<EditOp, {op: "update"}>>) {
        const last = out.at(-1);

        if (
            last &&
            last.length !== undefined &&
            fix.length !== undefined &&
            same(last.attrs, fix.attrs) &&
            same(last.at.slice(0, -1), fix.at.slice(0, -1)) &&
            last.at.at(-1)! + last.length === fix.at.at(-1)
        ) {
            last.length += fix.length;
        } else {
            out.push({...fix});
        }
    }

    return out;
};
