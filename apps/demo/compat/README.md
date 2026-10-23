# Chrome editor integration tests

This folder exercises the public Slate, Lexical, and ProseMirror bindings. It opens two Slate editors, two Lexical editors, and one ProseMirror editor on the same document. The Slate and Lexical exports belong to the same library package. `?legacy=1` selects the older private adapters for bounded comparisons.

Use Node 22.18 or later and an installed Google Chrome.

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm test --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

The server defaults to `http://127.0.0.1:5412`. Set `COMPAT_PORT` to change the port. The demo backend runs in a separate process with a new temporary data folder. It does not use original `data/`. Stopping the server also stops the backend. Temporary data is retained.

Open a Chrome session with the Playwright CLI skill wrapper. Paths below are relative to the repository root.

```sh
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome open 'http://127.0.0.1:5412/?doc=chrome-editors-final' --browser chrome
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-text.js
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-table.js
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-concurrent.js
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-three.js
```

`checks-concurrent.js` includes the empty-document reconnect regression. Core does not reinsert existing character tokens into the cache. The server sends optional `clientSeqs` receive counters with snapshots. The client removes only acknowledged pending changes and reapplies unacknowledged changes over the snapshot. Protocol version 2 requires capability and document-generation checks before sending.

Even with CLI exit code 0, inspect output for Error/Timeout and browser errors. Each test checks equality of the editor native model, CRDT model, and server model.

For ProseMirror, open `/pm?doc=chrome-pm-final`, then run `checks-pm.js`. After testing, close the browser with the CLI `close` command.

Separate minimal reproduction:

```sh
node apps/demo/compat/reproduce-empty-reconnect.mjs
```

This command checks that the original failure condition has no errors, server/client documents match, and pending is 0. A pass prints `regression-passed`. Pre-fix evidence is preserved in `output/playwright/editor-compatibility/core-defect-reproduction.json`. Core regression test: `packages/doc-sync/test/reconnect.test.ts`.

Supported scope: paragraphs, basic formatting, and simple tables. Slate tables use nodes and Transforms defined by this test. Lexical tables use `@lexical/table`. Send-side conversion uses model comparison by default and preserves Enter/paragraph-join meaning. Model Unicode positions are converted to CRDT UTF-16 token positions.

Slate and Lexical rebuild their documents on remote receipt. Before replacement, both selection ends are stored as CRDT token IDs. Paths and UTF-16 offsets are resolved again in the new document. Slate converts offsets across format leaves. Lexical attaches selection to new node keys. Only the focused editor updates DOM selection. Other editors use `SKIP_DOM_SELECTION_TAG` to prevent focus changes. ProseMirror also restores selection by token to keep the caret in its cell after table structure changes.

The public Slate and Lexical bindings preserve composition through the library input session. `input-session.mjs` supplies the comparison ProseMirror facade and legacy adapters. At composition start, it clones the CRDT document and creates local input operations in that draft. The real SyncClient keeps receiving remote changes. Display updates in the composing editor wait until composition ends. It then applies/sends one batch of local operations with original token IDs and origins and displays them with remote changes. It therefore does not delete remote text by comparing a stale display with the live document. One undo covers the whole composition. Draft operation numbers are reserved in the real client clock, including after reconnect snapshots. Identical-content snapshots omit model events, so `onUpdate` also reserves them. Reset discards drafts and clears the display whether or not the model changes. This demo connects ProseMirror through InputSession's client interface. Default PmBinding and `/pm` IME handling remain unchanged.

OS Korean keyboards, paste, links/lists/images, cell merge/split, and performance are outside the passing scope of this input test.

