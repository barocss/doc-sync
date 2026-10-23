import {Node as PmNode} from "prosemirror-model";
import {EditorState, Plugin, TextSelection} from "prosemirror-state";
import {AddMarkStep, RemoveMarkStep, ReplaceStep} from "prosemirror-transform";
import {Decoration, DecorationSet} from "prosemirror-view";
import * as cmd from "../crdt/commands.ts";
import {anchorAt, pathAt, posOfPath} from "../crdt/edit.ts";
import {canonical, diffModels} from "../crdt/model.ts";
import {fromPmJSON, pathToPmPos, pmPosToPath, toPmJSON} from "./convert.ts";
import type {Mark, Slice} from "prosemirror-model";
import type {Transaction} from "prosemirror-state";
import type {Step} from "prosemirror-transform";
import type {EditorView} from "prosemirror-view";
import type {Doc, Op} from "../crdt/doc.ts";
import type {EditOp, NodeJSON, Run} from "../crdt/model.ts";
import type {SyncClient} from "../sync/client.ts";
import type {PmSchemaInfo} from "./schema.ts";

/**
 * ProseMirror 편집기 ↔ SyncClient.
 *
 * 보내는 쪽: ProseMirror transaction 의 Step 을 하나씩 모델 연산으로 옮긴다. 흔한 것은 뜻을 살려 옮긴다 —
 *   한 블록 안 글 넣기·지우기 → insert·delete,  Enter(splitBlock) → split,  블록 맨 앞 Backspace(join) → merge,
 *   여러 블록에 걸친 지우기 → 지우기 + merge,  서식 → update.
 * 나머지(블록 종류 바꾸기, 표 행·열, 붙여 넣기 …)는 Step 앞·뒤 모델을 비교해 옮긴다 (diffModels). 표 열은 그러면 행마다
 * 칸 넣기가 되고, CRDT 가 열 하나로 접는다.
 * 옮긴 뒤 두 문서를 맞춰 본다. 다르면 우리 쪽을 ProseMirror 에 맞추고, 그래도 다르면(CRDT 규칙 — 흐름은 글 블록으로 시작,
 * 들쭉날쭉한 열은 열 하나로 …) ProseMirror 를 우리 쪽에 맞춘다.
 *
 * 받는 쪽: 남의 변경·되돌리기로 모델이 바뀌면, ProseMirror 문서와 새 문서의 차이 구간만 교체하는 transaction 하나를 만든다.
 * 내 커서·선택은 ProseMirror 가 그 Step 을 따라 옮긴다. 바꾸는 구간이 최소라 조합 중인 글과 겹치지 않으면 조합은 이어진다.
 * (조합 중에 미루면 미룬 사이 내 편집의 위치가 우리 모델과 어긋난다 — 그래서 미루지 않는다)
 *
 * 되돌리기: ProseMirror history 는 쓰지 않는다. CRDT 의 참여자별 되돌리기(내 편집만)를 쓴다.
 */

/** 남의 변경을 ProseMirror 에 넣는 transaction 표시 — 이 transaction 은 다시 CRDT 로 보내지 않는다 */
const REMOTE_META = "doc-sync";

export type BindingStats = {steps: Record<string, number>; reconciled: number; pushedBack: number; remote: number; wholeReplace: number};

export class PmBinding {
    readonly client: SyncClient;
    readonly info: PmSchemaInfo;
    state: EditorState;
    view: EditorView | null = null;
    readonly stats: BindingStats = {steps: {}, reconciled: 0, pushedBack: 0, remote: 0, wholeReplace: 0};
    /** 상태가 바뀔 때 (편집기를 다시 그린다) */
    onChange: (() => void) | null = null;
    /** 내 커서 (presence 로 보낼 것) */
    onSelection: ((anchor: string | null, focus: string | null) => void) | null = null;
    /** Binding-only snapshots. Conversion and position helpers read these values without mutating them. */
    private cached: {doc: Doc; version: number; model: NodeJSON; pm: PmNode | null} | null = null;

    constructor(client: SyncClient, info: PmSchemaInfo, plugins: Plugin[] = []) {
        this.client = client;
        this.info = info;
        this.state = EditorState.create({doc: this.crdtDoc(), plugins: [...plugins, this.cursorPlugin()]});
        // 남의 변경·되돌리기·스냅숏 → ProseMirror 로
        client.onModelEvents = () => this.pull();
    }

    private get schema() {
        return this.client.schema;
    }

