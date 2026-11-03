# Presence components

Use the same temporary-state API with plain JavaScript, React, Vue, Svelte or SolidJS.
The core store owns state and validation. A client bridge sends that state
through the existing Presence channel. Optional views subscribe to the store
and ask your editor to project stable targets into viewport CSS rectangles.
No component edits a document or creates an undo item.

## Choose a package

| Package | Use |
| --- | --- |
| `@barocss/doc-sync/presence` | Framework-independent state, validation and Client bridge |
| `@barocss/doc-sync-presence-ui` | Shared DOM renderer: avatars, bot faces, cursors, selections and drafts |
| `@barocss/doc-sync-presence-react` | React components, context and hooks |
| `@barocss/doc-sync-presence-vue` | Vue components, context and composables |
| `@barocss/doc-sync-presence-svelte` | Real Svelte component and readable store |
| `@barocss/doc-sync-presence-solid` | SolidJS components and owner-scoped snapshot accessors |

Install only your chosen UI adapter and its peers. All packages remain private
at `0.0.0` in this checkout; the commands below describe package composition,
not availability on the npm registry. Build local workspace packages first or
install the locally packed tarballs. See [Packages and engines](./packages).

```sh
# Package composition after a registry release, or use corresponding local tarballs:
npm install @barocss/doc-sync @barocss/doc-sync-presence-ui
# React: add @barocss/doc-sync-presence-react react react-dom
# Vue: add @barocss/doc-sync-presence-vue vue
# Svelte: add @barocss/doc-sync-presence-svelte svelte
# Solid: add @barocss/doc-sync-presence-solid solid-js
```

## Create and connect a store

Use one store and one bridge per client actor. Mount the bridge before editor
bindings publish their selection. If the editor is already open, pass its
current anchor/focus as initialPresence; the bridge cannot reconstruct a
previously sent local selection. A null selection is appropriate for a
canvas-only surface that has no document token caret.

```ts
import {createPresenceStore, connectClientPresence} from '@barocss/doc-sync/presence';

// client is your existing synchronized Client or SyncClient.
const store = createPresenceStore({
  actor: client.actor,
  profile: client.profile,
  ttlMs: 30_000,
  maxActors: 100,
});
const connection = connectClientPresence(store, client, {
  initialPresence: {anchor: null, focus: null}, // Use the current selection for an open text editor.
  intervalMs: 50,
  onError: error => console.error(error),
});

store.updateLocal({
  activity: 'active',
  cursor: {kind: 'spreadsheet', sheetId: 'budget', rowId: 'row-a', columnId: 'col-cost'},
});
// Explicit null removes a field. This does not commit a cell edit.
store.updateLocal({draft: null});
```

getSnapshot() returns the same immutable array until state changes. subscribe()
returns an unsubscribe function. receive(), remove() and expire() also support
custom Presence transports. The store never opens a connection or creates a
timer. Call expire() from an application-owned heartbeat if you need expiry;
use regular local updates as heartbeat messages. Expiry uses local receipt time
rather than trusting another client's clock. clearLocal() removes your local
entry. dispose() releases listeners. Never persist a store snapshot as document
content or as the durable recovery queue.

With the Client bridge, an accepted newer sequence refreshes receipt time even
when its state is unchanged. It can restore an entry removed by local expiry.
An older or repeated sequence does neither. Identical active state does not
emit another snapshot notification.

The bridge accepts Client, SyncClient and EditorHost. Client(local) keeps state
in memory and broadcasts nothing. A known sync host resolves its owning client;
for a custom host with no known owner, only calls through that same host are
intercepted. Existing editor anchors and unrelated source metadata are preserved.
Normal editor selection sends retain their existing cadence. Feature-state
updates are coalesced at 50 ms by default; field clears publish immediately.
The final metadata envelope is validated before send. Inspect connection.lastError
or onError for validation and synchronous sender failures. The existing fire-and-forget
Presence transport does not provide a delivery acknowledgement. Display metadata does not grant
authority. Feature profile metadata is not nested into the envelope: it remains
in the existing source-profile metadata location to avoid exceeding wire depth.

## Stable targets and input drafts

