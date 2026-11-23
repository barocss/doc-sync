import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";

const serverFile = fileURLToPath(new URL("../server.ts", import.meta.url));
async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
}
async function scenario(port: "occupied" | "available") {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-listen-host-"));
    let foreignRequests = 0;
    const foreign = createServer((_req, res) => {
        foreignRequests++;
        res.writeHead(404, {"x-doc-sync-owned-test": "foreign-ipv4"});
        res.end();
    });
    let child: ChildProcess | undefined;
    try {
        foreign.listen(0, "127.0.0.1");
        await once(foreign, "listening");
        const address = foreign.address();
        assert.ok(address && typeof address !== "string");
        const env: NodeJS.ProcessEnv = {...process.env, DATA_DIR: root,
            PORT: port === "occupied" ? String(address.port) : "0", DOC_SYNC_HOST: "127.0.0.1"};
        delete env.NO_SCHEMA;
        delete env.DOC_PROFILE;
        child = spawn(process.execPath, [serverFile], {env, stdio: ["ignore", "pipe", "pipe"]});
        let stdout = "", stderr = "";
        child.stderr!.on("data", chunk => { stderr += String(chunk); });
        const outcome = await new Promise<{kind: "exit"; code: number | null} | {kind: "ready"; port: number}>((resolve, reject) => {
            child!.once("error", reject);
            child!.once("exit", code => resolve({kind: "exit", code}));
            child!.stdout!.on("data", chunk => {
                stdout += String(chunk);
                const match = stdout.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);
                if (match) resolve({kind: "ready", port: Number(match[1])});
            });
        });
        if (port === "occupied") {
            assert.equal(outcome.kind, "exit", "The requested IPv4 listener must not announce a port owned by another IPv4 server");
            assert.ok(outcome.kind === "exit");
            assert.notEqual(outcome.code, 0);
            assert.match(stderr, /EADDRINUSE/);
            assert.doesNotMatch(stdout, /http:\/\/localhost:/);
        } else {
            assert.equal(outcome.kind, "ready", stderr);
            assert.ok(outcome.kind === "ready");
            assert.notEqual(outcome.port, address.port);
            const response = await fetch(`http://127.0.0.1:${outcome.port}/api/docs/listen-host-proof/state`);
            assert.equal(response.status, 200);
            assert.equal(typeof (await response.json() as {epoch: unknown}).epoch, "string");
            assert.equal(foreignRequests, 0);
        }
        // The independently owned listener remains available after demo startup.
        const response = await fetch(`http://127.0.0.1:${address.port}/owned-proof`);
        assert.equal(response.status, 404);
        assert.equal(response.headers.get("x-doc-sync-owned-test"), "foreign-ipv4");
        await response.body?.cancel();
        assert.equal(foreignRequests, 1);
    } finally {
        if (child) await stop(child);
        foreign.closeAllConnections();
        await new Promise<void>(resolve => foreign.close(() => resolve()));
        await rm(root, {recursive: true, force: true});
    }
}

test("explicit IPv4 demo host rejects an occupied IPv4 port without claiming another server", {timeout: 15000}, () => scenario("occupied"));
test("explicit IPv4 demo host selects an available ephemeral IPv4 port", {timeout: 15000}, () => scenario("available"));
