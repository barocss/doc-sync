# Troubleshooting

## The document uses a different schema

Compare `get_schema` with `get_server_schema`. An open editor must prepare the new binding and apply a compatible schema before it resumes. See [Change an open editor's schema](./schema-transition) and the [editor walkthroughs](./runnable-examples). Finish an active composition first. Preserve any local pending changes; do not reset the document to make a version mismatch disappear.

If a schema transition request times out, its outcome is unknown. Read `get_server_schema` and the document revision before deciding what to do next. Do not blindly submit a second transition.

## An AI edit is stale or unconfirmed

A stale base means the edit was rejected. Call `read_document`, inspect the latest content and revision, and decide on a new edit. A timeout is different: it does not show whether the server accepted the request.

While the same MCP session is alive, inspect `conditionalPending` with `read_document`. If it is true, call `retry_edit` to retry the exact request. Do not create a replacement edit while its outcome is unknown. Wait for ordinary pending operations to synchronize as well.

After a restart, use the same document ID and journal directory and call `recovery_status`. An `unknown` receipt does not mean rejection. Preserve the journal and checkpoint; they contain the evidence needed to resolve the outcome. Do not call `discard_history` as a recovery shortcut. See [AI and headless clients](./ai#recover-a-session-after-restart) for the supported recovery conditions.

## A journal is locked or unavailable

Use a different actor ID and journal directory for each concurrent agent. Keep each directory stable across its own restarts. Check directory permissions and available storage. Journal records are limited to 16 MiB. Durable MCP journals currently require macOS; `DOC_SYNC_JOURNAL=off` disables durable recovery and is appropriate only for disposable sessions. Journal files contain document content and require protection.

## The editors do not reconnect

Check that the demo server is running, the document ID and profile match, and the schema versions agree. Inspect each peer's connection and pending status. A pending count by itself is not a server acceptance receipt. Keep the process and its pending changes until synchronization or recovery resolves them. See [Synchronization](./sync) for the transport contract.

The demo server has no authentication or authorization. Do not expose it to untrusted users. See [Operations and performance](./operations-performance) for the production boundary.
