# Bounded generated document schema contract

Run with Node 24 from the repository root:

```sh
node --test experiments/runtime-document-schema-contract/test.mjs
```

This experiment imports TypeScript source directly. It does not build packages
or add dependencies. `generateCases()` returns six deterministic, fresh JSON
fixtures. Each fixture contains `seed`, `schema`, `groupModel`, `gridModel`,
`cellGroupModel`, `initialModel`, `edits`, `expectedModels` and `expectedModel`.
`generateCase(seed)` and `reproduce(seed)` rebuild one exact fixture.
`exportReproducer(seed)` returns JSON with a SHA-256 expected-model hash.

Type, attribute and mark names vary with the seed. Cases contain scalar group
attributes, levels, structured cell fields, UTF-16 text and 1–2 rows/columns.
Commands insert a group at `[1]`, a grid at `[2]`, then a group at
`[2, 0, 0, 0, 1]` in the first cell body. All paths are logical model paths.

`applyEdits` supplies the existing pure model oracle independently from command
compilation. Closure and renaming checks validate the fixture contract. They
do not independently prove that the model oracle itself is correct. Exact
reproduction, mutation isolation and explicit final-path assertions supplement
that oracle. Native authoring comparisons must execute these fixtures separately
before a native PASS is claimed.

No generated delivery schedules, reducer, automatic shrinking, native execution,
server recovery, browser binding, WASM or mobile evidence is supplied here.
Complex schema references, text:false, computed custom rules and mixed structured
attribute maps are outside this subset. Q2.2 can add validity-preserving reduction
and causal command scheduling after this fixture/API boundary is frozen.
