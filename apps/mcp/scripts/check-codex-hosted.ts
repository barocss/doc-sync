import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
import {once} from "node:events";
import {mkdir, mkdtemp, readFile, writeFile, readdir, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {SyncClient} from "@barocss/doc-sync/sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {createHostedService} from "../src/hosted.ts";

// Opt-in real-model proof. It uses only a fresh local fixture and preserves evidence.
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const bounded = process.env.DOC_SYNC_CODEX_SLICE === "1";
const readTool = bounded ? "read_document_slice" : "read_document";
const evidence = resolve(process.argv[2] ?? join(repo, "output", `codex-hosted-${Date.now()}`));
await mkdir(evidence, {recursive: true, mode: 0o700});
const cwd = await mkdtemp(join(tmpdir(), "doc-sync-codex-hosted-"));
const token = randomBytes(32).toString("base64url");
const marker = `CODEX_HTTP_${randomBytes(6).toString("hex")}`;
const humanMarker = "_USER_PRESERVED";
const actor = "codex-http-proof", document = "isolated-proof";
const requests: Array<Record<string, unknown>> = [];
const cases: Record<string, unknown> = {};
const report: Record<string, unknown> = {status: "RUNNING", model: "gpt-6.1-sol", reasoning: "medium", variant: bounded ? "bounded-read" : "full-read", evidence, marker, actor, document, cases};
const sources: Record<string, string> = {};
const digestFile = async (path: string) => createHash("sha256").update(await readFile(join(repo, path))).digest("hex");
const tree = async (path: string): Promise<string[]> => {
    const entries = await readdir(join(repo, path), {withFileTypes: true});
    const parts = await Promise.all(entries.map(entry => entry.isDirectory() ? tree(`${path}/${entry.name}`) : entry.isFile() ? [`${path}/${entry.name}`] : []));
    return parts.flat().sort();
};
const sanitize = (s: string) => s.replaceAll(token, "[REDACTED]");
const save = async () => writeFile(join(evidence, "receipt.json"), sanitize(JSON.stringify({...report, requests}, null, 2)), {mode: 0o600});
const wait = async (test: () => boolean, label: string) => {const end = Date.now() + 10000; while (!test()) {if (Date.now() > end) throw Error(label); await new Promise(r => setTimeout(r, 20));}};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const listen = async (service: ReturnType<typeof createHostedService>) => {
    service.server.prependListener("request", (req, res) => {
        const entry: Record<string, unknown> = {method: req.method, path: req.url, authenticated: req.headers.authorization === `Bearer ${token}`, sessionId: req.headers["mcp-session-id"] ?? null};
        requests.push(entry);
        let body = ""; req.on("data", b => body += String(b));
        req.on("end", () => {if (body) {try {const rpc = JSON.parse(body); entry.rpcMethod = rpc.method; entry.tool = rpc.params?.name; entry.arguments = rpc.params?.arguments;} catch {entry.invalidJson = true;}}});
        res.on("finish", () => {entry.status = res.statusCode; entry.responseSessionId = res.getHeader("mcp-session-id") ?? null;});
    });
    service.server.listen(0, "127.0.0.1"); await once(service.server, "listening");
    const address = service.server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`; service.config.hosts.push(new URL(base).host);
    return new URL(`${base}/mcp/proof/document/codex`);
};
let service: ReturnType<typeof createHostedService> | undefined;
let sdk: Client | undefined;
let user: SyncClient | undefined;
let userTransport: NodeHttpTransport | undefined;
let modelChild: ReturnType<typeof spawn> | undefined;
const upstream = spawn(process.execPath, [join(repo, "apps/demo/server.ts")], {env: {...process.env, PORT: "0", DATA_DIR: join(evidence, "upstream"), NO_SCHEMA: ""}, stdio: ["ignore", "pipe", "pipe"]});
let upstreamError = ""; upstream.stderr!.on("data", b => upstreamError += String(b));
try {
    report.cli = spawnSync("codex", ["--version"], {encoding: "utf8"}).stdout.trim();
    report.node = {version: process.version, executable: process.execPath};
    report.dependencies = {sdk: JSON.parse(await readFile(join(repo, "node_modules/@modelcontextprotocol/sdk/package.json"), "utf8")).version,
        core: import.meta.resolve("@barocss/doc-sync"), sync: import.meta.resolve("@barocss/doc-sync/sync"), sdkClient: import.meta.resolve("@modelcontextprotocol/sdk/client/index.js"), coreRoot: await realpath(join(repo, "packages/doc-sync"))};
    const sourcePaths = [...await tree("packages/doc-sync/src"), ...await tree("packages/doc-sync/dist"), ...await tree("apps/mcp/src"), ...await tree("packages/doc-sync/dist"),
        "apps/mcp/scripts/check-codex-hosted.ts", "apps/demo/server.ts", "fixtures/demo-schema.ts", "fixtures/product-schemas.ts", "fixtures/product-documents.ts"];
    for (const path of sourcePaths.sort()) sources[path] = await digestFile(path);
    report.sourceHashes = sources;
    const origin = await new Promise<string>((resolve, reject) => {
        let out = ""; const timer = setTimeout(() => reject(Error(`Demo startup failed: ${upstreamError}`)), 10000);
        upstream.once("error", reject); upstream.stdout!.on("data", b => {out += String(b); const match = out.match(/http:\/\/localhost:(\d+)/); if (match) {clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`);}});
    });
    const config = {dataDir: join(evidence, "journals"), hosts: ["127.0.0.1:0"], routes: [{tenant: "proof", document: "document", slot: "codex", actor, upstreamDocument: document, upstream: origin}], grants: [{id: "proof", principal: "isolated-test", token, routes: ["/mcp/proof/document/codex"], permissions: ["read", "write", "schema"]}]};
    const authority = async () => {const response = await fetch(`${origin}/api/docs/${document}/state`); assert.equal(response.status, 200); return response.json() as Promise<{model: unknown; serverSeq: number; peers: unknown}>;};
    service = createHostedService(config); let endpoint = await listen(service);
    cases.unauthenticated = (await fetch(endpoint, {method: "POST", body: "{}"})).status; assert.equal(cases.unauthenticated, 401);
    const tools = ["get_schema", readTool, "edit_document", "retry_edit", "recovery_status"];
    const serverConfig = `mcp_servers={doc_sync={url=${JSON.stringify(endpoint.href)},bearer_token_env_var="DOC_SYNC_PROOF_TOKEN",enabled_tools=${JSON.stringify(tools)},default_tools_approval_mode="approve",startup_timeout_sec=20,tool_timeout_sec=30}}`;
    await writeFile(join(evidence, "client-config.txt"), serverConfig, {mode: 0o600});
    const prompt = bounded
        ? `Use only doc_sync MCP tools. Do not run shell commands or access files, network destinations, other MCP servers, or real documents. This is an isolated empty test document. First call get_schema. Then call read_document_slice with {"path":[],"start":0,"limit":1,"maxNodes":16,"maxTextUnits":1024,"maxBytes":16384}. This is the bounded root page. Insert exactly ${marker} at text path [0,0] with edit_document using the exact revision returned by read_document_slice. If stale, read the same bounded page again before editing. If unconfirmed, call retry_edit or recovery_status; never replace an unresolved edit. After confirmed edit, call read_document_slice with the same bounded root page arguments and check the exact marker is present once. Finish with a short factual result. Do not perform any other edits.`
        : `Use only doc_sync MCP tools. Do not run shell commands or access files, network destinations, other MCP servers, or real documents. This is an isolated empty test document. First call get_schema. Then call read_document. Insert exactly ${marker} at text path [0,0] with edit_document using the exact revision from read_document. If stale, read again before editing. If unconfirmed, call retry_edit or recovery_status; never replace an unresolved edit. After confirmed edit, call read_document and check the exact marker is present once. Finish with a short factual result. Do not perform any other edits.`;
    await writeFile(join(evidence, "prompt.txt"), prompt, {mode: 0o600});
    const args = ["-a", "never", "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--sandbox", "read-only", "--json", "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="medium"', "-c", serverConfig, "-"];
    report.clientArgs = args.slice(0, -1); await save();
    let stdout = "", stderr = "";
    modelChild = spawn("codex", args, {cwd, env: {...process.env, DOC_SYNC_PROOF_TOKEN: token}, stdio: ["pipe", "pipe", "pipe"]});
    modelChild.stdout!.on("data", b => {stdout += String(b);}); modelChild.stderr!.on("data", b => {stderr += String(b);});
    const exit = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {modelChild!.kill("SIGTERM"); setTimeout(() => modelChild?.kill("SIGKILL"), 2000).unref(); reject(Error("Real Codex exceeded 150 second limit"));}, 150000);
        modelChild!.once("error", e => {clearTimeout(timer); reject(e);}); modelChild!.once("close", code => {clearTimeout(timer); resolve(code);});
        modelChild!.stdin!.end(prompt);
    }).finally(async () => {
        await writeFile(join(evidence, "codex.jsonl"), sanitize(stdout), {mode: 0o600});
        await writeFile(join(evidence, "codex.stderr.txt"), sanitize(stderr), {mode: 0o600});
    });
    report.cliExit = exit; assert.equal(exit, 0, sanitize(stderr));
    const events = stdout.split("\n").filter(Boolean).map(line => JSON.parse(line));
    const items = events.filter(e => e.type === "item.completed").map(e => e.item);
    report.modelItems = items;
    assert.equal(items.some(i => i.type === "command_execution"), false, "Model executed an unexpected shell command");
    const modelCalls = items.filter(i => i.type === "mcp_tool_call");
    assert.ok(modelCalls.every(i => i.server === "doc_sync"), "Unexpected MCP server");
    const names = modelCalls.map(i => i.tool);
    assert.ok(names.includes("get_schema")); assert.ok(names.includes("edit_document")); assert.ok(names.filter(n => n === readTool).length >= 2);
    if (bounded) assert.equal(names.includes("read_document"), false);
    assert.ok(requests.some(r => r.authenticated && r.method === "GET" && r.status === 405), "Expected authenticated JSON-mode GET 405");
    cases.realModelHttp = {status: "PASS", tools: names};
    report.initialSessionActors = [...service.registry.entries.values()].map(({value}) => ({identity: value.identity, principal: value.principal, id: value.id}));
    userTransport = new NodeHttpTransport(document, "fixture-human", origin);
    const schema = (await userTransport.getSchema()).schema; assert.ok(schema);
    user = new SyncClient("fixture-human", userTransport, {schema}); user.connect();
    await wait(() => user!.synchronized, "Human observer did not synchronize");
    const text = () => (user!.doc.toJSON().children?.[0] as {runs?: Array<{text: string}>} | undefined)?.runs?.map(r => r.text).join("") ?? "";
    assert.equal(text(), marker); const afterModel = await authority(); assert.deepEqual(afterModel.model, user.doc.toJSON());
    cases.authoritativeAfterModel = {document: afterModel.model, hash: hash(afterModel.model), serverSeq: afterModel.serverSeq};
    user.commit(user.doc.edit([{op: "insert", at: [0, marker.length], content: humanMarker}]).ops);
    await wait(() => user!.pending.length === 0 && user!.synchronized, "Human edit did not confirm"); assert.equal(text(), marker + humanMarker);
    await service.shutdown(); assert.equal(service.registry.entries.size, 0);
    service = createHostedService(config); endpoint = await listen(service);
    sdk = new Client({name: "post-model-restart-verifier", version: "1"});
    await sdk.connect(new StreamableHTTPClientTransport(endpoint, {requestInit: {headers: {authorization: `Bearer ${token}`}}}));
    const call = async (name: string) => {const result = await sdk!.callTool({name, arguments: {}}); assert.equal(result.isError, undefined, JSON.stringify(result)); return result.structuredContent;};
    cases.restartRead = await call("read_document");
    await call("undo"); await wait(() => text() === humanMarker, "Own undo did not preserve human edit");
    const afterUndo = await authority(); assert.deepEqual(afterUndo.model, user.doc.toJSON());
    cases.sdkUndoAfterHostedRestart = {status: "PASS", document: afterUndo.model, hash: hash(afterUndo.model), serverSeq: afterUndo.serverSeq};
    await call("redo"); await wait(() => text() === marker + humanMarker, "Own redo did not preserve human edit");
    const afterRedo = await authority(); assert.deepEqual(afterRedo.model, user.doc.toJSON());
    cases.sdkRedoAfterHostedRestart = {status: "PASS", document: afterRedo.model, hash: hash(afterRedo.model), serverSeq: afterRedo.serverSeq};
    report.finalSessionActors = [...service.registry.entries.values()].map(({value}) => ({identity: value.identity, principal: value.principal, id: value.id}));
    const changedSources: string[] = [];
    for (const [path, digest] of Object.entries(sources)) if (await digestFile(path) !== digest) changedSources.push(path);
    report.sourceDrift = changedSources; assert.deepEqual(changedSources, [], "Proof source changed during run");
    report.status = "PASS"; report.boundary = `Real Codex authenticated HTTP get_schema/${readTool}/edit/${readTool}. SDK verifies own undo/redo after hosted service restart with concurrent participant edit preserved. Direct hub state matches each model/undo/redo snapshot. No browser or remote deployment proof.`;
} catch (error) {
    report.status = "FAIL"; report.firstFailure = sanitize(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1;
} finally {
    modelChild?.kill("SIGTERM"); await sdk?.close().catch(() => {}); await service?.shutdown().catch(() => {});
    user?.disconnect();
    if (upstream.exitCode === null && upstream.signalCode === null) {const closed = once(upstream, "exit"); upstream.kill("SIGTERM"); await closed;}
    report.finishedAt = new Date().toISOString(); await save();
    await writeFile(join(evidence, "transfer-manifest.json"), JSON.stringify({script: "apps/mcp/scripts/check-codex-hosted.ts", scriptSha256: await digestFile("apps/mcp/scripts/check-codex-hosted.ts"), sourceHashes: sources, status: report.status, variant: report.variant, evidenceFiles: ["receipt.json", "codex.jsonl", "codex.stderr.txt", "prompt.txt"], firstFailure: report.firstFailure ?? null}, null, 2), {mode: 0o600});
    console.log(JSON.stringify({status: report.status, evidence, firstFailure: report.firstFailure ?? null}));
}
