# doc-sync bot

Each runner executes one user-requested mission at a time; separate participants may run concurrently. The runner discovers and verifies the server's schema as data, starts one real MCP stdio session, reads the document, asks Codex for a bounded next step, and submits edits through the existing server-checked MCP API. It publishes the bot's current caret before and after a text edit. Other participants use the same collaboration rules.

This is an initial local runner, not a hosted multi-tenant service or a continuously scheduled bot. A reviewer role is restricted to inspecting and reporting by the runner. Writer and organizer guide planning; the server must still enforce actual permissions. A plan can inspect a text range or submit a bounded batch of text or structural edits, then finish or ask for attention. It cannot call external services, leave comments, or monitor changes indefinitely. A maximum number of planning steps bounds each mission; the default is four and the maximum is 20. Each Codex planning call times out after two minutes. Planning input is limited to 512 KiB. The user supplies the mission: connecting alone does not authorize edits.

## Run a mission

Requirements: Node 22.18 or later; `npm ci` and `npm run build` at the repository root; an authenticated Codex CLI; and a reachable doc-sync server with a schema. The default durable MCP journal supports macOS and Linux on a private local filesystem; Linux requires `/usr/bin/flock` from util-linux. This example uses the local demo, which has no authentication or authorization; do not expose it to untrusted users.

In one terminal:

```sh
npm run dev
```

In another terminal at the repository root:

```sh
npm run start --workspace @doc-sync/bot -- run \
  --url http://127.0.0.1:5410 \
  --doc bot-example \
  --actor research-bot \
  --name 'Mori' \
  --character fox \
  --personality curious \
  --color '#d05626' \
  --mission 'Insert a short welcome in the first paragraph.' \
  --state-dir .doc-sync-bots \
  --max-steps 4
```

Use a distinct actor for every concurrent participant. To use the product demo, use its printed origin with `/profiles/word`, `/profiles/notion`, or `/profiles/presentation` as the URL and the matching document ID. The planner uses `--ignore-user-config` to avoid inheriting unrelated tools; authentication still uses your Codex account. Add `--model MODEL` if you need to select an account-supported model. The runner reads the server schema, validates its fingerprint, and verifies the connected MCP session against it. A missing, invalid, or changed schema stops the mission for inspection; it is never loaded as executable code.

Bots can use `--character cat|fox|owl|robot` and `--personality curious|careful|creative|concise`. If omitted, both are chosen deterministically from the actor ID; collisions are possible, and you can choose an explicit combination. Personality is provided to the planner as a style preference and does not change edit permissions or collaboration rules. The product demo shows each active character and a reported expression: thinking while the planner works, editing when an edit is submitted, happy after completion, and concerned when the planner requests attention. These describe execution state, not an inferred emotion. A bot without a known work position appears in the roster without a fabricated cursor. Presence is transient and disappears after the session leaves; the mission record retains the final status and expression.

The mission record appears under `.doc-sync-bots/missions/` as soon as it is queued. It contains the user mission, rejected or confirmed edit plans, their revisions, and any pending edit intent. Files are written with private permissions; protect the whole state directory as document content. The MCP journal is stored separately under `.doc-sync-bots/journals/`, keyed by server URL, document and actor. Keep the same state directory and actor to inspect the same recovery evidence. Do not run the same actor concurrently, including with different state directories.

## Structured brief and completion checks

The initial B2 CLI checks are implemented; the full stage remains in progress in the [bot roadmap](../../docs/bot-roadmap.md). Its initial contract checks exact text and node type at declared schema model paths. Paths follow model `children` indexes, not editor positions or text offsets. `exact_text` requires the whole text at that node to match; it is not a substring or occurrence-count check. A manual requirement remains unchecked. These checks do not establish general document quality.

Save this brief as `brief.json`:

```json
{
  "version": 1,
  "objective": "Set the first paragraph to the exact sentence.",
  "requirements": [
    {
      "id": "sentence",
      "kind": "exact_text",
      "path": [0],
      "text": "Confirmed exactly once."
    }
  ]
}
```

Pass the original mission and brief together:

```sh
npm run start --workspace @doc-sync/bot -- run \
  --url http://127.0.0.1:5410 --doc bot-example --actor brief-bot \
  --mission 'Set the first paragraph to exactly: Confirmed exactly once.' \
  --brief ./brief.json --state-dir .doc-sync-bots
```

