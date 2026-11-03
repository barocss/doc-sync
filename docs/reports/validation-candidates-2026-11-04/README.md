# Validation candidates: measured and not adopted

The production core remains byte-identical to the qualified post-refactor core.
Two further performance candidates were not adopted. Their tests, sources and
measurements remain available. No unchecked loader, permanent trusted-Doc flag,
new wire format or schema bypass was introduced.

## Private Graphic proof copy

The proposed private snapshot certificate did not prove wrapper ownership or
exact observation order. An output-only reflected-wrapper prototype was about
12% slower in its local screen. The decoder extraction was source-tested but
not installed. There is no production private certificate or direct-state fork.
A separate High review kept the route off and found a weak test that permitted
success where the legacy route rejects. That test now requires the old rejection
for instance, subclass, getter and throwing snapshot overrides, with unchanged
storage, clock, History and notifications.

## JSON visitor allocation experiment

The second candidate replaced one filtered key array and nested callbacks with
an explicit loop. It kept descriptor capture before the second key enumeration,
all prototype/cycle/depth/poisoned-key/accessor checks and exact short-circuit
behavior. Independent High review approved the exact body and tests. Safety
approval did not establish a speedup.

Three serialized ABBA cycles ran 12 Node 24.22.1 processes. Each process used
20,000 entries, two warmups and seven recorded samples. Both lanes used the same
driver, deterministic checkpoint and complete collection oracle. Only the
visitor source differed. All 12 oracles passed; sources and driver hashes stayed
unchanged; no watchdog fired. Other host work was recorded and was not stopped.
The host was not idle.

| Cycle | Edit/read median reduction | String control increase per 10,000 calls |
| --- | ---: | ---: |
| 1 | -0.17% | 0.14183 ms |
| 2 | 0.25% | 0.13513 ms |
| 3 | 2.20% | 0.13075 ms |

Every cycle missed the predeclared 5% useful-effect threshold. All six string
pairs also exceeded the 0.1 ms absolute control tolerance. Short micro samples
and background work limit causal attribution, but these results do not pass the
acceptance gate. The candidate was restored exactly to the frozen source. No
speedup or no-regression claim is made for it. Full-state cloning, validation,
normalization and projection remain O(stored state).

## Retained tests and final restored checkpoint

Two test files and a small fixed legacy JSON fixture are retained. The fixture
contains the original callback algorithm and needs no Git metadata or ignored
archive during normal tests. Independent current/frozen runs each pass 241
cases. Added probes compare complete Proxy trap traces and sentinel identities,
dense/sparse arrays, own descriptors, poison keys, depth limits, graph cycles,
public snapshot/Data admission and pre-persistence server rejection. The Graphic
copy tests preserve malformed hidden state, late failures and override behavior.

After restoring the visitor, npm test/build passes **1,921 cases: 1,919 pass,
two expected platform skips, zero fail/cancel**, in 105.397 s. All 1,395 recorded
source/test/fixture/manifest/benchmark files remain unchanged during this run.
The 69 production core sources match the earlier qualified refactor exactly.
Existing package and desktop browser receipts therefore belong to unchanged
production code; no new browser, mobile, native Rust or WASM result is claimed.

No commit, push, release, publication or data cleanup was performed. The next
candidate is a separately gated local-only DataAccess point-write cache. Public
stamps alone cannot authorize it; it needs an owner-bound action receipt and an
unchanged full-refresh fallback.

Artifacts: [raw evidence](./evidence.tar.gz), [evidence hashes](./evidence-manifest.json)
and [restored source hashes](./restored-source.json).
