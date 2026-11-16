# DocSync Presence UI

Private, optional, framework-free presence views. Importing the package does not access the DOM. Mount it only in the browser. The package does not write document content, selection, undo history, or draft commits.

## Installation and package status

This package is **private, version `0.0.0`, and not published to npm**. Use the
repository workspaces or local tarballs, not a registry install of this name.
Node **22.18 or later** is required for repository tooling. From the repository root:

```sh
npm ci
npm run build
npm run test --workspace @barocss/doc-sync-presence-ui
```

For a separate application, pack the required workspaces from this checkout:

```sh
mkdir -p artifacts
npm pack --workspace @barocss/doc-sync --pack-destination artifacts
npm pack --workspace @barocss/doc-sync-presence-ui --pack-destination artifacts
```

Install those generated `.tgz` files together in the consuming application. Core is an optional peer for the DOM renderer because its import is type-only;
the example below uses the real core store and therefore installs core too.

## Usage

The following integration sketch assumes your application supplies `container`,
`store`, and the `editor`, `graphic`, and `sheet` geometry adapters. Their methods
are host examples, not APIs exported by this package. For an avatar-only local
setup, use the complete store/projector snippet below and
`mountPresence(container, store, {projector})`.

```ts
import {mountPresence, createPresenceProjector} from '@barocss/doc-sync-presence-ui';

const projector = createPresenceProjector({
  document(target, context) {
    // Resolve stable anchors in your visible editor. Return viewport CSS rects.
    return editor.projectVisibleAnchors(target, context.role);
  },
  graphic(target) {
    // Resolve object IDs, then apply your world-to-viewport transform.
    return graphic.projectVisibleObjects(target);
  },
  spreadsheet(target) {
    // Resolve sheet/row/column IDs after sorting, filtering and scrolling.
    return sheet.projectVisibleCell(target);
  },
});
const view = mountPresence(container, store, {projector});
// Call after a canvas pan, zoom, editor layout, or virtualized row change.
view.invalidate();
// Replace all options. Each flag defaults to true.
view.update({projector, showDrafts: false, maxAvatars: 8});
view.dispose();
```

Use a sized container that encloses the editor viewport. The mount adds an absolute, clipped overlay. It temporarily sets `position: relative` when the container uses static positioning. It restores that inline property on disposal if it still owns it.

`PresenceProjector(target, {actor, role, state})` returns `{rects: [{x, y, width, height}]}` or `null`. Coordinates are viewport CSS pixels. `role` is `cursor`, `selection`, or `draft`. Missing adapters return `null`. Return `null` for deleted, hidden, offscreen or unresolved targets. Never infer document coordinates from world coordinates. A draft adapter can read `state.draft.selection`: its start and end are UTF-16 offsets. Draft selection is shown within the preview; native selection stays intact.

The coherent mount includes AvatarStack, CursorLayer, SelectionLayer, DraftPreview and face-only BotAvatar views. Each node has a `data-presence-primitive` attribute. Bot expressions reflect composition and away state. Names appear on pointer hover and remain available as accessible avatar labels. Every view uses safe text nodes and ignores pointer events.

Store changes, captured scroll events, window resize and container resize request one animation frame. Multiple invalidations share that frame. Projectors run only for presence targets; they must use the host's visible-node index. Each target renders at most 256 rectangles. Avatars default to eight and are capped at 50. Dispose unsubscribes, cancels pending work, disconnects observers and removes DOM nodes.

Draft text uses native DOM layout. `DraftSelection` marks the selected UTF-16 text, and `DraftCaret` uses a collapsed DOM Range at the active offset: start for backward selection, end otherwise, or text end when selection is absent. The caret stays inside the visible preview. A visible draft caret replaces the ordinary actor caret only when both targets match. Empty or clipped drafts retain the ordinary caret. `showCursors: false` hides both caret types; `showSelections: false` hides both document ranges and draft character highlights. `showDrafts: false` hides all draft elements. None of these operations changes native selection.

## Store, geometry and security contract

Create the store once per client actor in your application, not on each render:

```ts
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {createPresenceProjector} from '@barocss/doc-sync-presence-ui';

const store = createPresenceStore({actor: 'demo-replica', ttlMs: 30_000});
store.updateLocal({profile: {name: 'Demo'}, activity: 'active'});
// Avatar-only setup: deliberately no geometry adapters.
const projector = createPresenceProjector({});
```

Pass this store and projector to the example above. This local example opens no
network connection. For real collaboration, use `connectClientPresence` from
`@barocss/doc-sync/presence` with your synchronized client. Give concurrently active
replicas distinct actor IDs. The store starts no expiry timer: the application
must call `expire()` if it needs time-based removal. Dispose the UI first, then
the bridge and store when their owning application closes. Never dispose a shared
store merely because one view unmounts.

The empty projector renders avatars but intentionally draws no document targets.
Supply document-anchor, canvas-object or sheet-cell adapters for cursors, selections
and drafts. Each adapter must return viewport CSS-pixel rectangles or `null` for
hidden, deleted, offscreen or unresolved targets. These geometry adapters belong
to your editor; they are not supplied by this package. Give the overlay a nonzero
size matching the editor viewport.

Presence is ephemeral display state, **not document persistence, edit authorization
or an acknowledgement protocol**. Names and bot labels grant no authority. Draft
text can reveal uncommitted input to other participants: publish it only when your
application intends to share it. No wrapper commits text, installs an editor, or
creates undo history. The shared renderer uses text nodes rather than interpreting
participant names or drafts as HTML.

## Documentation and verification

- [Presence components, connection and projection guide](https://barocss.github.io/doc-sync/guide/presence-components.html)
- [Package composition and engine boundaries](https://barocss.github.io/doc-sync/guide/packages.html)
- [Source and tests](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-presence-ui)
- Run `npm run dev:presence` from the repository root for the five-framework playground.

Package tests exercise renderer or framework lifecycle/SSR behavior; they do not
prove your editor’s coordinate mapping, network authorization, production deployment
or real IME behavior. Validate those integrations separately.
