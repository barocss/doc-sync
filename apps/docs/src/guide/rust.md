# Rust engine

The private native SDK has separate APIs for Document, Graphic and Spreadsheet.
These are native Cargo APIs. They are not browser engines or public `Client`
implementations. The WASM adapter still provides UTF-16 storage only.

## Choose an engine for a graphic editor

| Path | Available now | Integration limit |
| --- | --- | --- |
| TypeScript Client | Document and graphic schemas, built-in graphic nodes, local/synchronized History | The private PixiJS demo renders the earlier basic canvas profile. |
| Native Rust `Document` | Six fixed document presets, peer operations, History, selection and checkpoints | Preset API; custom flat documents use `RuntimeDocument`. No editor binding. |
| Native Rust `GraphicDocument` | Fixed `Canvas` and 17-node `Builtins` profiles, attributes, moves, History and checkpoints | Custom container/text/atom schemas use `RuntimeDocument`. No graphic selection, renderer, exact wire/exchange qualification or Client factory. |
| Native Rust `SparseSheet` | Fixed numeric axes, sparse field registers, local undo/redo, pending operations and checkpoint restore | Private S1 experiment; no stable structural axes, formula engine or public Client integration. |
| Native Rust `RuntimeDocument` / `RuntimeSheet` | Supported user-defined descriptors, owned schema identity, History and checkpoint replay | Limited runtime subset; no live transition, renderer, Client or WASM adapter. |
| Storage-only WASM | UTF-16 storage initialization, splice, read and clear | No document/graphic/sheet CRDT, History or editor binding contract. |

