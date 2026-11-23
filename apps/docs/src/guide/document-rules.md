# Document rules and persistent ranges

A shape describes how a node stores content. Rules describe how that content can appear. The same nine shapes support required children, field-level attributes, persistent annotations and block placement.

For a client-backed editor, prefer [Client](./client) and call
`client.edit(edits)` to apply and record one action (and queue it in sync mode).
Do not commit that return value again. The lower-level `Doc.edit()` examples
below return `{ops, normalize}` and retain their separate commit contract.

## Child counts

Add `childRules` to a flow. Each key must name one of that flow's declared children. Bounds are integers from 0 to 1000. An omitted minimum means 0. An omitted maximum means no upper bound.

```ts
const schema: Schema = {
    root: "document",
    marks: [],
    nodes: {
        document: {
            shape: "flow",
            children: ["paragraph", "figure"],
            default: "paragraph",
        },
        paragraph: {shape: "text"},
        figure: {
            shape: "flow",
            children: ["image", "caption"],
            default: "caption",
            childRules: {
                image: {min: 1, max: 1},
                caption: {min: 1, max: 1},
            },
        },
        image: {shape: "atom", attrs: {src: {default: ""}}},
        caption: {shape: "text"},
    },
};
```

A missing required child uses a stable, editable fallback identity. Concurrent insertions can exceed a maximum in stored state. The document selects visible children in a deterministic order and retains the remaining candidates. It does not reject a remote insertion because a local count has changed. Use `doc.overflow(lineKey)` to inspect retained candidates. These rules are part of the schema; all replicas must use the same schema.

## Nested attributes

A scalar attribute remains one last-writer-wins register. Add `fields` to an object attribute when its declared leaves must merge independently.

```ts
const paragraph = {
    shape: "text",
    attrs: {
        appearance: {
            default: {color: "black", spacing: {before: 0, after: 0}},
            fields: {
                color: {default: "black"},
                spacing: {
                    default: {before: 0, after: 0},
                    fields: {
                        before: {default: 0, min: 0},
                        after: {default: 0, min: 0},
                    },
                },
            },
        },
    },
};
```

An update is a patch. Omitted leaves keep their values. Setting a branch to `null` resets its declared descendants to their defaults. Setting a leaf to `null` resets that leaf. Arrays remain atomic values.

```ts
const {ops} = client.doc.edit([
    {op: "update", at: [0], attrs: {appearance: {spacing: {before: 12}}}},
]);
client.commit(ops);
```

If one user changes `color` and another changes `spacing.before`, both changes remain. Concurrent changes to one leaf use the existing Ticket order. Undo changes an owned leaf only while that exact write is current. An explicit same-value write still records ownership. Unknown fields, dangerous property names and malformed field paths are rejected. Field schemas apply to stored text, inline, nested flow, grid and atom nodes, and to cell attributes. Schema validation rejects `fields` on the root, row, cell-body flow, group and span attribute positions. Value marks do not support `fields`.

## Persistent annotations

Presence describes a connected user's current selection. An annotation stores a range and metadata in the document. It can survive a disconnect. Annotations can overlap without rewriting text formatting.

```ts
import {
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    getAnnotations,
} from "@barocss/doc-sync";

const created = createAnnotation(
    client.doc,
    {anchor: [0, 2], focus: [0, 6]},
    {message: "Check this phrase", resolved: false},
    {expand: "none"},
);
client.commit(created.ops);

client.commit(updateAnnotation(client.doc, created.id, {
    data: {resolved: true},
}));

const annotations = getAnnotations(client.doc);
client.commit(deleteAnnotation(client.doc, created.id));
```

These helpers apply their operations locally. Commit the returned operations once. Annotations use ordinary client history, snapshots and replication. Their metadata is stored outside `doc.toJSON()` content.

Paths use UTF-16 offsets, with one position per inline node. The default `expand: "none"` excludes insertions at either end of a nonempty range. `start`, `end` and `both` include insertions at the selected boundary. Interior insertions remain inside the range. A collapsed range with `none` remains a point after an insertion at that point. An expansion option lets it grow around that insertion.

Resolve annotations again after document changes. Check each record's status before displaying its range. Missing, compacted, hidden and cross-slot endpoints do not become a range at the start of the document. The returned metadata remains available when a range cannot be displayed. The application provides the comment UI, access control and author identity.

## Block placement

Use the `move` editing operation to change a block's position while retaining its identity and contents. See [model operations](./editing) for path rules and [collaboration intent](../reference/collaboration-intent) for ownership and undo rules. Row and column edits retain their separate table contract.

## Transport compatibility

