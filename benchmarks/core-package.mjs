import {existsSync} from 'node:fs';
import {join} from 'node:path';

// Historical detached worktrees can contain a separate core and a facade.
// Select that core when present; current checkouts keep the core in doc-sync.
export function corePackageName(root) {
    return existsSync(join(root, 'packages/doc-sync-core/package.json'))
        ? 'doc-sync-core'
        : 'doc-sync';
}

export function corePackagePath(root) {
    return `packages/${corePackageName(root)}`;
}
