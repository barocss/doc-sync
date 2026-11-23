import assert from "node:assert/strict";
import {test} from "node:test";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {DocumentSession} from "../src/session.ts";
import {createServer} from "../src/server.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {Transport} from "@barocss/doc-sync/sync";

test("SDK read_document_slice validates bounded input and reports local model scope", async () => {
    const transport: Transport & Pick<ConstructorParameters<typeof DocumentSession>[1], "submitConditional" | "getSchema" | "transitionSchema"> = {
        subscribe: () => () => {}, send: async () => {}, sendPresence: () => {},
        submitConditional: async () => { throw new Error("unused"); }, getSchema: async () => { throw new Error("unused"); }, transitionSchema: async () => { throw new Error("unused"); },
    };
    const session = new DocumentSession("sdk-slice", transport, DEMO_SCHEMA);
    session.client.doc.edit([{op: "insert", at: [0], content: Array.from({length: 15}, (_, i) => ({type: "paragraph", runs: [{text: `P${i}`, marks: {}}]}))}], {normalize: false});
    const server = createServer(session), client = new Client({name: "bounded-read-test", version: "1"});
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    try {
        assert.ok((await client.listTools()).tools.some(tool => tool.name === "read_document_slice" && tool.annotations?.readOnlyHint));
        const first = await client.callTool({name: "read_document_slice", arguments: {limit: 3}});
        assert.equal(first.isError, undefined);
        const body = first.structuredContent! as {view: string; children: unknown[]; nextCursor: string; revision: null; revisionScope: string; responseBytes: number; payloadBytes: number; budgetScope: string};
        assert.equal(body.responseBytes, Buffer.byteLength(JSON.stringify(first), "utf8"));
        assert.ok(body.payloadBytes < body.responseBytes);
        assert.equal(body.budgetScope, "mcp-tool-result-json");
        assert.equal(body.view, "model"); assert.equal(body.children.length, 3); assert.equal(body.revision, null);
        assert.match(body.revisionScope, /local replica/); assert.ok(body.nextCursor);
        const next = await client.callTool({name: "read_document_slice", arguments: {cursor: body.nextCursor}});
        assert.equal(next.isError, undefined);
        session.client.doc.edit([{op: "insert", at: [0, 0], content: "x".repeat(3000)}], {normalize: false});
        const payloadOnly = await session.readSlice({limit: 1, maxBytes: 6000});
        assert.ok(payloadOnly.responseBytes < 6000);
        const tooLarge = await client.callTool({name: "read_document_slice", arguments: {limit: 1, maxBytes: 6000}});
        assert.equal(tooLarge.isError, true);
        assert.match(JSON.stringify(tooLarge.content), /MCP tool result exceeds JSON byte budget/);
        session.client.doc.edit([{op: "insert", at: [0, 0], content: '\"\\\n한글😀\ud800'}], {normalize: false});
        const escaped = await client.callTool({name: "read_document_slice", arguments: {limit: 1, maxBytes: 15000}});
        assert.equal(escaped.isError, undefined);
        assert.equal((escaped.structuredContent as {responseBytes: number}).responseBytes, Buffer.byteLength(JSON.stringify(escaped), "utf8"));
        for (const args of [{limit: 101}, {maxBytes: 1}, {path: [999]}, {cursor: "forged"}, {unknown: true}]) {
            const invalid = await client.callTool({name: "read_document_slice", arguments: args});
            assert.equal(invalid.isError, true);
        }
    } finally { await client.close(); await server.close(); await session.close(); }
});