`SchemaPreset::Shapes` is the pinned **document** group/inline/span fixture.
Graphic objects use `GraphicDocument`, not that preset. `GraphicPreset::Canvas`
uses the earlier `fixtures/graphic-canvas-schema.ts` profile.
`GraphicPreset::Builtins` uses a pinned manifest equal to the frozen TypeScript
`createGraphicSchema()` contract. These are compiled profiles. The native SDK
preset APIs do not accept runtime descriptors. Use the separate
[runtime custom schema APIs](#runtime-custom-schemas) for the supported subset.

The native Canvas comparison qualifies normalized models and History across
20 actions and 40 states. The native Builtins comparison covers 35 independently
authored actions and 70 actor states, with normalized model/History equality
and exact manifest equality. The earlier domain checkpoint had 42 SDK tests and 75 shadow-core tests.
The custom-schema checkpoint passes 48 SDK tests and 78 shadow-core tests.
The sparse-sheet comparison qualifies exact operations,
models, full History, pending queues and checkpoints across 31 actions and 62
states. These bounded checks do not establish graphic exact wire compatibility,
mixed-runtime network delivery, browser support or performance.

A Rust browser backend still needs the remaining schema/compiler support, the full
WASM document API, a production client factory and an engine-independent scene
adapter. It then needs mixed-runtime peer, browser and performance checks. See
[the delivery queue](#ordered-delivery-work). Current
[graphic performance](../performance#graphic-canvas-demo) is a TypeScript baseline.
No matched Rust/WASM canvas measurement is available.


Rust now has an experimental **native SDK** that Rust applications can call
directly. It is a private Cargo crate in this checkout, not a crates.io release.
The production server, browser clients, MCP path, and editor bindings still use
TypeScript. The native SDK does not yet replace those integrations.

The five-package npm layout and the production client/engine selection seam are
implemented. `SyncClient` accepts `ClientEngineFactory` and uses
`typescriptClientEngineFactory` by default. The selected engine drives the common
editor host and input sessions. The older immutable `typescriptEngine` API is a
separate document experiment and is not a production client factory. Routing, regression and conversion-count checks pass. Repeated/pooled Node and controlled Chrome timing qualify the client migration.
Original separate-server and small-block crossings remain reported; general
product-latency acceptance remains open. See [status and limits](../status).

Only TypeScript ships on this production path. The native Rust SDK is a separate
API. There is no Rust/WASM production factory, cross-engine checkpoint converter,
or live engine switch. Legacy TypeScript Doc/History access remains an optional
compatibility extension. See [Packages and engines](./packages#engine-selection-is-a-separate-milestone)
for the constructor option and current boundary.

For browser integration, [Client](./client) selects local or synchronized
session behavior through its optional transport. It still uses the production
TypeScript engine. `syncOptions.engineFactory` applies only to the sync backend;
no Rust/WASM factory ships. TypeScript local capture/open uses its own
[versioned local state](./local-storage); it cannot restore native Rust checkpoints. The native SDK and storage-only WASM API below do
not implement the Client or editor binding contracts.

## Runtime custom schemas

The private native SDK has separate runtime APIs. `RuntimeSchema::compile`
loads a supported tree descriptor into immutable per-document tables.
`RuntimeDocument` uses those tables for validation, projection, History and
checkpoint restore. `SpreadsheetSchema::compile` and `RuntimeSheet` provide
a separate sparse field registry. They do not use a fixed enum of cell fields.

Add `serde_json = "1"` beside the Cargo path dependency above to run this
complete program. It creates a custom graphic card, synchronizes two native
actors, restores pending work, and edits a custom sheet field:

<!-- runtime-custom-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "domain": "graphic", "root": "board", "marks": [],
        "nodes": {
            "board": {"shape": "container", "children": ["card"]},
            "card": {"shape": "atom", "attrs": {
                "title": {"default": "Untitled"},
                "priority": {"default": 0, "min": 0, "max": 5}
            }}
        }
    }))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let (card, birth) = a.insert(
        "card",
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.0,
    )?;
    b.apply_remote(&birth.ops)?;
    let change = a.set_attribute(&card, "priority", json!(3), EditOptions::default(), 2.0)?;
    b.apply_remote(&change.ops)?;
    let saved = a.checkpoint()?.to_json()?;
    let mut restored = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(restored.model()?, b.model()?);
    assert_eq!(restored.pending_changes(), a.pending_changes());

    let schema = SpreadsheetSchema::compile(json!({
        "domain": "spreadsheet", "version": 1,
        "fields": {"score": {"type": "number", "default": 0, "min": 0, "max": 100}}
    }))?;
    let mut sheet = RuntimeSheet::new(RuntimeSheetOptions {
        actor: "A".into(),
        sheet_id: "scores".into(),
        rows: 100,
        columns: 20,
        schema,
    })?;
    assert_eq!(
        sheet.get_cell_value(2, 3, "score")?,
        RuntimeValue::Number(0.0)
    );
    sheet.set_cell(
        2,
        3,
        RuntimeCellPatch::from([("score".into(), RuntimeValue::Number(42.0))]),
    )?;
    let restored = RuntimeSheet::from_state(sheet.checkpoint().to_value())?;
    assert_eq!(
        restored.get_cell_value(2, 3, "score")?,
        RuntimeValue::Number(42.0)
    );
    assert_eq!(restored.pending_changes(), sheet.pending_changes());
    println!("PASS: custom graphic peer/checkpoint; custom sheet defaults/checkpoint");
    Ok(())
}
```

From this repository, run the checked example with:

```sh
cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_quickstart
node experiments/runtime-schema-native/compare.mjs
```

The comparison harness independently authors TypeScript and Rust actions from
six runtime descriptors in one native build/process. Tree comparison normalizes
models and compares History availability; it does not prove exact tree wire
exchange. Sheet comparison includes exact operations, pending, journal, History
and checkpoints. Invalid Document operation tests call the TypeScript
`Doc.check` preflight; raw low-level `Doc.edit` does not perform that same check.

| Domain | Runtime support | Rejected or missing |
| --- | --- | --- |
| Document | Flat root flow, renamed text/atom types, scalar attributes, boolean marks | Nested flow/grid/group/inline/span, value marks, structured document attributes and advanced rules |
| Graphic | Container/text/atom, names, supported attributes/field registers, boolean marks | Flow/grid children, value marks, renderers and graphic selection |
| Spreadsheet | Arbitrary scalar fields, constraints, defaults, schema identity, History and checkpoint replay | Structural axes, formula calculation, GC and Client integration |

Unsupported descriptors fail with a schema path before replica creation.
Native tree descriptors also reject integer JSON tokens that JavaScript Number
cannot represent exactly. This prevents different retained defaults from sharing
a schema identity after numeric rounding.
Schema descriptors and identities are retained in checkpoints; a foreign schema
cannot be restored into an existing runtime document. JSON replay validation
checks consistency, not storage authenticity. Protect stored checkpoints in
your application. Restoring an actor must replace its old process; do not keep
two active replicas with the same actor identity.

These APIs do not change the production TypeScript client path, install browser
bindings or provide a WASM engine. Live runtime schema transition remains open.
See [custom data and editor mappings](../schemas/custom).

## Use the native Rust SDK

The crate is `doc-sync-native-sdk` at `experiments/rust-sdk`. Another Rust crate
can use a Cargo path dependency pointing to that directory in its checkout.
The SDK calls the existing native semantic core in process; it does not launch
the JSONL driver.

Create a consumer crate outside this repository. Replace `/absolute/path/to/doc-sync`
with your checkout path. Add this entry to the consumer's `Cargo.toml`:

```toml
[dependencies]
doc-sync-native-sdk = { path = "/absolute/path/to/doc-sync/experiments/rust-sdk" }
```

For example, create it with `cargo new /tmp/doc-sync-native-example`. Put the
program below in `/tmp/doc-sync-native-example/src/main.rs`, add the dependency,
and run `cargo run --manifest-path /tmp/doc-sync-native-example/Cargo.toml`.
Use a Rust toolchain that can build the crate's locked dependencies. No npm
build or JSONL process is required for this native application.

This example creates two documents, sends a local change to a peer, and sends
an undo through the same operation path:

```rust
use doc_sync_native_sdk::{
    Attributes, Document, EditOptions, Key, Result, SchemaPreset,
};

