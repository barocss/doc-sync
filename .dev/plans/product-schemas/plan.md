---
work_id: product-schemas
artifact_type: plan
status: verified
owner_role: integration
source_request: Build and test Word-style, Notion-style and presentation schemas after publishing current changes and editor experience documentation.
last_updated: 2026-10-24
---

# Representative document profiles

Add isolated external schema fixtures and rich sample documents. Keep DEMO_SCHEMA, the single library package and collaboration rules unchanged. Cover sections/headers/footers, nested blocks/toggles/columns/database properties, slide order/object frames/groups/notes, rich inline content, grids and covered cells. Verify schema validity, canonical model and snapshot restoration, headless PM/Slate/Lexical conversion, representative model commands, SyncClient/event mirror convergence, concurrent text/format/delete/move/independent fields, conditional undo/redo and required-child projection. Document exact coverage and unresolved native UI/file-format/layout boundaries. First publish existing reviewed work (0951185 and c423a32). Commit/push these requested fixtures and verification as a separate change after passing checks.

Verification complete: 33 profile cases; 600 library + 12 demo + 27 documentation tests with FUZZ_SEEDS=3000 PM_SEEDS=300; compatibility 31; typecheck/build; 310 asserted Chrome cases plus 30 trace captures; 22 documentation pages and 5 guide smoke checks. See docs/reports/product-schemas-2026-10-24/. Native product-profile UI, file fidelity, layout and scale/latency remain outside this acceptance.
