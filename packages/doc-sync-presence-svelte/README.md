# DocSync Presence for Svelte

Private, optional Svelte 5 bindings. `PresenceOverlay` is a compiled Svelte
component. It renders the complete shared avatar, cursor, selection, and draft
UI. Names appear on hover, with no extra panel or name list.

```svelte
<script>
  import {PresenceOverlay, presenceReadable} from '@barocss/doc-sync-presence-svelte';
  export let store;
  export let projector;
  const actors = presenceReadable(store);
</script>

<PresenceOverlay {store} options={{projector}} />
```

Props are `store`, `options: PresenceUIOptions`, optional `className`, and optional
CSS `style` text. Use options such as `showCursors: false` to select layers.
Projectors and all DOM geometry come from `@barocss/doc-sync-presence-ui`.
Projection rectangles use viewport CSS pixels.

`presenceReadable(store)` is a standard Svelte readable. It starts one headless
store subscription for the first reader and stops it after the last reader.
The component uses `onMount` and removes its DOM renderer on unmount or store
replacement. It never disposes the store or disconnects its network client.
Imports and server rendering do not access browser globals.

The local build emits compiled browser and server variants. The package's
`browser` and `node` export conditions select them. The `svelte` condition
provides the original component for Svelte-aware bundlers to compile themselves.
No other package needs to run a Svelte compiler.
