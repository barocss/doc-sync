import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer, request, type Server, type IncomingMessage, type ServerResponse} from "node:http";
import {randomBytes} from "node:crypto";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {createHostedService} from "../src/hosted.ts";
export const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export function gate() { let release!: () => void; const wait = new Promise<void>(r => { release = r; }); return {wait, release}; }
export async function until(test: () => boolean) { const end = Date.now() + 10000; while (!test()) { if (Date.now() > end) throw new Error("Condition timed out"); await delay(5); } }
export async function listen(server: Server) { server.listen(0, "127.0.0.1"); await once(server, "listening"); const a = server.address(); assert.ok(a && typeof a !== "string"); return `http://127.0.0.1:${a.port}`; }
export async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") { if (child.exitCode !== null || child.signalCode) return; const exited = once(child, "exit"); child.kill(signal); await exited; }
export async function demo(data: string) {
    const child = spawn(process.execPath, [new URL("../../demo/server.ts", import.meta.url).pathname], {env: {...process.env, PORT: "0", DATA_DIR: data}, stdio: ["ignore", "pipe", "pipe"]});
    let errors = ""; child.stderr!.on("data", b => { errors += b; });
    const url = await new Promise<string>((resolve, reject) => { let text = ""; const timer = setTimeout(() => reject(new Error(`Demo failed: ${errors}`)), 10000); child.stdout!.on("data", b => {text += b; const m = text.match(/http:\/\/localhost:\d+(?=\r?\n)/); if (m) {clearTimeout(timer); resolve(m[0]);} }); });
    return {child, url};
}
export async function fixture(options: {limits?: Record<string, number>; intercept?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>} = {}) {
    const dir = await mkdtemp(join(tmpdir(), "hosted-lifecycle-"));
    const upstream = await demo(join(dir, "upstream"));
    const requests: Array<{url: string; authorization: string | undefined}> = [];
    const proxy = createServer((req, res) => { void (async () => {
        requests.push({url: req.url!, authorization: req.headers.authorization});
        if (await options.intercept?.(req, res)) return;
        const forwarded = request(new URL(req.url!, upstream.url), {method: req.method, headers: {...req.headers, host: new URL(upstream.url).host}}, incoming => {res.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(res);});
        forwarded.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        req.pipe(forwarded); res.once("close", () => forwarded.destroy());
    })().catch(() => {res.writeHead(500); res.end();}); });
    const upstreamUrl = await listen(proxy);
    const token = randomBytes(32).toString("base64url"), readToken = randomBytes(32).toString("base64url");
    const config = {dataDir: join(dir, "journals"), hosts: ["127.0.0.1:0"], limits: options.limits ?? {}, routes: [{tenant: "t", document: "d", slot: "s", actor: "stable", upstreamDocument: "doc", upstream: upstreamUrl, headers: {authorization: "Bearer configured-upstream"}}], grants: [
        {id: "write", principal: "p", token, routes: ["/mcp/t/d/s"], permissions: ["read", "write", "schema"]},
        {id: "read", principal: "p", token: readToken, routes: ["/mcp/t/d/s"], permissions: ["read"]},
    ]};
    const service = createHostedService(config), base = await listen(service.server); service.config.hosts.push(new URL(base).host);
    const endpoint = new URL(`${base}/mcp/t/d/s`);
    const connect = async (bearer = token, path = endpoint) => {
        const client = new Client({name: "lifecycle", version: "1"}); const transport = new StreamableHTTPClientTransport(path, {requestInit: {headers: {authorization: `Bearer ${bearer}`}}});
        try { await client.connect(transport); } catch (e) {await client.close(); throw e;} return {client, transport};
    };
    return {dir, upstream, proxy, service, config, endpoint, token, readToken, requests, connect, async cleanup() {await service.shutdown(); proxy.closeAllConnections(); proxy.close(); await stop(upstream.child); await rm(dir, {recursive: true, force: true});}};
}
export async function call(client: Client, name: string, args: Record<string, unknown> = {}) { const value = await client.callTool({name, arguments: args}); assert.equal(value.isError, undefined, JSON.stringify(value)); return value.structuredContent as Record<string, unknown>; }
