import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('the private sparse sheet example merges fields and retries restored pending operations', () => {
    const source = readFileSync(new URL('../src/schemas/spreadsheets.md', import.meta.url), 'utf8');
    const code = /<!-- sparse-sheet-example -->\s*```sh\nnode --input-type=module <<'JS'\n([\s\S]*?)\nJS\n```/.exec(source)?.[1];
    assert.ok(code, 'a marked repository-root Node example is required');
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
        cwd: root, input: code, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Sparse sheet example passed/);
});
