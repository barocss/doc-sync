import {childRuleProblems} from "./cardinality.ts";
import type {ChildRule} from "./cardinality.ts";
import {fieldValueOk, fieldsSchemaProblems, isFieldSpec} from "./fields.ts";
/**
 * 문서 스키마 — 바깥에서 주입한다. CRDT 는 노드 종류(문단·제목·표 …)를 모른다. 아는 것은 "모양"뿐이다.
 * 노드 종류마다 모양 하나와 children(올 수 있는 자식 종류)·속성·서식을 적는다 — 스키마 기반 문서 에디터의 스키마처럼 트리로 읽힌다.
 *
 *   text    글을 담는 블록. 흐름 줄에서 표지 하나가 열고, 다음 표지까지의 글자·inline 이 그 안이다 (문단·목록 항목).
 *           children 에는 글자 말고 올 수 있는 inline 종류를 적는다
 *   inline  text 블록 안에서 글자 한 자리를 차지하는 것 (inline-image)
 *   flow    블록들이 흐르는 줄을 하나 가진 그릇. Enter 로 나누고 Backspace 로 합치는 곳 (본문·표 칸·상자·이미지 그릇)
 *   group   이어진 항목 블록들을 묶어 보이는 그릇 (list → list-item). 저장은 하지 않는다 — 항목은 흐름 줄의 text
 *           블록 그대로이고, 모델을 계산할 때 이어진 것끼리 묶는다. 그래서 항목이 목록에 들고 나는 것(빈 항목에서
 *           Enter, 문단 ↔ 목록)이 블록을 옮기는 연산 없이 종류 바꾸기 하나로 끝난다
 *   grid    행 × 열 (table). children 은 행 종류 하나. 행·열의 수는 정하지 않는다
 *   row     grid 의 행 (table-row). children 은 칸 종류 하나
 *   cell    행과 열이 만나는 칸 (table-cell). children 은 칸 안 흐름 그릇 하나 (table-cell-body)
 *   atom    안이 없는 블록 (구분선)
 *   span    값 서식이 같은 이어진 글자를 묶어 보이는 것 (inline-hyperlink — 링크 주소 서식). 저장은 글자마다의 서식이다
 */

export type Shape = "text" | "inline" | "flow" | "group" | "grid" | "row" | "cell" | "atom" | "span";

export type AttrSpec = {
    fields?: Record<string, AttrSpec>;
    default: unknown;
    /** 허용 값 목록 (없으면 아무 값) */
    values?: readonly unknown[];
    /** 숫자 범위 */
    min?: number;
    max?: number;
    /** Enter 로 나눈 새 블록이 이 값을 물려받는다 (목록의 수준 같은) */
    inherit?: boolean;
    /** 문자열 값의 정규식 (색 같은) */
    pattern?: string;
    /** 쓰지 않고 CRDT 가 계산해 내보내는 값 (표 칸의 colspan·rowspan·spanned) */
    computed?: boolean;
};

/** 편집기가 읽는 표시 정보. CRDT 와 검사는 보지 않는다 */
export type UiSpec = {
    label?: string;
    /** 목록 항목처럼 그린다 */
    list?: boolean;
    /** 비어 있을 때 흐리게 보일 글 */
    placeholder?: string;
    /** 한 종류를 속성 값마다 따로 고르게 보여 준다 (목록 항목의 listType → 글머리·번호) */
    variants?: {attr: string; labels: Record<string, string>};
};

type Common = {attrs?: Record<string, AttrSpec>; ui?: UiSpec};

export type TextSpec = Common & {
    shape: "text";
    /** 글자 말고 올 수 있는 inline 종류 */
    children?: readonly string[];
    /** false 면 글자를 받지 않는다 (image 는 inline-image 하나만 담는다) */
    text?: boolean;
    /** 블록 끝에서 Enter 를 치면 새 블록이 이 종류가 된다 (제목 → 문단). 없으면 같은 종류 */
    next?: string;
};

export type InlineSpec = Common & {shape: "inline"};

export type FlowSpec = Common & {
    childRules?: Record<string, ChildRule>;
    shape: "flow";
    /** 이 그릇의 줄에 올 수 있는 블록 종류 (group 이면 그 children 이 온다) */
    children: readonly string[];
    /** 줄의 첫 블록, 그리고 표·구분선 뒤에 저절로 생기는 빈 자리의 종류 (text 모양이어야 한다) */
    default: string;
};

export type GroupSpec = Common & {
    shape: "group";
    /** 묶을 항목 종류 (text 모양) */
    children: readonly string[];
    /** 이 항목 속성들이 같은 이어진 항목끼리 한 묶음. 묶음의 속성으로 보인다 (목록의 listType) */
    by: readonly string[];
};

