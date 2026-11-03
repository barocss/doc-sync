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

/** One process owns input, bootstrap and pending-safe cleanup. */
class StdioLifecycle {
    private phase = "input";
    private closing = false;
    private ready = false;
    private failed = false;
    private journal: IntentJournal | null = null;
    private session: DocumentSession | undefined;
    private transport: NodeHttpTransport | undefined;
    private server: ReturnType<typeof createServer> | undefined;
    private stdio: StdioServerTransport | undefined;
    private cleanup: Promise<void> | undefined;
    private bootstrap!: Promise<void>;
    private readonly cancelled = new Error("Startup cancelled");
    private readonly input: ReturnType<typeof ownStdioInput>;
    // A signal callback receives a string, not an input error.
    private readonly signal = () => this.requestClose();
    private readonly onInputClose = (error?: unknown) => this.requestClose(error);
    private readonly scheduleCleanup = () => { void this.clean(); };

    constructor() {
        this.input = ownStdioInput(this.onInputClose);
        process.on("SIGINT", this.signal);
        process.on("SIGTERM", this.signal);
    }

    private checkOpen(): void { if (this.closing) throw this.cancelled; }

    private requestClose(error?: unknown): void {
        if (error !== undefined) diagnostic("input failure", this.phase, error);
        if (!this.closing) {
            this.closing = true;
            this.input.close();
        }
        // Also defer already-ended stdin until bootstrap has been assigned.
        queueMicrotask(this.scheduleCleanup);
    }

    private clean(): Promise<void> { return this.cleanup ??= this.closeResources(); }

    private async closeResource(resource: {close(): Promise<void>}): Promise<void> {
        try { await resource.close(); }
        catch (error) { diagnostic("cleanup failure", this.phase, error); }
    }

    private async closeResources(): Promise<void> {
        // Bootstrap never awaits cleanup. Do not close a journal during its open/read.
        try { await this.bootstrap; } catch { /* Startup reports its own failure. */ }
        try {
            if (this.server) await this.closeResource(this.server);
            else if (this.stdio) await this.closeResource(this.stdio);
            if (this.session) {
                try {
                    if (this.ready && !this.failed) await shutdownSession(this.session, this.transport!);
                    else await this.session.close();
                } catch (error) {
                    diagnostic("cleanup failure", this.phase, error);
                    try { this.session.disconnect(); }
                    catch (error) { diagnostic("cleanup failure", this.phase, error); }
                }
            }
            if (this.journal) await this.closeResource(this.journal);
        } finally {
            this.input.close();
            process.off("SIGINT", this.signal);
            process.off("SIGTERM", this.signal);
        }
    }

    private async start(): Promise<void> {
        this.checkOpen();
        const origin = process.env.DOC_SYNC_URL ?? "http://127.0.0.1:5410";
        const document = process.env.DOC_SYNC_DOCUMENT ?? "default";
        const actorHint = process.env.DOC_SYNC_ACTOR;
        const modulePath = process.env.DOC_SYNC_SCHEMA;
        let schema: Schema = DEMO_SCHEMA;
        if (modulePath) {
            this.phase = "schema-import";
            const loaded = await import(pathToFileURL(resolve(modulePath)).href) as {schema?: Schema; default?: Schema};
            this.checkOpen();
            if (!loaded.schema && !loaded.default) throw new Error("Schema module must export schema or default");
            schema = (loaded.schema ?? loaded.default)!;
        }
        else if (process.env.DOC_SYNC_DISCOVER_SCHEMA === "on") {
            // Schema is data, not executable code. The transport validates its fingerprint.
            this.phase = "schema-discovery";
            const probe = new NodeHttpTransport(document, actorHint ?? "schema-probe", origin);
            const discovered = await probe.getSchema();
            this.checkOpen();
            if (!discovered.schema || !discovered.schemaVersion) throw new Error("The server must provide a verifiable schema");
            schema = discovered.schema;
        }
        // Use a stable per-document location so an interrupted request is found on restart.
        // Applications that explicitly choose the previous ephemeral behavior can disable it.
        this.phase = "journal-open";
        this.checkOpen();
        this.journal = process.env.DOC_SYNC_JOURNAL === "off" ? null : await IntentJournal.open(
            join(resolve(process.env.DOC_SYNC_JOURNAL_DIR ?? join(homedir(), ".local", "state", "doc-sync", "recovery")), `${document}.json`),
            {document, actor: actorHint},
        );
        this.checkOpen();
        this.phase = "journal-read";
        const recovered = this.journal ? await this.journal.read() : null;
        this.checkOpen();
        const checkpoint = this.journal ? await this.journal.readCheckpoint() : null;
        this.checkOpen();
        const actor = this.journal?.actor ?? actorHint ?? `ai-${randomUUID()}`;
        this.transport = new NodeHttpTransport(document, actor, origin);
        const bridge=process.env.DOC_SYNC_MISSION_BRIDGE;
        if (bridge && !this.journal) throw Error("Mission evidence requires a durable journal");
        this.phase = "session-create";
        this.checkOpen();
        this.session = new DocumentSession(actor, this.transport, recovered?.schema ?? checkpoint?.schema ?? schema, 10_000, this.journal, bridge ? (step,record)=>saveStepEvidence(bridge,step,record) : undefined);
        this.phase = "session-start";
        await this.session.start();
        this.checkOpen();
        this.phase = "stdio-connect";
        this.server = createServer(this.session);
        this.server.server.onclose = this.signal;
        this.stdio = new StdioServerTransport(this.input.input);
        await this.server.connect(this.stdio);
        this.checkOpen();
        this.ready = true;
        this.phase = "ready";
        this.input.releaseBootstrap();
    }

    async run(): Promise<void> {
        this.bootstrap = this.start();
        try { await this.bootstrap; }
        catch (error) {
            this.failed = true;
            if (error !== this.cancelled) diagnostic("startup failure", this.phase, error);
            this.requestClose();
        }
        if (this.closing) await this.clean();
    }
}

async function main(): Promise<void> {
    await new StdioLifecycle().run();
}

void main().catch(error => diagnostic("lifetime failure", "main", error));
