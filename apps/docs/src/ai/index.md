# AI & bots

An AI edits a document as a separate participant. Browser editors and AI participants connect to the same document server. Each participant has its own actor ID and undo history. The server checks the document revision before it accepts an MCP edit.

Use [server connection](./server) for a local stdio bridge or [private hosted MCP](./hosted) for an authenticated Streamable HTTP connection. Use [bounded reads](./reading) to select part of the model. The [local walkthrough](../guide/ai-walkthrough) tests the editing flow during development.

## Connection model

```text
MCP host ── stdio ── local bridge ───────────┐
                                          │ HTTP + SSE
MCP host ── authenticated HTTP ── hosted ───┤
                                          ▼
                                   Document server
                                          ▲
Browser editors ─────── HTTP + SSE ────────┘
```

Both MCP modes use a local document replica and a private actor journal. `read_document` reads that replica; remote changes can still be in transit. `edit_document` includes the revision from a read. The document server accepts the edit only if that revision is still current.

The hosted service is a private, single-host implementation. It uses configured static bearer grants and upstream credentials. It does not provide OAuth, TLS termination, or multiple-host coordination.

## Choose a guide

| Task | Guide |
| --- | --- |
| Launch a stdio participant against an application server | [Server connection](./server) |
| Configure an authenticated remote MCP URL | [Private hosted MCP](./hosted) |
| Read canonical model children with size limits | [Bounded reads](./reading) |
| Use edit, presence, schema and recovery tools | [MCP tools and recovery](../guide/ai) |
| Run a bounded mission | [Run a document bot](../guide/bots) |
| Show bot identity and activity | [Bot identity and activity](../guide/bot-design) |
| Test AI and browser collaboration locally | [Local walkthrough](../guide/ai-walkthrough) |

## Editing contract

1. Read the document and its revision.
2. Choose an edit from that model and submit the returned revision as its base.
3. If the base is stale, read again and decide on a new edit.
4. If the result is unconfirmed, resolve the exact request with `retry_edit`. After a restart, inspect `recovery_status` with the original journal.

A confirmed result proves that the server accepted the edit and its echo reached the participant. It does not prove that the edit met the user's request. Review the result. A bot's `completed` status reports execution; it does not replace deterministic checks or human review.

[Pending document proposals](./proposals) provides an opt-in HTTP and CLI preview, storage, inspection, and rejection path. It does not apply a document edit or add an approval UI.
