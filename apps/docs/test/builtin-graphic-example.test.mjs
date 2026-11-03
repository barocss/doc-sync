import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

test('the built-in graphic guide creates and resolves standard stored objects', () => {
    const source = readFileSync(new URL('../src/guide/graphic-schema.md', import.meta.url), 'utf8');
    const example = /<!-- builtin-graphic-example -->\s*```ts\n([\s\S]*?)\n```/.exec(source)?.[1];
    assert.ok(example, 'a marked public built-in example is required');
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        input: `import assert from 'node:assert/strict';\n${stripTypeScriptTypes(example)}\n` +
            `assert.equal(current.id, card.id);\nassert.equal(current.node.attrs.size.width, 240);\n` +
            `assert.equal(current.node.attrs.transform.e, 120);\nassert.equal(current.node.children[0].attrs.color, '#3366FF');\n`,
        encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
});