The other initial requirement kinds are `node_type` with `id`, `path`, and `type`, and `manual` with `id` and `description`. Before verified completion, the runner reads the document again, verifies the schema fingerprint, and checks the requirements at a settled revision that matches authoritative server metadata. All checks must pass. A failed check or an unchecked manual requirement yields `needs_attention` with a saved report. Recovery uses the original saved brief. See HANDOFF section 5.77 for the initial test and model evidence. B2 remains in progress; see the roadmap for unimplemented check categories. This CLI change does not add a brief editor to the browser UI.

## Inspect and recover

```sh
npm run start --workspace @doc-sync/bot -- list --state-dir .doc-sync-bots
npm run start --workspace @doc-sync/bot -- inspect --state-dir .doc-sync-bots --id MISSION_ID
```

For a mission with a brief, `completed` requires passing deterministic checks, with `completion: verified` and `verification.status: passed`. A mission without a brief can still finish with `completion: model_reported` and `verification.status: not_checked`. That is the planner's report, not independent proof that the user considers the result correct. `needs_attention` means the runner stopped; inspect the mission record and document. New profile missions persist each step's exact conditional request before sending it. To reconcile and continue an interrupted mission, run `npm run start --workspace @doc-sync/bot -- resume --state-dir .doc-sync-bots --id MISSION_ID`. The product demo attempts this automatically after restart. Recovery checks the exact server receipt and protected checkpoint without sending a confirmed edit again. Continuation rereads the document and schema, retains the original task ID and step budget, and stops if the first planned edit repeats the last confirmed edit. An unknown receipt or legacy mission without the step evidence remains blocked. Do not rerun an unresolved task blindly. See the [AI and headless clients guide](../docs/src/guide/ai.md).

For a disposable session only, add `--ephemeral true` to disable the journal. This is required on non-macOS platforms for now. The mission record remains, but pending edits and history are not durably recoverable through the MCP journal. If the process stops, inspect the document and mission before deciding on any new action.

The model is asked to treat document content as data and to return one JSON plan. The runner validates the operation and uses the server's atomic revision check; a definite stale rejection triggers a reread and replanning within the step limit. A timeout, unknown result, model failure, unverified schema, or unresolved recovery stops the mission. This local demo does not provide authentication, tenant isolation, adversarial prompt-injection protection, resource quotas for a hosted service, or a production recovery guarantee. Do not grant a bot access to documents it should not be able to read or modify.

A planner may request `inspect` with explicit `at` and `focus` endpoints in the same visible text line. The selection is presence only; it does not edit the document. On a changed revision, the runner clears the numeric selection and reads again. Whole-document context does not imply a cursor or a moving scan position.

For an interactive local demo, run `PRODUCT_ENABLE_BOTS=1 PRODUCT_BOT_MODEL=gpt-6-sol npm run dev:products` and open `http://127.0.0.1:5413/?profile=word&doc=bot-demo&bot=1`. The demo is loopback-only, uses an ephemeral session and your Codex account, and is not a production service.

Use `--role writer`, `--role reviewer`, or `--role organizer`; the default is `writer`. Review-only enforcement is local to this runner and is not a server authorization policy. The CLI currently uses Codex; other planner providers must be implemented by the host.

## Persistent local profiles

Create a profile once and use the same state directory for later missions:

```sh
npm run start --workspace @doc-sync/bot -- profile-create --id mori --name Mori --character fox --personality curious --role writer --color '#a14418' --state-dir .doc-sync-bots
npm run start --workspace @doc-sync/bot -- run --profile mori --url http://127.0.0.1:5410 --doc bot-example --mission 'Add a short summary.' --state-dir .doc-sync-bots
npm run start --workspace @doc-sync/bot -- profile-list --state-dir .doc-sync-bots
npm run start --workspace @doc-sync/bot -- profile-show --id mori --state-dir .doc-sync-bots
```

Profile creation refuses to overwrite an existing ID. The profile's generated identity and a canonical server URL plus document determine its actor. Use the same state directory and canonical endpoint for recovery; `localhost` and `127.0.0.1` are different endpoints. Profile missions require the durable journal and reject ephemeral mode and identity overrides. The journal and profile claim require macOS. A process-lifetime claim protects the full profile task, including MCP startup; the runner also blocks a new profile task when an earlier task is unresolved. Use one state directory per profile. This local claim is not a server authorization boundary. The browser demo can use these profiles when started with persistent document and bot-state directories; otherwise it uses temporary participants.

The runner provides the last confirmed edit to the planner. It stops for inspection if the next plan repeats exactly the same edit against the same revision. This conservative check prevents a common duplicate edit but may also stop an intentionally repeated operation.

