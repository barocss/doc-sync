# Final banner patch review

Read-only review of the test-only banner migration and deterministic live-child regression. Product source and staged WIP were not modified by this reviewer.

## Confirmed

- Twenty existing files / 22 regular-expression sites now require a complete ASCII URL port followed by LF or CRLF using a lookahead.
- Numeric capture groups and the complete URL match exclude the newline. Existing callers that use either match[1] or match[0] retain their previous return shape.
- Both startup-lifecycle readiness polling and its subsequent URL extraction use the new complete-line boundary.
- ASCII URL matching remains valid when UTF-8 bytes in the Korean banner prefix are split across data events.
- No successful recovery assertion, expected server sequence, history action or document-preservation check was weakened.
- Retention response parsing preserves JSON/status expectations and adds actual response URL, HTTP status, content type, and at most 256 UTF-16 code units of body prefix to parsing failures.
- The live regression uses the actual shared startDemo helper through an optional test-only child observer. The observer attaches before the helper's parser listener. Waiting for both stdout prefix and stderr gate plus setImmediate makes the premature-resolution assertion deterministic.
- Failure cleanup uses only its retained ChildProcess, checks exitCode/signalCode before signaling, awaits exit and the observed startup promise, and removes only its owned temporary directory. Child termination closes the real demo, control server and any owned decoy together.
- The preserved baseline fails the core admission assertion before the held suffix. The new helper passes and reaches the actual demo JSON API. This is a test-harness fix, not proof of the unknown historical MCP failure branch.

## Finding

The initial split-demo-banner fixture attempted to bind the digit-prefix decoy port unconditionally. That port can already belong to an unrelated local service. Its EADDRINUSE handler reported the error without releasing a gate or finishing startup, while the real demo stayed alive. This could add a new random 10-second startup failure to the regression itself. The parent authorized a bounded fix: make the decoy optional only for explicit EADDRINUSE, retain the suffix barrier and actual-origin assertions, and never send any request to the existing prefix listener. All other errors must remain failures. Closure review pending final fixture bytes.

## Evidence boundary

Initial reviewed receipt: output/publish-main-verification/banner-fix/receipt.json. Focused 8 PASS and one-case final live PASS are receipts supplied by the implementation lane, not new tests run by this reviewer. Final full workspace and typecheck verification belong to the parent.

The failed publication run did not preserve its response URL or port. The exact historical cause remains unbound to this parser defect. No claim connects the old MCP repeated-restart failure to the newly proven split-banner error class.

## Closure of occupied-prefix finding

Reviewed final hook SHA-256 `17d0fb05925471bd42be38cf14cadcc2f3924f7a423881017197d044b0dc4f7e` and live test SHA-256 `1e608d2a321274d952d6799eec01f4e585c0a74f6013c636a193c2179d6834c7`.

The decoy's explicit EADDRINUSE branch now records collision and continues to the control/held-prefix barrier without binding or contacting that prefix listener. Other listener errors terminate only the owned child with failure. A second live case first binds an owned prefix listener to exercise actual EADDRINUSE; if an unrelated listener already owns that prefix, the fixture leaves it intact and still exercises the same collision branch.

Both live cases retain the startup-pending-before-suffix assertion, actual-origin equality, real demo JSON API checks, and zero requests to any owned prefix listener. The test sends requests only to its owned control origin and the actual demo origin. All servers created by the hook remain in its owned child and end with that child. No other actionable issue was found.

**Source review: COMPLETE, no unresolved findings.** The final focused receipt and final full-workspace/typecheck status must be taken from their owners. This reviewer did not run an extra heavy suite or modify implementation files.
