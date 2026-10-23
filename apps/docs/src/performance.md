# Performance evidence

Measure the layer you need. Core application time, client notification time, and visible editor latency cover different work.

## Structural cache measurements

The 2026-10-23 structural workload used a 100,000-character main document and 600 characters in nested content. Each scenario had 5 warmups, 30 timing samples, and 2 separate mark-read diagnostics. Timing ran from remote receipt through the model-event callback; it excluded network and DOM work.

| Scenario | Before p95 ms | Final p95 ms | Before repeat p95 ms |
|---|---:|---:|---:|
| Main split/merge | 169.830 | 63.493 | 198.613 |
| Callout split/merge | 292.377 | 62.117 | 179.840 |
| Main block type | 160.939 | 115.216 | 160.756 |
| Cell split/merge | 183.373 | 46.512 | 156.163 |
| Table row insertion/deletion | 214.140 | 72.644 | 162.050 |
| Cell merge/split | 226.743 | 101.239 | 167.302 |

Before the change, every scenario reread marks 100,600 times. The final implementation reread 0–160 marks. It invalidates affected lines and reuses text blocks only after checking marker, type, attributes, character order, and absorbed markers. It still scans structural boundaries and retains full structural event verification.

## Browser results include a tail-latency regression

Headed Chrome used 100,000 characters in 625 paragraphs, alternating trusted Enter and Backspace events. Each direction had 6 warmups and 30 timing samples. Timing ended after both expected DOMs and a second animation frame; it did not measure physical display output.

| Direction | Before p95 ms | After p95 ms | Before repeat p95 ms | After repeat p95 ms |
|---|---:|---:|---:|---:|
| Demo → PM | 601.7 | 771.1 | 605.2 | 467.3 |
| PM → demo | 598.0 | 435.5 | 553.3 | 452.9 |

Median latency decreased in both updated runs. The first demo-to-PM p95 increased, and its cause is not isolated. The repeat does not erase that result. External desktop load also differed. These measurements confirm less paragraph recomputation; they do not establish consistent screen p95 improvement or an approved SLO.

## Reproduce

```sh
node benchmarks/structure.ts --chars 10000,100000 --samples 30 --out /tmp/new-structure.json
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm run typecheck
```

Use a new output path. Do not overlap timing with other test jobs. Keep raw samples, source hashes, and rejected candidates.

[Full report and raw data](https://github.com/barocss/doc-sync/tree/main/benchmarks/results/structural-cache-2026-10-23) · [Roadmap status](https://github.com/barocss/doc-sync/blob/main/docs/roadmap-status.md)
