# Run a document bot

The private `apps/bot` workspace runs a bounded user-requested mission against a document. It discovers the server schema, opens an MCP participant, asks Codex for one step at a time, and submits edits through the same atomic revision check as other MCP clients. The bot can show a caret or selection when it reports a valid text position. A structural edit does not imply a caret. It keeps a local mission record and its own participant identity.

This first version runs one mission when you start it. It does not watch documents or schedule recurring work. It can inspect a same-line text range and plan text or structural edits, including blocks and tables. The MCP session checks edits against the discovered schema and current revision. Model output can still be incorrect, so review the result. Comments, external research, shared task queues, and production hosting are not implemented.

## Try a local mission

Install the workspace dependencies and start the demo:

```sh
npm install
npm run dev
```

In a second terminal at the repository root, with an authenticated Codex CLI:

```sh
npm run start --workspace @doc-sync/bot -- run \
  --url http://127.0.0.1:5410 \
  --doc bot-example \
  --actor research-bot \
  --name 'Mori' \
  --character fox \
  --personality curious \
  --role writer \
  --color '#d05626' \
  --mission 'Insert a short welcome in the first paragraph.' \
  --state-dir .doc-sync-bots \
  --max-steps 4
```

Use `--role writer`, `--role reviewer`, or `--role organizer`. A reviewer cannot submit edits through this runner. Roles do not replace server authorization. Choose a round mascot color using the compatible `--character` IDs `cat` (rose), `fox` (orange), `owl` (violet), or `robot` (mint), and `--personality` from `curious`, `careful`, `creative`, and `concise`. The role defaults to writer. If appearance or personality is omitted, the actor ID determines its defaults; two bots may share a default. Personality guides the planner's style and does not alter permissions or editing rules. The product demo shows a character in each editor while the bot is connected. Its face reflects the reported execution state: thinking, editing, happy on completion, or concerned when it needs attention. These are work states, not inferred emotions. The bot has no cursor until it knows its working position.

The planner ignores user-level Codex configuration to avoid inheriting unrelated tools; authentication still uses your account. Add `--model MODEL` if you need to select an account-supported model.

The default durable MCP journal supports macOS and Linux on a private local filesystem. Linux requires `/usr/bin/flock` from util-linux; lock failure stops startup. Add `--ephemeral true` only for a disposable session; pending edits and undo history are then not durably recoverable. Use a unique actor for every concurrent participant and keep the state directory stable. The demo server has no authentication or authorization and must not be exposed to untrusted clients.

## Keep a local bot profile

A profile keeps the bot's name, character, personality and role in a private local file. It also gives the bot a stable participant identity for each server URL and document. Use the same state directory for every task:

```sh
npm run start --workspace @doc-sync/bot -- profile-create \
  --id mori --name Mori --character fox --personality curious \
  --role writer --color '#a14418' --state-dir .doc-sync-bots

npm run start --workspace @doc-sync/bot -- run \
  --profile mori --url http://127.0.0.1:5410 --doc bot-example \
  --mission 'Add a short project summary.' --state-dir .doc-sync-bots

npm run start --workspace @doc-sync/bot -- profile-list --state-dir .doc-sync-bots
npm run start --workspace @doc-sync/bot -- profile-show --id mori --state-dir .doc-sync-bots
```

Profile IDs are unique within the state directory. Creating an existing ID fails without replacing it. The profile file contains a generated identity; preserve the state directory to keep that identity and its journal. A different server URL, document or profile gets a different participant ID. Equivalent trailing slashes are normalized, but host aliases such as `localhost` and `127.0.0.1` remain distinct. Use one canonical URL consistently.

Profile missions require the durable MCP journal and cannot use `--ephemeral true`. The journal supports macOS and Linux; Linux requires `/usr/bin/flock` from util-linux. The same profile cannot run two tasks at once on the same document; it may work on different documents. The demo can reconcile and continue supported interrupted tasks within their original step limit. An unknown receipt remains blocked. Profiles do not retain personal memory. The browser demo can also use these profiles when configured with persistent document and bot-state directories.

## Use profiles in the product demo

The profile-backed demo uses the same kernel-lock helper on macOS and Linux. Linux requires `/usr/bin/flock` from util-linux. This platform support does not by itself establish production durability. Create one or more local profiles using the commands above. From the repository root, start the demo with a fixed port and two persistent directories:

```sh
PRODUCT_ENABLE_BOTS=1 PRODUCT_BOT_MODEL=gpt-6-sol \
PRODUCT_PORT=5413 PRODUCT_DATA_DIR="$PWD/data/product-demo" \
PRODUCT_BOT_STATE_DIR="$PWD/.doc-sync-bots" npm run dev:products
```

Open `http://127.0.0.1:5413/?profile=word&doc=bot-demo&bot=1`. Select a local profile and give it a task. Multiple profiles can work on the same document, each with its own participant and history. Keep editing while they work. A structural edit does not imply a text caret.

Keep the same port and both directories when restarting. The browser restores saved profiles and the latest mission result for each profile. Open **Recent task history** to see up to 20 saved tasks for the selected bot and document, including their last saved status, steps, and any pending edit marker. All mission records remain available through `bot list`. For new profile tasks, the server reconciles an interrupted edit and resumes the same task with its remaining step budget. It reads the latest document and schema again; it does not resubmit a confirmed edit. A conservative guard can stop an intentionally repeated edit and request review. Unknown receipts and tasks without recovery evidence remain blocked. Older tasks with recovery evidence but no continuation metadata are reconciled for review, not resumed. The CLI can attempt continuation with `bot resume --id MISSION_ID --state-dir DIRECTORY`. Task history and retained step evidence may contain private information.

