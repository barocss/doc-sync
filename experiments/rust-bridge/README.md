# R3: Actual UTF-16 JS ↔ WASM transfer experiment

This experiment uses the `TextTape` Vec implementation from `../rust-core`.
Each edit copies JS input into WASM memory. It measures this path separately
from the path that runs the complete workload inside WASM.
It does not implement a CRDT, sync protocol, editor integration, or product replacement.

## Run

There are no external Rust or npm dependencies. Use the existing rustup toolchain
and the installed `wasm32-unknown-unknown` target. Run from the repository root.

```sh
RUSTC="$(rustup which rustc)" RUSTDOC="$(rustup which rustdoc)" \
  "$(rustup which cargo)" test --manifest-path experiments/rust-bridge/Cargo.toml
RUSTC="$(rustup which rustc)" "$(rustup which cargo)" build \
  --manifest-path experiments/rust-bridge/Cargo.toml \
  --target wasm32-unknown-unknown --release
node experiments/rust-bridge/scripts/boundary-check.mjs --write
```

Use Node 24. The completion harness runs differential, ownership, repeated-lifetime,
boundary-cost, and combined-edit checks. `--write` updates
`receipt-boundary-node24.json`. The original `scripts/check.mjs --write` and
`receipt-node24.json` remain the historical initial-slice harness and receipt.
For the browser, serve the repository root over HTTP and open
`/experiments/rust-bridge/boundary-browser.html`. An existing server can be used.
If no server is running, run `python3 -m http.server 8765 --bind 127.0.0.1`
in a separate terminal. Completion status is in
`document.documentElement.dataset.status`. Success data is in `window.boundaryReceipt`.
Failure information is in `window.boundaryFailure`. The original `browser.html`
and `receipt-chrome.json` retain the initial-slice evidence.
The browser and Node run the same tests and benchmarks.

The first native run passed both unit tests but failed doctests.
It mixed rustup rustc 1.86 with Homebrew rustdoc 1.87 from PATH.
The rerun passed with explicit `RUSTDOC`, as shown above.

## ABI and ownership

Addresses count bytes. String lengths and edit offsets count UTF-16 code units.
All code units are preserved. Isolated surrogates and offsets inside a
surrogate pair are allowed.

| Export | Input and result |
| --- | --- |
| `bridge_capacity()` | Maximum units in each fixed input/output buffer and document: 1,048,576 |
| `bridge_max_handles()` | Maximum open documents: 8 |
| `bridge_input_ptr()` | Address of the input buffer owned by the instance |
| `bridge_output_ptr()` | Address of the output buffer owned by the instance |
| `bridge_create(len)` | Copies `len` units from the input buffer. Returns a positive handle. |
| `bridge_splice(handle, at, delete, insert_len)` | Copies inserted units from the input buffer. Success: 0 |
| `bridge_read(handle)` | Copies the document into the output buffer. Returns the actual length. |
| `bridge_checksum(handle)` | Returns u32 FNV-1a as i64/JS BigInt. Invalid handle: -1 |
| `bridge_close(handle)` | Releases the document memory. Success: 0 |
| `bridge_live_handles()` / `bridge_live_units()` | Current document count / logical UTF-16 units; not allocator bytes or RSS |
| `bridge_scalar_echo(value)` | Returns the u32 input unchanged; no document access |
| `bridge_probe(len)` | Checks scratch capacity and returns the length; no payload copy |
| `bridge_transfer(len)` | Copies input scratch to output scratch after capacity validation; returns the length |
| `bridge_batch_checksum(rounds)` | Runs the original deterministic workload inside WASM. Maximum: 100,000 rounds. Out of range: -1 |

General error codes are -1 for an invalid handle, -2 for an invalid edit range,
-3 for a capacity violation, and -4 for the handle limit or exhausted IDs.
Handles increase from 1. Closed handles are never reused.
After allocating the maximum i32 ID, the instance rejects further document creation.
Native tests check ID exhaustion.

Rust exposes the addresses of fixed `Box<[u16]>` buffers without `unsafe` code.
The buffers do not resize. Their addresses remain valid for the instance lifetime.
The host may write only inside the input range `[ptr, ptr + capacity * 2)`.
Read output only within the actual returned length. All host accesses and WASM calls
must be synchronous and exclusive in one execution flow. The Rust Mutex does not
lock direct host writes. Raw WASM memory/export access is an ABI for a trusted host.
It is not a security boundary against arbitrary memory writes.

`Utf16Bridge` checks input length and integer bounds before copying.
It rejects negative values, fractions, NaN, Infinity, and values above u32 bounds
before calling WASM. Capacity is stored in a private field. Changing or shadowing
the public getter does not change the write limit.
The wrapper reads the intrinsic typed-array length once. It does not use a custom
`length` getter or the input's `byteLength`, `byteOffset`, or `buffer` properties
for validation. Each wrapper handles only its own handles. `close` closes one document.
`dispose` marks the wrapper terminal and attempts to close every owned handle.
Later create, read, splice, checksum, and close operations reject. Repeated
dispose is safe. A failed close remains tracked, the other closes are attempted,
and a later dispose retries the failed handles. It reports the first close error.
`resourceStats()` remains available for diagnostics after disposal.
Input/output scratch buffers remain for the instance lifetime. `close` does not
clear scratch data. Runtime collection after dropping instance references is
not measured.

