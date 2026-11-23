# JavaScript array storage

## Findings

Chrome's V8 engine does not normally implement dense JavaScript arrays as linked
lists. Object elements use an indexed backing store; sparse arrays can use a
dictionary. Representation can change, so JavaScript syntax alone does not prove
the storage layout. See the primary [V8 element representation documentation](https://chromium.googlesource.com/v8/v8/+/main/docs/objects/fields-and-elements.md)
and [elements-kind explanation](https://v8.dev/blog/elements-kinds).

The TypeScript CRDT stores each internal sequence in `Line.items: Item[]`.
The main sequence can contain many paragraphs, their markers and tombstones.
Container bodies and table slots use other sequences. `KeyIndex` separately
maps logical IDs to Items. An Item's `origin` records insertion ancestry; it is
not a next/previous linked-list pointer.

`Doc.integrate` uses an origin/hint and position lookup, resolves CRDT ordering,
then calls `items.splice`. `Doc.indexOf` is a custom cached position lookup,
not `Array.prototype.indexOf`. A displaced cache scans a bounded insertion-drift
window; an old cache can rebuild positions for the sequence. Other code also
contains actual `block.chars.indexOf` searches. These costs must be distinguished.

The [V8 splice implementation](https://chromium.googlesource.com/v8/v8/+/main/src/builtins/array-splice.tq)
moves the suffix on its fast path and can grow/copy the backing store. For object
arrays this moves references, rather than cloning every Item object. A dense
array's indexed access and a middle insertion are different operations.

## Actual document inspection

An isolated Node 24.22.1 / V8 13.6.233.17-node.58 diagnostic inspected a real
100,000-character Doc. Before and after one middle insertion its items array
reported fast object elements, no holes and no dictionary elements. A synthetic
million-object dense array had the same representation. A sparse control with
one assignment at index 10,000,000 used dictionary elements.

These are Node internal diagnostics using `--allow-natives-syntax`. Chrome's
internal elements kind was not inspected. The current V8 source links above
are not pinned to Chrome 156's exact revision.

## Bounded Chrome experiment

Google Chrome 156.0.8078.74 ran a synthetic object-array benchmark in an isolated
session. Allocation was outside timing; results contributed to a consumed
checksum. Each condition used three warmups and eleven observations. Direct
access used one million reads per observation. Search/splice batches were
smaller for larger arrays.

| Array length | Random indexed read, median ns/read | Existing-object indexOf, median ns/search | Middle insert/remove, median us/pair |
| ---: | ---: | ---: | ---: |
| 10,000 | 1.6 | 439 | 7.3 |
| 100,000 | 1.8 | 3,809 | 72.3 |
| 1,000,000 | 8.4 | 39,063 | 69.5 |

The nanosecond values are batch-derived estimates, not individual timer readings.
The operations have different semantics. Their values are not interchangeable
editor latency results. Small-sample p95 is the maximum of eleven observations.
Array sizes ran in increasing order; independent processes and crossed order
were not tested. Splice's non-monotonic values prevent a scaling claim from this
one run. A separate hand-built linked-list traversal was only a locating-node
control, not a fair complete-editor comparison.

Larger arrays can cost more through memory access, representation changes,
search and movement. This experiment does not attribute the random-read increase
to a particular cache level or prove asymptotic complexity from timings. It does
not support the claim that dense indexed reads traverse a linked list.

## Engineering consequence

Do not replace the arrays solely on that claim. First profile actual editing:
position-cache hits, drift scans and reindexing; CRDT order resolution; suffix
movement; and model/DOM work. Large middle pastes can repeat a splice per UTF-16
unit, which merits a separate batch/chunk-storage experiment. Any replacement
must retain IDs, origins, ordering, tombstones, anchors, hidden contents, GC and
History ownership.

Rust shadow tokens also use Vec storage. The Gap benchmark is a separate storage
experiment, not the current CRDT kernel. D1 does not change either storage
structure.

Raw observations, helpers, a Korean report, source snapshots and hashes are in
the ignored `output/array-storage-investigation` directory. `node-kind.mjs` can
be run with Node 24 and `--allow-natives-syntax`; `browser-bench.js` is the Chrome
workload. This investigation changes no production storage and does not qualify
end-to-end editor performance.
