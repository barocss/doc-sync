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
import {LocalClient, createLocalEditorHost} from '@barocss/doc-sync-core/local';
import {PmHostBinding, buildPmSchema, fromPmJSON, pmPosToPath, pathToPmPos} from '@barocss/doc-sync-prosemirror';
import {SlateHostBinding, fromSlate, slateRangeToModel, modelRangeToSlate} from '@barocss/doc-sync-slate';
import {LexicalHostBinding, buildLexicalSchema, readLexicalModel, $lexicalSelection, $setLexicalSelection} from '@barocss/doc-sync-lexical';
import {LOCAL_SCHEMA, SHARED_SCHEMA, seedEdits, sharedSeedEdits, textOf} from './model.js';
import {mountCustomEditor} from './custom-editor.mjs';

const shared = new URLSearchParams(location.search).get('mode') === 'shared';
const mode = shared ? 'shared' : 'independent';
let sharedClient, busy = false;

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
    const binding = new SlateHostBinding(peer.host, editor, {element: peer.mount, groupTyping: false, onError: report});
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
    const editor = createLexicalEditor({namespace: 'local-lexical', nodes: info.nodes, theme: {text: {bold: 'bold', italic: 'italic', underline: 'underline'}}, onError: report});
    editor.setRootElement(element); const rich = registerRichText(editor);
    const binding = new LexicalHostBinding(peer.host, editor, {info, groupTyping: false, onError: report});
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
    const binding = new PmHostBinding(peer.host, info, [keymap(baseKeymap)]);
    const view = new EditorView(peer.mount, {state: binding.state, dispatchTransaction: tr => binding.dispatch(tr),
        attributes: {class: 'editor ProseMirror', role: 'textbox', 'aria-label': 'ProseMirror', spellcheck: 'false'}});
    binding.view = view; binding.onChange = () => view.updateState(binding.state);
    peer.binding = binding;
    peer.read = () => fromPmJSON(info, schema, view.state.doc.toJSON(), peer.client.model());
    peer.range = () => view.state.selection instanceof TextSelection ? {
        anchor: pmPosToPath(schema, view.state.doc, view.state.selection.anchor, peer.client.model()),
        focus: pmPosToPath(schema, view.state.doc, view.state.selection.head, peer.client.model()),
    } : null;
    peer.select = range => { const pos = path => pathToPmPos(schema, view.state.doc, path, peer.client.model()); binding.dispatch(binding.state.tr.setSelection(TextSelection.create(view.state.doc, pos(range.anchor), pos(range.focus)))); view.focus(); };
    const key = event => shortcut(event, peer); view.dom.addEventListener('keydown', key, true);
    peer.cleanup = () => { binding.dispose(); view.dom.removeEventListener('keydown', key, true); view.destroy(); };
}
function custom(peer) {
    const textarea = document.createElement('textarea'); textarea.className = 'editor custom-editor';
    textarea.setAttribute('aria-label', 'Custom'); textarea.spellcheck = false; peer.mount.append(textarea);
    const binding = mountCustomEditor(textarea, peer.host, {onError: report});
    peer.binding = binding; peer.read = () => binding.readModel();
    peer.range = () => binding.selection(); peer.select = range => { textarea.focus(); binding.setSelection(range); };
    peer.cleanup = () => binding.dispose();
}
function newClient(peer) {
    const client = new LocalClient({schema: peer.schema, actor: shared ? 'local-shared' : `local-${peer.name.toLowerCase()}`, onNotificationError: report});
    client.edit(peer.seed(), null); client.clearHistory(); return client;
}
function detach(peer) { peer.cleanup?.(); peer.cleanup = null; peer.mount.replaceChildren(); }
async function mount(peer, reset = false) {
    detach(peer);
    if (shared) peer.client = sharedClient;
    else if (!peer.client || reset) { peer.client?.dispose(); peer.client = newClient(peer); }
    // Each view needs its own host origin, including views that borrow one client.
    peer.host = createLocalEditorHost(peer.client);
    if (peer.name === 'Custom') custom(peer);
    else if (peer.name === 'Slate') await slate(peer);
    else if (peer.name === 'Lexical') lexical(peer);
    else prosemirror(peer);
    await settle();
}
async function exclusive(action) {
    if (busy) throw Error('Editors are mounting. Try again when ready.');
    busy = true; document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { return await action(); }
    finally { busy = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
async function resetShared() {
    // Detach every observer before replacing or disposing the shared client.
    peers.forEach(detach); sharedClient?.dispose(); sharedClient = newClient(peers[0]);
    for (const peer of peers) await mount(peer);
}
function makePeer(name) {
    const section = document.createElement('section'); section.className = 'panel'; section.dataset.editor = name;
    const heading = document.createElement('h2'); heading.textContent = name;
    const tools = document.createElement('div'); tools.className = 'tools'; tools.setAttribute('aria-label', `${name} actions`);
    const mount = document.createElement('div'); mount.className = 'mount';
    section.append(heading, tools, mount); document.querySelector('#editors').append(section);
    const peer = {name, section, mount, schema: shared ? SHARED_SCHEMA : LOCAL_SCHEMA, seed: shared ? sharedSeedEdits : seedEdits}; peers.push(peer);
    for (const [label, action] of [['Undo', () => peer.binding.undo()], ['Redo', () => peer.binding.redo()],
        ['Insert prefix', () => peer.client.edit([{op: 'insert', at: [0, 0], content: 'Local '}])], [shared ? 'Remount' : 'Reset', () => shared ? exclusive(() => mount(peer)) : mountPeer(peer)]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => { try { Promise.resolve(action()).catch(report); } catch (error) { report(error); } }); tools.append(button);
    }
    return peer;
}
const named = name => { const peer = peers.find(value => value.name === name); if (!peer) throw Error('Unknown editor'); return peer; };
const mountPeer = peer => exclusive(() => shared ? resetShared() : mount(peer, true));
window.__localDemo = {
    ready: false,
    get busy() { return busy; },
    snapshot: () => ({ready: window.__localDemo.ready, mode, shared, busy, clientCount: new Set(peers.map(peer => peer.client)).size, hostCount: new Set(peers.map(peer => peer.host)).size, sameClient: peers.length > 0 && peers.every(peer => peer.client === peers[0].client), actor: sharedClient?.actor ?? null, errors: [...errors], peers: peers.map(peer => {
        const model = peer.client.model(), native = peer.read();
        return {name: peer.name, actor: peer.client.actor, model, native, text: textOf(model), nativeText: textOf(native), selection: peer.range(), history: peer.client.historyStatus(), notificationErrors: peer.client.notificationErrors};
    })}),
    reset: name => mountPeer(named(name)),
    remount: name => exclusive(() => mount(named(name))),
    insertPrefix: name => named(name).client.edit([{op: 'insert', at: [0, 0], content: 'Local '}]),
    select: (name, range) => named(name).select(range),
    undo: name => named(name).binding.undo(), redo: name => named(name).binding.redo(),
};
document.body.dataset.mode = mode;
for (const link of document.querySelectorAll('[data-mode]')) {
    if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
}
if (shared) {
    document.querySelector('#mode-description').textContent = 'Four native views share one document, one local actor, and one Undo history. Each view keeps its own selection.';
    document.querySelector('#reset-description').textContent = 'Memory only. Refresh restores the sample. Reset shared document restores all four views. Remount keeps the document and history.';
    const reset = document.querySelector('#reset-shared'); reset.hidden = false;
    reset.addEventListener('click', () => exclusive(resetShared).catch(report));
}
try {
    for (const name of shared ? ['Custom', 'ProseMirror', 'Slate', 'Lexical'] : ['ProseMirror', 'Slate', 'Lexical']) makePeer(name);
    await exclusive(async () => {
        if (shared) sharedClient = newClient(peers[0]);
        for (const peer of peers) await mount(peer);
    });
    window.__localDemo.ready = true;
} catch (error) { report(error); }
window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    peers.forEach(detach);
    for (const client of new Set(peers.map(peer => peer.client))) client?.dispose();
});
