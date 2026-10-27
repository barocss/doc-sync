# Recovery log compaction and receipt response

## Result

The same 30,000-change fixture produced a 5,093,177-byte JSONL log. Each source used two warmups and 12 measured runs. Times are milliseconds from the local HTTP client until the response JSON was read.

| Request or observation | Before median | Before p95 | After median | After p95 |
| --- | ---: | ---: | ---: | ---: |
| Reservation request that triggers compaction | 374.40 | 482.80 | 137.57 | 194.27 |
| First observed completed compaction | 381.73 | 495.81 | 138.20 | 195.60 |
| Separate edit started about 1 ms after the compaction request | 379.17 | 494.42 | 20.76 | 34.22 |
| Exact conditional receipt request | 263.51 | 342.42 | 35.42 | 116.42 |
| Separate state read started about 1 ms after the receipt request | 262.29 | 341.15 | 1.27 | 2.41 |

For both sources, compaction completion was observed only after both the triggering request and the separate edit returned. The first subsequent `recovery-state` response reported an advanced reservation era in every run. The separate edit finished before the compaction response in 0/12 before and 12/12 after runs. The separate read finished before the receipt response in 0/12 before and 12/12 after runs. These observations show HTTP response ordering; they do not establish the exact time a request entered the server queue.

The fixture is a **large accumulated log**, not a large visible document: it repeatedly changes formatting on one character. The input file SHA-256 was identical in both groups. The resulting log was 5,093,538 bytes in every measured run. Every run verified the document, the exact accepted receipt, an independent active reservation and server restart.

## Method and evidence

- Darwin arm64, Apple M3 Max, Node v24.22.1, isolated local server processes, temporary directories and loopback ports. The server was restarted for each run; startup and fixture preparation were not timed.
- `RECOVERY_COMPACT_THRESHOLD=2`; the second reservation event triggered compaction. The edit and state requests were each launched using a 1 ms timer. Actual client-side edit launch offsets were 0.27–1.84 ms before and 0.39–1.64 ms after. Timers and local scheduling are not server queue timestamps.
- The receipt measurement is separate from the compaction measurement and occurs after the first observed era advance. The receipt and its following read do not mutate the document.
- Percentiles use nearest rank. With 12 samples, p95 is the maximum observed sample. Samples ran sequentially, before then after; there was no ABBA alternation or confidence-interval calculation. The user shares this host with other workloads. The recorded one-minute load average at the end of each group was 13.82 before and 17.72 after; these measurements are not isolated from all host activity.
- Test-only compaction and receipt gates were removed from the child environment. The benchmark uses the same source script and fixture for both groups.
- Raw sample values and hashes: [baseline.json](baseline.json) and [after.json](after.json). The [before server source](baseline-server.ts.txt) is retained for reconstruction; its imports require the matching core and fixtures identified below. Earlier exploratory and prior-protocol runs are preserved alongside them but are not the values in the table. No exploratory run failed.

| Provenance | SHA-256 |
| --- | --- |
| Generated input | `e9718312e3192eab562ef129305c33e31874fb90fcd23087fb816a3a28f2cf91` |
| Benchmark script, both groups | `3a6532f461da2074c187fc7b838956746be785d065de06c84213007731f3a63f` |
| Core source tree, both groups | `a31e50beae95cbf736a59646adbb6cebf9cee7f0b7e365045e2ec0ae544426d1` |
| Fixtures source tree, both groups | `7071e395b6b5897b3109c6e774bc7bbb40f71c80001478e4895d27e9385aef4f` |
| Before server | `52c6e80cf08d13f74d0ffd4d0d1403698d24aab2e41992e5cf1db07005546458` |
| After server | `48bf1609b1597491d22bd6d8303919e94a264b792ac59bd9344967594ee5b53b` |
| After worker | `45a43781e36b03ca151ec15cdec33f85d1c195f1992b6cc298be50366aaf65e9` |

## Limits

These are local HTTP timings for one schema and one synthetic history. They do not measure editor rendering, sustained contention, cold startup, memory use, or a production service. The threshold of two is chosen to trigger compaction in the test; the normal default is 128. File sync occurs in the implementation, but this run does not measure power-loss durability or inject actual operating-system fsync/rename failures. Larger logs, different operation mixes, long-lived participants, and other filesystems require separate measurements.