export type GridSpec = Common & {
    shape: "grid";
    /** 행 종류 하나 */
    children: readonly [string];
};

export type RowSpec = Common & {
    shape: "row";
    /** 칸 종류 하나 (cell 모양) */
    children: readonly [string];
};

export type CellSpec = Common & {
    shape: "cell";
    /** 칸 안 흐름 그릇 하나 (flow 모양) */
    children: readonly [string];
};

export type AtomSpec = Common & {shape: "atom"};

export type SpanSpec = Common & {
    shape: "span";
    /** 묶는 기준인 값 서식 (markValues 의 이름) */
    mark: string;
    /** 묶음 노드에서 그 값을 담는 속성 이름 (inline-hyperlink 의 url) */
    attr: string;
};

export type NodeSpec = TextSpec | InlineSpec | FlowSpec | GroupSpec | GridSpec | RowSpec | CellSpec | AtomSpec | SpanSpec;

export type Schema = {
    /** 문서 맨 위 그릇 (flow 모양) */
    root: string;
    nodes: Record<string, NodeSpec>;
    /** 글자 서식 — 켜기/끄기 값 */
    marks: readonly string[];
    /** 값을 가진 글자 서식 (링크 주소 같은). 새로 친 글자는 inherit 인 것만 물려받는다 */
    markValues?: Record<string, AttrSpec>;
};

/** 표의 행·칸·칸 안 그릇 종류 */
export const gridParts = (schema: Schema, grid: string): {row: string; cell: string; body: string} | null => {
    const spec = schema.nodes[grid];
    const row = spec?.shape === "grid" ? spec.children[0] : undefined;
    const rowSpec = row ? schema.nodes[row] : undefined;
    const cell = rowSpec?.shape === "row" ? rowSpec.children[0] : undefined;
    const cellSpec = cell ? schema.nodes[cell] : undefined;
    const body = cellSpec?.shape === "cell" ? cellSpec.children[0] : undefined;

    return row && cell && body && schema.nodes[body]?.shape === "flow" ? {row, cell, body} : null;
};

/** 스키마 자체가 앞뒤가 맞는지 본다. 틀리면 설명 목록 */
export const checkSchema = (schema: Schema): string[] => {
    const problems: string[] = [];
    const shapeOf = (type: string) => schema.nodes[type]?.shape;
    const missing = (owner: string, list: readonly string[]) =>
        list.filter(c => !schema.nodes[c]).forEach(c => problems.push(`${owner}.children 의 "${c}" 가 없다`));

    shapeOf(schema.root) !== "flow" && problems.push(`root "${schema.root}" 는 flow 모양이어야 한다`);

    for (const [key, spec] of Object.entries(schema.markValues ?? {})) if (isFieldSpec(spec)) problems.push(`markValues.${key}.fields is not supported`);
    const cellBodies = new Set(Object.keys(schema.nodes).map(type => gridParts(schema, type)?.body).filter((type): type is string => !!type));
    for (const [type, spec] of Object.entries(schema.nodes)) {
        if ((type === schema.root || ["row", "group", "span"].includes(spec.shape) || cellBodies.has(type)) && Object.values(spec.attrs ?? {}).some(isFieldSpec)) problems.push(`${type}.attrs.fields is not supported at this model-only position`);
        problems.push(...fieldsSchemaProblems(spec.attrs ?? {}, `${type}.attrs`));
        for (const key of Object.keys(spec.attrs ?? {})) if (key.startsWith("$field:")) problems.push(`Reserved attribute name: ${key}`);
        if (/^\$/.test(type) || type === "col") {
            problems.push(`"${type}" 는 예약된 이름이다`);
        }

        switch (spec.shape) {
            case "flow":
                problems.push(...childRuleProblems(schema, type, spec));
                missing(type, spec.children);
                shapeOf(spec.default) !== "text" && problems.push(`${type}.default "${spec.default}" 는 text 모양이어야 한다`);
                storedTypes(schema, spec).includes(spec.default) || problems.push(`${type}.default 는 children 에 있어야 한다`);
                spec.children
                    .filter(c => ["inline", "row", "cell"].includes(shapeOf(c) ?? ""))
                    .forEach(c => problems.push(`${type}.children 에 ${shapeOf(c)} 모양 "${c}" 는 올 수 없다`));
                break;
            case "group":
                if (!spec.children.length) problems.push(`${type}.children must contain a text type`);
                missing(type, spec.children);
                spec.children.forEach(c => {
                    shapeOf(c) !== "text" && problems.push(`${type}.children 의 "${c}" 는 text 모양이어야 한다`);
                    spec.by.filter(k => !schema.nodes[c]?.attrs?.[k]).forEach(k => problems.push(`${type}.by 의 ${k} 는 ${c} 의 속성이어야 한다`));
                });
                break;
            case "grid":
                missing(type, spec.children);
                gridParts(schema, type) || problems.push(`${type} 는 grid > row > cell > flow 로 이어져야 한다`);
                break;
            case "row":
                missing(type, spec.children);
                shapeOf(spec.children[0]) !== "cell" && problems.push(`${type}.children 은 cell 모양 하나여야 한다`);
                break;
            case "cell":
                missing(type, spec.children);
                shapeOf(spec.children[0]) !== "flow" && problems.push(`${type}.children 은 flow 모양 하나여야 한다`);
                break;
            case "span":
                schema.markValues?.[spec.mark] || problems.push(`${type}.mark "${spec.mark}" 는 markValues 에 있어야 한다`);
                break;
            case "text":
                missing(type, spec.children ?? []);
                (spec.children ?? [])
                    .filter(c => shapeOf(c) !== "inline" && shapeOf(c) !== "span")
                    .forEach(c => problems.push(`${type}.children 의 "${c}" 는 inline·span 모양이어야 한다`));
                spec.next && shapeOf(spec.next) !== "text" && problems.push(`${type}.next "${spec.next}" 는 text 모양이어야 한다`);
                break;
        }
    }

    const visiting = new Set<string>(), checked = new Set<string>();
    const visit = (type: string): void => {
        if (visiting.has(type)) { problems.push(`Required child cycle at ${type}`); return; }
        if (checked.has(type)) return;
        visiting.add(type);
        const spec = schema.nodes[type];
        if (spec?.shape === "flow") for (const [child, rule] of Object.entries(spec.childRules ?? {})) if (rule && !Array.isArray(rule) && (rule.min ?? 0) > 0) {
            const target = schema.nodes[child];
            if (target?.shape === "flow") visit(child);
            else if (target?.shape === "grid") { const parts = gridParts(schema, child); if (parts) visit(parts.body); }
        }
        visiting.delete(type); checked.add(type);
    };
    Object.keys(schema.nodes).forEach(visit);
    return problems;
};

