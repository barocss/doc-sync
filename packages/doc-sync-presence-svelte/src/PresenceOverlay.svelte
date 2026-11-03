<script>
  import {onMount} from 'svelte';
  import {mountPresence} from '@barocss/doc-sync-presence-ui';

  /** @type {import('@barocss/doc-sync/presence').PresenceStore} */
  export let store;
  /** @type {import('@barocss/doc-sync-presence-ui').PresenceUIOptions} */
  export let options;
  /** @type {string | undefined} */
  export let className = undefined;
  /** @type {string | undefined} */
  export let style = undefined;
  let container;
  let mounted = false;
  let activeStore;
  let handle;

  function sync(nextStore, nextOptions) {
    if (!mounted || !container) return;
    if (!handle || activeStore !== nextStore) {
      handle?.dispose();
      handle = mountPresence(container, nextStore, nextOptions);
      activeStore = nextStore;
    } else {
      handle.update(nextOptions);
    }
  }

  $: sync(store, options);
  onMount(() => {
    mounted = true;
    sync(store, options);
    return () => { mounted = false; handle?.dispose(); handle = undefined; activeStore = undefined; };
  });
</script>

<div bind:this={container} class={className} {style} data-doc-sync-presence="svelte"></div>
