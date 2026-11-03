# Spreadsheet live presence and input previews

This checkpoint extends the S2 delivery with actor-colored ranges and ephemeral
input previews. It does not add a document schema flag or CRDT operation.
The inherited baseline remains committed as 9334e59; new S2/presence work is
uncommitted, with no push or publication. The earlier S2 report remains an
immutable pre-presence checkpoint.

## Data boundary

Accepted document data uses DocumentSchema, GraphicSchema or the separate
SpreadsheetSchema. Temporary selection/typing state uses a validated presence
message contract. A numeric field can preview `-` or `1e` without admitting it
as committed data. Final Enter/Apply still parses and validates through the
existing cell edit path. Preview text never creates a register, clock tick,
pending edit, acceptance log entry, journal entry or undo History action.

The private demo session adds name/color, preview(target,field,text,{composing})
and clearPreview(). Stable targets follow rows/columns through moves. Hidden
IDs have no visible preview and local commit cannot redirect into a neighbor.
This is a demo transport/view feature, not a universal production binding API
or durable draft store.

## Protocol

Presence carries actor identity, range and optional editing target/field/text/
composition state. The server validates actor/token/epoch, mode/schema, target,
field, name/color and a maximum8192 UTF-16 text units. Actor-local sequence
numbers reject stale updates; malformed requests do not partially change state.
Client sending uses one in-flight request, a50ms coalescing interval and latest
trailing state. A clear cannot be overwritten by an older acknowledged preview.
Requests are best-effort and cannot block document editing.

A new SSE stream clears its old draft. Closing an older stream cannot delete a
newer stream's presence. Disconnect removes temporary presence. Reconnect does
not replay an old shared preview. No durable preview persistence or TTL/resource
production gate is claimed.

## View

Alice is blue, Bob is red; other demo actors have deterministic palette colors.
Names/colors are display information, not permissions or actor identity.
Range tints/borders and preview text use validated actor colors. Primary-field
and formula drafts display exact raw text; another inspector field displays
`field: text` in the cell. The committed model and remote inspector inputs stay
unchanged. An editor opened on a peer preview starts from its own committed
value, avoiding accidental adoption of another actor's uncommitted draft.

Native input/composition listeners publish captured targets and exact input.
Invalid final values keep the actual input open. Enter during composition does
not commit; Escape clears and restores committed projection. Inspector blur
clears shared preview while preserving local dirty fields; focusing a dirty
field republishes it. Inspector Escape restores current committed fields.
Dirty forms remain protected in both fixed and stable modes.

Peer projection is cached once per refresh. All preview-driven native table
updates suppress edit events, and active own input is preserved. Stable native
selection borders retain the earlier S2 captured-ID restoration behavior.
No explanatory panel or mobile UI work was added.

## Evidence status

Final desktop Chrome qualification passes92 checks: live16, fixed-axis20,
custom29, stable21 and cancel6. All use emitted bundle
9a2218517d3e2a1bc6060da8a2b40747463d0c11dbce14c1a2ce4eb1045f688d.
The final live run uses a fresh isolated server at58880 (exec11090); four
regression runs used5448. Runtime source and emitted JS are identical.
Exact receipts and current source hashes are in verification-final.json.
Earlier attempts remain in evidence/.

The full workspace invocation passes1516 cases:1514 PASS, two expected platform
SKIPs, zero FAIL. Counts: Core1099, Lexical7, Slate4, Bot53, Demo129, Docs43,
MCP181/179PASS. Final affected-demo rerun passes129/129 after the UI's last
captured-target/blur guards; root TypeScript passes. The new five HTTP/SSE tests
cover before-commit isolation, colors, bounds, stale cancellation, stable
move/delete, coalescing100 edits into at most two requests and stream lifecycle.

Native keyboard, inspector and synthetic composition proof is separated from
an OS keyboard IME claim. Desktop view assertions request Chrome frames before
checking native data/styles. They do not measure latency or physical paint.
Mobile tests are excluded throughout this checkpoint.

## Findings and limits

Trusted select-all shortcuts did not replace this tool's native text reliably;
the final harness uses trusted Home then Shift+End. Node fetch keepalive after
synchronous browser commands also failed intermittently; the independent HTTP
oracle uses node:http with agent:false. These harness failures are retained. Exact actor/range acknowledgements and
bounded screenshot-driven frame requests replaced premature view reads.
One later test server reached its intentional room cap after many proof rooms;
a fresh isolated server completed the final16-check run. No user server was
restarted. CSS trailing whitespace cleanup changed no semantics or emitted JS.

Two real lifecycle bugs were found and fixed: an older editor's queued onEnd
cleanup could clear a newer active target; and a blurred dirty fixed-axis form
could reset when its own presence-clear refresh arrived. Final regressions
cover captured target, dirty blur and cancel behavior.

No semantic document-engine or schema fingerprint change is made. In-memory
server/reload durability, formula evaluation, production resource budgets,
long-history/browser performance qualification and native/WASM S2 remain open.
Palette colors can repeat for more actors; this is not a unique identity key.

## Run

Run npm run dev:spreadsheet for the private demo. Open a new room, optionally
with axes=stable and profile=tasks or profile=sensors. Keep existing user tabs
and their unsaved drafts intact. The qualified preview is http://127.0.0.1:58880/?axes=stable&room=live-presence-review
(exec11090), using a separate output folder. The original5438 user tab and
its draft/history remain untouched. Exact bundle and receipts are recorded in
output/spreadsheet-live-presence-demo/verification-final.json.

This report's evidence/ contains receipts, raw scripts, screenshots and failures.
source-seal.json pins final source and bundle; evidence-index.json hashes the
archives. HANDOFF §5.124 records the final qualification and run address.

Final docs43/43PASS and build52pages/2404internal links pass English/local-path checks.