For the profile-backed browser demo, create profiles first, then use a fixed port and persistent data directories:

```sh
PRODUCT_ENABLE_BOTS=1 PRODUCT_BOT_MODEL=gpt-6-sol PRODUCT_PORT=5413 \
PRODUCT_DATA_DIR="$PWD/data/product-demo" PRODUCT_BOT_STATE_DIR="$PWD/.doc-sync-bots" npm run dev:products
```

Open `http://127.0.0.1:5413/?profile=word&doc=bot-demo&bot=1`. The server automatically attempts to reconcile and continue interrupted profile missions that contain continuation metadata. Unknown receipts and missions without recovery evidence stay blocked; older missions with recovery evidence are reconciled for review without continuation. Preserve both directories and use the same port on restart. Step evidence includes document content and currently remains on disk after reconciliation. This macOS/Linux development server is not authenticated; never run two instances against the same data directory.

## Experimental read-only watcher

A local process can watch one document and run a bounded reviewer mission when the server sequence advances:

```sh
npm run start --workspace @doc-sync/bot -- watch \
  --url http://127.0.0.1:5410 --doc bot-example \
  --mission 'Review the document for missing project goals and report findings.' \
  --interval 10 --max-runs 5 --state-dir .doc-sync-bots
```

The first observation establishes a baseline and does not run a review. Later changes between polls are coalesced into one review of the current document; the sequence range is a trigger, not a claim that the bot inspected only that range. Server sequence changes can include non-content events. The process prints the mission ID and result as JSON. Ctrl-C stops future polls; a review already in progress finishes before exit. The interval is 5–3600 seconds and the run limit is 1–100. Each review can call Codex and use account resources. Mission records may contain document content.

This watcher uses an ephemeral, local reviewer actor. The runner rejects reviewer edits, but the demo server does not enforce read-only access. Without `--checkpoint`, it does not persist its cursor or restore missed changes after restart. Neither mode creates proposals/comments, operates in the browser, or automatically edits documents. A server restart, schema or generation change, unavailable state, or uncertain review stops it; start it again only after inspection. Browser pending-edit recovery is a separate opt-in product feature with saved origin-local checkpoints and exact proof. The watcher does not provide that recovery.

## Hosted proposals and approval

The optional hosted [proposal HTTP/CLI path](../docs/src/ai/proposals.md) stores bounded text previews for separate owner review. It is separate from the mission planner. Configure `proposals: {enabled: true, acceptanceEnabled: true}` to allow explicit owner application; both flags default to `false`. A creator needs `read`, `proposal_create`. The separate owner needs `read`, `proposal_read` to inspect, `proposal_decide` to reject, and `proposal_accept` to approve or reconcile. A creator grant cannot hold owner or write/schema permissions. Keep owner credentials outside planner input, environment, stdio, and document content.

Set `DOC_SYNC_PROPOSAL_ENDPOINT` to the exact configured hosted route. Use `proposal-base` and `proposal-create` with the creator token. Run owner commands outside the planner environment. Inspect the exact stored target, base, preview, questions, and checks before explicit approval:

```sh
node apps/bot/src/main.ts proposal-inspect --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID
node apps/bot/src/main.ts proposal-accept --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID --input /absolute/private/approve.json
```

`approve.json` must be a private owned regular file with mode `0600`. It contains only a new decision `requestId` UUID and the exact inspected `proposalDigest`; it cannot supply edits. See the guide for a complete JSON example. No acceptance MCP tool, planner adapter, or editor approval UI is provided.

After interruption, inspect and retain the decision file and all service data. Use the same UUID, digest, and grant ID:

```sh
node apps/bot/src/main.ts proposal-reconcile --endpoint "$DOC_SYNC_PROPOSAL_ENDPOINT" --token-env DOC_SYNC_OWNER_PROPOSAL_TOKEN --id PROPOSAL_ID --input /absolute/private/approve.json
```

An accepted exact request can recover after restart without resubmission when its receipt, private evidence, protected History, and checkpoint agree, even after later foreign edits. Unsettled attempts block ordinary MCP startup, new base/capture work, and other approvals. Missing/corrupt proof and unknown receipts remain blocked. Do not resend manually or delete evidence.

Initial base mismatches become terminal `stale`; create and review a new proposal. For concurrent edits after the last base check, reconciliation can finish as `not_applied` only after the server durably seals the exact request and private checkpoint cleanup completes. No edit is resent. Unknown outcomes or incomplete proof remain blocked. Create and review a new proposal for changed content.

