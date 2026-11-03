import {execFileSync} from 'node:child_process';
const standard = ['doc-sync', 'doc-sync-prosemirror', 'doc-sync-slate', 'doc-sync-lexical', 'doc-sync-tiptap', 'doc-sync-presence-ui'];
for (const name of standard) {
    execFileSync(process.execPath, ['scripts/build-package.mjs', `packages/${name}`], {stdio: 'inherit'});
}
for (const framework of ['react', 'vue', 'svelte', 'solid']) {
    execFileSync(process.execPath, [`packages/doc-sync-presence-${framework}/build.mjs`], {stdio: 'inherit'});
}
