B3a pending proposals (opt-in; no acceptance)

Set `proposals: {enabled: true}` in private hosted configuration. Existing routes and MCP tools remain unchanged. Configure a separate creator grant with `read, proposal_create`; creator grants cannot hold write/schema/owner capabilities. Configure an owner grant under the same principal with `read, proposal_read, proposal_decide`. Keep the owner token outside planner input, environment, stdio and document content.

Endpoints under the exact hosted route:
- GET `/proposals/base`: creator-only bounded generation/epoch/serverSeq/schemaVersion capture.
- POST `/proposals`: strict request UUID, exact base, one `replace_text` change (`path: [rootIndex]`, exact blockId, UTF-16 start/end, replacement), explanation, assumptions, questions, checks (`{reference,status:"unchecked"}`); optional briefDigest/supersedes.
- GET `/proposals` and `/proposals/<id>`: owner metadata/inspection, no document participant.
- POST `/proposals/<id>/reject`: owner request UUID and exact proposalDigest, no document participant.

The supported target is one canonical visible, physically root-stored unstyled text block. Nested targets, virtual/aliased/fragmented blocks, inline/span/marked text and invalid Unicode boundaries are refused. Replacement text cannot contain line separators. Capture uses an anonymous upstream wire stream, suppresses ACK, cannot send changes/presence, holds the fixed configured actor registry/journal guard, and rejects unresolved intent/pending/release checkpoints before upstream construction. Exact generation/schema/revision must remain settled throughout capture. No Doc.edit, candidate compilation, actor clock allocation, snapshot candidate, acceptance or applied history is added.

CLI: `proposal-base`, `proposal-create`, `proposal-list`, `proposal-inspect`, `proposal-reject`, with `--endpoint http://host/mcp/tenant/document/slot` and optional `--token-env VARIABLE_NAME`. Set the bearer token in that environment variable (default DOC_SYNC_PROPOSAL_TOKEN); never put it in command arguments. Create/reject use `--input /absolute/private.json` (owned mode600 regular file; no symlink/hardlink/FIFO; capped256KiB). Inspect/reject use `--id <proposalId>`. Output is bounded JSON data.

Store: private `dataDir/proposals/<hash(physicalTarget,principal)>`; permanent kernel writer lock inode; atomic fsync+rename records; strict version+canonical digests and preview invariants. Immutable create UUID retries return the prior outcome before upstream access; different payload conflicts. Reject is terminal and uses digest+decision UUID. 128 pending and256 total records; no automatic deletion. Corruption is refused and preserved. Accept endpoints and CLI do not exist. B3b, editor UI, Linux nonroot execution and production deployment remain outside this qualification.
