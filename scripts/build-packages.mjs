import {execFileSync} from 'node:child_process';
for (const name of ['core', 'prosemirror', 'slate', 'lexical', 'tiptap', '']) {
    execFileSync(process.execPath, ['scripts/build-package.mjs', `packages/doc-sync${name ? `-${name}` : ''}`], {stdio: 'inherit'});
}
