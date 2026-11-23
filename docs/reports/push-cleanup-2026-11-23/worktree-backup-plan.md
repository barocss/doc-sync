# Worktree backup plan

Read-only plan. Preserve main. Base each snapshot on its recorded original HEAD. Verify each archive SHA on origin before deletion.

Cargo markers confirmed for bindings/output/r4-sdk-target. Npm cache markers confirmed for issue-2/output/npm-cache. Temporary clean-prepack directories and built tarballs/bundles are reproducible outputs.

| Worktree | Archive branch | Tracked changes | Untracked paths | Force-add ignored | Private/review ignored |
|---|---|---:|---:|---:|---:|
| doc-sync-ai-reads | codex/archive/20261123/doc-sync-ai-reads | 156 | 258 | 0 | 0 |
| doc-sync-bindings | codex/archive/20261123/doc-sync-bindings | 147 | 232 | 41 | 0 |
| doc-sync-bot-proposals | codex/archive/20261123/doc-sync-bot-proposals | 168 | 190 | 5 | 0 |
| doc-sync-bot-verification | codex/archive/20261123/doc-sync-bot-verification | 156 | 251 | 0 | 0 |
| doc-sync-canonical-paths | codex/archive/20261123/doc-sync-canonical-paths | 168 | 275 | 11 | 0 |
| doc-sync-ci-meeting-20261116 | codex/archive/20261123/doc-sync-ci-meeting-20261116 | 4 | 2 | 0 | 102 |
| doc-sync-client-baseline | codex/archive/20261123/doc-sync-client-baseline | 0 | 0 | 0 | 0 |
| doc-sync-d1 | codex/archive/20261123/doc-sync-d1 | 26 | 11 | 21 | 0 |
| doc-sync-docs-domain | codex/archive/20261123/doc-sync-docs-domain | 156 | 251 | 0 | 0 |
| doc-sync-documentation | codex/archive/20261123/doc-sync-documentation | 0 | 0 | 15 | 0 |
| doc-sync-host | codex/archive/20261123/doc-sync-host | 153 | 249 | 5 | 2 |
| doc-sync-host-native | codex/archive/20261123/doc-sync-host-native | 153 | 248 | 0 | 0 |
| doc-sync-hosted-mcp | codex/archive/20261123/doc-sync-hosted-mcp | 157 | 263 | 0 | 10 |
| doc-sync-issue-2 | codex/archive/20261123/doc-sync-issue-2 | 9 | 1 | 84 | 170 |
| doc-sync-issue-4-baseline | codex/archive/20261123/doc-sync-issue-4-baseline | 0 | 0 | 0 | 0 |
| doc-sync-linux-bots | codex/archive/20261123/doc-sync-linux-bots | 166 | 264 | 0 | 0 |
| doc-sync-linux-recovery | codex/archive/20261123/doc-sync-linux-recovery | 165 | 254 | 0 | 0 |
| doc-sync-local | codex/archive/20261123/doc-sync-local | 15 | 15 | 5 | 8 |
| doc-sync-proposal-acceptance | codex/archive/20261123/doc-sync-proposal-acceptance | 171 | 206 | 3 | 0 |
| doc-sync-rejection-recovery | codex/archive/20261123/doc-sync-rejection-recovery | 171 | 211 | 3 | 0 |
| doc-sync-roadmap-integration | codex/archive/20261123/doc-sync-roadmap-integration | 171 | 290 | 7 | 19 |
| doc-sync-tiptap | codex/archive/20261123/doc-sync-tiptap | 41 | 61 | 1 | 0 |
| doc-sync-watch-recovery-20261117 | codex/archive/20261123/doc-sync-watch-recovery-20261117 | 0 | 0 | 0 | 0 |

Exact allowlists and per-file categories/hashes are in worktree-backup-plan.json. Identical ignored source/evidence in main need no duplicate copy if main is preserved.

Keep private/review paths in a separate archive outside the public push. These include Codex runtime sessions, prompts, client configs, journals, MCP process runtime records, source/dist historical tar archives pending review, and CPU profiles. No file contents were inspected. Source config and source adapters are not private solely because their filenames contain config, profile, or codex.

The metadata classifier found no suspicious tracked/untracked credential filenames. That does not certify contents of evidence logs or source safe for public publication. Main ignored state/data classification remains separate.
