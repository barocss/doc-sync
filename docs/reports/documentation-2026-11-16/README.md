# Package documentation verification (2026-11-16)

Issue: [#21](https://github.com/barocss/doc-sync/issues/21).
Baseline: `a838eea`; documentation-only concurrent report `b6adfde` integrated
before the final push. No runtime library code or original checkout WIP changed.

## Changes

- Replaced the historical root README with a first-run/package-selection guide.
  Earlier verification remains in handoff and benchmark reports, not recast as
  current production evidence.
- Expanded all ten package READMEs with local unpublished package setup, peers,
  examples, lifecycle, schema/history/Presence/security and support limits.
- Removed stale Slate/Lexical compatibility-subpath claims from the site.
- Added documentation maintenance guide/sidebar and `check:readmes` command.
- Independent review caught optional/union accesses in the core examples;
  corrected them and added strict TypeScript snippet verification.

## Final checks

Runtime: Node 24.22.1 on macOS. Repository requirement remains Node 22.18+;
this change did not separately rerun Node 22 qualification.

| Check | Result |
| --- | --- |
| `npm run check:readmes` | PASS: 11 READMEs, package/peer coverage, local links; 6 actual TS snippets executed and strict-typechecked |
| `npm run typecheck` | PASS |
| Docs workspace tests | PASS: 43/43 |
| `npm run docs:build` | PASS; existing bundle-size warning remains |
| `npm run docs:check` | PASS |
| Five Presence workspace tests | PASS: 13/13 across DOM/lifecycle/SSR suites |
| `npm run check:packages` | PASS: ten packed packages, 12 isolated consumer cases |
| `git diff --check` | PASS |

Initial concurrent build-dependent checks raced while replacing generated `dist`
files. Those runs were discarded and rerun sequentially successfully. An initial
site check also rejected a maintainer-handoff filename reference on the new page;
the page wording was corrected and the site rebuilt/rechecked. Final checks above
refer to the corrected tree, not those initial failures.

## Not claimed

No registry publication, real browser/OS IME verification, real-model evaluation,
long-duration load test, new production deployment or native Rust/WASM client
support. README editor snippets use JSDOM. Presence framework README fragments
are supported by existing lifecycle/SSR and isolated-consumer tests, not a new
full five-framework real-browser scenario. Link checks cover local destinations;
they do not validate every remote URL or README anchor.
