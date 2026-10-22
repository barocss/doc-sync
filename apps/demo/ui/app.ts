import {MAIN, isAlive} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {SyncClient} from "@barocss/doc-sync/sync";
import {HttpTransport} from "@barocss/doc-sync/sync";
import {Editor} from "./editor.ts";
import {describeEnvelope, renderTokens} from "./inspector.ts";
import {createActionGuard, resetAndWait} from "./reset.ts";
import type {GridBlock, NodeJSON, Pos, Run, TextBlock, Doc} from "@barocss/doc-sync";
import type {Envelope, ServerEvent} from "@barocss/doc-sync/sync";

/**
 * 데모 페이지. 한 페이지에 참여자 여럿을 띄운다. 참여자마다 자기 SyncClient 와 자기 서버 연결(SSE)을 따로 가지므로,
 * 다른 창·다른 컴퓨터에서 붙은 것과 똑같이 서버를 거쳐 주고받는다.
 *
 *   ?doc=이름      문서 (기본 demo)
 *   ?peers=1..4    이 창에 띄울 참여자 수 (기본 3)
 *   ?names=E,F     참여자 이름 (기본 A,B,C,D)
 *   ?observer=0    서버 관찰자(SSE 하나)를 띄우지 않는다. 서버 문서는 상태 API 로 가끔 받아 비교한다
 *   ?embed=1       여러 창 시험(multi.html) 안에 들어갈 때 — 위 막대·토큰 보기를 감추고, 상태를 부모 창에 알린다
 *   ?auto=1        참여자들이 처음부터 무작위로 입력한다 (자동 입력)
 *
 * 브라우저는 같은 호스트로 연결을 6개까지만 연다. 여러 창을 한꺼번에 시험하려면 창마다 다른 호스트
 * (a.localhost, b.localhost …)로 열고 observer=0 으로 연결을 하나씩만 쓴다 — multi.html 이 그렇게 한다.
 */

const params = new URLSearchParams(location.search);
const DOC = params.get("doc") ?? "demo";
const PEERS = Math.min(4, Math.max(1, Number(params.get("peers") ?? 3)));
const NAMES = (params.get("names") ?? "A,B,C,D").split(",").slice(0, PEERS);
const WITH_OBSERVER = params.get("observer") !== "0";
const EMBED = params.get("embed") === "1";
const AUTO = params.get("auto") === "1";
/** 스키마는 바깥에서 주입한다 — 서버도 같은 것을 쓴다 */
const SCHEMA = DEMO_SCHEMA;

/** 창을 새로 열 때마다 다른 참여자가 되도록 이름 뒤에 꼬리를 붙인다 (서버는 참여자별 seq 로 중복을 거른다) */
const actorOf = (name: string) => `${name}-${Math.random().toString(36).slice(2, 6)}`;

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

type Peer = {name: string; client: SyncClient; editor: Editor; pane: HTMLElement; transport: HttpTransport; robot: Robot};

/** 서버의 GC 상태와 서버 문서 (상태 API 로 가끔 받아 온다) */
type GcState = {
    frontier: number;
    lastGc: number;
    stable: number;
    serverSeq: number;
    model: NodeJSON | null;
    log: Envelope[];
    peers: Array<{actor: string; seq: number; pin: number | null; online: boolean}>;
};

let gcState: GcState | null = null;

const peers: Peer[] = [];
let inspected = WITH_OBSERVER ? "server" : (NAMES[0] ?? "server");
let serverLog: Envelope[] = [];
let renderQueued = false;

// ── 서버 관찰자: 읽기만 하는 참여자. 서버 문서의 사본과 로그를 보여 주는 데 쓴다 ─────────────────────

// 브라우저는 한 주소에 연결을 6개까지만 연다. 참여자 4 + 관찰자 1 = SSE 5개, 남은 하나로 POST 를 보낸다.
const OBSERVER = `~obs-${Math.random().toString(36).slice(2, 6)}`;
const observerTransport = new HttpTransport(DOC, OBSERVER);
const observer = new SyncClient(OBSERVER, observerTransport, {schema: SCHEMA, ackDelay: 200});

