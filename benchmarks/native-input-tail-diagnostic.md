# Native input tail diagnostic

`native-input-tail-diagnostic.mjs` is a separate, instrumented copy of
`native-input-identity.mjs`. It retains the same fixtures, ordering, warmups,
eight measured samples, operation capture, and fixed model/history oracles.
Its timing is **diagnostic only**. Do not use its comparison branch or times
for performance acceptance. Use the original harness and guards for acceptance.

The diagnostic records fixture/oracle stages, synchronous native change,
callback microtask flush, the driver's operation clone, runtime commit,
per-stage process CPU usage, heap samples, and `PerformanceObserver` GC events.
The flush stage includes native callback and binding work. It does not measure
idle microtask delay separately. Clone and commit stage records also include
undo/redo; select only records within `inputStart` and `inputEnd` for input cost.
Use the global GC entries for interval correlation because observer delivery is
asynchronous. Begin/end log markers bracket input in the V8 trace log. Logging,
observers, stage wrappers and V8 tracing can change JIT and allocation behavior.

Build both targets before an exclusive measurement interval. Use Node 24.
Run a fixed A-B-B-A sequence with all 16 cells and retain each raw JSON/log.
Do not change warmups, force GC, exclude samples, or repeat until a guard passes.
For each capture:

```sh
node --trace-gc --trace-gc-nvp --trace-opt --trace-deopt \
  benchmarks/native-input-tail-diagnostic.mjs \
  --target=/absolute/path/to/checkout \
  --output=/absolute/path/to/capture.json > /absolute/path/to/capture.trace.log 2>&1
```

The first diagnostic is retained locally in
`output/unified-client-delivery/tail-profile/`. Its manifest records the exact
four commands and both harness hashes. All 64 oracle/count/history cells pass.
The original candidate 4.481–4.962 ms tail did not recur under instrumentation.
Candidate first samples still overlap compilation activity, but do not overlap
GC. One baseline tail overlaps a 1.050 ms minor GC. Driver clone and runtime
commit costs do not explain the original candidate tail. These facts establish
neither its cause nor a performance PASS. The original INVESTIGATE status stays.

The complete bounded follow-up is in
[the retained investigation report](results/input-tail-diagnostics/report.md).
One later CPU-profile pair captures a 5.395 ms candidate input containing a
3.788 ms major GC. This explains that new sample, while the original spikes
remain unproven. One Chrome local 10k trace pair adds browser attribution.
Both follow-ups are diagnostic only. Their scripts are
`native-input-tail-cpu-diagnostic.mjs` and `chrome-input-tail-diagnostic.mjs`;
their raw evidence and hashes are archived with the report. No runtime edit
was justified or made.
