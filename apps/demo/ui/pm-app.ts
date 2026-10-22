import {baseKeymap, chainCommands, setBlockType, toggleMark} from "prosemirror-commands";
import {keymap} from "prosemirror-keymap";
import {addColumnAfter, addRowAfter, deleteColumn, deleteRow, goToNextCell, mergeCells, splitCell, tableEditing} from "prosemirror-tables";
import {EditorView} from "prosemirror-view";
import {MAIN} from "@barocss/doc-sync";
import {PmBinding} from "@barocss/doc-sync/prosemirror";
import {buildPmSchema} from "@barocss/doc-sync/prosemirror";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {SyncClient} from "@barocss/doc-sync/sync";
import {HttpTransport} from "@barocss/doc-sync/sync";
import {COLORS, Editor} from "./editor.ts";
import type {Node as PmNode} from "prosemirror-model";
import type {Command} from "prosemirror-state";
import type {NodeJSON} from "@barocss/doc-sync";

/**
 * 데모 편집기(A)와 ProseMirror 편집기(P)가 같은 문서를 편집한다. 둘 다 서버를 거쳐 주고받는다.
 *   /pm?doc=이름
 */

const params = new URLSearchParams(location.search);
const DOC = params.get("doc") ?? "pm";
const SCHEMA = DEMO_SCHEMA;
const actorOf = (name: string) => `${name}-${Math.random().toString(36).slice(2, 6)}`;
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

// ProseMirror 화면 꼴 — 데모 스키마의 종류마다
const INFO = buildPmSchema(SCHEMA, {
    paragraph: () => ["p", 0],
    heading1: () => ["h1", 0],
    heading2: () => ["h2", 0],
    quote: () => ["blockquote", 0],
    "list-item": (node: PmNode) => ["div", {class: `pm-li ${node.attrs.listType}`, style: `--level:${node.attrs.level}`}, 0],
    "image-component": () => ["figure", 0],
    image: () => ["div", {class: "pm-image"}, 0],
    "caption-paragraph": () => ["figcaption", 0],
    "inline-image": (node: PmNode) => ["img", {src: String(node.attrs.src), style: `width:${node.attrs.width}px`}],
    callout: () => ["div", {class: "pm-box"}, 0],
    divider: () => ["hr"],
});
const pm = INFO.pm;

// ── 참여자 A: 데모 편집기 ──────────────────────────────────────────────

const actorA = actorOf("A");
const transportA = new HttpTransport(DOC, actorA);
const clientA = new SyncClient(actorA, transportA, {schema: SCHEMA, ackDelay: 200});
const paneA = $("#pane-a");
const editorA = new Editor(paneA.querySelector(".editor") as HTMLElement, clientA, "A");

paneA.style.setProperty("--me", editorA.color);

// ── 참여자 P: ProseMirror ─────────────────────────────────────────────

const actorP = actorOf("P");
const transportP = new HttpTransport(DOC, actorP);
const clientP = new SyncClient(actorP, transportP, {schema: SCHEMA, ackDelay: 200});
const paneP = $("#pane-p");
const colorP = COLORS.E;

paneP.style.setProperty("--me", colorP);

let view: EditorView;

const binding: PmBinding = new PmBinding(clientP, INFO, [
    keymap({
        "Mod-z": (): boolean => (binding.undo(), true),
        "Mod-y": (): boolean => (binding.redo(), true),
        "Shift-Mod-z": (): boolean => (binding.redo(), true),
        "Mod-b": toggleMark(pm.marks.bold),
        "Mod-i": toggleMark(pm.marks.italic),
        "Mod-u": toggleMark(pm.marks.underline),
        Tab: goToNextCell(1),
        "Shift-Tab": goToNextCell(-1),
    }),
    keymap(baseKeymap),
    tableEditing(),
]);

view = new EditorView($("#pm-mount"), {state: binding.state, dispatchTransaction: tr => binding.dispatch(tr)});
binding.view = view;
binding.onChange = () => {
    view.updateState(binding.state);
    queueRender();
};

let presenceTimer = 0;

binding.onSelection = (anchor: string | null, focus: string | null) => {
    clearTimeout(presenceTimer);
    presenceTimer = window.setTimeout(() => clientP.setPresence({name: "P", color: colorP, anchor, focus}), 40);
};

// 도구 막대
const tools = $("#pm-tools");
const run = (command: Command) => () => {
    command(view.state, view.dispatch, view);
    view.focus();
};
const button = (label: string, title: string, onClick: () => void) => {
    const b = document.createElement("button");

    b.type = "button";
    b.className = "btn";
    b.textContent = label;
    b.title = title;
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", onClick);
    tools.append(b);
};
const insertTable: Command = (state, dispatch) => {
    const cell = () => pm.nodes.table_cell.create(null, pm.nodes.paragraph.create());
    const row = () => pm.nodes.table_row.create(null, [cell(), cell(), cell()]);

    dispatch?.(state.tr.replaceSelectionWith(pm.nodes.table.create(null, [row(), row()])));

    return true;
};
const addLink: Command = (state, dispatch) => {
    const {from, to, empty} = state.selection;

    if (empty) {
        return false;
    }

    dispatch?.(state.tr.addMark(from, to, pm.marks.link.create({value: "https://example.com"})));

    return true;
};