The initial scope is one visible plain unstyled root `MAIN` text block, with at most 16,384 source UTF-16 units and 4,096 selected/replacement units. Structure, move, mark, cell, and promotion operations are refused before journal preparation or submission. Each applied proposal has a separate undo group for the fixed configured actor. Actor MCP undo/redo requires a separate write grant, preserves other actors' edits within this scope, and does not rewrite the proposal's historical `applied` status. A human editor's undo stack is separate. B3 remains in progress; full UI, planner integration, general structural authorization, and remaining failure qualification are open. This path has no browser or actual-model proposal-acceptance claim.

### Creator-only prepared proposal slice (issue #10, partial)

`proposal-plan` is opt-in and does **not** run Codex or another model. It reads one
private structured-plan JSON file, captures one authorized root stored unstyled
text target, and stores a proposal for the separate owner review workspace. This
is not the direct-writing `run` mode, and never falls back to it.

```sh
mkdir -m 700 ./proposal-missions
# Prepare ./plan.json privately (chmod 600); do not put tokens in this file.
node apps/bot/src/main.ts proposal-plan \
  --endpoint https://example.test/mcp/tenant/document/slot \
  --token-env DOC_SYNC_PROPOSAL_TOKEN \
  --mission-file ./proposal-missions/draft.json \
  --brief 'Draft a short introduction for owner review' --path '[0]' \
  --plan-file ./plan.json
```

The environment credential must be a configured `read` + `proposal_create`
grant. Hosted configuration forbids combining this with write/schema/owner
permissions. Use a separately configured owner credential in the review workspace;
never pass it to this command or a planner. Outside numeric loopback, the new
creator client requires HTTPS and refuses redirects. The input schema is exactly:

```json
{"start":0,"end":0,"replacement":"Draft introduction.","explanation":"Prepared draft for review","assumptions":[],"questions":[],"checks":[{"reference":"Owner checks accuracy","status":"unchecked"}]}
```

`start/end` are UTF-16 offsets in the captured text (no split surrogate pairs).
One replacement is bounded to 4096 units; a target is at most 16384. Structural,
marked, virtual, missing or unsettled targets are rejected. The server rechecks
the exact base and identity during creation and later owner acceptance. Capture
is available as authenticated `POST .../proposals/target` with `{"path":[0]}`.
This provides no new owner-defined target policy; that is issue #11.

Mission intent is saved before sending. Retry the **same** mission path, brief,
path and credential after an unknown result: it resends the exact request, never
replans or refreshes the base. `created` means proposal storage acknowledged,
**not** approved, applied, or requirements verified. A changed peer base fails
closed; unknown remains unknown even for a rejected request. Owner rejection does
not cause another proposal. Owner cancel before send means do not invoke this
command. After send, use the separate owner rejection flow. A crash can leave a
`.lock`; do not delete it until the previous process and persisted attempt have
been inspected. There is no automatic force-unlock or uncertainty bypass.

The library `runProposalMission(options, planner, creatorClient)` supplies a
cloned `{brief,target}` data object to a trusted injected planner, never the client
or bearer. This is a **data boundary, not a process sandbox**: do not inject
untrusted executable code. Brief is a bounded objective string, not the full
structured brief verifier. Actual-model invocation with credential/process
isolation, conversational review integration and model quality evaluation are
not delivered by this slice. Issue #10 stays open; evaluation is tracked in #14.

### Schema interruption contract (#13)

Bounded missions never silently adopt a different schema or stored target after
planning. Treat the schema fingerprint, epoch and block identity as part of the
intent, not merely display metadata. The supported conservative workflow is:

| Observation | Action |
| --- | --- |
| New mission, schema changed before initial authorized capture | Read the currently verified target/schema. A new plan uses that actual context. Unsupported shapes/marks remain rejected. |
| Schema/target changes while an existing planner is working | Stop. Direct bounded runner retains its binding; creator stores the original request and may return unknown. Do not rebind or call it successful. |
| Create outcome unknown, including HTTP conflict | Retry/reconcile only the original request. A conflict alone does not prove an earlier application absent. No new base or request ID to escape uncertainty. |
| Stored proposal is stale, rejected or proven not_applied | Owner may review the current schema/target and explicitly renew any route policy. Creator can prepare a new linked successor with a new request and new owner review. Prior approval never transfers. |
| A prior application is unresolved | Retain exact mission, proposal and journal evidence. No fresh replan, forced unlock, history discard or schema upgrade to bypass recovery. |
| Receipt confirmed, schema later changes | Receipt remains historical evidence; it is not verification of current content. Preserve old checkpoint/history and stop any unsupported resume. |

