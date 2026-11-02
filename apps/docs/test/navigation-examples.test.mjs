import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('the custom-editor destination runs its textarea adapter against public Core', () => {
    const page = readFileSync(new URL('../src/guide/custom-editor.md', import.meta.url), 'utf8');
    const source = /<!-- custom-editor-example -->\s*```ts\n([\s\S]*?)\n```/.exec(page)?.[1];
    assert.ok(source, 'the integration page must contain the example under test');
    const executable = source.replace("from './custom-editor.mjs'",
        `from ${JSON.stringify(new URL('../../demo/local/custom-editor.mjs', import.meta.url).href)}`);
    const check = `
import assert from 'node:assert/strict';
class TextArea extends EventTarget {
    value = ''; selectionStart = 0; selectionEnd = 0; selectionDirection = 'none';
    setSelectionRange(start, end, direction) {
        this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
    }
}
const textarea = new TextArea();
const editor = mountTextArea(textarea);
textarea.value = 'Hello😀';
textarea.setSelectionRange(7, 7, 'forward');
textarea.dispatchEvent(new Event('input'));
assert.equal(editor.client.model().children[0].runs[0].text, 'Hello😀');
textarea.setSelectionRange(1, 7, 'backward');
textarea.dispatchEvent(new Event('select'));
editor.client.edit([{op: 'insert', at: [0, 0], content: 'A'}]);
assert.equal(textarea.value, 'AHello😀');
assert.deepEqual([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection], [2, 8, 'backward']);
editor.client.undo();
assert.equal(textarea.value, 'Hello😀');
editor.client.redo();
assert.equal(textarea.value, 'AHello😀');
// Native input must preserve identities outside its changed range.
const middle = editor.client.captureAnchor([0, 4]);
const suffix = editor.client.captureAnchor([0, 8]);
assert.ok(middle);
assert.ok(suffix);
textarea.value = 'XAHello😀';
textarea.setSelectionRange(1, 1, 'forward');
textarea.dispatchEvent(new Event('input'));
assert.deepEqual(editor.client.locateAnchor(middle), [0, 5]);
assert.deepEqual(editor.client.locateAnchor(suffix), [0, 9]);
assert.equal(editor.client.captureAnchor([0, 5]), middle);
assert.equal(editor.client.captureAnchor([0, 9]), suffix);
// Replace e with EA. The existing l and final emoji keep their identities.
textarea.value = 'XAHEAllo😀';
textarea.setSelectionRange(5, 5, 'forward');
textarea.dispatchEvent(new Event('input'));
assert.equal(editor.client.model().children[0].runs[0].text, 'XAHEAllo😀');
assert.deepEqual(editor.client.locateAnchor(middle), [0, 6]);
assert.deepEqual(editor.client.locateAnchor(suffix), [0, 10]);
assert.equal(editor.client.captureAnchor([0, 6]), middle);
assert.equal(editor.client.captureAnchor([0, 10]), suffix);
editor.client.undo();
assert.equal(textarea.value, 'XAHello😀');
editor.client.redo();
assert.equal(textarea.value, 'XAHEAllo😀');
// Newlines split and merge document paragraphs, including history replay.
textarea.value = 'XAHEA\\nllo😀';
textarea.setSelectionRange(6, 6, 'forward');
textarea.dispatchEvent(new Event('input'));
assert.deepEqual(editor.client.model().children.map(node => node.runs.map(run => run.text).join('')), ['XAHEA', 'llo😀']);
editor.binding.undo();
assert.equal(textarea.value, 'XAHEAllo😀');
editor.binding.redo();
assert.equal(textarea.value, 'XAHEA\\nllo😀');
textarea.value = 'XAHEAllo😀';
textarea.setSelectionRange(5, 5, 'forward');
textarea.dispatchEvent(new Event('input'));
assert.equal(editor.client.model().children.length, 1);
assert.equal(editor.client.model().children[0].runs[0].text, 'XAHEAllo😀');
editor.dispose();
textarea.value = 'after cleanup';
textarea.dispatchEvent(new Event('input'));
assert.throws(() => editor.client.model(), /disposed/);
`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
        cwd: root, input: stripTypeScriptTypes(executable) + check, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
});
