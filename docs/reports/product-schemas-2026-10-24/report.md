# Product schema validation

## Scope

Three external schema fixtures exercise the current document engine. The runtime demo schema and collaboration policies are unchanged. This is bounded model/concurrency verification, not acceptance of Word, Notion or PowerPoint applications.

- Word-style: two sections, headers/footers, nested page margins, rich inline content, lists, a table, a figure and a page break.
- Notion-style: one page with nested blocks, tasks, toggles, callouts, columns, tables, a database-shaped grid, an embed and an equation.
- Presentation: two slides with titles, text boxes, shapes/images, object groups, a table, chart metadata and speaker notes.

Sources: `fixtures/product-schemas.ts`, `fixtures/product-documents.ts`, `packages/doc-sync/test/product-schemas.test.ts`. Each sample grid has 2×2 cells. These samples are not a scale benchmark.

## Defects and fixes

1. The first schema prototype used `code` as both a text node and a mark. ProseMirror rejects that namespace collision. The fixture uses `code-block` for the node.
2. The first profile test run had 21 passes and 9 failures. Canonical grid cells omitted nested field defaults while document output materialized them. `canonGrid` now uses the existing `patchFields` normalization for declared fields. After this fix, 24 cases passed and 6 failed.
3. The six remaining failures were valid snapshot restoration failures. Required flow body-slot keys contain their owner's required identity, but their own line actor is an ordinary slot head. Reserved namespace detection now checks the actual line actor prefix. Trailing paragraph anchors in required storage are checked against their immutable owning flow, not the private physical line. Required address/type and canonical-head validation remain in place.
4. The final suite adds negative restoration cases for malformed required identities, character anchors and objects in another flow. All 33 profile cases pass.

The three-client cases compare client replicas, server state, model-event mirrors, pending queues and zero event-application fallbacks. They cover both receipt orders for delete/format/insert; independent nested fields with selective history; merged hidden text and fields through three codecs and history; structured movement with concurrent descendant input; and snapshots. Required replacement children also accept input before restoration.

## Verification

Environment: Node 22.19.0; Chrome 156.0.8078.47; local macOS workspace. The validation receipt records the exact current source hashes, test log hashes and browser script/case summary.

| Check | Result |
| --- | --- |
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | PASS: 600 library + 12 demo + 27 documentation tests |
| Product profiles, included above | PASS: 33 cases, 11 per profile |
| Compatibility unit suite | PASS: 31 cases |
| Typecheck and compatibility build | PASS |
| Existing-schema Chrome regression | PASS: 310 asserted cases; 30 additional operation traces captured |
| Documentation build/link/fragment/English/path checks | PASS: 22 pages |
| Executable guide example | PASS |
| Guide desktop/mobile smoke | PASS: 5 checks; screenshots saved and inspected |
| Delegated read-only scope review | No blocking finding; reviewer ran no additional tests |

The browser checks use the comparison demo schema and an isolated required-child variant. They do not run the product profiles in native editor UIs. Previously completed browser scripts are retained only when their current script/runtime hashes match. The remaining scripts and corrected caret setup run against the same product source. The 30 trace captures are records, not 30 additional behavioral assertions.

## Retained first failures and diagnostic boundaries

The initial Chrome logical-scope failure had zero convergence failures or event fallbacks. Its PM caret remained at offset 4 after End, so the typed result was `gamm!aS`; the intended caret was offset 6. A required-child run similarly inserted the emoji before the final `d`. These are test setup failures: the checks intended to type at a known paragraph end, not to test End-key behavior. The check now places a native DOM caret explicitly, verifies the target editor/paragraph/offset, waits for selection handling and uses the real keyboard input path. Convergence, formatting and fallback assertions are unchanged. Initial logs, snapshots and the immediate/settled DOM probe are retained locally.

A separate raw-operation probe wrote to dormant internal trailing storage. Attempts to turn that into a visible-input regression found no visible target paragraph. The probe is diagnostic only. The exploratory test and receive-validator change were removed; no live operation policy is changed on that basis.

Local records: `output/validation/product-schemas/` and `output/playwright/product-schemas/`. The receipt includes their hashes; ignored local output is not included in Git. Historical benchmark and merged-grid records are unchanged. Only task-owned browser sessions and temporary servers are closed after verification; user preview port 62490 and existing user tabs are preserved.

## Limits and next evidence

The product profile conversions are headless. Native profile editing, keyboard/selection integration, rendering, product-specific paste and actual OS IME remain unvalidated. DOCX/PPTX import/export, pagination, database execution, canvas drag/resize, layout and accessibility require application work. Presentation chart data is atomic; object frame coordinates and `z` are stored metadata.

No fresh before/after performance measurement is claimed. Larger generated documents, native profile UIs and end-to-end editor latency are the next evidence to collect. Passing these bounded schema cases does not close performance or release gates.
