# doc-sync MCP

This private workspace exposes one document participant through stdio or a private authenticated Streamable HTTP service. It requires Node 22.18 or later and built workspace packages.

- [Stdio and document-server connection](../docs/src/ai/server.md)
- [Hosted configuration, grants, limits, and lifecycle](../docs/src/ai/hosted.md)
- [Bounded canonical model reads](../docs/src/ai/reading.md)
- [Tools, revision checks, and durable recovery](../docs/src/guide/ai.md)

From the repository root, use `npm run start --workspace=@doc-sync/mcp` for a local stdio session. An MCP host should launch `node /absolute/path/to/apps/mcp/src/main.ts` directly to keep npm output out of its protocol stream.

For hosted mode, supply a private, owned `0600` JSON configuration file:

```sh
DOC_SYNC_HOSTED_CONFIG=/absolute/private/path/hosted.json npm run start:http --workspace=@doc-sync/mcp
```

The listener defaults to `127.0.0.1:5411`. Each configured route is `/mcp/{tenant}/{document}/{slot}` and requires its configured static bearer grant. Upstream credentials come from the service configuration. Routine session closure retains recovery reservations.

Durable journals support macOS and Linux on one host with a private local filesystem. Linux requires `/usr/bin/flock` from util-linux. Failed lock acquisition stops startup. Hosted mode has no ephemeral fallback. OAuth, TLS termination, distributed storage, and production deployment acceptance are outside this implementation.

## Pending proposals

Set `proposals: {enabled: true}` in the private hosted config to enable the HTTP-only pending-proposal service. Use separate `read, proposal_create` and `read, proposal_read, proposal_decide` grants under the same configured principal. Creator grants cannot also hold write/schema/owner capabilities. Keep owner credentials outside the planner.

The `proposal-base`, `proposal-create`, `proposal-list`, `proposal-inspect`, and `proposal-reject` commands in `apps/bot/src/main.ts` use the authenticated route with a token environment variable and private bounded JSON input. See [pending proposals](../docs/src/ai/proposals.md) for the exact request and supported plain-text scope. No accept endpoint, planner MCP adapter, document application, or editor review UI is included.

All proposal methods share global/principal admission, private records are kernel-locked and atomically replaced, and shutdown drains admitted work. Quotas are 128 pending and 256 total records per physical target/principal namespace; records are not automatically deleted. Initial anonymous capture still hydrates the upstream snapshot. Preview/response limits do not bound full-document startup memory or transport.