    private documentCache() {
        const doc = this.client.doc;

        // Snapshot/reset and the IME facade can replace Doc while retaining the same version number.
        if (!this.cached || this.cached.doc !== doc || this.cached.version !== doc.version) {
            this.cached = {doc, version: doc.version, model: doc.toJSON(), pm: null};
        }

        return this.cached;
    }

    private model(): NodeJSON {
        return this.documentCache().model;
    }

    /** CRDT 모델을 ProseMirror 문서로. PM nodes are persistent values shared by transactions. */
    private crdtDoc(): PmNode {
        const cache = this.documentCache();

        return cache.pm ??= PmNode.fromJSON(this.info.pm, toPmJSON(this.schema, cache.model));
    }

    // ── 보내는 쪽 ────────────────────────────────────────────────────────

    /** 편집기의 transaction 을 받는다 (EditorView 의 dispatchTransaction, 또는 시험에서 직접) */
    dispatch = (tr: Transaction): void => {
        if (!tr.docChanged || tr.getMeta(REMOTE_META) === "remote") {
            this.state = this.state.apply(tr);
            this.afterChange();

            return;
        }

        const caretBefore = this.anchorOfPm(this.state.doc, this.state.selection.head);
        const ops: Op[] = [];

        tr.steps.forEach((step, i) => ops.push(...this.translate(step, tr.docs[i], tr.docs[i + 1] ?? tr.doc)));
        this.state = this.state.apply(tr);
        ops.push(...this.reconcile());

        const single = tr.steps.length === 1 && tr.steps[0] instanceof ReplaceStep && (tr.steps[0] as ReplaceStep).slice.size === 1;

        this.client.commit(ops, {caretBefore: caretBefore ?? "", caretAfter: this.anchorOfPm(this.state.doc, this.state.selection.head) ?? "", typing: single});
        this.afterChange();
    };

    /** Step 하나 → 모델 연산 → 전선 연산 */
    private translate(step: Step, before: PmNode, after: PmNode): Op[] {
        const model = this.model();
        const kind = this.kindOf(step, before);
        const count = (k: string) => (this.stats.steps[k] = (this.stats.steps[k] ?? 0) + 1);

        count(kind);

        if (kind === "text") {
            const s = step as ReplaceStep;
            const at = pmPosToPath(this.schema, before, s.from, model);
            const edits: EditOp[] = [];

            s.to > s.from && edits.push({op: "delete", at, count: s.to - s.from});
            s.slice.size && edits.push({op: "insert", at, content: this.runsOf(s.slice)});

            return this.client.doc.edit(edits).ops;
        }

        if (kind === "split") {
            return this.client.doc.edit([{op: "split", at: pmPosToPath(this.schema, before, (step as ReplaceStep).from, model)}]).ops;
        }

        if (kind === "join") {
            const at = pmPosToPath(this.schema, before, (step as ReplaceStep).to, model);

            return this.client.doc.edit([{op: "merge", at: at.slice(0, -1)}]).ops;
        }

        if (kind === "range") {
            const s = step as ReplaceStep;
            const from = posOfPath(this.client.doc, pmPosToPath(this.schema, before, s.from, model));
            const to = posOfPath(this.client.doc, pmPosToPath(this.schema, before, s.to, model));

            return from && to ? cmd.deleteRange(this.client.doc, from, to) : this.byDiff(after, model);
        }

        if (kind === "mark") {
            const s = step as AddMarkStep | RemoveMarkStep;
            const edits: EditOp[] = [];
            const value = this.markValue(s.mark, s instanceof AddMarkStep);

            before.nodesBetween(s.from, s.to, (node, pos) => {
                if (!node.isTextblock) {
                    return true;
                }

                const start = Math.max(s.from, pos + 1);
                const end = Math.min(s.to, pos + 1 + node.content.size);

                end > start && edits.push({op: "update", at: pmPosToPath(this.schema, before, start, model), attrs: {[s.mark.type.name]: value}, length: end - start});

                return false;
            });

            return this.client.doc.edit(edits).ops;
        }

        return this.byDiff(after, model);
    }

    /** 흔한 Step 을 알아본다. 모르면 "diff" */
    private kindOf(step: Step, before: PmNode): string {
        if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
            return this.schema.marks.includes(step.mark.type.name) || this.schema.markValues?.[step.mark.type.name] ? "mark" : "diff";
        }

        if (!(step instanceof ReplaceStep)) {
            return "diff";
        }

        const {from, to, slice} = step;
        const $from = before.resolve(from);
        const $to = before.resolve(to);

        if ($from.parent.isTextblock && $from.sameParent($to) && slice.openStart === 0 && slice.openEnd === 0) {
            let inline = true;

            slice.content.forEach(n => (inline &&= n.isInline));

            if (inline) {
                return "text";
            }
        }

