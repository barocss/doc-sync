import {execFileSync} from 'node:child_process';
import {readFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = resolve(process.argv[2] ?? process.cwd());
const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
const packages = ['doc-sync', 'doc-sync-prosemirror', 'doc-sync-tiptap', 'doc-sync-slate', 'doc-sync-lexical'];
if (!packages.some(name => manifest.name === `@barocss/${name}`)) throw new Error(`Unsupported build package: ${manifest.name}`);
rmSync(join(directory, 'dist'), {recursive: true, force: true});
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
execFileSync(process.execPath, [compiler, '-p', join(directory, 'tsconfig.build.json')], {stdio: 'inherit'});