There is no automatic compatibility migration in the AI workflow. Core/editor
explicit schema-transition APIs are a separate capability: in particular an
explicit core upgrade can send pending operations, so it is **not** a generic safe
recovery button. This workflow does not enable native-engine transitions or move
unpublished local experiments into the public contract. Fresh compatibility and
owner review must be established separately; do not infer them from an additive
schema name or a model's claim.

Keep original objective, target binding, checks, decision IDs and evidence. Do not
clear pending/history to make a new schema appear clean. A new proposal is not
permission to undo somebody else's edits. `created` and `applied` remain storage
and receipt outcomes respectively, not an actual-model quality assertion.

### Creator abstention (no proposal)

A trusted planner or private prepared plan may return exactly
`{kind:"abstain",reason:"missing_information"|"unsupported"|"uncertain",explanation:string,questions:string[]}`.
The explanation is nonblank (maximum 4,000 characters); questions are at most 16
strings of 1,000 characters each. This is not an edit or successful completion.
The runtime saves a private terminal format2 mission without a proposal/request;
resume returns `status:"abstained"` without reading the target or calling the
planner/creator again. `proposal-plan` exits 1. A changed objective requires a new
mission, not overwriting the old record. Legacy format1 edit recovery remains
supported. Actual-model invocation and quality evaluation remain unimplemented;
see `docs/reports/synthetic-proposal-evaluation-2026-11-16/README.md` for synthetic
fixtures and explicit unmeasured outcomes.

### Direct planner output limits

Before recording a direct-runner plan in pending/history, runtime validation
accepts only `action`, `at`, `text`, `count`, `message`, optional `focus`, and
optional `editsJson`. Even unused `editsJson` is limited to 64 KiB UTF-8 and
`focus` to 64 canonical indexes. The complete JSON representation must fit
96 KiB, including escaping overhead; unusually escape-heavy inputs may therefore
hit the aggregate limit before the raw string limit. Existing text, message,
position and action-specific limits still apply. This is not a sandbox for a
trusted JavaScript planner or a substitute for provider transport limits.

### Opt-in persistent reviewer checkpoint

`PersistentReviewWatch` in `src/persistent-watch.ts` offers
`open({file,binding,maxRuns}, read, review)`, `poll()`, `stop()` and `close()` for
trusted integrations. Supply an existing owned directory with mode0700 and a
64-lowercase-hex digest of the explicit nonsecret endpoint/document/task/reviewer
configuration. This digest is a caller contract, not server authorization or
proof of a model identity. No credentials should be hashed into it.

A clean checkpoint preserves the reviewed sequence and consumed budget. Before
review, an in-flight marker is synced; unfinished/blocked/stopped checkpoints
refuse automatic restart and require inspection. `stop()` is durable when
awaited. `close()` drains active work and releases the writer claim, but is not
cancellation; it leaves clean checkpoints resumable. Do not await either from
inside that watch's own read/review callback. No reset/repair API is supplied.
The supported local kernel lock is held until active work has drained, including
when it is slow or stuck. This is not distributed coordination or exactly-once
model execution. The CLI uses this API only when `--checkpoint` is supplied.


To opt the CLI in, prepare a private directory and use the same configuration on restart:

```sh
mkdir -m 700 .review-cursor
npm run start -w @doc-sync/bot -- watch \
  --url http://127.0.0.1:5410 --doc bot-example \
  --mission 'Review missing project goals.' --model YOUR_AUTHORIZED_MODEL \
  --max-runs 5 --checkpoint .review-cursor/watch.json
```

No watcher is started by installation. Running this command can call the existing
Codex planner and consume account resources; use it only for documents/connections
you authorize. A clean restart retains the cursor and total consumed run budget,
not a fresh budget. Endpoint/document/mission/model or max-runs changes refuse
reuse. Changing interval is allowed. Binding hashes are configuration identity,
not model-version proof or authorization. Default-model settings may resolve to
a different model later; pin a model when reproducibility matters. Checkpoint
mode rejects endpoint credentials, query and fragment; never put secrets in URLs.

