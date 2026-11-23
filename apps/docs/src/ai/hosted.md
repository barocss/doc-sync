# Private hosted MCP

The private `apps/mcp` workspace provides an authenticated Streamable HTTP service. Each configured route has the form `/mcp/{tenant}/{document}/{slot}`. A route selects a fixed upstream document and actor. Clients cannot select another upstream through tool arguments.

This implementation supports one host and a private local filesystem. It uses static bearer tokens. It does not implement OAuth, TLS termination, or distributed session storage. Put public HTTPS and document-server authorization under your application's deployment controls. The addresses below are examples, not deployed endpoints.

## Configure and start

Use Node 22.18 or later. Build the workspace packages with `npm ci` and `npm run build`. Save the following JSON in a private regular file owned by the service user. Set its permissions to `0600`. The CLI rejects symlinks, multiple hard links, files accessible to other users, and files larger than 1 MiB.

```json
{
  "dataDir": "/absolute/private/path/doc-sync/hosted",
  "hosts": ["127.0.0.1:5411"],
  "origins": [],
  "routes": [{
    "tenant": "team",
    "document": "notes",
    "slot": "writer",
    "actor": "notes-writer",
    "upstreamDocument": "team-notes",
    "upstream": "http://127.0.0.1:5410",
    "headers": {"Authorization": "Bearer REPLACE_WITH_UPSTREAM_CREDENTIAL"}
  }],
  "grants": [{
    "id": "writer-grant",
    "principal": "team-writer",
    "token": "REPLACE_WITH_RANDOM_BASE64URL_TOKEN_AT_LEAST_32_BYTES",
    "routes": ["/mcp/team/notes/writer"],
    "permissions": ["read", "write"]
  }]
}
```

Generate the incoming token from at least 32 random bytes, for example with `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'`. Replace both credential placeholders. Remove `headers` if the upstream needs no credential. The incoming token must be base64url and 43–256 characters long. Store it as a secret.

```sh
chmod 600 /absolute/private/path/hosted.json
DOC_SYNC_HOSTED_CONFIG=/absolute/private/path/hosted.json npm run start:http --workspace=@doc-sync/mcp
```

`HOST` defaults to `127.0.0.1`; `PORT` defaults to `5411`. `hosts` is an exact allowlist of incoming Host headers, including ports. `origins` is an exact allowlist for requests that contain an Origin header; the default empty list rejects those requests. A trusted proxy must preserve or set values that match this configuration.

The upstream must be an HTTP or HTTPS origin, with no application path, query, fragment, or URL credentials. Route headers supply upstream credentials for all document requests. The incoming MCP bearer token is not forwarded. Upstream redirects are rejected, including requests for schema, SSE, edits, presence, receipts, and recovery. Protocol headers are controlled by the transport.

The service creates a `0700` data directory if needed and requires it to be private and owned by the service user. Journals use a kernel single-writer lock. Linux requires `/usr/bin/flock` from util-linux. A missing helper or failed lock stops startup. There is no automatic ephemeral fallback.

## Connect an MCP host

An MCP host sends `Authorization: Bearer <token>` to the exact configured route. Retain its `Mcp-Session-Id` for subsequent calls. This service uses JSON responses. Authenticated GET requests for an active session return HTTP 405; server notification streaming and replay are not supported.

For Codex, the remote server entry can use:

```toml
[mcp_servers.doc_sync]
url = "https://mcp.example.com/mcp/team/notes/writer"
bearer_token_env_var = "DOC_SYNC_MCP_TOKEN"
```

Set `DOC_SYNC_MCP_TOKEN` in the Codex environment. See the [official Codex MCP configuration guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The HTTPS address requires your own deployment and TLS configuration.

## Grants and isolation

A configured slot has one principal owner. Multiple grants for that principal can use different roles. All roles require `read`; `schema` also requires `write`.

| Permission | Tools |
| --- | --- |
| `read` | `get_schema`, `get_server_schema`, `read_document`, `read_document_slice`, `recovery_status` |
| `write` | `edit_document`, `retry_edit`, `undo`, `redo`, `discard_history`, `set_presence` |
| `schema` | `upgrade_schema`, `transition_schema` |

A session is bound to its grant ID, principal, route, actor, and permissions. Another grant, including a different role for the same principal, cannot reuse that session ID. The service checks authorization on POST, GET, and DELETE. A read-only grant cannot open a journal with pending edits or a pending reservation release; a write credential must resolve that recovery first.

The journal and active-session registry use the canonical tuple `[upstream origin, upstream document, actor]`. Only one active session can own that identity. Keep the data directory and route identity stable for restart recovery. Do not share this directory across service hosts.

## Limits and closure

Optional `limits` fields set positive integer bounds:

| Field | Default | Maximum |
| --- | ---: | ---: |
| `bodyBytes` | 1,048,576 | 8,388,608 |
| `sessions` | 64 | 512 |
| `perPrincipal` | 4 | 64 |
| `calls` | 8 | 64 |
| `bodyReaders` | 64 | 512 |
| `perPrincipalBodyReaders` | 4 | 64 |
| `idleMs` | 900,000 | 86,400,000 |
| `requestMs` | 30,000 | 120,000 |

`calls` limits concurrent admitted tool calls per session. The body-reader limits apply globally and per principal. Configuration supports at most 256 routes and 256 grants.

DELETE, idle expiry, and process shutdown stop admission, drain accepted work, disconnect, and close the journal. These routine paths send no upstream `leave` or recovery-reservation release. Ordinary presence expires through the document server's peer lease. The saved reservation continues to protect recovery history. Use `discard_history` only for an explicit, resolved history discard under the [existing rules](../guide/ai#discard-this-participant-s-history).

## Evidence boundary

The source includes transport, authorization, capacity, credential, restart, and lifecycle tests. A real Codex Streamable HTTP session also exercised schema read, document read, edit, and confirmation. Separate SDK restart checks preserved a human edit during the bot's own undo. These bounded checks do not establish power-loss durability, multi-host operation, or production deployment acceptance. See [status and limits](../status) for integrated evidence.
