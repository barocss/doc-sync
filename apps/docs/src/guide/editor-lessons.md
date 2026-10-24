# Editor design lessons

A collaboration binding connects two document models, two position systems and an input lifecycle. Matching the visible text is only one part of that work. This guide records the differences we encountered in ProseMirror, Slate, Lexical and the custom schema demo, and the fixes that other editor implementations can reuse.

The examples describe this repository's bindings and installed dependencies: Slate 0.146.0; Lexical, rich-text and table packages 0.52.0; ProseMirror model 1.25.12, state 1.4.4, transform 1.12.2, view 1.42.6 and tables 1.8.5. They are a tested integration snapshot. They do not rank the editors or establish behavior for every version and plugin combination.

## Compare the integration models

| Concern | ProseMirror | Slate | Lexical | Custom schema demo |
| --- | --- | --- | --- | --- |
| Native document | Schema-constrained node tree in editor state | JSON elements and text leaves | Registered node classes in editor state | Shared document projected into application DOM |
| Local change entry point used here | Transactions and Steps | Editor operations and change callback | Update listener and commands | Input handlers and `doc.edit()` |
| Native position | Document position and transaction mapping | Node path plus text-leaf offset | Node key plus point offset/type | Application path or sequence position |
| Persistent collaborative selection | Token anchors, converted to native positions | Token anchors, converted to current leaves | Token anchors, converted to current node keys | Token anchors resolved into visible DOM |
| Table representation used here | Visible cells; reference supplies covered cells | Full grid; renderer hides covered cells | Visible cells; NodeState retains covered cells | Full grid; renderer follows computed visibility |
| Remote display update used here | Changed-range transaction with mapped selection | Native tree reconstruction | Native tree reconstruction | Application-controlled projection and DOM reuse |
| Shared history authority | CRDT history | CRDT history | CRDT history | CRDT history |
| Application responsibilities | Schema rendering, plugins, toolbar and lifecycle | Renderers, inline/void behavior, UI and lifecycle | Node registration, plugins, codecs, UI and lifecycle | All native input, DOM, selection and lifecycle behavior |

For setup code, use [ProseMirror](./prosemirror), [Slate](./slate), [Lexical](./lexical) or [the shared editing API](./editing).

## How collaborative editing feels in this integration

The following assessment comes from our binding design and finite regression cases. It is an engineering assessment of the current integration. We have not run a comparative user study or established an editor latency ranking. All three bindings use the same convergence and history rules.

| Editor | Useful while editing with others | Where the current experience needs care | Assessment |
| --- | --- | --- | --- |
| ProseMirror | Changed-range transactions can preserve native state outside the changed area. Step mapping provides an explicit way to keep a selection attached while a peer edits. | Position conversion must include table spans and flattened groups. The comparison app's composition facade differs from default PM wiring. | Favorable for continuous shared text editing when transaction mapping and composition integration are complete. This is a design assessment, not a measured smoothness result. |
| Slate | A custom block/tree UI can closely follow the shared schema. Token anchors preserve forward/backward ranges even when formatting changes the text leaves. | Remote tree reconstruction needs selection restoration. The composing pane defers remote display until composition ends. Renderers and native normalization need application-level work. | Favorable for application-specific structured editing when that application owns the input and rendering details. The current binding requires more explicit care around display replacement. |
| Lexical | Registered commands and node classes let rich native interactions share one document. Token anchors and focus guards preserve editing context across remote root replacement. | Runtime node keys change after replacement. Native table transforms must agree with the shared projection; the former extra-column bug shows the consequence. Remote display is deferred in the composing pane. | Favorable for extensible rich editing with tested plugin and schema combinations. Native plugin behavior is an important part of collaboration acceptance. |
| Custom schema demo | Shared structure, token identities and concurrent intent are directly visible. Rendering can reuse unchanged DOM without a second editor model. | The application owns keyboard behavior, composition, native selection, table UI and accessibility. The current demo does not establish a finished Word-like user experience. | Useful for exploring document rules and building a tailored editor. It carries the largest application responsibility for a complete editing experience. |

For users, the important outcomes are stable input, a selection that remains attached to the intended text, no focus theft from a peer, predictable undo, and preserved content after a table merge. Passing model equality alone does not establish those outcomes. Our browser cases therefore check native input, DOM ranges, active focus and table geometry in addition to native/client/server models.

The remaining experience limits are explicit: real OS IME acceptance, larger-document input-to-screen targets and the full set of native commands still need their own evidence. A composing pane intentionally delays peer display until its draft completes; the live replica continues receiving updates. That tradeoff should be visible in application UX decisions.

## ProseMirror: preserve transaction meaning

