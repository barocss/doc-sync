import {randomUUID} from "node:crypto";
import {join, resolve} from "node:path";
import {homedir} from "node:os";
import {pathToFileURL} from "node:url";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import type {Schema} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {DocumentSession} from "./session.ts";
import {createServer} from "./server.ts";
import {shutdownSession} from "./shutdown.ts";
import {IntentJournal} from "./journal.ts";
import {saveStepEvidence} from "./step-evidence.ts";
import {ownStdioInput} from "./stdio-lifetime.ts";

// Diagnostics must not contain protocol payloads or unbounded external error text.
function diagnostic(kind: string, phase: string, error: unknown) {
    const message = (error instanceof Error ? error.message : String(error))
        .replace(/https?:\/\/[^\s]+/gi, "[url]")
        .replace(/((?:token|password|secret|authorization)[\s:=]+)[^\s,;]+/gi, "$1[redacted]")
        .replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 768);
    console.error(`MCP ${kind} [${phase}]: ${message}`);
    process.exitCode = 1;
}

async function main() {
    let phase = "input";
    let closing = false;
    let ready = false;
    let failed = false;
    let journal: IntentJournal | null = null;
    let session: DocumentSession | undefined;
    let transport: NodeHttpTransport | undefined;
    let server: ReturnType<typeof createServer> | undefined;
    let stdio: StdioServerTransport | undefined;
    let cleanup: Promise<void> | undefined;
    let bootstrap: Promise<void>;
    const cancelled = new Error("Startup cancelled");
    const checkOpen = () => { if (closing) throw cancelled; };
    const input = ownStdioInput(requestClose);
    const signal = () => requestClose();
    process.on("SIGINT", signal);
    process.on("SIGTERM", signal);

    function requestClose(error?: unknown) {
        if (error !== undefined) diagnostic("input failure", phase, error);
        if (!closing) {
            closing = true;
            input.close();
        }
        // Defer until bootstrap has been assigned, including already-ended stdin.
        queueMicrotask(() => { void clean(); });
    }

    function clean(): Promise<void> {
        return cleanup ??= (async () => {
            // Never close a journal while its owner is still initializing it.
            await bootstrap.catch(() => undefined);
            const attempt = async (action: () => Promise<void>) => {
                try { await action(); }
                catch (error) { diagnostic("cleanup failure", phase, error); }
            };
            try {
                if (server) await attempt(() => server!.close());
                else if (stdio) await attempt(() => stdio!.close());
                if (session) {
                    try {
                        if (ready && !failed) await shutdownSession(session, transport!);
                        else await session.close();
                    } catch (error) {
                        diagnostic("cleanup failure", phase, error);
                        // A failed drain must not retain the local SSE or writer lock.
                        await attempt(async () => session!.disconnect());
                    }
                }
                if (journal) await attempt(() => journal!.close());
            } finally {
                input.close();
                process.off("SIGINT", signal);
                process.off("SIGTERM", signal);
            }
        })();
    }

    bootstrap = (async () => {
        checkOpen();
        const origin = process.env.DOC_SYNC_URL ?? "http://127.0.0.1:5410";
        const document = process.env.DOC_SYNC_DOCUMENT ?? "default";
        const actorHint = process.env.DOC_SYNC_ACTOR;
        const modulePath = process.env.DOC_SYNC_SCHEMA;
        let schema: Schema = DEMO_SCHEMA;
        if (modulePath) {
            phase = "schema-import";
            const loaded = await import(pathToFileURL(resolve(modulePath)).href) as {schema?: Schema; default?: Schema};
            checkOpen();
            if (!loaded.schema && !loaded.default) throw new Error("Schema module must export schema or default");
            schema = (loaded.schema ?? loaded.default)!;
        }
        else if (process.env.DOC_SYNC_DISCOVER_SCHEMA === "on") {
            // Schema is data, not executable code. The transport validates its fingerprint.
            phase = "schema-discovery";
            const probe = new NodeHttpTransport(document, actorHint ?? "schema-probe", origin);
            const discovered = await probe.getSchema();
            checkOpen();
            if (!discovered.schema || !discovered.schemaVersion) throw new Error("The server must provide a verifiable schema");
            schema = discovered.schema;
        }
        // Use a stable per-document location so an interrupted request is found on restart.
        // Applications that explicitly choose the previous ephemeral behavior can disable it.
        phase = "journal-open";
        checkOpen();
        journal = process.env.DOC_SYNC_JOURNAL === "off" ? null : await IntentJournal.open(
            join(resolve(process.env.DOC_SYNC_JOURNAL_DIR ?? join(homedir(), ".local", "state", "doc-sync", "recovery")), `${document}.json`),
            {document, actor: actorHint},
        );
        checkOpen();
        phase = "journal-read";
        const recovered = journal ? await journal.read() : null;
        checkOpen();
        const checkpoint = journal ? await journal.readCheckpoint() : null;
        checkOpen();
        const actor = journal?.actor ?? actorHint ?? `ai-${randomUUID()}`;
        transport = new NodeHttpTransport(document, actor, origin);
        const bridge=process.env.DOC_SYNC_MISSION_BRIDGE;
        if (bridge && !journal) throw Error("Mission evidence requires a durable journal");
        phase = "session-create";
        checkOpen();
        session = new DocumentSession(actor, transport, recovered?.schema ?? checkpoint?.schema ?? schema, 10_000, journal, bridge ? (step,record)=>saveStepEvidence(bridge,step,record) : undefined);
        phase = "session-start";
        await session.start();
        checkOpen();
        phase = "stdio-connect";
        server = createServer(session);
        server.server.onclose = () => requestClose();
        stdio = new StdioServerTransport(input.input);
        await server.connect(stdio);
        checkOpen();
        ready = true;
        phase = "ready";
        input.releaseBootstrap();
    })();
    try { await bootstrap; }
    catch (error) {
        failed = true;
        if (error !== cancelled) diagnostic("startup failure", phase, error);
        requestClose();
    }
    if (closing) await clean();
}

void main().catch(error => diagnostic("lifetime failure", "main", error));
