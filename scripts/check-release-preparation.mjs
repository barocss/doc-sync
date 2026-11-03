import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Rehearse local version changes only. This script never invokes publish or tags.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['doc-sync', 'doc-sync-prosemirror', 'doc-sync-tiptap', 'doc-sync-slate', 'doc-sync-lexical'];
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const manifests = ['package.json', 'package-lock.json', ...['packages', 'apps'].flatMap(parent =>
    readdirSync(join(root, parent)).map(name => `${parent}/${name}/package.json`).filter(path => existsSync(join(root, path)))), 'benchmarks/package.json'];
const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const hashes = Object.fromEntries(manifests.map(path => [path, hash(path)]));
const directory = mkdtempSync(join(tmpdir(), 'doc-sync-release-rehearsal-'));
for (const path of manifests) {
    mkdirSync(dirname(join(directory, path)), {recursive: true});
    cpSync(join(root, path), join(directory, path));
}
cpSync(join(root, '.changeset'), join(directory, '.changeset'), {recursive: true});
symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
const git = args => execFileSync('git', args, {cwd: directory, encoding: 'utf8', stdio: 'pipe'});
git(['init', '-q']);
git(['add', 'package.json', 'packages', 'apps', 'benchmarks', '.changeset']);
git(['-c', 'user.name=Release rehearsal', '-c', 'user.email=rehearsal@example.invalid', 'commit', '-qm', 'Release rehearsal baseline']);
const cli = join(root, 'node_modules/@changesets/cli/bin.js');
const run = args => execFileSync(process.execPath, [cli, ...args], {
    cwd: directory, encoding: 'utf8', env: {...process.env, CI: 'true'}, maxBuffer: 4 * 1024 * 1024,
});
run(['status', '--output', 'first-release.json']);
const first = read(join(directory, 'first-release.json'));
assert.deepEqual(first.releases.filter(item => item.type !== 'none').map(item => item.name).sort(), names.map(name => `@barocss/${name}`).sort());
assert(first.releases.filter(item => item.type !== 'none').every(item => item.newVersion === '0.1.0'));
run(['version']);
for (const name of names) {
    const manifest = read(join(directory, 'packages', name, 'package.json'));
    assert.equal(manifest.version, '0.1.0');
    assert.equal(manifest.private, true);
    assert(existsSync(join(directory, 'packages', name, 'CHANGELOG.md')));
}
const {satisfies} = createRequire(join(root, 'node_modules/@changesets/cli/package.json'))('semver');
for (const name of names.slice(1)) {
    const manifest = read(join(directory, 'packages', name, 'package.json'));
    for (const [peer, range] of Object.entries(manifest.peerDependencies)) {
        if (peer.startsWith('@barocss/')) assert(satisfies('0.1.0', range), `${name}: ${peer}@${range}`);
    }
}
const privateApps = manifests.filter(path => /^(apps|benchmarks)\//.test(path));
for (const path of privateApps) {
    const manifest = read(join(directory, path));
    assert.equal(manifest.private, true);
    assert.equal(manifest.version, read(join(root, path)).version);
}
git(['add', 'packages', '.changeset']);
git(['-c', 'user.name=Release rehearsal', '-c', 'user.email=rehearsal@example.invalid', 'commit', '-qm', 'Rehearse first versions']);
writeFileSync(join(directory, '.changeset/slate-only.md'), '---\n"@barocss/doc-sync-slate": patch\n---\n\nRehearse an independent binding fix.\n');
run(['status', '--output', 'binding-patch.json']);
const patch = read(join(directory, 'binding-patch.json'));
assert.deepEqual(patch.releases.filter(item => item.type !== 'none').map(item => [item.name, item.newVersion]), [['@barocss/doc-sync-slate', '0.1.1']]);
run(['version']);
for (const name of names) assert.equal(read(join(directory, 'packages', name, 'package.json')).version, name === 'doc-sync-slate' ? '0.1.1' : '0.1.0');
for (const path of manifests) assert.equal(hash(path), hashes[path], `${path}: source checkout changed during rehearsal`);
const report = {status: 'PASS', packages: names.length, firstVersions: '0.1.0', independentSlatePatch: '0.1.1',
    peerRanges: 'PASS', privateAppsUnchanged: 'PASS', sourceVersionsAndLockUnchanged: 'PASS',
    publish: 'NOT_RUN', directory, manifestHashes: hashes};
mkdirSync(join(root, 'output/release-preparation'), {recursive: true});
write(join(root, 'output/release-preparation/report.json'), report);
console.log(JSON.stringify(report, null, 2));
