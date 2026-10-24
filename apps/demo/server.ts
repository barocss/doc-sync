import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {appendFileSync, existsSync, mkdirSync, readFileSync, rmSync} from "node:fs";
import {createServer} from "node:http";
import {stripTypeScriptTypes} from "node:module";
import {dirname, extname, join, normalize, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {DocHub} from "@barocss/doc-sync/server";
import {isAlive} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../fixtures/demo-schema.ts";
import {PRODUCT_SCHEMAS} from "../../fixtures/product-schemas.ts";
import type {IncomingMessage, ServerResponse} from "node:http";
import type {Ack, Change, Presence, ServerEvent} from "@barocss/doc-sync/sync";

/**
 * 동기화 서버 + 데모 페이지. Node 기본 모듈만 쓴다.
 *
 *   GET  /                          데모 페이지
 *   GET  /multi?n=10&doc=이름        여러 창 시험 (창마다 a.localhost, b.localhost … 로 연다)
 *   GET  /pm?doc=이름                데모 편집기와 ProseMirror 편집기가 같은 문서를 편집
 *   GET  /packages/doc-sync/src/**.ts, /apps/demo/ui/**.ts    TypeScript 를 타입만 벗겨 브라우저에 내준다 (번들러 없음)
 *   GET  /api/docs/:doc/stream      SSE — hello(스냅숏) → 밀린 변경 → 이후 변경·presence
 *   POST /api/docs/:doc/changes     Change 하나
 *   POST /api/docs/:doc/ack         여기까지 받았다 + 되돌리기 핀
 *   POST /api/docs/:doc/presence    커서
 *   POST /api/docs/:doc/leave       창을 닫았다 (더 기다리지 않는다)
 *   POST /api/docs/:doc/gc          지금 GC 해 보기
 *   GET  /api/docs/:doc/state       서버 문서 (확인용)
 *   POST /api/docs/:doc/reset       문서 비우기 (데모용)
 *
 * 로그는 data/<doc>.jsonl 에 한 줄씩 쌓는다 (변경 또는 GC 줄). 서버를 다시 켜면 로그를 되풀이해 이어 간다.
 * 묘비가 쌓이면 서버가 스스로 GC 한다.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, "data"));
const PORT = Number(process.env.PORT ?? 5410);
const profile = process.env.DOC_PROFILE;
if (profile && !Object.hasOwn(PRODUCT_SCHEMAS, profile)) throw new Error(`Unknown document profile: ${profile}`);
const documentSchema = profile ? PRODUCT_SCHEMAS[profile as keyof typeof PRODUCT_SCHEMAS] : DEMO_SCHEMA;
/** 끊긴 참여자의 핀을 지켜 주는 시간 */
const LEASE = 2 * 60_000;
/** 이만큼 압축할 묘비가 모이면 스스로 GC */
const AUTO_GC = 12;
const hubs = new Map<string, DocHub>();

const logPath = (doc: string) => join(DATA, `${doc}.jsonl`);

/** 문서 하나를 연다. 처음이면 디스크의 로그를 되풀이한다 */
const hubOf = (doc: string): DocHub => {
    let hub = hubs.get(doc);

    if (hub) {
        return hub;
    }

    // 서버도 같은 스키마로 검사한다. 스키마 없이 띄워도(schema: null) 순서 매기기·적용·GC 는 된다
    hub = new DocHub({lease: LEASE, schema: process.env.NO_SCHEMA ? null : documentSchema});

    if (existsSync(logPath(doc))) {
        readFileSync(logPath(doc), "utf8")
            .split("\n")
            .filter(Boolean)
            .forEach(line => {
                const entry = JSON.parse(line) as {gc?: number; change?: Change} & Partial<Change>;

                try {
                    entry.gc !== undefined ? hub!.replayGc(entry.gc) : hub!.submit(upgradeV2(entry.change ?? (entry as Change)));
                } catch (error) {
                    console.warn(`${doc}: 저장된 줄을 건너뛴다 — ${(error as Error).message}`);
                }
            });
    }

    hub.onAppend = envelope =>
        appendFileSync(
            logPath(doc),
            `${JSON.stringify(envelope.gc !== undefined ? {gc: envelope.gc} : {change: envelope.change})}\n`,
        );
    hubs.set(doc, hub);

    return hub;
};

/**
 * 앞 판(v2) 로그를 지금 연산으로 바꾼다. v2 는 블록 종류를 CRDT 가 알았고(bullet·numbered·indent), 지금은 데모 스키마가
 * 목록을 list-item + listType·level 로 나타낸다.
 */
type V2Op = {t: string; [key: string]: unknown};

const LIST: Record<string, string> = {bullet: "bullet", numbered: "numbered"};

const upgradeV2 = (change: Change): Change => ({
    ...change,
    ops: (change.ops as unknown as V2Op[]).map(op => {
        if (op.t === "block") {
            const type = String(op.type);
            const attrs: Record<string, unknown> = LIST[type] ? {listType: LIST[type], ...(op.indent ? {level: op.indent} : {})} : {};

            return {t: "node", id: op.id, origin: op.origin, type: LIST[type] ? "list-item" : type, boundary: op.boundary, ...(Object.keys(attrs).length ? {attrs} : {})};
        }

        if (op.t === "attr") {
            const value = op.key === "type" && LIST[String(op.value)] ? "list-item" : op.value;

            return {t: "set", at: op.at, ids: [op.target], key: op.key === "type" ? "$type" : op.key === "indent" ? "level" : op.key, value};
        }

        return op.t === "mark" ? {t: "set", at: op.at, ids: op.ids, key: op.key, value: op.value} : op;
    }) as Change["ops"],
});

let gcTimer: ReturnType<typeof setTimeout> | null = null;

/** 편집·ack 가 잦아들면 GC 를 한 번 시도한다 */
const scheduleGc = (hub: DocHub) => {
    gcTimer && clearTimeout(gcTimer);
    gcTimer = setTimeout(() => hub.gc(AUTO_GC), 800);
};

const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((ok, fail) => {
        let body = "";

        req.on("data", chunk => (body += chunk));
        req.on("end", () => ok(body));
        req.on("error", fail);
    });

const send = (res: ServerResponse, status: number, body: string, type = "application/json; charset=utf-8") => {
    res.writeHead(status, {"content-type": type, "cache-control": "no-store"});
    res.end(body);
};

const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".ts": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
};

