import type {Component} from 'svelte';
import type {PresenceStore} from '@barocss/doc-sync/presence';
import type {PresenceUIOptions} from '@barocss/doc-sync-presence-ui';
export interface PresenceOverlayProps {
  store: PresenceStore;
  options: PresenceUIOptions;
  className?: string;
  style?: string;
}
declare const PresenceOverlay: Component<PresenceOverlayProps>;
export default PresenceOverlay;
