# Remote native editor projection performance

The final comparison passes all model checkpoints. The tables use pooled p95 over 60 inputs per cell; raw records and per-round p95 remain in summary.json. Values are milliseconds.

## Large input-to-worst-peer rendering opportunity

| Profile | Input source | Before p95 | After p95 | Change |
| --- | --- | ---: | ---: | ---: |
| word | Slate | 349.0 | 110.3 | -68.4% |
| word | Lexical | 610.1 | 175.7 | -71.2% |
| word | ProseMirror | 587.3 | 94.0 | -84.0% |
| notion | Slate | 305.6 | 106.3 | -65.2% |
| notion | Lexical | 558.1 | 160.6 | -71.2% |
| notion | ProseMirror | 533.4 | 70.1 | -86.9% |
| presentation | Slate | 332.4 | 110.7 | -66.7% |
| presentation | Lexical | 548.6 | 176.5 | -67.8% |
| presentation | ProseMirror | 499.6 | 79.9 | -84.0% |

## Sample input-to-worst-peer rendering opportunity

| Profile | Input source | Before p95 | After p95 | Change |
| --- | --- | ---: | ---: | ---: |
| word | Slate | 46.9 | 46.2 | -1.5% |
| word | Lexical | 47.5 | 46.6 | -1.9% |
| word | ProseMirror | 47.5 | 47.4 | -0.2% |
| notion | Slate | 47.9 | 47.1 | -1.7% |
| notion | Lexical | 47.5 | 47.8 | +0.6% |
| notion | ProseMirror | 47.0 | 48.5 | +3.2% |
| presentation | Slate | 46.9 | 48.1 | +2.6% |
| presentation | Lexical | 47.3 | 48.2 | +1.9% |
| presentation | ProseMirror | 47.0 | 47.0 | +0.0% |

## Remote SSE handler p95 ranges, large documents

Ranges span the six profile/source cells in which the named editor is a receiver. Self acknowledgements are excluded.

| Receiver | Before | After |
| --- | ---: | ---: |
| Slate | 234.5–267.2 | 5.3–14.4 |
| Lexical | 101.2–115.9 | 46.9–49.5 |
| ProseMirror | 3.6–4.7 | 3.2–3.9 |

The reduction is largest when unchanged native roots are retained. Lexical-source input still pays local conversion and readback costs. ProseMirror source is unchanged; shorter shared-thread delay does not establish an improvement to its own binding. Sample tails remain visible in the table and must not be hidden by the large-workload result.

## Implementation and evidence detail

## Change and unchanged contracts

Slate and Lexical previously read the full native model repeatedly during one receipt and rebuilt every native root block. The bindings now cache an immutable native revision, find the common root prefix/suffix, and project only the intervening blocks. Stable native objects/keys remain outside that interval. ProseMirror is an unchanged control; it already applies narrower native transactions.

Slate invalidates projection eligibility after native content changes. It only reuses a tree that exactly matches its generated projection. Normalization that adds presentation metadata uses semantic readback and the full recovery path. Lexical invalidates its cache before native content conversion, caches actual projected readback, and leaves canonical cell-metadata restoration uncached. This matters because canonical readback can include retained hidden cells before native unmerge has restored all visible cells.

The CRDT, wire protocol, schema rules, required children, placement, ownership, history and composition draft policies are unchanged. Existing codecs still create the changed nodes. Covered cell content is retained. Unknown native revisions, reset/recovery and composition keep their existing guarded paths.

## Conditions and measurement method

