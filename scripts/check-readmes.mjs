import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = readdirSync(resolve(root, 'packages')).filter(name => existsSync(resolve(root, 'packages', name, 'package.json')));
const files = ['README.md', ...packages.map(name => `packages/${name}/README.md`)];
for (const file of files) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert(source.includes('0.0.0') && /private|unpublished/i.test(source), `${file}: explain development publication status`);
    if (file !== 'README.md') {
        const manifest = JSON.parse(readFileSync(resolve(root, dirname(file), 'package.json'), 'utf8'));
        assert(source.includes(manifest.name), `${file}: package name missing`);
        for (const peer of Object.keys(manifest.peerDependencies ?? {})) assert(source.includes(peer), `${file}: peer ${peer} missing`);
    }
    for (const match of source.matchAll(/\]\(\s*([^\s)]+)\s*\)/g)) {
        const target = match[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        assert(existsSync(resolve(root, dirname(file), decodeURIComponent(target.split('#')[0]))), `${file}: missing local link ${target}`);
    }
}

// Execute the actual first TypeScript blocks, not separately maintained copies.
// Editor examples use JSDOM only: this does not claim real browser/IME coverage.
const output = resolve(root, 'output/readme-examples');
mkdirSync(output, {recursive: true});
const executable = ['README.md', 'packages/doc-sync/README.md', ...['prosemirror', 'tiptap', 'slate', 'lexical'].map(name => `packages/doc-sync-${name}/README.md`)];
for (const [index, file] of executable.entries()) {
    const source = readFileSync(resolve(root, file), 'utf8');
    const snippet = source.match(/```ts\n([\s\S]*?)\n```/);
    assert(snippet, `${file}: TypeScript example missing`);
    const sample = resolve(output, `example-${index}.ts`);
    writeFileSync(sample, snippet[1] + '\n' + (['prosemirror','tiptap'].some(name => file.includes(`-${name}/`)) ? '\ndispose();\n' : ''));
    const bootstrap = resolve(output, `run-${index}.mjs`);
    writeFileSync(bootstrap, `import {JSDOM} from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="editor"></div>', {url: 'http://localhost', pretendToBeVisual: true});
for (const name of ['window','document','navigator','Node','Element','HTMLElement','MutationObserver','DOMParser','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
    const value = dom.window[name];
    Object.defineProperty(globalThis, name, {value: typeof value === 'function' && ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name) ? value.bind(dom.window) : value, configurable: true});
}
try { await import(${JSON.stringify(pathToFileURL(sample).href)}); } finally { dom.window.close(); }
`);
    execFileSync(process.execPath, [bootstrap], {cwd: root, stdio: 'pipe', timeout: 30_000});
    console.log(`PASS executable README: ${file}`);
}
writeFileSync(resolve(output, 'tsconfig.json'), JSON.stringify({compilerOptions: {target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['node']}, include: ['example-*.ts']}, null, 2));
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(output, 'tsconfig.json')], {cwd: root, stdio: 'inherit', timeout: 30_000});
console.log('PASS strict TypeScript README examples');
console.log(`PASS ${files.length} README files: package coverage, peers, local links; ${executable.length} executed examples`);
