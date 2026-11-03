# Document and graphic schema verification

Base HEAD is `d624a56d7ea5389fd9f67d1277637838bb343475`. This uncommitted candidate
includes the preceding five-package and actor-profile work. The earlier source
seal is preserved under `../five-package-migration-2026-11-03/`; the new
`source-seal.json` records this candidate. `validation.json` lists compressed
receipt hashes and the changed baseline files.

`Schema` remains the common input. An omitted domain means document;
`DocumentSchema` permits an explicit document marker with the same identity.
`GraphicSchema` requires a graphic domain and an empty-capable container root.
Frames and object groups use stored containers. The computed document `group`
and document default paragraphs keep their existing meaning.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Fresh full workspace | 1,401 cases: 1,399 PASS, two platform SKIPs, zero FAIL | One coordinated `npm test`, including its final five-package prebuild. |
| Consolidated core | 1,031/1,031 PASS | Previous 959 cases plus 72 new regressions. |
| New domain/graphic regressions | 72/72 PASS | 31 model/state/sync, seven schema-domain, five capability, 29 text-binding rejection cases. |
| Docs | 37/37 PASS | Includes the executable public graphic Client example. |
| Compatibility app | 33/33 PASS | Existing comparison app tests with current binding artifacts. |
| Root type check | PASS | Final source and declarations. |
| Packed consumers | Seven cases PASS, five tarballs | Public domain types, empty graphic client, reparent/history/local reopen, matched hub capability; existing independent binding consumers and patch case. |
| Changesets rehearsal | PASS | Temporary-copy first versions and independent Slate patch; checkout versions and lock unchanged. |
| Documentation build | 46 pages, 2,134 links PASS | English and local-path checks pass. |
| Independent reviews | APPROVE | Schema/security, functional completeness, and Sol High CRDT intent review. |

The graphic regressions exercise empty roots/frames/groups, first and last
object deletion, text/inline/flow content, lists inside text boxes, scalar and
field edits, ordering/reparenting, concurrent insertion and cycle resolution,
selective undo/redo, split against peer reparent, deleted labels against peer
typing, bounded reads and stable IDs, snapshots, local saved state, pending
sync state, recovery receipts, and GC. Invalid new schema combinations, causal
birth facts, unowned text, and mixed edit batches fail without partial mutation.

Review found and fixed graphic-specific failures: deleted-label cache leakage,
computed-list admission, split/merge and atom insertion losing original tails,
implicit relocation during split, and newborn-placement ranking on redo.
Graphic schemas use logical placement projection from the start. Original
objects are not moved merely to activate that projection. The first placement
of a newly born graphic node stays part of its birth; later explicit movements
remain separate History steps. This History exception does not change the
legacy document branch. Exact insertion order and existing tail order pass the
final regressions.

The independent Sol High review also ran source-only four-scenario concurrency
checks in all six delivery orders, snapshot/GC roundtrips, per-actor undo/redo,
rank after prior movement, and multiple later explicit moves. These observations
are additional review evidence, not extra committed suite cases.

Protocol 3 and the four document capabilities remain unchanged. Graphic peers
require the additional `containers-v1` token and a verified matching schema.
Capability failure occurs before snapshot replacement and preserves pending
edits. Domain conversion is incompatible. Text binding builders, converters,
position/selection helpers and constructors reject graphic schemas before
native/session work, including caller-supplied schema info paths.

This is headless library/model/sync support. It does not provide a canvas
renderer, hit testing, drag tools, transform math, or graphic browser acceptance.
Root graphic attributes and container defaults/childRules are rejected. Stored
object properties use existing attribute/field rules. Editing still takes model
paths; stored `blockId` values remain stable through movement and history, but a
direct ID-based edit API is not implemented.

The existing merge/reparent rule is retained: an explicit text merge can display
joined text with the receiving text object while retaining a concurrent move's
placement, so the former destination frame can be empty. No new move-wins policy
is introduced. Graphic edits preflight complete batches; large-scene throughput
has not been measured. New timing, paint, OS IME, live Codex, real-process graphic
restart, Rust differential, and remote deployment checks are **NOT_RUN**. Previous
timing investigation flags remain open. No commit, push, or npm publication was
performed in the source checkout.
