# Document proposals and owner approval

The private hosted service stores a proposed text change for review. A separate owner credential can inspect, reject, or explicitly approve its exact stored change. Creation and preview do not edit the document. Approval and recovery use HTTP or CLI commands. There is no proposal MCP tool, planner integration, or editor review UI.

## Enable and separate credentials

Add the following to the [private hosted configuration](./hosted). Both options default to `false`. Enable only `enabled` if you need preview and storage without application.

```json
"proposals": {"enabled": true, "acceptanceEnabled": true}
```

Keep the same configured principal and fixed actor for the route. Use separate grants under that principal:

| Credential | Permissions |
| --- | --- |
| Creator | `read`, `proposal_create` |
| Owner inspection and rejection | `read`, `proposal_read`, `proposal_decide` |
| Owner approval and reconciliation | `read`, `proposal_accept` |

An owner grant can combine inspection, rejection, and approval permissions. A creator grant cannot also hold write, schema, owner inspection, decision, or approval permissions. Keep the owner token outside planner input, environment, stdio, and document content. An owner grant authorizes the configured action; it does not prove that a person clicked a review button.

Existing MCP tools and grants retain their meanings. Approval does not require `write`; `proposal_accept` authorizes only this stored-change path. Later actor undo/redo requires a separate `read`, `write` grant. Proposal support is disabled by default. The document upstream still requires your application's private network or authorization boundary.

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

Inspection returns the stored bounded JSON record and preview. It does not start a document participant, including when that actor has pending recovery work. Review the target, exact base, selected text, replacement, explanation, assumptions, questions, and checks before a decision. Unanswered questions and a change with identical before/after text prevent approval. Check references remain `unchecked`; approval does not verify document quality.

For rejection, save a private decision JSON file containing a new `requestId` UUID and the exact `proposalDigest`:

```sh
node apps/bot/src/main.ts proposal-reject --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID --input /absolute/private/reject.json
```

Rejection is terminal for that version. It changes proposal storage only.

## Approve the inspected change

After explicit owner approval, save `/absolute/private/approve.json` as an owned regular file with mode `0600`. Copy the exact inspected digest and use a new decision UUID. This file contains only these two fields:

```json
{
  "requestId": "2d885848-8ff7-4518-b756-07914f2a9c6c",
  "proposalDigest": "COPY_EXACT_64_CHARACTER_PROPOSAL_DIGEST"
}
```

```sh
chmod 600 /absolute/private/approve.json
node apps/bot/src/main.ts proposal-accept --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID --input /absolute/private/approve.json
```

The service derives edits from the immutable proposal. The decision cannot supply edits, an actor, an upstream, or a new base. An active same-actor session blocks approval; close your own session or wait for its owner. Approval uses the configured actor, not a human editor actor.

The service checks the exact generation, epoch, server sequence, and schema again. Any concurrent document change, including an unrelated change, can invalidate the base. A mismatch during the initial checks produces terminal `stale` without sending the proposal change. Create a new proposal with a new create UUID, a fresh base, and optional `supersedes` set to the old proposal ID. Inspect it and approve it separately. No automatic refresh or approval transfer occurs.

## Reconcile an interrupted approval

Retain the decision file, service data directory, journals, proposal records, and private attempt evidence. Keep the route identity and grant ID stable. After a timeout or restart, inspect the proposal, then use the same decision UUID, digest, and owner grant:

```sh
node apps/bot/src/main.ts proposal-reconcile --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID --input /absolute/private/approve.json
```

Reconciliation does not start a pending proposal. It checks the original approved attempt. Repeating `proposal-accept` with that exact decision also resolves an existing attempt. A different decision UUID or grant ID conflicts. Current `read` and `proposal_accept` authority is required again.

An accepted exact request can recover after service and document-server restarts without resubmission when its private evidence, server receipt, protected History, and checkpoint agree. Later changes by another actor do not require replay of the accepted change. Missing or corrupt proof, an unknown receipt, or unrelated pending actor work remains blocked for inspection. Retain the files; do not resend the change manually or delete recovery evidence to clear the block.

| Status | Meaning and next action |
| --- | --- |
| `pending` | Stored for inspection; no approval attempt yet. |
| `applying` | Approval is durable; its outcome needs inspection or reconciliation. |
| `unconfirmed` | The exact attempt is not confirmed; reconcile with the same decision. |
| `applied` | The accepted request and protected checkpoint were proven. |
| `needs_attention` | Proof or recovery is incomplete; inspect and retain evidence. Reconciliation can remain blocked. |
| `stale` | Initial base checks refused the attempt; create and review a new proposal. |
| `rejected` | Owner rejected this immutable version; no proposal edit was sent. |
| `not_applied` | The server durably sealed the exact request against application, and local recovery cleanup finished. Create and review a new proposal. |

