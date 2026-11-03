# Cursors and selections

Presence is transient state. It does not change the document model or its version. It carries user identity, color, an active caret token, and an optional opposite selection endpoint.

## Participant profiles

Configure a profile on `Client`, `LocalClient`, or `SyncClient`. The unified
client example is in [Actor identity and display profile](./client#actor-identity-and-display-profile).
`SyncClient` keeps its existing positional actor ID:

```ts
const client = new SyncClient('replica-42', transport, {
    schema,
    profile: {name: 'Review bot', color: '#7c3aed', kind: 'bot', userId: 'bot-7'},
});
client.setPresence({anchor: null, focus: null});
```

Here `schema` and `transport` are the application-owned values from the
[synchronization setup](./sync). No document edit is required to publish presence.

| Option | Purpose | Constructor limit |
| --- | --- | --- |
| `name` | Display name; defaults to the actor ID | 256 characters, non-empty |
| `color` | Application-rendered color; defaults to a stable HSL color | 128 characters, non-empty |
| `avatar` | Optional application-rendered avatar reference | 2,048 characters, non-empty |
| `userId` | Application user identity shared across replicas | 256 characters, non-empty |
| `kind` | Participant category | `human` or `bot` |
| `metadata` | Application-defined JSON object | Eight nested levels, 1,024 visited values, 16,384 serialized characters |

The client copies and freezes profile values. JSON metadata permits finite
numbers, strings, booleans, null, arrays, and plain objects. Cycles, undefined,
class instances, and values above the limits are rejected. All fields are
optional. `client.profile` exposes resolved `name` and `color` as required strings.
Profile defaults are fixed for the client lifetime. Supply explicit display
fields to `setPresence()` when publishing a changed name or color; this does not
replace the defaults or change the actor ID.

Presence updates can omit name and color and use the profile defaults. Existing
updates with explicit name/color still work. Optional avatar, userId, kind, and
metadata fields travel with presence; older clients can ignore them. They are
not operation IDs, schema fields, authorization rules, or durable document data.
Two replicas must keep distinct actor IDs even when their userId is the same.

An avatar value does not install an avatar renderer. The application decides how
to display it and which avatar sources to load. The existing caret and range
renderers continue to use their supported fields. `LocalClient` has a profile but
no remote presence channel. Stored local state keeps its original actor ID;
profiles are supplied separately on restore.

## Endpoint convention

- `anchor` is the active caret or selection head.
- `focus` is the other end of a non-collapsed selection.
- A collapsed caret uses `focus: null`.

This convention is intentional. Do not substitute a different editor's anchor/focus meaning without converting it.

## Rendering

The demo and ProseMirror show a colored selection and a labeled caret. The product demo also draws a presence overlay for resolvable Slate and Lexical text positions. They support forward and backward selection, multiple paragraphs in the same CRDT line, and overlapping users. Token-based endpoints follow edits.

The demo paints a range only within the same visible CRDT line or slot. It does not paint through hidden merged cells or unrelated slots. If an endpoint cannot be resolved safely, the renderer does not invent a range.

## Lifecycle

Disconnect and leave events remove stale users according to the transport lifecycle. Presence updates must not create a document edit, history entry, or false performance sample.

These browser checks verify rendering and endpoint behavior. They do not establish real operating-system IME behavior.

For a headless AI participant, the MCP `set_presence` tool publishes an explicitly supplied caret or range. See [AI and headless clients](./ai#show-an-agent-s-position) for the revision, delivery, and lifecycle rules.

Bot presence can optionally include a character, a reported work expression and an activity. These are transient display metadata; they do not change the document or its collaboration rules. Clients that do not understand the optional fields can ignore them. The demo shows the roster even when a bot has no known caret. See [run a document bot](./bots).

## Rust experiment

Capture a model range before transport and resolve its stable keys on the receiving actor. A cleared selection uses `None`. The host must transport this value separately from document operations and manage the participant roster.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{
    Attributes, Document, EditOptions, Key, Position, Result, SchemaPreset, Selection,
};

fn main() -> Result<()> {
    let mut doc = Document::new("presence-author", SchemaPreset::Text)?;
    let mut viewer = Document::new("presence-viewer", SchemaPreset::Text)?;
    let change = doc.insert_text(
        &Key::root(),
        "Hi",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    viewer.apply_remote(&change.ops)?;
    let range = Selection {
        anchor: Position(vec![0, 0]),
        focus: Position(vec![0, 2]),
    };
    let stable = doc.capture_selection(Some(range.clone()))?;
    assert_eq!(viewer.resolve_selection(stable)?, Some(range));
    assert_eq!(viewer.resolve_selection(None)?, None);
    assert!(viewer.pending_changes().is_empty());
    Ok(())
}
```

This example uses one of six fixed `SchemaPreset` values. A separate [runtime schema API](./rust#runtime-custom-schemas) accepts limited Document/Graphic descriptors and custom sparse-sheet fields. Live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The native process can resolve token endpoints. It does not publish presence or render cursors. This example puts `Hi` in the second cell of a one-row table, then covers that cell with the first cell's span.

Build the private executable with the commands in [the Rust guide](./rust#run-the-private-experiment). Run the following command from the repository root. Each input line produces one JSON response.

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"A","actor":"A","schema":"nested-flows-tables:json-attrs:v1","capabilities":["nested-flows-tables-v1"]}
{"cmd":"apply","replica":"A","schema":"nested-flows-tables:json-attrs:v1","ops":[{"t":"node","id":{"lamport":1,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"type":"table"},{"t":"node","id":{"lamport":2,"actor":"A"},"origin":{"lamport":0,"actor":"1@A/rows"},"type":"table-row"},{"t":"node","id":{"lamport":3,"actor":"A"},"origin":{"lamport":0,"actor":"1@A/cols"},"type":"col"},{"t":"node","id":{"lamport":4,"actor":"A"},"origin":{"lamport":3,"actor":"A"},"type":"col"},{"t":"text","id":{"lamport":5,"actor":"A"},"origin":{"lamport":0,"actor":"1@A/cell:2@A,4@A"},"units":[72,105]},{"t":"set","at":{"lamport":7,"actor":"A"},"ids":[{"lamport":1,"actor":"A"}],"key":"$span:2@A,3@A","value":{"row":"2@A","col":"4@A"}}]}
{"cmd":"anchor_resolve","replica":"A","anchor":"6@A"}
{"cmd":"selection_resolve","replica":"A","range":{"anchor":"5@A","focus":"6@A"}}
{"cmd":"state","replica":"A"}
JSONL
```

Raw `anchor_resolve` returns a fallback in the first visible cell. Strict `selection_resolve` returns `range: null` because the endpoints are hidden. The final full-grid model still contains `[72,105]` in the covered cell. Preserve that null result; do not draw a remote range at the raw fallback.

This uses the fixed nested-table fixture, not an arbitrary editor schema. It checks native anchor semantics. Presence transport, roster lifecycle, DOM selection and Slate/Lexical/ProseMirror rendering still use TypeScript and need separate integration evidence. See [the two resolution contracts](./rust#cursors-and-selections).

</details>


## Spreadsheet live previews

The private VTable demo sends active cell input through ephemeral presence.
Alice uses blue and Bob uses red. Range tints and independent selection
outlines use the actor's validated color; filled cells retain their stored fill.
Preview text uses the same normal font, color and stored weight as local cell
editing. It is not italicized or recolored because it is a preview. Native input
padding aligns with the cell's own content padding. Display colors and names
do not grant document permissions.

Remote selection outlines are drawn independently from the neutral grid lines.
One rectangle marks a whole range. Clipping follows the real VTable body, scroll
and window. Coincident remote ranges use bounded inner lanes and dash phases
so a later actor does not erase an earlier outline. These overlays do not
intercept input or replace the native local selection.

Typing updates the peer's projected cell before Enter. The projected text can
be empty or an incomplete numeric input. It does not change committed cell
registers, Lamport clocks, pending operations, acceptance sequence, journal or
undo History. Enter/Apply still commits through the existing validated edit
path. Escape/cancel clears the preview and restores the committed projection.
An invalid final value keeps the actual input open rather than writing it.

The demo's SheetSession supplies name/color, preview(target, field, text,
{composing}), and clearPreview(). Target IDs are captured when editing begins.
S2 previews follow row/column moves; a deleted target stays hidden and cannot
redirect input into a neighbor. A native editor starts from its committed
model value even if the cell displays another actor's preview.

Presence requests are coalesced with a 50 ms interval and one in-flight request.
Increasing actor-local sequence numbers prevent late updates from reviving a
canceled preview. A new SSE connection clears its prior draft; an older stream
closing does not remove a newer stream's presence. Disconnect clears ephemeral
state. Local draft text is not a durable shared value and is not restored by
server restart or page reload.

Updated SheetSession requests also carry a server-issued presence generation.
Join, stream replacement, stream close and explicit leave fence requests from
older sessions, so a delayed request cannot restore an offline selection.
HTTP-only sessions receive the generation at join. Legacy direct requests that
omit it retain sequence-only behavior. Presence remains independent of the
document edit queue; a new preview can wait for an earlier Presence request.

During composition, intermediate text may be previewed, but Enter does not
commit while composition is active. Browser automation uses labeled synthetic
composition events; this does not prove an OS keyboard IME path.

Preview text is limited to 8,192 UTF-16 units. The server validates identity,
mode/schema, target, field, color, size and sequence before changing presence.
The same protocol works with the fixed-axis and stable-axis demo profiles.
This is a demo session/view feature, not a new public Schema shape, CRDT op or
universal production-editor draft API.

Run npm run dev:spreadsheet and use a fresh room. The opt-in structural URL is
?axes=stable&room=live-input. Desktop browser checks compare actual native cells
with the committed-model/server oracle before and after commit/cancel. Mobile
testing is excluded.


### Remote text carets and character selections

The spreadsheet demo's optional editing.selection is a DOM-style record:

```ts
{start: 1, end: 3, direction: "backward"}
```

Offsets are UTF-16 units relative to the exact transmitted editing.text, not
byte offsets or cell coordinates. start equals end for a caret. Otherwise the
range is highlighted; the active caret is start for backward selection and
end for forward/none. Existing previews without selection remain valid.

The sender publishes focus/input, selection changes, arrows and pointer
selection without creating document operations. It sends composition state
through the same ephemeral path. The 8,192-unit preview limit truncates without
splitting a surrogate pair; offsets clamp to the transmitted text and valid
code-point boundaries. Legal combining/ZWJ positions remain represented as DOM
offsets. The server atomically rejects malformed or out-of-range selections.

The recipient uses real DOM text shaping and Range rectangles with the cell's
font and padding. It renders only the caret belonging to the displayed preview
winner. It suppresses peer carets under an active local input and clips to the
cell/table body. Long text automatically reveals the active caret in the
recipient's viewport; it does not copy the sender's pixel scroll position.
Inspector prefixes adjust display offsets without changing raw offsets.

Selection capability follows the actual control. Native InputEditor is text,
so even an incomplete numeric value can carry a caret. Inspector number/color
inputs, checkboxes and select controls omit character selection metadata.

### Other domains and current coverage

Presence is separate from the data schema, but each view needs its own adapter.
The current test boundaries are:

| Domain/view | Tested temporary state | Remaining view integration |
| --- | --- | --- |
| Document: ProseMirror, Slate, Lexical product views | Remote token caret/range, collapsed selection, cleanup, unchanged model/History/pending/server sequence | Shared uncommitted text-draft rendering; Tiptap was not browser-tested in this domain pass |
| Graphic: PixiJS view | Remote pointer/object selection; local drag preview/cancel; exactly one committed edit on pointer release | Shared remote drag-preview geometry |
| Spreadsheet: VTable | Input preview, intra-cell caret/character selection, composition gate and stable axis tracking | Durable drafts and universal public binding API |

Custom metadata transport is tested through the public Presence path. This
does not establish a renderer for arbitrary metadata. Document text accepted
by ordinary editing still synchronizes through CRDT operations; raw IME/draft
preview is a separate integration. Graphic drag is locally temporary until
pointer release. These distinctions do not require a new data schema shape.


### Related collaboration patterns

Separating temporary interaction from stored document changes is an established
pattern. [Yjs Awareness](https://docs.yjs.dev/getting-started/adding-awareness)
uses a separate awareness CRDT for per-client JSON state rather than storing it
in the document. [Automerge Repo ephemeral messages](https://automerge.org/docs/reference/repositories/ephemeral/)
use DocHandle.broadcast and a separate receive event for non-persistent data.
[Liveblocks Presence](https://liveblocks.io/docs/products/sync/presence) provides
per-connected-user state for cursors, selections and other temporary UI.

These APIs do not establish a universal raw typing/IME-preview policy. The
application chooses payloads and rendering. Our demo follows the same layering
pattern, with its own validated message format, lifecycle and view adapters;
it does not claim wire compatibility with those protocols.


## Shared components

Use [Presence components](./presence-components) for the common state API and
optional DOM, React, Vue and Svelte views. The existing editor-binding presence
and private Spreadsheet preview remain valid. The component API does not
automatically install domain-specific draft capture or projection.