```ts
import type {PresenceTarget, PresenceDraft} from '@barocss/doc-sync/presence';

const text: PresenceTarget = {kind: 'document', anchor: 'token-a', focus: 'token-b'};
const objects: PresenceTarget = {
  kind: 'graphic', objectIds: ['frame-a', 'shape-b'], pointer: {x: 120, y: 80},
};
const cells: PresenceTarget = {
  kind: 'spreadsheet', sheetId: 'budget', rowId: 'row-a', columnId: 'col-cost',
  endRowId: 'row-c', endColumnId: 'col-tax',
};
const draft: PresenceDraft = {
  target: text,
  text: 'Hello 😀',
  composing: false,
  selection: {start: 6, end: 8, direction: 'forward'},
};
store.updateLocal({cursor: text, selection: text, draft});
```

Document endpoints are engine token anchors. Graphic coordinates are world
coordinates until your adapter maps them through the camera transform.
Spreadsheet positions are stable row/column IDs, not an assumed dense grid.
Optional endRowId/endColumnId describe a cell range and must be supplied together.
Draft field optionally identifies a schema field. UTF-16 offsets refer to the
exact draft.text. Equal endpoints mean a caret; backward selection's active end
is start. Surrogate-split offsets are rejected. Combining/ZWJ positions use
native DOM offsets. Drafts are bounded to 4,096 UTF-16 units; this common API has
a separate limit from the private spreadsheet demo's 8,192-unit preview.

Capture input/composition through your editor adapter. A shared component does
not install keyboard handlers or commit IME text. Confirm through the normal
validated editing API; cancel removes only the temporary state. Existing
actor-owned undo/redo still applies to committed edits. Raw draft rendering is
opt-in and does not imply that every existing binding shares its native IME draft.

## Project into your view

```ts
import {mountPresence, createPresenceProjector} from '@barocss/doc-sync-presence-ui';

const projector = createPresenceProjector({
  document(target, context) {
    return editorRects(target, context.role); // Host function: resolve anchors and DOM Range.
  },
  graphic(target, context) {
    return canvasRects(target, context.role); // Host function: object IDs and camera transform.
  },
  spreadsheet(target, context) {
    return sheetRects(target, context.role); // Host function: stable IDs and visible cells.
  },
});
const options = {projector, showAvatars: true};
const ui = mountPresence(container, store, options);
// Call after camera/layout changes that do not emit scroll or resize events.
ui.invalidate();
// Replace options, including the projector, without another subscription.
ui.update(options);
```

Each host function above returns {rects:[{x,y,width,height}]} in viewport CSS
pixels, or null for hidden, deleted, unresolved or offscreen targets. These
functions are supplied by your application. They are not built-in editor APIs.
Use context.role to distinguish the active cursor edge, selected range, and
available draft text box. A one-pixel caret rectangle is unsuitable for a text
preview. Return a complete visible text box for draft content. Draft clipping
uses that box; font comes from the host. Draft text selection is highlighted
with the actor color. Its character caret uses a native DOM Range at the active
UTF-16 endpoint (start for backward selection, end otherwise). The renderer owns clipping and one
requestAnimationFrame update per pending frame. It never computes the document
model or assumes one pixel equals one text position.

The root is input-transparent and leaves native selection/focus untouched.
Avatar names appear on hover, with accessible labels. Actor colors are shared
across avatars/cursors/selections. Bot faces respond to activity/composition.
Show flags select AvatarStack, CursorLayer, SelectionLayer and DraftPreview.
Dispose the UI before removing its container; it removes its DOM, subscriptions,
resize/scroll/pointer listeners and pending frame. It does not dispose your
store, bridge or client.

## React

```tsx
import {PresenceProvider, PresenceOverlay} from '@barocss/doc-sync-presence-react';

function Collaboration({store, options}) {
  return (
    <PresenceProvider store={store}>
      <PresenceOverlay options={options} style={{position: 'absolute', inset: 0}} />
    </PresenceProvider>
  );
}
```

