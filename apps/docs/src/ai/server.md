# Connect to a document server

Connect the MCP bridge to the same application document server as the editor clients. Use the server's document ID and schema. The private `apps/mcp` workspace supplies the bridge; it is not a published hosted service.

Browser applications can use the [Client facade](../guide/client) with a
transport while agents keep the existing Node/MCP synchronized session. The
facade adds no MCP tool, hosted service or recovery protocol. A Client without
a transport is memory-only and does not join these server participants.

## Stdio connection

An MCP host launches `apps/mcp/src/main.ts` as a stdio process. The process opens an outbound HTTP and SSE connection to the document server. The server can be remote. The bridge can run on the host machine or in a server environment where its MCP host launches it.

Pointing `DOC_SYNC_URL` at an HTTPS server changes the **document connection**. It does not change the stdio MCP transport. For the separate authenticated Streamable HTTP listener, use [private hosted MCP](./hosted).

## Startup and process lifetime

Keep the process's stdin open while the MCP session is in use. A spawned process
is not yet a ready participant. Wait for the MCP initialize response before
sending tool calls.

The bridge owns stdin before schema import or discovery and journal recovery.
It buffers early protocol bytes with backpressure and keeps startup alive even
when that input is paused. Tools become available only after session startup
and the existing recovery checks complete. Async schema modules do not need to
keep a separate event-loop handle alive to finish importing.

Schema reads, recovery-state reads, reservation confirmation and exact pending
recovery use at most four HTTP attempts within one 10-second budget per request.
The budget includes connection, body reading and backoff. Temporary HTTP 429,
502, 503 and 504 responses and recognized connection failures can be retried.
Each retry keeps the original request identity and body. Ordinary edits and
conditional submissions do not use this automatic retry path.

An interrupted cleanup can leave both an accepted intent and the checkpoint
that already contains it. Startup verifies the exact receipt and matching
checkpoint digest and sequence, restores the saved history once, synchronizes
the current server snapshot, then clears that intent. It does not add another
undo group. Changed generations or schemas, missing protection, unknown receipts
and exhausted request retries keep recovery blocked and preserve the files.

EOF, stream closure, SIGINT and SIGTERM stop input admission and request cleanup.
Cleanup waits for the current bootstrap step or admitted operation to settle,
then closes the local stream and journal writer. It sends an ordinary participant
leave only for a ready, settled session. Uncertain edits, checkpoints and recovery
protection are retained. Startup failure does not retry an edit or delete a
journal. Restart with the same identity and journal directory, and use the
existing recovery tools to resolve an unknown result.

A failed startup exits with a nonzero status and a bounded phase diagnostic on
stderr, such as schema-discovery, journal-open, session-start or stdio-connect.
Stdout remains reserved for MCP. The Bot runner can record a known startup phase
without copying raw child stderr into a mission. Treat raw application stderr as
private; an executable schema module can emit its own error text.

Cancellation is checked between bootstrap steps. It does not interrupt executable
schema code or the internal session-start sequence. Paused input can delay EOF
observation until buffered bytes are consumed. A schema module that never settles
can still require the MCP host's process deadline or termination policy.

## Configure the document connection

Build the local packages before launching the source workspace. Use Node 22.18 or later:

```sh
npm ci
npm run build
```

The MCP host then launches Node directly. The following host configuration uses an illustrative HTTPS address. Replace it with an application server that implements the API below. It is not a public demo endpoint.

```json
{
  "mcpServers": {
    "doc-sync": {
      "command": "node",
      "args": ["/absolute/path/to/doc-sync/apps/mcp/src/main.ts"],
      "env": {
        "DOC_SYNC_URL": "https://documents.example.com",
        "DOC_SYNC_DOCUMENT": "team-document",
        "DOC_SYNC_DISCOVER_SCHEMA": "on",
        "DOC_SYNC_ACTOR": "review-agent",
        "DOC_SYNC_JOURNAL_DIR": "/absolute/private/path/doc-sync/review-agent"
      }
    }
  }
}
```

`DOC_SYNC_URL` is the document server base URL. An application prefix is allowed: `https://documents.example.com/workspace` produces requests under `/workspace/api/docs/team-document/`. Do not supply the document's `/api/docs/...` path as the base URL.

Schema discovery fetches schema data and validates its fingerprint. Leave `DOC_SYNC_SCHEMA` unset to use discovery. If you supply a schema module, it takes precedence. The server must return a verifiable schema; a schema-free server cannot satisfy discovery.

Use a distinct `DOC_SYNC_ACTOR` and a separate stable `DOC_SYNC_JOURNAL_DIR` for each concurrent participant. The default journal location is keyed by document ID, so also separate directories for independent servers. Reuse the same actor, directory and document ID after a restart.

The durable journal supports macOS and Linux on a private local filesystem on one host. Linux requires `/usr/bin/flock` from util-linux. A missing helper or failed lock stops startup; the app does not switch to an ephemeral session. Other platforms fail unless you explicitly set `DOC_SYNC_JOURNAL=off`. That setting loses pending work and history on process exit. See [recovery details](../guide/ai#recover-a-session-after-restart).

## Document server API

The bridge uses the following paths below `DOC_SYNC_URL/api/docs/{encoded-document-id}`. These are doc-sync endpoints, not MCP endpoints. An existing editor HTTP API must implement the same wire contract to serve this bridge.

| Method and path | Required behavior |
| --- | --- |
| `GET /schema` | Return schema data and its verified schema version. |
| `GET /stream` | Serve SSE synchronization events, including initial state, revision and schema checks. Accept protocol, cursor, actor, epoch and schema-version query parameters. |
| `POST /conditional` | Check epoch, server sequence and schema version atomically before accepting the exact change. Recognize an identical retry within the document epoch. |
| `POST /changes`, `POST /ack` | Accept ordinary participant changes and synchronization acknowledgments. Undo and redo use ordinary changes. |
| `POST /presence`, `POST /leave` | Update transient presence and release the participant's ordinary presence and undo pin. |
| `GET /recovery-state` | Return the document generation, epoch, sequence and schema version. |
| `POST /recovery-lease` | Reserve or release the deletion history needed by a durable checkpoint. |
| `POST /receipt` | Look up an exact conditional request. Return an accepted receipt or an unknown outcome. |
| `POST /change-receipt`, `POST /recover-change` | Inspect and atomically recover an exact ordinary pending change under its recovery reservation. |
| `POST /schema` | Check the base and install a compatible schema extension when `transition_schema` is used. |

The transport supplies doc-sync protocol, epoch and schema headers where required. Recovery needs a durable document generation, exact receipts and protected deletion history. A document reset must not reuse the previous generation. An `unknown` receipt does not prove that a request failed. Preserve the participant's journal and resolve the outcome before sending a replacement edit.

The repository's demo server implements the reference contract. Its local tests do not establish production authentication, power-loss durability or multi-server operation. See [synchronization](../guide/sync) and the [recovery plan](../reference/recovery-plan) for the contract and evidence limits.

## Credentials and access

The stdio CLI has no environment setting for custom document-server credentials. For application integrations, `NodeHttpTransport` accepts an optional fourth argument, `{headers: {...}}`. Header-bearing requests require an absolute HTTP or HTTPS base URL. Configured headers apply to schema, synchronization, edits, presence, receipts, and recovery requests. Redirects are rejected. Headerless relative URLs, including an empty base and `/profiles/word`, remain supported.

The [hosted service](./hosted) supplies upstream headers from its private configuration. It does not forward the incoming MCP bearer token. An actor ID identifies collaboration history; it is not an authenticated user identity. The demo document server has no authentication or authorization and is not a public deployment template.
