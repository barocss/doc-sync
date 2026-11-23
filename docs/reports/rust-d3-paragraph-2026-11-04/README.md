# Nested paragraph command compilation

This report qualifies the bounded native model-path paragraph compiler against
TypeScript with the complete original Word and Presentation schema registries.
It closes the tracked first/middle/required-end paragraph differences. It does
not close the whole D3 command compiler or production Rust/WASM delivery.

The opening state is main `1cfb7a2` plus inherited uncommitted work. A 225-file
opening snapshot, a preserved old native executable and 12 earlier report seals
separate inherited behavior from this change. The original public schema source
and unpruned Word23/Presentation27 snapshots remain unchanged.

## Behavior changes

The TypeScript compiler now resolves structured fields from a pending node birth
or type change in the same batch. A fresh slide paragraph previously emitted a
coarse `style:null` operation that failed its pre-edit wire validator. It now
emits the supported leaf resets. Existing valid Word default-reset operations,
reserved tickets and explicit same-value writer ownership stay unchanged.
The validator has not been weakened. The before/after compiler receipt preserves
both old failures and the unchanged valid Word operation sequences.

A child gap after an automatically required sibling was a second issue. Its
private storage could accept a valid paragraph batch while the paragraph text
was absent from the visible model. The compiler now creates a real paragraph
in detached storage, then places that new paragraph at the logical child gap.
Only nodes born in that transaction receive compiler placement writes. Multiple
paragraphs chain their independent placements. Detached, non-automatic physical
stubs no longer define the base order of required-tail children in either engine.

An earlier automatic-head fill route failed complete structural undo. A second
route wrote a no-op placement to the existing head; it could overwrite B's
concurrent lower-clock placement. Both routes were rejected. Their diagnostic
artifacts remain. The final compiler leaves existing head placement writers
unchanged.

The adversarial Presentation test also exposed a native model serialization gap.
After B moves the original nonempty title behind notes, both raw block lists are
`[notes,title]`. TypeScript prepends a synthetic default title and then applies
`max:1`. Native now performs the same model-only stages. The retained original
title, its `HEAD😀` tokens and B's placement writer remain in storage. Schema
cardinality can hide overflow in the canonical model; this is the existing TS
rule, not stored-content deletion. The fix excludes private required storage,
legacy/graphic paths and non-flow containers. Grouped defaults, empty group
attribute omission and `max:0` received separate review and regression coverage.

## Native API

`RuntimeDocument::insert_paragraph_at(&[1,0], model, options, now_ms)` inserts a
text-shaped model node at a child path. `insert_model_at` also accepts supported
flow/text trees. Each method compiles on detached native state, validates the
candidate, and records once on the original document. A rejected input preserves
the original checkpoint, clock, History and pending changes. Existing
`insert_block_in` keeps its explicit physical-source contract.

The runnable program is
`experiments/rust-sdk/examples/runtime_paragraph.rs`. The SDK README and public
Rust guide contain the complete program. Both code fences were extracted into
independent consumers and compiled against the current local SDK.

The API deliberately rejects group/grid model nodes or parents, text-offset
paths, pre-existing movement records, supplied mixed structured attribute maps,
trailing reserved tickets without a final wire operation, and schema reference
handles in model JSON. It can create a new placement at a required end; this is
not support for later model-path compilation in an already moved document.
Malformed model attributes can be sanitized by TS while this native API rejects
them. Those boundaries are recorded separately, not counted as equal rejection.

## Qualification

The authoritative receipt paths and source hashes are in `final-checks.json`.
The selected evidence packet includes full qualified traces as lossless gzip
with SHA-256 restoration maps, source snapshots and preserved failed diagnostics.
`manifest.json` lists the selected files and exclusions. `seal.json` binds the
report, checks, manifest and archive; the archive is read back and verified.

- Original Word and Presentation: **10 profiles / 466 actions / 932 actor
  states**, including **72 staged logical Doc.edit authorings** and **18 raw
  Doc.emit authorings**. Fifty-six actual rejection commands remain distinct
  from schema admission. Both foreign-head profiles check all six `HEAD😀`
  UTF-16 tokens and B's exact placement writer through undo, own checkpoint,
  redo and retries. Requested paragraph content, attributes and child position
  have independent semantic assertions.
- Exact authored ticket order, operations, full History, pending batches,
  clocks, token/register/deletion state and movement ledgers are compared.
  Document-model text strings are represented as UTF-16 units; absent empty
  model fields and listed derived empty storage representations are normalized.
  No ticket, writer or History normalization hides a compiler mismatch.
- Native core: **189 PASS**. Native SDK: **129 PASS**, including nine new
  paragraph tests. The new example and two independent documentation consumers
  pass. Source maps remain equal before and after the qualifying commands.
- Complete workspace `npm test`: **2,133 tests / 2,131 PASS / two expected
  platform SKIPs / zero FAIL / zero cancelled**. The skipped unsafe-platform
  and Linux-helper lock cases are explicit in the log. Final TS sources retain
  the hashes used by this run. Native-only serialization changes do not alter
  that workspace qualification.
- Typecheck, documentation build and documentation checks pass: **55 pages /
  2,654 internal links**, English content and local-path exclusion checks pass.

The inherited regression receipts qualify the unchanged unused84 and textfalse90
corpora, schema export and admission oracles against current native code. Narrow
adapters change only output destinations; original sources and expectations stay
unchanged. Two historical probes are explicitly excluded: one asserts the
now-fixed invalid slide style reset; the other expects rejection of unused
Word/Presentation declarations that D2 already supports. Old receipts remain
historical and are not rewritten to say PASS on new code.

The initial main comparison failures, input-boundary differences, rejected
required-gap routes and serialization diagnosis are preserved separately from
the final passing run. A temporary cross-profile text assertion in the harness
was corrected by limiting it to profiles that author that text. The final
foreign-head profiles seed nonempty content and retain their own independent
raw-token oracle. No production change is inferred from that harness correction.

## Remaining scope

This is a bounded D3 paragraph slice. General insert/delete/update/split/merge/
move command equivalence, model insertion after existing moves, grid/group
construction and full product authoring remain open. Direct `Doc.edit` is not
newly guaranteed transactional: negative TS edits in this comparison compile
on a clone, then check against the original pre-edit document.

Checkpoint tests restore each runtime's own schema, actor, state, pending
operations and History. They do not qualify cross-runtime checkpoint exchange,
protected GC, production process/server restart, network delivery or mixed
runtime wire interoperability. No Chrome, mobile, WASM integration or performance
benchmark was run. No commit, push, deployment or registry publication is included.
