# Other editor comparison

- work_id: other-editors-100k-20261022
- Scope: Current optimized Doc with existing Slate, Lexical and ProseMirror compatibility adapters.
- Conditions: Initial 100000 ASCII characters, 625 paragraphs of 160 characters, identical seed as previous browser measurement. Two actual editors per page. Slate ↔ Lexical, Slate ↔ ProseMirror, Lexical ↔ ProseMirror. Five warmups then 30 measured edits per direction. One separate trace/profile edit per direction.
- Input: Trusted browser keyboard.press; first paragraph, initial caret offset 50 per direction.
- Endpoint: Remote paragraph equals expected text, then two native requestAnimationFrame callbacks. Rendering opportunity proxy. No physical display timing claim.
- Test harness: Copy of current compatibility entry point, query selects two peers and exposes native objects for measurement. Same original adapters, local HTTP POST/SSE and original JSONL server. Development build, operation trace off, existing 300ms status polling on. Each editor has a 460px scroll viewport, full 625-paragraph model and DOM retained.
- Evidence: Frozen source, source.diff, seed hash, browser raw results, method spans, DOM mutation counts, trace/profile diagnostics, server spans, final native/client/server equality.
- Limit: Different peer types, adapter paths and viewport versus prior demo ↔ PM. Do not interpret as vendor engine rankings or direct optimization gains from prior figures. Sequential ASCII edits only; no OS IME or wide-area network proof.

- Status: done. All 180 measured edits passed. Continuous-string storage review added; no storage migration implemented.
