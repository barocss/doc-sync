# Worktree backup plan

Updated after ignored preservation correction:694 exact ignored source/evidence allowlist paths. Original worktree HEADs remain unchanged. Exclude all reproducible caches/build outputs. Retain private/review inputs separately.

| Worktree | Archive branch | Tracked changes | Untracked paths | Force-add ignored | Private/review ignored |
|---|---|---:|---:|---:|---:|
| doc-sync-ai-reads | codex/archive/20261123/doc-sync-ai-reads | 156 | 258 | 0 | 0 |
| doc-sync-bindings | codex/archive/20261123/doc-sync-bindings | 147 | 232 | 42 | 0 |
| doc-sync-bot-proposals | codex/archive/20261123/doc-sync-bot-proposals | 168 | 190 | 5 | 0 |
| doc-sync-bot-verification | codex/archive/20261123/doc-sync-bot-verification | 156 | 251 | 0 | 0 |
| doc-sync-canonical-paths | codex/archive/20261123/doc-sync-canonical-paths | 168 | 275 | 11 | 0 |
| doc-sync-ci-meeting-20261116 | codex/archive/20261123/doc-sync-ci-meeting-20261116 | 4 | 2 | 13 | 102 |
| doc-sync-client-baseline | codex/archive/20261123/doc-sync-client-baseline | 0 | 0 | 0 | 0 |
| doc-sync-d1 | codex/archive/20261123/doc-sync-d1 | 26 | 11 | 293 | 0 |
| doc-sync-docs-domain | codex/archive/20261123/doc-sync-docs-domain | 156 | 251 | 0 | 0 |
| doc-sync-documentation | codex/archive/20261123/doc-sync-documentation | 0 | 0 | 28 | 0 |
| doc-sync-host | codex/archive/20261123/doc-sync-host | 153 | 249 | 75 | 2 |
| doc-sync-host-native | codex/archive/20261123/doc-sync-host-native | 153 | 248 | 0 | 0 |
| doc-sync-hosted-mcp | codex/archive/20261123/doc-sync-hosted-mcp | 157 | 263 | 0 | 10 |
| doc-sync-issue-2 | codex/archive/20261123/doc-sync-issue-2 | 9 | 1 | 97 | 170 |
| doc-sync-issue-4-baseline | codex/archive/20261123/doc-sync-issue-4-baseline | 0 | 0 | 0 | 0 |
| doc-sync-linux-bots | codex/archive/20261123/doc-sync-linux-bots | 166 | 264 | 0 | 0 |
| doc-sync-linux-recovery | codex/archive/20261123/doc-sync-linux-recovery | 165 | 254 | 0 | 0 |
| doc-sync-local | codex/archive/20261123/doc-sync-local | 15 | 15 | 51 | 8 |
| doc-sync-proposal-acceptance | codex/archive/20261123/doc-sync-proposal-acceptance | 171 | 206 | 17 | 0 |
| doc-sync-rejection-recovery | codex/archive/20261123/doc-sync-rejection-recovery | 171 | 211 | 12 | 0 |
| doc-sync-roadmap-integration | codex/archive/20261123/doc-sync-roadmap-integration | 171 | 290 | 36 | 19 |
| doc-sync-tiptap | codex/archive/20261123/doc-sync-tiptap | 41 | 61 | 1 | 0 |
| doc-sync-watch-recovery-20261117 | codex/archive/20261123/doc-sync-watch-recovery-20261117 | 0 | 0 | 13 | 0 |

Exact paths/hashes and categories are in worktree-backup-plan.json. Current remote snapshots and historical receipts are in secondary-recovery-index.json. Do not infer durable protection merely because bytes match an ignored file in main; cleanup verifies reachability in verified main or archive trees, or the private archive.