Ctrl-C/SIGTERM prevents future polls and drains an active review before releasing
the local lock; a clean checkpoint remains resumable. Forced interruption leaves
an in-flight marker that cannot automatically rerun. Blocked/stopped checkpoints
require inspection; there is no reset/repair command. Do not delete a checkpoint
to bypass an unknown review outcome. Missed sequences trigger one review of the
current document, not historical versions. Checkpoint binding excludes the random
review actor because each read-only invocation uses a fresh ephemeral actor.
Supported local locking remains macOS/Linux only. Synthetic integration tests do
not establish real model quality, exactly-once execution or production durability.

## Offline schema-aware templates

`template-meeting --input meeting.json` emits four fact-preserving sections.
`template-project --input project.json` emits five: title, problem, objectives,
approach and successCriteria. Each input supplies an explicit document schema,
role-to-text-type mapping and all facts. Missing or unsupported input returns
`needs_input` (CLI exit 1), never inferred content. A ready result contains a
schema fingerprint, a detached draft and a deterministic completion brief.

See the [template examples](../docs/src/guide/bots.md#prepare-a-project-proposal-without-a-model-call).
Both commands are offline: no model, server write, proposal or owner approval.
Completion checks are relative to the new document root and do not establish
semantic quality or preservation of unrelated content. Multi-block drafts remain
outside the bounded single-block proposal approval path.

### Data-only model boundary (synthetic transport)

`dataOnlyProposalPlanner` in `src/proposal-model-boundary.ts` can be injected into
`runProposalMission`. It is an API-level, tested preparation for a provider adapter,
not a new CLI mode or a live model integration. No provider, account, authentication,
HTTP request or tool execution is supplied by this module.

The trusted transport receives a frozen packet containing only fixed instructions,
the original brief and bounded target text. Target path, block identity, revision,
route, mission filename and client methods are excluded. This is field minimization,
not secret detection: user-supplied brief/text still needs transmission authorization.
The response is UTF-8 JSON checked by the same local replacement/abstention rules as
the creator workflow. Extra authority fields, unsupported edits and malformed data
fail before proposal creation; a valid result still requires separate owner review.

Limits: 131,072 encoded request bytes; 65,536 response bytes; 1,024 chunks; one call
per planner instance by default (explicit maximum 8); 10-second deadline by default
(explicit maximum 30 seconds). Attempts consume the instance budget on timeout or
failure and are never automatically retried. Existing durable mission recovery
reuses a saved proposal request or abstention without another transport invocation.
These are not restart-persistent usage or billing budgets. Interruptions before
saving a decision still require a separately authorized retry policy.

The injected transport is trusted in-process code, not an isolation sandbox.
AbortSignal and iterator cleanup are cooperative: a hostile callback cannot be
force-stopped. A live adapter must independently fix an approved destination and
model, reject redirects, keep its credential in transport authentication, constrain
provider output tokens and enforce authorized data/cost limits. No live-call,
semantic-quality or production-security claim follows from synthetic tests.

### Opt-in Responses adapter (mock-qualified, no CLI activation)

`openAIProposalPlanner` implements a provider-specific request/response contract
around the data-only boundary. A trusted host must explicitly supply an authorized
API key, model and fetch implementation. The module reads no environment variables
or credential files, has no default fetch and is not selected by the existing CLI.
All qualification uses in-memory fake fetches and synthetic credentials.

The destination is fixed to `https://api.openai.com/v1/responses`; redirects are
rejected. Requests disable tools, background execution, streaming and response
storage, use a strict `decision` JSON wrapper and set `max_output_tokens` (default
1,024, maximum 4,096). A storage request flag is not a zero-retention guarantee.
This contract follows the [Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs),
checked on 2026-11-16. Live model/account compatibility has not been established.

Response parsing accepts only a completed response with one completed assistant
message containing one unannotated text decision or refusal. Extra output items,
including reasoning items, are conservatively rejected in this initial slice.
Refusals become a fixed abstention without retaining raw provider refusal text.
Truncated/error/tool outputs cannot become proposals. HTTP bodies are bounded to
262,144 bytes and 1,024 chunks, with the existing deadline and call budget applying
to fetch and body reading. Timeout does not prove provider work or charges were
canceled. Errors do not expose raw provider diagnostics. Known
provider-key reflections are rejected in outgoing body and decoded responses;
this is not detection of arbitrary secrets in user-supplied material.

Before real use, the owner must approve provider/account/model, API credential use,
exact data disclosure and a cost/call/token budget. The caller must also establish
account retention settings and live compatibility. Passing a real fetch is capable
of external transmission; this implementation is not permission to do so. Usage
budgets are not persistent across process restart. Creator/owner credentials remain
separate; creating a proposal never approves or applies it. Issue #10 and actual-model
qualification remain open.
