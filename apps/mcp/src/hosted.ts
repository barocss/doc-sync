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
import {SyncClient} from "@barocss/doc-sync/sync";
import {MAIN, readDocumentSlice, schemaVersion} from "@barocss/doc-sync";
import {handleProposal, proposalCapability, ProposalHttpError, type ProposalCapture} from "./proposal-routes.ts";
import {previewReplacement} from "./proposal-preview.ts";
import {acceptProposal, proposalOwner} from "./proposal-accept.ts";
import {ProposalStore} from "./proposal-store.ts";
import {SessionRegistry} from "./session-registry.ts";

const HOSTED_HTTP_METHODS = Object.freeze(["POST", "GET", "DELETE"]);


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
    const proposalRequests = new Set<Promise<void>>();
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
        if ((await ProposalStore.inspectOutstanding(config.dataDir, proposalOwner(route, grant))).length) throw new Error("Approved proposal requires owner reconciliation");
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
    const applyProposal = async (route: HostedRoute, grant: HostedGrant, id: string, input: unknown, reconcileOnly: boolean) => {
        const e: Entry = {identity: JSON.stringify([route.upstream, route.upstreamDocument, route.actor]), binding: "proposal-accept", principal: grant.principal, state: "starting", lastUsed: Date.now(), calls: new Set()};
        try { registry.reserve(e.identity, grant.principal, e); } catch { throw new ProposalHttpError(409); }
        let complete!: () => void; e.ready = new Promise<void>(resolve => { complete = resolve; });
        try { return await acceptProposal(config, route, grant, id, input, reconcileOnly); }
        finally { registry.release(e.identity, e); complete(); }
    };
    const captureProposal: ProposalCapture = async (route, grant, request) => {
        const e: Entry = {identity: JSON.stringify([route.upstream, route.upstreamDocument, route.actor]), binding: "proposal-capture", principal: grant.principal, state: "starting", lastUsed: Date.now(), calls: new Set()};
        try { registry.reserve(e.identity, grant.principal, e); } catch { throw new ProposalHttpError(409); }
        let complete!: () => void; e.ready = new Promise<void>(resolve => { complete = resolve; });
        let client: SyncClient | undefined;
        let journal: IntentJournal | undefined;
        try {
            await mkdir(config.dataDir, {recursive: true, mode: 0o700});
            const directory = await lstat(config.dataDir);
            if (!directory.isDirectory() || directory.isSymbolicLink() || directory.mode & 0o077 || process.getuid && directory.uid !== process.getuid()) throw new Error("Invalid data directory");
            const root = await realpath(config.dataDir), file = createHash("sha256").update(e.identity).digest("hex");
            if (!request && (await ProposalStore.inspectOutstanding(config.dataDir, proposalOwner(route, grant))).length) throw new ProposalHttpError(409);
            journal = await IntentJournal.open(join(root, `${file}.json`), {document: route.upstreamDocument, actor: route.actor});
            const intent = await journal.read(), checkpoint = await journal.readCheckpoint();
            if (intent || checkpoint?.client.pending.length || checkpoint?.releasePending) throw new ProposalHttpError(409);
            // No DocumentSession, restore, recovery reservation, checkpoint write, or replay.
            const transport = new NodeHttpTransport(route.upstreamDocument, "", route.upstream, {headers: route.headers});
            const schema = await transport.getSchema();
            if (!schema.schema || !schema.schemaVersion) throw new ProposalHttpError(409);
            client = new SyncClient(route.actor, {subscribe: transport.subscribe.bind(transport),
                send: async message => { if (message.kind !== "ack") throw new Error("Proposal capture cannot send changes"); },
                sendPresence: () => { throw new Error("Proposal capture cannot publish presence"); }}, {schema: schema.schema}); client.connect();
            const deadline = Date.now() + config.limits.requestMs;
            while (!client.synchronized || !client.epoch || !client.schemaVerified) { if (Date.now() >= deadline || stopping) throw new ProposalHttpError(503); await new Promise(resolve => setTimeout(resolve, 5)); }
            const version = client.doc.version, before = await transport.getRecoveryState();
            const base = {generation: before.generation!, epoch: before.epoch, serverSeq: before.serverSeq, schemaVersion: before.schemaVersion!};
            const settled = () => !!base.generation && !!base.schemaVersion && client!.synchronized && !client!.pending.length && client!.epoch === base.epoch && client!.serverSeq === base.serverSeq && schemaVersion(client!.schema) === base.schemaVersion;
            if (!settled() || request && JSON.stringify(base) !== JSON.stringify(request.base)) throw new ProposalHttpError(409);
            let source: string | undefined;
            if (request) {
                const child = readDocumentSlice(client.doc, {path: [], start: request.change.path[0], limit: 1, maxNodes: 1024, maxTextUnits: 16384, maxBytes: 131072}).children[0];
                const blocks = client.doc.blocks(), block = blocks.find(b => b.marker.key === request.change.blockId);
                if (!child || child.blockId !== request.change.blockId || !block || block.kind !== "text" || block.virtual || block.parts || block.aliases.length || block.marker.line.key !== MAIN ||
                    block.chars.some(char => char.kind !== "char" || Object.keys(client!.doc.marksOf(char)).length) ||
                    blocks.filter(b => b.marker.key === child.blockId).length !== 1 || client.schema.nodes[child.node.type]?.shape !== "text" || child.node.children ||
                    child.node.runs?.some(run => !("text" in run) || Object.keys(run.marks).length)) throw new ProposalHttpError(422);
                source = (child.node.runs ?? []).map(run => "text" in run ? run.text : "").join("");
                if (source !== block.text || source.length > 16384) throw new ProposalHttpError(422);
                try { previewReplacement(source, request.change); } catch { throw new ProposalHttpError(422); }
            }
            const after = await transport.getRecoveryState();
            if (JSON.stringify(before) !== JSON.stringify(after) || version !== client.doc.version || !settled()) throw new ProposalHttpError(409);
            return {base, ...(source !== undefined ? {source} : {})};
        } finally { try { client?.disconnect(); await journal?.close(); } finally { registry.release(e.identity, e); complete(); } }
    };
    const server = createHttpServer({maxHeaderSize: 65536, headersTimeout: config.limits.requestMs, requestTimeout: config.limits.requestMs}, (req, res) => {
        void (async () => {
            if (stopping) throw new HttpError(503);
            if (!req.headers.host || !config.hosts.includes(req.headers.host)) throw new HttpError(403);
            if (req.headers.origin !== undefined && !config.origins.includes(req.headers.origin)) throw new HttpError(403);
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.search) throw new HttpError(400);
            const proposalRoute = config.proposals.enabled ? config.routes.find(r => url.pathname === `${routePath(r)}/proposals` || url.pathname.startsWith(`${routePath(r)}/proposals/`)) : undefined;
            const route = proposalRoute ?? config.routes.find(r => routePath(r) === url.pathname);
            const grant = authenticate(req, config.grants);
            if (!grant) throw new HttpError(401);
            if (!route || !grant.routes.includes(routePath(route))) throw new HttpError(403);
            if (!HOSTED_HTTP_METHODS.includes(req.method ?? "")) throw new HttpError(405);
            if (proposalRoute) {
                if (req.headers["mcp-session-id"] !== undefined) throw new HttpError(400);
                const suffix = url.pathname.slice(`${routePath(route)}/proposals`.length);
                const capability = proposalCapability(req.method, suffix);
                if (capability === "proposal_accept" && !config.proposals.acceptanceEnabled) throw new HttpError(405);
                if (!grant.permissions.includes("read") || !grant.permissions.includes(capability)) throw new HttpError(403);
                const readers = principalBodyReaders.get(grant.principal) ?? 0;
                if (bodyReaders >= config.limits.bodyReaders || readers >= config.limits.perPrincipalBodyReaders) throw new HttpError(429);
                // The same bounded lease covers every proposal method through storage cleanup.
                // POST keeps this lease while reading its body instead of taking a second one.
                bodyReaders++; principalBodyReaders.set(grant.principal, readers + 1);
                let complete!: () => void;
                const done = new Promise<void>(resolve => { complete = resolve; }); proposalRequests.add(done);
                try {
                    const parsed = req.method === "POST" ? await body(req, Math.min(config.limits.bodyBytes, 262144)) : undefined;
                    if (stopping) throw new HttpError(503);
                    await handleProposal({req, res, config, route, grant, suffix, parsed, capture: captureProposal, accept: (id, input, reconcileOnly) => applyProposal(route, grant, id, input, reconcileOnly)});
                    if (!res.writableFinished && !res.destroyed) await new Promise<void>(resolve => {
                        const finished = () => { res.off("finish", finished); res.off("close", finished); resolve(); };
                        res.once("finish", finished); res.once("close", finished);
                    });
                    return;
                } finally {
                    bodyReaders--;
                    const left = principalBodyReaders.get(grant.principal)! - 1;
                    if (left) principalBodyReaders.set(grant.principal, left); else principalBodyReaders.delete(grant.principal);
                    proposalRequests.delete(done); complete();
                }
            }
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
        })().catch(error => reject(res, error instanceof HttpError || error instanceof ProposalHttpError ? error.status : 500));
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
            await Promise.all([...[...registry.entries.values()].map(({value}) => close(value)), ...proposalRequests]);
            server.closeIdleConnections(); await stopped;
        })(); return shutdownPromise;
    }};
}
