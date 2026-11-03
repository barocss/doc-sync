import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LocalClient, createLocalEditorHost} from '@barocss/doc-sync/local';
import type {Schema} from '@barocss/doc-sync';
import {mountCustomEditor} from '../local/custom-editor.mjs';

const firstText = (model: ReturnType<LocalClient['model']>) => model.children?.[0]?.runs?.map(run => 'text' in run ? run.text : '').join('');
const schema: Schema = {root: 'doc', marks: [], nodes: {doc: {shape: 'flow', children: ['p'], default: 'p'}, p: {shape: 'text'}}};
class Textarea extends EventTarget {
    value = ''; selectionStart = 0; selectionEnd = 0; selectionDirection = 'forward';
    setSelectionRange(start: number, end: number, direction = 'forward') {
        this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
    }
    fire(name: string, props = {}) { const event = new Event(name, {cancelable: true}); Object.assign(event, props); this.dispatchEvent(event); return event; }
    input(value: string, start = value.length, end = start, direction = 'forward') {
        this.fire('beforeinput', {inputType: 'insertText'}); this.value = value; this.setSelectionRange(start, end, direction); this.fire('input');
    }
}
function setup(initial = 'abc\ndef') {
    const client = new LocalClient({schema, actor: 'custom'}), host = createLocalEditorHost(client);
    const lines = initial.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (i) client.edit([{op: 'split', at: [i - 1, lines[i - 1].length]}], null);
        if (lines[i]) client.edit([{op: 'insert', at: [i, 0], content: lines[i]}], null);
    }
    client.clearHistory();
    const textarea = new Textarea();
    const editor = mountCustomEditor(textarea as unknown as HTMLTextAreaElement, host);
    return {client, host, textarea, editor};
}

test('plain adapter reads native model and preserves unchanged anchors across a minimal edit', () => {
    const {client, host, textarea, editor} = setup('a😀c\nuntouched');
    try {
        const leading = host.captureAnchor([0, 0])!, trailing = host.captureAnchor([0, 4])!, block = host.captureAnchor([1, 4])!;
        const batches: unknown[][] = [], originalCommit = host.commit.bind(host);
        host.commit = (ops, options) => { batches.push(ops); originalCommit(ops, options); };
        editor.setSelection({anchor: [0, 3], focus: [0, 3]});
        textarea.input('a😀Xc\nuntouched', 4);
        assert.equal(batches.length, 1); assert.ok(batches[0].length > 0);
        assert.deepEqual(host.locateAnchor(leading, 'visible'), [0, 0]);
        assert.deepEqual(host.locateAnchor(trailing, 'visible'), [0, 5]);
        assert.deepEqual(host.locateAnchor(block, 'visible'), [1, 4]);
        assert.deepEqual(editor.readModel(), host.model().model);
        textarea.value = 'native only'; assert.notDeepEqual(editor.readModel(), host.model().model);
    } finally { editor.dispose(); client.dispose(); }
});

test('UTF-16 replacement and empty paragraphs match the native document', () => {
    const {client, host, textarea, editor} = setup('a😀z');
    try {
        textarea.input('a😃z', 3);
        assert.deepEqual(editor.readModel(), host.model().model);
        textarea.input('한\n\n끝', 3);
        assert.deepEqual(editor.readModel(), host.model().model);
        assert.deepEqual(editor.selection(), {anchor: [2, 0], focus: [2, 0]});
        editor.undo(); assert.equal(textarea.value, 'a😃z');
        editor.undo(); assert.equal(textarea.value, 'a😀z');
    } finally { editor.dispose(); client.dispose(); }
});

test('newline split and cross-paragraph replacement retain untouched text and undo as one transaction', () => {
    const {client, host, textarea, editor} = setup('abc\ndef');
    try {
        editor.setSelection({anchor: [0, 1], focus: [0, 1]});
        textarea.input('a\nXYZbc\ndef', 5);
        assert.deepEqual(editor.readModel(), host.model().model);
        editor.undo(); assert.equal(textarea.value, 'abc\ndef'); assert.equal(host.historyStatus().canUndo, false);
        assert.deepEqual(editor.selection(), {anchor: [0, 1], focus: [0, 1]});
        editor.redo(); assert.equal(textarea.value, 'a\nXYZbc\ndef');
        textarea.input('af', 1);
        assert.deepEqual(editor.readModel(), host.model().model); assert.equal(textarea.value, 'af');
        editor.undo(); assert.equal(textarea.value, 'a\nXYZbc\ndef');
    } finally { editor.dispose(); client.dispose(); }
});