- Node 22.19.0; Google Chrome 156.0.8078.47; Apple M3 Max, 14 logical CPUs, 36 GiB; macOS 15.6.1; viewport 1680 by 1100.
- Real development editor bundles, localhost HTTP/SSE, three visible native editors on one Chrome page. Each variant uses dedicated backend processes and fresh temporary storage. The user's existing demo, documentation preview, tabs and original data remain intact.
- Word-style, Notion-style and presentation schemas; rich sample and rich sample plus exactly 100,000 generated UTF-16 text units in 625 paragraphs across 20 containers.
- Before A1 and A2; final after F3 and F4. Each round has 18 batches. Each batch has 5 excluded warmups and 30 measured trusted Chrome keyboard inputs. Each profile/size gets a fresh document, with source order rotated by profile and held constant across variants.
- Retained intermediate candidate runs are excluded from the comparison. The observed order is A1, intermediate candidates, F3, A2, F4. This is an interleaved repeated local comparison, not a strict uninterrupted ABBA experiment or a randomized trial.
- Total comparison: 72 batches, 2,160 measured inputs, 360 excluded warmups and 4,320 remote rendering-opportunity endpoints. Each variant has 1,080 measured inputs. Full native/client/server equality is checked before and after each batch, outside timed intervals. Initial models match across variants. All measured inputs are trusted, every record completes and event-application fallback counts stay zero.
- Timestamps cover beforeinput, commit, send/response, SSE handler, target DOM match and second requestAnimationFrame. The last endpoint is a rendering opportunity, not physical display. HTTP response durations include scheduling. All three editors share a main thread, so delayed PM display can be caused by work elsewhere on that thread. Handler spans are elapsed application time, not profiler self-time.
- Pooled p95 uses nearest rank on 60 samples per profile/size/source/variant. A worst-peer p95 is the larger p95 of the two receiving editors. Individual 30-sample round statistics remain in summary.json. Do not average p95 values.

## Remaining costs and limits

This change is bounded at root-block intervals. A changed large root container is still converted and rebuilt; two distant changed roots can widen the interval. Root comparisons and Doc.toJSON copying can still scan the document. Lexical keeps one full readback for each projected state so native transforms and application codecs remain observable. Local input conversion, selection mapping, hidden-grid recovery and full fallback paths still cost time. No per-character storage, concurrency policy or public package split is introduced.

The sample and large results are local development evidence. They do not establish WAN latency, independent-machine performance, physical display timing, actual OS IME, product layout/file fidelity or a vendor ranking. No release latency target is set. Retained tail values and any slower control cells must be read with the shared-main-thread and uncontrolled external-load limits.

## Correctness evidence

Eight new library regressions cover unchanged native identities in all six Slate/Lexical profile combinations through remote Unicode/format changes, duplicate pulls, root insertion and deletion, plus presentation-only Slate normalization and a Lexical application transform that changes projected content. Existing tests cover composition, snapshots/reset, native moves, merged/hidden cells, selection and ownership-aware history.

The first cache candidate failed the existing Lexical native-unmerge regression: canonical hidden-cell readback matched the document before all visible native cells were restored. Cell-metadata synchronization now invalidates that cache. Initial typecheck also caught an incorrect test edit-op name and a Slate test generic; both test fixtures were corrected and their focused checks rerun. The first DOM-retention check used a raw ARIA attribute selector that did not find every native root. It was corrected to the same accessible-role locator used by the established browser scripts. The corrected check fails on the baseline because Slate rebuilds the distant DOM paragraph, and passes all nine final profile/editor combinations. Original failure logs and intermediate bundles are retained locally.

See validation.json for current checks, source hashes, bundle provenance and local evidence. The four changed bundled sources are the Slate binding/codec and Lexical binding/conversion modules; the product UI and core/server/concurrency sources are identical between measured bundles. The baseline library sources match base main 499c221bcd7ce85fc91f9d6f2a144822e385b46a.

## Final checks

- `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: 608 library, 16 demo and 27 documentation tests; all pass. Compatibility unit suite: 31 pass. Typecheck passes.
- Product Chrome: 150 assertions (90 common native editing, 39 structured contexts, 12 UI/guards and 9 retained-DOM checks). Existing comparison Chrome: 310 assertions and 30 separately captured operation traces. Both suites report zero console errors. Captured traces are not OS IME acceptance.
- Product and comparison bundles build in isolated paths. Documentation builds and checks 22 pages and 1,028 internal links, with English prose and excluded local paths.
- A legacy PM backward unmerge check initially accepted stale matching native/server cache state. Saved final state retained Xcell11 and showed the cell as unmerged. The browser check now waits for the remote edit receipt's server sequence on the cached server and every peer before equality checks. All 30 merged-selection cases pass with the stronger guard; the other passed scripts remain tied to the same verified bundle. This test-harness change does not alter the measured bindings or concurrency policies.