Returned arrays are copies owned by JS. Scratch views do not escape the wrapper.
Each access creates a view from the current `memory.buffer`, so it does not use
an old ArrayBuffer after `memory.grow`. The document is not changed before range
and capacity checks pass. Tests check failure atomicity for invalid inputs.
Allocation failure and recovery after a runtime trap are outside this experiment.

## Validation and measurement scope

Native tests check invalid ranges, capacity, document count, handle closure,
and ID exhaustion. JS tests execute 4,000 actual WASM edits. After each edit,
they compare the complete UTF-16 string and checksum against an independent
JS string oracle. Including boundary examples, there are 4,018 exact comparisons.
Tests also check integer errors, oversized raw ABI inputs, failure atomicity,
immutable capacity, isolation between closed handles and new documents, disposal,
and memory growth. Capacity-tampering regression tests verify that the unit
immediately after the input buffer remains unchanged.

The benchmark uses 100,000 initial code units, 2,000 edits, one warmup per path,
and five measured samples. Path order rotates. Timing boundaries are saved in JSON.

| Path | Measured work |
| --- | --- |
| `jsString` | JS string edits. Initial string preparation and final checksum are excluded. |
| `wasmPerEditInputCopy` | Wrapper checks, input UTF-16 copy, WASM call, and Rust splice for each edit |
| `wasmPerEditInputAndFullOutputCopy` | The input path plus full-document Rust output copy and JS array copy for each edit |
| `wasmWholeBatch` | Initial allocation, PRNG, Rust edits, and final checksum inside one call |

Per-edit paths exclude initial creation and final validation.
Insertion data uses prepared Uint16Arrays. Per-edit timers do not include JS string
encoding. Separate lifecycle samples measure initial-document encoding,
create+input copy, read+output copy, decoding, and closure of one handle.
Startup measures the first instantiation from bytes and scratch initialization once.
File and network read times are excluded. Short phases depend on timer resolution.

The full-output path reads 200,002,000 code units per measured run.
It includes both output-buffer copying and JS-array copying. JS string conversion
is separate. The input-only path copies 4,000 insertion units per run.
The full-output path and the small-insertion path transfer different amounts of data.

JSON preserves the WASM SHA-256, runtime, individual samples, median, and min/max.
It also preserves the SHA-256 of the JS wrapper and test script.
The difference between the WASM paths is not pure ABI overhead: initial allocation,
PRNG, and checksum inclusion differ. JS string and Rust Vec paths also use different
storage structures and execution boundaries. Results describe the cost of this
experiment. They do not establish a product speedup or justify a CRDT replacement.

## R3 completion measurements

The completion harness adds seven measured batches for each boundary case.
It doubles the call count until the calibration reaches 10 ms or the recorded
case cap. It then runs one full warmup batch. Measurement order rotates.
Receipts retain elapsed batch times, call counts, normalized ns/call, payload
checksums, and batches below the target. The target is not guaranteed at a cap.

| Cases | Measured boundary |
| --- | --- |
| Scalar echo and length probe | Matched JS and raw WASM calls, loop, argument handling, and accumulated scalar results; no payload transfer |
| Input copy, reused view | JS-owned input to JS or WASM memory with `Uint16Array.set`; no WASM call or destination allocation |
| Output copy, reused destination | JS or WASM memory to a reused JS array; no WASM call or destination allocation |
| Output copy, fresh destination | `slice` from JS or WASM memory; fresh allocation plus copy |
| Internal transfer | JS scratch copy versus one WASM call plus Rust scratch copy; no host payload copy |

Payload sizes are 0, 16, 1,024, and 100,000 UTF-16 units. The JavaScript controls
use the same payload pattern and result accumulation. Each batch checks results
outside its timer. These measurements include loop, JIT, typed-array, and runtime
costs within their stated boundaries. Subtracting a JavaScript control does not
isolate pure ABI overhead. Fresh-minus-reused copying does not isolate an
allocator cost. Rust transfer includes its boundary call. Rust splice remains
combined with checks and input transfer in the edit paths above.

Startup records the first explicit compile, first instantiation from the compiled
module, wrapper import, and first wrapper initialization/disposal separately.
The engine cache state is unknown. File and network reads are excluded. Seven
batches of eight fresh instances measure instantiation from a retained compiled
module and wrapper initialization/disposal separately. Promise overhead remains
in repeated instantiation. These are not cold-cache measurements.

Repeated timing batches use 1,000 raw create/read/close cycles and 100,000 units
per cycle, after one warmup batch. Each includes host input copying, document
allocation/copy, Rust output materialization, fresh JS output allocation/copy,
Rust drop, views, and assertions. Only one document is live at a time. Prepared
input and final checksum checks are excluded. This is a combined lifecycle cost.
The original short single-document phases remain available as observations.

The separate lifetime correctness run executes 2,000 create/edit/read/close cycles and
separate disposal cases. It checks live-handle and logical-unit counters, stale handles,
cross-wrapper ownership, terminal disposal, failed-dispose retry, hostile typed
array properties, forged brands, detached arrays, and refreshed views after
explicit memory growth. A separate independent Node audit also checks a genuine
cross-realm Uint16Array.

Zero final live handles and logical units establish logical document release.
Stable linear-memory size during cycles does not prove allocator, process RSS,
or JavaScript GC leak freedom. Explicit growth adds one 64 KiB WASM page and is
recorded separately; linear memory does not shrink on close. Allocation failure
and recovery after runtime traps remain outside the contract.

The completion receipts bind all measured sources and the WASM binary by
SHA-256. Preserve the original receipts as historical evidence. Stage status
and the final receipt paths are in [RESULTS.md](RESULTS.md).
