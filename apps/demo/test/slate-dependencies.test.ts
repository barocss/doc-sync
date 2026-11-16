import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

test('Slate demo runtimes are explicit dependencies consistent with the frozen lockfile', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8'));
    for (const name of ['slate', 'slate-react', 'slate-dom']) {
        const version = manifest.dependencies[name];
        assert.match(version, /^\d+\.\d+\.\d+$/);
        assert.equal(lock.packages['apps/demo'].dependencies[name], version);
        assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
});
