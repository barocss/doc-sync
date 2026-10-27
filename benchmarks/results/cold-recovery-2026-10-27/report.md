# Cold log replay and independent document I/O benchmark

## Results

Measured client HTTP response times on a local server, in milliseconds:

| Request | Before median | After median | Before p95 | After p95 |
| --- | ---: | ---: | ---: | ---: |
| First state request for the cold log | 258.56 | 263.52 | 267.62 | 273.43 |
| Append to a different warm document during cold replay | 263.31 | 13.94 | 271.20 | 14.88 |
| Independent append to the warm document | 5.18 | 5.99 | 6.25 | 6.28 |
| Warm state request started after that append | 4.43 | 4.78 | 6.01 | 6.16 |

The median response for the unrelated append was about 94.7% lower in this run. The cold request median was about 1.9% higher. These samples do not establish a cold-open speedup. The unrelated append completed before the cold response in 0 of 12 before samples and 12 of 12 after samples. The warm read completed before the independent append in 0 of 12 samples in each run.

## Workload and checks

The fixture is a 5,093,156-byte JSONL log with 30,000 actual nonempty CRDT changes: an insertion, repeated formatting updates, and a final deletion. The final visible content is one character. This measures a long edit history, not rendering a large document. A conditional receipt and an existing recovery pin are included.

For each sample, the benchmark starts a fresh demo server and first loads a separate warm document. It starts a state request for the cold document, then starts an append to the warm document after a 1 ms client timer. It later measures a second warm append and a warm state request started after another 1 ms timer. Times start before the client request and end after its HTTP response is parsed. The append response includes the server's durability path. It does not isolate the fsync syscall time. Server process startup is outside the measured intervals. All test gate environment variables are cleared.

Each sample checks the conditional receipt, existing pin, GC protection of the final deletion, and both documents' state after server restart. All checks passed for both runs. These checks do not simulate power loss.

## Conditions and limits

- Node v24.22.1; Darwin 24.6.0 arm64; Apple M3 Max.
- Two warmups followed by 12 recorded samples per version; the before run preceded the after run. Raw sample values are in [baseline-rerun.json](baseline-rerun.json) and [after.json](after.json). The earlier [baseline.json](baseline.json) used a different benchmark script hash and is retained as a historical measurement, not used in this comparison.
- Nearest-rank p95 with 12 samples equals the maximum. The shared host was not isolated. End-of-run load averages were 7.52, 9.34, 10.43 before and 6.73, 9.08, 10.32 after. There is no confidence interval or alternating run order.
- The 1 ms timer is on the client. Actual timer offsets are in the raw data. It does not establish the order in which the server accepted requests.
- The benchmark does not measure browser rendering, large visible document latency, peak memory, production storage, or network latency.
- A sandboxed smoke attempt first failed with `listen EPERM`; the isolated local server smoke and both measured runs passed with permission to bind the local server.

## Reproducibility and source identity

The runs use frozen copies of the demo server, compaction worker, core source, and fixtures. The after snapshot's server, worker, `staged.ts`, and `hub.ts` matched the working files by SHA-256 after the run. Other dependencies are from the local `node_modules` installation. Snapshot paths and hashes are in the JSON files. [baseline-source.tar.gz](baseline-source.tar.gz) preserves the source files from the before snapshot without its dependency links; to rerun, restore those links and resolve `@barocss/doc-sync` to the extracted package. The original dependency installation and host conditions are not included in the archive.

| Input | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| Benchmark script | `304a5e3b5d44ba2c03fba4411ce168533a1d6f7a4478b7ae47526517c98b6605` | `304a5e3b5d44ba2c03fba4411ce168533a1d6f7a4478b7ae47526517c98b6605` |
| Generated fixture | `a190cea12f4b12c143ddb6c3eea4e8ebcd4ce234c48b81a07842f8a06852463e` | `a190cea12f4b12c143ddb6c3eea4e8ebcd4ce234c48b81a07842f8a06852463e` |
| Server | `48bf1609b1597491d22bd6d8303919e94a264b792ac59bd9344967594ee5b53b` | `1fabf583bf0798273d6f03f877fc565cc7c27286c5441e97c4621f48985f3636` |
| Compaction worker | `45a43781e36b03ca151ec15cdec33f85d1c195f1992b6cc298be50366aaf65e9` | `05932ed3a67516c58f62b239b43e8ba3836922edf34df0579f4661ca8699d0b5` |
| Core source tree | `a31e50beae95cbf736a59646adbb6cebf9cee7f0b7e365045e2ec0ae544426d1` | `795c227954d2fe87528b7d8e3dbd8007308a522c47c2376a3fa696087a155b7f` |
| Fixtures tree | `7071e395b6b5897b3109c6e774bc7bbb40f71c80001478e4895d27e9385aef4f` | `7071e395b6b5897b3109c6e774bc7bbb40f71c80001478e4895d27e9385aef4f` |

Run `BENCH_SOURCE_ROOT=/path/to/frozen/source BENCH_OUTPUT=/path/to/result.json node benchmarks/cold-recovery-benchmark.mjs`. The source snapshot must resolve `@barocss/doc-sync` to its own copied package. The default is 30,000 changes, two warmups, and 12 samples. The benchmark creates and cleans only its own temporary data directories.
