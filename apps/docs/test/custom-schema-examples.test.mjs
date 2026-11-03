import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

test('public custom schema recipes edit, inspect, resolve IDs and preserve sparse pending state', () => {
    const source = readFileSync(new URL('../src/schemas/custom.md', import.meta.url), 'utf8');
    const names = ['document', 'editor', 'graphic', 'spreadsheet'];
    const examples = names.map(name => {
        const code = new RegExp(`<!-- custom-${name}-example -->\\s*\x60\x60\x60ts\\n([\\s\\S]*?)\\n\x60\x60\x60`).exec(source)?.[1];
        assert.ok(code, `${name} executable example`);
        return stripTypeScriptTypes(code);
    });
    const input = `import assert from 'node:assert/strict';\n${examples.join('\n')}\n` +
        `assert.equal(client.model().children[0].runs[0].text, 'A shared article');\n` +
        `assert.equal(result.supported, true); assert.equal(result.semantic, false);\n` +
        `assert.equal(current.id, id); assert.equal(current.node.attrs.radius, 8);\n` +
        `assert.equal(mapping.semantic, true); assert.equal(emptyTitle, 'Untitled');\n` +
        `assert.equal(bob.stats().registers, 2);\n` +
        `assert.equal(bob.getCell(999_999_999, 16_383).progress, 25);\n` +
        `assert.deepEqual(restored.pendingChanges(), alice.pendingChanges());\n` +
        `assert.equal(restored.captureState().schemaVersion, version);\n`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)), input,
        encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
});
