import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import type {EditOp} from "@barocss/doc-sync";
import type {DocumentSession} from "./session.ts";
import {sliceToolResult} from "./slice-result.ts";

const HISTORY_TOOL_ACTIONS = Object.freeze(["undo", "redo"] as const);


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
export type ServerOptions = {
    authorizeTool?: (name: string) => void | Promise<void>;
    runTool?: <T>(name: string, call: () => Promise<T>) => Promise<T>;
};

export function createServer(session: DocumentSession, options: ServerOptions = {}): McpServer {
    const run = async <T>(name: string, call: () => T | Promise<T>): Promise<T> => {
        const invoke = async () => { await options.authorizeTool?.(name); return call(); };
        return options.runTool ? options.runTool(name, invoke) : invoke();
    };
    const server = new McpServer({name: "doc-sync", version: "0.0.0"});
    server.registerTool("get_schema", {
        description: "Read the configured schema and whether the connected server verified its version.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, () => run("get_schema", () => result({schema: session.client.schema, verifiedAgainstServer: session.client.schemaVerified})));
    server.registerTool("get_server_schema", {
        description: "Read the authoritative server schema and its version, including after a schema transition.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, async () => run("get_server_schema", async () => {
        try { return result(await session.serverSchema()); } catch (error) { return toolError(error); }
    }));
    server.registerTool("recovery_status", {
        description: "Inspect a durable unresolved edit and any exact server receipt. Unknown never means rejected. No edit is sent by this tool.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, async () => run("recovery_status", async () => {
        try { return result(await session.recoveryStatus()); } catch (error) { return toolError(error); }
    }));
    server.registerTool("upgrade_schema", {
        description: "Install the current server schema when compatible and reconnect. Pending changes and this actor's history are preserved. Resolve an unconfirmed conditional edit first.",
        inputSchema: z.object({}).strict(),
    }, async () => run("upgrade_schema", async () => {
        try { return result(await session.upgradeSchema()); } catch (error) { return toolError(error); }
    }));
    server.registerTool("transition_schema", {
        description: "Request a compatible schema transition using an exact server epoch, sequence and schema version. Network failure leaves the outcome unknown; inspect get_server_schema before retrying.",
        inputSchema: z.object({base: base.extend({schemaVersion: z.string().min(1)}).strict(), schema: z.record(z.unknown())}).strict(),
    }, async ({base: transitionBase, schema}) => run("transition_schema", async () => {
        try { return result(await session.transitionSchema(transitionBase, schema as unknown as typeof session.client.schema)); } catch (error) { return toolError(error); }
    }));
    server.registerTool("read_document", {
        description: "Read the local replica, revision, and pending changes. Remote changes may still be in transit.",
        inputSchema: z.object({}).strict(),
        annotations: {readOnlyHint: true},
    }, async () => run("read_document", async () => {
        try { return result(await session.read()); } catch (error) { return toolError(error); }
    }));
    server.registerTool("read_document_slice", {
        description: "Read bounded canonical model children from this local replica. Paths are child indexes. Covered table-cell data is retained, as in read_document. Use nextCursor alone for the next page; any document/revision change invalidates it. Direct row/cell slicing is unsupported; target a cell body at [table,row,col,0]. maxBytes bounds successful MCP tool-result JSON including text/structuredContent duplication; JSON-RPC frames and transport headers are excluded.",
        inputSchema: z.object({path: z.array(z.number().int().nonnegative()).max(32).optional(), start: z.number().int().nonnegative().optional(),
            limit: z.number().int().min(1).max(100).optional(), maxNodes: z.number().int().min(1).max(4096).optional(),
            maxTextUnits: z.number().int().min(1).max(65536).optional(), maxBytes: z.number().int().min(1).max(262144).optional(), cursor: z.string().max(4096).optional()}).strict(),
        annotations: {readOnlyHint: true},
    }, async query => run("read_document_slice", async () => {
        try { return sliceToolResult(await session.readSlice(query)); } catch (error) { return toolError(error); }
    }));
    server.registerTool("set_presence", {
        description: "Publish the agent's actual caret or selection in the current document. Use the revision from read_document; anchor is the active end and focus is the other end. Pass null endpoints to hide. Presence is transient and delivery is unconfirmed.",
        inputSchema: z.object({base, name: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), anchor: path.min(2).nullable(), focus: path.min(2).nullable(), character: z.enum(["cat", "fox", "owl", "robot"]).optional(), expression: z.enum(["thinking", "editing", "happy", "concerned", "curious", "focused", "surprised"]).optional(), activity: z.enum(["reading", "thinking", "editing", "done", "needs_attention"]).optional()}).strict(),
    }, async ({base: revision, name, color, anchor, focus, character, expression, activity}) => run("set_presence", async () => {
        try { return result(await session.setPresence(revision, name, color, anchor, focus, character, expression, activity)); } catch (error) { return toolError(error); }
    }));
    server.registerTool("edit_document", {
        description: "Apply model edits only if the server atomically confirms the revision from read_document. On an unconfirmed result call retry_edit, not edit_document again.",
        inputSchema: z.object({base, edits: z.array(edit).min(1).max(100), stepId: z.string().uuid().optional()}).strict(),
    }, async ({base: revision, edits, stepId}) => run("edit_document", async () => {
        try { return result(await session.edit(revision, edits as EditOp[], stepId)); } catch (error) { return toolError(error); }
    }));
    server.registerTool("retry_edit", {
        description: "Resolve an unconfirmed conditional edit by retrying the exact same request. Do not submit a new edit until it is resolved.",
        inputSchema: z.object({}).strict(),
    }, async () => run("retry_edit", async () => {
        try { return result(await session.retryEdit()); } catch (error) { return toolError(error); }
    }));
    server.registerTool("discard_history", {
        description: "Permanently discard this participant's undo and redo history and release its old recovery reservation. Pending or uncertain edits block this operation; other participants' edits are preserved.",
        inputSchema: z.object({}).strict(),
        annotations: {destructiveHint: true},
    }, async () => run("discard_history", async () => {
        try { return result(await session.discardHistory()); } catch (error) { return toolError(error); }
    }));
    for (const action of HISTORY_TOOL_ACTIONS) {
        server.registerTool(action, {
            description: `${action} the AI participant's own history in this running session. Other participants' changes follow the existing collaboration rules.`,
            inputSchema: z.object({}).strict(),
        }, async () => run(action, async () => {
            try { return result(await session.history(action)); } catch (error) { return toolError(error); }
        }));
    }
    return server;
}
