import {createComponent, createContext, createEffect, createSignal, getOwner, mergeProps, onCleanup, untrack, useContext} from 'solid-js';
import type {Accessor, JSX, ParentProps} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import type {PresenceState, PresenceStore} from '@barocss/doc-sync/presence';
import {mountPresence} from '@barocss/doc-sync-presence-ui';
import type {PresenceUIOptions} from '@barocss/doc-sync-presence-ui';

export type PresenceSource = PresenceStore | Accessor<PresenceStore>;
const PresenceContext = createContext<Accessor<PresenceStore>>();
const readSource = (source: PresenceSource): PresenceStore => typeof source === 'function' ? source() : source;

/** Keep the provider's store prop reactive. Children must use normal Solid lazy props. */
export function PresenceProvider(props: ParentProps<{store: PresenceStore}>): JSX.Element {
  return createComponent(PresenceContext.Provider, {
    value: () => props.store,
    get children() { return props.children; },
  });
}

/** Returns an accessor so provider and explicit source replacement remain reactive. */
export function usePresenceStore(explicit?: PresenceSource): Accessor<PresenceStore> {
  const inherited = useContext(PresenceContext);
  const resolve = () => explicit ? readSource(explicit) : inherited?.();
  if (!resolve()) throw new Error('Provide a PresenceStore or mount PresenceProvider.');
  return () => resolve()!;
}

/** The Solid owner owns this subscription. Server effects do not subscribe. */
export function createPresence(explicit?: PresenceSource): Accessor<readonly PresenceState[]> {
  if (!getOwner()) throw new Error('createPresence requires a Solid owner.');
  const source = usePresenceStore(explicit);
  const [snapshot, setSnapshot] = createSignal<readonly PresenceState[]>(source().getSnapshot());
  createEffect(() => {
    const store = source();
    const refresh = () => setSnapshot(() => store.getSnapshot());
    refresh();
    const stop = store.subscribe(refresh);
    onCleanup(stop);
  });
  return snapshot;
}
export const usePresence = createPresence;

export interface PresenceOverlayProps {
  store?: PresenceStore;
  options: PresenceUIOptions;
  class?: string;
  style?: JSX.CSSProperties | string;
}

/** Real Solid component. All geometry and painting belong to the shared renderer. */
export function PresenceOverlay(props: PresenceOverlayProps): JSX.Element {
  const inherited = useContext(PresenceContext);
  let container: HTMLDivElement | undefined;
  let handle: ReturnType<typeof mountPresence> | undefined;
  createEffect(() => {
    const store = props.store ?? inherited?.();
    if (!store) throw new Error('Provide a PresenceStore or mount PresenceProvider.');
    if (!container) return;
    const mounted = untrack(() => mountPresence(container!, store, props.options));
    handle = mounted;
    onCleanup(() => { mounted.dispose(); if (handle === mounted) handle = undefined; });
  });
  createEffect(() => { const options = props.options; handle?.update(options); });
  return createComponent(Dynamic, {
    component: 'div',
    ref: (element: HTMLDivElement) => { container = element; },
    get class() { return props.class; },
    get style() { return props.style; },
    'data-doc-sync-presence': 'solid',
  });
}

function primitive(flags: Pick<PresenceUIOptions, 'showAvatars' | 'showCursors' | 'showSelections' | 'showDrafts'>) {
  return (props: PresenceOverlayProps): JSX.Element => createComponent(PresenceOverlay, mergeProps(props, {
    get options() { return {...props.options, ...flags}; },
  }));
}
export const AvatarStack = primitive({showAvatars:true, showCursors:false, showSelections:false, showDrafts:false});
export const CursorLayer = primitive({showAvatars:false, showCursors:true, showSelections:false, showDrafts:false});
export const SelectionLayer = primitive({showAvatars:false, showCursors:false, showSelections:true, showDrafts:false});
export const DraftPreview = primitive({showAvatars:false, showCursors:false, showSelections:false, showDrafts:true});
