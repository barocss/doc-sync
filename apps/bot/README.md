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

This watcher uses an ephemeral, local reviewer actor. The runner rejects reviewer edits, but the demo server does not enforce read-only access. It does not persist its cursor, restore missed changes after a watcher restart, create proposals or comments, operate in the browser, or automatically edit documents. A server restart, schema or generation change, unavailable state, or uncertain review stops it; start it again only after inspection. Browser pending-edit recovery is a separate opt-in product feature with saved origin-local checkpoints and exact proof. The watcher does not provide that recovery.

The optional hosted [pending-proposal HTTP/CLI path](../docs/src/ai/proposals.md) can store bounded text previews for a separate owner to inspect or reject. It is separate from the mission planner and does not apply a proposal.
