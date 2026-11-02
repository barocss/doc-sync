import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createEditor as createSlateEditor, Transforms} from 'slate';
import {Slate, Editable, withReact, ReactEditor} from 'slate-react';
import {createEditor as createLexicalEditor} from 'lexical';
import {registerRichText} from '@lexical/rich-text';
import {EditorView} from 'prosemirror-view';
import {TextSelection} from 'prosemirror-state';
import {baseKeymap} from 'prosemirror-commands';
import {keymap} from 'prosemirror-keymap';
import {Client, clientOwner} from '@barocss/doc-sync-core/client';
import {LocalClient} from '@barocss/doc-sync-core/local';
import {SyncClient} from '@barocss/doc-sync-core/sync';
import {DocHub} from '@barocss/doc-sync-core/server';
import {canonical} from '@barocss/doc-sync-core';
import {Editor} from '@tiptap/core';
import {DocSync, createTiptapExtensions} from '@barocss/doc-sync-tiptap';
import {PmBinding, buildPmSchema, fromPmJSON, pmPosToPath, pathToPmPos} from '@barocss/doc-sync-prosemirror';
import {SlateBinding, fromSlate, slateRangeToModel, modelRangeToSlate} from '@barocss/doc-sync-slate';
import {LexicalBinding, buildLexicalSchema, readLexicalModel, $lexicalSelection, $setLexicalSelection} from '@barocss/doc-sync-lexical';
import {CLIENT_SCHEMA, seedEditsForSize, textOf} from './model.js';

