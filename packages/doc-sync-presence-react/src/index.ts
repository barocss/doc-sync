import {createContext, createElement, useCallback, useContext, useEffect, useRef, useSyncExternalStore} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import type {PresenceState, PresenceStore} from '@barocss/doc-sync/presence';
import {mountPresence} from '@barocss/doc-sync-presence-ui';
import type {PresenceUIOptions} from '@barocss/doc-sync-presence-ui';

const PresenceContext = createContext<PresenceStore | null>(null);

/** Supplies a store without owning or disconnecting it. */
export function PresenceProvider({store, children}: {store: PresenceStore; children?: ReactNode}): ReactNode {
  return createElement(PresenceContext.Provider, {value: store}, children);
}

export function usePresenceStore(explicit?: PresenceStore): PresenceStore {
  const context = useContext(PresenceContext);
  const store = explicit ?? context;
  if (!store) throw new Error('Provide a PresenceStore or mount PresenceProvider.');
  return store;
}

/** Stable external-store snapshots, including during server rendering. */
export function usePresence(explicit?: PresenceStore): readonly PresenceState[] {
  const store = usePresenceStore(explicit);
  const subscribe = useCallback((notify: () => void) => store.subscribe(notify), [store]);
  const snapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export interface PresenceOverlayProps {
  store?: PresenceStore;
  options: PresenceUIOptions;
  className?: string;
  style?: CSSProperties;
}

/** DOM geometry and rendering belong to the shared Presence UI package. */
export function PresenceOverlay({store: explicit, options, className, style}: PresenceOverlayProps): ReactNode {
  const store = usePresenceStore(explicit);
  const container = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountPresence> | null>(null);
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!container.current) return;
    const handle = mountPresence(container.current, store, latest.current);
    mounted.current = handle;
    return () => { mounted.current = null; handle.dispose(); };
  }, [store]);
  useEffect(() => { mounted.current?.update(options); }, [options]);
  return createElement('div', {ref: container, className, style, 'data-doc-sync-presence': 'react'});
}

function primitive(flags: Pick<PresenceUIOptions, 'showAvatars' | 'showCursors' | 'showSelections' | 'showDrafts'>) {
  return function PresencePrimitive(props: PresenceOverlayProps): ReactNode {
    return createElement(PresenceOverlay, {...props, options: {...props.options, ...flags}});
  };
}
export const AvatarStack = primitive({showAvatars:true, showCursors:false, showSelections:false, showDrafts:false});
export const CursorLayer = primitive({showAvatars:false, showCursors:true, showSelections:false, showDrafts:false});
export const SelectionLayer = primitive({showAvatars:false, showCursors:false, showSelections:true, showDrafts:false});
export const DraftPreview = primitive({showAvatars:false, showCursors:false, showSelections:false, showDrafts:true});
