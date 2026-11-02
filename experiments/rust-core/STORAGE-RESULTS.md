# Safe UTF-16 storage comparison: R2 evidence

This report separates native Rust storage measurements from the independent
JavaScript and WASM comparison. `TextTape` uses `Vec::splice`; `GapTape` uses
a safe Rust gap buffer. The [roadmap](../../docs/rust-roadmap.md) defines the
R2 gate. **The declared bounded R2 storage comparison gate passed** with native,
Node 24, and Chrome evidence. The production TypeScript server and client
remain unchanged.

## Native conditions

The local run used Homebrew Rust 1.87 on aarch64, release LTO, 100,000 initial
UTF-16 units, 10,000 edits, seed `305419896`, and seven timed samples after one
warm-up per implementation. Implementation order alternated between samples.
Trace construction and correctness checks were outside the timed intervals.
Both implementations received the same operations and their complete final
vectors matched in every sample. Raw phase arrays are in
[storage-comparison-native.jsonl](storage-comparison-native.jsonl).

Construction includes an input copy. Materialization copies the full result to
a fresh vector for both implementations. Destruction is outside these timers.
The construction phase does not isolate allocator cost. No JS/WASM calls,
text transfer, editor, transport, or CRDT work is measured.

## Native results

All values below are medians in milliseconds. The edit interval covers the
whole 10,000-edit batch, not one edit.

| Trace | Vec construction | Gap construction | Vec edits | Gap edits | Vec materialization | Gap materialization |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cursor local | 0.003583 | 0.003458 | 10.203625 | 0.144333 | 0.020917 | 0.014084 |
| Far jump | 0.003375 | 0.003000 | 13.737791 | 7.875500 | 0.003125 | 0.003000 |
| Alternating ends | 0.003541 | 0.004167 | 17.584583 | 27.428667 | 0.008000 | 0.004291 |

The gap buffer was faster for local edits and this random far-jump trace. It
was slower when edits alternated between document ends. These results do not
establish a general storage or engine improvement. The buffer contained
100,064 initialized storage units at the measured endpoints. This count is
not allocated capacity, peak memory, or process RSS.

The local trace moves near its previous cursor. The far-jump trace selects
positions across the document. The alternating-ends trace moves between the
start and end. All alternate replacing one unit with three and three with one;
the document ends at 100,000 units. Read `src/storage_trace.rs` for the exact
position rules. These workloads do not represent all edit-size distributions.

## Native correctness and checks

The four new native storage tests passed with the four existing Rust unit
tests. The new tests compare complete Vec/Gap state after each of 59,000
operations: 54,000 trace operations across sizes, seeds and position patterns,
and 5,000 varying growth/shrink operations. Separate cases check invalid-range
atomicity, empty boundaries, gap growth, and surrogate units. This comparison
uses the existing Rust vector implementation as the reference. The separate
JavaScript/WASM check below supplies the independent string oracle.

Format and Clippy checks passed. The first plain release-test command failed
because the existing release profile sets `panic = "abort"`. The release test
run then passed all eight tests with an invocation-local override:

```sh
CARGO_PROFILE_RELEASE_PANIC=unwind cargo test --offline --release
cargo run --offline --release --bin storage-compare -- 10000 7 100000
```

These native timings are the original source-bound local results. The added
WASM adapter does not change the native benchmark. R1's older WASM batch was
slower than JavaScript; R2 does not replace that result.


## Independent JavaScript and WASM comparison

The Node 24.22.1 run passed 30,538 validation operations with complete UTF-16
state comparison after every operation for both WASM backends. The independent
oracle uses JavaScript string slices. The receipt reports 29 invalid cases.
It includes empty and end edits, isolated surrogates, random edits,
growth/shrink, invalid-range atomicity, detached input, and clear/reinitialize
checks. An explicit WASM memory growth detached the old memory buffer; later
edits and reads still matched. The three 10,000-edit traces also matched the
saved native final hashes: local `1250648887`, far jump `3733865730`, and
alternating ends `971030360`. Hash agreement supplements the complete-state
checks; it does not replace them.