fn main() -> Result<()> {
    let mut alice = Document::new("alice", SchemaPreset::Text)?;
    let mut bob = Document::new("bob", SchemaPreset::Text)?;

    let change = alice.insert_text(
        &Key::root(), "Hello", Attributes::new(), EditOptions::default(), 0.0,
    )?;
    bob.apply_remote(&change.ops)?;
    assert_eq!(alice.model()?, bob.model()?);

    let undo = alice.undo()?;
    bob.apply_remote(&undo.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    Ok(())
}
```

`0.0` is the explicit local History time in milliseconds for this example.
Applications supply their own monotonic ordering of input times for typing
grouping. Each local result contains the exact operations that the host must
deliver; the SDK does not provide network delivery or server acknowledgements.

From the repository root, run the complete checked example, which also covers
concurrent authors, checkpoint restart, duplicate replay, undo, and redo:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" CARGO_TARGET_DIR=output/r4-sdk-target "$(rustup which --toolchain stable cargo)" run --offline --manifest-path experiments/rust-sdk/Cargo.toml --example two_actors
```

It prints `converged: BA`, `after alice undo and restart: B`, and
`after alice redo: BA`. Offline commands require the locked dependencies in
the local Cargo cache.

### Native graphic example

This separate program uses the fixed native canvas profile. Deliver each returned
change through the host transport. The SDK does not provide a network server.

<!-- native-graphic-example -->
```rust
use doc_sync_native_sdk::{Attributes, EditOptions, GraphicDocument, GraphicKind, Result};

fn main() -> Result<()> {
    let mut alice = GraphicDocument::new("alice")?;
    let mut bob = GraphicDocument::new("bob")?;
    let (_, change) = alice.insert(
        GraphicKind::Rectangle, None, None, Attributes::new(),
        EditOptions::default(), 0.0,
    )?;
    bob.apply_remote(&change.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    let checkpoint = alice.checkpoint()?;
    let mut reopened = GraphicDocument::restore(&checkpoint)?;
    assert_eq!(reopened.model()?, alice.model()?);
    Ok(())
}
```

### Native built-in graphic example

Select the built-in profile explicitly. This example stores a path and a vertex,
then edits one handle field. It does not render or evaluate that path.

<!-- native-builtin-example -->
```rust
use doc_sync_native_sdk::{
    Attributes, EditOptions, GraphicDocument, GraphicKind, GraphicPreset, Result,
};

fn main() -> Result<()> {
    let mut doc = GraphicDocument::with_preset("alice", GraphicPreset::Builtins)?;
    assert_eq!(doc.preset(), GraphicPreset::Builtins);
    assert_eq!(doc.active_schema_identity(), GraphicPreset::Builtins.identity());
    let (path, _) = doc.insert(
        GraphicKind::Path, None, None, Attributes::new(),
        EditOptions::default(), 0.0,
    )?;
    let (vertex, _) = doc.insert(
        GraphicKind::Vertex, Some(&path), None, Attributes::new(),
        EditOptions::default(), 1.0,
    )?;
    doc.set_field(&vertex, "handleOut", "x", 20.into(), EditOptions::default(), 2.0)?;
    let model = doc.model()?;
    assert_eq!(model.children[0].children[0].attrs["handleOut"]["x"], 20);
    Ok(())
}
```

`GraphicPreset::manifest()` returns that preset's compiled schema data.
`GraphicDocument::new()` remains the basic Canvas constructor. Builtins also
stores paints, strokes, components, instances, references, atomic override
assignments and bold/italic label marks. References can remain dangling.

For overrides, `assignment` is one atomic `{property, value}` attribute;
`targetId` is independent. The TypeScript graphic helpers validate the complete
payload and its typed value bounds. The generic raw TypeScript attribute rule
checks only the outer object type. Use the graphic helpers for that opaque
payload. The native pinned checker enforces the stricter helper contract. This
does not introduce a generic nested wire validator or establish universal
invalid-input acceptance parity.

### Native sparse-sheet example

This is the private fixed-axis S1 primitive. Formula source is stored text.
It does not evaluate formulas or support row/column insertion.

<!-- native-sheet-example -->
```rust
use doc_sync_native_sdk::{
    Result, SparseField, SparseSheet, SparseSheetOptions, SparseValue,
};

fn main() -> Result<()> {
    let options = |actor: &str| SparseSheetOptions {
        actor: actor.into(), sheet_id: "example-sheet".into(),
        rows: 1_000_000, columns: 16_384,
    };
    let mut alice = SparseSheet::new(options("alice"))?;
    let mut bob = SparseSheet::new(options("bob"))?;
    let ops = alice.set_cell(999_999, 16_383,
        [(SparseField::Value, SparseValue::Number(42.0))].into_iter().collect())?;
    bob.receive(&ops)?;
    assert_eq!(alice.get_cell(999_999, 16_383)?, bob.get_cell(999_999, 16_383)?);
    let checkpoint = alice.checkpoint();
    let reopened = SparseSheet::from_state(checkpoint.to_value())?;
    assert_eq!(reopened.pending_changes(), alice.pending_changes());
    Ok(())
}
```

Use the same Cargo path dependency as the Document example. Native checkpoints
are not public TypeScript Client checkpoints. The sparse-sheet parity fixture
checks its own private cross-language checkpoint format. It does not provide a
production engine switch or recovery protocol.

### Checkpoint, retry, selection, and History recipe

This complete program uses peer application as an in-memory delivery
confirmation. A network host must obtain its own trusted acknowledgement
before it removes pending changes. Keep operation identities unchanged on retry.

```rust
use doc_sync_native_sdk::{
    Attributes, Checkpoint, Document, EditOptions, Key, Position,
    Result, SchemaPreset, Selection,
};

fn main() -> Result<()> {
    let mut alice = Document::new("alice", SchemaPreset::Text)?;
    let mut bob = Document::new("bob", SchemaPreset::Text)?;
    alice.insert_text(
        &Key::root(), "Hello", Attributes::new(), EditOptions::default(), 0.0,
    )?;
    let selection = alice.capture_selection(Some(Selection {
        anchor: Position(vec![0, 1]),
        focus: Position(vec![0, 4]),
    }))?;
    assert!(selection.is_some());

    // Persist these bytes atomically in trusted host storage before shutdown.
    let saved_json = alice.checkpoint()?.to_json()?;
    let saved = Checkpoint::from_json(&saved_json)?;
    let mut restarted = Document::restore(&saved)?;
    let sent = restarted.pending_changes().to_vec();
    for _ in 0..2 {
        for change in &sent {
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(restarted.model()?, bob.model()?);
    // The peer accepted this exact prefix. Later queued edits stay pending.
    restarted.acknowledge(&sent)?;
    assert!(restarted.pending_changes().is_empty());
    assert!(restarted.resolve_selection(selection)?.is_some());
    assert!(restarted.history_status()?.can_undo);

    let undo = restarted.undo()?;
    bob.apply_remote(&undo.ops)?;
    let redo = restarted.redo()?;
    bob.apply_remote(&redo.ops)?;
    assert_eq!(restarted.model()?, bob.model()?);
    // Undo and redo are new local changes and remain pending until confirmed.
    assert_eq!(restarted.pending_changes().len(), 2);
    Ok(())
}
```

A checkpoint includes the native document, actor History, preset, and exact
pending queue. It does not include an application selection; save captured
selection keys separately when needed. Resolve them after restore and handle
`None` when the endpoints are no longer visible. Persist the updated checkpoint
after acknowledgement so a later restart uses the updated queue. If an older
checkpoint is restored, its pending operations can be delivered again.

`record` creates new local History. Use `apply_remote` for peer delivery and
retry, including retries on the source actor. `next_ticket` observes the next
clock but does not reserve it. Explicit batches need distinct fresh own tickets;
a text birth consumes one clock per UTF-16 unit.

### SDK API map

| Task | API | Contract |
| --- | --- | --- |
| Create a document | `Document::new(actor, preset)` | One independent author and one fixed schema preset. |
| Write text | `insert_text`, `delete_text`, `set_mark` | Allocate fresh own tickets and record local History; return `Change.ops`. |
| Apply explicit structure | `record(Vec<Op>, options, time)` | Typed node, attribute, and move operations for a supported preset. Full `doc.edit()` compilation is not available. |
| Receive or retry | `apply_remote(&ops)` | Apply the original operations; do not create local History or another pending entry. |
| Read | `model()` | Typed `ModelNode`, `ModelRun`, and `ModelText`; text retains UTF-16 units. |
| Travel through History | `undo`, `redo`, `history_status` | Actor-owned inverses; deliver returned operations to peers. |
| Save a selection | `capture_anchor`, `capture_selection` | Convert model paths and UTF-16 offsets to stable keys. |
| Restore a selection | `resolve_anchor`, `resolve_selection` | Resolve available model positions; hidden strict ranges return null. |
| Persist restart state | `checkpoint`, `Checkpoint::to_json`, `Document::restore` | Retain the native document, actor History, preset, and exact pending queue together. |
| Confirm delivery | `pending_changes`, `acknowledge` | Remove only an exact pending prefix after the host confirms it. |

The six presets are `Text`, `Paragraphs`, `Blocks`, `Nested`, `Shapes`, and
`Movement`. They admit only the corresponding fixed native schema. A typed
operation can still be invalid for that preset and return an error.

`Utf16Text` can retain isolated surrogate units. Converting it to a Rust
`String` can fail; the SDK does not silently replace invalid units. An SDK
`Key` is a stable token key, not a byte offset or a browser node key.

Local record and History commands stage native state before committing their
decoded result and pending queue. Invalid input or checkpoint replacement
preserves live state. Current staging restores a full native checkpoint for
each History command, so this API has no performance acceptance result.

The initial Document SDK checkpoint passed 14 tests, formatting, Clippy, and
the actual two-author example. The later domain additions have separate
graphic and sparse-sheet evidence described above.
Eight independent review cases also checked preset/UTF-16 restore, deletion,
clock exhaustion, and forged pending rejection. These are native SDK checks,
separate from the engine's 75 tests and TypeScript differential evidence.

## Use the storage-only WASM adapter

This adapter edits a bounded UTF-16 buffer. It does not expose `Document`,
operations, History, checkpoints, transport, or editor bindings. The separate
native SDK cannot be imported into JavaScript as a WASM document engine.

From the repository root, install the target for the selected toolchain and
build the raw module:

```sh
rustup target add --toolchain stable wasm32-unknown-unknown
RUSTC="$(rustup which --toolchain stable rustc)" CARGO_TARGET_DIR=experiments/rust-core/target "$(rustup which --toolchain stable cargo)" build --offline --release --lib --target wasm32-unknown-unknown --manifest-path experiments/rust-core/Cargo.toml
```

The crate has no third-party Rust dependencies. This build needs the installed
WASM target. It produces
`experiments/rust-core/target/wasm32-unknown-unknown/release/doc_sync_rust_experiment.wasm`.
It needs no `wasm-bindgen`, generated initialization helper, or npm package.

Run this Node.js ESM example from the repository root:

```sh
node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises';
import {WasmStorage} from './experiments/rust-core/scripts/storage-wasm.mjs';

const bytes = await readFile('./experiments/rust-core/target/wasm32-unknown-unknown/release/doc_sync_rust_experiment.wasm');
const {instance} = await WebAssembly.instantiate(bytes, {});
if (instance.exports.storage_api_version() !== 1) throw new Error('unsupported storage ABI');
const storage = new WasmStorage(instance.exports, 1); // 0: Vec, 1: Gap
try {
    storage.init(new Uint16Array([72, 105])); // Hi
    storage.splice(2, 0, new Uint16Array([33]));
    const units = storage.read(); // Fresh copy, not a borrowed WASM view.
    if (units.join(',') !== '72,105,33') throw new Error('unexpected units');
    console.log(units); // Uint16Array(3) [72, 105, 33]
} finally {
    storage.clear(); // Drop this backend's buffer.
}
JS
```

For a browser, serve `experiments/rust-core` as the web root:

```sh
python3 -m http.server 8719 --bind 127.0.0.1 --directory experiments/rust-core
```

Open `http://127.0.0.1:8719/storage-browser.html` for the existing runnable
harness. In a module served from this origin, replace the Node imports and
loading with:

```js
import {WasmStorage} from '/scripts/storage-wasm.mjs';
const response = await fetch('/target/wasm32-unknown-unknown/release/doc_sync_rust_experiment.wasm');
if (!response.ok) throw new Error(`WASM fetch failed: ${response.status}`);
const {instance} = await WebAssembly.instantiate(await response.arrayBuffer(), {});
if (instance.exports.storage_api_version() !== 1) throw new Error('unsupported storage ABI');
const storage = new WasmStorage(instance.exports, 1);
// Use the same init/splice/read/clear lifecycle as the Node example.
```

Use one live wrapper per backend slot in a WASM instance. `init` replaces only
that backend's buffer; `clear` drops it. A second wrapper for the same slot
shares that state. Calls must be synchronous and exclusive because both slots
share input and output scratch buffers. Each buffer and the logical text have
a limit of 1,048,576 UTF-16 units. Invalid indices, splice bounds, or capacity throw
`RangeError`. Input must be a `Uint16Array`; other input types throw
`TypeError`. A surrogate pair occupies two units.

The wrapper copies input into WASM memory, calls the raw `storage_*` exports,
and refreshes views when allocation can grow memory. `read` copies its result
before returning it. Do not retain or mutate raw scratch views. `clear` releases
the selected text buffer; it does not free the module's fixed scratch memory
or destroy the WASM instance. Release application references when finished.

The raw `benchmark_checksum` export is a separate batch benchmark. It does
not provide this text-buffer lifecycle or a collaborative document API.

## Connect an editor

The current supported application path is:

```text
Tiptap / ProseMirror / Slate / Lexical
  -> TypeScript binding -> SyncClient -> TypeScript synchronization server
```

Use the [Tiptap guide](./tiptap), [ProseMirror guide](./prosemirror),
[Slate guide](./slate), or [Lexical guide](./lexical) for that path. Do not
substitute the Rust `Document` for a `SyncClient`; they have different APIs.

The native SDK can already be used in a Rust host:

```text
Rust application -> Document SDK -> typed Change.ops
                   <- host delivers peer operations with apply_remote
```

The host supplies transport and trusted persistence. This is not a ready-made
Node server adapter or a connection to the existing browser editors.

To run the engine inside a browser editor, R5 must supply a WASM wrapper and
the binding-facing document/history/selection contract. A native Node adapter
needs its own transport, disposal, persistence, and recovery integration. Both
must preserve exact operation identity, schema fingerprints, pending replay,
foreign-write ownership, and selection mapping. Those adapters are planned;
the storage-only WASM experiment cannot provide them.

The JSONL examples below and on editor pages inspect the lower-level engine.
They are test examples, not instructions for connecting a browser to Rust.

## What runs where

| Component | Current implementation | Rust work |
| --- | --- | --- |
| Production synchronization server | TypeScript on Node.js | A native shadow adapter is planned after semantic qualification. |
| Browser document engine | TypeScript | Isolated WASM storage and boundary experiments exist; a full engine adapter is planned. |
| Native Rust application | Experimental `Document`, `GraphicDocument` and `SparseSheet` APIs | Fixed document, Canvas/Builtins profiles and private sparse cells; the host supplies networking and storage. |
| CRDT semantic comparison | TypeScript is the reference | A separate native process applies the same operations and computes its own state, History, and selection results. |
| ProseMirror, Slate, Lexical, and MCP | Existing TypeScript integrations | Rust integration has not been qualified. |

The differential native process receives operations, time, options, selections, and its own
exported checkpoints. Expected document models and expected History inverses
stay in the comparison process. Passing a storage checksum is not proof of
collaborative editing behavior.

## Engine architecture

The work has three layers. They have separate acceptance gates:

| Layer | Purpose | Current scope |
| --- | --- | --- |
| UTF-16 storage | Insert, delete, and read text units efficiently. | Independent native and WASM experiments compare String, Vec, and Gap candidates. |
| CRDT semantics | Preserve identities, concurrent writes, structure, History, and anchors. | A private native interpreter compares supported wire operations with TypeScript. |
| SDK and product adapters | Expose typed native calls and connect transport, persistence, MCP, and browser editors. | Initial native SDK delivered; product adapters remain planned. |

The Gap benchmark is not the current CRDT engine's storage implementation.
The production TypeScript engine stores internal sequences in `Item[]` arrays
and uses a separate logical-ID index. Main storage can contain many paragraphs.
An Item's origin is insertion ancestry, not a next/previous linked-list pointer.
The native shadow uses Vec token storage. Neither implementation has adopted
the experimental Gap buffer as its CRDT kernel. See the source-bound
[array-storage investigation](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/array-storage-investigation/report.md)
for the distinction between indexed access, searching and middle insertion.

The shadow interpreter retains tokens in a native `Vec`, ordered physical
lines, register maps, deletion sets, and projection caches. It still performs
linear lookups and clones candidate state for atomic requests. These choices
make the semantic experiment reviewable; they do not establish a tuned engine
or inherit the Gap benchmark's speed and memory results.

### Stored state and projected document

The stored document is more than its visible JSON tree:

| Stored fact | Why it stays in the engine |
| --- | --- |
| Ticket: Lamport clock and actor | Gives an operation or token a stable identity and deterministic ordering. |
| Immutable token origin and birth metadata | Retains insertion relationships and the original node identity after movement or type changes. |
| Current attribute value and writer ticket | Resolves last-writer-wins registers and prevents undo from replacing another writer's change. |
| Deletion and cancellation ticket sets | Lets one user undo their own deletion while another user's deletion remains active. |
| Physical line, owner, and slot | Keeps nested container bodies, table axes, and cell contents addressable when hidden. |
| Placement records and logical split/join metadata | Changes visible placement without copying or renumbering stored text. |
| History ownership graph | Generates local inverses and retains shared prior-state ownership across undo, redo, and restore. |

Projection derives blocks, groups, inline content, spans, and tables from this
state. A list group or link span need not create a storage token. Deleting a
container does not erase its stored body. Merging table cells hides covered
cells in the editor while retaining their text and attribute writers.

Comparisons first materialize the same valid derived slot heads in both
engines without advancing the clock. They then compare canonical physical
lines, IDs, writers, deletion ledgers, and projected models. This normalization
does not claim equal lazy allocation order or identical snapshot bytes.

### Operation application

The native executable reads one JSON request per line and writes one JSON
response. Its `Server` holds named replicas in memory. It is an experiment
driver, not the production HTTP synchronization server.

For an atomic mutating request, the driver validates the command, schema, and
capability, applies the batch to candidate state, and replaces active state
only after success. Invalid batches and coupled checkpoint restores preserve
the prior document and History. This is in-memory atomicity, not durable
database commit or authorization.

TypeScript's existing builders still decide which wire operations a user
command creates. Rust independently applies those operations and computes
projection, selection, and History inverses. A native equivalent of the
high-level `doc.edit()` authoring compiler has not been delivered.

### UTF-16 and JavaScript compatibility

Text crosses the comparison boundary as arrays of 16-bit units. An emoji can
use two units; isolated surrogate units must also survive edits and restore.
The native engine does not normalize text or reinterpret offsets as UTF-8 byte
positions. Actor ordering uses JavaScript UTF-16 ordering when tickets tie.

Actor names and JSON attribute strings use Unicode scalar strings in the
native JSON parser. Isolated surrogates in those strings are outside the
supported wire subset. Text unit arrays remain supported. Finite JSON values,
object insertion order, safe integer ticket bounds, and signed-zero behavior
also need explicit compatibility checks. A Rust type being valid does not by
itself mean its behavior matches JavaScript.

## Concurrent editing and local History

Undo is an operation on retained CRDT state. It is not replacement of the
document with an older visible JSON tree.

For example, suppose A deletes `c` while B makes `c` bold. The merged document
hides `c` while its active deletion exists, but keeps the formatting writer.
If A undoes only their deletion, the character becomes visible according to
the remaining deletion and formatting state. If B has also undone bold, or a
third user has written another value, those events affect the result. Local
undo does not erase another user's deletion or overwrite a later foreign
writer merely to reproduce an earlier screen.

The native History generates its own inverse tickets. It checks current writer
ownership before reverting each affected target, including foreign writes
that have the same value. It retains shared before/after state, undo and redo
stacks, carets, typing groups, and deletion pins. The current experiment uses
a 1,500 ms typing window and a 100-group History limit.

`history_record` applies and records fresh local operations. It is not a
retry-safe submission API. Remote duplicates and saved pending batches use
plain `apply`, so retry does not create another History entry. Movement and
split inverses use the same ownership discipline. A foreign move can suppress
an obsolete local inverse without discarding the stored operation history.

## Cursors and selections

A token key names the position immediately after a stored token. It can remain
stable when another participant inserts text before it. Captured ranges retain
both anchor and focus, including reversed selections and UTF-16 boundaries.

There are two different resolution contracts:

| Operation | Contract |
| --- | --- |
| Raw local anchor lookup | Find an available caret position, using physical predecessors or an owning block/cell fallback when necessary. |
| Strict editor range resolution | Return a model range only when both endpoints are addressable in the visible model; otherwise return null. |

An anchor in a covered cell, deleted ancestor, or hidden private storage must
not create a remote selection in content the editor cannot display. Local
History lookup can still need a fallback. The current root-gap correction
targets this distinction: an ownerless hidden root storage line must terminate
at root start instead of following a nonexistent owner. Existing nested-owner
and neighboring-cell escape rules remain unchanged.

These native anchor checks do not prove browser DOM selection, IME behavior,
cursor animation, or editor-specific restoration. Those require adapter and
browser tests.

## Restart and pending replay

The native document snapshots belong to this crate. Formats v1 through v6
identify separate declared capabilities; they are not TypeScript document
snapshots. A coupled History checkpoint stores the actor, native document, and
shared ownership graph together.

Restore validates schema identity, manifest, physical membership, immutable
birth data, current writers, placement references, clock bounds, and History
references before replacing active state. A failed restore preserves both
parts. Plain document restore clears old History so it cannot act on a
different document.

The pending-replay tests follow this sequence:

1. Generate actual operations with a TypeScript client and retain its exact
   pending batch and matching History transition.
2. Export the matching native checkpoint and stop the native process.
3. Start a new process, restore the checkpoint, and receive a foreign edit in
   the same affected subtree or range.
4. Apply the saved pending batch twice through plain apply.
5. Compare document state, History, foreign writers, and subsequent undo/redo.

The process does not persist checkpoints by itself. The caller must retain
them and arrange GC protection. These tests do not simulate the complete
production server journal, receipt acknowledgement, lease expiry, or recovery
reservation protocol. Those belong to later adapter qualification.

## Current coverage

The native interpreter has separate, fixed capabilities for these cases:

- UTF-16 text, deletion, deletion cancellation, and boolean formatting.
- Independent undo and redo, shared formatting ownership, and deletion pins.
- Paragraph split/merge and token-based selection.
- Text blocks, atoms, typed attributes, and atomic JSON attribute values.
- Recursive containers and full tables, including content hidden by merged cells.
- Flat list groups, inline images, and string-valued link spans.
- Block and subtree movement, logical split/join, and private text storage.

Movement retains token IDs, physical origins, and foreign input. Its History
checks preserve other users' writers. Fresh-process tests restore pending move,
split, join, undo, and redo operations, replay each batch twice, and compare
later History actions. This is checkpoint/replay evidence. It does not establish
full server crash recovery, protected garbage collection, or protocol parity.

Native tests now pass 75/75. The corrected movement comparison passes 360 full
state/History checks, 56 independently generated inverse/caret checks, and
5,666 raw endpoint checks. All four formerly omitted hidden-root-gap cases now
resolve identically in TypeScript and Rust; there are no endpoint omissions in
that receipt. Strict editor range resolution still returns null for hidden
anchors. All seven earlier differential suites also passed against the same
corrected binary. The native SDK's separate tests do not extend this fixed
schema comparison into browser or transport qualification.

The later TypeScript read/canonical-path integration also repeats all eight fixed-schema native comparisons: 4,735 states, 707 independent inverse comparisons, 39 coupled restores, and 5,666 movement endpoints, with 401 matching input hashes. The new multi-type attribute-domain fixture is unsupported by the Rust manifest and has no native parity result. This does not add dynamic schemas, a WASM host, or editor-backend selection.

## Examples by editor task

Every page in **Build an editor** includes a Rust experiment section. These
examples run the current native driver, or the existing differential harness,
and state the boundary between engine behavior and product integration.

| Task | Examples |
| --- | --- |
| Choose an integration boundary | [Editor integration paths](./editors#rust-experiment), [editor design lessons](./editor-lessons#rust-experiment) |
| Apply text and structural edits | [Model operations](./editing#rust-experiment), [schema-driven blocks](./blocks#rust-experiment) |
| Validate rules and recover pending work | [Document rules](./document-rules#rust-experiment), [synchronization](./sync#rust-experiment) |
| Represent agents and their History | [AI clients](./ai#rust-experiment), [document bots](./bots#rust-experiment), [Codex walkthrough](./ai-walkthrough#rust-experiment) |
| Map activity and selection | [Bot identity](./bot-design#rust-experiment), [cursors and selections](./presence#rust-experiment) |
| Connect editor positions to engine paths | [ProseMirror](./prosemirror#rust-experiment), [Slate](./slate#rust-experiment), [Lexical](./lexical#rust-experiment) |

The native examples are lower-level experiments. They do not replace the
TypeScript binding examples earlier on those pages.

## Can a document use a dynamic schema?

The production TypeScript engine accepts schema data and supports a compatible
open-editor transition. See [change an open editor's schema](./schema-transition).

`SchemaPreset` still chooses a compiled fixture. The separate `RuntimeSchema`
API compiles supported descriptors per document without rebuilding Rust.
Custom sparse fields use `SpreadsheetSchema` and `RuntimeSheet`. These APIs do
not replace the schema of an open document. See [runtime custom schemas](#runtime-custom-schemas).

The work has two separate steps:

1. Complete the supplied-schema tables beyond the implemented runtime subset. Validation,
   projection, selection, History, and checkpoint checks must use those tables
   instead of fixed node names. Schema fingerprints must match TypeScript.
2. Add compatible live transitions. Check the document revision and schema
   version atomically, prepare and persist before switching, and retain exact
   pending operations, History ownership, selection anchors, and recovery
   protection. Recovery-proof migration across schema versions needs its own
   qualification.

The existing compatible TypeScript transition permits append-only boolean
marks, new nodes, and permitted new child types. It does not change existing
node attributes, defaults, rules, value marks, the root, or UI metadata.
Incompatible document migration is a separate feature.

## Roadmap

| Stage | Status | Qualification boundary |
| --- | --- | --- |
| R1: UTF-16 contract | Bounded baseline delivered | Storage behavior only. |
| R2: Storage comparison | Declared bounded gate passed | Independent JavaScript, native Rust, and WASM comparisons; workload regressions remain recorded. |
| R3: Boundary and resource lifetime | Declared bounded gate passed | Node.js and Chrome experiments; no production adapter approval. |
| R4: CRDT shadow semantics | In progress | Fixed schemas and declared semantic cases; broader rules, dynamic schemas, GC, and serialization remain open. |
| R5: Native server and WASM client adapters | Planned | Separate restart, reconnect, transport, editor, and recovery evidence required. |
| R6: Product decision | Planned | End-to-end correctness, latency, memory, compatibility, and rollback gates. |

### Ordered delivery work

The target is one binding setup with TS or Rust/WASM selected when the client
is created. Engine hot swap during a live editing session is a separate future
feature. The following steps define the acceptance gates. The TypeScript selection seam
is implemented, with verified routing and bounded client timing comparisons.
Broader end-to-end Chrome latency acceptance remains open. No step adds a shipped Rust/WASM
backend option yet.

| Order | Work | Completion gate |
| --- | --- | --- |
| D1 | Shared client/engine ports, wire values and snapshot transfer | A selected TS factory drives an actual binding/client; routing tests, existing regressions and the incremental-path performance budget pass. |
| D2 | Runtime Rust schema kernel | Renamed schemas and three product schemas work without rebuilding Rust; invalid inputs reject atomically. |
| D3 | Complete EditOp compiler and remaining schema semantics | Independent TS/Rust authoring preserves IDs, normalized models and foreign-write ownership. |
| D4 | Composition, events, anchors/presence, recovery, GC and schema changes | Lost responses, crashes, GC, pending changes, History and selection retain their documented behavior. |
| D5 | Complete typed native SDK | An external Cargo consumer uses schema-based editing and exact recovery against TS peers. |
| D6 | Full document CRDT WASM package | Native/Node/browser contract corpus, artifact loading, error and lifetime checks pass. |
| D7 | Same bindings with selected TS/WASM backend | Each editor passes TS/TS, TS/WASM, WASM/TS and WASM/WASM Chrome scenarios against the TS server. |
| D8 | Package, long-session and performance qualification | Isolated consumers, differential/fuzz cases and predeclared product budgets pass; retain TS default until an explicit decision. |
| D9 | Optional native Rust server | Separate shadow, durable protocol/restart and performance evidence; not required for D7. |

D1 and the D2 schema kernel can progress in parallel after the value/schema
contract is agreed. A text-only browser prototype can follow D1 to test ABI and
session assumptions early; it must not claim full schema or recovery support.
D5 and D6 share the same semantic core, but the native SDK release does not block
the WASM client release. Each has its own D8 qualification. The native server
lane remains separate.

See the [detailed delivery queue](https://github.com/barocss/doc-sync/blob/main/docs/rust-roadmap.md#delivery-goal-and-ordered-work)
for file references, dependencies, scope and exit conditions. D1 must validate
the selected TypeScript client/binding path, legacy APIs, concurrent editing
rules, and the declared performance budget. A factory-only change does not
complete that task.

## Does Rust make editing faster?

The current WASM storage comparisons do not show a general gain over JavaScript
Gap. The matched native Rust Gap comparison has lower edit and pipeline medians
in six measured conditions and lower sampled whole-process RSS. Runtime,
allocation, and retained trace costs are included. This does not isolate a Rust
language benefit or measure the production server.

The full Rust CRDT engine has no qualified browser performance or production
speedup result. Server-native results, WASM boundary costs, and end-to-end
editor latency need separate measurements.

### Native storage measurement

The matched native Gap comparison used two seeds, 100,000 initial UTF-16 units,
10,000 edits per trace, seven paired samples, fresh processes, and five untimed
warm-ups. The table shows pipeline medians for seed `305419896` in milliseconds.
Pipeline includes construction, edits, and a fresh contiguous output.

| Trace | Node.js Gap | Native Rust Gap |
| --- | ---: | ---: |
| Cursor-local | 0.928375 | 0.138876 |
| Far jump | 9.236333 | 8.216250 |
| Alternating ends | 30.001999 | 27.107958 |

Across both seeds, the native pipeline median was lower in all six conditions;
41 of 42 paired samples were lower. One native fresh-output phase was slower
than Node.js. Gap movement across a document still dominates distant edits.
The result excludes startup, trace parsing, JSON, IPC, transport, CRDT work,
persistence, and editor rendering. It is a storage batch result.

At the materialized stage, sampled whole-process RSS was 2,928–3,056 KiB for
native Rust and 63,616–65,104 KiB for Node.js. Those observations include runtime
baseline and trace representation. They are not per-document heap, peak memory,
multi-document scaling, or leak measurements. They do not predict the savings
from replacing one component inside an existing Node.js server.

The practical WASM path was slower than JavaScript Gap in its measured Node.js
and Chrome workloads. Native results do not remove WASM copies, calls, memory
growth, and resource-lifetime costs.

## Run the private experiment

This section is for low-level engine inspection. Start with the native SDK
above when writing a Rust application. The executable below is a comparison
driver, not an editor adapter.

Run from a repository checkout. Existing receipts used Node.js 24 and a matching
rustup Rust compiler and rustdoc. Offline builds require the locked dependencies
to be present in the local Cargo cache.

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
mkdir -p output/rust-review
RUST_MOVE_RECEIPT=output/rust-review/receipt.json RUST_MOVE_TRACE=output/rust-review/fulltrace.json.gz RUST_MOVE_SUMMARY=output/rust-review/summary.txt node experiments/rust-move-harness/harness.ts
```

Use new output paths to preserve earlier evidence. The harness performs the
editing and History comparisons. It is not an application server.

For a small protocol inspection, start the built executable and send these
three JSON lines. This uses the base text schema rather than the movement mode:

```json
{"cmd":"new","replica":"A","actor":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"state","replica":"A"}
```

The resulting text is `Hi`. Plain apply does not record local History. Use the
comparison harness to inspect `history_record`, `history_undo`, `history_redo`,
checkpoint export/restore, and selection requests with valid authored inputs.
These commands are private experiment interfaces, not public package exports.

## Source map and remaining limits

| Repository location | Responsibility |
| --- | --- |
| `experiments/rust-shadow/src/lib.rs` | Replica state, tickets, base apply, command admission, and atomic driver requests. |
| `experiments/rust-shadow/src/general.rs` | Fixed block types and JSON attribute behavior. |
| `experiments/rust-shadow/src/nested.rs` | Physical flow/grid storage, recursive projection, and nested selection. |
| `experiments/rust-shadow/src/movement.rs` | Placement replay, private text partitions, and logical split/join projection. |
| `experiments/rust-shadow/src/shapes.rs` | Fixed list groups, inline nodes, and string spans. |
| `experiments/rust-shadow/src/history.rs` | Independent History generation and coupled ownership checkpoints. |
| `experiments/rust-shadow/src/selection.rs` | Flat token anchors and selection dispatch. |
| `experiments/rust-*-harness/` | TypeScript reference generation, native comparison, saved receipts, and traces. |
| `experiments/rust-core/` and `experiments/rust-bridge/` | Separate storage, WASM boundary, lifetime, and native Gap experiments. |

Runtime schema compilation, compatible live transitions, required-child/group
boundary rules, field-level attribute merging, broader value-mark semantics,
protected GC, and wider serialization/recovery behavior remain open. Object
reference identity, all raw TypeScript rejection cases, and arbitrary malformed
inputs are not qualified by the supported JSON wire subset.

The engine has no qualified native production server or full WASM client.
Existing JavaScript editor and MCP functionality must not be described as Rust
integration evidence. A production decision requires semantic qualification,
adapter evidence, measured product targets, and a rollback plan.

See the [project roadmap](../roadmap) and
[performance evidence](../performance). The detailed research plan and raw
receipts remain in the repository's `docs/rust-roadmap.md` and `experiments/`
directories. Local documentation preview does not publish these changes.
