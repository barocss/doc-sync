# Documentation maintenance

Documentation is part of the public API contract. A package example must work
against its declared export paths and peers, and describe what the code does
now rather than what a roadmap intends.

## Where to edit

| Source | Responsibility |
| --- | --- |
| Root `README.md` | First run, package selection, integration path, support boundaries |
| `packages/*/README.md` | Independently readable package setup, example, lifecycle, public API and limitations |
| `apps/docs/src/guide` | Detailed guides and integration recipes |
| `apps/docs/src/schemas` | Document, graphic and spreadsheet schema contracts |
| `apps/docs/src/ai` | Bounded reads, proposals, hosted MCP and bot limits |
| `docs/` | Specifications, design decisions and scoped roadmaps |
| Maintainer handoff and benchmark reports | Dated implementation/verification history, not current release guarantees |

`apps/docs` prepares generated content before building. Edit authoritative source
specifications in `docs/`, not their generated copies. Do not commit site `dist`
outputs. New guide pages need a sidebar entry and descriptive cross-links.

## Package README checklist

Every library package should state:

1. Its exact name, purpose, required peers and supported runtime.
2. Its actual availability. All ten packages currently remain private `0.0.0`
   workspaces. Local tarball installation is not registry publication.
3. An example with imports, setup, schema/store requirements and cleanup. Mark
   dependent fragments as fragments; do not silently omit required host state.
4. History/selection ownership, synchronization responsibilities, and whether it
   needs a DOM, framework compiler or browser mount lifecycle.
5. Security and unsupported behavior, including experimental/native distinctions.
6. Links that work when the README is read outside the monorepo. Use full public
   documentation URLs for guides in packed package READMEs.

Editor bindings do not provide authentication or storage. Presence geometry is
host-owned and ephemeral participant state is not access control. A passing
schema handshake is not proof of renderer or command coverage.

## Validate changes

From the repository root on Node 22.18+:

```sh
npm ci
npm run check:readmes
npm run typecheck
npm test --workspace @doc-sync/docs
npm run docs:build
npm run docs:check
npm run check:packages
```

`check:readmes` checks every library README against its manifest, verifies local
link destinations, and typechecks and executes the actual first TypeScript code blocks in the
root, core and four editor READMEs. The editor examples use JSDOM. It does not
compile arbitrary Markdown fragments, resolve remote URLs, check anchors, or
prove real-browser behavior. Framework Presence examples should additionally be
checked with their package lifecycle/SSR tests and isolated package consumers.

`check:packages` packs compiled artifacts and installs independent consumers to
verify export/type/peer behavior. It does not publish. Documentation build/check
covers generated pages and site links. Run the relevant browser checks separately
for real editor behavior, and report them as not run if they were not performed.

Do not describe bounded synthetic cases as actual-model quality evaluation, or
short tests as long-duration load qualification. Record the exact tested commit,
commands, pass/fail results and omitted checks in the issue or change summary.
