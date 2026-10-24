# Product schema native editor verification

Connect the three product schemas to a separate demo under apps/demo/products using the public Slate, Lexical and ProseMirror bindings. Reuse HTTP/SSE validation with an explicit server schema profile and isolated temporary storage. Keep default demo behavior, package layout and concurrency rules unchanged.

Verify full sample preservation, real Chrome input and deletion, nested selection direction and remote mapping, formatting, split/join, participant undo/redo with foreign edits, and required/covered content. Measure a 100,000-character generated payload plus rich sample content for all three editor sources in each profile, separating input/commit, transport, remote update, DOM match and second-rAF opportunity. Save raw samples, conditions, first failures and a Markdown report. Run relevant regressions, typecheck and full extended random tests if library code changes. Update English documentation and HANDOFF with precise limits. Do not commit/push unless newly requested.

## Verified outcome

- No library source or concurrency-policy changes.
- 90 native editing + 39 schema-context/structure + 12 UI Chrome cases pass.
- 600 library + 16 demo + 27 docs tests pass with FUZZ_SEEDS=3000 PM_SEEDS=300; compatibility 31; typecheck, product build, root startup smoke and docs build/link checks pass.
- 18 performance batches: 540 measured trusted keyboard inputs after 90 warmups; 1,080 remote rendering opportunities. Large worst-peer p95 is 332.3–621.7 ms. The remaining whole-document native conversion/replacement paths require profiling; no performance acceptance or optimization gain is claimed.
- Native views are structured editors. Presentation canvas layout, Word pagination, database execution/collapse UI, media fidelity, real OS IME and production/WAN performance remain separate.
- The first structure failure was an ambiguous Review/Reviewer selector. The retained original and state show the wrong target. The corrected test uses exact text and asserts the model path before input.
- Report and raw records: benchmarks/results/product-native-2026-10-24/. HANDOFF §5.27 records scope, execution and limits. The root startup command passes and the live review server remains at port 60012. Original user tabs, data and preview 62490 are preserved. No commit/push was requested or performed.
