import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath, pathToFileURL} from "node:url";
import type {Mission} from "../src/runner.ts";

const runner = new URL("../src/runner.ts", import.meta.url).href;
const mcpMain = fileURLToPath(new URL("../../mcp/src/main.ts", import.meta.url));
// Resolve from the project, not from the temporary preload directory.
const nodeTransport = pathToFileURL(createRequire(import.meta.url).resolve("@barocss/doc-sync/node")).href;
const cases = ["schema discovery failure", "split known marker", "unknown and oversized stderr"] as const;

for (const scenario of cases) test(`mission startup provenance: ${scenario}`, {timeout: 35_000}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-bot-startup-"));
    const stateDir = join(root, "state"), schema = join(root, "schema.mjs"), driver = join(root, "driver.mjs");
    const pidFile = join(root, "mcp.pid"), resultFile = join(root, "result.json");
    const preload = join(root, "preload.mjs"), ambientMarker = join(root, "ambient-schema-executed");
    const canary = `PRIVATE_CANARY_${randomUUID()}`;
    // A different mission's pending state and journal must remain byte-for-byte intact.
    const priorPath = join(stateDir, "missions", `${randomUUID()}.json`);
    const journalPath = join(stateDir, "journals", "existing", "document.json");
    const prior = '{ "status": "needs_attention", "pending": {"stepId":"keep-pending"}, "history": [{"kind":"confirmed"}] }\n';
    const journal = '{ "pending": "keep-existing-intent", "generation": 7 }\n';
    await mkdir(join(stateDir, "missions"), {recursive: true});
    await mkdir(join(stateDir, "journals", "existing"), {recursive: true});
    await writeFile(priorPath, prior);
    await writeFile(journalPath, journal);
    const fault = scenario === "schema discovery failure"
        ? `process.stderr.write(${JSON.stringify(`private raw stderr ${canary}\n`)}); throw new Error(${JSON.stringify(canary)});`
        : scenario === "split known marker"
        ? `process.stderr.write("MCP startup failure [schema-");
           await new Promise(resolve => setTimeout(resolve, 75));
           await new Promise(resolve => process.stderr.write(${JSON.stringify(`discovery]: ${canary}\n`)}, resolve)); process.exit(1);`
        : `await new Promise(resolve => process.stderr.write("x".repeat(256 * 1024) + ${JSON.stringify(`MCP startup failure [schema-discovery]: ${canary}\nMCP startup failure [unknown-private-phase]: ${canary}\nraw ${canary}\n`)}, resolve)); process.exit(1);`;
    // The bot must ignore executable ambient schemas and retain remote discovery.
    await writeFile(schema, `import {writeFileSync} from "node:fs";
        writeFileSync(${JSON.stringify(ambientMarker)}, "must never execute");
        throw new Error("Ambient schema must not run");
    `);
    // NODE_OPTIONS is inherited by the driver and its SDK child. Inject only into
    // the actual project MCP entry point, using the same resolved module as main.
    await writeFile(preload, `import {writeFileSync} from "node:fs";
        import {NodeHttpTransport} from ${JSON.stringify(nodeTransport)};
        if (process.argv[1] === ${JSON.stringify(mcpMain)}) {
            NodeHttpTransport.prototype.getSchema = async function () {
                writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
                ${fault}
            };
        }
    `);
    await writeFile(driver, `import {writeFile} from "node:fs/promises";
        import {runMission} from ${JSON.stringify(runner)};
        let calls = 0;
        const mission = await runMission(${JSON.stringify({url: "http://127.0.0.1:1", document: "startup-test", actor: "startup-bot", mission: "Inspect only", stateDir, maxSteps: 1})},
            async () => { calls++; throw new Error("Planner must not run"); });
        await writeFile(${JSON.stringify(resultFile)}, JSON.stringify({mission, calls}));
    `);
    // Each driver has its own process group. The watchdog cannot kill a foreign child.
    const child = spawn(process.execPath, [driver], {
        detached: true,
        env: {...process.env, DOC_SYNC_SCHEMA: schema, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`},
        stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostics = "", expired = false;
    child.stderr!.on("data", (chunk: Buffer) => {
        if (diagnostics.length < 4096) diagnostics += chunk.subarray(0, 4096 - diagnostics.length).toString();
    });
    const killOwnedGroup = () => {
        if (!child.pid) return;
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    };
    const watchdog = setTimeout(() => { expired = true; killOwnedGroup(); }, 25_000);
    try {
        const code = await new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", resolve);
        });
        assert.equal(expired, false, "25-second owned-child watchdog expired");
        assert.equal(code, 0, diagnostics);
        const {mission, calls} = JSON.parse(await readFile(resultFile, "utf8")) as {mission: Mission; calls: number};
        assert.equal(calls, 0);
        assert.equal(mission.status, "needs_attention");
        assert.equal(mission.pending, null);
        assert.deepEqual(mission.history, []);
        assert.deepEqual(mission.steps, []);
        assert.match(mission.error!, /Connection closed/i);
        if (scenario === "unknown and oversized stderr") {
            assert.equal(mission.error, "MCP error -32000: Connection closed");
            assert.doesNotMatch(mission.error!, /MCP startup phase|schema-discovery|unknown-private-phase/);
        } else assert.match(mission.error!, /\(MCP startup phase: schema-discovery\)$/);
        const persisted = await readFile(join(stateDir, "missions", `${mission.id}.json`), "utf8");
        assert.deepEqual(JSON.parse(persisted), mission);
        for (const text of [persisted, JSON.stringify(mission), diagnostics]) {
            assert.ok(!text.includes(canary), "Child stderr must not enter mission records or driver logs");
            assert.ok(!text.includes("private raw stderr"));
        }
        await assert.rejects(readFile(ambientMarker), {code: "ENOENT"}, "Ambient schema must never execute");
        assert.equal(await readFile(priorPath, "utf8"), prior);
        assert.equal(await readFile(journalPath, "utf8"), journal);
        const pid = Number(await readFile(pidFile, "utf8"));
        assert.ok(Number.isSafeInteger(pid) && pid > 0);
        assert.throws(() => process.kill(pid, 0), {code: "ESRCH"}, "SDK child must exit before mission returns");
    } finally {
        clearTimeout(watchdog);
        killOwnedGroup();
        await rm(root, {recursive: true, force: true});
    }
});
