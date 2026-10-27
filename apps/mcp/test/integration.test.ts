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
type Model = {children: Array<{runs?: Array<{text: string; marks: Record<string, unknown>}>}>};
type Payload = {status?: string; revision: Revision; document: Model; pending?: number};

async function waitFor(check: () => boolean, description: string) {
    const deadline = Date.now() + 5000;
    while (!check()) {
        if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

async function startDemo(data: string) {
    const file = fileURLToPath(new URL("../../demo/server.ts", import.meta.url));
    const child = spawn(process.execPath, [file], {env: {...process.env, PORT: "0", DATA_DIR: data, NO_SCHEMA: ""}, stdio: ["ignore", "pipe", "pipe"]});
    let error = "";
    child.stderr.on("data", chunk => { error += String(chunk); });
    const base = await new Promise<string>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error(`Demo failed to start: ${output} ${error}`)), 10000);
        child.once("error", failure => { clearTimeout(timer); reject(failure); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`Demo exited: ${code} ${error}`)); });
        child.stdout.on("data", chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/localhost:(\d+)/);
            if (match) { clearTimeout(timer); resolve(match[0]); }
        });
    });
    return {base, child};
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => client.callTool({name, arguments: args});
const payload = (value: Awaited<ReturnType<typeof call>>) => {
    assert.equal(value.isError, undefined, JSON.stringify(value));
    return value.structuredContent as Payload;
};
const text = (model: Model) => (model.children[0].runs ?? []).map(run => run.text).join("");