Provide the same schema to each client and to `new DocHub({schema})` for these capability contracts. The schema-free server path does not provide placement or required-slot validation. Protocol 3 includes schema identity and rejects protocol 2 peers. `SyncClient` waits for a compatible `hello` before sending queued changes. The hello must advertise `placement-v1`, `fields-v1`, `annotations-v1` and `cardinality-v1`, and the server schema fingerprint or explicit schema-free marker. An incompatible server leaves local pending changes intact and sets `client.connectionError`.

A document epoch also identifies the server generation. A clean reconnect to a different epoch replaces the model and clears old history. If unconfirmed edits remain, the client disconnects with an explicit error and retains its local model and pending changes. The demo gives each process a new epoch, so a restart uses the same safe blocking rule. Invalid snapshots are rejected before pending changes are acknowledged or removed.

`HttpTransport` advertises the version automatically. A custom HTTP client must send `protocol=3`, its remembered `epoch`, and its schema fingerprint on the SSE stream. It must send `x-doc-sync-protocol: 3`, `x-doc-sync-epoch`, and `x-doc-sync-schema` on change requests. Acknowledgments and presence use the epoch header; leave beacons use an epoch query parameter. Stale-epoch or schema-mismatch writes return HTTP 409. The demo server returns HTTP 426 for unsupported versions before applying those requests. Custom transports and servers must enforce the same compatibility boundary. Protocol versioning is not authentication.

## Rust experiment

