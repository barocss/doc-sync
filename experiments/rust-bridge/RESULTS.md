# R3 bounded UTF-16 bridge results

Status: **PASS for the declared bounded R3 boundary and lifetime gate**.
Node 24 and Chrome completion evidence is in the final section below.
The sections below record the historical initial slice. Native tests, Node 24 actual
JS↔WASM operations, and Headless Chrome actual JS↔WASM operations passed.
This result does not accept a CRDT, editor integration, or production replacement.

The historical initial-slice receipts are `receipt-node24.json` and `receipt-chrome.json`.
The browser receipt was copied from
`output/validation/rust-bridge-20261101/chrome-final.json` at repository root.
The older `chrome-result.json` predates the final wrapper and is superseded.

## Correctness and ownership

- Rust native: **2 passed**, 0 failed. Doctests: 0 examples, passed.
- Release WASM build: **PASS**, 33,715 bytes. No downloaded dependencies.
- Node v24.22.1, macOS arm64: **PASS**, 4,000 random differential edits and
  4,018 exact full UTF-16 read/hash checks against a JS string oracle.
- Headless Chrome 156.0.0.0: **PASS**, the same 4,000 edits and 4,018 checks.
- Independent hostile-input review: **PASS** after both fixes below. The reviewer
  checked throwing own `length`, `byteLength`, `byteOffset`, and `buffer` getters,
  oversized create/splice, the scratch boundary sentinel, and prototype getter
  replacement after module import.

Checks cover split and isolated surrogates; insertion, deletion, and replacement;
JS integer bounds; raw ABI oversized lengths; document and handle limits;
failure atomicity; closed handle rejection after a new document is created;
disposal; memory growth; and immutable scratch capacity. Native tests cover
handle ID exhaustion. Handles never recycle. The fixed scratch buffers belong
to the WASM instance. Document buffers are released on `close`.

Review found two wrapper defects before final acceptance. Public writable
capacity could expand a host write beyond the input buffer. An overridden typed
array `length` getter could change between validation and copy. The final
wrapper keeps capacity private, reads the intrinsic typed-array length once,
and reuses that captured length for copy and ABI calls. Regression tests use a
different sentinel value beyond the input buffer so a rejected out-of-bound
copy cannot pass unnoticed. Pre-fix receipts are not final-source evidence.

The first native run passed both unit tests but failed doctests because rustup
rustc 1.86 and Homebrew rustdoc 1.87 were mixed. Explicit `RUSTC` and `RUSTDOC`
from rustup resolved the mismatch. Final native and WASM checks passed.

## Timing

Each method uses 100,000 initial UTF-16 units, 2,000 deterministic paired
growth/shrink edits, one warmup, and five measured samples. Method order rotates.
Values below are medians in milliseconds for the complete 2,000-edit run.
The receipts retain every sample and timing boundary.

| Method | Node 24 | Chrome 156 |
| --- | ---: | ---: |
| JS string edits | 49.965 | 12.300 |
| Per-edit input copy + wrapper checks + WASM splice | 14.582 | 14.700 |
| Per-edit input path + full output copy to JS | 83.122 | 63.600 |
| Whole workload in one WASM call | 14.293 | 14.400 |

The per-edit input path transfers 4,000 insertion units per run. Inputs are
prepared Uint16Arrays. Initial document creation and final validation are
outside that timer. The full-output path also materializes the whole document
after every edit: 200,002,000 output units per run, copied inside Rust and then
into JS-owned arrays. It excludes output-to-string conversion. The whole-batch
path includes initial allocation, PRNG generation, edits, and final checksum.
The JS string timer includes edits only.

These paths have different timing boundaries. Their difference is not an
isolated ABI overhead estimate. The JS and Rust paths use different storage
representations. Node and Chrome results are individual local observations,
not a cross-runtime ranking or a product speedup claim.

The receipts also retain separate single-document lifecycle phases for 100,000
units. The instance and scratch buffers are already initialized for these phases.

| Phase, median ms | Node 24 | Chrome 156 |
| --- | ---: | ---: |
| JS string → UTF-16 array | 0.134 | 0.100 |
| Create + input copy | 0.020 | 0.000 |
| Materialize + output copy | 0.037 | 0.100 |
| UTF-16 array → JS string | 2.284 | 1.900 |
| Close one handle | 0.002 | 0.000 |

