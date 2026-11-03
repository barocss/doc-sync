# Focused independent review closure

The reviewer reproduced P1 (TS property/value override cross-merge) and P2
(native slash-actor admission). Fixes were reviewed and rechecked. The reviewer
did not retain raw files; observations are captured here from tool messages.

P1: `node --test packages/doc-sync/test/graphic-builtins.test.ts` returned0,
12tests/pass12/fail0. Atomic assignment regression covers both orders, later
reference writes and selective undo/redo. Raw TS core AttrSpec outer-object
validation remains an explicit semantic-helper boundary.

P2: isolated stable `cargo build --manifest-path experiments/rust-shadow/Cargo.toml
--target-dir /tmp/doc-sync-domain-review-target-20261103 --quiet` returned0.
A Python driver created actor A, inserted valid rectangle1@A, captured state,
and attempted rectangle birth2@peer/invalid and a move with that actor. Both
Canvas/Builtins returned ok:false; snapshots remained unchanged. No raw driver
or log was saved. Final owned native regression logs independently cover actor
and atomicity behavior. This focused closure does not certify the full profile.
