import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

test('stable-axis recipe keeps IDs and stored cells across insert, move and own undo', () => {
    const source = readFileSync(new URL('../src/schemas/spreadsheet-structure.md', import.meta.url), 'utf8');
    const code = /<!-- structural-sheet-example -->\s*```ts\n([\s\S]*?)\n```/.exec(source)?.[1];
    assert.ok(code);
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        input: `import assert from 'node:assert/strict';\n${code}\n` +
            `assert.equal(position,0); assert.equal(cell.value,42);\n` +
            `assert.equal(bob.rowIndexOf(row),6); assert.equal(bob.rows,1_000_001);\n` +
            `assert.deepEqual(bob.getCell(6,2),{value:42});\n` +
            `assert.deepEqual(alice.captureState().checkpoint.registers,bob.captureState().checkpoint.registers);\n`,
        encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
});
