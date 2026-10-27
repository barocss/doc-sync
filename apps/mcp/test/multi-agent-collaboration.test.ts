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

type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};
type View = {revision: Revision; document: {children: Array<{runs?: Array<{text: string}>}>}};
const call = (client: Client, name: string, args: Record<string, unknown> = {}) => client.callTool({name, arguments: args});
const read = async (client: Client): Promise<View> => {
    const result = await call(client, "read_document");
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return result.structuredContent as View;
};
const text = (view: View): string => (view.document.children[0].runs ?? []).map(run => run.text).join("");
async function waitFor(check: () => Promise<boolean>) {
    const limit = Date.now() + 10000;
    while (!await check()) {
        if (Date.now() > limit) throw new Error("Timed out waiting for both agent replicas");
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

test("two MCP agents use separate histories and reconcile a stale concurrent base", {timeout: 30000, skip: process.platform !== "darwin"}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-two-agents-"));
    const serverFile = fileURLToPath(new URL("../../demo/server.ts", import.meta.url));
    const mcpFile = fileURLToPath(new URL("../src/main.ts", import.meta.url));
    const server = spawn(process.execPath, [serverFile], {env: {...process.env, PORT: "0", DATA_DIR: join(root, "server"), NO_SCHEMA: ""}, stdio: ["ignore", "pipe", "pipe"]});
    let serverError = "";
    server.stderr.on("data", chunk => { serverError += String(chunk); });
    const agents: Array<{client: Client; transport: StdioClientTransport}> = [];
    try {
        const origin = await new Promise<string>((resolve, reject) => {
            let output = "";
            const timer = setTimeout(() => reject(new Error(`Server did not start: ${serverError}`)), 10000);
            server.once("error", reject);
            server.once("exit", code => reject(new Error(`Server exited ${code}: ${serverError}`)));
            server.stdout.on("data", chunk => {
                output += String(chunk);
                const match = output.match(/http:\/\/localhost:(\d+)/);
                if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
            });
        });
        const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
        for (const actor of ["agent-a", "agent-b"]) {
            const transport = new StdioClientTransport({command: process.execPath, args: [mcpFile], stderr: "pipe", env: {...env,
                DOC_SYNC_URL: origin, DOC_SYNC_DOCUMENT: "multi-agent", DOC_SYNC_ACTOR: actor,
                DOC_SYNC_JOURNAL: "on", DOC_SYNC_JOURNAL_DIR: join(root, actor)}});
            const client = new Client({name: actor, version: "1.0"});
            agents.push({client, transport});
            await client.connect(transport);
        }
        const [a, b] = agents.map(agent => agent.client);
        const [viewA, viewB] = await Promise.all([read(a), read(b)]);
        assert.equal(viewA.revision.serverSeq, viewB.revision.serverSeq);
        const replies = await Promise.all([
            call(a, "edit_document", {base: viewA.revision, edits: [{op: "insert", at: [0, 0], content: "A"}]}),
            call(b, "edit_document", {base: viewB.revision, edits: [{op: "insert", at: [0, 0], content: "B"}]}),
        ]);
        const winner = replies.findIndex(reply => !reply.isError);
        assert.ok(winner >= 0 && replies[1 - winner].isError, "one stale conditional edit must be rejected");
        assert.equal((replies[winner].structuredContent as {status: string}).status, "confirmed");
        const loser = 1 - winner, winnerText = winner === 0 ? "A" : "B", loserText = loser === 0 ? "A" : "B";
        await waitFor(async () => text(await read(agents[loser].client)) === winnerText);
        const latest = await read(agents[loser].client);
        const retry = await call(agents[loser].client, "edit_document", {base: latest.revision, edits: [{op: "insert", at: [0, 1], content: loserText}]});
        assert.equal(retry.isError, undefined, JSON.stringify(retry));
        await waitFor(async () => (await Promise.all(agents.map(async agent => text(await read(agent.client))))).every(value => value === winnerText + loserText));
        const undo = await call(agents[winner].client, "undo");
        assert.equal((undo.structuredContent as {status: string}).status, "confirmed");
        await waitFor(async () => (await Promise.all(agents.map(async agent => text(await read(agent.client))))).every(value => value === loserText));
        const redo = await call(agents[winner].client, "redo");
        assert.equal((redo.structuredContent as {status: string}).status, "confirmed");
        await waitFor(async () => (await Promise.all(agents.map(async agent => text(await read(agent.client))))).every(value => value === winnerText + loserText));
    } finally {
        for (const agent of agents) await agent.client.close().catch(() => undefined);
        if (server.exitCode === null && server.signalCode === null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
        await rm(root, {recursive: true, force: true});
    }
});
