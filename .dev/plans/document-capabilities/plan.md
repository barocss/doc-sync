# Delivery plan

Phase: validation complete; final documentation and delivery in progress

1. Finish existing reusable native bindings and integrate them into real browser consumers; full schema page/current Editing API reference.
2. Core owner english_design_docs: move/cardinality design then phased core implementation, shared schema/model/compiler/history/snapshot integration. No parent writes to those core files.
3. Field owner english_core_docs: fields.ts, regression cases and exact integration contract. Core owner applies hooks; same-value explicit writes preserved.
4. Annotation owner pending Lexical handoff: metadata/range module and regressions; core owner supplies reserved-line immutable validation hooks.
5. Parent: shared editor helpers/tests fixes, package/lock, demo consumers, docs nav/generation, integration/browser tests, reviews and HANDOFF. Preserve other workers and existing data/tabs/processes.
6. Reconcile the text-move content ownership contract before broad move completion. Do not label structural-only move as full text support. Test splits, joins, deleted boundaries, annotations and native mapping after actual moves.
7. Expanded regressions, compatibility units/build, real Chrome convergence/caret/composition traces, performance disclosure for whole-tree native application. Functional/security/quality review; fix findings. Source-bound receipts and current documentation.

Native OMX state tools are not exposed in ALL_TOOLS despite mode initialization; this tracked plan records progress without altering unrelated mode state. The user requested end-to-end implementation; no extra approval inferred from old planning-only guidance.

All implementation units are integrated. Expanded workspace tests 458+12+27, compat31, Chrome84+20+30 traces+8 capability flows passed. Functional/security/quality APPROVE. Sequential ABBA and current-only feature benchmarks completed; known full-comparison latency is documented. Final build/deployment receipts remain.