observer.onEvent = (event: ServerEvent) => {
    if (event.type === "change") {
        serverLog = [...serverLog, event.envelope].slice(-200);
    } else if (event.type === "reset") {
        serverLog = [];
    }
};
observer.onUpdate = queueRender;
// 이미 쌓인 로그의 끝부분은 상태 API 로 한 번 받아 둔다
fetch(`/api/docs/${encodeURIComponent(DOC)}/state`)
    .then(r => r.json())
    .then((state: {log: Envelope[]}) => {
        serverLog = [...state.log, ...serverLog.filter(e => !state.log.some(s => s.serverSeq === e.serverSeq))];
        queueRender();
    })
    .catch(() => undefined);
WITH_OBSERVER && observer.connect();
EMBED && document.body.classList.add("embed");

/** 서버 문서와 번호 — 관찰자가 있으면 그 사본, 없으면 상태 API 로 받은 것 */
const serverJSON = (): string => (WITH_OBSERVER ? JSON.stringify(observer.doc.toJSON()) : JSON.stringify(gcState?.model ?? null));
const serverSeqNow = (): number => (WITH_OBSERVER ? observer.serverSeq : (gcState?.serverSeq ?? 0));

/**
 * 무작위로 편집하는 손. 편집기의 공개 동작(글자·Enter·Backspace·커서 옮기기)만 쓴다 — 사람이 키를 누르는 것과 같은 길.
 * 0.15~0.6초마다 한 번.
 */
class Robot {
    running = false;
    private timer = 0;
    private readonly editor: Editor;

    constructor(editor: Editor) {
        this.editor = editor;
    }

    start(): void {
        this.running = true;
        this.tick();
    }

    stop(): void {
        this.running = false;
        clearTimeout(this.timer);
    }

    private tick(): void {
        if (!this.running) {
            return;
        }

        try {
            this.act();
        } catch (error) {
            console.error("자동 입력", error);
        }

        this.timer = window.setTimeout(() => this.tick(), 150 + Math.random() * 450);
    }

    private act(): void {
        const editor = this.editor;
        const doc = editor.client.doc;
        const roll = Math.random();

        if (roll < 0.15) {
            // 본문의 아무 글 블록·아무 자리로
            const texts = doc
                .blocks()
                .map((b, i) => [b, i] as const)
                .filter(([b]) => b.kind === "text" && doc.takesText(b.type));
            const [block, b] = texts[Math.floor(Math.random() * texts.length)];

            editor.moveTo({b, o: Math.floor(Math.random() * ((block as TextBlock).chars.length + 1))});
        } else if (roll < 0.75) {
            editor.insert("가나다라마바사아자차카타파하abcdefg"[Math.floor(Math.random() * 21)]);
        } else if (roll < 0.85) {
            editor.enter();
        } else {
            editor.backspace();
        }
    }
}

// ── 참여자 ─────────────────────────────────────────────────────────────────

const grid = $<HTMLElement>("#peers");

NAMES.forEach(name => {
    const pane = document.createElement("section");

    pane.className = "pane";
    pane.innerHTML = `
        <header>
            <span class="who"><i class="dot"></i>${name}</span>
            <button type="button" class="btn link-toggle"></button>
            <button type="button" class="btn auto-toggle" title="무작위로 글자·Enter·Backspace 를 친다">자동 입력</button>
            <span class="pending"></span>
        </header>
        <div class="gcinfo"></div>
        <div class="editor"></div>`;
    grid.append(pane);

    const actor = actorOf(name);
    const transport = new HttpTransport(DOC, actor);
    const client = new SyncClient(actor, transport, {schema: SCHEMA, ackDelay: 200});
    const editor = new Editor(pane.querySelector(".editor") as HTMLElement, client, name);
    const robot = new Robot(editor);
    const peer = {name, client, editor, pane, transport, robot};

    pane.style.setProperty("--me", editor.color);
    pane.querySelector(".link-toggle")!.addEventListener("click", () => {
        client.online ? client.disconnect() : client.connect();
    });
    pane.querySelector(".auto-toggle")!.addEventListener("click", () => {
        robot.running ? robot.stop() : robot.start();
        queueRender();
    });
    client.onUpdate = () => {
        // 문서가 통째로 바뀌었으면(처음 받은 스냅숏·초기화) 커서를 맨 앞으로
        if (!client.doc.get(editor.anchor)) {
            editor.anchor = MAIN;
            editor.focus = null;
        }

        queueRender();
    };
    peers.push(peer);
    client.connect();
    AUTO && robot.start();
});

