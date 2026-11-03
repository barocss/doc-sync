# Release preparation

The library has ten independently versioned packages:

| Package | Responsibility |
| --- | --- |
| `@barocss/doc-sync` | Document engine, clients, History, synchronization, server, and editor-host contracts |
| `@barocss/doc-sync-prosemirror` | ProseMirror binding and conversion |
| `@barocss/doc-sync-tiptap` | Tiptap extension, using the ProseMirror binding |
| `@barocss/doc-sync-slate` | Slate binding and conversion |
| `@barocss/doc-sync-lexical` | Lexical binding and conversion |
| `@barocss/doc-sync-presence-ui` | Framework-free Presence DOM renderer |
| `@barocss/doc-sync-presence-react` | React components and hooks |
| `@barocss/doc-sync-presence-vue` | Vue components and composables |
| `@barocss/doc-sync-presence-svelte` | Svelte component and readable store |
| `@barocss/doc-sync-presence-solid` | SolidJS components and reactive snapshot accessors |

The engine has no runtime dependencies or editor peers. Install only the binding
you use and its declared peers. The old `@barocss/doc-sync-core` package and
`@barocss/doc-sync/prosemirror`, `/tiptap`, `/slate`, and `/lexical` subpaths are
removed. See [Packages and engines](./packages) for the import migration.

All ten packages are currently private at `0.0.0`. The apps, documentation,
benchmarks, and Rust experiments remain private development workspaces. These
instructions prepare releases; they do not establish an npm publication.

## Changesets workflow

[Changesets](https://changesets.dev/guide/cli) is a development dependency. It
collects release notes and prepares versions, changelogs, and internal dependency
ranges. Applications that install the library do not need Changesets.

Use Node 22.18 or later in the 22.x line, or Node 24.x, for the release tools.
The library's own Node engine requirement is declared in its package manifest.

```sh
npm ci
npm run changeset
npm run release:status
```

Select only the packages changed by your work. A Slate-only fix normally needs
a patch changeset for `@barocss/doc-sync-slate`. It does not require a new core or
other binding version. A core contract change can require binding changes too.
Check the actual peer ranges rather than assuming all versions must match.

The configuration has no fixed or linked version groups. It can version the
ten private library candidates during preparation, while `@doc-sync/*` apps
remain ignored and private. It does not create commits or private-package tags.
See the [configuration reference](https://changesets.dev/guide/config).

## Rehearse without changing checkout versions

```sh
npm run check:release
```

This command copies manifests and changesets into a temporary directory. It
runs the real Changesets status/version commands there. It checks an initial
`0.1.0` plan, compatible internal peer ranges, retained private flags, unchanged
app versions, and a later Slate-only `0.1.1` patch. It verifies that the source
manifests and lockfile did not change. The receipt is written to
`output/release-preparation/report.json`.

The checked-in minor changesets describe the core/binding transition and optional
Presence components. It
does not mean these versions have been assigned or published. When the initial
version changeset has been consumed, replace this first-release rehearsal with
the plan appropriate to the next release.

To prepare reviewed versions in a release checkout later:

```sh
npm run release:version
npm install
npm test
npm run typecheck
npm run check:packages
npm run docs:build
npm run docs:check
```

`release:version` changes local files. It does not publish. Review the generated
changelogs, versions, lockfile, and peer ranges before committing them. A future
beta needs a separate prerelease plan; the current stable rehearsal does not
qualify beta dependency ranges.

## Check the installable artifacts

```sh
npm run check:packages
```

This builds and packs five tarballs, then installs them into isolated temporary
consumers. It checks ESM and type exports, absence of source `.ts` imports,
dependency-free core loading, each editor binding, native editor integration,
and an independent binding patch. `npm pack` creates local files; it does not
publish to the registry. Do not run this command concurrently with tests that
load `dist`, because prepack deliberately clears and rebuilds each output.

## Before the first npm publication

The remaining decisions are the project license, first stable or prerelease
version, and npm account or trusted-publishing configuration. Add the chosen
license and package metadata before publication. Recheck package name ownership,
all peer ranges, the packed contents, and the final tests. The current workspace
also has a pre-existing Zod advisory in the private MCP application; it is not a
runtime dependency of the library packages and needs its own compatibility
review before deploying that application.

Only after the release is approved should the selected library manifests
be made publishable. Keep apps and benchmarks private. There is no publish script
or automatic npm release workflow in this preparation. No `npm publish` or
`changeset publish` command is run by the checks above.