        if (
            from === to &&
            $from.parent.isTextblock &&
            slice.openStart === 1 &&
            slice.openEnd === 1 &&
            slice.content.childCount === 2 &&
            slice.content.child(0).isTextblock &&
            slice.content.child(1).isTextblock &&
            slice.content.child(0).content.size === 0 &&
            slice.content.child(1).content.size === 0
        ) {
            return "split";
        }

        if (slice.size === 0 && $from.parent.isTextblock && $to.parent.isTextblock && !$from.sameParent($to) && $from.depth === $to.depth && $from.node($from.depth - 1) === $to.node($to.depth - 1)) {
            const siblings = $from.index($from.depth - 1) + 1 === $to.index($to.depth - 1);

            return siblings && from === $from.end() && to === $to.start() ? "join" : "range";
        }

        return "diff";
    }

    private markValue(mark: Mark, add: boolean): unknown {
        if (this.schema.markValues?.[mark.type.name]) {
            return add ? mark.attrs.value : null;
        }

        return add ? true : false;
    }

    /** ProseMirror 조각의 inline 내용 → 우리 조각 */
    private runsOf(slice: Slice): Run[] {
        const runs: Run[] = [];

        slice.content.forEach(node => {
            if (node.isText) {
                const marks: Record<string, unknown> = {};

                node.marks.forEach(m => (marks[m.type.name] = this.schema.markValues?.[m.type.name] ? m.attrs.value : true));
                runs.push({text: node.text ?? "", marks});
            } else {
                runs.push({type: this.info.ours.get(node.type.name) ?? node.type.name, attrs: {...node.attrs}});
            }
        });

        return runs;
    }

    /** Step 뒤 ProseMirror 문서와 우리 모델을 비교해 옮긴다 */
    private byDiff(after: PmNode, model: NodeJSON): Op[] {
        const target = canonical(this.schema, fromPmJSON(this.info, this.schema, after.toJSON(), model));
        const edits = diffModels(this.schema, model, target);

        return edits.length ? this.client.doc.edit(edits).ops : [];
    }

    /**
     * 두 문서를 맞춘다. 다르면 먼저 우리 쪽을 ProseMirror 에 맞추고(비교로), 그래도 다르면 ProseMirror 를 우리 쪽에 맞춘다.
     * @returns 우리 쪽을 고친 전선 연산
     */
    private reconcile(): Op[] {
        if (this.crdtDoc().eq(this.state.doc)) {
            return [];
        }

        this.stats.reconciled += 1;

        const ops = this.byDiff(this.state.doc, this.model());

        if (!this.crdtDoc().eq(this.state.doc)) {
            this.stats.pushedBack += 1;
            this.pull();
        }

        return ops;
    }

    // ── 받는 쪽 ──────────────────────────────────────────────────────────

    /** CRDT 문서를 ProseMirror 로 — 차이 구간만 바꾸는 transaction 하나 */
    pull(): void {
        const target = this.crdtDoc();
        const doc = this.state.doc;
        const start = doc.content.findDiffStart(target.content);

        if (start === null) {
            this.afterChange();

            return;
        }

        let {a, b} = doc.content.findDiffEnd(target.content)!;

        // 겹치면 줄인다 (같은 글자가 이어질 때)
        if (a < start) {
            b += start - a;
            a = start;
        }

        if (b < start) {
            a += start - b;
            b = start;
        }

        let tr = this.state.tr.replace(start, a, target.slice(start, b));

        // ProseMirror 가 조각을 끼워 맞추며 모양을 바꿨으면(드묾) 바뀐 맨 위 블록들만 통째로, 그래도 안 되면 문서 전체를
        if (!tr.doc.eq(target)) {
            tr = this.replaceBlocks(doc, target);
        }

        if (!tr.doc.eq(target)) {
            this.stats.wholeReplace += 1;
            tr = this.state.tr.replaceWith(0, doc.content.size, target.content);
        }

        tr.setMeta(REMOTE_META, "remote");
        tr.setMeta("addToHistory", false);
        this.state = this.state.apply(tr);
        this.stats.remote += 1;
        this.afterChange();
    }

    /** 맨 위 자식 가운데 앞·뒤로 같은 것을 남기고 가운데 블록들만 바꾼다 */
    private replaceBlocks(doc: PmNode, target: PmNode): Transaction {
        let head = 0;

        while (head < doc.childCount && head < target.childCount && doc.child(head).eq(target.child(head))) {
            head += 1;
        }

        let tail = 0;

        while (
            tail < doc.childCount - head &&
            tail < target.childCount - head &&
            doc.child(doc.childCount - 1 - tail).eq(target.child(target.childCount - 1 - tail))
        ) {
            tail += 1;
        }

        const offset = (node: PmNode, count: number) => {
            let pos = 0;

            for (let i = 0; i < count; i += 1) {
                pos += node.child(i).nodeSize;
            }

            return pos;
        };
        const from = offset(doc, head);
        const to = offset(doc, doc.childCount - tail);
        const nodes: PmNode[] = [];

        for (let i = head; i < target.childCount - tail; i += 1) {
            nodes.push(target.child(i));
        }

        return this.state.tr.replaceWith(from, to, nodes);
    }

    // ── 되돌리기 · 커서 ──────────────────────────────────────────────────

    undo(): void {
        const caret = this.client.undo();

        this.pull();
        caret && this.select(caret);
    }

    redo(): void {
        const caret = this.client.redo();

        this.pull();
        caret && this.select(caret);
    }

    /** 토큰 키 자리로 커서를 옮긴다 */
    private select(key: string): void {
        const path = pathAt(this.client.doc, key);

        if (!path) {
            return;
        }

        const pos = pathToPmPos(this.schema, this.state.doc, path, this.model());

        try {
            this.state = this.state.apply(this.state.tr.setSelection(TextSelection.create(this.state.doc, pos)));
        } catch {
            // 글 자리가 아니면 두지 않는다
        }

        this.afterChange();
    }

    /** ProseMirror 위치 → 토큰 키 */
    private anchorOfPm(doc: PmNode, pos: number): string | null {
        try {
            // AllSelection 의 문서 바깥 경계도 첫/마지막 글자 자리로 보낸다.
            const $pos = doc.resolve(pos);
            const target = $pos.parent.inlineContent ? pos : TextSelection.near($pos, pos === doc.content.size ? -1 : 1).head;

            return anchorAt(this.client.doc, pmPosToPath(this.schema, doc, target, this.model()));
        } catch {
            return null;
        }
    }

    private afterChange(): void {
        const {anchor, head} = this.state.selection;
        const a = this.anchorOfPm(this.state.doc, head);
        const f = anchor !== head ? this.anchorOfPm(this.state.doc, anchor) : null;

        this.onSelection?.(a, f);
        this.onChange?.();
    }

    /** 남의 선택 — anchor 는 활성 끝, focus 는 반대 끝이다. 매번 토큰을 현재 문서 위치로 푼다. */
    private cursorPlugin(): Plugin {
        return new Plugin({
            props: {
                decorations: state => {
                    const model = this.model();
                    const decorations: Decoration[] = [];
                    const endpoint = (key: string | null): number | null => {
                        const item = key ? this.client.doc.get(key) : null;

                        const doc = this.client.doc;
                        const visible = doc.hasMoves || doc.hasCardinality ? key && doc.tokenLocation(key)?.visible : item && doc.visible(item.line.key);
                        if (!key || !item || !visible) {
                            return null;
                        }

                        try {
                            const path = pathAt(this.client.doc, key);
                            const pos = path && pathToPmPos(this.schema, state.doc, path, model);

                            return typeof pos === "number" && pos >= 0 && pos <= state.doc.content.size ? pos : null;
                        } catch {
                            return null;
                        }
                    };

                    for (const p of this.client.online ? this.client.others.values() : []) {
                        const pos = endpoint(p.anchor);
                        const focus = endpoint(p.focus);

                        if (pos === null) {
                            continue;
                        }

                        if (focus !== null && focus !== pos) {
                            decorations.push(Decoration.inline(Math.min(pos, focus), Math.max(pos, focus), {
                                nodeName: "span",
                                class: "pm-remote-selection",
                                style: `--who:${p.color};background-color:color-mix(in srgb, var(--who) 20%, transparent)`,
                                "data-actor": p.actor,
                                "data-name": p.name,
                            }, {actor: p.actor, kind: "selection"}));
                        }

                        decorations.push(Decoration.widget(pos, () => {
                            const dom = document.createElement("span");

                            dom.className = "pm-remote-caret";
                            dom.style.setProperty("--who", p.color);
                            dom.dataset.actor = p.actor;
                            dom.dataset.name = p.name;
                            dom.title = `${p.name} · ${focus !== null && focus !== pos ? "선택 중" : "커서"}`;

                            return dom;
                        }, {key: `${p.actor}:${p.name}:${p.color}:${focus !== null && focus !== pos}`, side: 1, actor: p.actor, kind: "caret"}));
                    }

                    return DecorationSet.create(state.doc, decorations);
                },
            },
        });
    }
}
