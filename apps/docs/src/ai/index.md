# AI & bots

An AI edits a document as a separate participant. Browser editors and AI participants connect to the same document server. Each participant has its own actor ID and undo history. The server checks the document revision before it accepts an MCP edit.

Start with [connect to a document server](./server). Use the [local walkthrough](../guide/ai-walkthrough) to test the editing flow during development.

## Connection model

```text
AI application / MCP host
          │ MCP over stdio
          ▼
doc-sync MCP bridge ─── HTTP requests + SSE ───┐
          │                                   ▼
    private journal                   Document server
    for this actor                    schema + accepted changes
                                              ▲
Browser editor clients ─── HTTP + SSE ─────────┘
```

The document server accepts and orders changes. Each editor and MCP bridge has a local document replica. `read_document` reads the bridge's replica; remote changes can still be in transit. `edit_document` includes the revision from that read. The server accepts the edit only if that revision is still current.

The MCP connection and document synchronization use separate transports. The current bridge exposes MCP through stdio. It connects to a document server through `NodeHttpTransport`. A remote document server does not make the bridge a hosted remote MCP service.

## Choose a guide

| Task | Guide |
| --- | --- |
| Connect an AI participant to an application document server | [Server connection](./server) |
| Use MCP read, edit, presence, schema and recovery tools | [MCP tools and recovery](../guide/ai) |
| Run a bounded mission through the reference bot runner | [Run a document bot](../guide/bots) |
| Show a bot's identity and current activity | [Bot identity and activity](../guide/bot-design) |
| Test Codex and browser editors on one local document | [Local collaboration walkthrough](../guide/ai-walkthrough) |

## Editing contract

1. Read the document and its revision.
2. Choose an edit from that model and submit the returned revision as its base.
3. If the base is stale, read again and decide on a new edit.
4. If the result is unconfirmed, resolve the exact request with `retry_edit`. After a restart, inspect `recovery_status` with the original journal.

A confirmed result proves that the server accepted the edit and its echo reached the participant. It does not prove that the edit met the user's request. Review the resulting document. A bot's `completed` status reports its execution result; it does not replace that review.
