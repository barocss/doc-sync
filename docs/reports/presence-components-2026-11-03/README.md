# Shared Presence API and optional UI adapters

Core now exports /presence with bounded immutable state, subscriptions, explicit
expiry, stable targets and a client bridge. Four optional packages add shared
DOM views and React, Vue and Svelte integration. The original engine and editor
bindings remain separate. All nine library candidates remain private at0.0.0.
No registry publication, commit, push or hosted documentation deployment occurred.

## API and ownership

createPresenceStore owns ephemeral snapshots, never a document or History.
Document targets contain token anchors, Graphic targets contain object IDs and
pointer coordinates, and Spreadsheet targets contain stable sheet/row/column
IDs with optional range endpoints. Drafts include field/text/composing and
UTF-16 start/end/direction. Validation bounds actor count, state size, IDs and
text; split-surrogate endpoints are rejected. Immutable snapshots are stable
until a change. Explicit expiry uses local receipt time and creates no timer.

connectClientPresence wraps the owning sender reversibly, preserving editor
anchors and unrelated source metadata. Mount before the editor or pass its
current initialPresence; an existing local selection is not reconstructed from
remote presence. One bridge per source prevents competing feature ownership.
Feature updates use a50ms trailing throttle; clear sends immediately. Existing
editor selection cadence remains unchanged. Final envelope validation reports
lastError/onError. Nested profile metadata is omitted from the feature envelope
and remains in its source-profile location. Bridge disposal precedes store and
source disposal. A bare custom host only intercepts calls through that host.

Session UUIDs, increasing sequences and state:null tombstones prevent reordered
HTTP drafts from reviving after a newer clear at an existing observer. Bounded
high-water history survives clear/leave (1,000 actors, eight retired sessions
per actor). A new receiver, unseen earlier session or evicted history has no
such ordering guarantee. The server's legacy Presence map is still last-arrival;
this delivery does not add authoritative server-wide Presence ordering.
Reconnect clears stale drafts; ordinary pending edit/ACK transitions do not.
Pending document edits and actor-owned History are not touched.

The DOM package renders input-transparent AvatarStack/BotAvatar, CursorLayer,
SelectionLayer and DraftPreview through one mountPresence handle. A host-owned
projector supplies viewport CSS rectangles separately for each domain and role.
Unknown/deleted targets return null. Font inherits from the host; a draft's
content-sized box clips to its projected bounds. Draft character selection uses
a safe mark node, and its caret uses native DOM Range geometry at the active
UTF-16 endpoint. A visible matching draft caret replaces the ordinary cursor;
clearing the draft restores it. Cursor/selection flags cover both layer types. Actor color is shared across
layers; names appear only on hover with accessible labels. Scroll, resize and
explicit invalidation coalesce into a single pending animation frame. Disposal
removes listeners, observers, subscriptions, DOM and pending frames.

React provides context, usePresence/useSyncExternalStore and components; Vue
provides reactive context/composables and components; Svelte provides a real
compiled component and readable store, with browser/server exports and source
for Svelte-aware bundlers. Optional UI dependencies do not enter Core. Framework
unmount releases its UI without disconnecting the client. Custom projector and
native draft capture remain application responsibilities; installing these
packages does not migrate the private spreadsheet session or add a WASM backend.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Full workspace | 1,552 cases:1,550 PASS /2 expected platform SKIP /0FAIL | Core1114, Lexical7, React2, Svelte2, UI3, Vue2, Slate4, Bot53, Demo141, Docs43, MCP181/179PASS |
| Final affected UI/framework tests and root TypeScript | 10/10 PASS; tsc PASS | UI4/React2/Vue2/Svelte2 after final draft-caret change |
| Desktop Chrome | 27/27 PASS; page errors0 | DOM/React/Vue/Svelte actual mounts; independent native geometry tolerance1CSSpx |
| Real HTTP/SSE delayed packets | 4/4 PASS inside full suite | Delayed original draft after draft-clear, local-clear, bridge disposal and reconnect |
| Package artifacts | Nine tarballs /11 consumer cases PASS | Isolated imports/types, no unrelated peers, stale-dist rebuild/removal, SSR imports, original native binding/Tiptap tests and independent Slate patch |
| Release preparation | PASS | Nine0.1.0 versions in temporary copy; compatible peers, independent Slate0.1.1 rehearsal, source flags/lock unchanged |
| Docs | 43/43 PASS;53pages /2,471internal links | English/local-path checks PASS; no hosted deployment |

