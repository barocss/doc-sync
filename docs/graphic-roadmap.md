# Graphic delivery roadmap

The graphic domain stores empty-capable object trees. Its built-in TypeScript
schema supplies standard shapes and properties without consumer-defined
attribute declarations. A schema contract and a rendered feature have separate
delivery gates. This roadmap preserves the existing document and spreadsheet
contracts.

## Current support

| Surface | Implemented | Open |
| --- | --- | --- |
| TypeScript built-in graphic contract | 17 node types; affine transforms; points/handles; segment IDs; paints/strokes; component, instance, override and Boolean source records; ID lookup/edit helpers | Renderer, layout, Boolean solving and effective instance expansion |
| PixiJS demo | Two HTTP/SSE clients; basic frame/group/rectangle/ellipse/label profile; uniform transforms and solid colors | Rendering of the larger built-in contract |
| Native Rust graphic SDK | Canvas and 17-node Builtins manifests plus runtime container/text/atom schemas; stored objects, moves, fields, History and checkpoints | Complete schema rules, graphic selection, exact graphic wire and mixed-runtime exchange qualification |
| WASM | UTF-16 storage experiment | Graphic CRDT, client factory and browser binding |

`SchemaPreset::Shapes` remains a document fixture. It is not the graphic API.
The pinned native graphic API is `GraphicDocument`. `RuntimeSchema` and
`RuntimeDocument` provide the supported custom-schema subset.

## Ordered work

### G1. Standard data primitives

**Status: implemented in TypeScript; bounded source tests.** Keep standard node
constructors, field validation and ID helpers in the library. Store vector
vertices, cubic handle offsets and segment endpoint references as editable
records. Store paints, gradient stops and strokes as child records. Store each
instance override and Boolean input as an ID reference record. An override
assignment is one atomic `{property, value}` attribute; its target ID remains
independent. TypeScript helpers validate the complete payload and typed value
bounds. The raw generic attribute rule checks only the outer object type. The
native pinned checker enforces the stricter helper contract. This does not add
a generic wire validator. Do not require
application custom attributes for these standard properties.

**Gate:** default-schema examples execute. Concurrent field edits, local
selective undo/redo, movement, deletion and checkpoint restore retain the stored
records and IDs. This gate does not qualify rendering or geometric evaluation.

The current ID helpers require the TypeScript `Doc`. They are not a portable
Client API. Add an engine-neutral object read and ID-edit port before a local
Client or another engine can use those helpers through the public session. Do
not build this port by capturing and cloning the whole Client state.

### G2. Reference validation and override semantics

**Status: basic visible-target resolution and constructors implemented; complete
semantics open.** Define missing/deleted sources, cycles, target kind checks,
component ancestry, override precedence and effective-instance evaluation.
Current helpers can resolve visible IDs and validate supported override values;
they do not expand an instance or calculate its effective properties.

**Gate:** adversarial and concurrent fixtures cover deletion, restoration,
reparenting, missing sources, cycles and competing overrides. Unsupported cases
fail without changing state. Names and numeric child indexes never substitute
for object IDs.

### G3. Geometry, layout and rendering

**Status: open beyond the basic PixiJS demo.** Define geometry tolerances and
transform rules. Add vector evaluation, fill rules, gradients/images, strokes,
clipping, layout and Boolean evaluation in explicit slices. Preserve editable
source data. Keep transient tool previews outside committed document state.

**Gate:** independent geometry checks and browser input checks qualify each
rendered feature. Measure scene sizes and local/remote latency separately.
Stored affine matrices may be singular; operations that require an inverse must
reject an invalid result before mutation. The basic demo is not evidence for
these new features.

### G4. Native built-in and runtime profiles

**Status: pinned profiles and a runtime custom-schema subset implemented; full
native delivery remains open.** `GraphicPreset::Builtins` matches the frozen
17-node TypeScript manifest exactly. The pinned-profile checkpoint recorded 42 passing SDK tests,
including seven Canvas and seven Builtins cases, and 75 shadow-core tests.
Independently authored Builtins traces compare 35 actions and 70 normalized
actor model/History states. Canvas retains its 20-action, 40-state comparison.

The later custom-schema slice passes 48 SDK and 78 shadow-core tests. Its
independently authored traces compare 82 actions and 164 actor states across
six Document/Graphic/Spreadsheet descriptors. This is bounded runtime support;
see the [custom-schema report](reports/custom-schemas-2026-11-03/README.md).

**Remaining gate:** complete unsupported schema/compiler rules and qualify
full pending/checkpoint and failure behavior for the complete intended engine
contract. Qualify exact graphic wire encoding and actual mixed-runtime exchange
separately from normalized model comparison. The pinned profile provides no
renderer, layout solver, Boolean solver, graphic selection, WASM client or
performance acceptance. Evidence is in
`output/rust-graphic-builtins-evidence-20261103/receipt.json` in the checkout.

### G5. WASM binding and performance

**Status: open.** Expose the complete graphic document API through WASM, connect
it to the production client contract and an engine-independent scene adapter,
then run the same browser interaction checks and matched performance workloads.

**Gate:** mixed TypeScript/WASM actors converge through real transport, restore
pending work and History, and pass the chosen editor checks. Record latency,
memory and scene-size limits under matched conditions. A storage benchmark or
native unit test does not meet this gate.

See the [Rust roadmap](rust-roadmap.md) for shared schema/compiler and engine
work, and the [spreadsheet roadmap](spreadsheet-roadmap.md) for the separate
sparse-sheet lane. No publication or production migration is implied.