Review found a wrapper bounds defect when the shared typed-array `length`
getter changed after import. The wrapper now captures intrinsic accessors and
copies input using the captured primitive length. Regressions check altered
prototype and own getters, oversized input with a false length, rejected
coercion, and detached buffers. Invalid init/edit operations preserve text.
The final receipts supersede earlier runs from before these fixes.

The benchmark uses the native trace seed, input size, and edit counts: seed
`305419896`, 100,000 initial code units, and 10,000 edits per workload. Each
implementation has one warm-up and seven measured samples. Sample order
cycles through all six implementation permutations, then repeats the first.
All timed final results match the independent oracle. Raw construction, edit,
and materialization arrays are retained in
[receipt-storage-node24-r2.json](receipt-storage-node24-r2.json).

The JavaScript candidate uses immutable UTF-16 strings. This differs from
R1's fixed-capacity `Uint16Array` candidate. WASM Vec and Gap use the same
per-edit wrapper. Construction includes input conversion/copy and storage
initialization. WASM edit batches include JavaScript validation, input copy,
and ABI calls on every operation. JavaScript edit batches include string
replacement and insertion conversion. Full materialization returns a fresh
`Uint16Array`; WASM copies into shared output scratch and then into JavaScript.
Trace generation, correctness checks, hashing, and disposal are outside the
timers. Module loading and compilation are excluded. These intervals do not
isolate allocator cost, storage cost, or ABI overhead.

### Node 24 phase medians

All values are milliseconds. Edits cover the complete 10,000-edit batch.

| Trace | Implementation | Construction | Edits | Materialization |
| --- | --- | ---: | ---: | ---: |
| Cursor local | JavaScript string | 1.597 | 267.339 | 2.588 |
| Cursor local | WASM Vec | 0.025 | 59.062 | 0.029 |
| Cursor local | WASM Gap | 0.025 | 1.235 | 0.031 |
| Far jump | JavaScript string | 1.573 | 272.150 | 2.516 |
| Far jump | WASM Vec | 0.026 | 71.707 | 0.027 |
| Far jump | WASM Gap | 0.025 | 48.223 | 0.030 |
| Alternating ends | JavaScript string | 1.546 | 259.388 | 2.555 |
| Alternating ends | WASM Vec | 0.026 | 73.219 | 0.030 |
| Alternating ends | WASM Gap | 0.026 | 145.448 | 0.028 |


### Chrome phase medians

Actual Headless Chrome 156 passed the same 30,538 validation operations and
29 invalid cases, with complete state checks for both WASM backends and all
three native trace hashes matching. The final source manifest was unchanged
across the run. Raw arrays are in
[receipt-storage-chrome-r2.json](receipt-storage-chrome-r2.json). The original
browser capture is `output/validation/r2-storage-20261101/chrome-final.json`.
Source and artifact hashes are in [receipt-storage-source-r2.json](receipt-storage-source-r2.json).

| Trace | Implementation | Construction | Edits | Materialization |
| --- | --- | ---: | ---: | ---: |
| Cursor local | JavaScript string | 1.5 | 58.9 | 2.1 |
| Cursor local | WASM Vec | 0.0 | 58.4 | 0.0 |
| Cursor local | WASM Gap | 0.0 | 1.1 | 0.1 |
| Far jump | JavaScript string | 1.4 | 61.6 | 2.1 |
| Far jump | WASM Vec | 0.0 | 70.9 | 0.0 |
| Far jump | WASM Gap | 0.0 | 47.4 | 0.0 |
| Alternating ends | JavaScript string | 1.5 | 62.9 | 2.2 |
| Alternating ends | WASM Vec | 0.0 | 71.6 | 0.0 |
| Alternating ends | WASM Gap | 0.0 | 143.4 | 0.1 |

Short Chrome phases are limited by timer resolution. A recorded `0.0` does
not mean zero cost. Startup and compilation are not timed here. Node and
Chrome results differ substantially, so one runtime does not predict another.

## Decision and limits

The declared bounded R2 storage comparison gate passed. Eleven current native
tests and the offline WASM release build passed. The original eight-test
native benchmark receipt, format/Clippy checks, and release-test override
remain historical; they are not new checks of the final adapter. The added
adapter supplies three further tests. The existing TypeScript core
regression suite passed 720 tests. This is regression evidence for the current
TypeScript engine, not Rust CRDT equivalence.

