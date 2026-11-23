# Rust engine

The private native SDK has separate APIs for Document, Graphic and Spreadsheet.
These are native Cargo APIs. They are not browser engines or public `Client`
implementations. The WASM adapter still provides UTF-16 storage only.

The Rust delivery is **incomplete**. D1 provides the selected TypeScript client
boundary; D2 covers only a native runtime-schema subset. Remaining schema-rule/compiler
coverage, the shared Client.data Map/List facade, live schema changes,
production recovery/GC parity, a full document CRDT WASM package and selectable
Rust/WASM editor bindings remain open. The examples below use the implemented
native Cargo APIs or the separate storage-only WASM experiment. They do not
provide a Rust replacement for the production Client, server or MCP path.

## Choose an engine for a graphic editor

| Path | Available now | Integration limit |
| --- | --- | --- |
| TypeScript Client | Document and graphic schemas, built-in graphic nodes, local/synchronized History | The private PixiJS demo renders the earlier basic canvas profile. |
| Native Rust `Document` | Six fixed document presets, peer operations, History, selection and checkpoints | Preset API; custom recursive flow/grid/text/atom/group/inline/span documents use `RuntimeDocument`. No editor binding. |
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
The rules checkpoint passed **78 SDK tests and 120 shadow-core tests**.
The nested-payload checkpoint passes **105 SDK tests and 166 shadow-core tests**.
It adds four SDK tests and ten shadow-core tests to the shared-object baseline of 101 and 156.
It adds eight SDK tests and nine shadow-core tests to the alias baseline of 93 and 147. The composite checkpoint passed 86 and 138 respectively. The shapes checkpoint passed 67 and 107. The grid checkpoint passed 60 and 96.
The recursive-flow checkpoint passed 55 and 89; the earlier flat checkpoint passed 48 and 78 respectively.
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

The npm package layout and the production client/engine selection seam are
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

Add `serde_json = "1"` beside the native Cargo path dependency below to run this
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
| Document | Recursive flow/grid/row/cell/text/atom/group/inline/span, defaults, nested field registers, required min/max children, atomic safe JSON value marks, boolean marks, nested selection and block movement | axis movement, derived-wrapper attributes and general computed rules |
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

### Nested Document authoring

`insert_block_in` and `insert_text_in` address a flow's **physical source
sequence**. `None` parent selects the root; a parent key selects that flow's
body. `after` and `right` identify source tokens. A moved block retains its
original source sequence. These methods do not compile current model positions
or the complete TypeScript `EditOp` surface. Root-only `insert_block` and
`insert_text` remain available.

Use `flow_text_ids(parent)` to read visible UTF-16 token keys in that source
sequence. `capture_selection` and `resolve_selection` convert nested model paths
and stable anchor ranges; the final text path component is a UTF-16 offset.
Use `reparent_block` for a compatible Document move. Its `after` argument names
a block; the SDK uses that block's current accepted placement writer. This
supports an anchor that has already moved across flows and excludes a move
ignored by cycle projection. Graphic moves keep the separate `reparent` API.

The expanded 150-action comparison found
`OBSERVED_D3_MODEL_INSERTION_MISMATCH`: insertion at a current model position
after earlier moves produced `Node + Move` in TypeScript and only `Node` through
the native physical-source helper. This is an observed failed case, not a
`NOT_RUN` result. Its failing traces remain in
`output/rust-d2-nested-2026-11-04/compare/post-move-insert-gap-*`.
The qualified comparison passes 162 actions across two renamed schemas. It
creates future sibling flows before moves and checks the source-anchor contract. Use the model-path API below for bounded insertion after moves. A full `EditOp` compiler, arbitrary post-move selection, live schema changes,
protected GC, and production Client/WASM integration remain open.

Add `serde_json = "1"` beside the native SDK Cargo path dependency described
below. This complete native program creates two nested levels and two actors.
It checks peer model equality, coupled checkpoint restore, duplicate pending
replay, acknowledgement, and undo/redo while retaining the peer's text.