/** 흐름 줄에 실제로 저장되는 블록 종류 — group 은 그 항목 종류로 바꿔 읽는다 */
export const storedTypes = (schema: Schema, flow: FlowSpec): string[] =>
    flow.children.flatMap(c => {
        const spec = schema.nodes[c];

        return spec?.shape === "group" ? spec.children : [c];
    });

/** 흐름 줄의 text 블록들 안에 올 수 있는 inline 종류 */
export const inlineTypes = (schema: Schema, flow: FlowSpec): string[] => [
    ...new Set(
        storedTypes(schema, flow).flatMap(t => {
            const spec = schema.nodes[t];

            return spec?.shape === "text" ? (spec.children ?? []).filter(c => schema.nodes[c]?.shape === "inline") : [];
        }),
    ),
];

/** 흐름 줄에 글자를 받는 text 종류가 하나라도 있는가 */
export const acceptsText = (schema: Schema, flow: FlowSpec): boolean =>
    storedTypes(schema, flow).some(t => {
        const spec = schema.nodes[t];

        return spec?.shape === "text" && spec.text !== false;
    });

/** 항목 종류를 묶는 group (그 흐름 줄에서) */
export const groupOf = (schema: Schema, flow: FlowSpec, type: string): {type: string; spec: GroupSpec} | null => {
    for (const c of flow.children) {
        const spec = schema.nodes[c];

        if (spec?.shape === "group" && spec.children.includes(type)) {
            return {type: c, spec};
        }
    }

    return null;
};

/** 값이 속성 명세에 맞는가 */
export const attrValueOk = (spec: AttrSpec, value: unknown): boolean => {
    if (isFieldSpec(spec)) return fieldValueOk(spec, value);
    if (value === null) {
        return true;
    }

    if (spec.values && !spec.values.includes(value)) {
        return false;
    }

    if (spec.computed) {
        return false;
    }

    if (spec.pattern && (typeof value !== "string" || !new RegExp(spec.pattern).test(value))) {
        return false;
    }

    if (typeof spec.default === "number") {
        return typeof value === "number" && Number.isFinite(value) && value >= (spec.min ?? -Infinity) && value <= (spec.max ?? Infinity);
    }

    return spec.default === undefined || spec.default === null || typeof value === typeof spec.default;
};
