# Cursors and selections

Presence is transient state. It does not change the document model or its version. It carries user identity, color, an active caret token, and an optional opposite selection endpoint.

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

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

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