The native `RuntimeDocument` API supports declared nested `fields`, required
children and overflow rules within its supported schema subset. The
[complete runtime example](./rust#structured-fields-and-required-children)
shows independent leaf edits, two peers, selective History and checkpoint retry.
Annotations, live transitions and production Rust/WASM adapters remain separate.

The older `Document` API accepts six fixed presets. In `SchemaPreset::Blocks`,
`meta` remains one atomic register. The example below deliberately makes two
whole-object writes and confirms that the second removes the earlier `spacing`
field. It needs `serde_json = "=1.0.140"` in the example crate.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{Document, EditOptions, Key, Op, Result, SchemaPreset};
use serde_json::json;

fn main() -> Result<()> {
    let mut doc = Document::new("rules-host", SchemaPreset::Blocks)?;
    for (now, value) in [
        (0.0, json!({"color":"red", "spacing":12})),
        (10.0, json!({"color":"blue"})),
    ] {
        let at = doc.next_ticket()?;
        doc.record(
            vec![Op::Set {
                at,
                ids: vec![Key::root().ticket()?],
                key: "meta".into(),
                value,
            }],
            EditOptions::default(),
            now,
        )?;
    }
    let model = doc.model()?;
    assert_eq!(model.children[0].attrs["meta"], json!({"color":"blue"}));
    assert!(model.children[0].attrs["meta"].get("spacing").is_none());
    Ok(())
}
```

This example uses one of six fixed `SchemaPreset` values. A separate [runtime schema API](./rust#runtime-custom-schemas) accepts limited Document/Graphic descriptors and custom sparse-sheet fields. Live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The raw probe below uses the fixed general-block manifest. Its `meta` attribute
is one atomic register; it does not opt into `fields`. The separate runtime
schema API supports declared field registers and required-child projection.
This fixed probe does not qualify that runtime API or persistent annotations.

The following native example makes two whole-object writes. The later writer replaces the entire `meta` value.

Build the private executable with the commands in [the Rust guide](./rust#run-the-private-experiment). Run the following command from the repository root. Each input line produces one JSON response.

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"A","actor":"A","schema":"general-flow-blocks:json-attrs:v1","capabilities":["general-blocks-attrs-v1"]}
{"cmd":"apply","replica":"A","schema":"general-flow-blocks:json-attrs:v1","ops":[{"t":"set","at":{"lamport":1,"actor":"A"},"ids":[{"lamport":0,"actor":"~root"}],"key":"meta","value":{"color":"red","spacing":12}},{"t":"set","at":{"lamport":2,"actor":"B"},"ids":[{"lamport":0,"actor":"~root"}],"key":"meta","value":{"color":"blue"}}]}
{"cmd":"state","replica":"A"}
JSONL
```

The projected paragraph has `meta: {"color":"blue"}`. It has no `spacing` field. This is the declared atomic-register behavior, not a field-merge result.

Run the TypeScript rule regressions separately:

```sh
node --test packages/doc-sync/test/cardinality.test.ts packages/doc-sync/test/cardinality-review.test.ts packages/doc-sync/test/nested-fields.test.ts packages/doc-sync/test/fields-review.test.ts packages/doc-sync/test/annotations.test.ts
```

Those tests check the production rules. The native example checks only the fixed general-block JSON subset. This fixed example does not test runtime required slots or field paths. Neither it nor the runtime example qualifies native annotations, protocol negotiation or protected GC. See [remaining native limits](./rust#source-map-and-remaining-limits).

</details>

## Native composite references

The experimental runtime Rust API distinguishes a schema default or enum
reference from a plain JSON value. Use `RuntimeSchema::default_value` or
`enum_value` with the reference-aware edit helpers. A deeply equal JSON copy
is a different value under the TypeScript reference rules. Native operations
carry a validated reference envelope through peer JSON exchange and recovery.
Object/array defaults and composite enum choices can share a reference through
`RuntimeSchema::compile_with_default_references`. Each declared edge binds a
default to an enum index at the same attribute or value-mark descriptor. Several
listed slots may share the default; equal unlisted slots remain distinct.
A versioned schema DTO retains these edges through JSON and checkpoint restore.
Bare schemas keep their existing identity and wire format. The alias schema ID
includes the graph, while `base_identity()` describes only the raw rules.

Birth canonicalization omits a default or listed alias and can pass the existing
TypeScript DocHub path because that operation carries no composite value. A
retained enum birth writer or explicit default/enum update still loses identity
in the server's retained payload copy and rejects atomically. This native
extension does not supply a general TS/native transport adapter. See the
[Rust guide](./rust#atomic-object-array-defaults-and-enums) for a compiled example.

## Shared references across properties

The experimental Rust SDK also provides `compile_with_reference_groups` with
`ReferenceSlot` and `ReferenceGroup`. A group declares which composite defaults
and enum entries are the same object across supported atomic attributes or
value marks. It can contain enum entries without a default. A representative
must be one of at least two unique members; its payload order applies to all
members. Overlapping groups and undeclared equal JSON do not create sharing.

Groups share schema-owned values. Each document property keeps its independent
writer; editing one property does not update the other group members.

A source handle can target another property only through declared identity.
Birth helpers omit it only when it shares the target's default. Explicit writes
retain the source path/index and the target operation key through History and
native JSON recovery. Compiled effective rules also resolve default, null-reset
and clone-fallback models to the representative; raw manifest/DTO data remain
available. Bare and v1 schema identities and wire forms stay unchanged.

The v2 format covers whole atomic values; v3 adds the nested schema paths below.
Structured field branches keep their independent register contract. A composite enum default must still share at least
one of its own enum slots in the native subset. General TypeScript/native wire
exchange and live schema migration remain separate work. See the
[Rust shared-reference example](./rust#shared-objects-across-attributes-and-marks).

## Nested schema payloads

Use `compile_with_payload_references` for the v3 descriptor. A `ReferenceSlot`
can append `at_value_path` segments inside its atomic default or enum value.
`ValuePathSegment::Key` selects an object key and `Index` selects an array index.
The string key `"0"` and array index `0` are different selectors. Endpoints must
be composite objects or arrays, with safe paths bounded to 64 segments.

`SchemaValue::at_value_path` selects a schema-owned subtree for an existing
reference-aware edit helper. The source `at/source/index/valuePath` stays in
the operation metadata; its binding `path` still identifies the target. Edits
continue to write whole atomic registers. This does not add per-subkey LWW
merging or mutable links between document properties.

A shared parent induces sharing of its composite descendants. Child sharing
preserves the identity of distinct parents. Nested representatives propagate
through shared parents; ambiguous implicit overlaps and cycles reject. Equal
JSON values alone never imply a shared parent or child. Bare/v1/v2 root
constructors, serialized data and identities retain their existing behavior.

These are logical schema references. Actual TypeScript `Doc.apply` copies a
payload with `structuredClone`, which keeps internal aliases but separates it
from the schema and other payloads. JSON snapshots/History flatten those
aliases. Rust public values remain JSON trees, so heap-identity parity is not
represented by material JSON equality. See the
[compiled Rust example](./rust#nested-schema-payload-references) for API use and
its explicit storage/transport boundaries.

## References from field leaves

A v3 reference source can select the default or enum entry of a declared field
leaf. The descriptor `at` path uses explicit `fields` edges, for example
`["nodes", "paragraph", "attrs", "style", "fields", "fill"]`. An optional
`valuePath` then selects inside that leaf value. These are separate paths.

Use `field_default_value` or `field_enum_value` to obtain the native value.
`set_runtime_field_path` checks its schema provenance before copying it into a
field. Field admission compares JSON content and retains separate leaf writers.
An equal JSON copy is valid when the destination field's rules allow it. Undo
only reverses the local writer; other leaf and user changes remain.

A field source can also supply an atomic attribute or value mark when its
explicit reference group admits that target. That operation retains the source
descriptor and the separate target binding path. Whole branches, computed
fields and invalid paths reject. See the
[Rust API example](./rust#field-leaf-reference-sources).

## Product validation patterns

The native runtime supports the product link pattern `^(https?://\S+)?$` and
optional color pattern `^(#[0-9a-fA-F]{6})?$`. Use the same schema descriptors
with existing attribute, field and value-mark APIs.

The link rule accepts the empty string or a case-sensitive `http://` or
`https://` prefix with at least one non-whitespace character after it. It uses
JavaScript whitespace: BOM is rejected and NEL is allowed. The color rule
accepts the empty string or `#` followed by six ASCII hex digits. Null retains
the existing reset behavior. URL parsing and host checks remain application
responsibilities. Other regular expressions still require explicit native
support. See the [Rust example](./rust#product-validation-patterns).

## Blocks without plain text

Set `text: false` on a text-shaped block to describe an image-like block with
inline children. It keeps text-block identity, selection offsets, defaults and
stored content. The flag does not delete or hide characters.

Raw character admission uses the containing flow's stored text types, including
group members. A flow with only text-disabled types rejects characters. A mixed
flow with any text-enabled type can accept characters after a disabled marker.
Container input also uses the immutable birth type. These are the existing
TypeScript rules. Editor command compilation has its own rules; the native SDK
has physical source helpers and a bounded model-child-path paragraph compiler;
complete model-position command coverage remains open.

The native runtime accepts boolean flags. Other JSON flag types reject; the
TypeScript schema checker can be more permissive for malformed untyped input.
See the [Rust example](./rust#blocks-without-plain-text) for concurrent edits,
selection, undo/redo and own checkpoint recovery.

## Unused node declarations

A native schema registry can include valid node declarations that are not
reachable through root children. This lets Word and presentation profiles retain
their complete registries. Each declaration still needs to satisfy the supported
schema contract, including its attributes, references and required-child rules.
Invalid unused declarations are rejected.

The registry and parent placement rules have separate roles. Declaring a spare
text, atom, grid or flow type does not let an edit insert it under a parent that
does not allow it. Rejected batches preserve document state, clock, History and
pending changes. Unused grid/group entries do not change the active flat-flow
model or History. Schema identity, DTO and checkpoints retain those entries.

The original Word and presentation fixtures compile without pruning. Current
comparisons cover bounded concurrent edits, metadata, default nested text,
undo/redo and own checkpoint retry. Bounded nested paragraph insertion also
compiles first, middle and required-slot end positions. Complete post-move
command coverage and full-profile editing remain separate gates.
See the [Rust example](./rust#unused-node-declarations).

## Nested paragraph insertion

The native SDK provides `insert_paragraph_at` for a model child path and
`insert_model_at` for a supported flow/text tree. The last path index selects a
child gap; it is not a text offset. The compiler resolves physical storage,
default heads and required siblings internally. Existing `insert_block_in`
continues to use explicit source tokens.

Structured field writes follow a preceding type change in the same operation
batch. Valid existing default-reset writes and reserved ticket order are
preserved. A paragraph after a required sibling receives its own stored marker
and placement; existing sibling placement writers are not overwritten.
Detached, unplaced fragments do not define the required tail's base order.

Undo removes the inserted paragraph and retains other users' text and movement
records. Canonical schema output can hide retained overflow under maximum-child
rules; that does not delete the stored content. Native JSON checkpoint replay
uses the same schema and actor. See the
[complete Rust example](./rust#insert-paragraphs-at-model-positions) for the
supported inputs and fail-before-mutation boundaries.


Native model paths can also be used after existing block movement. Resolve the
child index from the current model, while retaining object IDs for identity.
See [insertion after moves](../guide/rust#insert-at-current-model-positions-after-moves)
for the complete two-peer Rust program and the remaining input boundaries.


An insertion after move undo/redo must preserve the moved paragraph as a separate
identity. Appending into its former source gap must not absorb its text. The
compiler uses an existing source marker to fence that gap; peers editing the
same observed gap still choose the same fence and retain the existing concurrent
Enter behavior. This changes no existing sibling's placement writer.


## Group and table command semantics

A list group's children are text members. A command at a member gap may insert
another block admitted by the containing flow; normalization splits the wrapper
around that block. This does not make a table a valid child of the group schema.
Group `by` values are inherited, with explicit member values taking precedence.
The derived wrapper has no separate stored object ID.

Document tables use stable row and column IDs and a schema-defined cell body.
Covered cells remain addressable and retain their text. Model construction fills
cell content before span/custom attributes. Editing schema-valid structures still
needs command and concurrency contracts; see the [Q1–Q8 roadmap](../schemas/editing-contract).


Axis insertion inside an anchored merged range grows its projected extent. It
does not write a new merge register on behalf of the inserting actor. The model
adapter applies requested edits plus requested normalization; command tests also
check the independent before/inside/after endpoint rule. See the
[editing contract](../schemas/editing-contract#model-edits-and-normalization).