Gap improved the measured local-edit workloads. It regressed against Vec on
alternating ends in native Rust, Node WASM, and Chrome WASM. In Chrome, Vec was
also slower than the JavaScript string candidate on far-jump and
alternating-end edits; Gap was slower than that candidate on alternating
ends. Construction and full reads have separate costs. These results do not
support a blanket storage replacement or a production speedup.

The adapter limits logical text and each scratch buffer to 1,048,576 UTF-16
units. It reserves two scratch buffers of 2 MiB each for the instance lifetime.
This bound and WASM linear-memory growth are not allocated storage capacity,
peak memory, retained allocator memory, or process RSS measurements. No
comparable process-memory acceptance is established.

Full CRDT semantics, production Rust server/client adapters, real editor input
latency, and production acceptance remain **NOT_RUN**. R3 has its own partial
bridge evidence and acceptance gate. No commit, push, or publication is
established by this report.


## Same-algorithm follow-up: JavaScript Gap versus Rust WASM Gap

This section adds a new comparison. The earlier native and string/Vec/Gap
results and their receipts remain historical evidence for their original
sources and workloads. This follow-up asks whether the observed storage gain
requires Rust when JavaScript uses the same gap algorithm.

Both implementations start with 64 initialized gap units, move the gap with
overlapping copies, delete before growth, and add
`max(required - gap, floor(logicalLength / 2), 64)` initialized units when needed.
Both receive prepared `Uint16Array` inputs and return a fresh contiguous output
array. JavaScript growth allocates a new array; Rust `Vec` can reuse capacity.
This difference prevents an allocator-equivalence claim.

The comparison uses 100,000 initial UTF-16 units, 10,000 edits per trace,
seeds `305419896` and `192837465`, one warm-up per implementation, and seven
samples per seed/trace pair. Runtime order alternates. The workloads are the
same local, far-jump, and alternating-end traces used by R2. Trace preparation,
oracle checks, hashing, disposal, and WASM instantiation are not timed.
Construction includes the input copy. Edits and fresh-output materialization
have separate timers. The pipeline is their sum for each sample; its median
is computed from these sums, not by adding phase medians.

The WASM path includes JavaScript validation, input scratch copies, per-edit
ABI calls, the Rust mutex, output scratch work, and a fresh output copy. This
is a practical API-inclusive comparison, not a causal measurement of the Rust
language alone. It does not isolate pure Rust execution, ABI, or allocator cost.

### Node 24 results

[Node receipt](receipt-gap-node24-r3.json): Node v24.22.1, macOS arm64.
The suite passed 60,033 operations with complete state comparison after every
operation, including 19 invalid operations. Six seed/trace pairs passed.
Fresh-read isolation and memory-view refresh after explicit growth passed.
The separate JavaScript suite passed 4,062 assertions, including 4,000 oracle
operations. Timed steady traces do not measure growth performance.

All times below are medians in milliseconds. `Total` is the paired pipeline.

| Seed | Trace | Runtime | Construction | Edits | Fresh output | Total |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 305419896 | cursor-local | JS Gap | 0.016 | 1.071 | 0.015 | 1.114 |
| 305419896 | cursor-local | WASM Gap | 0.020 | 1.218 | 0.029 | 1.268 |
| 305419896 | far-jump | JS Gap | 0.019 | 9.967 | 0.021 | 9.994 |
| 305419896 | far-jump | WASM Gap | 0.023 | 48.328 | 0.037 | 48.394 |
| 305419896 | alternating-ends | JS Gap | 0.017 | 29.568 | 0.024 | 29.617 |
| 305419896 | alternating-ends | WASM Gap | 0.026 | 142.938 | 0.037 | 143.017 |
| 192837465 | cursor-local | JS Gap | 0.014 | 0.943 | 0.018 | 0.973 |
| 192837465 | cursor-local | WASM Gap | 0.022 | 1.116 | 0.028 | 1.164 |
| 192837465 | far-jump | JS Gap | 0.013 | 9.427 | 0.012 | 9.453 |
| 192837465 | far-jump | WASM Gap | 0.023 | 48.262 | 0.036 | 48.313 |
| 192837465 | alternating-ends | JS Gap | 0.020 | 29.646 | 0.025 | 29.706 |
| 192837465 | alternating-ends | WASM Gap | 0.025 | 145.744 | 0.040 | 145.810 |

