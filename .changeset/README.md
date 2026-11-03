# Release notes

Use `npm run changeset` to record changes to one or more of the five library packages.
Versions are independent: a binding-only fix does not require matching sibling versions.

`npm run release:status` shows the proposed version changes. `npm run release:version`
changes local versions, dependency ranges, and changelogs. It does not publish.
Use `npm run check:release` for a temporary-copy version rehearsal that leaves the
checkout versions unchanged. Read [the release guide](../apps/docs/src/guide/releasing.md).

All packages remain private until the first release is approved. Apps and benchmarks
are ignored by Changesets and stay private. There is no publish script or automated
registry publication workflow. Do not run `changeset publish` during preparation.