const query = new URLSearchParams(location.search);
const mode = query.get('mode') === 'sync' ? 'sync' : 'local';
const api = query.get('api') === 'legacy' ? 'legacy' : 'unified';
const size = ['10000', '100000'].includes(query.get('size')) ? Number(query.get('size')) : 'sample';
const syncOf = client => client instanceof SyncClient ? client : client instanceof Client ? client.sync : null;
const modelOf = client => client instanceof SyncClient ? client.engine.model() : client.model();
const edit = (client, edits, record) => { if (!(client instanceof SyncClient)) return client.edit(edits, record); const ops = client.engine.apply(edits); client.commit(ops, record); return ops; };
const connect = client => syncOf(client)?.connect();
const disconnect = client => syncOf(client)?.disconnect();
let busy = false, ready = false, hub = null, generation = 0;
const counters = {hubs: 0, subscriptions: 0, sends: 0, presence: 0};
const peers = [], errors = [];
const report = error => {
    errors.push(String(error?.stack ?? error));
    const output = document.querySelector('#errors'); output.hidden = false; output.textContent = errors.join('\n');
};
window.addEventListener('error', event => report(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => report(event.reason));
const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function shortcut(event, peer) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
        event.preventDefault(); event.stopPropagation();
        key === 'y' || event.shiftKey ? peer.binding.redo() : peer.binding.undo();
    }
}
function slate(peer) {
    const schema = peer.schema;
    const editor = withReact(createSlateEditor());
    const binding = new SlateBinding(peer.client, editor, {element: peer.mount, groupTyping: false, onError: report});
    peer.editor = editor; peer.binding = binding;
    peer.read = () => fromSlate(schema, editor.children);
    peer.range = () => slateRangeToModel(schema, editor.children, editor.selection);
    peer.select = range => { const native = modelRangeToSlate(schema, editor.children, range); if (!native) throw Error('Invalid Slate selection'); Transforms.select(editor, native); ReactEditor.focus(editor); };
    let mounted; const ready = new Promise(resolve => { mounted = resolve; });
    function App() {
        useEffect(() => { mounted(); }, []);
        return <Slate editor={editor} initialValue={binding.initialValue}><Editable className="editor" role="textbox" aria-label="Slate" spellCheck={false}
            renderElement={({attributes, children, element}) => React.createElement(element.type === 'heading' ? 'h2' : 'p', attributes, children)}
            renderLeaf={({attributes, children, leaf}) => <span {...attributes} style={{fontWeight: leaf.bold ? 'bold' : undefined, fontStyle: leaf.italic ? 'italic' : undefined, textDecoration: leaf.underline ? 'underline' : undefined}}>{children}</span>}
            onKeyDown={event => shortcut(event, peer)}/></Slate>;
    }
    const root = createRoot(peer.mount); root.render(<App/>);
    peer.cleanup = () => { binding.dispose(); root.unmount(); };
    return ready;
}
function lexical(peer) {
    const schema = peer.schema;
    const element = document.createElement('div'); element.className = 'editor'; element.contentEditable = 'true';
    element.setAttribute('role', 'textbox'); element.setAttribute('aria-label', 'Lexical'); element.spellcheck = false; peer.mount.append(element);
    const info = buildLexicalSchema(schema);
    const editor = createLexicalEditor({namespace: 'client-lexical', nodes: info.nodes, theme: {text: {bold: 'bold', italic: 'italic', underline: 'underline'}}, onError: report});
    editor.setRootElement(element); const rich = registerRichText(editor);
    const binding = new LexicalBinding(peer.client, editor, {info, groupTyping: false, onError: report});
    peer.editor = editor; peer.binding = binding;
    peer.read = () => readLexicalModel(editor, info);
    peer.range = () => editor.getEditorState().read(() => $lexicalSelection(info));
    peer.select = range => { element.focus(); editor.update(() => { if (!$setLexicalSelection(info, range)) throw Error('Invalid Lexical selection'); }, {discrete: true}); };
    const key = event => shortcut(event, peer); element.addEventListener('keydown', key, true);
    peer.cleanup = () => { binding.dispose(); rich(); element.removeEventListener('keydown', key, true); editor.setRootElement(null); };
}
function prosemirror(peer) {
    const schema = peer.schema;
    const info = buildPmSchema(schema, {paragraph: () => ['p', 0], heading: () => ['h2', 0]});
    const binding = new PmBinding(peer.client, info, [keymap(baseKeymap)]);
    const view = new EditorView(peer.mount, {state: binding.state, dispatchTransaction: tr => binding.dispatch(tr),
        attributes: {class: 'editor ProseMirror', role: 'textbox', 'aria-label': 'ProseMirror', spellcheck: 'false'}});
    binding.view = view; binding.onChange = () => view.updateState(binding.state);
    peer.binding = binding;
    peer.read = () => fromPmJSON(info, schema, view.state.doc.toJSON(), modelOf(peer.client));
    peer.range = () => view.state.selection instanceof TextSelection ? {
        anchor: pmPosToPath(schema, view.state.doc, view.state.selection.anchor, modelOf(peer.client)),
        focus: pmPosToPath(schema, view.state.doc, view.state.selection.head, modelOf(peer.client)),
    } : null;
    peer.select = range => { const pos = path => pathToPmPos(schema, view.state.doc, path, modelOf(peer.client)); binding.dispatch(binding.state.tr.setSelection(TextSelection.create(view.state.doc, pos(range.anchor), pos(range.focus)))); view.focus(); };
    const key = event => shortcut(event, peer); view.dom.addEventListener('keydown', key, true);
    peer.cleanup = () => { binding.dispose(); view.dom.removeEventListener('keydown', key, true); view.destroy(); };
}
function tiptap(peer) {
    const editor = new Editor({element: peer.mount, extensions: [...createTiptapExtensions(peer.schema), DocSync.configure({client: peer.client, onError: report})]});
    editor.view.dom.classList.add('editor'); editor.view.dom.setAttribute('aria-label', 'Tiptap');
    const info = buildPmSchema(peer.schema);
    peer.editor = editor;
    peer.binding = {undo: () => editor.commands.docSyncUndo(), redo: () => editor.commands.docSyncRedo()};
    peer.read = () => fromPmJSON(info, peer.schema, editor.getJSON(), modelOf(peer.client));
    peer.range = () => ({anchor: pmPosToPath(peer.schema, editor.state.doc, editor.state.selection.anchor, modelOf(peer.client)), focus: pmPosToPath(peer.schema, editor.state.doc, editor.state.selection.head, modelOf(peer.client))});
    peer.select = range => { const pos = path => pathToPmPos(peer.schema, editor.state.doc, path, modelOf(peer.client)); editor.commands.setTextSelection({from: pos(range.anchor), to: pos(range.focus)}); editor.view.focus(); };
    peer.cleanup = () => editor.destroy();
}
function transport(actor) {
    const server = hub;
    return {
        subscribe(since, receive, epoch) {
            counters.subscriptions++;
            let active = true;
            const deliver = event => queueMicrotask(() => { if (active) receive(event); });
            const hello = server.hello(since, epoch); deliver(hello);
            if (hello.type === 'hello' && !hello.snapshot && since > 0) server.since(since).forEach(envelope => deliver({type: 'change', envelope}));
            server.connect(actor, hello.type === 'hello' && hello.snapshot ? server.serverSeq : since);
            const stop = server.listen(deliver);
            return () => { active = false; stop(); server.disconnect(actor); };
        },
        async send(message) {
            counters.sends++;
            await Promise.resolve();
            if (message.kind === 'change') server.submit(message.change); else server.ack(message.ack);
        },
        sendPresence(value) { counters.presence++; server.setPresence(value); },
    };
}
async function until(predicate) {
    const deadline = performance.now() + 5000;
    while (!predicate()) { if (performance.now() > deadline) throw Error('Client demo did not settle'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
function detach(peer) { peer.cleanup?.(); peer.cleanup = null; peer.mount.replaceChildren(); }
async function mount(peer) {
    detach(peer);
    if (peer.name === 'Slate') await slate(peer);
    else if (peer.name === 'Lexical') lexical(peer);
    else if (peer.name === 'Tiptap') tiptap(peer);
    else prosemirror(peer);
    await settle();
}
async function exclusive(action) {
    if (busy) throw Error('Editors are mounting. Try again when ready.');
    busy = true; document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { return await action(); }
    finally { busy = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
async function initialize() {
    generation++;
    if (mode === 'sync') { hub = new DocHub({schema: CLIENT_SCHEMA}); counters.hubs++; }
    const shared = mode === 'local' ? (api === 'legacy' ? new LocalClient({schema: CLIENT_SCHEMA, actor: `local-${generation}`}) : new Client({schema: CLIENT_SCHEMA, actor: `local-${generation}`})) : null;
    for (const peer of peers) {
        const actor = `${peer.name.toLowerCase()}-${generation}`;
        peer.client = shared ?? (api === 'legacy' ? new SyncClient(actor, transport(actor), {schema: CLIENT_SCHEMA, ackDelay: 0}) : new Client({schema: CLIENT_SCHEMA, actor, transport: transport(actor), syncOptions: {ackDelay: 0}}));
        connect(peer.client);
    }
    if (mode === 'sync') await until(() => peers.every(peer => syncOf(peer.client)?.synchronized));
    edit(peers[0].client, seedEditsForSize(size), null);
    if (mode === 'sync') await until(() => peers.every(peer => syncOf(peer.client).pending.length === 0 && textOf(modelOf(peer.client)) === textOf(modelOf(peers[0].client))));
    for (const client of new Set(peers.map(peer => peer.client))) client.clearHistory();
    for (const peer of peers) await mount(peer);
}
async function reset() {
    ready = false; releaseMeasurement(); peers.forEach(detach);
    const clients = new Set(peers.map(peer => peer.client));
    for (const client of clients) connect(client);
    await until(() => [...clients].every(client => !syncOf(client) || syncOf(client).synchronized && syncOf(client).pending.length === 0));
    for (const client of clients) { client.clearHistory(); disconnect(client); client.dispose(); }
    await initialize(); ready = true;
}
function makePeer(name) {
    const section = document.createElement('section'); section.className = 'panel'; section.dataset.editor = name;
    const heading = document.createElement('h2'); heading.textContent = name;
    const tools = document.createElement('div'); tools.className = 'tools'; tools.setAttribute('aria-label', `${name} actions`);
    const mountElement = document.createElement('div'); mountElement.className = 'mount';
    section.append(heading, tools, mountElement); document.querySelector('#editors').append(section);
    const peer = {name, section, mount: mountElement, schema: CLIENT_SCHEMA}; peers.push(peer);
    const actions = [['Undo', () => peer.binding.undo()], ['Redo', () => peer.binding.redo()], ['Insert prefix', () => edit(peer.client, [{op: 'insert', at: [0, 0], content: 'x'}])], ['Remount', () => exclusive(() => mount(peer))]];
    if (mode === 'sync') actions.push(['Disconnect / Reconnect', () => syncOf(peer.client).online ? disconnect(peer.client) : connect(peer.client)]);
    for (const [label, action] of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => { try { Promise.resolve(action()).catch(report); } catch (error) { report(error); } }); tools.append(button);
    }
}
const named = name => { const peer = peers.find(peer => peer.name === name); if (!peer) throw Error('Unknown editor'); return peer; };
let measurement = null, releaseMeasurement = () => {};
function measure(source, expectedText) {
    if (!ready || busy) throw Error('Editors are not ready');
    releaseMeasurement();
    const peer = named(source), element = peer.mount.querySelector('[contenteditable="true"]');
    if (!element) throw Error('Source editor is not mounted');
    const normalize = value => value.replace(/[\n\r\uFEFF]/g, '');
    const expected = normalize(expectedText);
    const current = measurement = {source, status: 'armed', inputAt: null, peers: peers.map(peer => ({name: peer.name, peerDomAt: null, raf2: null})), note: 'DOM equality and two animation-frame callbacks indicate a rendering opportunity, not physical display.'};
    let active = true;
    const observers = [];
    const check = (peer, index) => {
        const entry = current.peers[index];
        if (!active || current.inputAt === null || entry.peerDomAt !== null) return;
        const native = peer.mount.querySelector('[contenteditable="true"]');
        if (!native || normalize(native.textContent ?? '') !== expected) return;
        entry.peerDomAt = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!active) return;
            entry.raf2 = performance.now();
            if (current.peers.every(entry => entry.raf2 !== null)) { current.status = 'complete'; releaseMeasurement(); }
        }));
    };
    peers.forEach((peer, index) => {
        const observer = new MutationObserver(() => check(peer, index));
        observer.observe(peer.mount, {subtree: true, childList: true, characterData: true}); observers.push(observer);
    });
    const input = event => {
        if (!event.isTrusted || current.inputAt !== null) return;
        current.inputAt = performance.now(); current.inputType = event.inputType; current.status = 'waiting-for-dom';
        element.removeEventListener('beforeinput', input, true);
    };
    element.addEventListener('beforeinput', input, true);
    releaseMeasurement = () => { active = false; observers.forEach(observer => observer.disconnect()); element.removeEventListener('beforeinput', input, true); };
    return current;
}
window.__clientDemo = {
    get ready() { return ready; }, get busy() { return busy; }, get measurement() { return measurement; }, measure,
    snapshot: () => ({ready, busy, mode, api, size, measurement, payloadCharacters: peers.length ? textOf(modelOf(peers[0].client)).replace(/\n/g, '').length : 0, clientCount: new Set(peers.map(peer => peer.client)).size, counters: {...counters}, errors: [...errors], peers: peers.map(peer => {
        const client = peer.client, owner = clientOwner(client), model = canonical(peer.schema, modelOf(client)), native = canonical(peer.schema, peer.read());
        return {name: peer.name, mode: client instanceof Client ? client.mode : syncOf(client) ? 'sync' : 'local', syncNull: syncOf(client) === null, actor: client.actor, model, native, text: textOf(model), nativeText: textOf(native), selection: peer.range(), history: client.historyStatus(), notifications: client.notificationErrors ?? [],
            localBackendIsLocal: owner instanceof LocalClient, backendFields: Object.keys(owner), ...(syncOf(client) ? {pending: syncOf(client).pending.length, online: syncOf(client).online, synchronized: syncOf(client).synchronized} : {})};
    })}),
    select: (name, range) => named(name).select(range),
    insertPrefix: name => edit(named(name).client, [{op: 'insert', at: [0, 0], content: 'x'}]),
    undo: name => named(name).binding.undo(), redo: name => named(name).binding.redo(),
    remount: name => exclusive(() => mount(named(name))), reset: () => exclusive(reset),
    disconnect: name => disconnect(named(name).client), reconnect: name => connect(named(name).client),
};
document.body.dataset.mode = mode;
document.querySelector('#diagnostics').textContent = `${api === 'legacy' ? 'Legacy API: current-code same-page control (not an older Tiptap local API)' : 'Unified Client API'} · ${size === 'sample' ? 'Rich sample' : `${size.toLocaleString()} payload characters, 100 characters per paragraph`}`;
for (const link of document.querySelectorAll('[data-mode]')) if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
document.querySelector('#mode-description').textContent = mode === 'local'
    ? 'Four native views share one Client, one local actor, and one history. Each view keeps its own selection.'
    : 'Four Client instances use separate actors and a queued in-process memory transport. Each actor has its own history.';
document.querySelector('#transport-description').textContent = mode === 'local'
    ? 'Local runtime: no sync backend, no document hub, no transport subscriptions or sends. This two-mode bundle includes sync code.'
    : 'Sync runtime: document messages stay in this page. The loopback server serves static files only. This demo does not use an HTTP document server.';
document.querySelector('#reset').addEventListener('click', () => exclusive(reset).catch(report));
try {
    ['ProseMirror', 'Slate', 'Lexical', 'Tiptap'].forEach(makePeer);
    await exclusive(initialize); ready = true;
} catch (error) { report(error); }
window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    peers.forEach(detach);
    for (const client of new Set(peers.map(peer => peer.client))) client && disconnect(client);
});