test('two public hosts share edits and preserve each native view selection without focus calls', () => {
    const {client, host, textarea, editor} = setup();
    const secondHost = createLocalEditorHost(client), secondArea = new Textarea();
    const second = mountCustomEditor(secondArea as unknown as HTMLTextAreaElement, secondHost);
    try {
        editor.setSelection({anchor: [1, 3], focus: [0, 1]});
        second.setSelection({anchor: [0, 0], focus: [0, 0]});
        secondArea.input('!abc\ndef', 1);
        assert.equal(textarea.value, '!abc\ndef');
        assert.deepEqual(editor.selection(), {anchor: [1, 3], focus: [0, 2]});
        assert.equal(textarea.selectionDirection, 'backward');
        assert.deepEqual(second.readModel(), editor.readModel());
        second.undo(); assert.equal(textarea.value, 'abc\ndef'); assert.equal(secondArea.value, textarea.value);
        second.redo(); assert.equal(textarea.value, '!abc\ndef');
        editor.setSelection({anchor: [0, 0], focus: [1, 2]});
        client.edit([{op: 'insert', at: [1, 0], content: 'Z'}]);
        assert.deepEqual(editor.selection(), {anchor: [0, 0], focus: [1, 3]});
    } finally { second.dispose(); editor.dispose(); client.dispose(); }
});

test('keyboard and browser history input use host history', () => {
    const {client, textarea, editor} = setup('');
    try {
        textarea.input('hello');
        assert.equal(textarea.fire('keydown', {key: 'z', ctrlKey: true}).defaultPrevented, true);
        assert.equal(textarea.value, '');
        textarea.fire('keydown', {key: 'Z', metaKey: true, shiftKey: true}); assert.equal(textarea.value, 'hello');
        textarea.fire('beforeinput', {inputType: 'historyUndo'}); assert.equal(textarea.value, '');
        textarea.fire('beforeinput', {inputType: 'historyRedo'}); assert.equal(textarea.value, 'hello');
    } finally { editor.dispose(); client.dispose(); }
});

test('composition stages exact draft operations and merges foreign edits without diffing foreign text', () => {
    const {client, host, textarea, editor} = setup('abc');
    try {
        editor.setSelection({anchor: [0, 3], focus: [0, 3]});
        textarea.fire('compositionstart');
        textarea.input('abcㅎ'); textarea.input('abc한');
        assert.equal(firstText(host.model().model), 'abc');
        const other = createLocalEditorHost(client);
        other.commit(other.apply([{op: 'insert', at: [0, 0], content: 'X'}]), null);
        assert.equal(textarea.value, 'abc한');
        textarea.fire('compositionend');
        assert.equal(textarea.value, 'Xabc한');
        assert.deepEqual(editor.readModel(), host.model().model);
        assert.deepEqual(editor.selection(), {anchor: [0, 5], focus: [0, 5]});
        editor.undo(); assert.equal(textarea.value, 'Xabc');
        editor.redo(); assert.equal(textarea.value, 'Xabc한');
    } finally { editor.dispose(); client.dispose(); }
});

test('dispose cancels a draft and removes subscriptions and native input listeners', () => {
    const {client, host, textarea, editor} = setup('abc');
    textarea.fire('compositionstart'); textarea.input('draftabc');
    editor.dispose(); editor.dispose();
    assert.equal(editor.selection(), null);
    assert.equal(firstText(host.model().model), 'abc');
    client.edit([{op: 'insert', at: [0, 0], content: '!'}]); assert.equal(textarea.value, 'draftabc');
    textarea.input('ignored'); assert.equal(firstText(host.model().model), '!abc');
    client.dispose();
});

test('unsupported rich schemas are rejected before mounting', () => {
    const client = new LocalClient({schema: {...schema, marks: ['bold']}});
    const textarea = new Textarea(); textarea.value = 'preserved';
    assert.throws(() => mountCustomEditor(textarea as unknown as HTMLTextAreaElement, createLocalEditorHost(client)), /plain paragraph/);
    assert.equal(textarea.value, 'preserved'); client.dispose();
});


test('unsupported text and cardinality constraints reject before mutation or listener attachment', () => {
    const unsupported: Schema[] = [
        {...schema, nodes: {...schema.nodes, p: {shape: 'text', text: false}}},
        {...schema, nodes: {...schema.nodes, doc: {shape: 'flow', children: ['p'], default: 'p', childRules: {p: {max: 1}}}}},
        {...schema, nodes: {...schema.nodes, p: {shape: 'text', children: ['mention']}, mention: {shape: 'inline'}}},
    ];
    for (const definition of unsupported) {
        const client = new LocalClient({schema: definition});
        const host = createLocalEditorHost(client), textarea = new Textarea();
        const before = structuredClone(host.model()), history = host.historyStatus();
        let subscriptions = 0, listeners = 0;
        const subscribe = host.subscribe.bind(host), add = textarea.addEventListener.bind(textarea);
        host.subscribe = observer => { subscriptions++; return subscribe(observer); };
        textarea.addEventListener = (...args: Parameters<EventTarget['addEventListener']>) => { listeners++; add(...args); };
        textarea.value = 'preserved'; textarea.setSelectionRange(2, 5, 'backward');
        assert.throws(() => mountCustomEditor(textarea as unknown as HTMLTextAreaElement, host), /plain paragraph/);
        assert.deepEqual(host.model(), before); assert.deepEqual(host.historyStatus(), history);
        assert.equal(subscriptions, 0); assert.equal(listeners, 0);
        assert.equal(textarea.value, 'preserved');
        assert.deepEqual([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection], [2, 5, 'backward']);
        client.dispose();
    }
});
