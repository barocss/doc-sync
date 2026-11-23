import {JSDOM} from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="editor"></div>', {url: 'http://localhost', pretendToBeVisual: true});
for (const name of ['window','document','navigator','Node','Element','HTMLElement','MutationObserver','DOMParser','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
    const value = dom.window[name];
    Object.defineProperty(globalThis, name, {value: typeof value === 'function' && ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name) ? value.bind(dom.window) : value, configurable: true});
}
try { await import("file:///Users/user/github/doc-sync-documentation/output/readme-examples/example-4.ts"); } finally { dom.window.close(); }