// ── 위 막대 ────────────────────────────────────────────────────────────────

$("#doc-name").textContent = DOC;
$("#all-off").addEventListener("click", () => peers.forEach(p => p.client.disconnect()));
$("#all-on").addEventListener("click", () => peers.forEach(p => p.client.connect()));
$("#reset").addEventListener("click", () => runScenario(() => resetDoc()));
$("#sc-concurrent").addEventListener("click", () => runScenario(concurrentEnter));
$("#sc-sequential").addEventListener("click", () => runScenario(sequentialEnter));
$("#sc-undo").addEventListener("click", () => runScenario(undoVersusDelete));
$("#sc-gc").addEventListener("click", () => runScenario(gcScenario));
$("#sc-table-grow").addEventListener("click", () => runScenario(tableGrow));
$("#sc-table-cut").addEventListener("click", () => runScenario(tableCut));
$("#gc-now").addEventListener("click", () => gcNow());

// 창을 닫으면 서버가 이 창의 참여자들을 더 기다리지 않도록 알린다 (끊김 단추는 "잠시 끊김"이라 기다려 준다)
window.addEventListener("pagehide", () => [...peers.map(p => p.transport), ...(WITH_OBSERVER ? [observerTransport] : [])].forEach(t => t.leave()));

/** 서버의 GC 기준점과 참여자별 받은 곳·핀을 가끔 받아 온다 */
async function pollGc(): Promise<void> {
    try {
        gcState = (await (await fetch(`/api/docs/${encodeURIComponent(DOC)}/state`)).json()) as GcState;
        queueRender();
    } catch {
        // 서버가 잠시 없으면 다음에
    }
}

setInterval(pollGc, 1000);
pollGc();

async function gcNow(): Promise<{gc: number | null; stable: number; frontier: number}> {
    const result = (await (await fetch(`/api/docs/${encodeURIComponent(DOC)}/gc`, {method: "POST"})).json()) as {
        gc: number | null;
        stable: number;
        frontier: number;
    };

    await pollGc();

    return result;
}

// ── 그리기 ─────────────────────────────────────────────────────────────────

function queueRender(): void {
    if (renderQueued) {
        return;
    }

    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        render();
    });
}

