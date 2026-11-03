# DocSync Presence UI

Private, optional, framework-free presence views. Importing the package does not access the DOM. Mount it only in the browser. The package does not write document content, selection, undo history, or draft commits.

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
