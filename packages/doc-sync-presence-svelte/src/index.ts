import {readable} from 'svelte/store';
import type {Readable} from 'svelte/store';
import type {Component} from 'svelte';
import type {PresenceUIOptions} from '@barocss/doc-sync-presence-ui';
import PresenceOverlayComponent from './PresenceOverlay.svelte';
import type {PresenceState, PresenceStore} from '@barocss/doc-sync/presence';
export interface PresenceOverlayProps {
  store: PresenceStore; options: PresenceUIOptions; className?: string; style?: string;
}
export const PresenceOverlay: Component<PresenceOverlayProps> = PresenceOverlayComponent as Component<PresenceOverlayProps>;

/** Svelte starts one subscription for the first reader and stops it for the last. */
export function presenceReadable(store: PresenceStore): Readable<readonly PresenceState[]> {
  return readable(store.getSnapshot(), set => {
    // Refresh after a period with no readers, before listening for the next update.
    set(store.getSnapshot());
    return store.subscribe(() => set(store.getSnapshot()));
  });
}
