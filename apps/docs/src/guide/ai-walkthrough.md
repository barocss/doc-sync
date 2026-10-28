# Try AI and user editing together

This walkthrough connects one Codex MCP participant and the three browser editors to the same local Word-style document. A browser user and the AI keep separate actor IDs and separate undo histories. The server checks the AI's edit against the exact revision it read.

The commands use an isolated demo document. The demo server has no authentication; use it only on your own machine. This walkthrough disables the MCP journal for portability. Pending work and AI history are then lost if the MCP process exits. For durable macOS recovery, use a stable private journal directory instead; see [recover a session](./ai#recover-a-session-after-restart).

## 1. Open the shared document

Start the product demo as shown in [run the editor examples](./runnable-examples#start-the-demo). Open:

```text
http://127.0.0.1:5413/?profile=word&doc=mcp-walkthrough
```

Wait until all three panels are online. In the Slate panel, add ` HUMAN` to the end of `Opening text`. Check that the other two panels show the same text.

## 2. Connect Codex to the MCP server

In Codex, configure a local stdio MCP server. The following TOML uses the Word-style schema exported by the checkout. Replace both `/absolute/path/to/doc-sync` paths with the absolute path to your checkout. Use the demo's printed port if it is not `5413`.

```toml
[mcp_servers.doc_sync]
command = "node"
args = ["/absolute/path/to/doc-sync/apps/mcp/src/main.ts"]

[mcp_servers.doc_sync.env]
DOC_SYNC_URL = "http://127.0.0.1:5413/profiles/word"
DOC_SYNC_DOCUMENT = "mcp-walkthrough"
DOC_SYNC_ACTOR = "ai-walkthrough"
DOC_SYNC_SCHEMA = "/absolute/path/to/doc-sync/apps/demo/products/word-schema.mjs"
DOC_SYNC_JOURNAL = "off"
```

This is a configuration example, not a command that changes your settings. The host must launch Node 22.18 or later. Codex supports project-scoped or user-level configuration; see the [official Codex MCP configuration guide](https://developers.openai.com/codex/mcp/). Restart or reload the host as required by your setup, and verify that the `doc_sync` tools are available. Follow your host's normal approval prompts for edit tools.

For more than one AI participant, use a unique `DOC_SYNC_ACTOR` for each process. With durable journals enabled, use a separate stable `DOC_SYNC_JOURNAL_DIR` for each independent actor and server.

## 3. Ask the AI to edit

In the same Codex session, ask:

```text
Use only the doc_sync MCP tools. Read the document. Insert "AI: " at the start
of the paragraph that contains "Opening text". Read again and report the edit
status. This is a local test document.
```

The AI should call `read_document`, choose the path from that model and pass its returned `revision` as `base` to `edit_document`. A `confirmed` result means the server accepted the exact edit and its echo reached the session. The expected paragraph in all panels is `AI: Opening text HUMAN`. The text and whitespace depend on the prompt and your earlier browser input; inspect the model if they differ.

While the same MCP session remains open, ask the AI to call `undo`, read the document, call `redo`, and read again. Its undo should remove its own insertion and leave the browser user's ` HUMAN` text. Redo should restore the AI insertion. Do not restart an ephemeral MCP session between these steps and expect its history to survive.

## 4. Try a stale revision

1. Ask the AI to call `read_document`, show its `revision`, and wait without editing.
2. In the browser, make another edit and wait until the panels converge.
3. Ask the AI to attempt an edit using the **saved old revision**.

The client or server can reject the stale base. Ask the AI to read again and decide whether a new edit is still appropriate. The version check prevents applying an edit against an outdated model; it does not determine the author's intent.

If an edit is `unconfirmed`, do not submit a replacement operation. While the session remains alive, use `retry_edit` for that exact request. If recovery is required after a restart, use `recovery_status` and retain the journal. `unknown` is not proof of failure. See [troubleshooting](./troubleshooting#an-ai-edit-is-stale-or-unconfirmed).

## What this example proves

The repository has exercised actual Codex MCP edits and browser editors together in a bounded local test. This exercise is not evidence of production authorization, real OS IME, reliable recovery with the journal disabled, or all possible concurrent editing intents. For the exact test scope and limits, see [status and limits](../status).
