# Pending document proposals

The private hosted service can store a proposed text change without applying it. A separate owner credential can list, inspect, and reject proposals. This is an opt-in HTTP and CLI feature. The bot planner has no proposal MCP adapter yet, and no acceptance endpoint or editor review UI is provided.

## Enable and separate credentials

Add `"proposals": {"enabled": true}` to the [private hosted configuration](./hosted). Keep the same configured principal and actor for the route. Use separate grants under that principal:

| Credential | Permissions |
| --- | --- |
| Creator | `read`, `proposal_create` |
| Owner | `read`, `proposal_read`, `proposal_decide` |

A creator grant cannot also hold write, schema, owner inspection, or decision permissions. Keep the owner token outside planner input, environment, stdio, and document content. An owner grant authorizes the configured action; it does not prove that a person clicked a review button.

Existing MCP tools and grants retain their meanings. Proposal support is disabled by default. The document upstream still requires your application's private network or authorization boundary.

## Create a pending proposal

Set the exact configured route as `DOC_SYNC_PROPOSAL_ENDPOINT`, and set the creator token in `DOC_SYNC_PROPOSAL_TOKEN`. Tokens are read from an environment variable and are not command arguments.

```sh
node apps/bot/src/main.ts proposal-base --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT"
```

This returns `generation`, `epoch`, `serverSeq`, and `schemaVersion`. Read the target through the existing schema and document tools. Use a root child path and its exact `blockId` from `read_document_slice`. The read's epoch, sequence, and schema must match the base; reread if they differ. Close a same-slot MCP session before creating a proposal, or use a separately configured observer actor for long-lived reads. The service returns busy rather than taking an active actor.

Create a private owned regular JSON file with mode `0600`. Replace every copied value below with the matching base and target. The UUID identifies this create request; use a new UUID for changed content or a refreshed base.

```json
{
  "requestId": "d973b26b-217a-4bfe-bf71-62b243a5cf0f",
  "base": {
    "generation": "COPY_GENERATION",
    "epoch": "COPY_EPOCH",
    "serverSeq": 0,
    "schemaVersion": "COPY_SCHEMA_VERSION"
  },
  "change": {
    "kind": "replace_text",
    "path": [1],
    "blockId": "COPY_BLOCK_ID",
    "start": 0,
    "end": 0,
    "replacement": "Proposed opening: "
  },
  "explanation": "Suggest a clearer opening for owner review.",
  "assumptions": [],
  "questions": [],
  "checks": []
}
```

```sh
node apps/bot/src/main.ts proposal-create --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --input /absolute/private/proposal.json
```

The response contains `id`, `status`, and `proposalDigest`. A matching retry of the same UUID returns the stored outcome before accessing the upstream document. A changed payload under that UUID conflicts. Creation and preview do not compile or submit CRDT operations, allocate a live actor sequence, or add document History.

## Inspect or reject

Run owner commands outside the planner environment. Select the owner token variable with `--token-env`:

```sh
node apps/bot/src/main.ts proposal-list --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN
node apps/bot/src/main.ts proposal-inspect --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID
```

Inspection returns the stored bounded JSON record and preview. It does not start a document participant, including when that actor has pending recovery work. To reject, save a private decision JSON file containing a new `requestId` UUID and the exact `proposalDigest`:

```sh
node apps/bot/src/main.ts proposal-reject --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID --input /absolute/private/reject.json
```

Rejection is terminal for that version. It changes proposal storage only. There is no accept command, automatic stale refresh, or document rollback.

## Supported scope and limits

The target must be one visible, physically root-stored text block with unstyled text. Nested, virtual, required-slot, aliased, fragmented, inline, span, and marked targets are refused. Source text is limited to 16,384 UTF-16 units; selected and replacement text to 4,096 units each. Scalar boundaries must be valid, and replacement text cannot contain line separators. Check references remain `unchecked`.

The private store uses a separate namespace derived from the physical target and principal, a permanent kernel writer lock, strict versioned digests, and fsync/rename records. It allows 128 pending and 256 total records per namespace. Quota exhaustion blocks creation; it does not delete records. Input and response JSON are capped at 256 KiB. All proposal methods share global and principal request admission, and shutdown drains admitted work.

Capture uses an anonymous upstream wire stream. It sends no ACK, change, presence, recovery lease, or fixed-actor disconnect. Existing pending intents, checkpoint changes, and release work block capture. Initial synchronization still hydrates the upstream snapshot: bounded previews do not bound total-document transport or startup memory.

These checks do not establish physical power-loss durability, distributed operation, public production security, or full B3 completion. Acceptance, structural scope authorization, planner integration, and editor controls remain on the [roadmap](../roadmap).
