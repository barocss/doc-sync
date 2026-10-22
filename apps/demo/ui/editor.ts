import {commands as cmd} from "@barocss/doc-sync";
import {inheritedMarks} from "@barocss/doc-sync";
import {MAIN, comparePos, samePos} from "@barocss/doc-sync";
import {keyOf} from "@barocss/doc-sync";
import {rangeContains, resolvePresence} from "./presence.ts";
import type {Block, GridBlock, Marks, Op, Pos, TextBlock} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";
import type {SyncClient} from "@barocss/doc-sync/sync";

/**
 * 아주 작은 편집기. contenteditable 을 쓰지 않고 문서를 직접 그린다 — 어떤 키가 어떤 CRDT 연산이 되는지가 그대로 보이도록.
 * 무엇을 그릴 수 있는지(블록 종류·서식·넣을 수 있는 것)는 주입된 스키마에서 읽는다.
 *
 * 커서는 화면 좌표가 아니라 "토큰 바로 뒤"로 기억한다(anchor). 남의 편집이 앞에 끼어들어도 커서는 같은 글자 뒤에 남는다.
 * 표 칸·상자 안도 각자 줄이라 커서는 언제나 어느 줄의 어느 토큰 뒤에 있다.
 * 글자 입력은 숨긴 textarea 로 받는다 — 한글 같은 조합 입력(IME)을 브라우저가 처리하게 두기 위해서다.
 */

export const COLORS: Record<string, string> = {
    A: "#2563eb",
    B: "#db2777",
    C: "#059669",
    D: "#d97706",
    E: "#7c3aed",
    F: "#0891b2",
    G: "#dc2626",
    H: "#65a30d",
    I: "#c026d3",
    J: "#475569",
};

const MARK_BUTTON: Record<string, {label: string; title: string; key: string; shift?: boolean}> = {
    bold: {label: "B", title: "굵게 (⌘B)", key: "b"},
    italic: {label: "I", title: "기울임 (⌘I)", key: "i"},
    underline: {label: "U", title: "밑줄 (⌘U)", key: "u"},
    strike: {label: "S", title: "취소선 (⌘⇧X)", key: "x", shift: true},
};

