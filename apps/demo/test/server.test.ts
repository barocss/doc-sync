import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {Doc} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {ServerEvent} from "@barocss/doc-sync/sync";

const serverFile = fileURLToPath(new URL("../server.ts", import.meta.url));

/** Each process uses its own data directory. The repository's data is never opened. */
async function start(data: string) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data};

    delete env.NO_SCHEMA;
    const child = spawn(process.execPath, [serverFile], {cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"]});
    let output = "";
    let error = "";

    child.stderr.on("data", chunk => { error += String(chunk); });
    const base = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`서버 시작 시간 초과: ${output}\n${error}`));
        }, 10_000);

        child.once("error", failure => { clearTimeout(timeout); reject(failure); });
        child.once("exit", code => { clearTimeout(timeout); reject(new Error(`서버 종료 ${code}: ${error}`)); });
        child.stdout.on("data", chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/localhost:(\d+)/);

            if (match) {
                clearTimeout(timeout);
                assert.notEqual(match[1], "0");
                resolve(match[0]);
            }
        });
    });

    return {
        base,
        async stop() {
            if (child.exitCode === null && child.signalCode === null) {
                const exited = once(child, "exit");

                child.kill();
                await exited;
            }
        },
    };
}

async function post(base: string, action: string, body?: unknown) {
    return fetch(`${base}/api/docs/integration/${action}`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function events(base: string, since: number, count: number): Promise<ServerEvent[]> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 5_000);
    const response = await fetch(`${base}/api/docs/integration/stream?actor=reader&since=${since}`, {signal: abort.signal});
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const received: ServerEvent[] = [];
    let buffer = "";

    try {
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type")!, /text\/event-stream/);
        while (received.length < count) {
            const chunk = await reader.read();

            assert.equal(chunk.done, false);
            buffer += decoder.decode(chunk.value, {stream: true});
            let boundary: number;

            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                const message = buffer.slice(0, boundary);

                buffer = buffer.slice(boundary + 2);
                if (message.startsWith("data: ")) received.push(JSON.parse(message.slice(6)) as ServerEvent);
            }
        }
        return received;
    } finally {
        clearTimeout(timeout);
        abort.abort();
        await reader.cancel().catch(() => undefined);
    }
}

test("데모 HTTP: 세 페이지의 import map과 모든 모듈·스타일 경로를 제공한다", async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-demo-static-"));
    const server = await start(data);

    try {
        for (const page of ["/", "/multi?n=4", "/pm"]) {
            const response = await fetch(server.base + page);

            assert.equal(response.status, 200);
            const html = await response.text();
            const imports = JSON.parse(html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/)![1]).imports as Record<string, string>;

            assert.equal(imports["@barocss/doc-sync"], "/packages/doc-sync/src/index.ts");
            assert.equal(imports["@barocss/doc-sync/sync"], "/packages/doc-sync/src/sync/index.ts");
            assert.equal(imports["@barocss/doc-sync/prosemirror"], "/packages/doc-sync/src/pm/index.ts");
            const queue = [...html.matchAll(/(?:src|href)="([^"?]+)(?:\?[^"]*)?"/g)]
                .map(match => new URL(match[1], server.base + page).href);
            const visited = new Set<string>();

            while (queue.length) {
                const url = queue.shift()!;

                if (visited.has(url)) continue;
                visited.add(url);
                const moduleResponse = await fetch(url);

                assert.equal(moduleResponse.status, 200, url);
                const source = await moduleResponse.text();

                if (!url.endsWith(".css")) {
                    assert.match(moduleResponse.headers.get("content-type")!, /javascript/);
                    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)) {
                        const specifier = match[1];

                        assert.ok(specifier.startsWith(".") || specifier.startsWith("/") || imports[specifier], `import map: ${specifier}`);
                        queue.push(new URL(imports[specifier] ?? specifier, url).href);
                    }
                }
            }
            assert.ok(visited.size > 1, page);
        }
        assert.equal((await fetch(`${server.base}/HANDOFF.md`)).status, 404);
        assert.equal((await fetch(`${server.base}/packages/doc-sync/src-other/index.ts`)).status, 404);
    } finally {
        await server.stop();
        await rm(data, {recursive: true, force: true});
    }
});

test("데모 HTTP: 변경 검사·중복·SSE 동기화·GC 로그 복구를 유지한다", async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-demo-log-"));
    let server = await start(data);

    try {
        const doc = new Doc("A", DEMO_SCHEMA);
        const first = {actor: "A", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops};

        const missing = await post(server.base, "changes", {...first, seq: 2});

        assert.equal(missing.status, 409);
        assert.deepEqual(await (await post(server.base, "changes", first)).json(), {serverSeq: 1});
        assert.deepEqual(await (await post(server.base, "changes", first)).json(), {serverSeq: null});
        const invalid = await post(server.base, "changes", {actor: "A", seq: 2, ops: [{t: "node", id: {actor: "A", clock: 99}, origin: null, type: "not-a-schema-node"}]});

        assert.equal(invalid.status, 409);
        const hello = (await events(server.base, 0, 1))[0];

        assert.equal(hello.type, "hello");
        if (hello.type !== "hello") throw new Error("hello 없음");
        assert.equal(hello.serverSeq, 1);
        assert.ok(hello.snapshot);
        assert.deepEqual(Doc.fromSnapshot("B", hello.snapshot!, DEMO_SCHEMA).toJSON(), doc.toJSON());
        const second = {actor: "A", seq: 2, ops: doc.edit([{op: "delete", at: [0, 1], count: 1}]).ops};

        assert.deepEqual(await (await post(server.base, "changes", second)).json(), {serverSeq: 2});
        const resumed = await events(server.base, 1, 2);

        assert.equal(resumed[0].type, "hello");
        assert.equal(resumed[0].type === "hello" && resumed[0].snapshot, null);
        assert.deepEqual(resumed[1], {type: "change", envelope: {serverSeq: 2, change: second}});
        await post(server.base, "leave", {actor: "reader"});
        const gc = await post(server.base, "gc");

        assert.equal(gc.status, 200);
        const expected = await (await fetch(`${server.base}/api/docs/integration/state`)).json();
        const log = await readFile(join(data, "integration.jsonl"), "utf8");

        assert.equal(log.trim().split("\n").length, 3);
        assert.match(log, /"gc":2/);
        await server.stop();
        server = await start(data);
        const recovered = await (await fetch(`${server.base}/api/docs/integration/state`)).json();

        for (const field of ["model", "serverSeq", "lastGc", "tokens", "tombstones", "log"] as const) {
            assert.deepEqual(recovered[field], expected[field], field);
        }
        assert.deepEqual(await (await post(server.base, "changes", second)).json(), {serverSeq: null});
        assert.equal(await readFile(join(data, "integration.jsonl"), "utf8"), log);
    } finally {
        await server.stop();
        await rm(data, {recursive: true, force: true});
    }
});
