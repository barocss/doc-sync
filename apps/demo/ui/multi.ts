/**
 * 여러 창 시험. 편집기 창 n 개를 iframe 으로 띄운다. 창마다 호스트가 다르다(a.localhost, b.localhost …) —
 * 브라우저는 같은 호스트로 HTTP/1.1 연결을 6개까지만 열기 때문이다. 각 창은 참여자 하나, 관찰자 없이(observer=0) 연결을 하나만 쓴다.
 *
 * 창들은 500ms 마다 자기 문서의 지문을 이 창에 알린다(postMessage). 이 창은 서버 문서(상태 API)의 지문과 비교해
 * "모두 같은 문서"인지 보여 준다.
 *
 *   /apps/demo/ui/multi.html?n=10&doc=이름
 */

type Status = {
    kind: "zt-status";
    name: string;
    actor: string;
    hash: string;
    size: number;
    pending: number;
    online: boolean;
    serverSeq: number;
    auto: boolean;
};

const params = new URLSearchParams(location.search);
const DOC = params.get("doc") ?? "multi";
const LETTERS = "ABCDEFGHIJ";
let count = Math.min(10, Math.max(1, Number(params.get("n") ?? 10)));
const statuses = new Map<string, Status & {at: number}>();
let server: {hash: string; serverSeq: number} | null = null;

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

const fingerprint = (text: string): string => {
    let h = 0x811c9dc5;

    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return (h >>> 0).toString(16).padStart(8, "0");
};

/** 창 하나의 주소 — 글자마다 다른 호스트 */
const frameUrl = (letter: string): string => {
    const host = location.hostname === "localhost" || location.hostname.endsWith(".localhost") ? `${letter.toLowerCase()}.localhost` : location.hostname;
    const query = new URLSearchParams({doc: DOC, peers: "1", observer: "0", embed: "1", names: letter});

    return `${location.protocol}//${host}:${location.port}/?${query}`;
};

const frames = (): HTMLIFrameElement[] => [...document.querySelectorAll<HTMLIFrameElement>("#frames iframe")];

function open(): void {
    const main = $("#frames");

    main.innerHTML = "";
    statuses.clear();

    for (const letter of LETTERS.slice(0, count)) {
        const frame = document.createElement("iframe");

        frame.src = frameUrl(letter);
        frame.title = `참여자 ${letter}`;
        main.append(frame);
    }
}

const send = (cmd: string) => frames().forEach(f => f.contentWindow?.postMessage({kind: "zt-cmd", cmd}, "*"));

window.addEventListener("message", event => {
    const data = event.data as Status;

    data?.kind === "zt-status" && statuses.set(data.name, {...data, at: Date.now()});
});

async function poll(): Promise<void> {
    try {
        const state = (await (await fetch(`/api/docs/${encodeURIComponent(DOC)}/state`)).json()) as {model: unknown; serverSeq: number};

        server = {hash: fingerprint(JSON.stringify(state.model)), serverSeq: state.serverSeq};
    } catch {
        server = null;
    }

    render();
}

function render(): void {
    const rows = $("#rows");
    const list = [...LETTERS.slice(0, count)].map(letter => statuses.get(letter));
    const known = list.filter((s): s is Status & {at: number} => !!s);
    const same = !!server && known.length === count && known.every(s => s.hash === server!.hash && !s.pending && s.online);
    const running = known.filter(s => s.auto).length;
    const offline = known.filter(s => !s.online).length;
    const badge = $("#converged");

    rows.innerHTML = "";
    [...LETTERS.slice(0, count)].forEach(letter => {
        const s = statuses.get(letter);
        const tr = document.createElement("tr");

        tr.className = s && server && s.hash !== server.hash ? "diff" : "";
        tr.innerHTML = s
            ? `<td>${letter}</td><td>${s.online ? "연결됨" : "끊김"}</td><td>${s.auto ? "켬" : "—"}</td><td>#${s.serverSeq}</td>` +
              `<td>${s.pending}</td><td class="hash">${s.hash}</td><td>${s.size.toLocaleString()}</td>`
            : `<td>${letter}</td><td colspan="6" class="muted">여는 중…</td>`;
        rows.append(tr);
    });

    const serverRow = document.createElement("tr");

    serverRow.innerHTML = `<td>서버</td><td>—</td><td>—</td><td>#${server?.serverSeq ?? "?"}</td><td>—</td><td class="hash">${server?.hash ?? "?"}</td><td></td>`;
    rows.append(serverRow);

    badge.className = `badge ${same ? "ok" : running || !known.length ? "wait" : offline ? "wait" : "bad"}`;
    badge.textContent = same
        ? `모두 같은 문서 ✓ (창 ${count} + 서버)`
        : running
          ? `입력 중 — 창 ${running}개가 자동 입력`
          : offline
            ? `끊긴 창 ${offline}개 — 이으면 합쳐진다`
            : known.length < count
              ? "창 여는 중…"
              : "서로 다름 — 주고받는 중";
    $("#summary").textContent = `서버 로그 ${server?.serverSeq ?? "?"}건 · 창마다 연결 하나 (호스트 ${count}개)`;
}

$("#doc-name").textContent = DOC;
$<HTMLInputElement>("#count").value = String(count);
$("#reload").addEventListener("click", () => {
    count = Math.min(10, Math.max(1, Number($<HTMLInputElement>("#count").value) || 10));
    open();
});
$("#auto-on").addEventListener("click", () => send("auto-on"));
$("#auto-off").addEventListener("click", () => send("auto-off"));
$("#off").addEventListener("click", () => send("disconnect"));
$("#on").addEventListener("click", () => send("connect"));
$("#reset").addEventListener("click", async () => {
    send("auto-off");
    await fetch(`/api/docs/${encodeURIComponent(DOC)}/reset`, {method: "POST"});
});

open();
setInterval(poll, 700);
poll();