Mount inside the positioned editor container. Pass store directly if you do not
use context. usePresence(store?) uses a stable external-store snapshot. Named
AvatarStack, CursorLayer, SelectionLayer and DraftPreview components select the
shared renderer's layers. React unmount and Strict Mode cleanup release the view,
not the client. See [React external stores](https://react.dev/reference/react/useSyncExternalStore).

## Vue

```vue
<script setup>
import {PresenceOverlay} from '@barocss/doc-sync-presence-vue';
defineProps(['store', 'options']);
</script>

<template>
  <PresenceOverlay :store="store" :options="options" style="position:absolute;inset:0" />
</template>
```

usePresence(store?) supplies a shallow snapshot ref in setup. PresenceProvider
and providePresence supply context; named layer components match the React API.
Scope disposal removes subscriptions. Replacing a provider store switches its
consumers. Core state remains independent of Vue's reactive proxies.

## Svelte

```svelte
<script>
  import {PresenceOverlay} from '@barocss/doc-sync-presence-svelte';
  export let store;
  export let options;
</script>

<PresenceOverlay {store} {options} style="position:absolute;inset:0" />
```

presenceReadable(store) provides an ordinary Svelte readable. Its first reader
starts one core subscription; its final reader stops it. A new reader gets the
current snapshot. The package exports a real compiled Svelte component for
browser/server conditions and source for Svelte-aware bundlers. Component
unmount removes its view without closing the connection. This is Svelte 5
support; Svelte 4 compatibility is not qualified.

## SolidJS

```tsx
import {PresenceProvider, PresenceOverlay, createPresence} from '@barocss/doc-sync-presence-solid';

function Peers() {
  const peers = createPresence();
  return <span>{peers().length}</span>;
}

function Collaboration(props) {
  return (
    <PresenceProvider store={props.store}>
      <Peers />
      <PresenceOverlay options={props.options} style={{position: 'absolute', inset: '0'}} />
    </PresenceProvider>
  );
}
```

createPresence(storeOrAccessor?) and usePresence return a snapshot accessor.
Call them inside a Solid owner. An accessor follows store replacement; the old
subscription is released first. PresenceProvider keeps its store prop reactive.
usePresenceStore returns the resolved store accessor. Named AvatarStack,
CursorLayer, SelectionLayer and DraftPreview use the shared renderer.
Solid's native browser/server conditions select DOM or SSR behavior. Server
rendering needs no DOM or subscriptions. Owner cleanup releases the view,
not the client. See [Solid cleanup](https://docs.solidjs.com/reference/lifecycle/on-cleanup).

## Reconnect and cleanup

Each bridge attaches a random session identity and increasing sequence. Clear
and bridge disposal send a state:null tombstone. Existing receivers retain
bounded sequence history across clear/leave, so a delayed earlier HTTP draft
cannot revive after a newer cancel. Actual HTTP/SSE tests delay an original
composing draft until after cancel, clearLocal, disposal or reconnect.

This protection applies to receivers that observed the sequence/session. A new
receiver, a wholly unseen earlier session, or evicted history cannot identify
that old packet. History is bounded to 1,000 actors and eight retired sessions
per actor. The legacy server map still keeps the last arrival; this is not a
server-wide Presence ordering guarantee. Applications needing that guarantee
must add ordering checks at their authoritative Presence endpoint. The common
store receive() method validates snapshots but does not implement this bridge's
session-order protocol for custom transports.

Disconnected actors disappear through the existing leave/connection lifecycle.
Reconnect clears the common API's stale draft before publishing current state.
This does not replace durable edit recovery or discard pending CRDT edits.
Store disposal order matters:

```ts
ui.dispose();             // Or unmount the framework component.
connection.dispose();     // Release this feature while the source and store still exist.
store.dispose();
// Dispose client only when your application is finished with its document.
```

Neither temporary data nor transport metadata belongs in saved document History.
Source/editor integration is still necessary for every domain. The existing
standalone spreadsheet session protocol is not automatically migrated by adding
this package. A selected TS/Rust backend and a selected UI adapter are independent
concerns; this API does not deliver a new Rust/WASM client backend.

## Run the desktop playground

```sh
npm ci
npm run dev:presence
# In another terminal, after the server prints its address:
PRESENCE_URL=http://127.0.0.1:PORT npm run check:presence
```

The playground mounts real DOM, React, Vue, Svelte and SolidJS overlays over five actual
ProseMirror views. It uses real Client/DocHub with an in-page memory transport;
it is not a cross-browser HTTP demo. Graphic and Spreadsheet surfaces are
stable-ID projection fixtures, not complete graphic/spreadsheet editors.
Use the separate [graphic editor](./graphic-editor) and
[spreadsheet demo](../schemas/spreadsheets) for those full editing integrations.
Mobile testing is excluded.