Chrome zero medians are below timer granularity. They do not mean zero cost.
Single-sample startup was 0.204 ms instantiate + 1.766 ms first wrapper/scratch
initialization in Node, and 0.300 ms + 2.000 ms in Chrome. File/network reads
are excluded. Startup has one sample and must not be treated as a stable percentile.

## Source binding

Both initial-slice runtime receipts contain the same WASM and JS hashes.
These hashes identify that checkpoint, not the later completion sources.

| Artifact | SHA-256 |
| --- | --- |
| WASM binary | `76aa6dc0e07df754c8c190da5fe6dcb8da94b5d8152eb1df2116a1394512b68f` |
| `scripts/bridge.mjs` | `06726ae09e9025f7ad81918b793dc8aaf318a3486e15fcddfe76433fa6187323` |
| `scripts/suite.mjs` | `a56a323573558fe83b70ec9b9fcacf4a14a7c06c6b262509e8c062af65cbd5dd` |
| `src/lib.rs` | `c9ae9b0d9ccffca210db99ff1bc1d8d5eeb49dbd7c05836a08e73f16712c1113` |

The Rust implementation contains no `unsafe` code. Raw memory exports require a
trusted host with exclusive synchronous access. The wrapper protects its own
input copy path. Raw memory access is not an isolation boundary. Allocation
failure and recovery after a runtime trap are outside this experiment.

## R3 completion: boundary costs and repeated lifetime

The declared bounded R3 gate passed on 2026-11-01. This accepts the standalone
UTF-16 bridge contract and its recorded measurement scope. Full CRDT semantics,
production Rust adapters, editor latency, and production acceptance remain
**NOT_RUN**. No server or client migration follows from this result.

Final receipts are `receipt-boundary-node24.json` and
`receipt-boundary-chrome.json`. The Chrome capture is
`output/validation/r3-boundary-20261101/chrome-final.json` at repository root.
The initial-slice receipts and all tables above remain historical evidence.
Both completion receipts bind the same measured sources and WASM binary.

- Native Rust: **6 passed**, 0 failed; doctests: 0 examples, passed.
- Offline release WASM build: **PASS**, 40,325 bytes; no downloaded dependencies.
- Node v24.22.1 on macOS arm64 and Headless Chrome 156.0.0.0: **PASS**.
  Each ran 4,000 differential edits and 4,018 complete UTF-16 read/hash checks,
  2,000 lifetime cycles, 42 boundary cases with seven samples each, and seven
  measured batches of 1,000 raw create/read/close cycles.
- Each lifetime run rejected 5,997 stale-handle calls and finished with zero
  live handles and zero live logical units. Hostile metadata getters were not read.
- Independent audit: **13 assertions passed**, including a genuine cross-realm
  Uint16Array, detached inputs, forged brands, hostile length, and cross-owner
  operations. Review found no remaining blocker in this bounded contract.

Disposal is terminal and idempotent. It attempts every owned close. A failed
close stays tracked for retry, while other closes continue. The wrapper retains
its disposed state after failure. Tests inject a close failure and verify retry.
Raw exports remain trusted instance-level access; they do not enforce wrapper
ownership against an arbitrary host.

Linear memory was 7,667,712 bytes before and after the 2,000 cycles in both
runtimes. Explicit `memory.grow(1)` then produced 7,733,248 bytes. Returned JS
snapshots survived, detached caller inputs rejected, and subsequent wrapper
reads/edits used refreshed views. These checks establish logical release and
view validity. They do not establish allocator, process RSS, or JavaScript GC
leak freedom. Memory does not shrink on close.

### Boundary observations

Each case calibrates to a target of 10 ms or a recorded cap, then runs one full
warmup batch. Seven measured batches rotate case order. Receipts retain each
elapsed time, call count, checksum, normalized ns/call, and count below target.
All payload sizes (0, 16, 1,024, and 100,000 UTF-16 units) remain in the receipts.
The selected table uses 100,000 units for copy/probe rows; scalar echo has no
payload. Values are medians of normalized batch observations in ns/call.