function render(): void {
    peers.forEach(({client, editor, pane}) => {
        editor.render();
        pane.classList.toggle("offline", !client.online);
        pane.querySelector(".link-toggle")!.textContent = client.online ? "연결됨 · 끊기" : "끊김 · 잇기";
        pane.querySelector(".pending")!.textContent = client.pending.length ? `보낼 것 ${client.pending.length}` : "";
        pane.querySelector(".auto-toggle")!.classList.toggle("on", peers.find(p => p.client === client)!.robot.running);

        const info = gcState?.peers.find(p => p.actor === client.actor);

        pane.querySelector(".gcinfo")!.textContent = info
            ? `서버가 아는 받은 곳 #${info.seq}${info.pin !== null ? ` · 되돌리기 핀 #${info.pin} (이 앞에서만 GC)` : " · 핀 없음"}`
            : "";
    });

    // 수렴: 모든 참여자와 서버 사본의 문서가 같은가
    const server = serverJSON();
    const offline = peers.filter(p => !p.client.online).length;
    const same = peers.every(p => JSON.stringify(p.client.doc.toJSON()) === server);
    const badge = $("#converged");

    badge.className = `badge ${same ? "ok" : offline ? "wait" : "bad"}`;
    badge.textContent = same
        ? "모두 같은 문서 ✓"
        : offline
          ? `서로 다름 — 끊긴 참여자 ${offline}명 (이으면 합쳐진다)`
          : "서로 다름 — 주고받는 중";
    $("#server-seq").textContent = `서버 로그 ${serverSeqNow()}건`;
    $("#gc-state").textContent = gcState
        ? `GC 기준점 #${gcState.frontier} · 압축할 수 있는 묘비 ${gcState.stable} · 마지막 GC #${gcState.lastGc || "-"}`
        : "";

    // 토큰 보기
    const tabs = $("#inspect-tabs");

    tabs.innerHTML = "";
    [...peers.map(p => p.name), ...(WITH_OBSERVER ? ["server"] : [])].forEach(name => {
        const tab = document.createElement("button");

        tab.type = "button";
        tab.className = `tab ${inspected === name ? "on" : ""}`;
        tab.textContent = name === "server" ? "서버" : name;
        tab.addEventListener("click", () => {
            inspected = name;
            render();
        });
        tabs.append(tab);
    });

    const doc = inspected === "server" ? observer.doc : peers.find(p => p.name === inspected)!.client.doc;

    renderTokens($("#tokens"), doc);
    $("#model").textContent = modelText(doc.toJSON());

    const log = $("#log");

    log.innerHTML = "";
    [...(WITH_OBSERVER ? serverLog : (gcState?.log ?? []))].reverse().forEach(envelope => {
        const line = document.createElement("li");

        line.textContent = describeEnvelope(envelope);
        line.style.setProperty("--who", peers.find(p => p.client.actor === envelope.change?.actor)?.editor.color ?? "#64748b");
        log.append(line);
    });
}

/** 모델 트리를 들여 쓴 글로 */
function modelText(node: NodeJSON, depth = 0): string {
    const attrs = Object.entries(node.attrs ?? {})
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
    const runText = (r: Run): string => {
        if (!("text" in r)) {
            const attrs = r.attrs ? ` ${Object.entries(r.attrs).map(([k, v]) => `${k}=${k === "src" ? "…" : JSON.stringify(v)}`).join(" ")}` : "";

            // 링크 같은 span 은 안의 글도
            return r.runs ? `<${r.type}${attrs}>${r.runs.map(runText).join(" + ")}</${r.type}>` : `<${r.type}${attrs}>`;
        }

        const marks = Object.keys(r.marks);

        return marks.length ? `${JSON.stringify(r.text)}[${marks.join(",")}]` : JSON.stringify(r.text);
    };
    const runs = node.runs?.map(runText);
    const head = `${"  ".repeat(depth)}${node.type}${attrs ? ` {${attrs}}` : ""}${runs ? ` ${runs.join(" + ") || '""'}` : ""}`;

    return [head, ...(node.children ?? []).map(c => modelText(c, depth + 1))].join("\n");
}

// ── 시나리오 ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const say = (text: string) => {
    $("#caption").textContent = text;
};

const waitFor = async (condition: () => boolean, timeout = 4000) => {
    const until = Date.now() + timeout;

    while (!condition() && Date.now() < until) {
        await sleep(30);
    }
};

const settled = () =>
    peers.every(p => p.client.online && !p.client.pending.length && p.client.serverSeq === serverSeqNow());

async function resetDoc(seed = ""): Promise<void> {
    peers.forEach(p => p.client.connect());
    await waitFor(() => peers.every(p => p.client.online));
    await resetAndWait([...peers.map(p => p.client), ...(WITH_OBSERVER ? [observer] : [])], async () => {
        const response = await fetch(`/api/docs/${encodeURIComponent(DOC)}/reset`, {method: "POST"});

        if (!response.ok) throw new Error(`문서 초기화 HTTP ${response.status}`);
    });

    if (seed) {
        const first = peers[0].editor;

        first.moveTo({b: 0, o: 0});
        first.insert(seed);
        await waitFor(() => settled() && peers.every(p => (p.client.doc.blocks()[0] as TextBlock | undefined)?.text === seed));
    }
}

const guardScenario = createActionGuard();

