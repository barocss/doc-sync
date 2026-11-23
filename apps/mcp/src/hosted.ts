import {createServer as createHttpServer, type IncomingMessage, type ServerResponse} from "node:http";
import {createHash, randomUUID} from "node:crypto";
import {join} from "node:path";
import {mkdir, lstat, realpath} from "node:fs/promises";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {isInitializeRequest} from "@modelcontextprotocol/sdk/types.js";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {DocumentSession} from "./session.ts";
import {IntentJournal} from "./journal.ts";
import {createServer} from "./server.ts";
import {authenticate, authorizeTool, binding} from "./hosted-auth.ts";
import {parseHostedConfig, routePath, type HostedConfig, type HostedRoute, type HostedGrant} from "./hosted-config.ts";
import {SessionRegistry} from "./session-registry.ts";

type Entry = {identity: string; binding: string; principal: string; state: "starting" | "active" | "closing" | "closed";
    lastUsed: number; calls: Set<Promise<unknown>>; ready?: Promise<void>; closePromise?: Promise<void>;
    journal?: IntentJournal; document?: DocumentSession; upstream?: NodeHttpTransport;
    mcp?: ReturnType<typeof createServer>; transport?: StreamableHTTPServerTransport; id?: string};
class HttpError extends Error { readonly status: number; constructor(status: number) { super("Request rejected"); this.status = status; } }
const reject = (res: ServerResponse, status: number) => { if (!res.headersSent) { res.writeHead(status, {...(status === 401 ? {"www-authenticate": "Bearer"} : {}), "content-type": "application/json"}); res.end(JSON.stringify({error: "Request rejected"})); } };
async function body(req: IncomingMessage, max: number): Promise<unknown> {
    if (req.headers["content-length"] && Number(req.headers["content-length"]) > max) throw new HttpError(413);
    let bytes = 0; const chunks: Buffer[] = [];
    for await (const chunk of req.iterator({destroyOnReturn: false})) { bytes += chunk.length; if (bytes > max) throw new HttpError(413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400); }
}
/** One process, configured private upstreams, and opaque static bearer grants. */
export function createHostedService(rawConfig: unknown) {
    const config: HostedConfig = parseHostedConfig(rawConfig);
    const registry = new SessionRegistry<Entry>(config.limits.sessions, config.limits.perPrincipal);
    const sessions = new Map<string, Entry>();
    let stopping = false;
    let bodyReaders = 0; const principalBodyReaders = new Map<string, number>();
    const close = (e: Entry): Promise<void> => {
        if (e.closePromise) return e.closePromise;
        e.state = "closing";
        e.closePromise = (async () => {
            await e.ready?.catch(() => undefined);
            await Promise.allSettled([...e.calls]);
            await e.document?.drain();
            // Routine cleanup does not mutate upstream actor/recovery state. A timed-out
            // leave has an unknown remote outcome and could arrive after a reconnect.
            e.document?.disconnect();
            await e.document?.close();
            if (!e.document) await e.journal?.close();
            await e.mcp?.close();
            if (e.id) sessions.delete(e.id);
            e.state = "closed"; registry.release(e.identity, e);
        })();
        return e.closePromise;
    };
    const open = async (e: Entry, route: HostedRoute, grant: HostedGrant) => {
        await mkdir(config.dataDir, {recursive: true, mode: 0o700});
        const directory = await lstat(config.dataDir);
        if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) || (process.getuid && directory.uid !== process.getuid())) throw new Error("Data directory must be private and owned by this process user");
        const directoryPath = await realpath(config.dataDir);
        const file = createHash("sha256").update(e.identity).digest("hex");
        e.journal = await IntentJournal.open(join(directoryPath, `${file}.json`), {document: route.upstreamDocument, actor: route.actor});
        const recovered = await e.journal.read(), checkpoint = await e.journal.readCheckpoint();
        if (!grant.permissions.includes("write") && (recovered || checkpoint?.client.pending.length || checkpoint?.releasePending)) throw new Error("A write credential is required to resolve durable recovery");
        e.upstream = new NodeHttpTransport(route.upstreamDocument, route.actor, route.upstream, {headers: route.headers});
        const schema = recovered?.schema ?? checkpoint?.schema ?? (await e.upstream.getSchema()).schema;
        if (!schema) throw new Error("Verified upstream schema required");
        e.document = new DocumentSession(route.actor, e.upstream, schema, 10000, e.journal);
        await e.document.start();
        e.mcp = createServer(e.document, {authorizeTool: name => authorizeTool(grant, name), runTool: async (_name, call) => {
            if (e.state !== "active" || stopping) throw new Error("Session is closing");
            if (e.calls.size >= config.limits.calls) throw new Error("Tool capacity reached");
            e.lastUsed = Date.now();
            // Schedule invocation after it is in the admitted set, including synchronous handlers.
            const promise = Promise.resolve().then(call); e.calls.add(promise);
            try { return await promise; } finally { e.calls.delete(promise); e.lastUsed = Date.now(); }
        }});
        e.transport = new StreamableHTTPServerTransport({sessionIdGenerator: randomUUID, enableJsonResponse: true,
            onsessioninitialized: id => { e.id = id; sessions.set(id, e); },
            onsessionclosed: () => { void close(e).catch(() => undefined); }});
        await e.mcp.connect(e.transport);
        e.mcp.server.onclose = () => { void close(e).catch(() => undefined); };
        if (e.state === "starting") e.state = "active";
    };
    const server = createHttpServer({maxHeaderSize: 65536, headersTimeout: config.limits.requestMs, requestTimeout: config.limits.requestMs}, (req, res) => {
        void (async () => {
            if (stopping) throw new HttpError(503);
            if (!req.headers.host || !config.hosts.includes(req.headers.host)) throw new HttpError(403);
            if (req.headers.origin !== undefined && !config.origins.includes(req.headers.origin)) throw new HttpError(403);
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.search) throw new HttpError(400);
            const route = config.routes.find(r => routePath(r) === url.pathname);
            const grant = authenticate(req, config.grants);
            if (!grant) throw new HttpError(401);
            if (!route || !grant.routes.includes(url.pathname)) throw new HttpError(403);
            if (!["POST", "GET", "DELETE"].includes(req.method ?? "")) throw new HttpError(405);
            const id = req.headers["mcp-session-id"];
            if (Array.isArray(id)) throw new HttpError(400);
            let e: Entry | undefined;
            if (id) {
                e = sessions.get(id);
                if (!e) throw new HttpError(404);
                if (e.binding !== binding(grant, url.pathname, route.actor)) throw new HttpError(403);
                if (e.state !== "active") throw new HttpError(409);
            } else if (req.method !== "POST") throw new HttpError(400);
            let parsed: unknown;
            if (req.method === "POST") {
                const principalReaders = principalBodyReaders.get(grant.principal) ?? 0;
                if (bodyReaders >= config.limits.bodyReaders || principalReaders >= config.limits.perPrincipalBodyReaders) throw new HttpError(429);
                bodyReaders++; principalBodyReaders.set(grant.principal, principalReaders + 1);
                try { parsed = await body(req, config.limits.bodyBytes); }
                finally { bodyReaders--; const left = principalBodyReaders.get(grant.principal)! - 1; if (left) principalBodyReaders.set(grant.principal, left); else principalBodyReaders.delete(grant.principal); }
            }
            if (stopping) throw new HttpError(503);
            if (e && e.state !== "active") throw new HttpError(409);
            let initializing = false;
            if (!e) {
                if (!isInitializeRequest(parsed)) throw new HttpError(400);
                e = {identity: JSON.stringify([route.upstream, route.upstreamDocument, route.actor]), binding: binding(grant, url.pathname, route.actor), principal: grant.principal,
                    state: "starting", lastUsed: Date.now(), calls: new Set()};
                try { registry.reserve(e.identity, grant.principal, e); } catch { throw new HttpError(429); }
                initializing = true;
                const entry = e;
                res.once("close", () => { if (!res.writableFinished) void close(entry).catch(() => undefined); });
                entry.ready = open(entry, route, grant);
                try {
                    await entry.ready;
                    if (req.aborted || res.destroyed || entry.state !== "active") throw new Error("Initialize disconnected");
                } catch { await close(entry); throw new HttpError(503); }
            }
            e.lastUsed = Date.now();
            // GET streaming is deliberately omitted in this first JSON-response service.
            if (req.method === "GET") throw new HttpError(405);
            if (req.method === "DELETE") {
                await close(e); res.writeHead(200); res.end(); return;
            }
            try { await e.transport!.handleRequest(req, res, parsed); }
            catch { if (!e.id) await close(e); throw new HttpError(400); }
            if (!e.id || (initializing && res.destroyed && !res.writableFinished)) await close(e);
        })().catch(error => reject(res, error instanceof HttpError ? error.status : 500));
    });
    const timer = setInterval(() => {
        for (const {value: e} of registry.entries.values()) if (e.state === "active" && !e.calls.size && Date.now() - e.lastUsed >= config.limits.idleMs) void close(e).catch(() => undefined);
    }, Math.min(1000, config.limits.idleMs)); timer.unref();
    let shutdownPromise: Promise<void> | undefined;
    return {server, registry, config, shutdown(): Promise<void> {
        if (shutdownPromise) return shutdownPromise;
        stopping = true; clearInterval(timer);
        shutdownPromise = (async () => {
            const stopped = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            await Promise.all([...registry.entries.values()].map(({value}) => close(value)));
            server.closeIdleConnections(); await stopped;
        })(); return shutdownPromise;
    }};
}
