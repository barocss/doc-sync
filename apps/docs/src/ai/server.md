# Connect to a document server

Connect the MCP bridge to the same application document server as the editor clients. Use the server's document ID and schema. The private `apps/mcp` workspace supplies the bridge; it is not a published hosted service.

## Current connection

An MCP host launches `apps/mcp/src/main.ts` as a stdio process. The process opens an outbound HTTP and SSE connection to the document server. The server can be remote. The bridge can run on the host machine or in a server environment where its MCP host launches it.

The current application has no Streamable HTTP MCP listener, hosted MCP URL, or remote MCP authentication flow. Pointing `DOC_SYNC_URL` at an HTTPS server changes the **document connection**. It does not change the MCP transport. The MCP specification describes [stdio and Streamable HTTP as separate transports](https://modelcontextprotocol.io/specification/latest/basic/transports).

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

The durable journal currently requires **macOS**. Startup fails on other platforms unless `DOC_SYNC_JOURNAL=off` is set. That setting creates an ephemeral session: a process exit loses its pending work and history. It is not a substitute for durable recovery in a hosted service. See [recovery details](../guide/ai#recover-a-session-after-restart).

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

The current bridge has no environment setting for authorization headers or credentials on the document HTTP connection. `NodeHttpTransport` does not accept a custom-header option. An HTTPS URL alone does not supply application authorization. A server that requires a bearer token cannot use this configuration alone; credential forwarding and document access checks need an application integration.

An actor ID identifies collaboration history. It is not an authenticated user identity. The demo server has no authentication or authorization, so it is not a deployment template for a public document service.

## Hosted remote MCP: next step

A hosted MCP service would let an MCP host connect to an authenticated MCP URL through Streamable HTTP. That requires an HTTP MCP listener, client authentication, document authorization, session and actor isolation, credential handling for the document server, and supported durable storage for each participant. These are implementation requirements, not available configuration options.

The document edit contract can remain the same: read a revision, submit a conditional edit, confirm the receipt, and preserve unresolved work. The [local walkthrough](../guide/ai-walkthrough) remains useful for testing that contract while the hosted transport is developed.
