# Custom schemas and editor mappings

This checkpoint adds user-defined schema APIs without changing the existing
collaboration rules. All work remains local and uncommitted on the inherited
main checkout. There is no npm/Cargo publication, push or hosted deployment.
Earlier reports are immutable baseline records.

## Data and view contract

Define the replicated data schema once. Give each editor an independent view
mapping. Changing a native node name or renderer does not need to change the
shared descriptor. Existing tree `ui` data remains supported and identity-bound.
Removing it from an existing descriptor is a schema change.

- Tree `Schema` remains Document | Graphic; legacy document fingerprints stay
  compatible. No spreadsheet discriminator is forced through the tree engine.
- `createGraphicHelpers(schema)` binds custom container/text/atom objects to
  real IDs and ordinary Doc edits. Literal type names retain patch typing.
  Lookups traverse visible objects; destination checks can project the model.
  This is not an indexed object-port performance claim.
- `/editor` exports `inspectEditorSchema` and `inspectSpreadsheetSchema`.
  Missing feature handlers produce errors; opaque/preserve mappings produce
  warnings. Declarations do not install or test a renderer.
- Root exports experimental `SpreadsheetSchema`, validators, identity helpers
  and `SparseSheet`. The experiment path re-exports the same implementation.
  Custom scalar fields support defaults, bounds, choices and UTF-16 length.
  Defaults resolve without allocating storage. Null clears a register.
- Custom sheet operations/checkpoints bind to canonical schema identity and v2
  state. Omitting schema preserves exact legacy v1 behavior. Even an explicitly
  supplied default descriptor opts into v2. No live conversion is implied.
- Custom Tasks and Sensors profiles use separate data descriptors and view
  fields. VTable native cells edit the primary field; a typed inspector edits
  numeric, boolean and enum fields. The server binds a new room to a descriptor
  and identity and rejects mismatches before accepting mutations.

Public sheet APIs remain standalone. No Client/DocHub engine, public transport,
structural axis edit, formula calculation, GC or durable demo recovery is added.

## Editor and native integration

A custom Document fixture roundtrips through native ProseMirror, Slate and
Lexical states and generates Tiptap extensions. This is headless conversion
coverage, not four custom-document browser interfaces. ProseMirror/Tiptap now
reject normalized-name collisions and reserved native text names early.
Custom Graphic helpers validate the supplied descriptor and malformed content.

Native Rust now compiles owned runtime descriptors: Graphic container/text/atom,
flat Document root flow/text/atom, and a separate arbitrary sparse field registry.
The old six Document presets and Canvas/Builtins APIs remain available.
Nested document shapes, value marks, advanced rules, live schema transitions,
WASM/client factories and network adapters remain open. Unsupported descriptors
fail with a schema path before replica creation. The SDK README and checked
runtime_quickstart example provide Cargo usage.

Independent review found a numeric identity collision: distinct serde integer
defaults could hash to the same rounded JavaScript Number. Admission now rejects
integer tokens that are not exactly representable, throughout tree descriptors
including UI data. The regression covers unsafe signed/unsigned integers and
keeps representable values accepted. Scalar sheet values already use f64.

## Verification

| Check | Result | Boundary |
| --- | --- | --- |
| Workspace suites | 1,464 cases: 1,462 PASS, 2 expected SKIP, 0 FAIL after docs rerun | Core 1,059; Lexical 7; Slate 4; Bot 53; Demo 118; Docs 42; MCP 181 / 179 PASS |
| Final focused schema/editor/demo | 26/26 PASS | Includes custom field names that reuse legacy names with different types |
| Sparse experiment compatibility/custom | 23/23 PASS | Legacy 18 plus custom 5 |
| Root TypeScript | PASS | Final source, no emit |
| Package artifact consumers | PASS | Five packages and independent binding-consumer cases |
| Native SDK / shadow | 48/48 and 78/78 PASS | Legacy tests plus runtime admission/restart/precision cases |
| Native differential | PASS, 82 actions / 164 actor states | Six independent schemas, one native build/process |
| Final Chrome default / custom profiles | 21/21 and 29/29 PASS | Exact same emitted bundle |
| Docs build/link/English checks | PASS, 51 pages / 2,346 links | Local build, not deployed Pages |
| Chrome docs smoke | 3 routes PASS | Correct categories, no page/console errors |

The first full workspace run passed every non-doc suite but failed one obsolete
navigation expectation. The expected new route was added; all 42 docs tests
then passed. Passing unaffected suites are reused. The full original failed
invocation is retained beside the final per-scope logs. Early browser failures
were harness overwrite-selection assumptions with nonempty defaults; attempts
are retained. Trusted Home then Shift+End selects the native input correctly.

Tree differential comparison normalizes models and compares History availability;
it does not qualify exact cross-runtime tree operations or transport. Invalid
Document operation comparison uses the TypeScript Doc.check preflight, because
raw Doc.edit does not supply that validation. Sheet comparison includes exact
operations, models, stats, pending queues, journal, History and checkpoints.

Chrome custom proof covers typed native input/inspector, independent actors and
both VTable projections, foreign-field/draft preservation, own undo/redo,
offline pending/reconnect, schema mismatch rejection, and zero full-range reads
in normal refresh. Screenshots were visually inspected. No physical paint or
GPU completion measurement is claimed.

## Performance observation

Final bundle SHA-256:
`172f710a0c70b4980283d27ec27a56eb1ab243af482ccf8cfbe4fc48eb576095`.

| Populated cells | Sparse edit p95 ms | Peer convergence p95 ms | Maximum view CPU p95 ms |
| --- | --- | --- | --- |
| 0 | 0.2 | 18.2 | 3.6 |
| 1,000 | 0.2 | 18.9 | 4.1 |
| 10,000 | 0.1 | 18.8 | 4.2 |

Chrome 156, Apple M3 Max, 1720 × 1080, fixed 100 × 26 viewport, fresh room and
browser per size, three warmups and ten samples. Point edits use application
actions; trusted native input is tested separately. Full sparse equality and
Node HTTP oracle run outside timing. This is a current default-profile
regression observation, not a paired speedup against the earlier 26.8 ms result.
Custom-profile large histories, WAN and 100k populated cells are not qualified.

## Run and evidence

```sh
npm ci
npm run build
npm run dev:spreadsheet
# Open /?profile=tasks&room=task-example or /?profile=sensors&room=sensor-example
node experiments/runtime-schema-native/compare.mjs
```

Use a distinct room for another descriptor. The memory-only demo cannot restore
pending work after reload/server death and cannot switch a live schema.
Existing user tabs/services and original History/pending work remain untouched.
New isolated proof services are at 58545 (exec65788) and 62675 (exec10133).
Use a fresh room when viewing these profiles. No live migration is performed.

`evidence/` contains compressed raw receipts, logs and screenshots, including
failed attempts. `source-seal.json` binds relevant source/test/docs and final
bundle to this checkpoint. `evidence-index.json` hashes the archived files.
Run commands and exact proof boundaries are also in HANDOFF §5.121.
