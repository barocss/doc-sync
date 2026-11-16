# Zod migration compatibility boundary

Issue: https://github.com/barocss/doc-sync/issues/8

MCP and SDK dependencies now resolve one Zod 4.6.7 installation. SDK 1.32.2 stays
unchanged and its declared range accepts v4. Four record schemas have explicit
string keys. Two nested hosted configuration objects use prefault({}), not v4's
short-circuiting default({}), so omitted/empty/partial settings still populate all
body/session/time limits and keep proposal capabilities disabled.

Historical v3 uuid() accepted version-agnostic hexadecimal 8-4-4-4-12 identifiers.
The migration uses guid() to retain that stored decision/attempt ID contract,
rather than silently rejecting old evidence with stricter v4 UUID version rules.
Proposal/evidence shapes, canonical digest and stored format are not rewritten.

Actual tools/list comparison identified intentional representation changes:
inline formerly referenced path schemas, disjoint edit op oneOf instead of anyOf,
string propertyNames on records, explicit safe-integer maxima, and GUID pattern.
Required fields, strict additionalProperties, nullable positions, edit operation
variants and array bounds are checked using a real SDK client. Existing valid and
invalid tools/call plus proposal accept/reject/reconcile/process-restart tests
provide further compatibility evidence; no historical production data was read.

New regression tests cover omitted/empty/partial security defaults, historical
ID parsing, actual SDK schema/invalid calls and a bounded invalid collection in a
96 MiB / 5-second child. The latter is deliberately small, not a universal DoS
proof. Safe integer rejection is intentional; unsafe numeric inputs are not a
supported compatibility promise.

Audit reports zero known vulnerabilities for the final frozen lock. SDK protocol
schemas import zod/v4; zod-compat still imports the bundled v3 compatibility API,
but dispatches this application's v4 schemas through v4. Mere presence of that
legacy API is not evidence of exploitation, and audit zero does not prove every
resource exhaustion path safe. Host authentication and body caps remain essential.
No long-duration load or exhaustive denial-of-service testing was performed.

Final verification: frozen npm ci --ignore-scripts and workspace build PASS;
MCP 213 PASS / 0 FAIL / 2 platform-specific skips on macOS; bot 92 PASS;
bridge security 6 PASS; root TypeScript PASS. Independent code review confirmed
record/default/ID compatibility changes and found no blocker for this scope.