/** 정적 파일. .ts 는 타입을 벗겨 JS 로 내준다 */
const serveStatic = (res: ServerResponse, urlPath: string) => {
    const pages: Record<string, string> = {"/": "apps/demo/ui/index.html", "/multi": "apps/demo/ui/multi.html", "/pm": "apps/demo/ui/pm.html"};
    const relative = pages[urlPath] ?? urlPath.replace(/^\/+/, "");
    const file = normalize(join(ROOT, relative));
    // 라이브러리·데모 UI·공유 스키마, 그리고 node_modules 의 js·css 만 (ProseMirror 를 import map 으로 바로 읽는다 — 번들러 없음)
    const within = (directory: string) => file.startsWith(join(ROOT, directory) + sep);
    const allowed = within("packages/doc-sync/src") || within("apps/demo/ui") || file === join(ROOT, "fixtures/demo-schema.ts") || (within("node_modules") && /\.(m?js|css)$/.test(file));

    if (!allowed || !existsSync(file)) {
        return send(res, 404, "없음", "text/plain; charset=utf-8");
    }

    const source = readFileSync(file, "utf8");
    const body = extname(file) === ".ts" ? stripTypeScriptTypes(source, {mode: "strip"}) : source;

    send(res, 200, body, TYPES[extname(file)] ?? "application/octet-stream");
};

