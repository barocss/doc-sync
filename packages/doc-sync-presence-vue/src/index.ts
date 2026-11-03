import {computed, defineComponent, h, inject, onMounted, onScopeDispose, provide, shallowRef, toRef, watch} from 'vue';
import type {InjectionKey, PropType, ShallowRef, Ref} from 'vue';
import type {PresenceState, PresenceStore} from '@barocss/doc-sync/presence';
import {mountPresence} from '@barocss/doc-sync-presence-ui';
import type {PresenceUIOptions} from '@barocss/doc-sync-presence-ui';

const PresenceKey: InjectionKey<Readonly<Ref<PresenceStore>>> = Symbol('DocSync Presence');

export function providePresence(store: PresenceStore): void { provide(PresenceKey, shallowRef(store)); }
export function usePresenceStore(explicit?: PresenceStore): PresenceStore {
  const store = explicit ?? inject(PresenceKey, null)?.value;
  if (!store) throw new Error('Provide a PresenceStore or mount PresenceProvider.');
  return store;
}

/** Call in setup. The component scope owns this subscription, never the store. */
export function usePresence(explicit?: PresenceStore): Readonly<ShallowRef<readonly PresenceState[]>> {
  const inherited = inject(PresenceKey, null);
  const resolved = computed(() => explicit ?? inherited?.value);
  if (!resolved.value) throw new Error('Provide a PresenceStore or mount PresenceProvider.');
  const snapshot = shallowRef<readonly PresenceState[]>(resolved.value.getSnapshot());
  let unsubscribe: (() => void) | undefined;
  let stop: (() => void) | undefined;
  onMounted(() => {
    stop = watch(resolved, store => {
      unsubscribe?.();
      if (!store) return;
      snapshot.value = store.getSnapshot();
      unsubscribe = store.subscribe(() => { snapshot.value = store.getSnapshot(); });
    }, {immediate:true});
  });
  onScopeDispose(() => { stop?.(); unsubscribe?.(); });
  return snapshot;
}

export const PresenceProvider = defineComponent({
  name:'PresenceProvider',
  props:{store:{type:Object as PropType<PresenceStore>, required:true}},
  setup(props, {slots}) { provide(PresenceKey, toRef(props, 'store')); return () => slots.default?.(); },
});

export const PresenceOverlay = defineComponent({
  name:'PresenceOverlay', inheritAttrs:false,
  props:{store:{type:Object as PropType<PresenceStore>}, options:{type:Object as PropType<PresenceUIOptions>, required:true}},
  setup(props, {attrs}) {
    const inherited = inject(PresenceKey, null);
    const container = shallowRef<HTMLDivElement | null>(null);
    let handle: ReturnType<typeof mountPresence> | null = null;
    let stop: (() => void) | undefined;
    onMounted(() => {
      stop = watch(() => props.store ?? inherited?.value, store => {
        handle?.dispose(); handle = null;
        if (!store) throw new Error('Provide a PresenceStore or mount PresenceProvider.');
        if (container.value) handle = mountPresence(container.value, store, props.options);
      }, {immediate:true});
    });
    // Track options explicitly: a handle is intentionally not reactive.
    const stopOptions = watch(() => props.options, options => handle?.update(options), {deep:true});
    onScopeDispose(() => { stop?.(); stopOptions(); handle?.dispose(); handle = null; });
    return () => h('div', {...attrs, ref:container, 'data-doc-sync-presence':'vue'});
  },
});

function primitive(name:string, flags: Pick<PresenceUIOptions, 'showAvatars' | 'showCursors' | 'showSelections' | 'showDrafts'>) {
  return defineComponent({
    name, inheritAttrs:false,
    props:{store:{type:Object as PropType<PresenceStore>}, options:{type:Object as PropType<PresenceUIOptions>, required:true}},
    setup(props, {attrs}) { return () => h(PresenceOverlay, {...attrs, store:props.store, options:{...props.options, ...flags}}); },
  });
}
export const AvatarStack = primitive('AvatarStack', {showAvatars:true, showCursors:false, showSelections:false, showDrafts:false});
export const CursorLayer = primitive('CursorLayer', {showAvatars:false, showCursors:true, showSelections:false, showDrafts:false});
export const SelectionLayer = primitive('SelectionLayer', {showAvatars:false, showCursors:false, showSelections:true, showDrafts:false});
export const DraftPreview = primitive('DraftPreview', {showAvatars:false, showCursors:false, showSelections:false, showDrafts:true});