If another actor edits between the last base check and submission, reconcile the original attempt. The service asks the server to settle the exact request. An accepted request follows accepted-request recovery. A negative result is safe only after the server has durably recorded a seal that prevents that change from applying later, including after restart. A stale HTTP response or an absent receipt alone is insufficient.

For a sealed request, the service records private proof and a checkpoint retirement plan before cleanup. It preserves the actor sequence, confirmed History, protection reservation, and document content. It retires the unused operation IDs, saves the checkpoint, then clears only the matching pending intent. Interrupted cleanup resumes from the same plan. The terminal result is `not_applied`; it releases this attempt's startup block without resending or refreshing the proposal. A new change still requires a new proposal and owner approval.

The document server must support `/settle-conditional`; the Node adapter cannot infer negative proof from an older server. The service also rechecks generation, schema, and the original protection reservation before cleanup.

An unknown result, unsupported server, changed generation, invalid proof, storage failure, or unrelated pending checkpoint keeps the attempt blocked. Retain its evidence and reconcile again after resolving the cause. This is not a universal automatic unblock.

Unsettled `applying`, `unconfirmed`, or `needs_attention` attempts block ordinary MCP session startup, new base/capture work, and approval of another proposal for that actor. Stored inspection remains available. Resolve the original attempt first; generic MCP recovery cannot bypass this gate.

## HTTP API

Use the configured route, for example `/mcp/team/notes/writer`, plus the suffix below. Send its bearer credential. POST bodies are JSON; accept and reconcile use only the decision UUID and exact proposal digest shown above.

| Method and route suffix | Required permissions |
| --- | --- |
| `GET /proposals/base` | `read`, `proposal_create` |
| `POST /proposals` | `read`, `proposal_create` |
| `GET /proposals` | `read`, `proposal_read` |
| `GET /proposals/PROPOSAL_ID` | `read`, `proposal_read` |
| `POST /proposals/PROPOSAL_ID/reject` | `read`, `proposal_decide` |
| `POST /proposals/PROPOSAL_ID/accept` | `read`, `proposal_accept` |
| `POST /proposals/PROPOSAL_ID/reconcile` | `read`, `proposal_accept` |

## Actor History

Each applied proposal forms a separate undo group for the configured actor. Two approved changes require two undo calls. Reconnect that actor with its separate write credential to use the existing MCP `undo` and `redo` tools. Actor undo preserves another actor's edits within the supported scope. Undo and redo do not rewrite the proposal's historical `applied` status. A human editor's undo stack is separate.

## Supported scope and limits

The target must be one visible, unstyled text block physically stored in the root `MAIN` line. Nested, virtual, required-slot, aliased, fragmented, inline, span, and marked targets are refused. Source text is limited to 16,384 UTF-16 units; selected and replacement text to 4,096 units each. Scalar boundaries must be valid, and replacement text cannot contain line separators. Check references remain `unchecked`.

Approval validates the exact prepared CRDT operations before journal preparation or submission. Structural, move, mark, cell, and promotion operations are outside this scope. The original preview policy and immutable payload remain unchanged; approval has a separate policy fingerprint.

The private store uses a separate namespace derived from the physical target and principal, a permanent kernel writer lock, strict versioned digests, and fsync/rename records. It allows 128 unresolved and 256 total records per namespace. Quota exhaustion blocks creation; it does not delete records. Input and response JSON are capped at 256 KiB. Private attempt evidence and negative retirement plans share a separate 256-file lifetime limit; each file is capped at 16 MiB. Recovery can reach that limit before the proposal-record quota. Files remain available for inspection; quota exhaustion does not discard pending work. All proposal methods share global and principal request admission, and shutdown drains admitted work.

Capture uses an anonymous upstream wire stream. It sends no ACK, change, presence, recovery lease, or fixed-actor disconnect. Existing pending intents, checkpoint changes, and release work block capture. Initial synchronization still hydrates the upstream snapshot: bounded previews do not bound total-document transport or startup memory.

These checks do not establish physical power-loss durability, distributed operation, public production security, or full B3 completion. Full editor UI, planner integration, general structural authorization, and remaining failure qualification remain on the [roadmap](../roadmap). B3 remains in progress. No browser or actual-model proposal-acceptance result is established here.
