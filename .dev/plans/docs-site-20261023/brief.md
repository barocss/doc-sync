---
work_id: docs-site-20261023
artifact_type: implementation-brief
status: ready_for_build
owner_role: executor
source_request: Commit existing work, create apps/docs, deploy with GitHub Pages, translate every document to English.
last_updated: 2026-10-23
---

Scope: private npm docs workspace using pinned VitePress 2.0.0-alpha.20 (the official current documentation version; 1.6.4 was rejected after its transitive development-server audit findings); public GitHub Pages deployment from main; complete English review of all 30 existing Markdown/HTML documents (26 translated/updated, 4 already English). Keep the library as one package. Keep every collaboration rule, raw result, benchmark source and measurement boundary unchanged. Translation lanes own disjoint document paths. Parent owns app/config/lock/workflow and final cross-file links.

Checks: translated-prose inventory, numeric/provenance review, Markdown/internal links and generated-site privacy checks, actual executable quick-start example, static build, typecheck, library/demo regressions, desktop/mobile/search/theme/code-copy Chrome smoke, Actions deployment success and anonymous production HTTP/browser checks. Preserve prior raw measurements and record documentation hash changes in a translation ledger. Do not use Sites after the explicit GitHub Pages instruction.

Completion: core change baead96 already pushed; docs and translated documents committed/pushed; public URL verified; HANDOFF includes final run commands, scope and evidence. No new performance/SLO or actual OS IME claims. Follow-up clarification: make doc.edit and model paths the primary block-editing interface; commands remain optional wrappers.

Follow-up: add diagrams generated from actual Doc.edit execution for insert/delete/update/split/merge and table span restoration. Verify fixed model expectations, SVG XML, readable desktop/mobile rendering, and deployed assets. Derived SVG/model snapshots remain build outputs; the generator and tests are tracked.