/** SSE: 첫 인사 + 밀린 변경을 보내고, 이후 이벤트를 흘린다 */
const stream = (req: IncomingMessage, res: ServerResponse, hub: DocHub, url: URL) => {
    if (url.searchParams.get("protocol") !== String(PROTOCOL_VERSION)) {
        return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
    }
    const since = Number(url.searchParams.get("since") ?? 0);
    const actor = url.searchParams.get("actor") ?? "";
    const write = (event: ServerEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
    });
    const epoch = url.searchParams.get("epoch") ?? undefined;
    const hello = hub.hello(since, epoch);
    write(hello);
    // 처음 붙는 참여자(since=0)는 스냅숏이 전부를 담고 있다. 다시 이어진 참여자에게만 밀린 변경을 보낸다
    hello.type === "hello" && !hello.snapshot && since > 0 && hub.since(since).forEach(envelope => write({type: "change", envelope}));
    actor && hub.connect(actor, hello.type === "hello" && hello.snapshot ? hub.serverSeq : since);

    const stop = hub.listen(write);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

    req.on("close", () => {
        stop();
        clearInterval(heartbeat);

        if (actor) {
            hub.disconnect(actor);
            hub.dropPresence(actor);
        }
    });
};

/** 서버가 들고 있는 문서 — 토큰까지 (확인·시각화용) */
const state = (hub: DocHub) => ({
    epoch: hub.epoch,
    serverSeq: hub.serverSeq,
    frontier: hub.frontier(),
    lastGc: hub.lastFrontier,
    stable: hub.doc.countStable(hub.frontier(), hub.seqOf),
    peers: hub.peerInfo(),
    model: hub.doc.schema ? hub.doc.toJSON() : null,
    tokens: hub.doc.lines().reduce((n, l) => n + l.items.length, 0),
    tombstones: hub.doc.lines().reduce((n, l) => n + l.items.filter(i => !isAlive(i)).length, 0),
    log: hub.log.slice(-50),
});

const ACTIONS = "stream|changes|ack|presence|leave|gc|state|reset";

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(new RegExp(`^/api/docs/([a-z0-9-]{1,40})/(${ACTIONS})$`));

        if (!match) {
            return req.method === "GET" ? serveStatic(res, url.pathname) : send(res, 404, "{}");
        }

        const [, doc, action] = match;
        const hub = hubOf(doc);

        if (action === "stream" && req.method === "GET") {
            return stream(req, res, hub, url);
        }

        if (action === "state" && req.method === "GET") {
            return send(res, 200, JSON.stringify(state(hub)));
        }

        if (req.method !== "POST") {
            return send(res, 405, "{}");
        }

        const body = await readBody(req);

        if (["changes", "ack", "presence", "leave"].includes(action)) {
            const epoch = action === "leave" ? url.searchParams.get("epoch") ?? req.headers["x-doc-sync-epoch"] : req.headers["x-doc-sync-epoch"];
            if (epoch !== hub.epoch) return send(res, 409, JSON.stringify({error: "Document epoch changed", epoch: hub.epoch}));
        }

        switch (action) {
            case "changes": {
                if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                    return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
                }
                try {
                    const envelope = hub.submit(JSON.parse(body) as Change);

                    scheduleGc(hub);

                    return send(res, 200, JSON.stringify({serverSeq: envelope?.serverSeq ?? null}));
                } catch (error) {
                    return send(res, 409, JSON.stringify({error: (error as Error).message}));
                }
            }
            case "ack":
                hub.ack(JSON.parse(body) as Ack);
                scheduleGc(hub);

                return send(res, 200, "{}");
            case "presence":
                hub.setPresence(JSON.parse(body) as Presence);

                return send(res, 200, "{}");
            case "leave":
                hub.leave((JSON.parse(body) as {actor: string}).actor);

                return send(res, 200, "{}");
            case "gc": {
                const envelope = hub.gc();

                return send(res, 200, JSON.stringify({gc: envelope?.gc ?? null, ...state(hub), log: undefined}));
            }
            default:
                // reset
                hub.reset();
                existsSync(logPath(doc)) && rmSync(logPath(doc));

                return send(res, 200, "{}");
        }
    } catch (error) {
        send(res, 500, JSON.stringify({error: (error as Error).message}));
    }
});

mkdirSync(DATA, {recursive: true});
server.listen(PORT, () => {
    const address = server.address();

    console.log(`doc-sync 서버 http://localhost:${typeof address === "object" && address ? address.port : PORT}`);
});
