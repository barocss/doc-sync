# Editor binding delivery

Status: complete

Parent owns shared editor input/model/subscription helpers, metadata/lock, compat migration, integrated tests/browser, HANDOFF and final deployment. Slate worker owns src/slate and slate tests. Lexical worker owns src/lexical and lexical tests. Docs worker owns current Editing API reference and full-schema page/generator/tests. Separate paths avoid conflicting edits.

Design review: do not export fixed demo adapters by name only; preserve all advertised model data and editor lifecycle. Keep full native-tree replacement explicit. Schema-derived nodes can retain unsupported native shape data; consumers supply renderers/plugins as documented. Shared input sessions reserve actor Tickets while composing; remote delivery remains live. Check reset even if the resulting model is equal. Wrap existing client hooks with removable subscriptions, not destructive replacement. Native selection offsets are UTF16; diff-model offsets are code points and must be mapped explicitly. Undo uses CRDT History only.

Execution: implement disjoint bindings/shared helpers; integrate real compat editor consumers; run targeted native tests then source-matched core/compat/Chrome regressions; review functional/security/quality; update docs/HANDOFF; deploy the current docs as authorized by the ongoing documentation task. The later user instruction expands this delivery to all four document capabilities, including move; see ../document-capabilities/spec.md.

Delivery: bb0a562 pushed to main. Pages run 39989535020 succeeded; anonymous HTTP10 and production Chrome page/schema/move/mobile checks passed. Full-model feature latency remains an explicit performance limit, not a remaining implementation promise.
