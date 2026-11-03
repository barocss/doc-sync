import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {compile} from 'svelte/compiler';
const path = name => new URL(name, import.meta.url);
rmSync(path('./dist'), {recursive:true, force:true});
execFileSync(process.execPath, [path('../../node_modules/typescript/bin/tsc').pathname, '-p', path('./tsconfig.build.json').pathname], {stdio:'inherit'});
const filename = path('./src/PresenceOverlay.svelte').pathname;
const source = readFileSync(filename, 'utf8');
for (const generate of ['client', 'server']) {
  const result = compile(source, {filename, generate});
  const directory = generate === 'client' ? './dist/client/' : './dist/server/';
  mkdirSync(path(directory), {recursive:true});
  writeFileSync(path(directory+'PresenceOverlay.svelte.js'), result.js.code);
  copyFileSync(path('./src/PresenceOverlay.svelte.d.ts'), path(directory+'PresenceOverlay.svelte.d.ts'));
  const index = readFileSync(path('./dist/index.js'), 'utf8').replace('./PresenceOverlay.svelte', './PresenceOverlay.svelte.js');
  writeFileSync(path(directory+'index.js'), index);
}
copyFileSync(path('./src/PresenceOverlay.svelte'), path('./dist/PresenceOverlay.svelte'));
copyFileSync(path('./src/PresenceOverlay.svelte.d.ts'), path('./dist/PresenceOverlay.svelte.d.ts'));
