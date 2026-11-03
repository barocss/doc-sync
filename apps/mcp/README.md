# doc-sync MCP

This private workspace exposes one document participant through stdio or a private authenticated Streamable HTTP service. It requires Node 22.18 or later and built workspace packages.

- [Stdio and document-server connection](../docs/src/ai/server.md)
- [Hosted configuration, grants, limits, and lifecycle](../docs/src/ai/hosted.md)
- [Bounded canonical model reads](../docs/src/ai/reading.md)
- [Tools, revision checks, and durable recovery](../docs/src/guide/ai.md)

From the repository root, use `npm run start --workspace=@doc-sync/mcp` for a local stdio session. An MCP host should launch `node /absolute/path/to/apps/mcp/src/main.ts` directly to keep npm output out of its protocol stream.

Keep stdin open through initialization and tool use. The bridge buffers early
protocol bytes and owns startup lifetime before schema and journal recovery.
EOF or a termination signal requests pending-safe cleanup. A failed startup
reports its phase on stderr; it does not clear or retry an uncertain edit.
See [startup and process lifetime](../docs/src/ai/server.md#startup-and-process-lifetime)
for readiness, cleanup and cancellation limits.

For hosted mode, supply a private, owned `0600` JSON configuration file:

```sh
DOC_SYNC_HOSTED_CONFIG=/absolute/private/path/hosted.json npm run start:http --workspace=@doc-sync/mcp
```

The listener defaults to `127.0.0.1:5411`. Each configured route is `/mcp/{tenant}/{document}/{slot}` and requires its configured static bearer grant. Upstream credentials come from the service configuration. Routine session closure retains recovery reservations.

Durable journals support macOS and Linux on one host with a private local filesystem. Linux requires `/usr/bin/flock` from util-linux. Failed lock acquisition stops startup. Hosted mode has no ephemeral fallback. OAuth, TLS termination, distributed storage, and production deployment acceptance are outside this implementation.

## Proposals and owner approval

Set `proposals: {enabled: true, acceptanceEnabled: true}` in the private hosted config to enable stored proposals and explicit owner application. Both flags default to `false`. With only `enabled`, preview, inspection, and rejection remain available. Use separate grants under the same configured principal:

- Creator: `read`, `proposal_create`.
- Owner: `read`, `proposal_read`, `proposal_decide`, `proposal_accept`.

Creator grants cannot also hold write, schema, or owner capabilities. Keep owner credentials outside the planner. `proposal_accept` authorizes the stored-change path without general MCP write access. No acceptance MCP tool, planner adapter, or editor approval UI is included.

The bot CLI provides `proposal-base`, `proposal-create`, `proposal-list`, `proposal-inspect`, `proposal-reject`, `proposal-accept`, and `proposal-reconcile`. Inspect before explicit owner approval. Accept/reconcile POST bodies contain only a decision UUID and exact proposal digest; they cannot supply edits. CLI JSON inputs must be private owned regular files. See the [proposal guide](../docs/src/ai/proposals.md) for ready-to-use commands, HTTP routes, and status handling.

Approval checks the exact base and prepared CRDT operations before journal preparation or submission. Its initial scope is one visible plain unstyled text block physically stored in root `MAIN`, with 16,384 source UTF-16 units and 4,096 selected/replacement units. Structure, move, mark, cell, and promotion operations are unsupported. Preview and immutable B3a payload policy remain unchanged; approval uses a separate policy fingerprint.

An accepted exact request can recover across restart without resubmission when private evidence, receipt, protected History, and checkpoint agree, even after another actor edits. Reconcile with the original decision file and grant ID. Unsettled attempts block ordinary MCP startup, new base/capture work, and other approvals. Missing/corrupt proof and unknown receipts remain blocked; retain all files. Initial stale checks refuse application. For a later submission race, reconciliation can release the block only after the server durably seals the exact request against future application and private checkpoint cleanup finishes. The result is `not_applied`; create and approve a new proposal. Unknown outcomes, incompatible servers, changed generations, and incomplete proof remain blocked.

Each applied proposal adds one undo group to the fixed configured actor. Use a separate actor write grant for MCP undo/redo. A human editor's undo stack is separate, and actor undo/redo does not rewrite historical `applied` status.

All proposal methods share global/principal admission, private records are kernel-locked and atomically replaced, and shutdown drains admitted work. Quotas are 128 unresolved and 256 total records per physical target/principal namespace; records are not automatically deleted. Initial anonymous capture still hydrates the upstream snapshot. Preview/response limits do not bound full-document startup memory or transport. B3 remains in progress; full UI, planner integration, general structural authorization, and remaining failure qualification are open. No browser or actual-model proposal-acceptance result is claimed.