async function runScenario(scenario: () => Promise<void>): Promise<void> {
    await guardScenario(async () => {
        document.body.classList.add("running");
        try {
            await scenario();
        } catch (error) {
            say(`시나리오 중단: ${(error as Error).message}`);
        } finally {
            document.body.classList.remove("running");
        }
    });
}

/** 모두 끊고, 같은 자리에서 Enter + 자기 글자, 다시 잇기 */
async function concurrentEnter(): Promise<void> {
    say("① 'abcdefgh' 로 시작");
    await resetDoc("abcdefgh");
    await sleep(500);
    say("② 모두 끊는다 — 이제부터는 서로의 편집을 모른다");
    peers.forEach(p => p.client.disconnect());
    await sleep(700);

    for (const p of peers) {
        say(`③ ${p.name} 가 abcd|efgh 에서 Enter 를 치고 '${p.name}' 를 친다`);
        p.editor.moveTo({b: 0, o: 4});
        p.editor.enter();
        p.editor.insert(p.name);
        await sleep(600);
    }

    say("④ 각자 화면은 다르다. 이제 다시 잇는다");
    await sleep(1200);
    peers.forEach(p => p.client.connect());
    await waitFor(settled);
    say("⑤ 같은 자리 동시 Enter 는 새 줄 하나로 모이고, 모두의 글자가 그 줄에 남는다 — 토큰 줄에서 주황 ¶(흡수된 표지)를 보라");
}

/** 연결된 채로 차례로 Enter — 보고 친 Enter 는 각자 줄이 된다 */
async function sequentialEnter(): Promise<void> {
    say("① 'abcdefgh' 로 시작, 모두 연결된 채로");
    await resetDoc("abcdefgh");
    await sleep(500);

    for (const p of peers) {
        say(`② ${p.name} 가 앞사람의 Enter 를 본 뒤 abcd 끝에서 Enter + '${p.name}'`);
        p.editor.moveTo({b: 0, o: 4});
        p.editor.enter();
        p.editor.insert(p.name);
        await waitFor(settled);
        await sleep(600);
    }

    say("③ 서로 보고 친 Enter 는 경계(왼쪽·오른쪽 토큰)가 달라 각자 줄이 된다");
}

/** 내 되돌리기가 보지 못한 남의 삭제를 되살리지 않는다 */
async function undoVersusDelete(): Promise<void> {
    if (peers.length < 2) {
        say("참여자가 둘 이상 있어야 한다");

        return;
    }

    const [a, b] = peers;

    say("① 'abcdefgh' 로 시작");
    await resetDoc("abcdefgh");
    await sleep(500);
    say("② 모두 끊는다");
    peers.forEach(p => p.client.disconnect());
    await sleep(600);
    say(`③ ${b.name} 가 'd' 를 지운다`);
    b.editor.moveTo({b: 0, o: 4});
    b.editor.backspace();
    await sleep(700);
    say(`④ 그 사이 ${a.name} 는 'defgh' 를 지운다 (${b.name} 의 삭제는 모른다)`);
    a.editor.moveTo({b: 0, o: 8});
    a.editor.moveTo({b: 0, o: 3}, true);
    a.editor.backspace();
    await sleep(700);
    say(`⑤ ${b.name} 가 되돌리기 — 자기가 지운 'd' 만 되살린다`);
    b.editor.undo();
    await sleep(900);
    say("⑥ 다시 잇는다");
    peers.forEach(p => p.client.connect());
    await waitFor(settled);
    say(`⑦ 결과 'abc' — ${a.name} 가 지운 'd' 는 ${b.name} 의 되돌리기와 무관하게 죽어 있다 (토큰 'd' 위에 마우스를 올려 지우기 기록을 보라)`);
}

