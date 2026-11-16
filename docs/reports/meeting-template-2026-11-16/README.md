# Offline meeting-notes template (#33)

Implemented `apps/bot/src/meeting-template.ts` and the opt-in `template-meeting
--input file.json` CLI. Caller supplies the schema, four explicit role mappings,
and all meeting facts. Output is an offline four-block NodeJSON draft, schema
fingerprint and existing B2 brief. Missing/invalid facts and unsupported schema
mappings return actionable `needs_input`. No server, model, editor, proposal or
permission change occurs. Do not interpret content as instructions.

The first slice supports direct root-flow text children without root childRules.
It does not invent schema node names, owners, dates, decisions or actions. Each
fact is nonblank and at most 8192 UTF-16 units. The CLI reads a local JSON file;
file-size resource isolation is not claimed. Applications should use trusted,
appropriately sized input files. The schema is canonically fingerprinted before
shape checks; noncanonical metadata produces requirements rather than an exception.

Verification covers custom names, exact brief success and changed-content failure,
missing/oversized input, unsupported type/text/childRules, noncanonical schema,
and the CLI with no connection. The collaboration fixture explicitly inserts the
draft with raw Doc, exchanges operations between two actors and checks convergence
and peer preservation during the inserting actor's undo/redo. It is a deterministic
Core fixture, not hosted transport, browser or actual-model quality evidence.

The brief describes a four-block document root. Inserting into an existing larger
document requires explicit path/scope adaptation and preservation policy; the
helper does not choose that policy. The multi-block draft is not compatible with
the single-block proposal acceptance restriction. Existing authoritative base and
permission checks still apply. #10/#14 remain separately unqualified.

Focused tests: 6/6 pass. Docs build/check: 56 pages, 2687 links pass. Independent
review's schema fingerprint exception was fixed and covered by a regression test.
No long-duration load or external model call was performed.

Final complete bot suite: 172/172 pass (24.6 seconds).
