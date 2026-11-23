# Source preservation and project cleanup

The user requested pushing all accumulated work, then removing this project's
working directories and sessions to recover disk. The source checkpoint was
merged with52 already published commits. Both README/public-roadmap conflicts
were resolved by retaining remote AI/schema work and bounded native SDK content.
No CRDT collaboration rule was changed for cleanup.

## Preserved work

- Main contains the integrated source, tests, guides and sealed verification
  reports. The local ID catalog is a prototype; general native commands, sessions
  and production WASM delivery remain open.
- [Secondary recovery index](secondary-recovery-index.md) lists23 remote archive
  refs, including dirty source snapshots and exact ignored source/evidence inputs.
  These backups preserve independent work; they are not a claim that every
  independent experiment is merged into the production API.
- [Evidence upload](evidence-upload.md) binds31 original sealed archives,
  1,046,335,543 bytes, uploaded in eight verified chunks. Original seals and
  archive contents remain unchanged.
- [Private backup manifest](private-backup-manifest.json) records metadata only.
  Private runtime data, journals, configuration and prompts are kept locally in
  `/Users/user/github/doc-sync-private-backup-20261123.tar.gz` with mode0600.
  Its841,422 bytes contain322 regular files; all readback hashes are verified.
  Private files are not in the public Git history.
- Historical catalog-only receipts were copied unchanged into
  [catalog evidence](catalog-prototype-evidence/README.md) before ignored output
  removal. This does not turn the old prototype evidence into full qualification.

## Verification boundary

Fresh native core194/SDK196 and the local catalog example PASS. The merge did
not change the tested native source bytes. Final merged workspace: 2503 PASS / two expected platform SKIPs / zero
failures. Typecheck and docs build/checks PASS: 58 pages / 2,909 internal links.
The extracted catalog guide consumer also passes. Cleanup results are bound in
the final checks and receipts in this folder. No mobile, Chrome, performance, npm publication or new WASM validation
was run for this cleanup.

Initial npm attempts used installed Zod3.25.76 while code/lock required4.6.7;
MCP failed with `z.guid is not a function`. These partial attempts were stopped
and preserved separately. The first npm ci failed on the shared cache's EACCES.
A project-local cache refresh installed the exact lock, and the focused failing
process test then passed without source or lock changes. Final suite results
must be read from the later locked-dependency run, not the interrupted attempts.

## Restore

```sh
git clone https://github.com/barocss/doc-sync.git
cd doc-sync
git fetch origin 'refs/heads/codex/archive/20261123/*:refs/remotes/origin/codex/archive/20261123/*'
# Pick an exact snapshot from secondary-recovery-index.md:
git switch -c restored-work origin/codex/archive/20261123/doc-sync-bindings
```

For the final integrated library, use main. Independent backup branches retain
their original source structure and commit parent; validate an experiment before
merging it. Extract the private local archive only into an explicit recovery
folder after inspecting its member list.

## Cleanup

The approved targets are the exact24 registered project worktrees, their build
outputs and temporary state, plus the old project-owned browser session.
Secondary removal checks remote refs, original source hashes and all retained
inputs before calling git worktree remove. The primary checkout is removed only
after the final main SHA is verified remotely. Other projects and their browsers
are outside this deletion scope. Codex chat deletion uses the app's delete tool;
any required composer approval is separate from filesystem cleanup.

## Verified cleanup checkpoint

All 23 secondary worktrees were removed after final source, private-archive and
remote-SHA gates passed. An additional 493 ignored source/evidence paths were
found and preserved through 11 descendant archive commits before deletion;
1,022 canonical restore mappings are recorded. The old project browser tree
(12 processes) is inactive. All 145 inventoried temporary targets and the empty
thread visualization directory were removed.

The external process-tracking hook lost its referenced script during cleanup.
No hook configuration was changed. Final record publication uses the GitHub
connector; remaining filesystem cleanup uses the filesystem API without
launching another process. The primary checkout is removed only after that
final commit and its tree are verified remotely. A compact final receipt is
kept beside the private archive outside the removed checkout.
