# Graphic schema

Find the domain overview and complete examples in [Schemas](../schemas/).
The TypeScript engine provides a built-in graphic data contract. Use its default
schema and node helpers without defining application attributes. The private
PixiJS editor uses an earlier, smaller canvas profile. A stored property does
not by itself provide a rendered feature. See [the editor profile](./graphic-editor),
[engine support](./rust#choose-an-engine-for-a-graphic-editor), and
[measured performance](../performance#graphic-canvas-demo).

`GraphicSchema` stores a canvas object tree. Use `domain: "graphic"` and a root with `shape: "container"`. A container can have zero children. It does not add a paragraph before or after an object.

`DocumentSchema` uses the document flow rules. Its domain can be omitted or set to `"document"`. Existing `Schema` values that omit the domain keep their document behavior and schema fingerprint. The domain is a schema property. It does not select a different CRDT or collaboration protocol.

```ts
import type {DocumentSchema, GraphicSchema, Schema} from "@barocss/doc-sync";

const document: DocumentSchema = {
    domain: "document", root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const legacy: Schema = {root: document.root, marks: document.marks, nodes: document.nodes};
// document and legacy have the same schema fingerprint and initial model.
```

For custom node names and attributes, use the schema-bound
[`createGraphicHelpers`](../schemas/custom#graphic-objects) factory. Keep your
renderer mapping separate from replicated data rules.

## Use the built-in graphic contract

`createGraphicSchema()` returns the standard graphic schema. The immutable
`BUILTIN_GRAPHIC_SCHEMA` has the same contract. Both are exported from
`@barocss/doc-sync`. A custom schema is optional.

<!-- builtin-graphic-example -->
```ts
import {
    Doc, createGraphicSchema, createGraphicNode, graphicObjectAt,
    graphicInsert, graphicUpdate, findGraphicObject,
} from "@barocss/doc-sync";

const doc = new Doc("alice", createGraphicSchema());
doc.edit([graphicInsert(doc, null, 0, createGraphicNode("rectangle", {
    name: "Card", transform: {e: 120, f: 80},
}, {children: [createGraphicNode("paint", {color: "#3366FF"})]}))]);
const card = graphicObjectAt(doc, [0]);
doc.edit([graphicUpdate(doc, card.id, "rectangle", {size: {width: 240}})]);
const current = findGraphicObject(doc, card.id);
// current resolves the same stored object ID to its current path and model.
```

This example uses the low-level `Doc` API. Its edit result contains operations.
Use `Client` for managed local History and synchronization. Pass the same
built-in schema to each client and server. The ID helpers currently require a
TypeScript `Doc`; they do not accept a `Client` or portable engine port. A
TypeScript synchronized compatibility surface can expose that Doc. The local
Client does not expose it. The helpers return ordinary edits; apply those edits
through the session that owns History and delivery. An engine-neutral object
read and ID-edit port remains planned work.

The built-in schema defines 17 node types on the existing `container`, `atom`
and `text` storage shapes. It does not add a low-level shape enum.

| Nodes | Stored contract |
| --- | --- |
| `canvas`, `frame`, `object-group` | Empty-capable stored hierarchy; frame clipping and layout intent. |
| `rectangle`, `ellipse`, `label` | Geometry attributes; label text runs and font attributes. |
| `path`, `vertex`, `segment` | Points, incoming/outgoing handle offsets, and line/cubic endpoint references. |
| `paint`, `gradient-stop`, `stroke` | Solid, linear/radial gradient and image paint records; ordered stops and stroke attributes. |
| `component`, `instance`, `instance-override` | Component IDs and one target/property override per stored record. |
| `boolean`, `source-ref` | Union/subtract/intersect/exclude intent and source object IDs. |

Object transforms use six affine coefficients: `x' = a*x + c*y + e` and
`y' = b*x + d*y + f`. Reflection, shear, nonuniform scale and singular matrices
are valid stored data. Nested field registers permit independent property edits.
A geometric operation can require stronger checks before it uses those values.

`graphicObjectAt()` reads the real CRDT marker ID. `findGraphicObject()` resolves
that ID after a move. `graphicInsert()`, `graphicMove()`, `graphicUpdate()` and
`graphicDelete()` compile current paths. A display name or child index is not an
object reference. `createGraphicSegment()` checks that endpoints are vertices
in the same path. `createGraphicOverride()` validates supported property/value
pairs. `resolveGraphicReference()` returns the visible target or `null` for an
unbound or deleted target. Deletion does not rewrite the stored ID to another object.

An override stores `targetId` separately from an atomic `assignment` object:
`{property, value}`. The complete property/value pair occupies one last-writer-wins
attribute, so concurrent writes cannot combine one peer's property with another
peer's value. Use `createGraphicOverride()` or the other graphic helpers to
validate the complete assignment and the selected property's value bounds.
The generic raw TypeScript `AttrSpec` checks only the assignment's outer object
type. It does not validate that opaque payload. The pinned native Builtins
checker applies the stricter helper contract. These are explicit validation
boundaries, not a new generic wire validator.

These helpers do not expand instances, evaluate overrides, solve Boolean
geometry, calculate layout, fetch images, or render paths and gradients. General
reference-cycle policies and effective-instance behavior still need delivery
work. See the [graphic roadmap](https://github.com/barocss/doc-sync/blob/main/docs/graphic-roadmap.md).
The following custom example remains useful when an application needs a smaller
or different data contract.

## Define a canvas

<!-- graphic-client-example -->
```ts
import {Client, type GraphicSchema} from "@barocss/doc-sync";

const schema: GraphicSchema = {
    domain: "graphic",
    root: "canvas",
    marks: ["bold"],
    nodes: {
        canvas: {shape: "container", children: ["frame", "object-group", "shape", "label"]},
        frame: {shape: "container", children: ["object-group", "shape", "label"]},
        "object-group": {shape: "container", children: ["shape", "label"]},
        shape: {shape: "atom", attrs: {name: {default: ""}}},
        label: {shape: "text"},
    },
};
const client = new Client({actor: "alice", schema});
// client.model() is {type: "canvas", children: []}.

client.edit([{op: "insert", at: [0], content: [
    {type: "frame", children: []},
    {type: "shape", attrs: {name: "Rectangle"}},
]}]);
client.edit([{op: "move", from: [1], at: [0, 0]}]);
// The frame now contains the shape. No text node is added.
client.edit([{op: "insert", at: [0, 1], content: [
    {type: "label", runs: [{text: "Title", marks: {}}]},
]}]);
client.edit([{op: "insert", at: [0, 1, 5], content: "!"}]);

const state = JSON.parse(JSON.stringify(client.captureState()));
const reopened = Client.fromState(state, {schema});
// Restore includes actor identity, object identities and local undo/redo.
reopened.undo();
// The restored label is "Title". The original label is "Title!".
client.dispose();
reopened.dispose();
```

Container child types must be stored blocks: `container`, `flow`, `text`, `grid`, or `atom`. A container has no `default` and no `childRules`. Add an explicit `flow` child when an object needs document text behavior. That flow must declare a text default. Text belongs in an explicit `text` node; raw text does not belong at a container boundary.

Use `shape: "container"` for a stored object group. The existing `shape: "group"` has a different purpose: it projects adjacent document text blocks as a list. It does not store an object group identity.

## Object identity and paths

A stored object has a CRDT identity. `readDocumentSlice()` exposes that identity as `blockId`. The ID stays the same after reorder, reparent, undo and snapshot restore. A display `name` attribute is separate from this ID. Names need not be unique.

Edit operations use the object's current numeric path. The same object can have a different path after a move. For the built-in schema, use the ID helpers above. For a custom schema, use the bounded read API to read the hierarchy and its block IDs. An application can maintain an ID-to-path index for its own commands.

## Collaboration and persistence

The normal insert, delete, update and move edits also apply to graphic objects. Array order is object order. Paths identify the current model position. Move edits retain object identity across parents. The built-in schema supplies coordinates, size and transforms. Custom schemas can define their own attributes. The `frame` name has no built-in geometry behavior. A plain object attribute uses one last-writer-wins register. Attribute `fields` definitions let independent peer updates to nested properties merge. These operations do not compute geometric constraints, hit testing, layout, or Boolean geometry.

Use the existing sync client and hub with the same graphic schema at each endpoint. Actor undo, pending changes, snapshots, local state, recovery reservations and GC use the existing APIs. A snapshot carries CRDT state; supply the matching schema when you restore it. A schema change from document flow to graphic containers is not an additive document schema extension.

Concurrent text merge and object reparent operations retain the existing logical text join rules. A merged label's text can join a label outside its former frame. The former frame can then be empty. A frame does not impose a new text ownership rule on an explicit merge.

The repository sample is `fixtures/graphic-schema.ts`. The focused tests cover empty canvas and frames, stored groups, explicit labels, object moves, concurrent edits, selective undo, persistence and recovery. They exercise the data model and sync APIs. They do not qualify a canvas renderer or a graphic editor UI.


## Run a canvas editor

The private [PixiJS demo](./graphic-editor) connects this engine contract to two
real HTTP/SSE clients. It adds a complete application schema, ID-cached scene
adapter, transform geometry, pointer input, shared presence, and inspector. Its
large-scene performance is measured separately from functional convergence.