/** 묘비 정리(GC)가 언제 되고 언제 기다리는지 */
async function gcScenario(): Promise<void> {
    if (peers.length < 2) {
        say("참여자가 둘 이상 있어야 한다");

        return;
    }

    const [a, b] = peers;
    const tombstones = () => observer.doc.items.filter(i => !i.compact && !isAlive(i)).length;

    say("① 'hello world' 로 시작");
    await resetDoc("hello world");
    await sleep(600);
    say(`② ${b.name} 를 끊는다 — 이제부터의 편집을 ${b.name} 는 모른다`);
    b.client.disconnect();
    await sleep(900);
    say(`③ ${a.name} 가 ' world' 를 지운다 — 묘비 6개`);
    a.editor.moveTo({b: 0, o: 11});
    a.editor.moveTo({b: 0, o: 5}, true);
    a.editor.backspace();
    await sleep(1200);

    let result = await gcNow();

    say(`④ GC 시도 → ${result.gc === null ? "안 함" : "함"}. ${a.name} 가 되돌리기로 되살릴 수 있어 핀이 막는다 (${a.name} 칸 위 '핀')`);
    await sleep(2800);
    say(`⑤ ${a.name} 가 되돌리기 기록을 비운다 — 되살릴 사람이 없어졌다`);
    a.client.clearHistory();
    await sleep(1200);
    result = await gcNow();
    say(
        `⑥ GC 시도 → ${result.gc === null ? "안 함" : "함"}. 끊긴 ${b.name} 는 그 글자들이 지워진 걸 아직 모른다 — ` +
            `다시 오면 그 글자를 기준으로 쓴 편집을 들고 올 수 있으니 기다린다 (${b.name} 칸 위 '받은 곳')`,
    );
    await sleep(3400);
    say(`⑦ ${b.name} 를 다시 잇는다`);
    b.client.connect();
    await waitFor(settled);
    await sleep(1200);

    const before = tombstones();

    result = await gcNow();
    await waitFor(() => result.gc === null || peers.every(p => p.client.gcFrontier === result.gc));
    say(
        result.gc === null
            ? "⑧ GC 시도 → 안 함 (아직 받은 곳이 다 모이지 않았다 — '지금 GC' 를 다시 눌러 보라)"
            : `⑧ GC → 묘비 ${before}개가 압축 묶음 하나(▒×${before})가 됐다. 모든 참여자가 로그의 같은 줄에서 같은 압축을 한다 (토큰 줄의 ▒)`,
    );
}

// ── 표 시나리오 ─────────────────────────────────────────────────────────

const firstGrid = (doc: Doc): {grid: GridBlock; b: number} | null => {
    const b = doc.blocks().findIndex(x => x.kind === "grid");

    return b >= 0 ? {grid: doc.blocks()[b] as GridBlock, b} : null;
};

/** 첫 표의 (r, c) 칸 끝 */
const cellEnd = (doc: Doc, r: number, c: number): Pos => {
    const {grid} = firstGrid(doc)!;

    return doc.lineEdge(doc.cellKey(grid.marker, grid.rows[r], grid.cols[c]), true);
};

/** 2×2 표를 넣고 칸을 1·2·3·4 로 채운 문서 */
async function seedTable(): Promise<void> {
    await resetDoc("표 아래 글");

    const first = peers[0].editor;

    first.moveTo({b: 0, o: 0});
    first.insertChoiceForScenario("table:2x2");
    ["1", "2", "3", "4"].forEach((ch, i) => {
        first.moveTo(cellEnd(first.client.doc, Math.floor(i / 2), i % 2));
        first.insert(ch);
    });
    await waitFor(() => settled() && peers.every(p => firstGrid(p.client.doc)?.grid.cols.length === 2));
}

