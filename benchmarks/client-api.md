# Unified Client benchmark

Use Node 24. Run `client-api.mjs` from the candidate checkout for every target.
The script imports core, the PM binding, and PM peer packages from `--target`.
The baseline does not need the new `/client` entry.
Do not run a build or another CPU workload during a measurement.

The four backends are `legacy-local`, `legacy-sync`, `unified-local`, and
`unified-sync`. The local pair and the sync pair require separate comparisons.
Sync uses a disconnected stub transport. This measures editing overhead. It
provides no connected network or browser result.

Example count captures:

```sh
node /Users/user/github/doc-sync/benchmarks/client-api.mjs --target=/Users/user/github/doc-sync-client-baseline --backend=legacy-local --mode=counts --sizes=10000,100000 --output=output/unified-client-delivery/bench/baseline-local-counts.json
node /Users/user/github/doc-sync/benchmarks/client-api.mjs --target=/Users/user/github/doc-sync --backend=unified-local --mode=counts --sizes=10000,100000 --output=output/unified-client-delivery/bench/candidate-local-counts.json
node /Users/user/github/doc-sync/benchmarks/client-api.mjs --compare=output/unified-client-delivery/bench/baseline-local-counts.json,output/unified-client-delivery/bench/candidate-local-counts.json --output=output/unified-client-delivery/bench/local-counts-comparison.json
```

For timing, use `--mode=timing --reps=10 --warmups=3 --blocks=1` with the same
sizes and scenarios on each target. Preserve every capture. If a result needs
investigation, run separate baseline, candidate, candidate, baseline captures
in that order. `--scenarios=insert,delete` can restrict a focused rerun. Keep
the same scenario list, repetitions, warmups, and sizes in each paired run.
Use separate output paths for each capture and comparison.

The script records all arguments, the harness SHA-256, before/after dist hashes,
raw samples, model and operation hashes, history hashes, transport calls, and
native binding statistics. Its semantic checks use fixed edits and native PM
readback. It checks one undo action for each recorded edit. It also checks that
unified local mode owns a `LocalClient`, has no sync client, and allocates none
of the named sync fields. Instrumented calls are `Doc.snapshot`,
`Doc.fromSnapshot`, `Doc.toJSON`, and PM `Node.fromJSON`.

The comparison rejects increased ordinary snapshot/model reconstruction counts
and increased native self-echo counts. Operation hashes must match except for
`external`: legacy sync explicitly calls `pull`, while unified and local APIs
notify views. Model and history hashes must still match for that scenario.

Declared timing limits are unchanged: median delta must not exceed
`max(baseline * 10%, 0.1 ms)`; p95 delta must not exceed
`max(baseline * 15%, 0.2 ms)`. A count capture reports timing `NOT_RUN`.
A timing delta beyond either limit reports `INVESTIGATE`. It does not widen a
limit or discard a failed capture.

## Recorded result

The [delivery report](results/unified-client/report.md) retains the complete
32-cell comparison, eight original timing flags, focused ABBA captures and
higher-sample investigations. Counts pass. The later focused rows qualify those
PM cases within the original guards; they do not relabel the original run.
Native-input and Chrome results have separate remaining p95 flags.