| Measured path | Node 24 | Chrome 156 |
| --- | ---: | ---: |
| JS scalar echo | 5.307 | 5.300 |
| WASM scalar echo | 5.230 | 5.400 |
| JS length probe | 5.427 | 5.600 |
| WASM length probe | 6.093 | 5.850 |
| JS input copy, reused | 2520.691 | 2661.133 |
| WASM-memory input copy, reused | 2689.758 | 2856.445 |
| JS output copy, reused | 2504.527 | 2514.648 |
| WASM-memory output copy, reused | 2581.156 | 2661.133 |
| JS output allocation + copy, fresh | 18189.494 | 11816.406 |
| WASM-memory output allocation + copy, fresh | 20333.455 | 7617.187 |
| JS internal scratch copy | 2506.158 | 2514.648 |
| WASM call + Rust scratch transfer | 13910.726 | 14062.500 |

Reused copy cases exclude payload allocation and make no WASM call. Fresh
output cases include JS allocation plus copy. Rust transfer includes one raw
WASM call and Rust copying, without host payload copying. Scalar/probe controls
retain loop, JIT, and runtime effects. JavaScript calls can be optimized. Their
difference from WASM observations does not isolate pure ABI overhead. Likewise,
fresh-minus-reused copying does not isolate allocator cost.

At 100,000 units, Rust internal transfer was slower than the JS scratch-copy
control in both runs. Node fresh output was slower than reused output. Chrome
fresh WASM-memory output was faster than fresh JS-source output in this run;
that local observation does not establish a general memory-copy advantage.

### Combined and startup observations

Values below are medians in ms for each complete batch. The edit workload has
100,000 initial units and 2,000 edits, one warmup, and five measured samples.
The create/read/close workload has 100,000 units per cycle, one warmup batch,
and seven measured batches. It includes input copy, Rust allocation/copy,
materialization, fresh JS output allocation/copy, close/drop, views, and assertions.
It excludes prepared input and final checksum checking. It does not isolate
allocation or destruction cost.

| Measured batch | Node 24 | Chrome 156 |
| --- | ---: | ---: |
| JS string edits | 50.384 | 11.700 |
| Per-edit input copy + checks + WASM splice | 14.874 | 14.500 |
| Per-edit input path + full output copy | 79.018 | 64.000 |
| Whole workload in one WASM call | 14.213 | 14.300 |
| 1,000 create/read/close cycles | 46.721 | 41.200 |

Chrome's per-edit input path was slower than JS string edits; full output was
slower again in both runtimes. The combined paths have different storage and
timing boundaries. No speedup or pure boundary cost follows from subtraction.

| Startup observation, ms | Node 24 | Chrome 156 |
| --- | ---: | ---: |
| First explicit compile | 0.234 | 2.100 |
| First instantiate from compiled module | 0.064 | 0.700 |
| Wrapper import | 0.039 | 0.700 |
| First wrapper init + dispose | 1.955 | 2.400 |
| Cached-module instantiate, eight fresh instances | 0.275 | 0.300 |
| Wrapper init + dispose, eight instances | 4.798 | 6.800 |

First observations have one sample. Engine cache state is unknown. File/network
reads are excluded. The retained compiled module supplies seven eight-instance
batches; wrapper initialization is timed separately. Async Promise overhead
remains in instantiation. Chrome's short observations are timer-resolution
limited. These are not cold-cache results or stable startup percentiles.

### Completion source binding

The receipts retain SHA-256 for every measured harness/source file and its
Rust storage dependencies, all raw timing samples, runtime details, and workload
boundaries. Selected hashes identify the completion checkpoint below.

| Artifact | SHA-256 |
| --- | --- |
| WASM binary | `047cbee64965a7e4826210486350e29041d2b2eb06a509a77b8525501dc97306` |
| src/lib.rs | `be7e796cc8be77e068dc9dd9603393017c5f476ea24329e995bc27c6ad5d6bc6` |
| scripts/bridge.mjs | `a46fef15fdd611cd2fc5c3b502f48570fb0d352af404270515dafedf089c692e` |
| scripts/lifetime.mjs | `0ed13ac25ae7992f72b855a02eefd6f26abb9792b1b93fb59a4549d71c2addcd` |
| scripts/boundary-suite.mjs | `b788a529735f606eb66bc0002481f12b51bc80b168f55effb47eef9c742862f0` |

Allocation failure, recovery after runtime traps, parallel/shared-memory host
access, full CRDT equivalence, and production behavior are outside this gate.
Production TypeScript tests were not rerun for this isolated Rust/harness change.