test("SDK stdio client: schema, validated edits, concurrent user changes and actor undo/redo", {timeout: 30000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-mcp-"));
    const {base, child} = await startDemo(data).catch(async error => { await rm(data, {recursive: true, force: true}); throw error; });
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const mcp = new Client({name: "doc-sync-test", version: "1.0"});
    const journalEnv: Record<string, string> = process.platform === "darwin" ? {DOC_SYNC_JOURNAL: "on", DOC_SYNC_JOURNAL_DIR: join(data, "journal")} : {DOC_SYNC_JOURNAL: "off"};
    const stdio = new StdioClientTransport({command: process.execPath, args: [fileURLToPath(new URL("../src/main.ts", import.meta.url))], env: {...env, DOC_SYNC_URL: base, DOC_SYNC_DOCUMENT: "integration", DOC_SYNC_ACTOR: "ai-test", ...journalEnv}, stderr: "pipe"});
    const humanTransport = new NodeHttpTransport("integration", "human", base);
    const human = new SyncClient("human", humanTransport, {schema: DEMO_SCHEMA});
    try {
        await mcp.connect(stdio);
        assert.deepEqual((await mcp.listTools()).tools.map(tool => tool.name).sort(), ["discard_history", "edit_document", "get_schema", "get_server_schema", "read_document", "recovery_status", "redo", "retry_edit", "transition_schema", "undo", "upgrade_schema"]);
        const schema = await call(mcp, "get_schema");
        assert.equal((schema.structuredContent as {verifiedAgainstServer: boolean}).verifiedAgainstServer, true);
        let view = payload(await call(mcp, "read_document"));
        assert.equal(payload(await call(mcp, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "abc"}]})).status, "confirmed");
        view = payload(await call(mcp, "read_document"));
        assert.equal(text(view.document), "abc");
        const stale = await call(mcp, "edit_document", {base: {...view.revision, serverSeq: 0}, edits: [{op: "insert", at: [0, 0], content: "x"}]});
        assert.equal(stale.isError, true);
        const unknownGuard = await call(mcp, "edit_document", {base: view.revision, edits: [{op: "delete", at: [0, 0], count: 1, expectedText: "x"}]});
        assert.equal(unknownGuard.isError, true);
        const unknownBase = await call(mcp, "edit_document", {base: {...view.revision, expectedText: "x"}, edits: [{op: "delete", at: [0, 0], count: 1}]});
        assert.equal(unknownBase.isError, true);
        const unknownTop = await call(mcp, "edit_document", {base: view.revision, edits: [{op: "delete", at: [0, 0], count: 1}], expectedText: "x"});
        assert.equal(unknownTop.isError, true);
        const invalid = await call(mcp, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "bad"}, {op: "move", from: [999], at: [0]}]});
        assert.equal(invalid.isError, true);
        assert.equal(text(payload(await call(mcp, "read_document")).document), "abc");

        human.connect();
        await waitFor(() => human.epoch !== undefined && text(human.doc.toJSON() as Model) === "abc", "human snapshot");
        // Both actors edit the same c from the same starting view. Human is offline,
        // so the AI formats c while the human deletion has not reached the server.
        human.disconnect();
        human.commit(human.doc.edit([{op: "delete", at: [0, 2], count: 1}]).ops);
        assert.equal(payload(await call(mcp, "edit_document", {base: view.revision, edits: [{op: "update", at: [0, 2], length: 1, attrs: {bold: true}}]})).status, "confirmed");
        human.connect();
        await waitFor(() => human.pending.length === 0 && text(human.doc.toJSON() as Model) === "ab", "concurrent deletion");
        await waitFor(() => human.serverSeq >= 3, "human receives format");
        // Wait until the AI replica has observed the user's deletion.
        let after = payload(await call(mcp, "read_document"));
        const deleteDeadline = Date.now() + 5000;
        while (text(after.document) !== "ab" && Date.now() < deleteDeadline) {
            await new Promise(resolve => setTimeout(resolve, 20));
            after = payload(await call(mcp, "read_document"));
        }
        assert.equal(text(after.document), "ab");
        human.undo();
        await waitFor(() => human.pending.length === 0 && text(human.doc.toJSON() as Model) === "abc", "human undo");
        // Ensure AI has received the human undo before testing its own undo.
        let restored = payload(await call(mcp, "read_document"));
        const deadline = Date.now() + 5000;
        while (text(restored.document) !== "abc" && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 20));
            restored = payload(await call(mcp, "read_document"));
        }
        assert.equal(text(restored.document), "abc");
        assert.equal(restored.document.children[0].runs?.at(-1)?.marks.bold, true);
        assert.equal(payload(await call(mcp, "undo")).status, "confirmed");
        const unbold = payload(await call(mcp, "read_document"));
        assert.equal(text(unbold.document), "abc");
        assert.equal(unbold.document.children[0].runs?.at(-1)?.marks.bold, undefined);
        assert.equal(payload(await call(mcp, "redo")).status, "confirmed");
        const rebold = payload(await call(mcp, "read_document"));
        assert.equal(rebold.document.children[0].runs?.at(-1)?.marks.bold, true);
        await waitFor(() => human.pending.length === 0 && human.doc.toJSON().children?.[0].runs?.at(-1) !== undefined && JSON.stringify(human.doc.toJSON()) === JSON.stringify(rebold.document), "replica convergence");
        const serverSchema = (await call(mcp, "get_server_schema")).structuredContent as {schemaVersion: string};
        const next = {...DEMO_SCHEMA, marks: [...DEMO_SCHEMA.marks, "highlight"]};
        const transitioned = await call(mcp, "transition_schema", {base: {...rebold.revision, schemaVersion: serverSchema.schemaVersion}, schema: next});
        assert.equal(transitioned.isError, undefined, JSON.stringify(transitioned));
        assert.equal((transitioned.structuredContent as {status: string}).status, "connected");
        const staleAfterSchema = await call(mcp, "edit_document", {base: rebold.revision, edits: [{op: "insert", at: [0, 0], content: "stale"}]});
        assert.equal(staleAfterSchema.isError, true);
        assert.equal(text(payload(await call(mcp, "read_document")).document), "abc");
        assert.equal(payload(await call(mcp, "undo")).status, "confirmed");
        const afterTransition = payload(await call(mcp, "read_document"));
        assert.equal(text(afterTransition.document), "abc");
        assert.equal(afterTransition.document.children[0].runs?.at(-1)?.marks.bold, undefined);
        human.upgradeSchema(next);
        human.connect();
        await waitFor(() => human.pending.length === 0 && JSON.stringify(human.doc.toJSON()) === JSON.stringify(afterTransition.document), "convergence after schema transition");
    } finally {
        human.disconnect();
        await humanTransport.leave().catch(() => undefined);
        await mcp.close();
        if (child.exitCode === null && child.signalCode === null) { const exit = once(child, "exit"); child.kill(); await exit; }
        await rm(data, {recursive: true, force: true});
    }
});
