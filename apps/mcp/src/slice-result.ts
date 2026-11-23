/** Bound successful MCP tool results, including text/structuredContent duplication. */
export function sliceToolResult(data: Record<string, unknown> & {responseBytes: number; byteBudget: number}) {
    const payload = {...data, payloadBytes: data.responseBytes, responseBytes: 0,
        budgetScope: "mcp-tool-result-json", byteScopeExcludes: "JSON-RPC frame and transport headers"};
    for (let i = 0; i < 8; i++) {
        const reply = {content: [{type: "text" as const, text: JSON.stringify(payload)}], structuredContent: payload};
        const bytes = Buffer.byteLength(JSON.stringify(reply), "utf8");
        if (payload.responseBytes === bytes) {
            if (bytes > data.byteBudget) throw new Error("MCP tool result exceeds JSON byte budget");
            return reply;
        }
        payload.responseBytes = bytes;
    }
    throw new Error("MCP tool result byte count did not stabilize");
}