/** 칸 배경색 고르기 (빈 값 = 없음) */
const CELL_COLORS = ["", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3"];

/** 종류 고르기의 값 — "종류" 또는 "종류:속성값" (목록 항목의 글머리·번호) */
type TypeChoice = {value: string; label: string; type: string; attrs: Record<string, unknown>};

const lineOf = (pos: Pos): string => pos.line ?? MAIN;

const at = (line: string, b: number, o: number): Pos => (line === MAIN ? {b, o} : {line, b, o});

export class Editor {
    readonly client: SyncClient;
    readonly name: string;
    readonly color: string;
    /** 커서 — 이 토큰 바로 뒤 */
    anchor: string;
    /** 선택 영역의 다른 끝 (없으면 선택 없음). 같은 줄 안에서만 선택된다 */
    focus: string | null = null;
    /** 선택 없이 서식 단추를 눌렀을 때, 다음에 칠 글자의 서식 */
    private typingMarks: Marks | null = null;
    private composing = "";
    private readonly surface: HTMLElement;
    private readonly input: HTMLTextAreaElement;
    private readonly typeSelect: HTMLSelectElement;
    private readonly insertSelect: HTMLSelectElement;
    private linkInput: HTMLInputElement | null = null;
    private readonly markButtons = new Map<string, HTMLButtonElement>();
    private readonly undoButton: HTMLButtonElement;
    private readonly redoButton: HTMLButtonElement;
    private readonly tableTools: HTMLElement;
    private readonly boxTools: HTMLElement;
    private readonly boxLabel: HTMLElement;
    private readonly toneButton: HTMLButtonElement;
    private readonly sizeButton: HTMLButtonElement;
    private dragging = false;
    private presenceTimer = 0;

    constructor(container: HTMLElement, client: SyncClient, name: string) {
        this.client = client;
        this.name = name;
        this.color = COLORS[client.actor.slice(0, 1)] ?? "#64748b";
        this.anchor = MAIN;

        container.innerHTML = "";
        container.style.setProperty("--me", this.color);

        const tools = el("div", "tools");

        this.typeSelect = el("select", "type-select") as HTMLSelectElement;
        this.typeSelect.title = "블록 종류";
        this.typeSelect.addEventListener("change", () => this.chooseType(this.typeSelect.value));
        this.insertSelect = el("select", "insert-select") as HTMLSelectElement;
        this.insertSelect.title = "넣기";
        this.insertSelect.addEventListener("change", () => {
            this.insertChoice(this.insertSelect.value);
            this.insertSelect.value = "";
        });
        tools.append(this.typeSelect);
        this.schema.marks.forEach(key => {
            const spec = MARK_BUTTON[key] ?? {label: key.slice(0, 1).toUpperCase(), title: key, key: ""};
            const b = button(spec.label, () => this.toggleMark(key));

            b.classList.add("mark-btn", key);
            b.title = spec.title;
            this.markButtons.set(key, b);
            tools.append(b);
        });
        tools.append(this.insertSelect);

        // 링크 — 스키마에 값 서식 link 가 있을 때만
        if (this.schema.markValues?.link) {
            this.linkInput = el("input", "link-input") as HTMLInputElement;
            this.linkInput.type = "url";
            this.linkInput.placeholder = "https://…";
            this.linkInput.setAttribute("aria-label", "링크 주소");
            this.linkInput.addEventListener("keydown", e => e.key === "Enter" && (e.preventDefault(), this.applyLink()));
            tools.append(this.linkInput, button("링크", () => this.applyLink(), "선택한 글에 링크 걸기 (주소를 비우면 풀기)"));
        }
        this.undoButton = button("↶", () => this.undo());
        this.undoButton.title = "되돌리기 (⌘Z)";
        this.redoButton = button("↷", () => this.redo());
        this.redoButton.title = "다시하기 (⌘⇧Z)";

        const clear = button("기록 비우기", () => {
            this.client.clearHistory();
            this.render();
        });

        clear.title = "되돌리기 기록을 비운다. 그러면 내 지난 지우기도 GC 가 압축할 수 있게 된다";
        tools.append(this.undoButton, this.redoButton, clear);

        // 표 칸 안에 있을 때만 보이는 단추들
        this.tableTools = el("div", "tools sub");
        this.tableTools.append(
            label("표"),
            button("행 +", () => this.tableEdit((doc, g, r) => cmd.insertAxis(doc, g, "rows", r + 1)), "아래에 행 넣기"),
            button("열 +", () => this.tableEdit((doc, g, _r, c) => cmd.insertAxis(doc, g, "cols", c + 1)), "오른쪽에 열 넣기"),
            button("행 −", () => this.tableEdit((doc, g, r) => cmd.deleteAxis(doc, g, "rows", r)), "이 행 지우기"),
            button("열 −", () => this.tableEdit((doc, g, _r, c) => cmd.deleteAxis(doc, g, "cols", c)), "이 열 지우기"),
            button("→ 합치기", () => this.mergeCell("right"), "오른쪽 칸과 합치기"),
            button("↓ 합치기", () => this.mergeCell("down"), "아래 칸과 합치기"),
            button("나누기", () => this.mergeCell("split"), "합친 칸 나누기 (가려졌던 글이 다시 보인다)"),
            ...CELL_COLORS.map(color => {
                const swatch = button("", () => this.tableEdit((doc, g, r, c) => cmd.setCellAttr(doc, g, r, c, "backgroundColor", color)), color ? `칸 배경 ${color}` : "칸 배경 없애기");

                swatch.classList.add("swatch");
                swatch.style.setProperty("--swatch", color || "transparent");

                return swatch;
            }),
            button("머리 행", () => this.tableEdit((doc, g, _r, _c, line, b) => cmd.setAttr(doc, b, "header", !g.attrs.header, line)), "첫 행을 머리 행으로"),
            button("표 지우기", () => this.tableEdit((doc, _g, _r, _c, line, b) => cmd.deleteBlock(doc, b, line))),
        );
        this.boxTools = el("div", "tools sub");
        this.boxLabel = label("");
        this.toneButton = button("색", () => this.boxEdit((block, line, b) => {
            const values = (this.schema.nodes[block.type].attrs?.tone?.values ?? []) as string[];

            return cmd.setAttr(this.client.doc, b, "tone", values[(values.indexOf(String(block.attrs.tone)) + 1) % values.length], line);
        }), "색 바꾸기");
        this.sizeButton = button("크기", () => this.resizeImage(), "그림 크기 바꾸기 (160 → 240 → 320)");
        this.boxTools.append(this.boxLabel, this.toneButton, this.sizeButton, button("지우기", () => this.boxEdit((_block, line, b) => cmd.deleteBlock(this.client.doc, b, line))));

        this.surface = el("div", "surface");
        this.surface.tabIndex = -1;
        this.input = el("textarea", "ime") as HTMLTextAreaElement;
        this.input.setAttribute("aria-label", `${name} 입력`);
        this.input.autocapitalize = "off";
        this.input.spellcheck = false;

        const wrap = el("div", "surface-wrap");

        wrap.append(this.surface, this.input);
        container.append(tools, this.tableTools, this.boxTools, wrap);

        this.surface.addEventListener("mousedown", e => this.onMouseDown(e));
        window.addEventListener("mousemove", e => this.onMouseMove(e));
        window.addEventListener("mouseup", () => (this.dragging = false));
        this.input.addEventListener("keydown", e => this.onKeyDown(e));
        this.input.addEventListener("compositionstart", () => (this.composing = ""));
        this.input.addEventListener("compositionupdate", e => {
            this.composing = e.data ?? "";
            this.render();
        });
        this.input.addEventListener("compositionend", e => {
            this.composing = "";
            this.insert(e.data ?? "");
            this.input.value = "";
        });
        this.input.addEventListener("input", e => this.onInput(e as InputEvent));
        this.input.addEventListener("focus", () => this.render());
        this.input.addEventListener("blur", () => this.render());
    }

    private get schema(): Schema {
        return this.client.schema;
    }

    private get doc() {
        return this.client.doc;
    }

    // ── 위치 ─────────────────────────────────────────────────────────────

    get pos(): Pos {
        return this.doc.posAfter(this.anchor);
    }

    private get block(): TextBlock {
        return this.doc.textAt(this.pos);
    }

    private get selection(): [Pos, Pos] | null {
        if (!this.focus) {
            return null;
        }

        const a = this.pos;
        const f = this.doc.posAfter(this.focus);

        if (lineOf(a) !== lineOf(f) || comparePos(a, f) === 0) {
            return null;
        }

        return comparePos(a, f) < 0 ? [a, f] : [f, a];
    }

    moveTo(pos: Pos, extend = false): void {
        if (extend && !this.focus) {
            this.focus = this.anchor;
        }

        if (!extend) {
            this.focus = null;
        }

        this.anchor = this.doc.anchorOf(pos);
        this.typingMarks = null;
        this.render();
        this.sendPresence();
    }

    focusInput(): void {
        this.input.focus({preventScroll: true});
    }

    // ── 편집 → 연산 ───────────────────────────────────────────────────────

    /** 내 편집을 보낸다. 되돌리기에 쓰도록 편집 직전·직후 커서(토큰 키)를 함께 남긴다 */
    private commit(ops: Op[], caretBefore: string, caretAfter: string, typing = false): void {
        this.client.commit(ops, {caretBefore, caretAfter, typing});
        this.focus = null;
        this.anchor = caretAfter;
        this.render();
        this.sendPresence();
    }

    /** 선택 영역이 있으면 지우는 연산을 만든다 (아직 보내지 않는다). 지운 뒤의 커서 자리도 */
    private takeSelection(): {ops: Op[]; pos: Pos} {
        const selection = this.selection;

        if (!selection) {
            return {ops: [], pos: this.pos};
        }

        // 지우기 전에 왼쪽 토큰을 잡아 둔다 — 지운 뒤 그 자리
        const anchor = this.doc.anchorOf(selection[0]);
        const ops = cmd.deleteRange(this.doc, selection[0], selection[1]);

        return {ops, pos: this.doc.posAfter(anchor)};
    }

    insert(text: string): void {
        if (!text) {
            return;
        }

        const caretBefore = this.anchor;
        const replacing = !!this.selection;

        if (!this.doc.takesText(this.block.type)) {
            return;
        }

        const {ops, pos} = this.takeSelection();
        const added = cmd.insertText(this.doc, pos, text, this.typingMarks ?? undefined);
        // 표 뒤 빈 자리에 치면 블록 표지가 먼저 온다 — 마지막 글자 연산으로 커서를
        const op = added.filter(o => o.t === "text").at(-1) as Extract<Op, {t: "text"}> | undefined;

        if (!op) {
            // 글자를 받지 않는 곳 — 선택을 지운 것만 보낸다 (이미 적용했으므로)
            ops.length && this.commit(ops, caretBefore, this.doc.anchorOf(pos));

            return;
        }

        // 선택을 덮어 쓰면 지우기와 넣기가 한 번의 되돌리기
        ops.push(...added);
        this.typingMarks = null;
        this.commit(ops, caretBefore, keyOf({lamport: op.id.lamport + op.text.length - 1, actor: op.id.actor}), !replacing && text.length === 1);
    }

    enter(): void {
        const caretBefore = this.anchor;
        const {ops, pos} = this.takeSelection();
        const block = this.doc.textAt(pos);

        // 빈 목록 항목에서 Enter → 수준을 한 칸 빼거나, 목록에서 빠져나온다 (종류 바꾸기 하나)
        if (!ops.length && this.isListItem(block) && !block.chars.length) {
            this.commit(this.outdent(pos, block), caretBefore, this.anchor);

            return;
        }

        const split = cmd.splitBlock(this.doc, pos);

        if (!split.length) {
            ops.length && this.commit(ops, caretBefore, this.doc.anchorOf(pos));

            return;
        }

        ops.push(...split);
        this.commit(ops, caretBefore, keyOf((split[0] as Extract<Op, {t: "node"}>).id));
    }

    backspace(): void {
        const caretBefore = this.anchor;

        if (this.selection) {
            const {ops, pos} = this.takeSelection();

            this.commit(ops, caretBefore, this.doc.anchorOf(pos));

            return;
        }

        const pos = this.pos;
        const block = this.doc.textAt(pos);

        // 목록 항목 맨 앞의 Backspace → 먼저 수준·목록을 푼다 (다음 Backspace 가 앞 줄과 합친다)
        if (pos.o === 0 && this.isListItem(block)) {
            this.commit(this.outdent(pos, block), caretBefore, this.anchor);

            return;
        }

        const result = cmd.backspace(this.doc, pos);

        this.commit(result.ops, caretBefore, result.caret);
    }

    deleteForward(): void {
        const caretBefore = this.anchor;

        if (this.selection) {
            const {ops, pos} = this.takeSelection();

            this.commit(ops, caretBefore, this.doc.anchorOf(pos));

            return;
        }

        const pos = this.pos;
        const ops = cmd.deleteForward(this.doc, pos);
        const next = this.doc.blocks(lineOf(pos))[pos.b + 1];

        // 다음이 표·상자면 지우지 않고 그 안으로 들어간다
        if (!ops.length && pos.o === this.block.chars.length && next && (next.kind === "grid" || next.kind === "flow")) {
            this.moveTo(this.doc.edgeOf(lineOf(pos), pos.b + 1, false));

            return;
        }

        this.commit(ops, caretBefore, this.anchor);
    }

    private isListItem(block: Block): boolean {
        return !!this.schema.nodes[block.type]?.ui?.list;
    }

    /** 목록 항목을 한 수준 빼고, 0 이면 그 줄의 기본 블록으로 */
    private outdent(pos: Pos, block: TextBlock): Op[] {
        const level = Number(block.attrs.level ?? 0);

        return level > 0
            ? cmd.setNumberAttr(this.doc, pos.b, "level", level - 1, lineOf(pos))
            : cmd.setBlockType(this.doc, pos.b, this.doc.defaultIn(lineOf(pos)), lineOf(pos));
    }

    /** 종류 고르기에 보일 것 — 이 줄에 올 수 있는 글 블록 종류 (목록 항목은 글머리·번호로 나눠서) */
    private typeChoices(line: string): TypeChoice[] {
        return this.doc.allowedIn(line).flatMap(type => {
            const spec = this.schema.nodes[type];

            // 글자를 받지 않는 블록(image)은 고를 것이 아니다
            if (spec?.shape !== "text" || spec.text === false) {
                return [];
            }

            const variants = spec.ui?.variants;

            return variants
                ? Object.entries(variants.labels).map(([v, label]) => ({value: `${type}:${v}`, label, type, attrs: {[variants.attr]: v}}))
                : [{value: type, label: spec.ui?.label ?? type, type, attrs: {}}];
        });
    }

    private chooseType(value: string): void {
        const pos = this.pos;
        const choice = this.typeChoices(lineOf(pos)).find(c => c.value === value);

        choice && this.commit(cmd.setBlockType(this.doc, pos.b, choice.type, lineOf(pos), choice.attrs), this.anchor, this.anchor);
        this.focusInput();
    }

    /** 넣기 고르기에 보일 것 — 이 줄에 올 수 있는 표·상자·구분선. 표는 크기도 고른다 */
    private insertChoices(line: string): Array<{value: string; label: string}> {
        return this.doc.allowedIn(line).flatMap(type => {
            const spec = this.schema.nodes[type];
            const name = spec?.ui?.label ?? type;

            if (spec?.shape === "grid") {
                return ["2x2", "3x3", "2x4"].map(size => ({value: `${type}:${size}`, label: `${name} ${size.replace("x", "×")}`}));
            }

            return spec && spec.shape !== "text" ? [{value: type, label: name}] : [];
        }).concat(
            // 글 안에 넣는 것 (문단 안 그림) — 지금 블록이 받을 때만
            ((this.schema.nodes[this.block.type] as {children?: readonly string[]}).children ?? [])
                .filter(t => this.schema.nodes[t]?.shape === "inline")
                .map(t => ({value: `inline:${t}`, label: `${this.schema.nodes[t].ui?.label ?? t} (글 안)`})),
        );
    }

    /** 데모용 그림 — 바깥 주소 없이 그 자리에서 만든 SVG */
    private sampleImage(width: number, height: number): string {
        const hue = Math.floor(Math.random() * 360);
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
            `<rect width="100%" height="100%" fill="hsl(${hue} 70% 82%)"/>` +
            `<circle cx="${width * 0.3}" cy="${height * 0.45}" r="${Math.min(width, height) * 0.18}" fill="hsl(${hue} 70% 55%)"/>` +
            `<path d="M0 ${height} L${width * 0.45} ${height * 0.5} L${width * 0.7} ${height * 0.75} L${width} ${height * 0.35} L${width} ${height}Z" fill="hsl(${(hue + 40) % 360} 60% 45%)"/>` +
            `<text x="${width - 6}" y="14" font-size="11" text-anchor="end" fill="#0008">${this.name}</text></svg>`;

        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    private resizeImage(): void {
        const body = this.doc.bodyOf(lineOf(this.pos));
        const block = body && this.doc.blocks(body.line)[body.b];

        if (block?.kind !== "flow") {
            return;
        }

        const image = this.doc.blocks(block.body).flatMap(x => (x.kind === "text" ? x.chars.filter(c => this.doc.isInline(c)) : []))[0];
        const sizes = [160, 240, 320];
        const width = Number(image?.attrs.get("width")?.value ?? 160);

        image && this.commit(cmd.setItemAttr(this.doc, image, "width", sizes[(sizes.indexOf(width) + 1) % sizes.length]), this.anchor, this.anchor);
        this.focusInput();
    }

    private insertChoice(value: string): void {
        const [type, size] = value.split(":");

        if (!type) {
            return;
        }

        if (type === "inline") {
            const caretBefore = this.anchor;
            const {ops, pos} = this.takeSelection();
            const added = cmd.insertInline(this.doc, pos, size, {src: this.sampleImage(48, 32), width: 48, height: 32});

            added.length && this.commit([...ops, ...added], caretBefore, keyOf((added[0] as Extract<Op, {t: "node"}>).id));
            this.focusInput();

            return;
        }

        const [rows, cols] = (size ?? "1x1").split("x").map(Number);
        const caretBefore = this.anchor;
        const {ops, pos} = this.takeSelection();
        const added = cmd.insertBlock(this.doc, pos, type, {rows, cols});

        if (!added.length) {
            return;
        }

        ops.push(...added);

        const key = keyOf((added[0] as Extract<Op, {t: "node"}>).id);
        const line = lineOf(pos);
        const b = this.doc.blocks(line).findIndex(x => x.marker.key === key);
        const made = this.doc.blocks(line)[b];

        let caret: Pos | null = null;

        // 이미지 그릇이면 그 안 image 에 그림을 하나 넣고, 글을 받는 블록(캡션)을 뒤에 붙인다 — 한 번의 되돌리기
        if (made?.kind === "flow" && !this.doc.takesText(this.doc.defaultIn(made.body))) {
            const inline = this.doc.inlinesIn(made.body)[0];
            const textType = this.doc.allowedIn(made.body).find(t => this.doc.takesText(t));

            inline && ops.push(...cmd.insertInline(this.doc, {line: made.body, b: 0, o: 0}, inline, {src: this.sampleImage(160, 90)}));

            if (textType) {
                ops.push(...cmd.appendBlock(this.doc, made.body, textType));
                caret = this.doc.lineEdge(made.body, true);
            }
        }
        // 표·상자는 그 안 맨 앞으로, 구분선은 그 뒤로
        const after = caret ?? (b >= 0 && this.doc.blocks(line)[b].kind !== "atom" ? this.doc.edgeOf(line, b, false) : this.doc.posAfter(key));

        this.commit(ops, caretBefore, this.doc.anchorOf(after));
        this.focusInput();
    }

    /** 시나리오용: 넣기 고르기를 누른 것처럼 */
    insertChoiceForScenario(value: string): void {
        this.insertChoice(value);
    }

    /** 시나리오용: 표 단추를 누른 것처럼 */
    tableAction(action: "row+" | "col+" | "row-" | "col-"): void {
        this.tableEdit((doc, g, r, c) =>
            action === "row+"
                ? cmd.insertAxis(doc, g, "rows", r + 1)
                : action === "col+"
                  ? cmd.insertAxis(doc, g, "cols", c + 1)
                  : action === "row-"
                    ? cmd.deleteAxis(doc, g, "rows", r)
                    : cmd.deleteAxis(doc, g, "cols", c),
        );
    }

    private tableEdit(make: (doc: SyncClient["doc"], grid: GridBlock, r: number, c: number, line: string, b: number) => Op[]): void {
        const cell = this.doc.cellOf(lineOf(this.pos));

        if (cell) {
            this.commit(make(this.doc, cell.grid, cell.r, cell.c, cell.line, cell.b), this.anchor, this.anchor);
        }

        this.focusInput();
    }

    private boxEdit(make: (block: Block, line: string, b: number) => Op[]): void {
        const body = this.doc.bodyOf(lineOf(this.pos));

        body && this.commit(make(this.doc.blocks(body.line)[body.b], body.line, body.b), this.anchor, this.anchor);
        this.focusInput();
    }

    /** 목록 항목이면 수준, 표 칸이면 옆 칸으로 */
    tab(back: boolean): void {
        const pos = this.pos;
        const cell = this.doc.cellOf(lineOf(pos));

        if (cell) {
            const {grid, r, c} = cell;
            const next = this.linearCell(grid, r, c, !back);

            if (!next && !back) {
                // 마지막 칸에서 Tab → 행을 하나 더하고 그 첫 칸으로
                const ops = cmd.insertAxis(this.doc, grid, "rows", grid.rows.length);
                const row = keyOf((ops[0] as Extract<Op, {t: "node"}>).id);
                const fresh = this.doc.cellOf(lineOf(pos))!.grid;
                const first = this.doc.cellKey(fresh.marker, fresh.rows.find(x => x.key === row)!, fresh.cols[0]);

                this.commit(ops, this.anchor, this.doc.anchorOf({line: first, b: 0, o: 0}));
            } else if (next) {
                this.moveTo(this.cellEdge(grid, next[0], next[1], back));
            }

            return;
        }

        const block = this.block;

        this.isListItem(block) && this.commit(cmd.setNumberAttr(this.doc, pos.b, "level", Number(block.attrs.level ?? 0) + (back ? -1 : 1), lineOf(pos)), this.anchor, this.anchor);
    }

    private cellEdge(grid: GridBlock, r: number, c: number, end: boolean): Pos {
        // 가려진 칸이면 그 칸을 덮은 왼쪽 위 칸으로
        const [or, oc] = grid.covered.get(`${r},${c}`) ?? [r, c];

        return this.doc.lineEdge(this.doc.cellKey(grid.marker, grid.rows[or], grid.cols[oc]), end);
    }

    /** 읽는 순서(왼→오, 위→아래)로 다음·앞 칸. 가려진 칸은 건너뛴다 */
    private linearCell(grid: GridBlock, r: number, c: number, forward: boolean): [number, number] | null {
        const width = grid.cols.length;

        for (let i = r * width + c + (forward ? 1 : -1); i >= 0 && i < grid.rows.length * width; i += forward ? 1 : -1) {
            const at: [number, number] = [Math.floor(i / width), i % width];

            if (!grid.covered.has(`${at[0]},${at[1]}`)) {
                return at;
            }
        }

        return null;
    }

    /** 위·아래 칸. 합친 칸이면 그 아래 끝 다음 행으로, 가려진 칸에 닿으면 그 왼쪽 위 칸으로 */
    private verticalCell(grid: GridBlock, r: number, c: number, down: boolean): [number, number] | null {
        const [rowspan] = grid.spans.get(`${r},${c}`) ?? [1];
        const target = down ? r + rowspan : r - 1;

        if (target < 0 || target >= grid.rows.length) {
            return null;
        }

        return grid.covered.get(`${target},${c}`) ?? [target, c];
    }

    /** 칸 합치기: 오른쪽·아래로 한 칸씩 넓히거나, 나누기 */
    mergeCell(direction: "right" | "down" | "split"): void {
        this.tableEdit((doc, grid, r, c) => {
            const [rowspan, colspan] = grid.spans.get(`${r},${c}`) ?? [1, 1];

            return direction === "split"
                ? cmd.setSpan(doc, grid, r, c, 1, 1)
                : cmd.setSpan(doc, grid, r, c, rowspan + (direction === "down" ? 1 : 0), colspan + (direction === "right" ? 1 : 0));
        });
    }

    /** 선택한 글에 링크 걸기·풀기 (주소가 비면 풀기) */
    private applyLink(): void {
        const selection = this.selection;
        const url = this.linkInput?.value.trim() ?? "";
        const spec = this.schema.markValues?.link;

        if (!selection || !spec || (url && !new RegExp(spec.pattern ?? "").test(url))) {
            this.focusInput();

            return;
        }

        const anchor = this.anchor;
        const focus = this.focus;

        this.client.commit(cmd.setLink(this.doc, selection[0], selection[1], url || null), {caretBefore: anchor, caretAfter: anchor});
        this.anchor = anchor;
        this.focus = focus;
        this.render();
        this.focusInput();
    }

    /** 서식 켜고 끄기 — 선택이 있으면 그 범위, 없으면 다음에 칠 글자 */
    toggleMark(key: string): void {
        const selection = this.selection;

        if (selection) {
            const chars = this.doc.charsBetween(selection[0], selection[1]);
            const allOn = chars.length > 0 && chars.every(c => c.attrs.get(key)?.value === true);
            const anchor = this.anchor;
            const focus = this.focus;

            this.client.commit(cmd.setMark(this.doc, selection[0], selection[1], key, !allOn), {caretBefore: anchor, caretAfter: anchor});
            this.anchor = anchor;
            this.focus = focus;
        } else {
            const marks = {...this.currentMarks()};

            marks[key] ? delete marks[key] : (marks[key] = true);
            this.typingMarks = marks;
        }

        this.render();
        this.focusInput();
    }

    /** 커서 자리의 서식 — 다음에 칠 글자가 물려받을 것 */
    private currentMarks(): Marks {
        if (this.typingMarks) {
            return this.typingMarks;
        }

        const left = this.doc.leftOf(this.pos);

        // 다음에 칠 글자가 물려받는 것만 (링크는 물려받지 않는다)
        return left.kind === "char" ? inheritedMarks(this.schema, this.doc.marksOf(left)) : {};
    }

    undo(): void {
        this.placeCaret(this.client.undo());
    }

    redo(): void {
        this.placeCaret(this.client.redo());
    }

    private placeCaret(caret: string | null): void {
        caret && this.doc.get(caret) && (this.anchor = caret);
        this.focus = null;
        this.typingMarks = null;
        this.render();
        this.sendPresence();
    }

    // ── 커서 옮기기 (줄 사이를 오간다) ─────────────────────────────────────

    /** 오른쪽으로 한 칸. 블록 끝이면 다음 블록, 줄 끝이면 다음 칸·표 밖으로 */
    private stepRight(pos: Pos): Pos {
        const line = lineOf(pos);
        const blocks = this.doc.blocks(line);

        if (pos.o < this.doc.textAt(pos).chars.length) {
            return {...pos, o: pos.o + 1};
        }

        const next = blocks[pos.b + 1];

        if (next) {
            return next.kind === "text" ? at(line, pos.b + 1, 0) : next.kind === "atom" ? at(line, pos.b + 2, 0) : this.doc.edgeOf(line, pos.b + 1, false);
        }

        return this.leave(line, true) ?? pos;
    }

    private stepLeft(pos: Pos): Pos {
        const line = lineOf(pos);
        const blocks = this.doc.blocks(line);

        if (pos.o > 0) {
            return {...pos, o: pos.o - 1};
        }

        const prev = blocks[pos.b - 1];

        if (prev) {
            if (prev.kind === "text") {
                return at(line, pos.b - 1, prev.chars.length);
            }

            return prev.kind === "atom" ? this.doc.edgeOf(line, pos.b - 2, true) : this.doc.edgeOf(line, pos.b - 1, true);
        }

        return this.leave(line, false) ?? pos;
    }

    /** 줄의 앞·뒤로 나간다 — 칸이면 이웃 칸, 마지막 칸이면 표 밖, 상자면 상자 밖 */
    private leave(line: string, forward: boolean): Pos | null {
        const cell = this.doc.cellOf(line);

        if (cell) {
            const {grid, r, c} = cell;
            const next = this.linearCell(grid, r, c, forward);

            if (next) {
                return this.cellEdge(grid, next[0], next[1], !forward);
            }

            return this.outside(cell.line, cell.b, forward);
        }

        const body = this.doc.bodyOf(line);

        return body ? this.outside(body.line, body.b, forward) : null;
    }

    /** 표·상자 바로 앞(앞 블록 끝)이나 바로 뒤(뒤 블록 맨 앞) — 표·상자 앞뒤에는 언제나 글 블록이 있다 */
    private outside(line: string, b: number, forward: boolean): Pos {
        const blocks = this.doc.blocks(line);

        return forward ? at(line, b + 1, 0) : at(line, b - 1, (blocks[b - 1] as TextBlock).chars.length);
    }

    /** 위·아래로. 표 안에서는 위·아래 칸으로 */
    private stepVertical(pos: Pos, down: boolean): Pos {
        const line = lineOf(pos);
        const blocks = this.doc.blocks(line);
        let b = pos.b + (down ? 1 : -1);

        while (blocks[b]?.kind === "atom") {
            b += down ? 1 : -1;
        }

        const target = blocks[b];

        if (target) {
            return target.kind === "text" ? at(line, b, Math.min(pos.o, target.chars.length)) : this.doc.edgeOf(line, b, !down);
        }

        const cell = this.doc.cellOf(line);

        if (cell) {
            const next = this.verticalCell(cell.grid, cell.r, cell.c, down);

            return next ? this.cellEdge(cell.grid, next[0], next[1], !down) : this.outside(cell.line, cell.b, down);
        }

        const body = this.doc.bodyOf(line);

        if (body) {
            return this.outside(body.line, body.b, down);
        }

        return down ? at(line, blocks.length - 1, (blocks.at(-1) as TextBlock).chars.length) : at(line, 0, 0);
    }

    // ── 입력 처리 ─────────────────────────────────────────────────────────

    private onInput(e: InputEvent): void {
        // 조합 중인 글자는 compositionend 에서 넣는다
        if (e.isComposing || this.composing || e.inputType === "insertFromComposition") {
            return;
        }

        if (e.inputType.startsWith("insert") && this.input.value) {
            this.insert(this.input.value);
        }

        this.input.value = "";
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.isComposing || e.keyCode === 229) {
            return;
        }

        const mod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();
        const pos = this.pos;
        const line = lineOf(pos);
        const blocks = this.doc.blocks(line);
        const extend = e.shiftKey;
        const mark = this.schema.marks.find(k => MARK_BUTTON[k]?.key === key && !!MARK_BUTTON[k].shift === e.shiftKey);
        // 선택을 늘일 때는 같은 줄 안에서만
        const move = (target: Pos) => this.moveTo(extend && lineOf(target) !== line ? pos : target, extend);
        let handled = true;

        if (mod && key === "z") {
            e.shiftKey ? this.redo() : this.undo();
        } else if (mod && key === "y") {
            this.redo();
        } else if (mod && mark) {
            this.toggleMark(mark);
        } else if (mod && key === "a") {
            // 지금 줄(본문·칸·상자 안)만
            this.anchor = this.doc.anchorOf(this.doc.lineEdge(line, true));
            this.focus = this.doc.anchorOf(this.doc.lineEdge(line, false));
            this.render();
            this.sendPresence();
        } else if (e.key === "Tab") {
            this.tab(e.shiftKey);
        } else if (e.key === "Enter") {
            this.enter();
        } else if (e.key === "Backspace") {
            this.backspace();
        } else if (e.key === "Delete") {
            this.deleteForward();
        } else if (e.key === "ArrowLeft") {
            move(this.stepLeft(pos));
        } else if (e.key === "ArrowRight") {
            move(this.stepRight(pos));
        } else if (e.key === "ArrowUp") {
            move(this.stepVertical(pos, false));
        } else if (e.key === "ArrowDown") {
            move(this.stepVertical(pos, true));
        } else if (e.key === "Home") {
            this.moveTo({...pos, o: 0}, extend);
        } else if (e.key === "End") {
            this.moveTo({...pos, o: (blocks[pos.b] as TextBlock).chars.length}, extend);
        } else {
            handled = false;
        }

        handled && e.preventDefault();
    }

    private posFromEvent(e: MouseEvent): Pos | null {
        const target = (e.target as HTMLElement).closest<HTMLElement>("[data-b], [data-cell]");

        if (!target) {
            return this.doc.lineEdge(MAIN, true);
        }

        // 칸의 빈 곳 → 그 칸 끝
        if (target.dataset.cell) {
            return this.doc.lineEdge(target.dataset.cell, true);
        }

        const line = target.dataset.line ?? MAIN;
        const b = Number(target.dataset.b);
        const block = this.doc.blocks(line)[b];

        if (!block) {
            return null;
        }

        if (block.kind !== "text") {
            // 구분선을 누르면 그 뒤로
            return at(line, b + 1, 0);
        }

        if (target.dataset.o === undefined) {
            return at(line, b, block.chars.length);
        }

        const rect = target.getBoundingClientRect();
        const o = Number(target.dataset.o);

        return at(line, b, e.clientX > rect.left + rect.width / 2 ? o + 1 : o);
    }

    private onMouseDown(e: MouseEvent): void {
        const pos = this.posFromEvent(e);

        e.preventDefault();
        pos && this.moveTo(pos, e.shiftKey && lineOf(pos) === lineOf(this.pos));
        this.dragging = true;
        this.focusInput();
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.dragging || !(e.buttons & 1) || !this.surface.contains(e.target as Node)) {
            return;
        }

        const pos = this.posFromEvent(e);
        const anchorLine = lineOf(this.doc.posAfter(this.focus ?? this.anchor));

        pos && lineOf(pos) === anchorLine && this.moveTo(pos, true);
    }

    private sendPresence(): void {
        clearTimeout(this.presenceTimer);
        this.presenceTimer = window.setTimeout(
            () => this.client.setPresence({name: this.name, color: this.color, anchor: this.anchor, focus: this.focus}),
            40,
        );
    }

    // ── 그리기 ─────────────────────────────────────────────────────────────

    render(): void {
        const doc = this.doc;
        const pos = this.pos;
        const selection = this.selection;
        const focused = document.activeElement === this.input;
        const remote = (this.client.online ? [...this.client.others.values()] : []).flatMap(p => {
            const resolved = resolvePresence(doc, p);

            return resolved ? [{...p, ...resolved}] : [];
        });
        const caretAt = (here: Pos): HTMLElement[] => {
            const marks: HTMLElement[] = [];

            remote
                .filter(p => samePos(p.pos, here))
                .forEach(p => {
                    const caret = el("span", "caret remote");

                    caret.style.setProperty("--who", p.color);
                    caret.dataset.actor = p.actor;
                    caret.dataset.name = p.name;
                    caret.title = `${p.name} · ${p.range ? "선택 중" : "커서"}`;
                    marks.push(caret);
                });

            if (samePos(pos, here)) {
                if (this.composing) {
                    const preview = el("span", "composing");

                    preview.textContent = this.composing;
                    marks.push(preview);
                }

                marks.push(el("span", focused ? "caret mine" : "caret mine idle"));
            }

            return marks;
        };
        const inSelection = (here: Pos): boolean =>
            !!selection &&
            lineOf(here) === lineOf(selection[0]) &&
            comparePos(here, selection[0]) >= 0 &&
            comparePos({...here, o: here.o + 1}, selection[1]) <= 0;

        const renderLine = (line: string, into: HTMLElement): void => {
            // 번호 목록: 같은 수준의 이어진 번호 항목끼리 1, 2, 3 …
            const counters: number[] = [];

            doc.blocks(line).forEach((block, b) => {
                if (block.kind === "grid") {
                    counters.length = 0;
                    into.append(this.renderGrid(block, line, b, renderLine));

                    return;
                }

                if (block.kind === "flow") {
                    counters.length = 0;

                    const box = el("div", `box ${block.type} tone-${String(block.attrs.tone ?? "")}`);

                    renderLine(block.body, box);
                    into.append(box);

                    return;
                }

                if (block.kind === "atom") {
                    counters.length = 0;

                    const atom = el("div", `atom ${block.type}`);

                    atom.dataset.b = String(b);
                    line !== MAIN && (atom.dataset.line = line);
                    atom.append(el("hr", ""));
                    into.append(atom);

                    return;
                }

                const div = el("div", `blk ${block.type}`);

                div.dataset.b = String(b);
                line !== MAIN && (div.dataset.line = line);

                if (this.isListItem(block)) {
                    const level = Number(block.attrs.level ?? 0);
                    const numbered = block.attrs.listType === "numbered";

                    counters.length = level + 1;
                    counters[level] = numbered ? (counters[level] ?? 0) + 1 : 0;
                    div.classList.add(numbered ? "numbered" : "bullet");
                    div.style.setProperty("--indent", String(level));
                    div.dataset.bullet = numbered ? `${counters[level]}.` : ["•", "◦", "▪"][level % 3];
                } else {
                    counters.length = 0;
                }

                block.chars.forEach((char, o) => {
                    div.append(...caretAt(at(line, b, o)));

                    const span = el("span", `ch${inSelection(at(line, b, o)) ? " sel" : ""}`);
                    const marks = doc.marksOf(char);

                    Object.keys(marks).forEach(k => span.classList.add(k));

                    if (typeof marks.link === "string") {
                        span.classList.add("link");
                        span.title = marks.link;
                    }

                    if (doc.isInline(char)) {
                        const img = el("img", "inline-img") as HTMLImageElement;
                        img.src = String(char.attrs.get("src")?.value ?? "");
                        img.alt = "";
                        // 너비만 따르고 높이는 그림 비율대로
                        img.style.width = `${Number(char.attrs.get("width")?.value ?? 160)}px`;
                        img.style.height = "auto";
                        img.draggable = false;
                        span.classList.add("inline");
                        span.append(img);
                    } else {
                        span.textContent = char.ch;
                    }

                    span.dataset.b = String(b);
                    span.dataset.o = String(o);
                    line !== MAIN && (span.dataset.line = line);
                    remote.filter(p => rangeContains(p.range, at(line, b, o))).forEach(p => {
                        const layer = el("span", "remote-selection");

                        layer.style.setProperty("--who", p.color);
                        layer.dataset.actor = p.actor;
                        layer.dataset.name = p.name;
                        layer.setAttribute("aria-hidden", "true");
                        span.append(layer);
                    });
                    div.append(span);
                });
                div.append(...caretAt(at(line, b, block.chars.length)));
                block.chars.length || div.append(el("span", "empty"));

                const placeholder = this.schema.nodes[block.type]?.ui?.placeholder;

                !block.chars.length && placeholder && (div.dataset.placeholder = placeholder);
                into.append(div);
            });
        };

        this.surface.innerHTML = "";
        renderLine(MAIN, this.surface);

        // 도구 막대 — 지금 줄에서 고를 수 있는 것만
        const line = lineOf(pos);
        const block = this.block;
        const choices = this.typeChoices(line);
        const variants = this.schema.nodes[block.type]?.ui?.variants;
        const current = variants ? `${block.type}:${String(block.attrs[variants.attr])}` : block.type;

        this.typeSelect.innerHTML = "";
        choices.forEach(c => this.typeSelect.append(new Option(c.label, c.value)));
        this.typeSelect.value = current;
        this.insertSelect.innerHTML = "";
        this.insertSelect.append(new Option("넣기…", ""));
        this.insertChoices(line).forEach(c => this.insertSelect.append(new Option(c.label, c.value)));
        this.insertSelect.disabled = this.insertSelect.options.length < 2;

        const marks = this.currentMarks();

        this.markButtons.forEach((b, k) => b.classList.toggle("on", !!marks[k]));
        this.undoButton.disabled = !this.client.history.canUndo;
        this.redoButton.disabled = !this.client.history.canRedo;
        this.tableTools.hidden = !doc.cellOf(line);
        const body = doc.bodyOf(line);
        const box = body && doc.blocks(body.line)[body.b];

        this.boxTools.hidden = !box;

        if (box) {
            this.boxLabel.textContent = this.schema.nodes[box.type]?.ui?.label ?? box.type;
            this.toneButton.hidden = !this.schema.nodes[box.type]?.attrs?.tone;
            this.sizeButton.hidden = box.kind !== "flow" || this.doc.takesText(this.doc.defaultIn(box.body));
        }
    }

    private renderGrid(block: GridBlock, line: string, b: number, renderLine: (line: string, into: HTMLElement) => void): HTMLElement {
        const wrap = el("div", "grid-wrap");
        const table = el("table", `grid ${block.type}${block.attrs.header ? " header" : ""}`);

        wrap.dataset.b = String(b);
        line !== MAIN && (wrap.dataset.line = line);
        block.rows.forEach((row, i) => {
            const tr = el("tr", "");

            block.cols.forEach((col, j) => {
                // 가려진 칸은 그리지 않는다 — 왼쪽 위 칸이 colspan·rowspan 으로 덮는다
                if (block.covered.has(`${i},${j}`)) {
                    return;
                }

                const td = el("td", "") as HTMLTableCellElement;
                const cell = this.doc.cellKey(block.marker, row, col);
                const span = block.spans.get(`${i},${j}`);

                const background = this.doc.cellAttrs(block, row, col).backgroundColor;

                span && ((td.rowSpan = span[0]), (td.colSpan = span[1]));
                background && td.style.setProperty("--cell-bg", String(background));
                td.dataset.cell = cell;
                renderLine(cell, td);
                tr.append(td);
            });
            table.append(tr);
        });
        wrap.append(table);

        return wrap;
    }
}

function el(tag: string, className: string): HTMLElement {
    const node = document.createElement(tag);

    className && (node.className = className);

    return node;
}

function label(text: string): HTMLElement {
    const node = el("span", "label");

    node.textContent = text;

    return node;
}

function button(text: string, onClick: () => void, title = ""): HTMLButtonElement {
    const node = el("button", "btn") as HTMLButtonElement;

    node.type = "button";
    node.textContent = text;
    title && (node.title = title);
    node.addEventListener("mousedown", e => e.preventDefault());
    node.addEventListener("click", onClick);

    return node;
}
