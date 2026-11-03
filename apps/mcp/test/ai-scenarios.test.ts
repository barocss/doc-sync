import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};
type Model = {children: Array<{runs?: Array<{text: string; marks?: Record<string, unknown>}>}>};
type View = {document: Model; revision: Revision; pending: number; conditionalPending: boolean};
type Agent = {client: Client; close: () => Promise<void>; stderr: () => string};
const call = (client: Client, name: string, args: Record<string, unknown> = {}) => client.callTool({name, arguments: args});
const value = <T>(result: Awaited<ReturnType<typeof call>>): T => {
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return result.structuredContent as T;
};
const read = async (agent: Agent) => value<View>(await call(agent.client, "read_document"));
const text = (model: Model) => (model.children[0].runs ?? []).map(run => run.text).join("");
const status = async (agent: Agent, tool: string, args: Record<string, unknown> = {}) => value<{status: string}>(await call(agent.client, tool, args)).status;
async function until(check: () => Promise<boolean> | boolean, label: string) {
    const end = Date.now() + 10000;
    while (!await check()) {
        if (Date.now() > end) throw new Error(`Timed out: ${label}`);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}
const insert = (at: number, content: string) => ({op: "insert" as const, at: [0, at], content});

// Real stdio MCP processes and a separate sync client, sharing one local demo server.
test("AI and user collaboration scenarios", {timeout: 120000}, async t => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-ai-scenarios-"));
    const demo = fileURLToPath(new URL("../../demo/server.ts", import.meta.url));
    const mcp = fileURLToPath(new URL("../src/main.ts", import.meta.url));
    const server = spawn(process.execPath, [demo], {env: {...process.env, PORT: "0", DATA_DIR: join(root, "server"), NO_SCHEMA: ""}, stdio: ["ignore", "pipe", "pipe"]});
    let stderr = "";
    server.stderr.on("data", chunk => { stderr += String(chunk); });
    const agents: Agent[] = [], humans: Array<{client: SyncClient; transport: NodeHttpTransport}> = [];
    const documents = new Map<SyncClient, string>();
    try {
        const origin = await new Promise<string>((resolve, reject) => {
            let output = "";
            const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 10000);
            server.once("error", reject);
            server.once("exit", code => reject(new Error(`Server exited ${code}: ${stderr}`)));
            server.stdout.on("data", chunk => {
                output += String(chunk);
                const match = output.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);
                if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
            });
        });
        const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
        async function agent(doc: string, actor: string, durable = false): Promise<Agent> {
            const client = new Client({name: actor, version: "1.0"});
            const transport = new StdioClientTransport({command: process.execPath, args: [mcp], stderr: "pipe", env: {...env,
                DOC_SYNC_URL: origin, DOC_SYNC_DOCUMENT: doc, DOC_SYNC_ACTOR: actor,
                DOC_SYNC_JOURNAL: durable ? "on" : "off", DOC_SYNC_JOURNAL_DIR: join(root, doc, actor)}});
            let errors = "";
            transport.stderr?.on("data", chunk => { errors = (errors + String(chunk)).slice(-65536); });
            try { await client.connect(transport); }
            catch (error) {
                await client.close().catch(() => undefined);
                await transport.close().catch(() => undefined);
                throw new Error(`Agent startup failed (${doc}/${actor}): ${error instanceof Error ? error.message : String(error)}; stderr: ${errors}`, {cause: error});
            }
            const participant = {client, close: () => client.close(), stderr: () => errors}; agents.push(participant); return participant;
        }
        async function human(doc: string) {
            const transport = new NodeHttpTransport(doc, "human", origin);
            const client = new SyncClient("human", transport, {schema: DEMO_SCHEMA});
            humans.push({client, transport}); documents.set(client, doc); client.connect();
            await until(() => client.online && client.epoch !== undefined, "human connected");
            client.commit(client.doc.edit([insert(0, "abc")]).ops);
            await until(() => client.pending.length === 0 && text(client.doc.toJSON() as Model) === "abc", "initial human text acknowledged");
            return client;
        }
        async function convergeModel(h: SyncClient, participants: Agent[], expected: (model: Model) => boolean, label: string) {
            await until(async () => {
                const views = await Promise.all(participants.map(read));
                const response = await fetch(`${origin}/api/docs/${documents.get(h)}/state`);
                if (!response.ok) return false;
                const serverState = await response.json() as {model: Model};
                const local = h.doc.toJSON() as Model;
                return h.online && !h.pending.length && expected(local) && JSON.stringify(serverState.model) === JSON.stringify(local) && views.every(v => !v.pending && !v.conditionalPending && JSON.stringify(v.document) === JSON.stringify(local));
            }, label);
        }
        async function converge(h: SyncClient, participants: Agent[], expected: string) {
            await convergeModel(h, participants, model => text(model) === expected, `converge to ${expected}`);
        }
        await t.test("three agents race on one base; losers reread and each undo preserves others", async () => {
            const h = await human("three-agents");
            const a = await Promise.all([agent("three-agents", "agent-a"), agent("three-agents", "agent-b"), agent("three-agents", "agent-c")]);
            const bases = await Promise.all(a.map(read));
            assert.ok(bases.every(v => v.revision.serverSeq === bases[0].revision.serverSeq && text(v.document) === "abc"));
            const labels = ["A", "B", "C"];
            const replies = await Promise.all(a.map((p, i) => call(p.client, "edit_document", {base: bases[i].revision, edits: [insert(3, labels[i])]})));
            const winners = replies.flatMap((r, i) => r.isError ? [] : [i]);
            assert.equal(winners.length, 1, JSON.stringify(replies));
            assert.equal(value<{status: string}>(replies[winners[0]]).status, "confirmed");
            let expected = "abc" + labels[winners[0]];
            await converge(h, a, expected);
            for (const i of [0, 1, 2].filter(i => i !== winners[0])) {
                const fresh = await read(a[i]);
                assert.equal(await status(a[i], "edit_document", {base: fresh.revision, edits: [insert(expected.length, labels[i])]}), "confirmed");
                expected += labels[i]; await converge(h, a, expected);
            }
            const withoutWinner = expected.replace(labels[winners[0]], "");
            assert.equal(await status(a[winners[0]], "undo"), "confirmed"); await converge(h, a, withoutWinner);
            assert.equal(await status(a[winners[0]], "redo"), "confirmed"); await converge(h, a, expected);
        });
        await t.test("offline user and AI insert at one position; separate undo and redo retain both intents", async () => {
            const h = await human("same-position"); const a = await agent("same-position", "agent-insert");
            const before = await read(a); h.disconnect(); h.commit(h.doc.edit([insert(1, "H")]).ops);
            assert.equal(h.pending.length, 1);
            assert.equal(await status(a, "edit_document", {base: before.revision, edits: [insert(1, "A")]}), "confirmed");
            h.connect();
            await until(async () => h.online && !h.pending.length && text((await read(a)).document) === text(h.doc.toJSON() as Model), "same-position merge");
            const merged = text(h.doc.toJSON() as Model);
            assert.ok(merged === "aHAbc" || merged === "aAHbc", merged);
            await converge(h, [a], merged);
            assert.equal(await status(a, "undo"), "confirmed"); await converge(h, [a], "aHbc");
            h.undo(); await converge(h, [a], "abc");
            h.redo(); await converge(h, [a], "aHbc");
            assert.equal(await status(a, "redo"), "confirmed"); await converge(h, [a], merged);
        });
        await t.test("offline deletion and AI bold undo and redo independently", async () => {
            const h = await human("delete-bold"); const a = await agent("delete-bold", "agent-bold"); const base = await read(a);
            h.disconnect(); h.commit(h.doc.edit([{op: "delete", at: [0, 2], count: 1}]).ops);
            assert.equal(await status(a, "edit_document", {base: base.revision, edits: [{op: "update", at: [0, 2], length: 1, attrs: {bold: true}}]}), "confirmed");
            h.connect(); await converge(h, [a], "ab"); h.undo(); await converge(h, [a], "abc");
            assert.equal((await read(a)).document.children[0].runs?.at(-1)?.marks?.bold, true);
            assert.equal(await status(a, "undo"), "confirmed"); await converge(h, [a], "abc");
            assert.equal((await read(a)).document.children[0].runs?.at(-1)?.marks?.bold, undefined);
            assert.equal(await status(a, "redo"), "confirmed"); await converge(h, [a], "abc");
            assert.equal((await read(a)).document.children[0].runs?.at(-1)?.marks?.bold, true);
            h.redo(); await converge(h, [a], "ab"); h.undo(); await converge(h, [a], "abc");
            assert.equal((await read(a)).document.children[0].runs?.at(-1)?.marks?.bold, true);
        });
        await t.test("offline user split and AI text insertion preserve structure and participant history", async () => {
            const h = await human("split-insert"); const a = await agent("split-insert", "agent-structure"); const base = await read(a);
            h.disconnect(); h.commit(h.doc.edit([{op: "split", at: [0, 1]}]).ops);
            assert.equal(await status(a, "edit_document", {base: base.revision, edits: [insert(3, "A")]}), "confirmed");
            h.connect();
            const blocks = (model: Model) => model.children.map(block => (block.runs ?? []).map(run => run.text).join(""));
            const check = async (expected: string[]) => convergeModel(h, [a], model => JSON.stringify(blocks(model)) === JSON.stringify(expected), `blocks ${expected}`);
            await check(["a", "bcA"]);
            assert.equal(await status(a, "undo"), "confirmed"); await check(["a", "bc"]);
            assert.equal(await status(a, "redo"), "confirmed"); await check(["a", "bcA"]);
            h.undo(); await check(["abcA"]); h.redo(); await check(["a", "bcA"]);
        });
        await t.test("AI undo and redo do not restore text deleted by the user", async () => {
            const h = await human("foreign-deletion"); const a = await agent("foreign-deletion", "agent-deleted");
            assert.equal(await status(a, "edit_document", {base: (await read(a)).revision, edits: [insert(1, "X")]}), "confirmed"); await converge(h, [a], "aXbc");
            h.commit(h.doc.edit([{op: "delete", at: [0, 1], count: 1}]).ops); await converge(h, [a], "abc");
            assert.equal(await status(a, "undo"), "confirmed"); await converge(h, [a], "abc");
            assert.equal(await status(a, "redo"), "confirmed"); await converge(h, [a], "abc");
            h.undo(); await converge(h, [a], "aXbc");
        });
        await t.test("user changes invalidate saved AI base; invalid multi-edit is atomic", async () => {
            const h = await human("stale-atomic"); const a = await agent("stale-atomic", "agent-stale"); const old = await read(a);
            h.commit(h.doc.edit([insert(3, "H")]).ops); await converge(h, [a], "abcH");
            const stale = await call(a.client, "edit_document", {base: old.revision, edits: [insert(0, "A")]}); assert.equal(stale.isError, true);
            await converge(h, [a], "abcH"); const current = await read(a);
            const invalid = await call(a.client, "edit_document", {base: current.revision, edits: [insert(0, "A"), {op: "delete", at: [99, 0], count: 1}]}); assert.equal(invalid.isError, true);
            await converge(h, [a], "abcH");
            assert.equal(await status(a, "edit_document", {base: (await read(a)).revision, edits: [insert(0, "A")]}), "confirmed"); await converge(h, [a], "AabcH");
        });
        await t.test("agent restart restores its history without undoing a later user edit", {skip: (process.platform !== "darwin" && process.platform !== "linux")}, async () => {
            let phase = "connect human", a: Agent | undefined;
            try {
                const h = await human("restart-history");
                phase = "start durable agent"; a = await agent("restart-history", "agent-restart", true);
                phase = "agent edit";
                assert.equal(await status(a, "edit_document", {base: (await read(a)).revision, edits: [insert(0, "A")]}), "confirmed"); await converge(h, [a], "Aabc");
                phase = "close durable agent"; await a.close(); agents.splice(agents.indexOf(a), 1);
                phase = "later user edit";
                h.commit(h.doc.edit([insert(4, "H")]).ops); await until(() => !h.pending.length && text(h.doc.toJSON() as Model) === "AabcH", "later user edit");
                phase = "restart durable agent"; a = await agent("restart-history", "agent-restart", true);
                phase = "converge after restart"; await converge(h, [a], "AabcH");
                phase = "agent undo"; assert.equal(await status(a, "undo"), "confirmed"); await converge(h, [a], "abcH");
                phase = "agent redo"; assert.equal(await status(a, "redo"), "confirmed"); await converge(h, [a], "AabcH");
            } catch (error) {
                throw new Error(`Restart scenario failed during ${phase}: ${error instanceof Error ? error.message : String(error)}; agent stderr: ${a?.stderr() ?? ""}; server stderr: ${stderr}`, {cause: error});
            }
        });
    } finally {
        for (const a of agents) await a.close().catch(() => undefined);
        for (const h of humans) { h.client.disconnect(); await h.transport.leave().catch(() => undefined); }
        if (server.exitCode === null && server.signalCode === null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
        await rm(root, {recursive: true, force: true});
    }
});
