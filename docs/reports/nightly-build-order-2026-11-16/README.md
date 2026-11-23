# Nightly build-order repair — 2026-11-16

Local-only repair; not committed, pushed or verified on GitHub Actions.
The current `properties.test.ts` and `long-fuzz.ts` import core `dist/crdt/*.js`.
The nightly workflow ran `npm ci` followed by direct `node` tests, bypassing the
root `npm test` pretest build. `npm ci` does not build these private workspace
artifacts. Consequently a clean runner can fail before tests start.

Both jobs in `.github/workflows/long-fuzz.yml` now run
`npm run build --workspace @barocss/doc-sync` after install and before testing.
This limits the new step to the core artifacts needed by both entry points.
Node version, seed matrix, operation budget, permissions, timeout, artifact
upload and existing typecheck step remain unchanged.

## Local verification

Using the already-installed Node22.19.0 (same version specified by CI):
core build, direct property suite and an8-peer seed1 smoke run with1024 requested
wire operations PASS. YAML parses; both jobs have install→build→test ordering.
The build script clears and recreates core dist, so this is a fresh artifact
build, not simply a missing-file existence check. All186 column comparison
source/binary hashes still match after rebuilding.

The tests used existing local dependencies on macOS, not a clean Linux npm-ci
runner. The full8×125000 nightly workload and remote Actions were not run.
This report therefore does not claim that the remote nightly is repaired or
that a million-operation CI gate has passed. See the adjacent logs/receipts.
