import assert from "node:assert/strict";
import {type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {test} from "node:test";
import {startDemo as currentStartDemo} from "./fixtures/restart-recovery-harness.ts";

function deadline<T>(promise: Promise<T>, description: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 10000);
    })]).finally(() => clearTimeout(timer));
}

for (const occupiedPrefix of [false, true]) test(`real demo startup waits for complete port before selecting an origin (occupied prefix: ${occupiedPrefix})`, {timeout: 20000}, async () => {
    const startDemo: typeof currentStartDemo = process.env.DOC_SYNC_TEST_BANNER_HELPER
        ? (await import(process.env.DOC_SYNC_TEST_BANNER_HELPER)).startDemo : currentStartDemo;
    const root = await mkdtemp(join(tmpdir(), "doc-sync-split-banner-"));
    let hook = fileURLToPath(new URL("./fixtures/split-demo-banner.mjs", import.meta.url));
    if (occupiedPrefix) {
        const wrapper = join(root, "occupied-prefix.mjs");
        await writeFile(wrapper, `globalThis[Symbol.for("doc-sync.test.occupy-banner-prefix")] = true;\nawait import(${JSON.stringify(pathToFileURL(hook).href)});\n`);
        hook = wrapper;
    }
    let child: ChildProcess | undefined, stderr = "", stdout = "", resolved = false;
    let prefixSeen!: () => void;
    const prefix = new Promise<void>(resolve => { prefixSeen = resolve; });
    type Gate = {actualPort: number; prefixPort: number; controlPort: number; decoyAvailable: boolean; decoyCollision: boolean; ownedCollision: boolean};
    let gateSeen!: (value: Gate) => void, gateFailed!: (error: Error) => void;
    const gate = new Promise<Gate>((resolve, reject) => { gateSeen = resolve; gateFailed = reject; });
    const starting = startDemo(join(root, "data"), hook, process => {
        child = process;
        process.once("exit", (code, signal) => gateFailed(new Error(`Banner child exited: ${JSON.stringify({code, signal, stderr})}`)));
        process.stdout!.on("data", chunk => { stdout += String(chunk); if (stdout.includes("http://localhost:")) prefixSeen(); });
        process.stderr!.on("data", chunk => {
            stderr += String(chunk);
            const match = /^BANNER_GATE (.+)\n/m.exec(stderr);
            if (match) gateSeen(JSON.parse(match[1]));
        });
    }).then(result => { resolved = true; return result; });
    void starting.catch(() => undefined);
    try {
        const metadata = await deadline(gate, "split banner gate");
        if (occupiedPrefix) {
            assert.equal(metadata.decoyCollision, true, "occupied prefix must exercise EADDRINUSE");
            assert.equal(metadata.decoyAvailable, false);
        }
        await deadline(prefix, "actual stdout prefix chunk");
        // Complete the data event and its promise continuations before checking admission.
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(resolved, false, `Incomplete port must not resolve startup: ${JSON.stringify({metadata, stderr})}`);
        const control = `http://127.0.0.1:${metadata.controlPort}`;
        assert.equal((await (await fetch(control)).json()).decoyRequests, 0);
        await fetch(`${control}/release`, {method: "POST"});
        const demo = await deadline(starting, "complete banner startup");
        assert.equal(demo.origin, `http://127.0.0.1:${metadata.actualPort}`);
        assert.notEqual(metadata.actualPort, metadata.prefixPort);
        const response = await fetch(`${demo.origin}/api/docs/split-banner-proof/state`);
        const body = await response.text();
        const diagnostic = JSON.stringify({url: response.url, status: response.status, contentType: response.headers.get("content-type"), bodyPrefix: body.slice(0, 256)});
        assert.equal(response.status, 200, diagnostic);
        assert.match(response.headers.get("content-type") ?? "", /application\/json/, diagnostic);
        assert.equal(typeof JSON.parse(body).epoch, "string", diagnostic);
        assert.equal((await (await fetch(control)).json()).decoyRequests, 0);
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited = once(child, "exit"); child.kill("SIGTERM"); await deadline(exited, "owned demo exit");
        }
        await starting.catch(() => undefined);
        await rm(root, {recursive: true, force: true});
    }
});
