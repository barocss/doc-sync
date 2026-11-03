# Spreadsheet remote text carets and cross-domain ephemeral state

The spreadsheet demo now displays remote intra-cell text carets and character
selections through Presence. Accepted cells, document clocks, pending changes,
server acceptance sequence, journal and History remain unchanged until commit.
This is private demo session/transport/view functionality, not a universal
public draft API or a new data schema shape.

## Protocol and rendering

Optional editing.selection contains UTF-16 start/end offsets relative to the
exact transmitted editing.text and a forward/backward/none direction. Equal
endpoints mean a caret. The active endpoint is start for backward selection,
end otherwise. Legacy previews without selection remain supported. The sender
bounds preview text to 8,192 UTF-16 units without splitting a surrogate pair,
and clamps offsets to the transmitted text and code-point boundaries. The
server rejects malformed selections before changing presence or its sequence.
Valid combining and ZWJ positions use native DOM offsets.

Native text input publishes input, focus, character selection, keyboard/pointer
selection and composition state. Capability follows the actual control: the
native text InputEditor supports an incomplete numeric draft and a caret;
inspector number/color/checkbox/select controls omit character selections.
The recipient uses actual DOM text shaping and Range geometry with cell font
and padding. Only the visible preview winner gets a caret. Local native editing
suppresses the peer overlay. Field prefixes adjust display positions without
changing transmitted offsets. Long text reveals the active caret in the peer
viewport without copying the sender's pixel scroll. Body/cell clipping and
stable row/column IDs preserve position through scroll, window jumps, insert
and move; deleted targets are hidden.

## Qualification

| Check | Result | Boundary |
| --- | --- | --- |
| Affected demo suite | 141/141 PASS | New text protocol and cross-domain tests included |
| Root TypeScript | PASS | No emit |
| Spreadsheet desktop Chrome | 68/68 PASS | New cursor32 + live preview16 + selection/clipping/coincidence20 |
| Document/Graphic focused suite | 54/54 PASS | Overlaps the demo suite; counts must not be added as unique tests |
| Document/Graphic desktop Chrome | 7/7 PASS | PM/Slate/Lexical caret/range and PixiJS pointer/selection/local drag |
| Docs tests/build checks | 43/43 PASS; 52 pages / 2,407 links | English/local-path checks; no hosted deployment |

All68 spreadsheet desktop checks use bundle SHA-256
`af5a94cfbe214b7930e3070dea56a50a5e7de501d3def30810089b968e38a5ec`.
The independent DOM Range/cell/body oracle uses a 0.75 CSS px tolerance.
The browser summary records zero errors and no source drift; the seven listed
source hashes match the current checkout. Screenshots were visually reviewed.
Cases include Hangul, emoji/ZWJ/combining text, trusted arrows and mouse drag,
backward selection, empty/end/long text, inspector prefixes, native numeric
raw input, preview-winner consistency, own-editor suppression, both-axis
insert/move, scrolling/window/deletion and commit/undo/redo with peer edits.
Composition Enter gating uses labeled synthetic events. Real OS IME and mobile
are NOT_RUN. This is functional proof, not a latency/physical-paint/resource
qualification. No fresh full-workspace test run is claimed; the prior full run
is retained in HANDOFF section5.124.

Document product views display remote token carets/ranges and clear them on
disconnect without model/pending/server changes. Tiptap was not browser-tested
in this domain pass. Shared uncommitted Document text-draft rendering is
NOT_IMPLEMENTED; custom metadata transport alone does not establish a renderer.
Graphic remote pointer/object selection and local drag preview/cancel pass;
pointer release accepts exactly one change that reaches the peer. Shared
remote drag-preview geometry is NOT_IMPLEMENTED.

## Preserved attempts and evidence

The initial26-case cursor run predates the final native numeric control
capability correction and is not final qualification. A subsequent enum test
used select without focus; a trusted click corrected the harness. A repeated
same-origin navigation stalled with pending1; an EventSource connection-pool
cause is suspected, not trace-proven. The harness disconnects its own prior
sessions before navigation; a fresh owned server completed final32. Failed
attempts and exact scripts are preserved, distinct from final receipts.

Final overview: output/spreadsheet-text-cursor-proof-qualified/browser-summary.json.
Final new32: output/spreadsheet-text-cursor-proof-qualified/functional.json.
Regression36: output/spreadsheet-text-cursor-regression/.
Domain proof: output/domain-ephemeral/chrome/receipt.json.
Raw receipts, scripts, screenshots and logs are archived under evidence/;
evidence-index.json hashes each compressed archive. source-seal.json pins the
current source and final served bundle. Earlier reports remain unchanged.

## Run and delivery status

Run npm run dev:spreadsheet and use a fresh ?axes=stable&room=text-cursor-review
room. The retained qualified preview is
http://127.0.0.1:62007/?axes=stable&room=text-cursor-review.
Existing user tabs, drafts, History and older servers were preserved. The
browser worker stopped only its owned64252 server; domain-owned58943/58944
servers were also stopped. Baseline9334e59 remains unchanged; inherited
S2/Presence work and this delivery remain uncommitted. No push, npm release or
hosted documentation deployment occurred.
