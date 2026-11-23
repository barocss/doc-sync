# Worktree inventory

Read-only snapshot. Remote refs are local cached refs. No source, refs, worktrees, sessions, or processes were changed.

| Worktree | MiB | Dirty paths | Unique vs main | Unique vs cached remotes | Ignored durable/source paths | Class |
|---|---:|---:|---:|---:|---:|---|
| doc-sync | 51481.9 | 386 | 0 | 0 | 20 | PRESERVE_MAIN |
| doc-sync-ai-reads | 283.4 | 414 | 0 | 0 | 0 | BACKUP_REQUIRED |
| doc-sync-bindings | 487.0 | 379 | 0 | 0 | 5 | BACKUP_REQUIRED |
| doc-sync-bot-proposals | 272.5 | 358 | 0 | 0 | 1 | BACKUP_REQUIRED |
| doc-sync-bot-verification | 283.3 | 407 | 0 | 0 | 0 | BACKUP_REQUIRED |
| doc-sync-canonical-paths | 89.8 | 443 | 0 | 0 | 1 | BACKUP_REQUIRED |
| doc-sync-ci-meeting-20261116 | 1002.2 | 6 | 38 | 0 | 8 | BACKUP_REQUIRED |
| doc-sync-client-baseline | 717.4 | 0 | 0 | 0 | 0 | CLEAN_MERGED_REMOVABLE_AFTER_IGNORED_REVIEW |
| doc-sync-d1 | 742.2 | 37 | 0 | 0 | 5 | BACKUP_REQUIRED |
| doc-sync-docs-domain | 88.5 | 407 | 0 | 0 | 0 | BACKUP_REQUIRED |
| doc-sync-documentation | 1001.9 | 0 | 18 | 0 | 7 | CLEAN_REMOTE_BACKED_UNMERGED_REVIEW |
| doc-sync-host | 279.7 | 402 | 0 | 0 | 5 | BACKUP_REQUIRED |
| doc-sync-host-native | 273.1 | 401 | 0 | 0 | 0 | BACKUP_REQUIRED |
| doc-sync-hosted-mcp | 283.4 | 420 | 0 | 0 | 1 | BACKUP_REQUIRED |
| doc-sync-issue-2 | 1134.4 | 10 | 32 | 0 | 8 | BACKUP_REQUIRED |
| doc-sync-issue-4-baseline | 552.8 | 0 | 0 | 0 | 0 | CLEAN_MERGED_REMOVABLE_AFTER_IGNORED_REVIEW |
| doc-sync-linux-bots | 283.4 | 430 | 0 | 0 | 0 | BACKUP_REQUIRED |
| doc-sync-linux-recovery | 283.3 | 419 | 0 | 0 | 0 | BACKUP_REQUIRED |
| doc-sync-local | 727.0 | 30 | 0 | 0 | 6 | BACKUP_REQUIRED |
| doc-sync-proposal-acceptance | 278.4 | 377 | 0 | 0 | 6 | BACKUP_REQUIRED |
| doc-sync-rejection-recovery | 278.5 | 382 | 0 | 0 | 5 | BACKUP_REQUIRED |
| doc-sync-roadmap-integration | 351.0 | 461 | 0 | 0 | 6 | BACKUP_REQUIRED |
| doc-sync-tiptap | 270.8 | 102 | 0 | 0 | 1 | BACKUP_REQUIRED |
| doc-sync-watch-recovery-20261117 | 1002.5 | 0 | 52 | 0 | 6 | CLEAN_REMOTE_BACKED_UNMERGED_REVIEW |

## Preservation rules

- Every dirty tree needs a remote snapshot before removal. Tracked changes and all untracked source/evidence paths are listed in the JSON inventory.
- No worktree HEAD has commits absent from cached remote refs. Refresh and verify remote refs before removal.
- The two clean merged baseline trees contain only ignored dependency/build paths; these are removal candidates.
- The clean documentation and watch-recovery trees have remote-backed commits absent main. Retain those remote histories, and preserve ignored source/evidence paths before removal.
- Ignored docs reference files, diagrams, output evidence, and durable bot/data paths are not build caches. Main remains preserved.
- worktree-ignored-preservation.json records ignored non-build file sizes and hashes in secondary worktrees, plus whether identical bytes exist at the same path in main. These files require preservation unless verified as reproducible generated files.

## Non-build ignored data in secondary trees

| Worktree | Files | MiB | Not identical to same path in main |
|---|---:|---:|---:|
| doc-sync-bindings | 931 | 202.64 | 783 |
| doc-sync-bot-proposals | 5 | 0.01 | 5 |
| doc-sync-canonical-paths | 11 | 0.07 | 11 |
| doc-sync-ci-meeting-20261116 | 115 | 0.17 | 102 |
| doc-sync-d1 | 307 | 24.47 | 27 |
| doc-sync-documentation | 38 | 0.45 | 25 |
| doc-sync-host | 83 | 6.38 | 11 |
| doc-sync-hosted-mcp | 10 | 0.05 | 10 |
| doc-sync-issue-2 | 1227 | 129.53 | 1214 |
| doc-sync-local | 67 | 4.37 | 11 |
| doc-sync-proposal-acceptance | 18 | 0.12 | 3 |
| doc-sync-rejection-recovery | 12 | 0.11 | 3 |
| doc-sync-roadmap-integration | 77 | 23.92 | 42 |
| doc-sync-tiptap | 1 | 0.00 | 1 |
| doc-sync-watch-recovery-20261117 | 13 | 0.13 | 0 |