/** 한 사람은 행을, 한 사람은 열을 — 서로 모르고 더해도 새 칸까지 맞물린다 */
async function tableGrow(): Promise<void> {
    if (peers.length < 2) {
        say("참여자가 둘 이상 있어야 한다");

        return;
    }

    const [a, b] = peers;

    say("① 2×2 표 (칸마다 1·2·3·4)");
    await seedTable();
    await sleep(700);
    say("② 모두 끊는다");
    peers.forEach(p => p.client.disconnect());
    await sleep(600);
    say(`③ ${a.name} 는 아래에 행을 더한다`);
    a.editor.moveTo(cellEnd(a.client.doc, 1, 0));
    a.editor.tableAction("row+");
    await sleep(900);
    say(`④ ${b.name} 는 그 사이 가운데에 열을 더한다 (${a.name} 의 새 행은 모른다)`);
    b.editor.moveTo(cellEnd(b.client.doc, 0, 0));
    b.editor.tableAction("col+");
    await sleep(900);
    say("⑤ 다시 잇는다");
    peers.forEach(p => p.client.connect());
    await waitFor(settled);
    await sleep(500);

    const last = peers.at(-1)!;

    say(`⑥ 3×3 — 두 사람이 서로 모르고 만든 행과 열이 만나는 칸도 있다. ${last.name} 가 거기에 'X' 를 쓴다`);
    last.editor.moveTo(cellEnd(last.client.doc, 2, 1));
    last.editor.insert("X");
    await waitFor(settled);
    say("⑦ 칸은 행·열의 번호가 아니라 이름표로 가리킨다 — 토큰 보기의 '행 줄'·'열 줄'·'칸' 을 보라");
}

/** 열 지우기 대 그 열의 칸에 쓰기, 그리고 되돌리기 */
async function tableCut(): Promise<void> {
    if (peers.length < 2) {
        say("참여자가 둘 이상 있어야 한다");

        return;
    }

    const [a, b] = peers;

    say("① 2×2 표 (칸마다 1·2·3·4)");
    await seedTable();
    await sleep(700);
    say("② 모두 끊는다");
    peers.forEach(p => p.client.disconnect());
    await sleep(600);
    say(`③ ${a.name} 가 오른쪽 열을 지운다`);
    a.editor.moveTo(cellEnd(a.client.doc, 0, 1));
    a.editor.tableAction("col-");
    await sleep(900);
    say(`④ 그 사이 ${b.name} 는 그 열의 칸에 '!!' 를 쓴다`);
    b.editor.moveTo(cellEnd(b.client.doc, 1, 1));
    b.editor.insert("!");
    b.editor.insert("!");
    await sleep(900);
    say("⑤ 다시 잇는다");
    peers.forEach(p => p.client.connect());
    await waitFor(settled);
    await sleep(1200);
    say(`⑥ 열은 사라졌다 (${b.name} 의 글은 묘비가 아니라 안 보이는 칸에 살아 있다). ${a.name} 가 되돌리기`);
    await sleep(1500);
    a.editor.undo();
    await waitFor(settled);
    say(`⑦ 열이 돌아오고 ${b.name} 가 쓴 '!!' 도 함께 돌아왔다`);
}

// ── 자동 입력 · 여러 창 시험 ───────────────────────────────────────────────

/** 문서 모델의 짧은 지문 (FNV-1a) — 여러 창 시험에서 창끼리 비교한다 */
const fingerprint = (text: string): string => {
    let h = 0x811c9dc5;

    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return (h >>> 0).toString(16).padStart(8, "0");
};

if (EMBED && window.parent !== window) {
    // 부모 창(multi.html)에 상태를 알리고, 부모의 지시를 받는다
    setInterval(() => {
        peers.forEach(p => {
            const json = JSON.stringify(p.client.doc.toJSON());

            window.parent.postMessage(
                {
                    kind: "zt-status",
                    name: p.name,
                    actor: p.client.actor,
                    hash: fingerprint(json),
                    size: json.length,
                    pending: p.client.pending.length,
                    online: p.client.online,
                    serverSeq: p.client.serverSeq,
                    auto: p.robot.running,
                },
                "*",
            );
        });
    }, 500);
    window.addEventListener("message", event => {
        const cmd = (event.data as {kind?: string; cmd?: string})?.kind === "zt-cmd" ? (event.data as {cmd: string}).cmd : null;

        peers.forEach(p => {
            cmd === "auto-on" && p.robot.start();
            cmd === "auto-off" && p.robot.stop();
            cmd === "disconnect" && p.client.disconnect();
            cmd === "connect" && p.client.connect();
        });
        cmd && queueRender();
    });
}

render();
