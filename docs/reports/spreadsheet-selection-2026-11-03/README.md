# Spreadsheet preview typography and selection outlines

This checkpoint fixes the peer-view appearance reported by the user. In-progress
text now uses the same normal typography and content position as native input.
Remote selection outlines are independent of shared grid borders. No data schema,
CRDT, server, History or presence-message contract changed in this repair.

## Cause and change

The old view applied actor colors to all four borders of each selected cell.
Adjacent cells share grid edges in VTable, so colored segments could collide,
look incomplete or appear on internal boundaries of a larger selection.
The old preview also forced italic text and actor text color. Native input
used different horizontal padding from the canvas cell.

The repair restores neutral grid lines and ordinary cell text. Stored bold
formatting is preserved. Input uses the computed cell font/padding and actual
input borders; native and peer content start at the same measured coordinate.

An SVG layer draws only the original outer edges of each remote range. It does
not intercept input or replace the native local selection. Geometry uses two
VTable rectangle reads per visible range, including the row-number/header
indices. Body clipping follows actual headers and draw bounds. Scrolling,
resizing and window jumps update outlines; a window intersection does not
invent a cut-edge border. Stable IDs retain the existing mapping after row and
column edits. A deleted endpoint clears its visible outline.

Only exactly coincident remote ranges share lanes. Actor order selects bounded
1/3/5px insets; additional coincident ranges use dash phases on the inner lane.
Unrelated peers do not shift a range. Text previews use ordinary cell typography;
actor colors remain on range tints/outlines. Text cursor offsets within an
editing cell are not implemented by this repair.

## Qualification

| Check | Result | Boundary |
| --- | --- | --- |
| Affected demo unit suite | 136/136 PASS | Includes seven geometry/lane cases |
| Root TypeScript | PASS | Final source, no emit |
| Targeted desktop browser | 20/20 PASS | Selection14, clipping3, coincident peers3 |
| Desktop live-input regression | 16/16 PASS | Preview isolation, confirm/cancel, synthetic composition, stable targets |
| Desktop stable-axis regression | 21/21 PASS | Structural operations, History, native ranges and presence |
| Docs tests/build checks | 43/43 PASS; 52 pages / 2,404 links | Local English docs, no publication |

All57 desktop checks use emitted bundle:
`4a4e90617ff4cf6bfe883bdf1aec3d4c5f2a475f4ead9456ad42e0e04250812c`.
Page and console error lists are empty. Mobile testing was not performed.

The focused oracle verifies adjacent complete boxes, one2x3 outer rectangle,
native/remote overlap, exact coincident remote lanes, unrelated-peer invariance,
XY scrolling, body/header clipping and window-edge suppression. It checks
row/column insert/move/delete projection and actual native selection/inspector
agreement after Enter, without imposing a new row-advance policy. Native and
peer text start positions are both72px, within the0.5px tolerance. Desktop
screenshots were visually inspected.

The original style was reproduced on an isolated baseline server/bundle before
repair. Earlier first-pass/corrected harness receipts remain separate. VTableRect
uses getters that serialize as empty objects; the harness now records explicit
rectangle fields. A first stable write settled late without a runtime change;
final proof waited for actual acknowledgements. These functional observations
do not qualify latency, physical paint, real OS IME or production resources.

## Run and evidence

Qualified preview:
`http://127.0.0.1:50796/?axes=stable&room=selection-review` (exec84940).
Artifacts: `output/spreadsheet-selection-qualified/`.
Existing user58880 and older5438 tabs/bundles were not reloaded or migrated;
their unsaved input and History remain intact.

Raw receipts/screenshots and exact executed scripts are archived in evidence/.
source-seal.json pins current source and qualified bundle; evidence-index.json
hashes the archives. Earlier reports remain unchanged. Baseline9334e59 remains
the only new commit; this repair and inherited S2/presence work are uncommitted.
No push, registry publication, release or hosted deployment occurred.
