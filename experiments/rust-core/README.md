# Rust / WebAssembly splice experiment

The [Rust engine roadmap](../../docs/rust-roadmap.md) defines stages R1–R6.
R1 has bounded baseline evidence. The declared bounded R2 storage comparison
gate passed with native Rust, independent JavaScript, and WASM checks in Node
24 and Chrome. The [R2 results](STORAGE-RESULTS.md) retain the alternating-end
regression and separate timing phases. R3 passed its declared bounded boundary and lifetime gate. The separate
[bridge experiment](../rust-bridge/) has Node 24 and Chrome completion checks.
CRDT semantics, shadow adapters, and production decisions have later gates.

See [RESULTS.md](RESULTS.md) for the recorded local measurements and raw samples:
[original Node 18](receipt.json), [Node 24](receipt-node24.json), and
[Headless Chrome 156](receipt-chrome.json). The Chrome storage-batch check is
PASS; production engine integration and editor latency remain NOT_RUN.

This package is isolated from the production TypeScript engine. It has no npm
workspace entry and no third-party Rust dependencies. It tests whether a small
text-storage operation can run in native Rust and WebAssembly.

For a complete build, Node import, browser initialization, UTF-16 splice,
and `clear()` recipe, see [Use the storage-only WASM adapter](../../apps/docs/src/guide/rust.md#use-the-storage-only-wasm-adapter).
The [capability matrix](../../apps/docs/src/guide/packages.md#engine-selection-is-a-separate-milestone)
separates this storage experiment from the native SDK and TypeScript clients.

## Contract

`TextTape::splice(at, delete, insert)` edits a vector of UTF-16 code units.
Offsets and deletion lengths count code units, as JavaScript string offsets do.
They do not count UTF-8 bytes, Unicode scalar values, or grapheme clusters.
The operation preserves all `u16` values. It can split a surrogate pair and can
store an isolated surrogate. It does not normalize text.

The valid range is `at <= length` and `delete <= length - at`. Invalid ranges
return `OutOfBounds` before mutation. Deletion does not clamp at the end.
Insertion at the end and an empty insertion are valid. Memory-allocation failure
is outside this error contract.

This primitive has no operation IDs, ordering rules for concurrent edits, CRDT
merge, history, persistence, presence, synchronization, or editor adapter.
It does not establish compatibility with `Doc`, `Op.text`, or any production
serialization format. There is no production integration or migration.

## Build and test

From this directory, with a Rust toolchain installed:

```sh
cargo test
cargo fmt --check
cargo build --release
cargo run --release --bin splice-bench -- 1000 7
```

For WebAssembly, install `wasm32-unknown-unknown` with your toolchain manager if
it is absent. No `wasm-bindgen`, JavaScript glue generator, or server is required.

```sh
cargo build --release --lib --target wasm32-unknown-unknown
node scripts/bench-wasm.mjs 1000 7
```

After the native release build, run the differential check with Node 24:

```sh
node scripts/differential.mjs
```

This check sends 265 operations to the native `splice-cases` test binary.
It compares the complete UTF-16 state after each operation with an independent
JavaScript string oracle. The trace includes deterministic random edits,
invalid ranges, empty text, end insertion, and isolated surrogates. The line
protocol is test infrastructure, not a production API. The check does not
exercise a WASM text-buffer ABI.

For a browser measurement, serve this directory after the WASM build:

```sh
python3 -m http.server 8719 --bind 127.0.0.1 --directory .
```

Open `http://127.0.0.1:8719/browser.html` and click **Run benchmark**. The page
shows raw samples and the user agent. It also stores the result in
`window.benchmarkResult`. A PASS checks the workload checksum and input bound.
It does not validate the production engine or editor integration.

If `cargo` resolves to a Homebrew compiler while the target belongs to rustup,
select the installed rustup compiler explicitly. This avoids changing the
machine's default toolchain:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" cargo build --release --lib --target wasm32-unknown-unknown
```

The raw WASM export `benchmark_checksum(rounds: u32) -> u32` creates the input,
runs the workload, and returns its checksum. The allowed round count is
0..100000. Larger counts return zero. Zero is an invalid-input marker only when
the caller has passed an out-of-range count; it is not a general error type.
The JavaScript caller must pass an integer within this range. No text buffer
crosses this ABI. The module exports linear memory as part of the standard Rust
WASM output; callers must not mutate it while the workload runs.

## R2 safe storage comparison

R2 adds `GapTape`, a safe Rust gap buffer, beside `TextTape`. The native
benchmark uses the same deterministic local, far-jump, and alternating-end
traces. The existing native benchmark and its raw samples remain in
[storage-comparison-native.jsonl](storage-comparison-native.jsonl).

The separate R2 WASM adapter exposes both storage implementations. Backend 0
owns one Vec slot and backend 1 owns one Gap slot. Initialization replaces only
the selected slot. Calls must be synchronous and exclusive within the instance.
Input and output scratch buffers are shared by the two slots. Each scratch
buffer has 1,048,576 UTF-16 units (2 MiB), and the same bound applies to logical
text length. This bound does not measure allocator capacity, peak memory, or
process RSS. The wrapper copies input into scratch and returns a fresh copy on
read. It refreshes memory views after calls that can allocate or grow memory.
This interface is test infrastructure, not a production adapter.

Build the native tests and WASM module, then run the Node 24 comparison:

```sh
CARGO_PROFILE_RELEASE_PANIC=unwind cargo test --offline --release
cargo build --offline --release --lib --target wasm32-unknown-unknown
node scripts/storage-bench.mjs 10000 7 receipt-storage-node24-r2.json
```

Use the matching Rust compiler and rustdoc if more than one toolchain is
installed. For Chrome, serve this directory as above and open
`http://127.0.0.1:8719/storage-browser.html`. It runs automatically and stores
its receipt in `window.storageReceipt`; `window.storageStatus` reports PASS or
FAIL. This page is separate from the R1 `browser.html` batch harness.

The comparison checks both WASM backends against an independent JavaScript
UTF-16 string oracle. Validation compares the complete state after each
operation, including invalid-operation rejection. Benchmark construction,
edit batches, and full-result materialization have separate raw arrays.
WASM edit timing includes JavaScript checks, a UTF-16 input copy, and ABI calls
for every operation. It does not isolate pure storage execution or ABI cost.
Trace generation, correctness checks, hashing, and disposal are outside these
timers. See [STORAGE-RESULTS.md](STORAGE-RESULTS.md) for results and limits.

## Same-algorithm JavaScript Gap and Rust WASM Gap

This follow-up uses `scripts/js-gap.mjs` and the existing Rust WASM Gap backend.
Both start with 64 initialized gap units, move the gap with overlapping copy,
delete before growth, and add `max(required - gap, floor(length / 2), 64)`
units on growth. Both accept prepared UTF-16 arrays and return a fresh
contiguous array on read. JavaScript growth allocates a new typed array;
Rust `Vec` can reuse allocator capacity. These are matched algorithm and output
contracts, not identical allocator or language execution costs.

After the R2 WASM build, use Node 24:

```sh
node scripts/js-gap-tests.mjs
node scripts/gap-compare-check.mjs receipt-gap-node24-r3.json
```

For Chrome, serve this directory as above and open
`http://127.0.0.1:8719/scripts/gap-compare-browser.html`. It runs automatically.
Save `window.gapReceipt` as JSON; `window.gapStatus` reports PASS or FAIL.
Use a new receipt path for a repeat run to preserve the recorded samples.

The suite checks complete state after every validation operation against an
independent JavaScript string oracle. It uses two seeds and all three R2
traces, 100,000 initial units, 10,000 edits, one warm-up per implementation,
and seven samples with alternating order. Both timed paths use the same
prepared arrays. Construction includes the input copy; edits and fresh output
have separate timers. The pipeline value is the sum of these phases in each
sample; its median is not the sum of the three phase medians. Trace preparation,
validation, hashing, disposal, and WASM instantiation are outside the timers.
WASM timing includes wrapper checks, scratch copies, per-edit calls, and the
Rust mutex. Growth correctness is tested separately; the steady timing traces
do not establish growth performance. See [STORAGE-RESULTS.md](STORAGE-RESULTS.md)
for raw receipt links, regressions, and the migration decision.

## Same-algorithm native Rust Gap and Node.js Gap

This separate follow-up compares native Rust `GapTape` with Node.js
`JsGapStorage`. It uses no WASM. It measures a storage workload that can run
on a server; it does not run the production server or its CRDT engine.
The shared gap algorithm, prepared UTF-16 inputs, and fresh contiguous output
contract are the same as in the WASM follow-up.

Build the native runner with the installed rustup stable toolchain, then run
the comparison with Node 24 from this directory:

```sh
cargo +stable build --release --bin native-gap-compare
node scripts/native-gap-compare.mjs
```

The runner writes `receipt-native-gap-node24-r1.json`. Preserve that receipt
before a repeat run. Its compiler metadata separates the compiler used for
the build from any different compiler on the ambient shell path. The receipt
also retains source, binary, Node executable, and binary trace hashes.

Both runtimes read the same binary trace outside the timers. Each seed/trace
pair starts with 100,000 UTF-16 units and runs 10,000 edits. There are two seeds,
three edit distributions, and seven paired samples with alternating order.
Each runtime/sample uses a fresh process and five complete untimed warm-ups.
Construction, edits, and fresh output have separate timers. The pipeline is
the per-sample sum. Startup, trace parsing, JSON, IPC, oracle checks, hashing,
and cleanup are outside these timers.

Independent JavaScript string checks compare full state after each operation
in the smaller validation traces. They also check rejection and initialized
storage growth parity. Each measured sample and separate memory run must pass
a complete final-output oracle check. Checksums are supplementary evidence.

Memory uses twelve additional fresh processes: one for each runtime/seed/trace
combination. The parent samples `ps` RSS in KiB while each child pauses before
trace loading, after trace loading, after construction, after edits, after
fresh output, and after release. The parsed trace remains retained through
release in both runtimes. No forced GC is used. These are sampled whole-process
values, including runtime and trace costs. They do not measure per-document
heap, peak RSS, or leak freedom. Node `memoryUsage` fields are supplementary;
they are not the cross-runtime memory comparator.

See the appended [native comparison results](STORAGE-RESULTS.md) for measured
costs, regressions, memory observations, and the decision boundary. JIT, GC,
native checks, allocator behavior, and runtime differences remain part of
this practical comparison. A result cannot isolate the Rust language alone.

## Measurement boundary

Each run creates 100,000 UTF-16 code units. A fixed xorshift32 seed selects edit
positions and inserted code units. Even rounds replace one unit with three;
odd rounds replace three units with one. Length is bounded to 100,002 units.
The returned FNV-1a variant hashes code-unit values with wrapping 32-bit arithmetic.

The native binary reports one warm-up and separate timed samples. The Node
script checks an independent typed-array implementation against WASM, performs
three warm-ups per implementation, and prints raw timed samples as JSON lines.
Timing includes input allocation, input initialization, edits, and checksum.
Module loading/compilation is excluded. The script measures one WASM call per
whole batch. It does not measure per-edit JS/WASM crossing or text transfer.

Rust uses `Vec::splice`; JavaScript uses `Uint16Array.copyWithin` with fixed
capacity. Allocation strategies and runtime optimizations differ. This is a
storage microbenchmark, not a production-engine performance comparison, an
editor-latency result, or a browser/WAN result. Checksum equality only checks
this workload; it is not full engine equivalence. Keep the sample arrays and
machine/runtime conditions when comparing results.
