# Bounded planner context: stored text-block slice

Issue: https://github.com/barocss/doc-sync/issues/5

Built independently on main revision 8462acd, without the inherited native WIP.

## Bounded implementation

`--planning-path` / `BotOptions.planningPath` opts into one complete stored text
block. The planner sees an explicitly partial wrapper, absolute path, stored ID
and node, not unrelated document subtrees. The existing MCP slice tool enforces
one-child/2048-node/32768-text-unit/128 KiB result limits. Sibling cursors are not
followed and oversized targets are not truncated.

ID, path, epoch and schema fingerprint are persisted before planning. Changed or
incomplete bindings fail closed, including after process restart. Synthetic and
structural targets are unsupported. Only text-position string insert/delete and
non-type-changing update are permitted; implicit structural insertion, node
updates, moves, split/merge and out-of-scope inspection are rejected.

Full document reads remain inside the runner. Completion still uses settled,
authoritative revision and full-model brief verification. This is a planner
context bound, not server authorization or a secrecy boundary. Existing replay
protection remains active. General structural subtree planning and automatic
relocation of moved targets remain future work.

## Verification

Node 22.19.0, isolated checkout with locked dependencies:

- Complete bot suite: 78 PASS, zero failures/skips, about 19 seconds.
- Real runner cases: document larger than 512 KiB with a small selected target;
  peer change outside the target; same-path replacement; out-of-scope edit;
  oversized target rejected before planning; process kill/resume with stable
  binding; confirmed edit repetition rejected after resume.
- Existing MCP bounded tool-result and stale/forged cursor regressions PASS.
  The planner intentionally uses one page, not a multi-page concatenation.
- Root TypeScript PASS; docs build/check PASS (55 pages, 2610 internal links).
- Independent read-only review identified implicit-split/type/grouping and
  incomplete-resume-binding risks. The final text-only guard and pair validation
  address them; regression tests cover both categories.

These are deterministic test planners, not an actual-model evaluation. No
long-duration load, general context retrieval, full B2 completion or performance
claim is made. Initial fixture typing failures remain local, not passing evidence.
