# Documentation app

This private npm workspace builds the public doc-sync documentation with VitePress. The library remains one package: `@barocss/doc-sync`.

## Commands

Run from the repository root with Node.js 22.18 or later:

```sh
npm ci
npm run docs:dev
npm run docs:build
npm run docs:check
npm run docs:preview
```

Preview uses Vite's static preview command because the current VitePress preview command ignores `--host` and prints port `0` literally. The development and preview servers bind to `127.0.0.1`. Open the printed URL under `/doc-sync/`. Use `-- --port <port>` with `docs:dev` or `docs:preview` to select an unused port. Build output is `apps/docs/dist` and is ignored by Git.

## Content

- `src/` contains the English guides, API overview, status, and performance summary.
- `docs/spec.md`, `docs/collaboration-intent.md`, and `docs/edit-api.md` are the authoritative contract sources. `prepare:content` copies them to ignored reference pages before development and build.
- `scripts/check-build.mjs` checks the rendered language, local paths, internal assets, links, and fragment targets.
- `test/content.test.mjs` executes the quick-start example against the actual workspace package and checks reference preparation. `test/blocks.test.mjs` executes the 11 schema-driven block examples, including hidden-cell preservation and fixed concurrent-Enter outcomes.

Do not edit generated reference pages or publish HANDOFF/local validation logs as site pages. Keep real Unicode/IME sample data unchanged when translating prose. Historical benchmark JSON, archives, source snapshots, measurements, and original manifests remain evidence; a documentation translation is not a new measurement.

## Dependency version

VitePress is pinned to `2.0.0-alpha.20`, the version used by the current official VitePress documentation. It is a prerelease. The initial stable `1.6.4` candidate was rejected because its transitive development-server dependencies had known audit findings. The final pinned toolchain passed a clean npm audit and is isolated from the library's runtime dependencies. Changes to this version require build and browser verification.

## GitHub Pages

The public URL is <https://barocss.github.io/doc-sync/>. The repository Pages source is GitHub Actions. `.github/workflows/docs-pages.yml` builds and checks changes on pull requests, then deploys successful builds from `main` and manual dispatches. Pull requests never deploy.

The workflow uploads only `apps/docs/dist`. It uses GitHub's Pages artifact and OIDC deployment actions. It does not require a third-party hosting account or deployment token. Keep `base: "/doc-sync/"` in the VitePress config so assets, search, and deep links work under the repository path.
