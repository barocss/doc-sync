# Rust/WASM experiment results

## Chrome 156 follow-up

The standalone browser harness passed in Headless Chrome 156 on 2026-11-01.
It used 100,000 initial UTF-16 code units, 1,000 edits, three warm-ups, and seven
samples. Both implementations returned checksum `719347296`.

| Implementation | Median |
| --- | ---: |
| JavaScript Uint16Array, Chrome 156 | 1.700 ms |
| Rust WASM, Chrome 156 | 7.300 ms |

WASM was slower in this Chrome run. [receipt-chrome.json](receipt-chrome.json)
copies the actual browser result from
`output/validation/rust-browser-20261101/chrome-result.json` in the repository.
It includes the full user agent and raw samples. The harness checks workload
checksum equality and the invalid-round bound. These measurements include
allocation, initialization, edits, and hashing. They exclude WASM loading,
compilation, text transfer, and per-edit WASM calls.

This is browser proof for the isolated storage batch. It does not establish
full CRDT equivalence, production server/client integration, editor input
latency, or a production speed improvement. Server and client production code
remain TypeScript.

## Node 24 follow-up

The Node 24.22.1 run used the executable
`/Users/user/.volta/tools/image/node/24.22.1/bin/node`. It used the same workload,
three warm-ups, seven samples, and checksum `719347296`.

| Implementation | Median |
| --- | ---: |
| JavaScript Uint16Array, Node 24 | 1.759 ms |
| Rust WASM, Node 24 | 8.050 ms |

WASM remained slower in this run. [receipt-node24.json](receipt-node24.json)
contains the raw samples. These measurements cover storage batches in Node,
not browser or editor latency.

The native differential check is PASS for 265 sequential operations: 142 valid
edits and 123 invalid edits. It compared the complete UTF-16 result after each
operation with a JavaScript string oracle. The trace includes deterministic
random edits, invalid ranges, isolated surrogates, empty text, and end insertion.
Four Rust unit tests and native/WASM release builds also passed again.

A standalone browser harness is available in `browser.html`. Browser execution
is not recorded in this Node receipt. Production server and client code remain
TypeScript. This Rust package is an isolated experiment.

## Original Node 18 run

These results come from a local Apple Silicon run on 2026-11-01. Each run
started with 100,000 UTF-16 code units and applied 1,000 edits in one batch.
Each implementation had seven timed samples. [receipt.json](receipt.json)
contains the raw samples.

| Implementation | Median |
| --- | ---: |
| Native Rust | 1.523 ms |
| JavaScript Uint16Array | 1.677 ms |
| Rust WASM | 7.273 ms |

WASM was slower than the JavaScript baseline in this run. Native Rust timings
do not establish a browser performance improvement.

Four Rust unit tests and the format check are PASS. The WASM build is PASS.
JavaScript and WASM checksums matched at 0, 1, 31, and 1,000 edits. Native Rust
also returned the same checksum, `719347296`, at 1,000 edits.

Native Rust and WASM measurements used rustup stable Rust 1.86. JavaScript and
WASM measurements used Node 18.10.0 from PATH. These results do not establish
performance under the repository's required Node 24 environment.

Timing includes input allocation, initialization, edits, and hashing. It
excludes WASM loading and compilation. The workload uses one WASM call per
batch. It does not measure per-edit calls or text-transfer costs. Rust and
JavaScript use different allocation strategies.

At the original Node 18 checkpoint, browser execution was NOT_RUN. The separate
Chrome follow-up above now records that check. Production-engine integration,
full CRDT semantic equivalence, and editor input latency remain NOT_RUN. This
experiment checks only the stated UTF-16 text-storage operation.
