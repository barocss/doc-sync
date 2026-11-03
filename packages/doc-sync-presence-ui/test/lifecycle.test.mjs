import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountPresence} from '../dist/index.js';

function environment() {
  const handlers = new Map(), frames = new Map();
  let nextFrame = 0, disconnected = false;
  const document = {
    addEventListener(type, fn) {handlers.set(`document:${type}`, fn);},
    removeEventListener(type, fn) {if (handlers.get(`document:${type}`) === fn) handlers.delete(`document:${type}`);},
    createElement() {return element();},
    createDocumentFragment() {return element();},
    createTextNode(text) {return {textContent: text};},
  };
  function element() {
    return {
      ownerDocument: document, style: {}, dataset: {}, children: [], scrollLeft: 10, scrollTop: 20, clientWidth: 100, clientHeight: 50,
      append(...nodes) {this.children.push(...nodes); nodes.forEach(node => node.parent = this);},
      replaceChildren(...nodes) {this.children = nodes;},
      remove() {if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);},
      setAttribute() {},
      getBoundingClientRect() {return {left: 0, top: 0, width: 100, height: 50};},
    };
  }
  document.defaultView = {
    getComputedStyle() {return {position: 'static'};},
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
    addEventListener(type, fn) {handlers.set(`window:${type}`, fn);},
    removeEventListener(type, fn) {if (handlers.get(`window:${type}`) === fn) handlers.delete(`window:${type}`);},
    ResizeObserver: class {observe() {} disconnect() {disconnected = true;}},
  };
  return {host: element(), frames, handlers, get disconnected() {return disconnected;}};
}

test('mount coalesces invalidations, pins scroll viewport, and fully disposes', () => {
  const env = environment();
  let listener, reads = 0, unsubscribed = 0;
  const store = {getSnapshot() {reads++; return [];}, subscribe(fn) {listener = fn; return () => unsubscribed++;}};
  const ui = mountPresence(env.host, store, {projector: () => null});
  ui.invalidate(); listener(); env.handlers.get('window:resize')();
  assert.equal(env.frames.size, 1);
  const render = env.frames.values().next().value; env.frames.clear(); render();
  assert.equal(reads, 1);
  assert.equal(env.host.children[0].style.top, '20px');
  assert.equal(env.host.children[0].style.width, '100px');
  listener();
  assert.equal(env.frames.size, 1);
  ui.dispose(); ui.dispose(); ui.invalidate(); listener();
  assert.equal(env.frames.size, 0);
  assert.equal(env.handlers.size, 0);
  assert.equal(env.host.children.length, 0);
  assert.equal(env.host.style.position, undefined);
  assert.equal(unsubscribed, 1);
  assert.equal(env.disconnected, true);
});

test('shared visibility flags hide draft characters layers while retaining safe draft text', () => {
  const env = environment();
  const target = {kind: 'document', anchor: 'stable'};
  const text = '<img src=x onerror=alert(1)>😀';
  const state = {actor: 'bot', updatedAt: 1, cursor: target, selection: target, draft: {target, text, selection: {start: 0, end: text.length, direction: 'backward'}, composing: true}};
  const ui = mountPresence(env.host, {getSnapshot: () => [state], subscribe: () => () => {}}, {projector: () => ({rects: [{x: 0, y: 0, width: 100, height: 50}]}), showAvatars: false, showCursors: false, showSelections: false});
  const render = env.frames.values().next().value; env.frames.clear(); render();
  const fragment = env.host.children[0].children[0];
  assert.equal(fragment.children.length, 1);
  const preview = fragment.children[0];
  assert.equal(preview.dataset.presencePrimitive, 'DraftPreview');
  assert.equal(preview.children.length, 1);
  assert.equal(preview.children[0].textContent, text);
  assert.equal(preview.children[0].dataset, undefined);
  ui.dispose();
});
