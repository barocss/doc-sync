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

async function main() {
    const origin = process.env.DOC_SYNC_URL ?? "http://127.0.0.1:5410";
    const document = process.env.DOC_SYNC_DOCUMENT ?? "default";
    const actorHint = process.env.DOC_SYNC_ACTOR;
    const modulePath = process.env.DOC_SYNC_SCHEMA;
    let schema: Schema = DEMO_SCHEMA;
    if (modulePath) {
        const loaded = await import(pathToFileURL(resolve(modulePath)).href) as {schema?: Schema; default?: Schema};
        if (!loaded.schema && !loaded.default) throw new Error("Schema module must export schema or default");
        schema = (loaded.schema ?? loaded.default)!;
    }
    // Use a stable per-document location so an interrupted request is found on restart.
    // Applications that explicitly choose the previous ephemeral behavior can disable it.
    const journal = process.env.DOC_SYNC_JOURNAL === "off" ? null : await IntentJournal.open(
        join(resolve(process.env.DOC_SYNC_JOURNAL_DIR ?? join(homedir(), ".local", "state", "doc-sync", "recovery")), `${document}.json`),
        {document, actor: actorHint},
    );
    const recovered = journal ? await journal.read() : null;
    const checkpoint = journal ? await journal.readCheckpoint() : null;
    const actor = journal?.actor ?? actorHint ?? `ai-${randomUUID()}`;
    const transport = new NodeHttpTransport(document, actor, origin);
    const session = new DocumentSession(actor, transport, recovered?.schema ?? checkpoint?.schema ?? schema, 10_000, journal);
    try { await session.start(); } catch (error) { await session.close(); throw error; }
    const server = createServer(session);
    const stdio = new StdioServerTransport();
    await server.connect(stdio);
    server.server.onclose = () => { void shutdownSession(session, transport); };
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
