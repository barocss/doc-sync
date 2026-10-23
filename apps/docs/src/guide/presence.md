# Cursors and selections

Presence is transient state. It does not change the document model or its version. It carries user identity, color, an active caret token, and an optional opposite selection endpoint.

## Endpoint convention

- `anchor` is the active caret or selection head.
- `focus` is the other end of a non-collapsed selection.
- A collapsed caret uses `focus: null`.

This convention is intentional. Do not substitute a different editor's anchor/focus meaning without converting it.

## Rendering

The demo and ProseMirror show a colored selection and a labeled caret. They support forward and backward selection, multiple paragraphs in the same CRDT line, and overlapping users. Token-based endpoints follow edits.

The demo paints a range only within the same visible CRDT line or slot. It does not paint through hidden merged cells or unrelated slots. If an endpoint cannot be resolved safely, the renderer does not invent a range.

## Lifecycle

Disconnect and leave events remove stale users according to the transport lifecycle. Presence updates must not create a document edit, history entry, or false performance sample.

These browser checks verify rendering and endpoint behavior. They do not establish real operating-system IME behavior.