<!-- runtime-nested-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root": "page", "marks": ["strong"],
        "nodes": {
            "page": {"shape": "flow", "children": ["line", "section"], "default": "line"},
            "section": {
                "shape": "flow", "children": ["line", "section"], "default": "line",
                "attrs": {"rank": {"default": 0, "min": 0, "max": 5}}
            },
            "line": {"shape": "text"}
        }
    }))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let (outer, _) = a.insert_block_in(
        "section", None, None, None, Attributes::new(), EditOptions::default(), 1.0,
    )?;
    let (inner, _) = a.insert_block_in(
        "section", Some(&outer), None, None, Attributes::new(), EditOptions::default(), 2.0,
    )?;
    a.insert_text_in(
        Some(&inner), None, "Hello😀", Attributes::new(), EditOptions::default(), 3.0,
    )?;
    for change in a.pending_changes() {
        b.apply_remote(&change.ops)?;
    }
    assert_eq!(a.model()?, b.model()?);

    // B writes into the same nested body. A receives B's exact operations.
    let ids = b.flow_text_ids(Some(&inner))?;
    let foreign = b.insert_text_in(
        Some(&inner), ids.last(), " from B", Attributes::new(), EditOptions::default(), 4.0,
    )?;
    a.apply_remote(&foreign.ops)?;
    let own = a.set_attribute(&outer, "rank", json!(3), EditOptions::default(), 5.0)?;
    b.apply_remote(&own.ops)?;
    let expected = a.model()?;
    let text_ids = a.flow_text_ids(Some(&inner))?;
    let pending = a.pending_changes().to_vec();
    let saved = a.checkpoint()?.to_json()?;
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(a.pending_changes(), pending.as_slice());

    // Retry on both actors without recording new History or pending changes.
    let before_retry = a.checkpoint()?.to_json()?;
    for _ in 0..2 {
        for change in &pending {
            a.apply_remote(&change.ops)?;
            b.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(a.checkpoint()?.to_json()?, before_retry);
    assert_eq!(a.model()?, b.model()?);
    // A real host acknowledges only after its transport accepts this prefix.
    a.acknowledge(&pending)?;
    assert!(a.pending_changes().is_empty());

    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    assert_eq!(a.model()?, b.model()?);
    assert_eq!(a.flow_text_ids(Some(&inner))?, text_ids);
    let redo = a.redo()?;
    b.apply_remote(&redo.ops)?;
    assert_eq!(a.model()?, expected);
    assert_eq!(a.model()?, b.model()?);
    println!("PASS: nested peers, checkpoint, exact retry, acknowledgement, undo/redo");
    Ok(())
}
```

### Atomic object/array defaults and enums

The composite checkpoint added eight SDK tests and 18 shadow-core tests to the
rules baseline. The alias checkpoint adds seven SDK tests and nine shadow-core
tests. The shared-object checkpoint adds eight SDK tests and nine shadow-core
tests. The nested-payload checkpoint adds four SDK tests and ten shadow-core tests.
The complete native suites pass 105 SDK tests and 166 shadow-core tests.

`SchemaValue` distinguishes a schema-owned value from a distinct JSON value.
Use `schema.default_value(kind, attribute)` or
`schema.enum_value(kind, attribute, index)` to select a node attribute value.
Use `schema.reference_value(&["markValues", mark], None)` for a mark default,
or `Some(index)` for a mark enum entry. `SchemaValue::json(value)` creates a
plain JSON value. Equal object/array JSON does not become an enum member.
Two deeply equal enum entries retain separate indices. Structured field-leaf
enums keep their existing deep-value equality.

This subset supports safe JSON object/array defaults and atomic composite enums.
A non-null composite enum default requires an explicit shared reference to at
least one enum entry at its own descriptor. This is a native subset limit.
TypeScript `checkSchema` can accept an unlisted default/enum configuration that
the native compiler does not support. Use `RuntimeSchema::compile_with_default_references` or compile this DTO:

```json
{"format":"doc-sync-runtime-schema-alias-v1","manifest":{},"defaultReferences":[{"at":["nodes","line","attrs","choice"],"enumIndex":0}]}
```

The `manifest` field must contain the complete schema. Each edge binds one
composite default to an equal enum slot at the same descriptor. The path can
also be `["markValues", "paint"]`. Multiple explicitly listed slots can share
the default. An equal unlisted slot stays distinct. A linked enum factory returns
the default object's property order, including nested objects and arrays. It keeps
the selected enum source and index in reference metadata. An unlinked enum slot
keeps its own payload order. Empty edge lists, duplicate edges, invalid paths,
mismatched payloads and scalar aliases reject at compile
time. Callback rules, `markValues.fields`, and computed values remain unsupported.

`manifest()` returns the raw rules. `dto()` and schema serialization retain the
versioned alias graph. Schema identity includes that graph. Edge order and object
key order do not change identity. Two schemas with equal JSON and different
alias graphs cannot exchange reference handles. `base_identity()` is the raw
rules' TypeScript `schemaVersion`, for diagnostics. `identity()` is the native
semantic identity, including the alias graph. Native references and checkpoints
bind to `identity()`; do not replace it with `base_identity()`. Bare manifests
retain their existing serialization and identity.

`with_default_references` creates a new schema with the supplied graph. It does
not migrate an open document. Use the shared-v2 graph below for cross-descriptor
and enum-only identities.

`insert_runtime_block`, `insert_runtime_inline_at`, and
`insert_runtime_text_at` omit an exact matching schema-default reference from
birth registers. A listed enum alias also produces no birth register. An equal,
distinct JSON object/array remains a writer.
`set_runtime_attribute`, `set_runtime_attributes`, and `format_runtime_tokens`
retain explicit updates. `SchemaValue::bind` attaches a reference to a typed
`Op` for other native source-addressed operations. Validation uses the compiled
schema; it does not compile a new schema for each value.

Reference operations use the explicit native
`doc-sync-runtime-reference-op-v1` envelope. It contains the ordinary operation
and bindings with schema identity, descriptor path, source, enum index and
payload path. Native JSON delivery, pending retry and checkpoint restore retain
those bindings. Replicas with the same schema identity share the symbolic namespace. A foreign
schema, unshared cross-descriptor reference, invalid index, or mismatched payload is rejected
before commit. Fixed presets do not accept this runtime envelope.

Without an explicit shared group, native semantic helpers require the target's
exact descriptor. For a nontext
node, TypeScript `Doc.check` can accept a same-shaped enum reference from another
node type through its any-candidate lookup. Native target-kind validation rejects
that case. It is TypeScript-valid but native-unsupported; wire admission is not
fully equivalent to TypeScript admission.

TypeScript `Doc.apply` clones stored composite enum attribute values. A raw
register can contain the selected enum payload while model projection resolves
that attribute to its declared default, which can be `null`. Native projection
preserves this behavior. Selecting an enum reference therefore does not ensure
that its payload appears in the model. Composite enum marks have a separate
rule: values are cloned for each UTF-16 token, and equal adjacent values can
produce separate spans.

This envelope extends the native protocol. It does not provide JavaScript
reference identity over the current TypeScript wire path. TypeScript
`Doc.check` accepts the actual schema enum object, but rejects a JSON-cloned
equal copy. DocHub preserves shared references while cloning the schema. A birth
that uses the default or a listed default alias can pass because canonicalization
omits that value. A retained source-schema handle fails the Hub's initial check;
a Hub-owned handle passes that initial check. Retained enum birth writers and
explicit default/enum updates still reject after DocHub clones their payloads. This is partial transport
support. Native-to-native JSON success is separate from that TypeScript boundary;
mixed-runtime protocol compatibility is unproved.

Add `serde_json = "=1.0.140"` beside the native Cargo path dependency. This
complete program serializes changes between two native peers. It checks a
foreign equal-value writer, JSON checkpoint restore, exact retries and
undo/redo. Restore runs in the same process; this is not a process-crash test.

<!-- runtime-composite-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn deliver(peer: &mut RuntimeDocument, change: &Change) -> Result<()> {
    let received: Change = serde_json::from_str(&serde_json::to_string(change)?)?;
    assert_eq!(&received, change);
    peer.apply_remote(&received.ops)
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"page", "marks":[], "nodes":{
            "page":{"shape":"flow","children":["line","section"],"default":"line"},
            "line":{"shape":"text"},
            "section":{"shape":"flow","children":["line"],"default":"line",
                "attrs":{
                    "style":{"default":{"tone":"plain"}},
                    "choice":{"default":null,"values":[{"tone":"warm"},{"tone":"warm"},["cool",2]]}
                }}
        }
    }))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema.clone())?;
    let (section, birth) = a.insert_runtime_block(
        "section", None, None,
        SchemaAttributes::from([
            ("style".into(), schema.default_value("section", "style")?),
            ("choice".into(), schema.enum_value("section", "choice", 0)?),
        ]), EditOptions::default(), 1.0,
    )?;
    deliver(&mut b, &birth)?;
    assert_eq!(a.model()?, b.model()?);

    // A distinct JSON copy is valid for DEFAULT, but fails atomic ENUM admission.
    let equal_copy = a.set_runtime_attribute(
        &section, "style", SchemaValue::json(json!({"tone":"plain"})),
        EditOptions::default(), 2.0,
    )?;
    deliver(&mut b, &equal_copy)?;
    let before = a.checkpoint()?.to_json()?;
    assert!(a.set_runtime_attribute(
        &section, "choice", SchemaValue::json(json!({"tone":"warm"})),
        EditOptions::default(), 3.0,
    ).is_err());
    assert_eq!(a.checkpoint()?.to_json()?, before);

    // B owns the last equal-value writer. A's undo must preserve that writer.
    let own = a.set_runtime_attribute(
        &section, "style", SchemaValue::json(json!({"tone":"shared"})),
        EditOptions::default(), 4.0,
    )?;
    deliver(&mut b, &own)?;
    let foreign = b.set_runtime_attribute(
        &section, "style", SchemaValue::json(json!({"tone":"shared"})),
        EditOptions::default(), 5.0,
    )?;
    deliver(&mut a, &foreign)?;
    let expected = a.model()?;
    deliver(&mut b, &a.undo()?)?;
    assert_eq!(a.model()?, expected);
    assert_eq!(a.model()?, b.model()?);

    let selected = a.set_runtime_attribute(
        &section, "choice", schema.enum_value("section", "choice", 2)?,
        EditOptions::default(), 6.0,
    )?;
    deliver(&mut b, &selected)?;
    let pending = a.pending_changes().to_vec();
    let saved = a.checkpoint()?.to_json()?;
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(a.pending_changes(), pending.as_slice());
    let before_retry = a.checkpoint()?.to_json()?;
    for _ in 0..2 {
        for change in &pending {
            deliver(&mut a, change)?;
            deliver(&mut b, change)?;
        }
    }
    assert_eq!(a.checkpoint()?.to_json()?, before_retry);
    deliver(&mut b, &a.undo()?)?;
    assert_eq!(a.model()?, b.model()?);
    deliver(&mut b, &a.redo()?)?;
    assert_eq!(a.model()?, b.model()?);
    // A host acknowledges only after its transport accepts this exact prefix.
    let pending = a.pending_changes().to_vec();
    a.acknowledge(&pending)?;
    assert!(a.pending_changes().is_empty());
    println!("PASS: composite native JSON peers, foreign writer, checkpoint, retry and History");
    Ok(())
}
```

The following program uses an explicit default-to-enum alias. It runs with the
same Cargo dependencies. Checkpoint restore stays within the same process.

<!-- runtime-alias-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{"choice":{
            "default":{"x":1},"values":[{"x":1},{"x":1},{"x":2}]
        }}}
    }});
    let schema = RuntimeSchema::compile_with_default_references(
        manifest,
        [DefaultReference::new(&["nodes", "line", "attrs", "choice"], 0)],
    )?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema.clone())?;
    let (id, birth) = a.insert_runtime_block(
        "line", None, None,
        SchemaAttributes::from([("choice".into(), schema.enum_value("line", "choice", 0)?)]),
        EditOptions::default(), 1.,
    )?;
    // Enum slot 0 is the default object. It creates no birth register.
    assert!(matches!(birth.ops[0].raw_operation(), Op::Node { attrs: Some(attrs), .. } if attrs.is_empty()));
    let birth: Change = serde_json::from_str(&serde_json::to_string(&birth)?)?;
    b.apply_remote(&birth.ops)?;
    // Slot 1 has equal JSON but a distinct identity. Its explicit update is kept.
    let update = a.set_runtime_attribute(
        &id, "choice", schema.enum_value("line", "choice", 1)?,
        EditOptions::default(), 2.,
    )?;
    let update: Change = serde_json::from_str(&serde_json::to_string(&update)?)?;
    assert!(matches!(&update.ops[0], Op::Reference { references, .. } if references[0]["index"] == 1));
    b.apply_remote(&update.ops)?;
    let saved = a.checkpoint()?.to_json()?;
    let mut restored = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(restored.schema().dto(), schema.dto());
    assert_eq!(restored.pending_changes(), a.pending_changes());
    for change in restored.pending_changes().to_vec() {
        restored.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.checkpoint()?.to_json()?, saved);
    for change in [restored.undo()?, restored.redo()?] {
        b.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.model()?, b.model()?);
    let pending = restored.pending_changes().to_vec();
    restored.acknowledge(&pending)?;
    assert!(restored.pending_changes().is_empty());
    println!("PASS: explicit alias, distinct enum, native JSON peers, restore, retry, undo/redo, ACK");
    Ok(())
}
```



### Shared objects across attributes and marks

`compile_with_reference_groups(manifest, groups)` supports explicit identities
across different descriptor paths. `ReferenceSlot::default(at)` selects a default.
`ReferenceSlot::enum_entry(at, index)` selects an enum entry. Paths address node
attributes or mark values. A group can link node attributes, different node kinds,
and marks with different names. Enum-only groups are also supported.
If a descriptor has an enum and a non-null composite default, its default must
share a group with at least one of its own enum slots. A cross-descriptor link
alone does not remove this native subset limit. Equal unshared values can use
separate groups to keep their identities distinct.

Use `ReferenceGroup::new(representative, slots)`. Include the representative in
`slots`. Each group needs at least two distinct composite slots with equal JSON.
The representative supplies the shared object's property order, including nested
objects and arrays. Factories retain the selected source path, source and index
in operation metadata. The target operation keeps its own attribute or mark key.
Equal slots outside the group remain distinct.

The wire DTO is:

```json
{"format":"doc-sync-runtime-schema-shared-v2","manifest":{},"referenceGroups":[{"representative":{"at":["nodes","line","attrs","source"],"source":"default"},"slots":[{"at":["nodes","line","attrs","source"],"source":"default"},{"at":["nodes","line","attrs","target"],"source":"default"}]}]}
```

Supply the complete manifest. Compilation rejects missing paths, scalar slots,
unequal payloads, duplicate slots, overlapping groups, a missing representative,
and unknown wire versions. Group order and member order do not change semantic
identity. The representative and group membership do change that identity.
`manifest()` and `base_identity()` describe the raw manifest.
`effective_manifest()` returns compiled rules with every shared slot resolved to
the representative payload. Native default projection and helper rules use these
effective rules. `dto()` retains the raw manifest and versioned graph.
`identity()` includes the graph and representative. Bare manifests
and the same-descriptor `alias-v1` DTO retain their wire form and identity.
`with_reference_groups` creates a new schema; it does not migrate an open document.

A source handle can address a different target descriptor only when that target
contains a slot in the source's shared group. Birth helpers omit a value only
when it shares the actual target default. They keep a shared enum writer when
the target default is distinct. Explicit attribute updates and formatting always
keep their writers. The compiled schema checks target admission and default
identity. Helpers reuse that compiled graph. `SchemaValue::json` keeps its existing
plain-value behavior and does not acquire shared identity.

The following complete program uses the same Cargo dependencies as the earlier
examples. It also runs as `cargo run --manifest-path experiments/rust-sdk/Cargo.toml
--example runtime_shared` from this repository.

<!-- runtime-shared-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "source":{"default":{"x":1},"values":[{"x":1}]},
            "target":{"default":{"x":1},"values":[{"x":1},{"x":1}]}
        }}
    }});
    let source = ReferenceSlot::default(&["nodes", "line", "attrs", "source"]);
    let schema = RuntimeSchema::compile_with_reference_groups(
        manifest,
        [ReferenceGroup::new(
            source.clone(),
            [
                source,
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "source"], 0),
                ReferenceSlot::default(&["nodes", "line", "attrs", "target"]),
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
            ],
        )],
    )?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema.clone())?;
    let (id, birth) = a.insert_runtime_block(
        "line",
        None,
        None,
        SchemaAttributes::from([("target".into(), schema.enum_value("line", "source", 0)?)]),
        EditOptions::default(),
        1.,
    )?;
    assert!(
        matches!(birth.ops[0].raw_operation(), Op::Node { attrs: Some(attrs), .. } if attrs.is_empty())
    );
    let birth: Change = serde_json::from_str(&serde_json::to_string(&birth)?)?;
    b.apply_remote(&birth.ops)?;
    let update = a.set_runtime_attribute(
        &id,
        "target",
        schema.enum_value("line", "source", 0)?,
        EditOptions::default(),
        2.,
    )?;
    assert!(
        matches!(&update.ops[0], Op::Reference { references, .. } if references[0]["at"] == json!(["nodes","line","attrs","source"]))
    );
    let update: Change = serde_json::from_str(&serde_json::to_string(&update)?)?;
    b.apply_remote(&update.ops)?;
    let saved = a.checkpoint()?.to_json()?;
    let mut restored = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(restored.schema().dto(), schema.dto());
    for change in restored.pending_changes().to_vec() {
        restored.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.checkpoint()?.to_json()?, saved);
    for change in [restored.undo()?, restored.redo()?] {
        b.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.model()?, b.model()?);
    let pending = restored.pending_changes().to_vec();
    restored.acknowledge(&pending)?;
    assert!(restored.pending_changes().is_empty());
    println!("PASS: cross-attribute shared object, JSON peers, restore, retry, undo/redo, ACK");
    Ok(())
}
```

Native peers retain these symbolic bindings through JSON changes, checkpoint
restore, retries, undo/redo and acknowledgements. The current TypeScript Hub
still clones retained composite payloads. Omitted default-alias births can pass
that path. Retained reference writers do not establish mixed-runtime transport
compatibility. This work does not add typed TypeScript/WASM runtime bindings.

### Nested schema payload references

`RuntimeSchema::compile_with_payload_references(manifest, groups)` uses
`doc-sync-runtime-schema-payload-v3`. It adds an optional `valuePath` to each
reference slot. Use string keys for objects and integer indices for arrays.
An empty path selects the whole default or enum entry and is omitted from JSON.
Bare manifests, alias v1, and shared v2 keep their existing wire formats and
identities. A nonempty value path requires v3.

`SchemaValue::at_value_path` selects an object or array in a schema-owned value.
`RuntimeSchema::reference_value_at` accepts a typed `ReferenceSlot` directly.
Both retain the original descriptor `at`, `source`, and enum `index`. The
reference's `valuePath` selects inside that source payload. The binding's `path`
selects the operation payload, for example `["value"]` or `["attrs", "target"]`.
These paths have different roles.

Parent sharing also shares matching descendants. Shared children do not merge
their parents. A nested source can supply a whole target attribute or mark only
when that target's rules admit its reference identity. The same descriptor does
not make a child equal to its whole enum entry. Birth helpers omit a writer only
when it shares the actual target default. `SchemaValue::json` retains its existing
plain JSON behavior.

Groups name immutable schema constants. They do not link mutable document
registers. Native JSON is a tree. General heap identity is `NOT_REPRESENTED`.
Native JSON checkpoint success does not prove TypeScript `structuredClone` or
JSON History transport. Those paths require separate TypeScript checks. Field branch aliases and dynamic runtime aliases remain outside this subset.
Missing paths, scalar endpoints, the wrong key/index type, unsafe property names,
and invalid or overlapping groups reject before document mutation.

`manifest()` and `base_identity()` describe the raw manifest. `dto()` retains the
v3 graph. `identity()` includes that graph. `effective_manifest()` and value
factories use the resolved representative payload, including nested property
order. Creating a new graph does not migrate an existing document.

The program uses the earlier Cargo dependency plus `serde_json = "=1.0.140"`.
Run `cargo run --offline --manifest-path experiments/rust-sdk/Cargo.toml
--example runtime_payload` from the repository root. The complete program is:

