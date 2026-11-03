# PixiJS graphic editor

Run the graphic schema in two independent browser clients connected to one local
document server. PixiJS renders the scene and handles pointer input. Doc-sync owns
the objects, collaboration, and History.

![Two independent PixiJS clients editing the same graphic document](/graphic-editor.png)

## Run the demo

From the repository root with Node 24:

```sh
npm ci
npm run dev:graphic
```

Open the loopback address printed by the server. The default port is 5420.
Use `GRAPHIC_PORT=0 npm run dev:graphic` for an assigned port. A page contains
Peer A and Peer B, each with a distinct actor, Client, History, and HTTP/SSE
connection. Another page with the same `?doc=canvas` joins the same document.

The demo server keeps rooms in memory. Confirmed changes survive a browser view
reconnecting while that server process remains alive. Server restart durability
and refresh recovery for unconfirmed browser input are not provided by this
demo. It uses neither the existing demo data folder nor production credentials.

## Try collaboration

1. Select a shape in either canvas. The other peer shows its selection.
2. Drag it. The preview is local; pointer release commits one edit.
3. Change a name, position, size, rotation, scale, color, or label text in the
   inspector. Only changed fields are submitted.
4. Choose another frame or group in **Parent**. Reparenting keeps the object's
   canvas transform when the resulting local transform fits the schema bounds.
5. Use **Hold incoming** on both peers, edit different fields, then release both
   queues. This creates controlled concurrent changes over the real transport.
6. Undo one peer's edit and check that the other peer's field remains.
7. Disconnect a peer, edit both views, then reconnect it. Pending input is retained
   in that live client and the views converge.

Resize through the inspector. Corner markers indicate selection; they are not
drag-resize controls.

Frames clip children when `clipContent` is true. Reparenting an object while
preserving its world position can place it outside a clipping frame. The object
remains in the document and Layers, even when the frame clips its pixels.

## Schema design

The demo profile is `fixtures/graphic-canvas-schema.ts`. It predates the built-in
[`createGraphicSchema()` contract](./graphic-schema#use-the-built-in-graphic-contract).
The demo renderer does not consume that larger contract. Paths, gradient/image
paints, components, overrides, Boolean source records and general affine
transforms are not rendered by this demo.

The application schema is `fixtures/graphic-canvas-schema.ts`. It is a
separate example from the minimal core graphic test fixture. It adds no npm
package or new CRDT engine. See [Document and graphic schemas](./graphic-schema).

| Node | Shape | Meaning |
| --- | --- | --- |
| `canvas` | `container` | Empty-capable root; camera and viewport remain local view state. |
| `frame` | `container` | Stored objects with an editable box and optional clipping. |
| `object-group` | `container` | Stored parent with a shared transform and an explicit guide box. |
| `rectangle`, `ellipse` | `atom` | Geometric leaves. |
| `label` | `text` | Plain editable label stored as text runs. |

The label renderer is plain text; this example declares no rich-text marks.
Stored groups are not the document domain's computed `group` shape. An empty
frame or group has a visible guide without storing a placeholder child.

| Property | Contract |
| --- | --- |
| `name` | Display text, at most 120 characters; it is not identity. |
| `transform` | Independent x, y, rotation, and scale fields. Rotation is clockwise screen degrees; scale is positive and uniform. |
| `size` | Independent width and height fields. Group size is an explicit guide box, not a computed union of children. |
| `fill`, `stroke` | Six-digit hexadecimal colors. Label fill controls its text color. |
| `opacity` | A finite value from zero to one. |
| `locked` | Demo tool behavior; it does not grant or revoke server authority. |

Local x/y bounds are ±1,000,000; scale bounds are 0.001–1,000; dimensions are
1–100,000. Nested world transforms can exceed local bounds. The geometry adapter
rejects non-finite, singular, or out-of-range reparent results before writing.
Uniform scale keeps the reparent transform representable without skew. Reflection,
non-uniform scale, constraints, and Figma-style layout rules are outside this demo.

Field registers allow a peer's color or rotation update to survive another
peer's x/y drag and selective undo. Reparent writes the required local transform
and structural move in one edit batch. Label changes use a minimal UTF-16-safe
splice, retaining unchanged character IDs. A stale inspector text form is rejected
rather than replacing an already changed label.

## Find objects by ID

Use **Find by name or ID** in Layers. Names may repeat. Stored CRDT marker IDs
identify objects within the document and remain stable through movement and undo.

`apps/demo/graphic/session.ts` provides the demo adapter's `SceneSession.lookup`,
`update`, `delete`, and `reparent` methods. Its revision-cached Map resolves an ID
against the current visible projection before compiling a numeric-path edit.
A missing or hidden ID returns no object; editing it fails without selecting a
different array position. A new peer insertion, reparent, or sibling reorder
invalidates the path index. Presence alone does not rebuild it.

The demo uses the TypeScript SyncClient document compatibility surface for its
ID index. A local-only mode and an engine-independent canvas binding are not
provided by this adapter.

This is a demo adapter API. The core API does not gain a `getNode(id)` or
PixiJS binding export. PixiJS is a dependency of the private demo workspace;
the five library packages retain their existing dependency boundaries.

## Verify and measure

With the server running:

```sh
GRAPHIC_URL=http://127.0.0.1:5420 npm run check:graphic
GRAPHIC_URL=http://127.0.0.1:5420 npm run bench:graphic
```

The Chrome proof uses trusted canvas and inspector input, exact ID lookup,
controlled concurrency, per-actor undo/redo, reparenting, reconnect, and an
independent server-model check. It also checks the actual Pixi label projection.

The performance script creates separate sample/100/1,000/5,000-object rooms.
Each size has three warmups and ten recorded edits. It separates 1,000 cached
ID lookups, synchronous client editing, index rebuilding, Pixi update CPU work,
and remote convergence. Full-model equality is checked outside the timed
convergence loop. Animation-frame wait is a scheduling measurement, not GPU
completion or physical display latency.

Large scenes still have substantial full-document staging and model costs.
Correct convergence does not establish interactive performance. Read the current
verification report and HANDOFF before choosing a scene-size target. The server
permits at most sixteen rooms and never resets an existing room to run a benchmark.
