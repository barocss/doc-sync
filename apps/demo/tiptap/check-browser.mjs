import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

// Uses an isolated Chrome session. Start start.mjs first, then pass its URL.
const url = process.argv[2];
if (!url) throw new Error('Usage: node apps/demo/tiptap/check-browser.mjs http://127.0.0.1:PORT');
const session = `docsync-tiptap-proof-${process.pid}`;
const output = process.env.TIPTAP_BROWSER_OUT
    ? pathToFileURL(resolve(process.env.TIPTAP_BROWSER_OUT) + sep)
    : new URL('../../../output/tiptap-evidence/', import.meta.url);
await mkdir(output, {recursive: true});
const run = (...args) => {
    const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {encoding: 'utf8', timeout: 30000}));
    if (!result.success) throw new Error(JSON.stringify(result));
    return result.data;
};
const evaluate = code => run('eval', code).result;
const wait = () => run('wait', '--fn', 'tiptapDemo.inspect().equal && tiptapDemo.clients.every(c => c.pending.length === 0)');
const button = (actor, position) => run('click', `#panes > section:nth-child(${actor}) .toolbar button:nth-child(${position})`);
const editor = actor => run('click', `[aria-label="${actor} editor"]`);
const state = () => evaluate('({equal:tiptapDemo.inspect().equal,pending:tiptapDemo.clients.map(c=>c.pending.length),online:tiptapDemo.clients.map(c=>c.online),text:tiptapDemo.editors.map(e=>e.getText()),destroyed:tiptapDemo.editors.map(e=>e.isDestroyed)})');
let firstFailure = null;
const receipt = {browser: null, input: null, undo: null, redo: null, selection: null, offline: null, reconnect: null, remount: null, errors: null, osIME: 'NOT_RUN'};
try {
    run('open', url); run('wait', '--fn', '!!window.tiptapDemo');
    run('click', '#reset'); wait();
    receipt.browser = evaluate('navigator.userAgent');
    editor('Alice'); run('keyboard', 'type', 'Alice');
    editor('Bob'); run('press', 'End'); run('keyboard', 'type', 'Bob'); wait();
    receipt.input = state(); assert.deepEqual(receipt.input.text, ['AliceBob', 'AliceBob']);
    button(1, 5); wait(); receipt.undo = state(); assert.deepEqual(receipt.undo.text, ['Bob', 'Bob']);
    button(1, 6); wait(); receipt.redo = state(); assert.deepEqual(receipt.redo.text, ['AliceBob', 'AliceBob']);
    editor('Alice'); run('press', 'Home'); run('press', 'Shift+ArrowRight'); run('press', 'Shift+ArrowRight');
    run('wait', '--fn', 'document.querySelectorAll(".pm-remote-selection").length > 0');
    receipt.selection = evaluate('({range:[tiptapDemo.editors[0].state.selection.from,tiptapDemo.editors[0].state.selection.to],presence:[...tiptapDemo.hub.presence.values()],decorations:document.querySelectorAll(".pm-remote-selection").length})');
    assert.deepEqual(receipt.selection.range, [1, 3]);
    const presence = receipt.selection.presence.find(value => value.actor === 'alice');
    assert.ok(presence.anchor && presence.focus && presence.anchor !== presence.focus);
    run('screenshot', new URL('chrome-selection.png', output).pathname);
    button(2, 8); editor('Alice'); run('press', 'End'); run('keyboard', 'type', ' offline');
    receipt.offline = state(); assert.equal(receipt.offline.equal, false); assert.deepEqual(receipt.offline.online, [true, false]);
    button(2, 8); wait(); receipt.reconnect = state(); assert.equal(receipt.reconnect.equal, true);
    button(2, 9); button(1, 7); button(2, 9); wait(); receipt.remount = state();
    assert.equal(receipt.remount.equal, true); assert.deepEqual(receipt.remount.destroyed, [false, false]);
    run('screenshot', new URL('chrome-remount.png', output).pathname);
    receipt.errors = run('errors');
    assert.deepEqual(receipt.errors.errors ?? [], []);
    receipt.result = 'PASS';
    await writeFile(new URL('chrome-receipt.json', output), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
    firstFailure = error;
    throw error;
} finally {
    try { run('close'); }
    catch (error) {
        if (firstFailure) console.error('Browser cleanup also failed:', error);
        else throw error;
    }
}