<!-- runtime-payload-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;
fn main() -> Result<()> {
    let manifest=json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "source":{"default":{"items":[{"x":1}]}},
            "target":{"default":{"x":1},"values":[{"x":1}]}}}}});
    let path=vec![ValuePathSegment::key("items"),ValuePathSegment::index(0)];
    let source=ReferenceSlot::default(&["nodes","line","attrs","source"]).at_value_path(path.clone());
    let schema=RuntimeSchema::compile_with_payload_references(manifest,[ReferenceGroup::new(source.clone(),[
        source,ReferenceSlot::default(&["nodes","line","attrs","target"]),
        ReferenceSlot::enum_entry(&["nodes","line","attrs","target"],0),
    ])])?;
    let value=schema.default_value("line","source")?.at_value_path(path)?;
    let mut alice=RuntimeDocument::new("alice",schema.clone())?;
    let mut bob=RuntimeDocument::new("bob",schema)?;
    let (id,birth)=alice.insert_runtime_block("line",None,None,SchemaAttributes::from([("target".into(),value.clone())]),EditOptions::default(),1.)?;
    bob.apply_remote(&birth.ops)?;
    let change=alice.set_runtime_attribute(&id,"target",value,EditOptions::default(),2.)?;
    bob.apply_remote(&change.ops)?;
    let checkpoint=alice.checkpoint()?.to_json()?;
    let mut alice=RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint)?)?;
    bob.apply_remote(&change.ops)?;
    bob.apply_remote(&alice.undo()?.ops)?;
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?,bob.model()?);
    let pending=alice.pending_changes().to_vec(); alice.acknowledge(&pending)?;
    Ok(())
}
```
<!-- /runtime-payload-rust-example -->

### Field leaf reference sources

Payload v3 can select composite defaults and enum entries from declared field
leaves. `field_default_value(kind, attribute, field_path)` and
`field_enum_value(kind, attribute, field_path, index)` traverse `fields` descriptors.
For example, `["nested", "source"]` selects
`["nodes", kind, "attrs", attribute, "fields", "nested", "fields", "source"]`.
A branch descriptor is not a reference source. Empty, missing, unsafe, scalar,
and out-of-range source selections fail. Nested descriptor sources require v3.
The field path ceiling is 64 segments including the outer attribute. The whole
schema also has a JSON depth ceiling of 128. Schema wrappers and nested defaults
can reach that JSON ceiling before a field path reaches 64 segments.

The source descriptor path, source payload `valuePath`, and target field path
have separate roles. `at_value_path` selects an object or array inside the
source default or enum entry. An explicit reference group can admit that source
at an atomic attribute or mark target under the existing identity rules.

`set_runtime_field_path` checks a `SchemaValue` source against the active schema,
then writes a plain JSON value to the target field leaf. Field leaves use the
TypeScript deep-value constraint and clone contract. The operation does not
carry symbolic field identity. An equal JSON value needs no reference group for
a field target. Target constraints still apply. Invalid provenance or target
values fail before History, pending changes, or document state change.

This adds immutable leaf sources. It does not add branch aliases, mutable
register aliases, or general heap identity. Native peer delivery and checkpoint
checks do not prove TypeScript History transport or complete D2 acceptance.

The complete example uses `serde_json = "=1.0.140"` and the Cargo path dependency
shown above. Run it from the repository root with `cargo run --offline
--manifest-path experiments/rust-sdk/Cargo.toml --example runtime_field_refs`.
It retains another actor's field write through own undo/redo, checkpoint restore,
exact pending retry, and ACK:

<!-- runtime-field-refs-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;
fn assert_fields(doc: &mut RuntimeDocument, id: &Key, x: u64) -> Result<()> {
    let state = doc.state()?;
    let block = state["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|block| block["marker"] == id.as_str())
        .unwrap();
    assert_eq!(block["attrs"]["style"]["nested"]["count"], json!(7));
    assert_eq!(block["attrs"]["style"]["nested"]["copy"], json!({"x":x}));
    let item = state["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == json!(id.ticket().unwrap()))
        .unwrap();
    let count = &item["attrs"]["$field:[\"style\",\"nested\",\"count\"]"];
    assert_eq!(count["value"], json!(7));
    assert_eq!(count["at"]["actor"], json!("bob"));
    assert!(state["model"]["children"]
        .as_array()
        .unwrap()
        .iter()
        .any(|child| child["attrs"] == block["attrs"]));
    Ok(())
}
fn main() -> Result<()> {
    let manifest = json!({"root":"root","marks":[],"nodes":{
        "root":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{
            "style":{"default":{"nested":{"source":{"items":[{"x":1}]},"copy":{"x":0},"count":0}},"fields":{
                "nested":{"default":{"source":{"items":[{"x":1}]},"copy":{"x":0},"count":0},"fields":{
                    "source":{"default":{"items":[{"x":1}]},"values":[{"items":[{"x":1}]}]},
                    "copy":{"default":{"x":0},"values":[{"x":0},{"x":1}]},
                    "count":{"default":0}}}}},
            "target":{"default":{"x":1},"values":[{"x":1}]}}}}});
    let source = ReferenceSlot::default(&[
        "nodes", "line", "attrs", "style", "fields", "nested", "fields", "source",
    ])
    .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)]);
    let schema = RuntimeSchema::compile_with_payload_references(
        manifest,
        [ReferenceGroup::new(
            source.clone(),
            [
                source,
                ReferenceSlot::default(&["nodes", "line", "attrs", "target"]),
                ReferenceSlot::enum_entry(&["nodes", "line", "attrs", "target"], 0),
            ],
        )],
    )?;
    let value = schema
        .field_default_value("line", "style", &["nested", "source"])?
        .at_value_path([ValuePathSegment::key("items"), ValuePathSegment::index(0)])?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let (id, birth) = alice.insert_block(
        "line",
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.,
    )?;
    bob.apply_remote(&birth.ops)?;
    let atomic =
        alice.set_runtime_attribute(&id, "target", value.clone(), EditOptions::default(), 2.)?;
    bob.apply_remote(&atomic.ops)?;
    let copied = alice.set_runtime_field_path(
        &id,
        "style",
        &["nested", "copy"],
        value,
        EditOptions::default(),
        3.,
    )?;
    assert!(
        matches!(&copied.ops[0], Op::Set { key, .. } if key == "$field:[\"style\",\"nested\",\"copy\"]")
    );
    bob.apply_remote(&copied.ops)?;
    let foreign = bob.set_field_path(
        &id,
        "style",
        &["nested", "count"],
        json!(7),
        EditOptions::default(),
        4.,
    )?;
    alice.apply_remote(&foreign.ops)?;
    assert_fields(&mut alice, &id, 1)?;
    let pending = alice.pending_changes().to_vec();
    let saved = alice.checkpoint()?.to_json()?;
    alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(alice.pending_changes(), pending.as_slice());
    for change in &pending {
        alice.apply_remote(&change.ops)?;
        bob.apply_remote(&change.ops)?;
    }
    assert_fields(&mut alice, &id, 1)?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    assert_fields(&mut alice, &id, 0)?;
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    assert_fields(&mut alice, &id, 1)?;
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    Ok(())
}
```
<!-- /runtime-field-refs-rust-example -->



### Product validation patterns

The native runtime accepts the exact product URL pattern `^(https?://\S+)?$`
and optional six-digit hex pattern `^(#[0-9a-fA-F]{6})?$`. Empty strings pass.
URL values need a lowercase HTTP or HTTPS prefix and a nonempty suffix with no
ECMAScript whitespace. These patterns check strings; they do not parse URLs.
Null keeps the existing reset behavior; the model can omit default-valued
attributes. Existing supported patterns remain available. Other unsupported
expressions still reject.

This example writes a link mark, a cell color, and a structured field leaf.
A rejected edit preserves the coupled checkpoint, including the clock, History,
and pending changes. It restores that checkpoint, retries pending delivery,
and compares peer models after local undo and redo.

```rust
use doc_sync_native_sdk::*;
use serde_json::json;
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"book","marks":[],
        "markValues":{"link":{"default":"","pattern":r"^(https?://\S+)?$"}},"nodes":{
        "book":{"shape":"flow","children":["line","grid"],"default":"line"},
        "line":{"shape":"text","attrs":{"meta":{"default":{"url":""},"fields":{
            "url":{"default":"","pattern":r"^(https?://\S+)?$"}}}}},
        "grid":{"shape":"grid","children":["row"]},
        "row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"],"attrs":{
            "color":{"default":"","pattern":r"^(#[0-9a-fA-F]{6})?$"}}},
        "body":{"shape":"flow","children":["line"],"default":"line"}}}))?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let (line, _) = alice.insert_block(
        "line",
        None,
        None,
        Attributes::new(),
        EditOptions::default(),
        1.,
    )?;
    let text = alice.insert_text(
        Some(&line),
        "link",
        Attributes::from([("link".into(), json!("https://example.test"))]),
        EditOptions::default(),
        2.,
    )?;
    let token = Key::from_ticket(match &text.ops[0] {
        Op::Text { id, .. } => id,
        _ => unreachable!(),
    });
    let (grid, rows, cols, _) = alice.insert_grid_at(
        &Key::root(),
        "grid",
        Some(&token),
        1,
        1,
        Attributes::new(),
        EditOptions::default(),
        3.,
    )?;
    alice.set_cell_attribute(
        &grid,
        &rows[0],
        &cols[0],
        "color",
        json!("#aBc123"),
        EditOptions::default(),
        4.,
    )?;
    alice.set_field_path(
        &line,
        "meta",
        &["url"],
        json!("https://example.test/path"),
        EditOptions::default(),
        5.,
    )?;
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .format_tokens(
            &[token],
            "link",
            json!("https://bad path"),
            EditOptions::default(),
            6.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let mut alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&before)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes() {
            bob.apply_remote(&change.ops)?;
        }
    }
    bob.apply_remote(&alice.undo()?.ops)?;
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    Ok(())
}
```

Run `cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_patterns`
from the repository root. The example is an independent native SDK consumer.
Valid unused declarations are accepted. Original Word and Presentation manifests retain their full registries. This is partial D2 evidence. A full Rust/WASM client remains
open.

### Structured fields and required children

A Document attribute can declare recursive `fields`. Each leaf has an independent
LWW writer. Unwritten and null leaves read as their declared defaults.
`set_attributes(id, patch, options, time)` validates the whole patch, then records
one atomic transaction. `set_attribute` accepts a partial structured branch;
`set_field_path(id, attribute, &["branch", "leaf"], value, options, time)` writes
one declared leaf. A branch null resets every declared leaf. Omitted leaves keep
their values. Explicit equal-value updates retain their writers.
`set_cell_attribute` accepts the same patches for cells. `set_group_attribute`
expands them on explicit stored members. Its structured patch path requires
field specifications on all targeted members; mixed scalar/field group attributes
are outside this helper's compiler contract.

These field attributes are supported on stored text, flow, grid, atom and inline
nodes, and on cells. Root fields, row attributes, cell-body attributes, and
attributes on derived group/span wrappers remain unavailable. A field branch's
default must equal its child defaults. Leaves can hold scalar or safe JSON
object/array values. Keys that start with `$`, and `__proto__`, `constructor` or
`prototype` keys, fail validation. JSON nesting and field paths are bounded to
64 levels/segments. Three atomic-mark probes (`$bad`, `prototype`, and `constructor` keys) are
valid under TypeScript admission but rejected by this native safe-JSON subset.
They are retained as native-unsupported value cases, separate from invalid schemas.

Document value marks accept safe JSON object/array defaults and values, plus
composite enum references with a null default or an explicit default alias as described above. They remain
one atomic mark register; `markValues.fields` remains unsupported.
Null clears a mark. TypeScript copies composite marks for each UTF-16 token, so
equal adjacent object values can produce separate spans. Scalar mark defaults,
constraints and `inherit: true` keep their existing behavior.

A flow can declare `childRules: {title: {min: 1, max: 1}}`. Bounds are integers
from 0 to 1000. Projection supplies missing required slots, hides excess authored
candidates, and promotes the next candidate after deletion. Positive-minimum
cycles are rejected. Required text, atom, flow, grid and group slots have stable
reserved addresses. Required grids provide their initial row and column.
`required_head(parent_physical_head, kind, ordinal)` returns the source head;
`required_node` returns that head for text/group slots and the fixed node marker
for other shapes. Pass the root key or `flow_head(Some(&flow))` as the parent.
The reserved actor uses `~required:<URI parent>:<URI kind>:<ordinal>`; head,
nontext marker, initial row and initial column use Lamport values 0, 1, 2 and 3.
These IDs are schema-owned. A required marker cannot be deleted, moved or changed
to another type. `delete_block` clears required text and supported flow/text descendants while
keeping those slots. It does not recursively clear grid-cell lines. Removing a
required atom/grid marker is a no-op; edit grid cell tokens through the cell APIs. Attributes, concurrent text, token
selections, History and coupled checkpoint restore use the same native storage rules.

