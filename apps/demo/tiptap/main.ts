import {Editor} from '@tiptap/core';
import {DocSync, createTiptapExtensions} from '@barocss/doc-sync/tiptap';
import {SyncClient, typescriptClientEngineFactory} from '@barocss/doc-sync/sync';
import type {ClientEngineFactory} from '@barocss/doc-sync/sync';
import {DocHub} from '@barocss/doc-sync/server';
import {canonical} from '@barocss/doc-sync';
import {buildPmSchema, fromPmJSON} from '@barocss/doc-sync/prosemirror';
import type {Schema} from '@barocss/doc-sync';
import type {ServerEvent, Transport} from '@barocss/doc-sync/sync';

const schema: Schema = {root: 'content', marks: ['bold', 'italic'], nodes: {
    content: {shape: 'flow', children: ['paragraph', 'list'], default: 'paragraph'},
    paragraph: {shape: 'text'}, list: {shape: 'group', children: ['list-item'], by: ['listType']},
    'list-item': {shape: 'text', attrs: {listType: {default: 'bullet', values: ['bullet', 'numbered']}, level: {default: 0, min: 0, max: 4}}},
}};
const requestedEngine = new URLSearchParams(location.search).get('engine');
if (requestedEngine !== null && requestedEngine !== 'typescript') throw new Error(`Unsupported engine selection: ${requestedEngine}`);
// Instrument only the explicit engine selector. Normal demo use has no proxies.
const engineDiagnostic = {selected: requestedEngine ?? 'default', tracked: requestedEngine !== null,
    calls: {} as Record<string, Record<string, number>>, sessions: 'NOT_APPLICABLE: Tiptap uses ProseMirror transactions'};
const engineFactory: ClientEngineFactory | undefined = requestedEngine === 'typescript' ? {
    ...typescriptClientEngineFactory,
    create(actor, selectedSchema) {
        const counts = engineDiagnostic.calls[actor] ??= {};
        counts.create = (counts.create ?? 0) + 1;
        const engine = typescriptClientEngineFactory.create(actor, selectedSchema);
        return new Proxy(engine, {get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => {
                const name = String(key); counts[name] = (counts[name] ?? 0) + 1;
                return value.apply(target, args);
            };
        }});
    },
} : undefined;
const hub = new DocHub({schema});
// Queue delivery so a server echo cannot re-enter a local editor transaction.
const transport = (actor: string): Transport => ({
    subscribe(since, onEvent, epoch) {
        let active = true;
        const deliver = (event: ServerEvent) => queueMicrotask(() => { if (active) onEvent(event); });
        const hello = hub.hello(since, epoch);
        deliver(hello);
        if (hello.type === 'hello' && !hello.snapshot && since > 0) hub.since(since).forEach(envelope => deliver({type: 'change', envelope}));
        hub.connect(actor, hello.type === 'hello' && hello.snapshot ? hub.serverSeq : since);
        const stop = hub.listen(deliver);
        return () => { active = false; stop(); hub.disconnect(actor); };
    },
    async send(message) { if (message.kind === 'change') hub.submit(message.change); else hub.ack(message.ack); },
    sendPresence(presence) { hub.setPresence(presence); },
});
const clients = ['Alice', 'Bob'].map(name => new SyncClient(name.toLowerCase(), transport(name.toLowerCase()), {schema, ...(engineFactory ? {engineFactory} : {})}));
clients.forEach(client => client.connect());
await new Promise(resolve => setTimeout(resolve, 0));
const editors = clients.map((client, index) => {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${index ? 'Bob' : 'Alice'}</h2><p class="connection"></p><div class="toolbar"></div><div class="mount"></div>`;
    document.querySelector('#panes')!.append(section);
    const mount = () => new Editor({element: section.querySelector('.mount') as HTMLElement, extensions: [
        ...createTiptapExtensions(schema), DocSync.configure({client, presence: {name: index ? 'Bob' : 'Alice', color: index ? '#a64d79' : '#2274a5'}}),
    ]});
    let editor = mount();
    editor.view.dom.setAttribute('aria-label', `${index ? 'Bob' : 'Alice'} editor`);
    const actions: Array<[string, () => void]> = [
        ['Bold', () => { editor.chain().focus().toggleMark('bold').run(); }],
        ['Italic', () => { editor.chain().focus().toggleMark('italic').run(); }],
        ['Paragraph', () => { editor.chain().focus().splitBlock().run(); }],
        ['List', () => { editor.chain().focus().setNode('list_item').run(); }],
        ['Undo', () => { editor.commands.docSyncUndo(); }], ['Redo', () => { editor.commands.docSyncRedo(); }],
        ['Add text', () => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, `${index ? 'Bob' : 'Alice'} `); }],
        ['Offline / Reconnect', () => { if (client.online) client.disconnect(); else client.connect(); }],
        ['Dispose / Remount', () => {
            if (!editor.isDestroyed) editor.destroy();
            else { editor = mount(); editor.view.dom.setAttribute('aria-label', `${index ? 'Bob' : 'Alice'} editor`); editors[index] = editor; }
        }],
    ];
    for (const [name, action] of actions) { const button = document.createElement('button'); button.textContent = name; button.addEventListener('click', action); section.querySelector('.toolbar')!.append(button); }
    return editor;
});
document.querySelector('#reset')!.addEventListener('click', () => hub.reset());
const inspect = () => {
    const models = clients.map(client => client.engine.model());
    const native = editors.map((editor, index) => canonical(schema, fromPmJSON(buildPmSchema(schema), schema, editor.getJSON(), models[index])));
    const equal = [...models, ...native].every(model => JSON.stringify(model) === JSON.stringify(hub.doc.toJSON()));
    const pending = clients.map(client => client.pending.length);
    document.querySelectorAll('#panes > section').forEach((section, index) => {
        section.querySelector('.connection')!.textContent = `${clients[index].online ? 'Online' : 'Offline'} · ${editors[index].isDestroyed ? 'Disposed' : 'Mounted'}`;
        section.querySelectorAll('button').forEach(button => { button.disabled = editors[index].isDestroyed && !button.textContent?.includes('Remount') && !button.textContent?.includes('Reconnect'); });
    });
    document.querySelector('#status')!.textContent = `${equal && pending.every(n => n === 0) ? 'Synced' : 'Syncing'} · server changes ${hub.serverSeq} · pending ${pending.join(' / ')}`;
    document.querySelector('#debug')!.textContent = JSON.stringify({equal, pending, models, native, connected: clients.map(client => client.online), mounted: editors.map(editor => !editor.isDestroyed), presence: [...hub.presence.values()]}, null, 2);
    return {equal, pending, models, native, serverSeq: hub.serverSeq};
};
setInterval(inspect, 100);
Object.assign(window, {tiptapDemo: {editors, clients, hub, inspect, engine: engineDiagnostic}});
window.addEventListener('beforeunload', () => { editors.forEach(editor => editor.destroy()); clients.forEach(client => client.disconnect()); });
