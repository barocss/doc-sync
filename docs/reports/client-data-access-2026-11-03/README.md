# Map/List access on Client

The existing Client now provides Map/List access. The separate unreleased
DataClient and DataClientOptions exports were removed. This report qualifies
the current working tree over main 9334e591e25e9ff641eed8c6cd7c65ce9de4724a.
It does not describe a commit, push, deployment or npm release.

```ts
import {Client} from '@barocss/doc-sync/client';
import {createDataSchema} from '@barocss/doc-sync/data';

const client = new Client({schema: createDataSchema(), actor: 'author'});
client.data.root.set('title', 'Project');
const tasks = client.data.createList();
client.data.root.set('tasks', tasks);
const taskId = tasks.push('Design');
client.undo();
client.redo();
tasks.set(taskId, 'Review');
const saved = client.captureState();
const reopened = Client.fromState(saved, {schema: createDataSchema()});
reopened.data.getList(tasks.id);
```

## Ownership and compatibility

Three Sol Medium lanes implemented the API, migrated six existing test files and
independently reviewed its boundaries. Root integrated consumers, docs and full
workspace verification. Inherited working changes and prior evidence remain.

- Client owns backend, transport, pending edits, observers, History and save/open.
- Client.data is a stable lazy namespace. It adds no backend or subscription.
- SharedData is a type, not a public constructor. It provides root,
  createMap/createList/getMap/getList. It has no lifecycle/history forwards.
- createDataSchema selects the existing fixed encoding. Other domain models are
  not converted. Cached namespaces and retained handles reject after a schema
  transition away from that exact identity.
- Local write policy is configured through ClientOptions.data.validate. It is
  captured privately, blocks mutation reentry and must be resupplied on restore.
  Raw Client.edit intentionally bypasses that optional business policy.
- Same-Client references remain valid; foreign Client handles reject.
- Existing IDs, local state format, schema fingerprint and undo arbitration are
  preserved. Collection allocation remains structural and outside undo.

Eight engine/schema/server files match the prior P2 source seal byte for byte:
data/schema.ts, data/admission.ts, server/data.ts, server/hub.ts, crdt/doc.ts,
crdt/history.ts, crdt/schema.ts and local/client.ts under packages/doc-sync/src/.
The fixed schema identity remains
sha256:96b65879a3d426ab2aeeeb7e60b02e207ba5bfb66e9b211f14b2707be972f23f.

createDataHub still rejects malformed values/references and duplicate retained
IDs before persistence/application. Generic DocHub and Schema rules are
unchanged. Guarded data GC remains disabled: tombstones reserve IDs and storage
can grow. This API change does not complete metadata-aware compaction, resource
limits, P2 restart qualification or P4 storage/schema extraction. Map strings
remain atomic; existing text nodes handle collaborative text.

## Verification

| Check | Result |
| --- | --- |
| Final full workspace | 1635 cases: 1633 PASS, 2 expected platform SKIP, 0 FAIL |
| Core | 1193 PASS, including new implementation5 and independent14 |
| Bindings/Presence | Lexical7, React2, Solid3, Svelte2, UI4, Vue2, Slate4 PASS |
| Apps | Bot53, Demo141, Docs43 PASS; MCP181 cases/179 PASS/2 SKIP |
| Migrated data tests | 60/60 PASS; included in full workspace, not extra cases |
| Actual HTTP/SSE | Six cases PASS: three P1 collection and three P2 admission |
| Build and final root TypeScript | PASS |
| Package installation | Ten tarballs, twelve runtime/type consumers PASS |
| Changesets rehearsal | PASS; temporary versions only; manifests/lock unchanged |
| Documentation | 43 tests, build, 55 pages/2600 internal links PASS |
| Fresh browser/mobile/performance measurements | NOT_RUN |

Commands used Node24.22.1: npm run build; npm run test --workspaces
--if-present; npx tsc --noEmit; node scripts/check-package-artifacts.mjs;
node scripts/check-release-preparation.mjs; npm run docs:build; npm run docs:check.
See archived logs for exact outputs. Package checks install tarballs and exercise
Client.data save/open/undo/redo, types and removal of the DataClient export.
All actual packages remain private0.0.0.

Real loopback HTTP/SSE tests preserve convergence across three actors, list moves,
undo/redo, pending reconnect, rejection before append, corrected same-sequence
retry, exact idempotent retry and conditional/recovery paths. Accepted journals
replay into fresh in-process guarded hubs. Final guarded journal receipts show
11 ordinary, 16 collaboration and 2 conditional/recovery accepted appends with
matching SHA256 values. The migration lane receipt is explicitly not source
frozen; final-source-sha256.json and final-artifact-sha256.json qualify the final
full run's artifacts instead. This is not a new full-process data durability test.

## Initial bot timeout and diagnostic change

The initial full workspace run had 1632 PASS, one FAIL and two SKIP. The sole
failure was the unknown bot/server restart case reaching its existing15-second
conditional barrier timeout. Its original cause is NOT_PROVEN: the fixture had
removed temporary mission/journal state. Do not label it a proven product defect
or a proven flake.

The focused case passed1/1. The unmodified runner passed8/8. A narrow test change
now reports early worker exit, persisted mission state and proxy requests on
barrier failure. It preserves the15-second barrier,60-second case limit and all
assertions. No bot production code changed. The diagnostic runner passed8/8 and
the final full workspace passed as listed above. Both full-run logs are archived.

## Evidence

source-seal.json hashes the final maintained sources and this report. The
evidence-index.json lists compressed logs and HTTP/package/release receipts,
with original and archive SHA256 values. Final HTTP source/artifact hashes live
inside the archived client-data-proof evidence. Earlier reports retain their
original snapshots. No user browser or service was changed for this refactor.
