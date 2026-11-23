# H0 baseline

Status: operation-count and semantic invariants PASS. Candidate comparison NOT_RUN. Baseline self-control noise exceeds the fixed guard in 5 of 20 size/scenario pairs. Do not describe this as latency equivalence PASS.

Frozen target: `/Users/user/github/doc-sync`, git HEAD `3bbb4651a497494339c15f6984ceafb8410d8fe3`, aggregate source/dist SHA256 `7e382c5e759fa1a22008dee3478812a9063f8af9175bdd407375a56697252cd0`. Before/after hashes are equal. Actual tools: Node 24.22.1, TypeScript 5.8.3, esbuild 0.28.2. PM model 1.25.12, state 1.4.4, view 1.42.6, transform 1.12.2.

Frozen harness SHA256: `7a16747c7a06c75e45e8dc4bc0078adf6f54b6a004fe630fe28d35a80255bae4`. It is preserved as `frozen-baseline-harness.mjs`. Source/dist archive SHA256: `82f9db18ef28a779badd3fe2f577e33e9ccfcaeb21ba5c8d35facb0ecb4b70d6`.

The default timing run has 12 fresh-client blocks in A/B/B/A x3 order, two warmups and eight measured observations per scenario per block. There are 96 measured observations per size/scenario and 1,920 total. An eight-sample block p95 is the block maximum. Reported control values use the upper median of six block p95 values per label. The investigation guard is frozen at max(10% of baseline A p95 upper median, 0.25ms).

Both sizes pass: local insert/delete/mark use zero full snapshot/restore; selection/presence use zero whole-model query and zero PM Node.fromJSON calls; eligible remote 1/2/8-scope receipts use zero whole-model query before PM pull; composition uses one snapshot/restore and one history group. All model, independent local model edits, remote sender equality, generated Op/pending/history and fallback invariants pass.

The five noisy control pairs are 10k insert, 10k remote1, 100k remote1, 100k remote2 and 10k structure. Their observed noise and each frozen threshold remain in `frozen-thresholds.json`. Other native/full test suites did not run during timing. OS indexing and security processes remained active. This is headless Node PM dispatch, not browser input/paint or OS IME timing.

After capture, only schedule selection and omission of a self-control summary for a single-label run were added to the current harness (SHA256 `d93e341144f79a4eaebac02f22923ddfea5bebc7ceeb7d9e6356d81cc2003e26`). Measurement and invariants did not change. The selector passed a 10k smoke run. `benchmarks/editor-host/compare.mjs` will execute the same current harness against both roots in A/B/B/A x3 order after candidate build. It uses these frozen thresholds, compares semantic hashes and operation budgets, and retains raw reports. The comparator has passed syntax validation; complete candidate execution remains NOT_RUN.