ProseMirror uses immutable documents and transactions made of Steps. Step maps translate positions across document changes. Child indices, document positions and node-local offsets have different meanings. These are part of the [ProseMirror document and transform model](https://prosemirror.net/docs/guide/).

Our binding translates common text insertion/deletion, paragraph split/join and formatting directly into shared model commands. Other native changes go through model comparison and verification. This gives us an explicit point to preserve editing intent. For example, an Enter must remain a split at its observed boundary when another participant inserts trailing text.

A transaction can contain several Steps. Each Step must use its own before/after document and the matching shared model. Using the transaction's initial document for every Step produces stale positions. Remote application is tagged and excluded from native history so it does not return as another local change.

**Problem we solved: covered table text disappeared from comparison readback.** A native merged table contains no node for a covered cell. The converter needs the matching full model to reconstruct that cell. The comparison app omitted the reference. Supplying it restored equality; copying the complete covered cell also preserved its attributes. A nested attribute regression checks that modifying the returned model cannot modify the reference.

**Problem we solved: unchanged content still incurred conversion work.** The binding now reuses its model and native document for the same `Doc` object and version. Object identity matters: reset or a composition facade can replace a document without changing its version number.

The public PM binding and the composition-aware comparison app have distinct input wiring. The app uses an input-session facade. Its simulated composition results do not certify the default `/pm` input implementation or an OS keyboard.

Source and tests: [PM binding](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/pm/binding.ts), [conversion](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/pm/convert.ts), [cache regressions](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/pm-cache.test.ts) and [native command traces](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/pm-fuzz.ts).

## Slate: JSON trees still need precise coordinates

Slate represents content as JSON objects with element and text interfaces. Applications can add properties for their own document types. See [Slate interfaces](https://docs.slatejs.org/concepts/01-interfaces).

That structure lets our codec retain schema type names, attributes, nested flows and the full table grid. It also means that the binding and renderer must agree on inline elements, void elements and the empty text boundaries required by the native editor. The binding wraps `isInline`, `isVoid` and the change callback while preserving the application's previous hooks.

**Problem we solved: the caret moved after a remote edit.** A saved numeric offset became stale after a remote insertion. A saved path became stale after a split. Formatting split one text leaf into several leaves, so clamping the old leaf offset still selected the wrong position. The fix stores both selection ends as document token anchors, then reconstructs the current path and leaf offset. Tests include backward ranges and UTF-16 emoji offsets.

**Problem we solved: native normalization obscured move intent.** The binding recognizes native `move_node` updates as moves and verifies the resulting shared model. Mixed movement and other mutations in one update are rejected and restored. Separate native updates keep the intended move identifiable. This is a binding constraint; it does not add arbitrary text-range or table-axis moves to the shared API.

Remote display currently reconstructs the Slate tree. During composition, the binding keeps that display stable while the live client receives changes. The draft operations are committed on completion. The application should use one composition wiring method and one shared history authority.

Source and tests: [Slate binding](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/slate/binding.ts), [codec and coordinates](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/slate/codec.ts) and [binding regressions](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/slate-binding.test.ts).

## Lexical: native node identity and plugins matter

Lexical editor state contains the node tree and selection. Updates occur in a controlled read/write context; committed state is immutable. JSON serialization does not preserve runtime node keys or selection. See [Lexical editor state](https://lexical.dev/docs/concepts/editor-state).

Our schema builder registers native classes and schema nodes. NodeState retains schema identity, marks, attributes and cell-body information. The binding tags remote updates, maps selection through document tokens and avoids taking DOM focus from an inactive editor.

**Problem we solved: selection referred to detached keys.** Replacing a native root created new node keys. Restoring the old keys could not restore the selection. Token anchors now resolve into the current native tree. For a cross-container native move, retained native keys identify one reparented block. The destination container must already exist; several reparented blocks in one update are rejected.

**Problem we solved: merged tables gained extra columns.** The first representation kept every full-grid cell as a native cell and hid covered DOM cells. The native table plugin still counted those hidden nodes. Together with the owner's column span, they occupied duplicate coordinates, and the plugin padded the grid.

The corrected native table contains only visible cells. Table NodeState retains complete covered cells for serialization and readback. Logical column mapping skips positions covered by spans from earlier rows. Origin metadata remaps retained content when a native row or column is inserted before a merge. Native unmerge restores retained content into split cells and refreshes their metadata and presentation.

A codec-only roundtrip did not expose the extra-column bug. Tests with `registerTablePlugin` did. Native plugin transforms belong in integration tests whenever they can normalize the tree.

Source and tests: [Lexical binding](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/lexical/binding.ts), [conversion](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/lexical/convert.ts), [logical grid columns](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/lexical/grid.ts), [binding regressions](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/lexical-binding.test.ts) and [merged-grid regressions](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/merged-grid.test.ts).

## One table, several valid native representations

A merge changes visibility without discarding the covered cell's content:

```text
Shared full grid                  Visible Lexical / PM grid

A spans two columns | B covered   A spans two columns
C                   | D           C                   | D

Retained B: text + marks + nodes + attributes
Unmerge:   B becomes visible with its retained content
```

Slate keeps B in its native tree and hides it in the renderer. Lexical keeps B in serialized NodeState. PM reconstructs B from the matching full-model reference. These storage choices belong to the bindings. The shared merge and history rules are the same.

Our browser cases fill nine distinct cells, merge horizontally, vertically and across rectangles, then edit covered text from another actor. They check visible-cell counts, row/column spans, five native models, five client models and the server model. Undo/redo must preserve the foreign text, bold mark and background attribute. A second script restores forward/backward ranges in a visible cell after the covered columns and replaces the selected text with real native input.

Browser cases: [merged grids](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/checks-merged-grid.js) and [merged selections](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/checks-merged-selection.js).

## Shared lessons for any editor

| Failure | Why it happened here | Rule we now apply |
| --- | --- | --- |
| A remote update returned as another local edit | Native change listeners observed binding application | Tag or guard remote application; commit each local edit once |
| Composition removed a foreign insertion | A stale display was compared with the newer live model | Retain original draft operations and their token identities |
| Draft IDs collided after undo or reconnect | Live and draft clocks advanced independently | Reserve operation numbers in both documents, including update-only snapshots |
| Reset revived an old draft | Empty reset could produce no model-difference event | Cancel the input session from reset lifecycle events |
| Undo removed another actor's work | A whole native snapshot was treated as history | Use conditional CRDT history; preserve foreign writes |
| An inactive editor stole focus | Remote selection application updated DOM focus | Restore selections according to editor focus and native APIs |
| Error reporting prevented recovery | A throwing callback ran before the replacement update completed | Restore shared content before reporting the conversion error |
| Unmount left listeners behind | The binding removed too little or replaced another owner's hooks | Track owned registrations and restore hooks only while still owned |

The shared [input session and model translation](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/editor/index.ts) implement reusable parts of these rules. The [comparison input tests](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/test/input-session.test.mjs) exercise draft cancellation, clock reservation and coordinate conversion.

## The custom demo: input and rendering are application code

The schema demo exposes the shared document directly. This makes token identities, sequence boundaries and merge rules visible. It also leaves browser input, DOM selection, composition, rendering and cleanup to the application.

We reduced repeated paragraph reconstruction and reused unchanged paragraph DOM. Paint-related work remained separate from CRDT receipt. An application that owns its renderer must measure input, transport, peer receipt, DOM updates and rendering opportunity independently. A lower core receive time does not establish a lower input-to-screen time.

The same rule applies to every binding. PM can map a changed-range transaction; Slate and Lexical currently rebuild native trees for remote changes. Full model reads, native conversion and rendering can dominate even after a safe comparison window reduces event verification. The window limit counts top-level nodes, so it does not bound the size of a nested table or subtree.

See [performance evidence](../performance) for measured intervals, controls and remaining costs. Source: [custom editor](https://github.com/barocss/doc-sync/blob/main/apps/demo/ui/editor.ts).

## Reuse the tests, with their evidence limits

Start a new editor integration with distinct text in neighboring paragraphs and cells. Then repeat with identical paragraphs, where an accidental match can hide a path error. Test forward/backward selections, emoji, formatting leaf splits, remote input at the same boundary, native Enter/Backspace, movement, hidden cells, reset, reconnect and disposal. For history, interleave a foreign edit between the local action and its undo/redo.

Keep three checks separate: native state, the client document and the server document. Add DOM geometry and focus checks when native state can still render incorrectly. Run conversion tests with the same native plugins used by the application. Inspect returned assertions and browser errors as well as process exit codes.

The recorded integration includes 567 library tests, 31 compatibility unit tests and 340 Chrome checks. These are finite cases at their recorded source. Thirty browser operation traces within that count record operations and convergence; they are not OS IME acceptance. Simulated composition does not prove a real Korean keyboard session. Codec coverage also does not provide every keyboard gesture, native table command or custom plugin combination.

The [merged-grid report](https://github.com/barocss/doc-sync/tree/main/docs/reports/merged-grid-2026-10-24), [collaboration rules](../reference/collaboration-intent) and [status page](../status) describe the current proof boundaries. Use the framework guides for API setup and this guide when designing the binding's failure and regression cases.