WASM Gap was slower than JS Gap for edits and the total in every measured
Node seed/trace pair. The earlier comparison against a JavaScript string
candidate therefore does not establish an intrinsic Rust advantage.


### Chrome 156 results

[Chrome receipt](receipt-gap-chrome-r3.json): actual Headless Chrome
156.0.0.0 on the same host. The raw browser capture is
`output/validation/same-gap-20261101/chrome-final.json`. Chrome passed the same
60,033 complete-state operations and 19 invalid operations. Node and Chrome
receipts match the source and WASM SHA-256 hashes checked before and after
browser execution. The standalone JavaScript checks and the independent
algorithm audit add finite evidence; they do not prove all possible histories.

All times below are medians in milliseconds. Chrome timer rounding produces
some `0.000` phase medians; these do not mean zero cost.

| Seed | Trace | Runtime | Construction | Edits | Fresh output | Total |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 305419896 | cursor-local | JS Gap | 0.000 | 0.900 | 0.000 | 0.900 |
| 305419896 | cursor-local | WASM Gap | 0.000 | 1.100 | 0.100 | 1.200 |
| 305419896 | far-jump | JS Gap | 0.100 | 9.100 | 0.000 | 9.200 |
| 305419896 | far-jump | WASM Gap | 0.000 | 47.500 | 0.000 | 47.700 |
| 305419896 | alternating-ends | JS Gap | 0.000 | 28.300 | 0.000 | 28.300 |
| 305419896 | alternating-ends | WASM Gap | 0.000 | 142.800 | 0.000 | 142.800 |
| 192837465 | cursor-local | JS Gap | 0.000 | 0.900 | 0.000 | 0.900 |
| 192837465 | cursor-local | WASM Gap | 0.000 | 1.100 | 0.000 | 1.100 |
| 192837465 | far-jump | JS Gap | 0.000 | 8.700 | 0.000 | 8.800 |
| 192837465 | far-jump | WASM Gap | 0.000 | 46.800 | 0.100 | 46.900 |
| 192837465 | alternating-ends | JS Gap | 0.000 | 28.700 | 0.000 | 28.700 |
| 192837465 | alternating-ends | WASM Gap | 0.000 | 143.700 | 0.000 | 143.800 |

WASM edit and total medians were higher for every Chrome seed/trace pair.
The first local trace had one WASM total below the paired JS sample out of
seven; the other five pairs had none. The conclusion concerns the measured
medians and practical API path, not a claim that every sample is slower.
Far-jump and alternating-end regressions remain large. Construction and fresh
output are small relative to those edit batches, but retain separate costs.

### Assessment and remaining limits

The practical current Rust WASM path has no measured performance gain over
JavaScript Gap in these Node and Chrome workloads. The earlier gain against a
JavaScript string candidate cannot be assigned to Rust itself: JavaScript can
use the same gap algorithm. Current measurements do not provide a performance
justification for production migration. The formal R6 decision is pending.

This result does not establish a pure language effect or a native Rust/server
ranking. It includes wrapper validation, copies, calls, mutex work, and runtime
and allocator differences. A storage algorithm benefit and a language benefit
are separate claims. These steady traces retain 100,064 initialized storage
units; growth is covered by correctness checks, not timed growth workloads.
The Rust initialized length follows from the shared algorithm and is not
read directly from Rust storage. Each of the two WASM scratch buffers retains
1,048,576 units. Initialized lengths, scratch bounds, and linear-memory growth
are not allocator capacity, peak allocation, retained memory, JavaScript heap,
or process RSS measurements.

Production TypeScript code was not changed by this follow-up. Its earlier
720-test result remains historical and was not rerun for this comparison.
Full CRDT semantics, production adapters, actual editor latency, and production
acceptance remain **NOT_RUN**. R4 semantic exploration remains planned; R5 and
R6 need separate integration and product evidence. R3's separate bounded
boundary and lifetime gate has passed. No commit, push, publication, or
production replacement is established here.

## No-WASM follow-up: native Rust Gap versus Node.js Gap

