import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import type {EditOp} from "@barocss/doc-sync";
import type {DocumentSession} from "./session.ts";

const path = z.array(z.number().int().nonnegative()).min(1);
const edit = z.discriminatedUnion("op", [
    z.object({op: z.literal("insert"), at: path, content: z.union([z.string(), z.array(z.record(z.unknown()))])}).strict(),
    z.object({op: z.literal("delete"), at: path, count: z.number().int().nonnegative()}).strict(),
    z.object({op: z.literal("update"), at: path, attrs: z.record(z.unknown()), length: z.number().int().nonnegative().optional()}).strict(),
    z.object({op: z.literal("split"), at: path}).strict(),
    z.object({op: z.literal("merge"), at: path}).strict(),
    z.object({op: z.literal("move"), from: path, at: path}).strict(),
]);
const base = z.object({epoch: z.string().min(1), serverSeq: z.number().int().nonnegative(), schemaVersion: z.string().min(1).nullable()}).strict();

const result = (data: Record<string, unknown>) => ({content: [{type: "text" as const, text: JSON.stringify(data)}], structuredContent: data});
const toolError = (error: unknown) => ({isError: true, content: [{type: "text" as const, text: error instanceof Error ? error.message : String(error)}]});

/** Create a stdio-compatible MCP server around one persistent participant. */
export function createServer(session: DocumentSession): McpServer {
    const server = new McpServer({name: "doc-sync", version: "0.0.0"});
    server.registerTool("get_schema", {
        description: "Read the configured schema and whether the connected server verified its version.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, () => result({schema: session.client.schema, verifiedAgainstServer: session.client.schemaVerified}));
    server.registerTool("get_server_schema", {
        description: "Read the authoritative server schema and its version, including after a schema transition.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, async () => {
        try { return result(await session.serverSchema()); } catch (error) { return toolError(error); }
    });
    server.registerTool("recovery_status", {
        description: "Inspect a durable unresolved edit and any exact server receipt. Unknown never means rejected. No edit is sent by this tool.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, async () => {
        try { return result(await session.recoveryStatus()); } catch (error) { return toolError(error); }
    });
    server.registerTool("upgrade_schema", {
        description: "Install the current server schema when compatible and reconnect. Pending changes and this actor's history are preserved. Resolve an unconfirmed conditional edit first.",
        inputSchema: z.object({}).strict(),
    }, async () => {
        try { return result(await session.upgradeSchema()); } catch (error) { return toolError(error); }
    });
    server.registerTool("transition_schema", {
        description: "Request a compatible schema transition using an exact server epoch, sequence and schema version. Network failure leaves the outcome unknown; inspect get_server_schema before retrying.",
        inputSchema: z.object({base: base.extend({schemaVersion: z.string().min(1)}).strict(), schema: z.record(z.unknown())}).strict(),
    }, async ({base: transitionBase, schema}) => {
        try { return result(await session.transitionSchema(transitionBase, schema as unknown as typeof session.client.schema)); } catch (error) { return toolError(error); }
    });
    server.registerTool("read_document", {
        description: "Read the local replica, revision, and pending changes. Remote changes may still be in transit.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, async () => {
        try { return result(await session.read()); } catch (error) { return toolError(error); }
    });
    server.registerTool("edit_document", {
        description: "Apply model edits only if the server atomically confirms the revision from read_document. On an unconfirmed result call retry_edit, not edit_document again.",
        inputSchema: z.object({base, edits: z.array(edit).min(1).max(100)}).strict(),
    }, async ({base: revision, edits}) => {
        try { return result(await session.edit(revision, edits as EditOp[])); } catch (error) { return toolError(error); }
    });
    server.registerTool("retry_edit", {
        description: "Resolve an unconfirmed conditional edit by retrying the exact same request. Do not submit a new edit until it is resolved.",
        inputSchema: z.object({}).strict(),
    }, async () => {
        try { return result(await session.retryEdit()); } catch (error) { return toolError(error); }
    });
    server.registerTool("discard_history", {
        description: "Permanently discard this participant's undo and redo history and release its old recovery reservation. Pending or uncertain edits block this operation; other participants' edits are preserved.",
        inputSchema: z.object({}).strict(),
        annotations: {destructiveHint: true},
    }, async () => {
        try { return result(await session.discardHistory()); } catch (error) { return toolError(error); }
    });
    for (const action of ["undo", "redo"] as const) {
        server.registerTool(action, {
            description: `${action} the AI participant's own history in this running session. Other participants' changes follow the existing collaboration rules.`,
            inputSchema: z.object({}).strict(),
        }, async () => {
            try { return result(await session.history(action)); } catch (error) { return toolError(error); }
        });
    }
    return server;
}