Source insertion still needs physical `after` and `right` keys. For a required
right boundary, use the canonical text/group head 0 or nontext marker 1 from
the same parent flow. A forged ordinal, foreign parent or noncanonical marker
fails before commit. Move anchors remain block keys or source heads; a character
is not a block move anchor. Generic birth operations and `record` retain supplied
scalar attributes. The legacy group-member/inline semantic helpers omit default
birth attributes. The reference-aware birth helpers use the identity rules
listed above. Existing scalar and Graphic writers keep their prior behavior.

D2 remains partial. Axis movement, derived stored attributes,
callback rules, arbitrary computed rules, live schema changes and a complete
model-position `EditOp` compiler remain open. Only the standard computed cell
metadata described below is accepted. The earlier post-move insertion and
empty-cell head-rewrite D3 failures remain separate evidence. An empty structured
patch `{}` also exposes a D3 compiler-only clock gap: both APIs produce no
operations or model/pending change, but TypeScript consumes a discarded compiler
ticket while the native source helper does not. No new clock or Client API was
added to hide that difference.

Independent comparison passes **260 semantic actions and 520 actor states**
across four renamed descriptors, plus 19 exact schema checks. It compares
operation IDs, full raw History, pending/carets, material state, selection,
clocks and normalized models with each runtime's own checkpoint restore. A
required-anchor projection cycle that hid nonempty content after move/undo/redo
was fixed in both TS and native engines; before-failure and focused regressions
are preserved. Earlier flow/grid/shapes and six runtime-profile corpora pass
again. See `docs/reports/rust-d2-rules-2026-11-04/` for the exact scope and
separate observed compiler/JSON-identity boundaries.

The rules checkpoint passed **78 SDK tests and 120 shadow-core tests**. The
shapes checkpoint's **67 SDK / 107 core** counts are historical. These native
checks do not qualify the production Client, renderer, WASM, transport, mobile,
checkpoint exchange between runtimes, or complete D2/D3 acceptance.

Add `serde_json = "=1.0.140"` beside the Cargo path dependency. This complete
program edits a required title, keeps a foreign equal-value leaf writer through
undo/redo, applies an atomic JSON mark, and restores/retries/acknowledges work:

This example serializes a checkpoint and reconstructs it in the same process.
It does not test native process termination or server crash recovery.