The full workspace run completed around the final UI rendering changes. It includes
the final core ordering/lifecycle logic. After the remaining DOM sizing and character-caret
changes, focused UI/framework10, root tsc, package consumers and desktop27 were checked
again; a second full workspace run is not claimed. All focused counts overlap
the full run and must not be added as unique tests. The two expected SKIPs are
unsupported-platform lock handling and the Linux-only lock-helper case on macOS.

Final desktop bundle SHA-256:
`73cb413c327e0f42de1284c1a6010c277367e02299b4da4fa217e77223269308`.
Ten browser-qualified source hashes match the checkout and remain unchanged
through the run. Screenshots were reviewed by the browser worker and the root
reviewed document-draft.png. Trusted Hangul+emoji typing, native UTF-16 selection,
normal typography/full visible glyphs, backward/forward draft emoji selection
and active caret, role-aware document cursor, Graphic and
Spreadsheet fixture projection, null hiding, hover names, confirm exactly1 edit,
cancel0 edits, own undo/redo retaining a peer edit, disconnect/reconnect and
three mount cycles (UI subscriptions4→0→4, one root per framework) pass.
React19.3.1, Vue3.5.44 and Svelte5.57.3 were exercised. Declared peer ranges are
not exhaustive version-matrix qualification. SSR and lifecycle tests cover
React StrictMode/hooks, reactive Vue provider replacement and Svelte shared
readable cleanup/freshness.

Browser proof uses real Client/DocHub over an in-page memory transport and four
actual ProseMirror views. It is not cross-browser HTTP proof. Graphic and sheet
surfaces are stable-ID projection fixtures, not complete domain editors. The
separate Node test exercises actual HTTP/SSE ordering. Native OS IME composition
and mobile are NOT_RUN; no browser latency/long-run resource budget is claimed.

## Corrections and evidence

Review caught and fixed metadata-depth amplification, initial local anchor
clearing, stale Vue provider subscriptions, reconnect draft handling on ordinary
ACKs, and missing reordered-packet protection. Before-patch actual HTTP2FAIL
was observed in agent tool output; raw prepatch terminal artifacts are NOT_SAVED.
Final HTTP4PASS appears in the preserved full workspace log and repeatable test.
The first default npm cache attempt failed EACCES; a task-specific /tmp cache
completed installation without changing user cache permissions.

Browser attempt1 had a harness quote failure and visibly clipped draft text.
Attempt2 passed22 functional checks but failed visual review because a white
preview box covered too much document content. Role-aware projection and compact
bounded text sizing corrected these. Attempt3 passed24. The final completeness pass added intra-draft character
carets and explicit DraftSelection markers; attempt4 exposed a stale harness
selector for the removed ordinary cursor. Final attempt5 passes27 and visual
review, including backward/forward emoji active endpoints, one effective actor
caret, and restoration of the ordinary caret after clear.
All attempt receipts/screenshots are preserved separately rather than replaced.
Final receipt: output/playwright/presence-components-proof-attempt5/receipt.json.

The evidence directory archives raw logs, browser receipts/screenshots/scripts,
package and release receipts. evidence-index.json hashes compressed artifacts;
source-seal.json pins the checkout source and served bundle. Earlier checkpoint
reports remain unchanged. Historical seals are snapshots, not current hashes.

## Run

From the checkout, npm ci then npm run dev:presence. The server prints an
available loopback address. Set PRESENCE_URL to that address and run
npm run check:presence. Retained final preview:
http://127.0.0.1:49849 (root exec87558).
Browser-owned sessions were closed; original user tabs, documents, drafts,
History and prior services were preserved. The demo does not connect the user
to an external collaboration service. Documentation:
apps/docs/src/guide/presence-components.md; HANDOFF section5.127.