The earlier receipts remain historical evidence. This follow-up uses native
Rust and Node.js directly, with no WASM. The final
[native receipt](receipt-native-gap-node24-r1.json) is PASS. It records Node
v24.22.1, macOS arm64, Apple M3 Max, and 14 logical CPUs. The build used rustup
Rust 1.86.0 with release LTO, one codegen unit, and `panic=abort`. Ambient
Homebrew Rust 1.87.0 was not the build compiler. An earlier run had incomplete
compiler attribution; the corrected final run supplies the results below.

### Conditions and correctness

Both runtimes use the same gap algorithm and binary trace bytes. Construction
copies the initial UTF-16 input, edits use prepared arrays, and a read returns
a fresh contiguous array. The initial gap has 64 initialized units; movement
uses overlapping copy and deletion precedes growth. Growth adds
`max(required - gap, floor(postDeleteLength / 2), 64)` initialized units.
Rust Vec capacity and JavaScript typed-array allocation can still differ.

Two seeds and three traces each use 100,000 initial units and 10,000 edits.
Seven paired samples alternate runtime order. Each runtime/sample starts a
fresh process and performs five complete untimed warm-ups before measurement.
Only one runtime is measured at a time. External machine load is uncontrolled.
Startup, trace parsing, JSON, IPC, oracle checks, hashing, and release are
excluded. Construction, edits, and fresh output have separate timers. Pipeline
is their sum per sample; its median is not a sum of phase medians.

The independent JavaScript string oracle passed 24,009 operations against both
runtimes, comparing every UTF-16 unit after each operation and checking status
and initialized storage growth parity. Six 4,000-edit traces start with 128
units; nine additional cases cover rejection and growth. Four operations were
rejected with unchanged state. All 84 measured final outputs passed full-state
checks, as did all twelve memory-run outputs. This is finite storage evidence;
it does not validate CRDT semantics. Source and binary hashes were unchanged
before and after the final run; the independent receipt integrity audit passed.
The final native regression run passed all 13 tests (seven library, two native
runner, and four storage tests) with matching rustup compiler and rustdoc. The
JavaScript suite passed 4,062 assertions, including 4,000 oracle operations.
Production TypeScript tests were not rerun for this isolated comparison.

### Timing results

Values are medians in milliseconds. All raw samples and paired orders remain
in the receipt. `Pipeline` includes construction, edits, and fresh output.

| Seed | Trace | Runtime | Construction | Edits | Fresh output | Pipeline |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 305419896 | cursor-local | Node.js Gap | 0.019667 | 0.890708 | 0.017542 | 0.928375 |
| 305419896 | cursor-local | Native Rust Gap | 0.005333 | 0.133167 | 0.003084 | 0.138876 |
| 305419896 | far-jump | Node.js Gap | 0.021583 | 9.206083 | 0.018083 | 9.236333 |
| 305419896 | far-jump | Native Rust Gap | 0.003583 | 8.204000 | 0.003417 | 8.216250 |
| 305419896 | alternating-ends | Node.js Gap | 0.024000 | 29.945041 | 0.021666 | 30.001999 |
| 305419896 | alternating-ends | Native Rust Gap | 0.004750 | 27.049167 | 0.026375 | 27.107958 |
| 192837465 | cursor-local | Node.js Gap | 0.019167 | 0.965750 | 0.020958 | 1.027583 |
| 192837465 | cursor-local | Native Rust Gap | 0.005458 | 0.125625 | 0.003166 | 0.133792 |
| 192837465 | far-jump | Node.js Gap | 0.021125 | 9.246250 | 0.025791 | 9.315251 |
| 192837465 | far-jump | Native Rust Gap | 0.004208 | 8.168791 | 0.003583 | 8.178208 |
| 192837465 | alternating-ends | Node.js Gap | 0.023917 | 29.281958 | 0.019083 | 29.341499 |
| 192837465 | alternating-ends | Native Rust Gap | 0.004667 | 27.228875 | 0.016166 | 27.239125 |

Native Rust had lower edit and pipeline medians for all six seed/trace pairs.
Pipeline medians were 6.69–7.68 times lower for cursor-local edits, 1.12–1.14
times lower for far jumps, and 1.08–1.11 times lower for alternating ends.
Native pipeline time was lower in 41 of 42 paired samples. The first seed's
far-jump pair had one native sample above its paired Node sample. Thus, the
median advantage does not mean every native sample was faster.

