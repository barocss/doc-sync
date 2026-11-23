# Ignored preservation correction

Status: PASS. Added493 ignored source/evidence paths in11 descendant archive commits. All23 archive branch SHAs verified on origin.

The initial archive skipped files identical to local main files without proving those bytes were reachable remotely. The correction preserves those files. Original snapshot receipts remain in snapshot_history. Main and its normal index were not changed.

Canonical restore mappings include exact verified commit, path, and blob ID, or the existing private archive member. No generated caches or private runtime files were added to public branches.

| Worktree | Added files | Prior SHA | Correction SHA |
|---|---:|---|---|
| doc-sync-bindings | 1 | ee6dcecc506f5b0f5b7fa857e75bcc16200859dd | d2d3025a51abc1d9346c8a80d7950fff5b27e012 |
| doc-sync-ci-meeting-20261116 | 13 | fb61b1bc31eeefe5311fe66202aed7ff477564fc | d3487407f40d13a33677df00c559feacbebea72f |
| doc-sync-d1 | 272 | 1e839e55a74cf0d0ee650b6cb09bdcee2690831c | 931a730cb86e65a16266308376b8f0f339d1f438 |
| doc-sync-documentation | 13 | 9e4f15a0c11ea7b30e53039b61e7ec746791dd72 | 55763416ccb5fa0660f9e2b6c421c22d1ab87c1e |
| doc-sync-host | 70 | 4ba7cb967f60fd4905e498b2d0cb96ee0833bf96 | 9142eeb22119c989fe3477de0bb47a0d1edf01e1 |
| doc-sync-issue-2 | 13 | 984ed35fd30e0b50ef4cbc5c15d8513fecbe64e3 | 7030944e7cb3bb95b6513386f52a8841d448346b |
| doc-sync-local | 46 | c22e17cc1451360a6c7c911ef58ec6723006398e | f858e12e30a0c4f041f07e876ab08cdbaed95ae6 |
| doc-sync-proposal-acceptance | 14 | 4a2dfdf9d4ca06c87333af27332c96bc890c7acb | 8145ce336a4f1abaecd6f5a131bcac8c18d9b931 |
| doc-sync-rejection-recovery | 9 | 294d5d5ab39acf3b770b82585a1049e8f942ee62 | 6c5ca60483d5bcfd66da397ea8e67d09e1df25af |
| doc-sync-roadmap-integration | 29 | e134224035f8cc6dcca1b6e31aaad8372046d5b8 | 13e8c078d058631c8aa5efc6ae727d87801e28e3 |
| doc-sync-watch-recovery-20261117 | 13 | ecf3f0aeec7b0631fd1efee27bc8563346821e5d | 41cebdc03697e333438a92cadafa15b79260b3bc |