<!-- runtime-rules-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn attrs(value: Value) -> Result<Attributes> { Ok(serde_json::from_value(value)?) }
fn style(doc: &mut RuntimeDocument) -> Result<Value> {
    let model = doc.model()?;
    Ok(model["children"].as_array().unwrap().iter()
        .find(|node| node["type"] == "title").unwrap()["attrs"]["style"].clone())
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"page", "marks":[],
        "markValues":{"paint":{"default":null,"inherit":false}},
        "nodes":{
            "page":{"shape":"flow","children":["paragraph","title"],
                "default":"paragraph","childRules":{"title":{"min":1,"max":1}}},
            "paragraph":{"shape":"text"},
            "title":{"shape":"text","children":["tint"],"attrs":{"style":{
                "default":{"tone":"plain","metrics":{"weight":0}},"fields":{
                    "tone":{"default":"plain"},
                    "metrics":{"default":{"weight":0},"fields":{
                        "weight":{"default":0,"min":0,"max":5}
                    }}
                }
            }}},
            "tint":{"shape":"span","mark":"paint","attr":"value"}
        }
    }))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let title = RuntimeDocument::required_head(&Key::root(), "title", 0)?;
    let text = a.insert_text_at(
        &title, None, "A😀", Attributes::new(), EditOptions::default(), 1.0,
    )?;
    b.apply_remote(&text.ops)?;
    let ids = b.line_token_ids(&title)?;
    let foreign = b.insert_text_at(
        &title, ids.last(), " from B", Attributes::new(), EditOptions::default(), 2.0,
    )?;
    a.apply_remote(&foreign.ops)?;
    let local = a.set_attributes(&title, attrs(json!({"style":{
        "tone":"red", "metrics":{"weight":2}
    }}))?, EditOptions::default(), 3.0)?;
    b.apply_remote(&local.ops)?;
    // An explicit equal-value write still gives B ownership of this leaf.
    let fence = b.set_field_path(
        &title, "style", &["tone"], json!("red"), EditOptions::default(), 4.0,
    )?;
    a.apply_remote(&fence.ops)?;
    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    assert_eq!(style(&mut a)?, json!({"tone":"red","metrics":{"weight":0}}));
    let redo = a.redo()?;
    b.apply_remote(&redo.ops)?;
    assert_eq!(style(&mut a)?, json!({"tone":"red","metrics":{"weight":2}}));
    let ids = a.line_token_ids(&title)?;
    let paint = a.format_span(
        &ids[..1], "tint", json!({"tone":"warm","levels":[1,2]}),
        EditOptions::default(), 5.0,
    )?;
    b.apply_remote(&paint.ops)?;
    assert_eq!(a.model()?, b.model()?);
    let saved = a.checkpoint()?.to_json()?;
    let mut resumed = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    assert_eq!(resumed.pending_changes(), a.pending_changes());
    let pending = resumed.pending_changes().to_vec();
    for _ in 0..2 {
        for change in &pending {
            b.apply_remote(&change.ops)?;
            resumed.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(resumed.model()?, b.model()?);
    resumed.acknowledge(&pending)?;
    assert!(resumed.pending_changes().is_empty());
    println!("PASS: required title, fields, foreign writer, JSON mark, restart/retry/ACK");
    Ok(())
}
```

### Runtime Document groups, inline nodes and spans

Document descriptors support `group`, `inline`, `span`, and scalar or supported
nullable JSON `markValues`.
Groups collect consecutive stored text members. The containing flow's child
order selects the first matching group when groups share a member type.
A span uses its declared `mark` and `attr`. The first active span in node
declaration order becomes the wrapper; other value marks remain on child runs.
Neither wrapper has a stored ID.
Insert group members and set value marks; do not insert a group or span `Node`.
Group `by` values project onto the group and are removed from its member model.
The new group-member and inline helpers validate the supplied birth attributes,
then omit null/default values from the stored birth operation. Unknown keys and
invalid values still fail. Attribute and mark updates retain their writer
operations, including same-value updates.

Use `insert_group_member_at`, `insert_inline_at`, and `insert_text_at` with a
physical head from `flow_head` or `cell_head`. Use `set_group_attribute` for
explicit member keys and their current effective text types, `set_attribute`
for inline attributes, and `delete` for
inline keys. `format_tokens` sets a declared boolean or supported atomic value mark; `format_span`
resolves the mark from a span type. `line_token_ids` returns visible character
and inline keys in that physical source line. A surrogate pair uses two UTF-16
positions; an inline token uses one. Selection APIs retain stable token anchors.
Moved blocks keep their birth sequence. These APIs do not compile arbitrary
current model insertion paths.

Scalar value marks use their declared defaults and constraints. A non-null
default fixes the scalar type; a null default also permits the safe JSON values
under the restrictions above.
Null clears a mark, and default values do not create span wrappers.
`insert_inherited_text_at` inherits boolean marks and value marks whose
specification has `inherit: true`. Explicit `insert_text_at` uses supplied marks.
Graphic runtime value marks still fail compilation; this expansion is Document
support only.

Local edits use the existing selective History, pending queue, and coupled
checkpoint APIs. Undo retains later foreign writers. Retry exact operations
with `apply_remote`; acknowledge only an accepted exact pending prefix.
Axis movement and attributes declared directly on derived
group/span wrappers remain unsupported. Structured fields and child rules use
the bounded APIs above.
General computed rules and live schema changes also remain open. D3 still
needs a complete model-position `EditOp` compiler. Full WASM, production Client,
transport, browser, and recovery/GC integration remain separate delivery work.

The historical shapes checkpoint passed **67 SDK tests and 107 shadow-core tests**. The
previous grid checkpoint passed 60 and 96 respectively; those are historical
counts. D2 remains partial. These checks do not qualify a production backend.

Independent native/TypeScript authoring passes **188 actions and 376 actor
states** across two renamed descriptors, each with multiple group/inline/span
types. The twelve schema checks now include eleven rejections and one explicit
cardinality admission after the required-child extension.
Raw History, typed operations/IDs, pending/carets, UTF-16 selections, material
storage, clocks and normalized models are compared. Each runtime restores its
own checkpoint format; cross-runtime checkpoint exchange is not qualified.
A separate empty-cell group insertion probe still observes the D3 head-rewrite
and trailing-boundary gap. Physical-source helpers do not compile that model
operation. Evidence is in `docs/reports/rust-d2-shapes-2026-11-04/`.

Add `serde_json = "1"` beside the native SDK Cargo path dependency. This complete
two-peer program checks group/inline/span edits, foreign value preservation
through undo/redo, checkpoint restore, exact retry, and acknowledgement.

<!-- runtime-shapes-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn find<'a>(value: &'a Value, kind: &str) -> Option<&'a Value> {
    if value["type"] == kind { return Some(value); }
    match value {
        Value::Object(fields) => fields.values().find_map(|v| find(v, kind)),
        Value::Array(items) => items.iter().find_map(|v| find(v, kind)),
        _ => None,
    }
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"book", "marks":["bold"],
        "markValues":{"destination":{"default":"","inherit":false}},
        "nodes":{
            "book":{"shape":"flow","children":["line","list"],"default":"line"},
            "line":{"shape":"text","children":["badge","link"]},
            "list":{"shape":"group","children":["entry"],"by":["depth"]},
            "entry":{"shape":"text","children":["badge","link"],
                "attrs":{"depth":{"default":0}}},
            "badge":{"shape":"inline","attrs":{"label":{"default":""}}},
            "link":{"shape":"span","mark":"destination","attr":"href"}
        }
    }))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let head = RuntimeDocument::flow_head(None)?;
    let (entry, _) = a.insert_group_member_at(
        &head, "list", "entry", None, None, Attributes::new(), EditOptions::default(), 1.,
    )?;
    a.insert_text_at(
        &head, Some(&entry), "A😀", Attributes::new(), EditOptions::default(), 2.,
    )?;
    let text = a.line_token_ids(&head)?;
    assert_eq!(text.len(), 3); // UTF-16: A plus two surrogate units.
    let (badge, _) = a.insert_inline_at(
        &head, "badge", text.last(), Attributes::new(), EditOptions::default(), 3.,
    )?;
    assert_eq!(a.line_token_ids(&head)?.len(), 4); // Inline occupies one position.
    a.set_attribute(&badge, "label", json!("status"), EditOptions::default(), 4.)?;
    a.set_group_attribute(&[entry], "list", "depth", json!(1), EditOptions::default(), 5.)?;
    a.format_span(&text, "link", json!("own"), EditOptions::default(), 6.)?;
    for change in a.pending_changes() { b.apply_remote(&change.ops)?; }
    let foreign = b.format_span(&text, "link", json!("peer"), EditOptions::default(), 7.)?;
    a.apply_remote(&foreign.ops)?;
    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    assert_eq!(find(&a.model()?, "link").unwrap()["attrs"]["href"], "peer");
    let redo = a.redo()?;
    b.apply_remote(&redo.ops)?;
    assert_eq!(find(&a.model()?, "link").unwrap()["attrs"]["href"], "peer");
    assert_eq!(a.model()?, b.model()?);

    let pending = a.pending_changes().to_vec();
    let checkpoint = a.checkpoint()?.to_json()?;
    a = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&checkpoint)?)?;
    assert_eq!(a.pending_changes(), pending.as_slice());
    let before_retry = a.checkpoint()?.to_json()?;
    for _ in 0..2 {
        for change in &pending {
            a.apply_remote(&change.ops)?;
            b.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(a.checkpoint()?.to_json()?, before_retry);
    assert_eq!(a.model()?, b.model()?);
    // A host acknowledges only a transport-accepted exact prefix.
    a.acknowledge(&pending)?;
    assert!(a.pending_changes().is_empty());
    println!("PASS: shapes, foreign value, History, checkpoint, retry, acknowledgement");
    Ok(())
}
```

### Runtime Document grids

A descriptor can declare multiple `grid -> row -> cell -> flow` chains with
custom names. Each cell body uses its declared flow default and child rules.
A grid can be nested in a flow or a cell. Grid and cell scalar attributes use
the declared defaults and constraints.

The grid checkpoint passed **60 SDK tests and 96 shadow-core tests**.
The later shapes checkpoint passed **67 SDK tests and 107 shadow-core tests**.
The recursive-flow checkpoint passed 55 and 89 respectively. D2 remains partial.
This native evidence does not qualify full D2, a production backend, Client
integration, mixed-runtime network delivery, or WASM.

The grid comparison passes **180 independent actions and 360 actor states**
across two renamed descriptors, each containing two different grid chains.
It compares typed operations/IDs, raw History, pending/carets, models and
material storage under declared format projections. The twelve schema checks
now include seven targeted rejections and five explicit admissions for newly
supported group/inline/value-mark/span and cardinality descriptors. Native and TS checkpoint
formats are different; this is recovery parity within each runtime, not wire
exchange. Historical post-move grid insertion probes retain the D3 grid-command
compiler gap; the paragraph model-path API below is a separate supported route.
The source-bound evidence is in `docs/reports/rust-d2-grid-2026-11-04/`.

Use `insert_grid_at` to create a grid and its rows and columns in one History
transaction. Use `insert_grid_row` and `insert_grid_column` for later axes;
`delete` removes axis keys. `insert_cell_block` and `insert_cell_text` edit cell
content. `set_cell_attribute`, `merge_cells`, and `split_cell` update cell state.
Covered cells retain their content. Splitting reveals their retained content.
`reparent_block` moves a compatible block or grid to a flow;
`reparent_block_to_cell` moves it to a cell. Axis movement is unsupported.

`flow_head`, `grid_rows_head`, `grid_columns_head`, and `cell_head` return
physical storage addresses. Rows and columns have stable token identities;
`col` is a reserved wire type. `insert_grid_at` takes a physical flow head and
positive dimensions. It allocates a dense table, so use bounded dimensions.
It does not compile a model insertion position or add a trailing text block.
Cell `after` and `right` arguments also identify physical source tokens.
Moved blocks retain their original source sequence. Selection APIs resolve
model paths and UTF-16 offsets. Paragraph model-path insertion now uses
`insert_paragraph_at`; complete grid model-position compilation remains open.

Only the standard computed cell metadata is accepted: `colspan` and `rowspan`
with default `1` and optional minimum `1`, and `spanned` with default `false`.
These values come from span projection and cannot be written directly.
Other computed rules, row attributes, model-only cell-body attributes,
axis movement and derived group/span attributes remain unsupported. Runtime groups, inline nodes,
spans and scalar Document value marks use the source-token APIs above.

The independent grid corpus authors TypeScript and native semantic actions for
renamed chains, cell bodies, selection, axes, spans, History, pending changes,
and checkpoint recovery. Its native driver uses SDK helpers. This is a bounded
native comparison; it does not establish a browser or network adapter.

This complete consumer program uses two grid chains and two actors. It checks
foreign text through undo/redo, merge/split visibility, checkpoint input,
duplicate pending replay, and acknowledgement. Add `serde_json = "1"` beside
the native SDK Cargo path dependency.

<!-- runtime-grid-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn has_units(node: &Value, text: &str) -> bool {
    if node["attrs"]["spanned"] == true {
        return false;
    }
    let units: Vec<u16> = text.encode_utf16().collect();
    match node {
        Value::Object(fields) => {
            fields.get("units") == Some(&json!(units))
                || fields.values().any(|value| has_units(value, text))
        }
        Value::Array(values) => values.iter().any(|value| has_units(value, text)),
        _ => false,
    }
}

fn find_type<'a>(node: &'a Value, kind: &str) -> Option<&'a Value> {
    if node["type"] == kind {
        return Some(node);
    }
    node["children"]
        .as_array()?
        .iter()
        .find_map(|child| find_type(child, kind))
}

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"notebook","marks":[],"nodes":{
        "notebook":{"shape":"flow","children":["line","section"],"default":"line"},
        "line":{"shape":"text"},
        "section":{"shape":"flow","children":["line","matrix"],"default":"line"},
        "matrix":{"shape":"grid","children":["band"]},
        "band":{"shape":"row","children":["tile"]},
        "tile":{"shape":"cell","children":["body"],"attrs":{
            "shade":{"default":"white"},
            "colspan":{"default":1,"min":1,"computed":true},
            "rowspan":{"default":1,"min":1,"computed":true},
            "spanned":{"default":false,"computed":true}}},
        "body":{"shape":"flow","children":["line","detail"],"default":"line"},
        "detail":{"shape":"grid","children":["track"]},
        "track":{"shape":"row","children":["entry"]},
        "entry":{"shape":"cell","children":["content"]},
        "content":{"shape":"flow","children":["caption"],"default":"caption"},
        "caption":{"shape":"text"}
    }}))?;
    let mut a = RuntimeDocument::new("A", schema.clone())?;
    let mut b = RuntimeDocument::new("B", schema)?;
    let options = EditOptions::default();
    let (section, _) = a.insert_block(
        "section",
        None,
        None,
        Attributes::new(),
        options.clone(),
        1.,
    )?;
    let head = RuntimeDocument::flow_head(Some(&section))?;
    let (grid, rows, cols, _) = a.insert_grid_at(
        &head,
        "matrix",
        None,
        2,
        2,
        Attributes::new(),
        options.clone(),
        2.,
    )?;
    let cell = RuntimeDocument::cell_head(&grid, &rows[0], &cols[0])?;
    let (nested, nr, nc, _) = a.insert_grid_at(
        &cell,
        "detail",
        None,
        1,
        1,
        Attributes::new(),
        options.clone(),
        3.,
    )?;
    a.insert_cell_text(
        &nested,
        &nr[0],
        &nc[0],
        None,
        "own😀",
        Attributes::new(),
        options.clone(),
        4.,
    )?;
    for change in a.pending_changes() {
        b.apply_remote(&change.ops)?;
    }
    let peer = b.insert_cell_text(
        &grid,
        &rows[0],
        &cols[1],
        None,
        "peer",
        Attributes::new(),
        options.clone(),
        5.,
    )?;
    a.apply_remote(&peer.ops)?;
    let undo = a.undo()?;
    b.apply_remote(&undo.ops)?;
    assert!(!has_units(&a.model()?, "own😀"));
    assert!(has_units(&a.model()?, "peer"));
    let redo = a.redo()?;
    b.apply_remote(&redo.ops)?;
    assert!(has_units(&a.model()?, "own😀"));
    assert!(has_units(&a.model()?, "peer"));
    let merge = a.merge_cells(
        &grid,
        &rows[0],
        &cols[0],
        &rows[0],
        &cols[1],
        options.clone(),
        6.,
    )?;
    b.apply_remote(&merge.ops)?;
    let merged = a.model()?;
    let covered = &find_type(&merged, "matrix").unwrap()["children"][0]["children"][1];
    assert_eq!(covered["attrs"]["spanned"], true);
    assert!(has_units(&covered["children"], "peer"));
    assert!(!has_units(&merged, "peer"));
    let split = a.split_cell(&grid, &rows[0], &cols[0], options, 7.)?;
    b.apply_remote(&split.ops)?;
    assert!(has_units(&a.model()?, "peer"));
    assert_eq!(a.model()?, b.model()?);
    let saved = RuntimeCheckpoint::from_json(&a.checkpoint()?.to_json()?)?;
    let mut restored = RuntimeDocument::restore(&saved)?;
    let before = restored.checkpoint()?.to_json()?;
    let pending = restored.pending_changes().to_vec();
    for change in &pending {
        restored.apply_remote(&change.ops)?;
    }
    assert_eq!(restored.checkpoint()?.to_json()?, before);
    restored.acknowledge(&pending)?;
    assert!(restored.pending_changes().is_empty());
    assert_eq!(restored.model()?, b.model()?);
    println!("PASS: two grid chains, peers, foreign text, spans and checkpoint retry");
    Ok(())
}
```



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
separate from that shadow checkpoint's 75 tests and TypeScript differential
evidence. The rules checkpoint passed 78 SDK tests and 120 shadow-core
tests. The nested-payload checkpoint passes 105 SDK tests and 166 shadow-core tests.
It adds four SDK tests and ten shadow-core tests to the shared-object baseline of 101 and 156.
The alias baseline passed 93 and 147. The composite checkpoint passed 86 and 138 respectively. The earlier shapes totals were 67 and 107. The grid checkpoint passed 60 and 96; these totals do not close the remaining delivery gates.

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

### Blocks without plain text

Set `text: false` on a text-shaped block to describe an image-like block that
contains inline nodes. The flag keeps the text shape: defaults, inline children,
selection offsets, and `$type` changes still use text-block rules.

Raw text admission checks the stored text types of the whole source flow. A flow
with only `text: false` blocks rejects text. A mixed flow with any text-enabled
stored type accepts raw text, including text anchored after a disabled block.
Accepted characters stay in storage and projection across type changes. The SDK
source-token methods follow this raw rule. They do not provide a complete
model-position editor command compiler.

This complete program creates an inline-only image block. It checks rejection,
concurrent peer attributes, selective undo/redo, JSON checkpoint restore, exact
pending retry, and acknowledgement. Add `serde_json = "1"` beside the SDK dependency.

<!-- runtime-textfalse-rust-example -->
```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"gallery","marks":[],"nodes":{
        "gallery":{"shape":"flow","children":["image"],"default":"image"},
        "image":{"shape":"text","text":false,"children":["photo"]},
        "photo":{"shape":"inline","attrs":{"src":{"default":""},"alt":{"default":""}}}
    }}))?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let options = EditOptions::default();
    let (image, _) =
        alice.insert_block("image", None, None, Attributes::new(), options.clone(), 1.)?;
    let (photo, _) = alice.insert_inline_at(
        &Key::root(),
        "photo",
        Some(&image),
        Attributes::from([("src".into(), json!("photo.png"))]),
        options.clone(),
        2.,
    )?;
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_text(
            Some(&image),
            "plain text",
            Attributes::new(),
            options.clone(),
            3.,
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let own = alice.set_attribute(&photo, "src", json!("updated.png"), options.clone(), 4.)?;
    let foreign = bob.set_attribute(&photo, "alt", json!("Peer caption"), options, 4.)?;
    alice.apply_remote(&foreign.ops)?;
    bob.apply_remote(&own.ops)?;
    let expected = alice.model()?;
    let saved = alice.checkpoint()?.to_json()?;
    let mut alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    let pending = alice.pending_changes().to_vec();
    for _ in 0..2 {
        for change in &pending {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.undo()?.ops)?;
    assert!(alice.model()?.to_string().contains("Peer caption"));
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!("PASS: inline-only image, peers, undo/redo and checkpoint retry");
    Ok(())
}
```

Run `cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_textfalse`
from the repository root. This is native SDK evidence. It does not establish
browser, transport, or full model-position editing support.


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

The earlier fixed-schema checkpoint passed 75/75 native tests. The corrected movement comparison passes 360 full
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
| `experiments/rust-shadow/src/shapes.rs` | Fixed and runtime group/inline/span projection and supported atomic value marks. |
| `experiments/rust-shadow/src/fields.rs` | Pure nested-field validation, canonical leaf keys and materialization. |
| `experiments/rust-shadow/src/required.rs` | Required-slot genesis, min/max projection and reserved-address checks. |
| `experiments/rust-sdk/src/runtime_schema.rs` | Physical authoring helpers, field patches, History/pending and checkpoint APIs. |
| `experiments/rust-shadow/src/history.rs` | Independent History generation and coupled ownership checkpoints. |
| `experiments/rust-shadow/src/selection.rs` | Flat token anchors and selection dispatch. |
| `experiments/rust-*-harness/` | TypeScript reference generation, native comparison, saved receipts, and traces. |
| `experiments/rust-core/` and `experiments/rust-bridge/` | Separate storage, WASM boundary, lifetime, and native Gap experiments. |

Remaining runtime schema rules, compatible live transitions, derived-wrapper attributes,
protected GC, and wider serialization/recovery behavior remain open. General object
reference identity outside the supported JSON mark contract, all raw TypeScript
rejection cases, and arbitrary malformed
inputs are not qualified by the supported JSON wire subset.

The engine has no qualified native production server or full WASM client.
Existing JavaScript editor and MCP functionality must not be described as Rust
integration evidence. A production decision requires semantic qualification,
adapter evidence, measured product targets, and a rollback plan.

See the [project roadmap](../roadmap) and
[performance evidence](../performance). The detailed research plan and raw
receipts remain in the repository's `docs/rust-roadmap.md` and `experiments/`
directories. Local documentation preview does not publish these changes.

### Unused node declarations

The registry can contain valid unused node declarations. Each declaration is checked.
Child rules still control placement. An unused type cannot be inserted under a parent
that does not allow it. Invalid unused specifications and missing references are rejected.

The original Word and Presentation manifests can compile without removing unused nodes.
The example below keeps unused text, atom, and grid declarations. It checks concurrent
edits, foreign edits after undo, JSON checkpoint restore, and duplicate pending retry.

```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"book","marks":[],"nodes":{
        "book":{"shape":"flow","children":["line"],"default":"line"},
        "line":{"shape":"text","attrs":{"label":{"default":""}}},
        "spare-text":{"shape":"text"},
        "spare-atom":{"shape":"atom"},
        "spare-grid":{"shape":"grid","children":["spare-row"]},
        "spare-row":{"shape":"row","children":["spare-cell"]},
        "spare-cell":{"shape":"cell","children":["spare-body"]},
        "spare-body":{"shape":"flow","children":["spare-text"],"default":"spare-text"}
    }}))?;
    let mut alice = RuntimeDocument::new("alice", schema.clone())?;
    let mut bob = RuntimeDocument::new("bob", schema)?;
    let options = EditOptions::default();
    let (line, _) =
        alice.insert_block("line", None, None, Attributes::new(), options.clone(), 1.)?;
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let own = alice.insert_text(Some(&line), "Hello", Attributes::new(), options.clone(), 2.)?;
    let foreign = bob.set_attribute(&line, "label", json!("Peer label"), options.clone(), 2.)?;
    alice.apply_remote(&foreign.ops)?;
    bob.apply_remote(&own.ops)?;
    let expected = alice.model()?;
    let saved = alice.checkpoint()?.to_json()?;
    let mut alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    let pending = alice.pending_changes().to_vec();
    for _ in 0..2 {
        for change in &pending {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.undo()?.ops)?;
    assert!(alice.model()?.to_string().contains("Peer label"));
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_block("spare-text", None, None, Attributes::new(), options, 3.)
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!("PASS: unused declarations, placement checks, peers, undo/redo and checkpoint retry");
    Ok(())
}
```


### Insert paragraphs at model positions

`insert_paragraph_at(&[1, 0], model, options, now_ms)` inserts a text node at a
model child path. The last index is a child index. It is not a UTF-16 offset.
`insert_model_at` also accepts a flow with text or nested flow children. Both
methods compile the complete input on a detached native document and record one
History transaction. Invalid or unsupported input leaves the original checkpoint,
clock, History and pending changes unchanged.

The compiler resolves the current flow projection. It reuses or retypes the
stored head at index zero, keeps required-child boundaries, and expands structured
attributes into leaf registers. Text runs use UTF-16. Inline nodes and schema
spans are supported. Null and default-valued marks are omitted. A returned key
identifies the inserted paragraph, including a reused head.

This API is bounded. It rejects text-offset paths and a supplied node attribute
map that mixes a structured branch with other attributes. An insertion that ends with a
reserved ticket and no wire operation also rejects. The required-slot end route
uses a detached source fragment, a new paragraph marker and one placement
operation for that new marker. Existing head placement writers stay unchanged.
Schema-owned reference handles
are not accepted in these JSON model inputs. Use the physical APIs for explicit
source tokens; `insert_block_in` keeps its physical-source contract. Checkpoints
restore the same native schema and actor. This is not a cross-language checkpoint
format. Renderer, WASM, network, mobile and performance checks are outside this
example.

Run `cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml
--example runtime_paragraph` from the repository root. The complete program is:

```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"document", "marks":["bold"], "nodes":{
            "document":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
            "section":{"shape":"flow","children":["heading","paragraph","header"],"default":"heading","childRules":{"header":{"min":1,"max":1}}},
            "heading":{"shape":"text"},
            "paragraph":{"shape":"text","attrs":{"style":{
                "default":{"align":"left","spacing":1},
                "fields":{"align":{"default":"left","values":["left","center","right"]},"spacing":{"default":1,"min":0.5,"max":4}}
            }}},
            "header":{"shape":"atom"}
        }
    }))?;
    let mut alice = RuntimeDocument::new("A", schema.clone())?;
    let mut bob = RuntimeDocument::new("B", schema)?;
    let (section, birth) = alice.insert_model_at(
        &[1],
        json!({"type":"section","children":[{"type":"paragraph","runs":[{"text":"First 😀","marks":{"bold":true}}]}]}),
        EditOptions::default(), 1.,
    )?;
    bob.apply_remote(&birth.ops)?;
    let (paragraph, inserted) = alice.insert_paragraph_at(
        &[1, 1],
        json!({"type":"paragraph","attrs":{"style":{"align":"center","spacing":2}},"runs":[{"text":"Second"}]}),
        EditOptions::default(), 2.,
    )?;
    bob.apply_remote(&inserted.ops)?;
    let range = Selection {
        anchor: Position(vec![1, 1, 0]),
        focus: Position(vec![1, 1, 6]),
    };
    let anchors = alice.capture_selection(Some(range.clone()))?;
    assert_eq!(alice.resolve_selection(anchors)?, Some(range));
    let own = alice.set_field_path(
        &paragraph,
        "style",
        &["align"],
        json!("left"),
        EditOptions::default(),
        3.,
    )?;
    bob.apply_remote(&own.ops)?;
    let foreign = bob.set_field_path(
        &paragraph,
        "style",
        &["align"],
        json!("right"),
        EditOptions::default(),
        4.,
    )?;
    alice.apply_remote(&foreign.ops)?;
    let head = RuntimeDocument::flow_head(Some(&section))?;
    let peer = bob.insert_text_at(
        &head,
        Some(&paragraph),
        "Peer ",
        Attributes::new(),
        EditOptions::default(),
        5.,
    )?;
    alice.apply_remote(&peer.ops)?;
    let expected = alice.model()?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    let saved = alice.checkpoint()?.to_json()?;
    alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes().to_vec() {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_paragraph_at(
            &[1, 0],
            json!({"type":"paragraph","runs":[{"text":"invalid","marks":{"unknown":true}}]}),
            EditOptions::default(),
            6.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!(
        "PASS: model paragraphs, default retype, fields, peers, History and own checkpoint retry"
    );
    Ok(())
}
```

### Insert at current model positions after moves

Use `insert_paragraph_at` or `insert_model_at` after a block has moved. Pass its
current model child path. The compiler resolves the current accepted placement,
including moves that were undone or suppressed by cycle rules. Block IDs remain
stable; a physical source token and a current model child index are different
addresses. The existing physical `after`/`right` APIs keep their contract.

A text node or a supported recursive flow/text model is inserted as one History
transaction. The compiler prepares only the needed target and ancestor flows.
If the canonical model needs an empty leading default, it creates a fresh default
identity before inserting. It does not move or overwrite an existing sibling to
repair the index. Stored text and foreign placement writers remain retained even
when child maximum rules hide them from the model.

Appending at a gap that a paragraph moved away from does not absorb that
paragraph into the new text. Concurrent edits at the same observed gap retain
the existing coalescence rule.

The program below receives Bob's movement before Alice inserts. It then checks
foreign text and field edits, selection, undo, redo, own JSON checkpoint restore,
exact pending retries and acknowledgement. A pending insertion also remains
valid if its predecessor is concurrently moved or deleted before receipt.
These are native SDK checks; they do not connect a network transport or editor.

Group/grid construction and paths now use `insert_model_at` as described below.
Text-offset paths, mixed structured node attribute maps, trailing reserved-only
transactions and schema reference handles in model JSON remain unsupported.
Invalid native inputs reject before changing the original checkpoint. TypeScript
can normalize malformed model attributes that the native API rejects; this is
not a claim of identical malformed-input admission. A checkpoint restores the
same runtime, schema and actor; it is not a cross-runtime checkpoint format.

Run `cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml
--example runtime_moved` from the repository root. The complete program is:

```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({
        "root":"document","marks":["bold"],"nodes":{
            "document":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
            "section":{"shape":"flow","children":["paragraph","section"],"default":"paragraph"},
            "paragraph":{"shape":"text","attrs":{"style":{
                "default":{"align":"left"},
                "fields":{"align":{"default":"left","values":["left","center","right"]}}
            }}}
        }
    }))?;
    let mut alice = RuntimeDocument::new("A", schema.clone())?;
    let mut bob = RuntimeDocument::new("B", schema)?;
    let (section, _) = alice.insert_model_at(
        &[1],
        json!({"type":"section","children":[{"type":"paragraph","runs":[{"text":"First"}]}]}),
        EditOptions::default(),
        1.,
    )?;
    let (second, _) = alice.insert_paragraph_at(
        &[1, 1],
        json!({"type":"paragraph","runs":[{"text":"Second"}]}),
        EditOptions::default(),
        2.,
    )?;
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let movement = bob.reparent_block(&second, Some(&section), None, EditOptions::default(), 3.)?;
    alice.apply_remote(&movement.ops)?;
    let original_writer = alice.state()?["placements"][second.as_str()].clone();
    let (_, inserted) = alice.insert_paragraph_at(
        &[1, 1],
        json!({"type":"paragraph","attrs":{"style":{"align":"center"}},"runs":[{"text":"New😀","marks":{"bold":true}}]}),
        EditOptions::default(), 4.,
    )?;
    bob.apply_remote(&inserted.ops)?;
    let range = Selection {
        anchor: Position(vec![1, 1, 0]),
        focus: Position(vec![1, 1, 5]),
    };
    let anchors = alice.capture_selection(Some(range.clone()))?;
    assert_eq!(
        alice.resolve_selection(anchors.clone())?,
        Some(range.clone())
    );
    let foreign = bob.set_field_path(
        &second,
        "style",
        &["align"],
        json!("right"),
        EditOptions::default(),
        5.,
    )?;
    alice.apply_remote(&foreign.ops)?;
    let head = RuntimeDocument::flow_head(Some(&section))?;
    let text = bob.insert_text_at(
        &head,
        Some(&second),
        "Peer ",
        Attributes::new(),
        EditOptions::default(),
        6.,
    )?;
    alice.apply_remote(&text.ops)?;
    let expected = alice.model()?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(
        alice.model()?["children"][1]["children"][0]["attrs"]["style"]["align"],
        "right"
    );
    let saved = alice.checkpoint()?.to_json()?;
    alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes().to_vec() {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(alice.resolve_selection(anchors)?, Some(range));
    assert_eq!(
        alice.state()?["placements"][second.as_str()],
        original_writer
    );
    let (_, nested) = alice.insert_model_at(
        &[0],
        json!({"type":"section","children":[{"type":"paragraph","runs":[{"text":"Nested"}]}]}),
        EditOptions::default(),
        7.,
    )?;
    bob.apply_remote(&nested.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_paragraph_at(
            &[0, 0],
            json!({"type":"paragraph","runs":[{"text":"x","marks":{"unknown":true}}]}),
            EditOptions::default(),
            8.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!(
        "PASS: moved model insertion, foreign writers, selection, History and own checkpoint retry"
    );
    Ok(())
}
```

### Insert groups, grids and cell contents by model path

Use the existing `insert_model_at` for nonempty text-list groups, tables and
supported flow/text children. Paths select current model children, including
existing moved structures. The schema determines the node names and cell body
type; the compiler does not require the names in this example.

A text `group` is a derived wrapper. Its declared `by` values are inherited by
members, and explicit member values win. The returned key identifies the first
stored member. It is not a separate wrapper ID. Inserting a parent-admitted
paragraph or table at a group member gap can split the wrapper into two groups.
Use a stored flow for a document object group with its own ID or table children.

For a table at root child index `g`, the accepted paths include:

| Path | Effect | Returned key |
| --- | --- | --- |
| `[g]` | Insert a table at the root child gap | New grid identity |
| `[g, rowGap]` | Insert a row into an existing table | New row axis identity |
| `[g, row, colGap]` | Insert a column across all rows; fill the selected row | New column axis identity |
| `[g, row, col, 0, childGap]` | Insert in the selected cell body's children | Inserted stored identity |

Nested tables use the corresponding longer parent path when the body schema
allows a table child. The body selector is
`0`. Covered cells remain addressable and keep their content. New ragged tables
use the maximum supplied row width and implicit missing cells. In an existing
table, row insertion keeps its current width; valid excess supplied cells are
ignored by the existing command contract. Insert columns explicitly when needed.
These are dense document-table models. Use the separate Spreadsheet APIs for
sparse sheets.

Cell content is filled before spans and custom attributes. Cell field patches
retain input order, including a structured branch beside scalar attributes.
`rowspan` and `colspan` use positive integer or null input and clamp to the
available axes. `spanned` is computed and is not written as an ordinary field.
A merge hides content in the editor without deleting the retained cell data.

Each call is one atomic native History transaction. A rejected input preserves
the original state, clock, History and pending queue. Existing physical helpers
keep their source-token contracts. Multiple calls do not implement the shared
column memo of a multi-command TS batch; atomic batch editing is a later D3 gate.
Axis moves are also separate from model insertion.

Empty groups and tables with no rows or no columns reject before mutation: the
existing `(Key, Change)` result cannot identify an absent stored result. TS can
normalize these inputs to no insertion, so this is a recorded policy boundary.
Malformed values, uncompiled row/body-wrapper attributes and a nonzero body
selector also reject. General node attribute maps still retain the earlier
mixed structured-branch limits; this cell-attribute expansion is not arbitrary
node-attribute normalization or JSON reference-handle input support.

Run `cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml
--example runtime_group_grid` from the repository root. This complete program
checks derived groups, row and column identities, cell paths, foreign fields,
selection, undo/redo, pending retries and own JSON checkpoint restoration:

```rust
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text,"marks":{"bold":true}}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"document","marks":["bold"],"nodes":{
        "document":{"shape":"flow","children":["paragraph","list","table"],"default":"paragraph"},
        "paragraph":{"shape":"text"},
        "list":{"shape":"group","children":["item"],"by":["mode"]},
        "item":{"shape":"text","attrs":{"mode":{"default":"bullet","values":["bullet","numbered"]},"depth":{"default":0,"min":0,"max":8}}},
        "table":{"shape":"grid","children":["row"],"attrs":{"header":{"default":false,"values":[false,true]}}},
        "row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"],"attrs":{
            "rowspan":{"default":1,"min":1,"computed":true},"colspan":{"default":1,"min":1,"computed":true},"spanned":{"default":false,"computed":true},
            "background":{"default":""},"properties":{"default":{"label":"","done":false},"fields":{"label":{"default":""},"done":{"default":false,"values":[false,true]}}}
        }},
        "body":{"shape":"flow","children":["paragraph","list","table"],"default":"paragraph"}
    }}))?;
    let mut alice = RuntimeDocument::new("A", schema.clone())?;
    let mut bob = RuntimeDocument::new("B", schema)?;
    let (_first_member, _) = alice.insert_model_at(
        &[1],
        json!({"type":"list","attrs":{"mode":"numbered"},"children":[{"type":"item","runs":[{"text":"First"}]},{"type":"item","runs":[{"text":"Last"}]}]}),
        EditOptions::default(), 1.,
    )?;
    alice.insert_model_at(
        &[1, 1],
        json!({"type":"item","runs":[{"text":"Middle"}]}),
        EditOptions::default(),
        2.,
    )?;
    let mut first = cell("00");
    first["attrs"] = json!({"properties":{"label":"owned","done":true},"background":"#ffffff"});
    let (grid, _) = alice.insert_model_at(
        &[2],
        json!({"type":"table","children":[{"type":"row","children":[first,cell("01")]},{"type":"row","children":[cell("10"),cell("11")]}]}),
        EditOptions::default(), 3.,
    )?;
    let (_row_axis, _) = alice.insert_model_at(
        &[2, 1],
        json!({"type":"row","children":[cell("Row")]}),
        EditOptions::default(),
        4.,
    )?;
    let (_column_axis, _) =
        alice.insert_model_at(&[2, 0, 1], cell("New😀"), EditOptions::default(), 5.)?;
    for change in alice.pending_changes() {
        bob.apply_remote(&change.ops)?;
    }
    let range = Selection {
        anchor: Position(vec![2, 0, 1, 0, 0, 0]),
        focus: Position(vec![2, 0, 1, 0, 0, 5]),
    };
    let anchors = alice.capture_selection(Some(range.clone()))?;
    assert_eq!(
        alice.resolve_selection(anchors.clone())?,
        Some(range.clone())
    );
    let foreign = bob.set_attribute(&grid, "header", json!(true), EditOptions::default(), 6.)?;
    alice.apply_remote(&foreign.ops)?;
    let expected = alice.model()?;
    bob.apply_remote(&alice.undo()?.ops)?;
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(alice.model()?["children"][2]["attrs"]["header"], true);
    let saved = alice.checkpoint()?.to_json()?;
    alice = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(&saved)?)?;
    for _ in 0..2 {
        for change in alice.pending_changes().to_vec() {
            alice.apply_remote(&change.ops)?;
            bob.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(alice.checkpoint()?.to_json()?, saved);
    bob.apply_remote(&alice.redo()?.ops)?;
    assert_eq!(alice.model()?, expected);
    assert_eq!(alice.model()?, bob.model()?);
    assert_eq!(alice.resolve_selection(anchors)?, Some(range));
    let before = alice.checkpoint()?.to_json()?;
    assert!(alice
        .insert_model_at(
            &[0],
            json!({"type":"table","children":[]}),
            EditOptions::default(),
            7.
        )
        .is_err());
    assert_eq!(alice.checkpoint()?.to_json()?, before);
    let pending = alice.pending_changes().to_vec();
    alice.acknowledge(&pending)?;
    assert!(alice.pending_changes().is_empty());
    println!("PASS: model groups, grid axes, cell paths, foreign fields and own checkpoint retry");
    Ok(())
}
```


### Insert several models atomically

Use `RuntimeDocument::insert_models_batch` for an ordered array of supported
model-child insertions. Each command has `at` and `model`. Later commands see
the result of earlier commands. Inserting cells at the same column index in
different rows shares one column identity; repeating a row creates another
column, following the TS compiler.

The compiler works on a detached candidate and commits once. If a later command
fails, the live document, clock, History and existing pending changes remain
unchanged. With default History options, one undo reverses the whole batch.
The existing typing option keeps its normal coalescing rule.

```rust
//! One native insert-only batch, shared columns, checkpoint restore and undo.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"paragraph","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}
fn insert(at: &[usize], model: Value) -> ModelInsert {
    ModelInsert {
        at: at.into(),
        model,
    }
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["paragraph","table"],"default":"paragraph"},
        "paragraph":{"shape":"text"},"table":{"shape":"grid","children":["row"]},
        "row":{"shape":"row","children":["cell"]},"cell":{"shape":"cell","children":["body"]},
        "body":{"shape":"flow","children":["paragraph"],"default":"paragraph"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let before = doc.model()?;
    let table = json!({"type":"table","children":[
        {"type":"row","children":[cell("top")]},
        {"type":"row","children":[cell("bottom")]}
    ]});
    let result = doc.insert_models_batch(
        &[
            insert(&[1], table),
            insert(&[1, 0, 1], cell("new top")),
            insert(&[1, 1, 1], cell("new bottom")),
            insert(&[1, 0, 1, 0, 1], paragraph("second block")),
        ],
        EditOptions::default(),
        1.,
    )?;
    assert_eq!(result.keys[1], result.keys[2]);
    assert_eq!(doc.pending_changes(), &[result.change.clone()]);
    let after = doc.model()?;
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    doc.undo()?;
    assert_eq!(doc.model()?, before);
    assert!(!doc.history_status()?.can_undo);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
```

| Result | Meaning |
| --- | --- |
| `keys` | One `Option<Key>` per input. A group returns its first stored member, a row its axis, and a cell its column axis. Shared columns can return the same key. |
| `change` | One aggregate `Change`, including preparation operations. Empty `ops` creates no pending queue entry. |
| `clock_before`, `clock_after` | The sender's clock before and after compilation, including reserved tickets. Own checkpoints preserve the final value. |

`None` means the requested model has no stored identity. It does not by itself
mean no operations occurred. For example, a normalized-empty grid at the start
of an unprojected document can create a paragraph tail. With projection active,
that command can reserve a ticket without an operation. Empty command arrays
allocate nothing. In the simple empty-group case there are no operations either;
existing preparation or promotion can affect that result in other documents.
Clock-only results preserve pending changes and the redo branch.

The internal History commit can preserve a bounded reservation above the last
operation stamp. A reservation-bearing runtime checkpoint carries explicit
`reservedClock` metadata. It must equal the saved clock and exceed the replayed
operation clock, within the supported maximum. Without that metadata, the saved
clock must equal the replayed clock. Canonical operation-journal validation stays
in place. Observing an actual ticket at or above the reservation removes the
metadata; lower tickets retain it.

Existing ordinary checkpoints retain their previous shape. Reservation-bearing
checkpoints require the updated native reader; older readers are not qualified
for this optional snapshot extension. This is counter-state validation, not
proof of server acceptance or authorization. The wire operations and History
steps are unchanged.

This is an insert-only API. It does not accept general delete, update, split,
merge or move commands, text-offset paths, or schema-value reference handles.
Unsupported node/attribute rules retain the existing native input policy.
Path indices remain bounded even for an empty group. A known empty grid that
the parent does not admit is rejected; TS may normalize it away. These are
explicit input-policy differences, not stored-child rule changes.
The strict single-model `insert_model_at` API still rejects empty structures
and trailing reserved-only transactions.

For delivery retries, reuse the captured pending `Change`; calling the batch
method again creates a new edit. Own checkpoint recovery is not a durable
native server or transport implementation. This method is a native Rust SDK
feature; it does not install a Rust/WASM backend in `Client` or editor bindings.

Run the complete repository example with:

```sh
cargo run --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_batch
```


### Insert relative to stored IDs

Use `read_model_for_edit` to read the model and capture an opaque local base.
`insert_models_relative` resolves each command against the evolving candidate,
then commits once. The target can be before/after one visible stored primary
block, or the start/end of the root or a visible stored flow body.

```rust
//! A process-local read base and strict identity-relative insertion.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box"],"default":"p"},
        "p":{"shape":"text"},"box":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let (anchor, _) = doc.insert_model_at(&[1], paragraph("anchor"), EditOptions::default(), 1.)?;
    let read = doc.read_model_for_edit()?;
    let result = doc.insert_models_relative(
        &read.base,
        &[
            RelativeModelInsert {
                target: RelativeModelTarget::After(anchor.clone()),
                model: paragraph("first"),
            },
            RelativeModelInsert {
                target: RelativeModelTarget::After(anchor),
                model: paragraph("second"),
            },
        ],
        EditOptions::default(),
        2.,
    )?;
    let after = doc.model()?;
    // The successful publication consumes this local base, even for an empty retry.
    assert!(doc
        .insert_models_relative(&read.base, &[], EditOptions::default(), 3.)
        .is_err());
    doc.undo()?;
    assert_eq!(doc.model()?, read.model);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    let fresh = doc.read_model_for_edit()?;
    doc.insert_models_relative(
        &fresh.base,
        &[RelativeModelInsert {
            target: RelativeModelTarget::InsideEnd(FlowTarget::Root),
            model: paragraph("end"),
        }],
        EditOptions::default(),
        4.,
    )?;
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
```

| Target | Meaning |
| --- | --- |
| `Before(key)`, `After(key)` | Insert beside that exact current stored block. A moved block keeps its ID and uses its current parent. |
| `InsideStart(FlowTarget::Root)`, `InsideEnd(FlowTarget::Root)` | Insert at the root flow edge. |
| `InsideStart(FlowTarget::Node(key))`, `InsideEnd(FlowTarget::Node(key))` | Insert at a visible stored flow body's edge. Text, grid, atom and derived group wrappers are not flow bodies. |

A stored group member uses its current member slot and group attributes. It
does not address the whole derived wrapper. Later commands resolve again after
earlier inserts. Two `After(K)` commands therefore put the second insert closer
to K; repeat `InsideEnd` when appending in command order.

Only positive-clock stored primary IDs qualify. Missing, deleted, aliased,
ancestor-hidden, overflow-hidden and covered-cell targets reject. Text characters,
inline nodes, axes and synthetic/default heads are not block targets here.
A key returned by an older insertion that names an intrinsic head does not
become a stored target; use an explicit root edge or the model-path API.
Stored blocks inside visible cells can be sibling targets; direct cell-wrapper
and stable row/column targeting need their separate API contract.

The base has private instance, revision and schema-identity fields. It cannot
be serialized or reconstructed from a checkpoint. Every successful document
publication consumes it, including duplicate/empty apply, empty batches and
clock-only operations. Failed calls, reads and acknowledgement alone preserve
it. Restoring even an identical checkpoint creates a new instance and invalidates
old bases. A stale base rejects before compilation; read again and reassess the
same ID rather than silently edit a nearby node.

The local base check is independent of document history size. Model reading,
strict ID lookup and detached compilation still perform document-sized work.
Lookup captures one state per command and reuses projection, liveness and cell
indexes; it does not export the whole state for every descendant. No new latency
or memory benchmark is implied by this API.

This is a synchronous native SDK guard, not a server version, lease or acceptance
receipt. It adds no hosted authorization or automatic rebase. Existing TS hosted
conditional edits keep their epoch/server-sequence/schema checks. General native
commands, production Rust/WASM bindings and native durable transport remain
separate delivery gates.

Run the complete example with:

```sh
cargo run --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_targeting
```


### Address rows and cell bodies with stable IDs

Document grids have stored row/column axes. Use `insert_grid_models_relative`
with the same local base as other relative inserts. A row target pairs its grid
and row IDs; a cell target adds the column ID. No new cell-wrapper ID is needed.

```rust
//! Stable grid/row/column IDs select row adjacency and current cell-body edges.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}
fn row(text: &str) -> Value {
    json!({"type":"row","children":[cell(text),cell(text)]})
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","table"],"default":"p"},"p":{"shape":"text"},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let (grid, seed) = doc.insert_model_at(
        &[1],
        json!({"type":"table","children":[row("top"),row("bottom")]}),
        EditOptions::default(),
        1.,
    )?;
    let axes = |kind: &str| {
        seed.ops
            .iter()
            .filter_map(|op| match op.raw_operation() {
                Op::Node { id, node_type, .. } if node_type == kind => Some(Key::from_ticket(id)),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    let rows = axes("row");
    let columns = axes("col");
    let read = doc.read_model_for_edit()?;
    let result = doc.insert_grid_models_relative(
        &read.base,
        &[
            GridModelInsert {
                target: GridModelTarget::BeforeRow(GridRowTarget {
                    grid: grid.clone(),
                    row: rows[1].clone(),
                }),
                model: row("new row"),
            },
            GridModelInsert {
                target: GridModelTarget::InsideCellEnd(GridCellTarget {
                    grid,
                    row: rows[1].clone(),
                    column: columns[1].clone(),
                }),
                model: paragraph("same original cell"),
            },
        ],
        EditOptions::default(),
        2.,
    )?;
    assert!(result.keys[0].as_ref().unwrap().ticket()?.lamport > 0);
    let after = doc.model()?;
    assert_eq!(
        after["children"][1]["children"].as_array().unwrap().len(),
        3
    );
    doc.undo()?;
    assert_eq!(doc.model()?, read.model);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    assert_eq!(doc.model()?, after);
    assert!(doc
        .insert_grid_models_relative(&read.base, &[], EditOptions::default(), 3.)
        .is_err());
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
```

| Target | Payload and behavior |
| --- | --- |
| `BeforeRow`, `AfterRow` with `GridRowTarget {grid, row}` | Insert one RowModel at the current axis position. The result key is the new row axis. |
| `InsideCellStart`, `InsideCellEnd` with `GridCellTarget {grid, row, column}` | Insert a supported model child at the current cell body's edge. |

The sample gets axis IDs from a Change that creates only this one grid. Existing
or nested documents must use the matching grid's current projection or tracked
IDs; an operation's `row`/`col` kind alone does not identify its owning grid.
The local catalog prototype below can discover owned axes for current grids.

Every tuple must reference one current visible stored grid and its live axes.
Wrong-grid, deleted-axis, hidden-grid and currently covered-cell targets reject.
A merged cell's top-left anchor is editable. Generic `Before(row)` and
`Inside(Node(grid))` remain unsupported; use the typed grid method.

Row insertion retains the existing fixed-width, span and hidden-content rules.
A new row inside an anchored merge can become covered; this does not reject the
row or discard its payload. Explicit new overlapping spans follow the existing
newest-writer projection rule. A computed `spanned` input does not override that
projection. Cell-body insertion results can reuse an intrinsic head, so their
non-None key is not automatically a generic stored-block anchor.

Commands resolve sequentially against one candidate. A row insertion can shift
indices while a following tuple still addresses the same original cell. One
commit uses the existing History options and pending Change semantics. Late
failure preserves the complete checkpoint and local base; retry reuses captured
operations. For column creation, use the explicit command below. Axis movement remains separate.

These are dense Document-grid APIs. The sparse Spreadsheet protocol is separate.
This native SDK feature adds no server acceptance, hosted permissions or WASM
editor backend. Run the complete example with:

```sh
cargo run --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_grid_targeting
```

### Discover current stored targets

`read_model_with_catalog` is a local prototype. It returns one model, its opaque
process-local edit base and current stored targets. Block entries include a key,
diagnostic path, node type and flow capability. Grid entries contain owned row
and column IDs plus uncovered cell tuples and body paths. Synthetic defaults,
group wrappers and covered descendants have no entries. Commands still validate
targets; a catalog entry grants no permission. Read again after a successful edit.

This complete example uses a flow schema to activate Document projections:

```rust
use doc_sync_native_sdk::*;
use serde_json::json;

fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","box"],"default":"p"},
        "p":{"shape":"text"},
        "box":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("catalog-example", schema)?;
    doc.insert_model_at(
        &[1],
        json!({"type":"p","runs":[{"text":"first"}]}),
        EditOptions::default(),
        1.,
    )?;
    let read = doc.read_model_with_catalog()?;
    let paragraph = read.catalog.blocks.iter()
        .find(|block| block.node_type == "p")
        .expect("stored paragraph is discoverable");
    assert_eq!(paragraph.path, vec![1]);
    doc.insert_models_relative(
        &read.base,
        &[RelativeModelInsert {
            target: RelativeModelTarget::After(paragraph.key.clone()),
            model: json!({"type":"p","runs":[{"text":"after discovered ID"}]}),
        }],
        EditOptions::default(),
        2.,
    )?;
    assert_ne!(doc.read_model_with_catalog()?.base, read.base);
    println!("catalog-to-command round trip passed");
    Ok(())
}
```

Run the repository example with:

```sh
cargo run --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_id_catalog
```

The Nov 16 prototype receipt records five focused and 30 inherited targeting
tests plus the example PASS. Broader required/nested fixtures, independent
comparison, complete consumers and alias diagnostics remain open. These
historical checks do not complete Q1.3.4 or qualify server/WASM integration.

### Insert one column by stable IDs

`insert_column_relative` creates exactly one column in a visible Document grid.
Pass a current local base, one stable boundary and unique row-ID/cell-model
payloads. Rows can appear in any order; that caller order controls new span
writer priority. Every supplied cell fills the same new column. Omitted rows get
normal default cells. An empty `cells` array still creates one column by seeding
the first live row internally.

```rust
//! One stable column boundary and caller-ordered row payloads.
use doc_sync_native_sdk::*;
use serde_json::{json, Value};

fn paragraph(text: &str) -> Value {
    json!({"type":"p","runs":[{"text":text}]})
}
fn cell(text: &str) -> Value {
    json!({"type":"cell","children":[{"type":"body","children":[paragraph(text)]}]})
}
fn main() -> Result<()> {
    let schema = RuntimeSchema::compile(json!({"root":"doc","marks":[],"nodes":{
        "doc":{"shape":"flow","children":["p","table"],"default":"p"},"p":{"shape":"text"},
        "table":{"shape":"grid","children":["row"]},"row":{"shape":"row","children":["cell"]},
        "cell":{"shape":"cell","children":["body"]},"body":{"shape":"flow","children":["p"],"default":"p"}
    }}))?;
    let mut doc = RuntimeDocument::new("A", schema)?;
    let (grid, seed) = doc.insert_model_at(
        &[1],
        json!({"type":"table","children":[
            {"type":"row","children":[cell("00"),cell("01")]},
            {"type":"row","children":[cell("10"),cell("11")]}
        ]}),
        EditOptions::default(),
        1.,
    )?;
    let axes = |kind: &str| {
        seed.ops
            .iter()
            .filter_map(|op| match op.raw_operation() {
                Op::Node { id, node_type, .. } if node_type == kind => Some(Key::from_ticket(id)),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    let rows = axes("row");
    let columns = axes("col");
    let read = doc.read_model_for_edit()?;
    let result = doc.insert_column_relative(
        &read.base,
        &ColumnInsert {
            grid: grid.clone(),
            boundary: ColumnBoundary::Before(columns[1].clone()),
            cells: vec![
                RowCellPayload {
                    row: rows[1].clone(),
                    model: cell("new bottom"),
                },
                RowCellPayload {
                    row: rows[0].clone(),
                    model: cell("new top"),
                },
            ],
        },
        EditOptions::default(),
        2.,
    )?;
    assert_eq!(result.keys.len(), 1);
    let column = result.keys[0].clone().unwrap();
    assert!(column.ticket()?.lamport > 0);
    let after = doc.model()?;
    assert_eq!(
        after["children"][1]["children"][0]["children"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    doc.undo()?;
    assert_eq!(doc.model()?, read.model);
    doc.redo()?;
    assert_eq!(doc.model()?, after);
    doc = RuntimeDocument::restore(&RuntimeCheckpoint::from_json(
        &doc.checkpoint()?.to_json()?,
    )?)?;
    let fresh = doc.read_model_for_edit()?;
    doc.insert_grid_models_relative(
        &fresh.base,
        &[GridModelInsert {
            target: GridModelTarget::InsideCellEnd(GridCellTarget {
                grid,
                row: rows[0].clone(),
                column,
            }),
            model: paragraph("later body edit"),
        }],
        EditOptions::default(),
        3.,
    )?;
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}
```

| Boundary | Position |
| --- | --- |
| `ColumnBoundary::Start` | Before the first current column. |
| `ColumnBoundary::End` | After the last current column. |
| `ColumnBoundary::Before(column)` | Before that live column in this grid. |
| `ColumnBoundary::After(column)` | After that live column in this grid. |

The result reuses `ModelInsertBatchResult`: exactly `keys == [Some(newColumn)]`,
one aggregate Change and before/after clocks. The new column key can be used in
a later `GridCellTarget` after reading a fresh base. Each public call creates a
distinct column. General multi-column atomic commands and axis movement are
separate roadmap work.

The sample extracts axes from a Change that creates only one grid. For existing
or nested grids, use that grid's current projection or tracked owned IDs. A raw
operation kind alone does not establish ownership. The grid must currently have
live rows and columns. Hidden/zero-axis grids are not revived; duplicate,
wrong-grid or deleted payload rows reject before publication. A late error
preserves the complete checkpoint, redo and local base.

New cells inside existing merged ranges can be covered while retaining their
payload. Existing anchored spans grow and newer overlapping span writers keep
their normal precedence. The operation does not split merges or redirect data.
A subsequent direct covered-cell body target still rejects. Nested tables can
create their own axes; the exactly-one-column invariant applies to the targeted
grid, whose row IDs stay unchanged.

Empty payload is a structural edit, not a no-op. The internal empty seed adds no
text, attributes or span writer. Existing promotion/default preparation can add
other operations or consume clocks, so aggregate Change length and clock delta
are not universally one. Default History options give one undo action; existing
typing coalescence keeps its rule.

This private native API does not supply a server acceptance token, production
WASM backend or sparse Spreadsheet column operation. Run the full program with:

```sh
cargo run --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_column_targeting
```