The gain is strongly workload-dependent. Moving the gap across the document
still dominates far-jump and alternating-end batches. For seed 305419896,
native fresh-output median was 0.026375 ms for alternating ends, above Node's
0.021666 ms. That phase regression remains visible even though the full
pipeline median improved. The previous Gap-versus-Vec alternating-end
regression also remains valid for its original comparison.

### Process memory observations

Each row comes from a separate fresh process. The parent samples the same
external `ps -o rss= -p PID` metric in KiB while the child pauses at each phase.
`Baseline` precedes trace loading. `Released` follows release of the gap and
fresh output; both runtimes still retain the parsed trace. No forced GC is
used. These are observations at six stages, not peak measurements.

| Seed | Trace | Runtime | Baseline | Loaded | Constructed | Edited | Materialized | Released |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 305419896 | cursor-local | Node.js Gap | 47296 | 59776 | 60016 | 64288 | 64560 | 69568 |
| 305419896 | cursor-local | Native Rust Gap | 1248 | 2528 | 2816 | 2816 | 3056 | 3056 |
| 305419896 | far-jump | Node.js Gap | 47088 | 59264 | 59520 | 63440 | 63680 | 71280 |
| 305419896 | far-jump | Native Rust Gap | 1248 | 2432 | 2656 | 2688 | 2928 | 2928 |
| 305419896 | alternating-ends | Node.js Gap | 47536 | 59872 | 60128 | 64064 | 64320 | 70224 |
| 305419896 | alternating-ends | Native Rust Gap | 1248 | 2432 | 2656 | 2688 | 2928 | 2960 |
| 192837465 | cursor-local | Node.js Gap | 47680 | 60016 | 60256 | 64464 | 64720 | 71936 |
| 192837465 | cursor-local | Native Rust Gap | 1248 | 2464 | 2752 | 2752 | 2960 | 2960 |
| 192837465 | far-jump | Node.js Gap | 47552 | 60592 | 60880 | 64864 | 65104 | 72944 |
| 192837465 | far-jump | Native Rust Gap | 1248 | 2432 | 2720 | 2752 | 2992 | 2992 |
| 192837465 | alternating-ends | Node.js Gap | 47120 | 59248 | 59504 | 63600 | 63616 | 71184 |
| 192837465 | alternating-ends | Native Rust Gap | 1248 | 2432 | 2656 | 2656 | 2928 | 2928 |

Native process RSS was lower at every sampled stage. Baseline was 1,248 KiB
for native Rust and 47,088–47,680 KiB for Node. At materialization, native RSS
was 2,928–3,056 KiB and Node RSS was 63,616–65,104 KiB. This includes runtime,
trace representation, allocator, and output costs. It is not per-document heap
usage or proof of an equivalent memory reduction in an existing Node server.
Multiple-document workloads and amortization of the runtime baseline were not
measured. No document-count scaling claim follows from these single-trace runs.

Full-output JSON serialization occurs after the materialized snapshot and
before release. Released RSS therefore includes possible serialization,
allocator, and GC retention effects. Node RSS increased after release in these
runs; this is not a leak verdict. Adjacent stage deltas are observed changes,
not isolated allocation costs. Node `memoryUsage` fields remain supplementary
and are not used as a cross-runtime comparator. Peak RSS, allocator heap,
long-lived retention, leak freedom, and timed growth workloads remain unmeasured.

### Assessment

This no-WASM workload shows a practical native Rust storage benefit over the
same-algorithm Node.js implementation: lower edit and pipeline medians in all
six conditions, and lower sampled total process RSS. This supports further
native server experiments. It does not establish an intrinsic language-wide
Rust advantage. JIT, GC, runtime baseline, checks, and allocator behavior differ.
It also does not overturn the earlier WASM result: the practical WASM path was
slower than JavaScript Gap in its measured Node and Chrome conditions.

The current server remains TypeScript. This benchmark does not run server
transport, concurrency, CRDT operations, persistence, recovery, or editor code.
It does not establish production server throughput, latency, memory use, or a
production migration decision. R4–R6 remain planned; their semantic,
integration, and product gates are still required. No production source change,
commit, push, publication, or deployment is established by this comparison.