API references: [Slate installation and Editable](https://docs.slatejs.org/walkthroughs/01-installing-slate), [Slate Editor](https://docs.slatejs.org/concepts/07-editor), [Lexical update listeners](https://lexicaljs.org/docs/concepts/listeners), [Lexical rich-text](https://lexicaljs.org/docs/api/modules/lexical_rich-text).

Pre-fix results are in `output/playwright/editor-compatibility/`. Post-fix five-participant results and screenshots go in `output/playwright/editor-compatibility/reconnect-fixed/`.

## Probes and additional tests

The default page disables operation tracing. Open `/?doc=name&trace=1` to read the latest 150 operations through `window.compat.trace()`. `window.compat.clearTrace()` clears the record. Traces include original editor structures/operations, common model edits, UTF-16-converted edits, wire operations, and remote-application results. Trace mode adds document-copying cost; distinguish it from ordinary editing performance measurements.

`window.imeProbe.read()` reads real input events, composition state, and DOM selection positions. It does not change input or selection. Sending `{doc, edits}` to test-server `POST /test/remote` lets a separate CRDT participant submit changes over HTTP. Character offsets in `edits` use CRDT UTF-16 units. This is a local test tool for creating remote changes without moving input focus. It validates document names/edit arrays, HTTP responses, and SSE hello, with a 10-second request timeout.

Open Chrome at the test server URL, then run these scripts. New scripts use the current page origin, so they also work on another port.

```sh
# Default tracing off/trace=1, three-editor input, remote submission, trusted-input observation
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-probes.js
# Structural traces of 10 operations per editor
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-operation-traces.js
# Caret and CDP composition diagnostics. Inspect each result status.
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-ime-cursor.js
# Composition cancellation, undo, repeated composition, remote deletion, empty document, reconnect
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-input-extended.js
# Remote row/column insertion in tables; column insertion during IME composition
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-table-input.js
# Reset during composition in a truly empty document; prevent draft return; follow-up input
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-input-reset.js
```

**2026-10-22 review results**: Root default tests 113, compat tests 14, all type checks, and compat build passed. Isolated Chrome passed 20 general editing regression cases and captured 30 operations. Confirmed no extra operation records with tracing off, and preserved local/remote traces and Unicode edits with tracing on. Local results: `output/validation/compat-review-20261022/validation.json`.

**Pre-fix input results**: Of 36 caret/IME diagnostics, 14 passed and 22 failed. This count is separate from the general editing regression pass above. Carets: Slate 1/8, Lexical 0/8, PM 8/8. CDP composition without remote changes: 1/1 per editor. CDP composition during remote changes: Slate 0/3, Lexical 0/3, PM 2/3. Original report: `output/playwright/editor-compatibility/ime-cursor/`.

The 22 pre-fix failures were: Slate fixed numeric offsets 5, fixed paragraph-split path 1, clamped offset after format-leaf split 1; Lexical lost selection node keys 8; Slate composition DOM replacement 3; Lexical composition DOM replacement/duplicate input 3; PM remote insertion at the composition boundary 1. Additional table tests also found 2 PM selection errors after row/column insertion. Post-fix results and original JSON are recorded in `output/playwright/editor-compatibility/input-fixed/`. `wireOps` are transmitted operations. Temporary composition operations are separate in `stagedOps` or `composition-commit` traces.

IME tests use Chrome CDP `Input.imeSetComposition` and `Input.insertText`. They check composition start/continuation/end, final text, caret position, and subsequent input. Do not interpret them as a pass for the actual OS Korean keyboard IME. Inspect every result `status`; diagnostic-script exit codes alone do not establish that all cases passed.

**Post-fix input results**: Original diagnostics 36/36, extra input 33/33, table caret/IME 12/12, empty-document composition reset 3/3: total input 84/84 passed. Slate/Lexical/PM each passed carets 8/8, CDP composition during remote edits 3/3, and control composition 1/1. Additional checks covered composition cancellation, repeated input, empty documents, Unicode, remote deletion, formatting, split, reconnect, and single undo/redo. General Chrome regressions 20 and operation traces 30 were checked too. In an independent copy of committed core, expanded root tests 113 (`FUZZ_SEEDS=3000 PM_SEEDS=300`), compat tests 31, type checks, and build passed. Unit tests also cover draft/live-undo operation-number collisions and reservation retention after reconnect. Final integration evidence: local `output/validation/ime-cursor-fix-20261022/validation.json`. No separate performance fix is included. Results apply only to this demo binding code and the installed Chrome.