The loopback demo uses your Codex account and has no production authentication. Keep its data and bot-state directories private. Do not run two demo servers against the same data directory. Without `PRODUCT_BOT_STATE_DIR`, the existing opt-in demo uses temporary bot participants. Document storage is temporary unless `PRODUCT_DATA_DIR` is also set.

## Inspect a mission

```sh
npm run start --workspace @doc-sync/bot -- list --state-dir .doc-sync-bots
npm run start --workspace @doc-sync/bot -- inspect --state-dir .doc-sync-bots --id MISSION_ID
```

The state directory contains document-related data and must be protected. Without a structured brief, `completed` is model-reported completion after successful tool calls. With a brief, inspect the saved verification report and checked revision. Review the document to decide if the declared requirements cover your intent. `needs_attention` means work stopped. If a process ends with a `running` record or a pending edit, the server may already have accepted the edit. Do not rerun it blindly. See [AI recovery](./ai#recover-a-session-after-restart).

The current runner uses Codex to plan one bounded decision, then performs its text or structural edit batch itself through MCP. It limits the number of steps, planning input (512 KiB), structured batch (20 edits), and structured JSON (64 KiB). A stale revision is reread and replanned; uncertain outcomes stop for inspection. If the planner repeats the same confirmed edit without a new document revision, the runner stops and asks for inspection. This conservative guard can also stop a task that intentionally needs the same operation twice. Treat document content as untrusted. This is a local reference implementation, not an isolation or authorization boundary for a hosted bot service.

## Verify explicit requirements

Pass `--brief /absolute/path/brief.json` when starting a mission. The runner preserves the original objective and versioned brief during recovery. Before verified completion, it reads again, checks the schema fingerprint, and compares the local revision with authoritative server metadata.

```json
{
  "version": 1,
  "objective": "Keep the required section and include Confirmed exactly once.",
  "requirements": [
    {"id": "once", "kind": "text_occurrences", "path": [], "text": "Confirmed", "count": 1},
    {"id": "sections", "kind": "child_types", "path": [], "types": ["paragraph"]}
  ]
}
```

Use node types from the actual server schema. Paths follow canonical model `children` indexes. They are not editor positions or UTF-16 offsets.

| Kind | Check |
| --- | --- |
| `exact_text` | Exact text at one declared model node. |
| `node_type` | Exact node type at one declared model path. |
| `text_occurrences` | Exact non-overlapping UTF-16 matches within the selected subtree. |
| `child_types` | Exact ordered list of direct canonical child types. |
| `manual` | Retained for review; reported as `not_checked`. |

For `text_occurrences`, adjacent text runs and spans join into one sequence. Inline objects and text-node boundaries break sequences. Retained hidden table-cell content counts because the check uses the canonical model. Attributes and metadata are not text. This is exact substring matching, with no case folding or word-boundary rule.

The two new check kinds validate bounded model structure and schema shapes before evaluation. They do not validate every attribute or schema cardinality rule. Existing version-1 briefs remain supported. A failed or unchecked requirement stops the mission for attention. A passing report proves only the declared checks at its saved revision; it does not establish general document quality, provenance, placement intent, or preservation of undeclared content.

## Rust experiment

Keep the bot and human in separate actors. Bot undo removes its own edit and preserves the human edit. Deliver undo operations to peers as well as insertion operations.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{Attributes, Document, EditOptions, Key, Result, SchemaPreset};

fn main() -> Result<()> {
    let mut bot = Document::new("bot-writer", SchemaPreset::Text)?;
    let mut human = Document::new("human-writer", SchemaPreset::Text)?;
    let user_edit = human.insert_text(
        &Key::root(),
        "Human",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    let expected = human.model()?;
    let bot_edit = bot.insert_text(
        &Key::root(),
        "Bot",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    bot.apply_remote(&user_edit.ops)?;
    human.apply_remote(&bot_edit.ops)?;
    assert_eq!(bot.model()?, human.model()?);
    let undone = bot.undo()?;
    human.apply_remote(&undone.ops)?;
    assert_eq!(bot.model()?, expected);
    assert_eq!(human.model()?, expected);
    assert!(human.history_status()?.can_undo);
    Ok(())
}
```

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The bot runner still uses the TypeScript MCP path. Each bot needs its own actor and History. This native example gives two participants the same human text; only the writer records a formatting change.

Build the driver with [Run the private experiment](./rust#run-the-private-experiment), then run this from the repository root:

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"writer","actor":"writer","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"new","replica":"reviewer","actor":"reviewer","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"writer","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"human"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"apply","replica":"reviewer","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"human"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"history_record","replica":"writer","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"set","at":{"lamport":3,"actor":"writer"},"ids":[{"lamport":1,"actor":"human"}],"key":"bold","value":true}],"options":{"caretBefore":"0@~root","caretAfter":"1@human"},"now":10}
{"cmd":"history_state","replica":"reviewer"}
{"cmd":"history_undo","replica":"writer"}
JSONL
```

The reviewer has an empty History. Writer undo retains `Hi`. The driver does not broadcast between replicas: the caller must deliver shared operations. This checks History isolation, not task planning, permissions, durable missions, or bot completion.

This uses the fixed base text schema. Rust has no production editor, bot, or MCP adapter. See the [Rust engine guide](./rust) for the separate v1 through v6 capabilities and limits.

</details>
