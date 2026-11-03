import {JsonReadBudget} from "./read-budget.ts";
import {entriesOf, visibleBlocks} from "./edit.ts";
import {attrValueOk, gridParts} from "./schema.ts";
import {isFieldSpec} from "./fields.ts";
import type {Block, Doc, TextBlock} from "./doc.ts";
import type {Marks} from "./model.ts";
import type {GroupSpec, SpanSpec} from "./schema.ts";
import type {SliceQuery} from "./read.ts";

function definedJSONKeys(value: object): string[] {
    return Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined);
}

// JSON object key order is significant to the canonical compiler's mark signature.
const sameJSON = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameJSON(value, b[i]));
    const left = definedJSONKeys(a), right = definedJSONKeys(b);
    return left.length === right.length && left.every((key, i) => key === right[i] && sameJSON((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
};

/** Walk borrowed CRDT values before any raw model/runs or detached attribute clones are built. */
export class SlicePreflight {
    readonly json: JsonReadBudget;
    nodes = 0;
    textUnits = 0;
    private readonly spans: Array<{type: string; spec: SpanSpec}>;
    private readonly doc: Doc;
    private readonly q: Required<SliceQuery>;
    constructor(doc: Doc, q: Required<SliceQuery>) {
        this.doc = doc; this.q = q;
        this.json = new JsonReadBudget(q.maxBytes);
        this.spans = Object.entries(doc.schema!.nodes).flatMap(([type, spec]) => spec.shape === "span" ? [{type, spec}] : []);
    }
    private header(value: unknown, depth: number): void {
        if (depth > 32) throw new Error("Slice subtree exceeds depth budget");
        if (++this.nodes > this.q.maxNodes) throw new Error("Slice exceeds node budget before projection");
        this.json.value(value);
    }
    private attrs(type: string, source: Record<string, unknown>, excluded: readonly string[] = []): Record<string, unknown> | undefined {
        const out: Record<string, unknown> = {};
        for (const [key, spec] of Object.entries(this.doc.schema!.nodes[type]?.attrs ?? {})) {
            if (spec.computed || excluded.includes(key)) continue;
            const value = source[key];
            this.doc.checkReadValue(value);
            const normalized = isFieldSpec(spec) ? value : value === undefined || value === null || !attrValueOk(spec, value) ? spec.default : value;
            this.doc.checkReadValue(normalized);
            out[key] = normalized;
        }
        return Object.keys(out).length ? out : undefined;
    }
    private nodeHeader(type: string, depth: number, attrs?: Record<string, unknown>): void { this.header({type, ...(attrs && {attrs})}, depth); }
    private array(key: "children" | "runs"): void { this.json.add(key === "children" ? ',"children":[]'.length : ',"runs":[]'.length); }
    entry(blocks: Block[], group: string | null, depth: number, parentGroup: string | null = null): void {
        if (group) {
            const by = (this.doc.schema!.nodes[group] as GroupSpec).by;
            const first = this.attrs(blocks[0].type, blocks[0].attrs);
            const attrs = Object.fromEntries(by.map(key => [key, first?.[key]]));
            this.nodeHeader(group, depth, by.length ? attrs : undefined); this.array("children");
            blocks.forEach((block, i) => { if (i) this.json.add(1); this.block(block, depth + 1, by); });
        } else this.block(blocks[0], depth, parentGroup ? (this.doc.schema!.nodes[parentGroup] as GroupSpec).by : []);
    }
    private flow(line: string, depth: number): void {
        const blocks = this.doc.blocks(line), visible = visibleBlocks(this.doc, line);
        entriesOf(this.doc, line).forEach((entry, i) => {
            if (i) this.json.add(1);
            this.entry(entry.flats.map(flat => blocks[visible[flat]]), entry.group, depth);
        });
    }
    private block(block: Block, depth: number, excluded: readonly string[] = []): void {
        if (depth > 32) throw new Error("Slice subtree exceeds depth budget");
        this.nodeHeader(block.type, depth, this.attrs(block.type, block.attrs, excluded));
        if (block.kind === "text") { this.array("runs"); this.text(block, depth); }
        else if (block.kind === "flow") { this.array("children"); this.flow(block.body, depth + 1); }
        else if (block.kind === "grid") {
            this.array("children");
            const parts = gridParts(this.doc.schema!, block.type)!;
            block.rows.forEach((row, r) => {
                if (r) this.json.add(1);
                this.nodeHeader(parts.row, depth + 1); this.array("children");
                block.cols.forEach((col, c) => {
                    if (c) this.json.add(1);
                    const span = block.spans.get(`${r},${c}`);
                    const attrs: Record<string, unknown> = span ? {colspan: span[1], rowspan: span[0]} : block.covered.has(`${r},${c}`) ? {spanned: true} : {};
                    const stored = this.doc.cellAttrs(block, row, col);
                    for (const [key, spec] of Object.entries(this.doc.schema!.nodes[parts.cell]?.attrs ?? {})) {
                        if (spec.computed) continue;
                        const value = stored[key]; this.doc.checkReadValue(value);
                        if (isFieldSpec(spec)) attrs[key] = value;
                        else if (value !== undefined && value !== null && value !== spec.default && attrValueOk(spec, value)) attrs[key] = value;
                    }
                    this.nodeHeader(parts.cell, depth + 2, Object.keys(attrs).length ? attrs : undefined); this.array("children");
                    this.nodeHeader(parts.body, depth + 3); this.array("children");
                    this.flow(this.doc.cellKey(block.marker, row, col), depth + 4);
                });
            });
        }
    }
    private text(block: TextBlock, depth: number): void {
        let topRuns = 0, spanRuns = 0;
        let active: {type: string; spec: SpanSpec; value: unknown} | null = null;
        let lastMarks: Marks | null = null, pendingHigh = false;
        const finishText = (): void => { if (pendingHigh) this.json.add(6); pendingHigh = false; lastMarks = null; };
        const textPart = (text: string): void => {
            this.textUnits += text.length;
            if (this.textUnits > this.q.maxTextUnits) throw new Error("Slice exceeds text budget before projection");
            for (let i = 0; i < text.length; i++) {
                const c = text.charCodeAt(i);
                if (pendingHigh) {
                    pendingHigh = false;
                    if (c >= 0xdc00 && c <= 0xdfff) { this.json.add(4); continue; }
                    this.json.add(6);
                }
                if (c >= 0xd800 && c <= 0xdbff) pendingHigh = true;
                else if (c >= 0xdc00 && c <= 0xdfff) this.json.add(6);
                else if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) this.json.add(2);
                else if (c < 32) this.json.add(6);
                else this.json.add(c < 128 ? 1 : c < 2048 ? 2 : 3);
            }
        };
        for (const item of block.chars) {
            if (item.kind !== "char") {
                finishText(); active = null;
                if (topRuns++) this.json.add(1);
                this.nodeHeader(item.born, depth + 1, this.attrs(item.born, this.doc.attrsOf(item, item.born)));
                continue;
            }
            const marks = this.doc.marksOf(item); this.doc.checkReadValue(marks);
            const span = this.spans.find(span => marks[span.spec.mark] !== undefined);
            if (span) {
                const value = marks[span.spec.mark];
                if (!active || active.type !== span.type || active.value !== value) {
                    finishText();
                    if (topRuns++) this.json.add(1);
                    this.nodeHeader(span.type, depth + 1, {[span.spec.attr]: value}); this.array("runs");
                    active = {...span, value}; spanRuns = 0;
                }
            } else if (active) { finishText(); active = null; }
            const plain = {...marks}; if (active) delete plain[active.spec.mark];
            if (!lastMarks || !sameJSON(lastMarks, plain)) {
                finishText();
                if (active ? spanRuns++ : topRuns++) this.json.add(1);
                this.header({text: "", marks: plain}, depth + (active ? 2 : 1)); lastMarks = plain;
            }
            textPart(item.ch);
        }
        finishText();
    }
}
