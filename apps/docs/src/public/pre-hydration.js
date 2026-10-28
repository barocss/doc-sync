// Until the initial page is hydrated, use the browser's normal navigation.
// VitePress installs its router before the initial page component finishes loading.
(function () {
    function beforeHydration(event) {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('button')) return;
        const link = target.closest('a');
        if (!link || link.closest('.vp-raw') || link.hasAttribute('download') || link.hasAttribute('target')) return;
        const href = link.getAttribute('href');
        if (!href) return;
        const destination = new URL(href, document.baseURI);
        if (destination.origin !== location.origin || !/(?:\.html|\/)$/i.test(destination.pathname)) return;
        // Do not cancel the event: the anchor's default navigation is safe here.
        event.stopImmediatePropagation();
    }
    window.addEventListener('click', beforeHydration, true);
    window.addEventListener('doc-sync:hydrated', () => window.removeEventListener('click', beforeHydration, true), {once: true});
})();