button("문단", "문단으로", run(setBlockType(pm.nodes.paragraph)));
button("제목", "제목 1", run(setBlockType(pm.nodes.heading1)));
button("인용", "인용", run(setBlockType(pm.nodes.quote)));
button("•", "글머리 목록", run(setBlockType(pm.nodes.list_item, {listType: "bullet", level: 0})));
button("1.", "번호 목록", run(setBlockType(pm.nodes.list_item, {listType: "numbered", level: 0})));
button("B", "굵게 (⌘B)", run(toggleMark(pm.marks.bold)));
button("I", "기울임 (⌘I)", run(toggleMark(pm.marks.italic)));
button("링크", "선택한 글에 https://example.com", run(addLink));
button("표", "2×3 표 넣기", run(insertTable));
button("열 +", "오른쪽에 열", run(addColumnAfter));
button("행 +", "아래에 행", run(addRowAfter));
button("열 −", "이 열 지우기", run(deleteColumn));
button("행 −", "이 행 지우기", run(deleteRow));
button("합치기", "고른 칸 합치기 (칸을 끌어서 고른다)", run(mergeCells));
button("나누기", "합친 칸 나누기", run(splitCell));
button("↶", "되돌리기 (⌘Z) — 내 편집만", () => binding.undo());
button("↷", "다시하기", () => binding.redo());

// ── 연결 · 그리기 ─────────────────────────────────────────────────────

const pairs = [
    {client: clientA, pane: paneA},
    {client: clientP, pane: paneP},
];

pairs.forEach(({client, pane}) => {
    pane.querySelector(".link-toggle")!.addEventListener("click", () => (client.online ? client.disconnect() : client.connect()));
});
clientA.onUpdate = () => {
    clientA.doc.get(editorA.anchor) || ((editorA.anchor = MAIN), (editorA.focus = null));
    queueRender();
};
// P 의 남 커서 장식은 presence 가 바뀔 때 다시 그린다 (문서 변경은 binding 이 그린다)
clientP.onUpdate = () => {
    view.updateState(view.state);
    queueRender();
};
$("#doc-name").textContent = DOC;
$("#all-off").addEventListener("click", () => pairs.forEach(p => p.client.disconnect()));
$("#all-on").addEventListener("click", () => pairs.forEach(p => p.client.connect()));
$("#reset").addEventListener("click", () => fetch(`/api/docs/${encodeURIComponent(DOC)}/reset`, {method: "POST"}));
window.addEventListener("pagehide", () => [transportA, transportP].forEach(t => t.leave()));

let server: {model: NodeJSON | null; serverSeq: number} | null = null;

setInterval(async () => {
    try {
        server = (await (await fetch(`/api/docs/${encodeURIComponent(DOC)}/state`)).json()) as {model: NodeJSON | null; serverSeq: number};
        queueRender();
    } catch {
        // 다음에
    }
}, 700);

let queued = false;

function queueRender(): void {
    if (queued) {
        return;
    }

    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        render();
    });
}

function render(): void {
    editorA.render();
    pairs.forEach(({client, pane}) => {
        pane.classList.toggle("offline", !client.online);
        pane.querySelector(".link-toggle")!.textContent = client.online ? "연결됨 · 끊기" : "끊김 · 잇기";
        pane.querySelector(".pending")!.textContent = client.pending.length ? `보낼 것 ${client.pending.length}` : "";
    });

    const a = JSON.stringify(clientA.doc.toJSON());
    const p = JSON.stringify(clientP.doc.toJSON());
    const s = JSON.stringify(server?.model ?? null);
    const same = a === p && p === s;
    const offline = pairs.some(x => !x.client.online);
    const badge = $("#converged");

    badge.className = `badge ${same ? "ok" : offline ? "wait" : "bad"}`;
    badge.textContent = same ? "모두 같은 문서 ✓ (A · P · 서버)" : offline ? "서로 다름 — 끊긴 참여자가 있다" : "서로 다름 — 주고받는 중";
    $("#server-seq").textContent = `서버 로그 ${server?.serverSeq ?? "?"}건`;
    $("#model").textContent = JSON.stringify(server?.model ?? null, null, 1).slice(0, 4000);
    $("#pm-doc").textContent = JSON.stringify(view.state.doc.toJSON(), null, 1).slice(0, 4000);

    const st = binding.stats;

    $("#pm-stats").textContent =
        `P 의 Step: ${Object.entries(st.steps).map(([k, v]) => `${k} ${v}`).join(" · ") || "아직 없음"}` +
        ` · 받은 변경 ${st.remote} · CRDT 규칙으로 맞춤 ${st.pushedBack}`;
}

clientA.connect();
clientP.connect();
render();
