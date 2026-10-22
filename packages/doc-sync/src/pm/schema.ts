import {Schema} from "prosemirror-model";
import {gridParts, storedTypes} from "../crdt/schema.ts";
import type {DOMOutputSpec, MarkSpec, Node as PmNode, NodeSpec as PmNodeSpec} from "prosemirror-model";
import type {FlowSpec, NodeSpec, Schema as DocSchema} from "../crdt/schema.ts";

/**
 * 우리 스키마 → ProseMirror 스키마. 모양마다 ProseMirror 노드 꼴이 정해진다.
 *
 *   flow   → 블록들을 담는 노드 (문서 맨 위, 상자, 이미지 그릇). 표 칸은 칸 노드가 그 몸(flow)의 자식을 바로 담는다
 *   text   → textblock. 목록 항목도 textblock 하나 — 목록은 평평하다 (listType·level 속성). 그래서 항목이 목록에
 *            들고 나는 것이 노드 옮기기가 아니라 속성 바꾸기다
 *   group  → ProseMirror 에는 없다 (목록·캡션은 그 항목들이 흐름에 바로 들어간다)
 *   grid · row · cell → prosemirror-tables 의 table · table_row · table_cell (colspan·rowspan·colwidth)
 *   inline → inline atom, atom → leaf block
 *   켜기/끄기 서식 → 속성 없는 mark, 값 서식(link) → 속성 하나짜리 mark
 *
 * 이름의 "-" 는 "_" 로 바꾼다 (ProseMirror 의 content 식은 "-" 를 못 쓴다).
 */

export const pmName = (type: string): string => type.replace(/-/g, "_");

export type PmSchemaInfo = {
    pm: Schema;
    /** ProseMirror 이름 → 우리 이름 */
    ours: Map<string, string>;
};

/** 화면 꼴 — 종류마다 고를 수 있다 (없으면 div + class) */
export type DomHints = Record<string, (node: PmNode) => DOMOutputSpec>;

export const buildPmSchema = (schema: DocSchema, dom: DomHints = {}): PmSchemaInfo => {
    const ours = new Map<string, string>();
    const nodes: Record<string, PmNodeSpec> = {};
    const flowContent = (flow: FlowSpec) => `(${storedTypes(schema, flow).map(pmName).join(" | ")})+`;
    const attrsOf = (spec: NodeSpec, extra: Record<string, {default: unknown}> = {}) => ({
        ...Object.fromEntries(
            Object.entries(spec.attrs ?? {})
                .filter(([, a]) => !a.computed)
                .map(([k, a]) => [k, {default: a.default}]),
        ),
        ...extra,
    });
    const toDOM = (type: string, fallback: (node: PmNode) => DOMOutputSpec) => dom[type] ?? fallback;

    // 문서 맨 위가 먼저
    const order = [schema.root, ...Object.keys(schema.nodes).filter(t => t !== schema.root)];

    for (const type of order) {
        const spec = schema.nodes[type];
        const name = pmName(type);

        ours.set(name, type);

        switch (spec.shape) {
            case "flow":
                nodes[name] = {
                    content: flowContent(spec),
                    attrs: attrsOf(spec),
                    defining: true,
                    toDOM: toDOM(type, () => ["div", {class: `pm-${name}`}, 0]),
                };
                break;
            case "text": {
                const inline = (spec.children ?? []).filter(c => schema.nodes[c]?.shape === "inline").map(pmName);
                const parts = [...(spec.text === false ? [] : ["text"]), ...inline];

                nodes[name] = {
                    content: parts.length ? `(${parts.join(" | ")})*` : "",
                    attrs: attrsOf(spec),
                    // 글자를 받지 않는 블록(그림)에는 서식도 없다
                    marks: spec.text === false ? "" : "_",
                    toDOM: toDOM(type, () => ["div", {class: `pm-${name}`}, 0]),
                };
                break;
            }
            case "inline":
                nodes[name] = {
                    inline: true,
                    atom: true,
                    attrs: attrsOf(spec),
                    toDOM: toDOM(type, () => ["span", {class: `pm-${name}`}]),
                };
                break;
            case "atom":
                nodes[name] = {atom: true, attrs: attrsOf(spec), toDOM: toDOM(type, () => ["div", {class: `pm-${name}`}])};
                break;
            case "grid": {
                const parts = gridParts(schema, type)!;
                const body = schema.nodes[parts.body] as FlowSpec;
                const cellSpec = schema.nodes[parts.cell];

                nodes[name] = {
                    content: `${pmName(parts.row)}+`,
                    attrs: attrsOf(spec),
                    tableRole: "table",
                    isolating: true,
                    toDOM: toDOM(type, () => ["table", ["tbody", 0]]),
                };
                nodes[pmName(parts.row)] = {content: `${pmName(parts.cell)}+`, tableRole: "row", toDOM: () => ["tr", 0]};
                ours.set(pmName(parts.row), parts.row);
                nodes[pmName(parts.cell)] = {
                    content: flowContent(body),
                    attrs: attrsOf(cellSpec, {colspan: {default: 1}, rowspan: {default: 1}, colwidth: {default: null}}),
                    tableRole: "cell",
                    isolating: true,
                    toDOM: toDOM(parts.cell, node => {
                        const attrs: Record<string, string> = {};

                        node.attrs.colspan > 1 && (attrs.colspan = String(node.attrs.colspan));
                        node.attrs.rowspan > 1 && (attrs.rowspan = String(node.attrs.rowspan));
                        node.attrs.backgroundColor && (attrs.style = `background:${node.attrs.backgroundColor}`);

                        return ["td", attrs, 0];
                    }),
                };
                ours.set(pmName(parts.cell), parts.cell);
                break;
            }
            default:
                // group · row · cell · span — 따로 만들거나(표) ProseMirror 에 없다(묶음)
                break;
        }
    }

    nodes.text = {group: "inline"};

    const marks: Record<string, MarkSpec> = {};

    schema.marks.forEach(m => (marks[m] = {toDOM: () => [MARK_TAG[m] ?? "span", {class: `pm-mark-${m}`}, 0]}));
    Object.entries(schema.markValues ?? {}).forEach(([m]) => {
        marks[m] = {
            attrs: {value: {}},
            inclusive: false,
            toDOM: mark => (m === "link" ? ["a", {href: String(mark.attrs.value), class: "pm-link"}, 0] : ["span", {"data-value": String(mark.attrs.value)}, 0]),
        };
    });

    return {pm: new Schema({nodes, marks, topNode: pmName(schema.root)}), ours};
};

const MARK_TAG: Record<string, string> = {bold: "strong", italic: "em", underline: "u", strike: "s"};
