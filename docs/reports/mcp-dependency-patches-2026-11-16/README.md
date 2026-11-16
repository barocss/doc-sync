# MCP dependency patch subset

Issue: https://github.com/barocss/doc-sync/issues/8 (remains open)

Only two lock entries changed: hono 4.13.14 → 4.13.18 and
@hono/node-server 2.1.5 → 2.1.8. Both satisfy the existing MCP SDK 1.32.2
ranges; the SDK, Zod and all other locked dependencies remain unchanged.

The native hosted ingress reaches the SDK's Streamable HTTP transport and
node-server request adapter. Host/Origin/bearer/route/body checks remain in front.
The current app does not expose WebSocket upgrade or identified Hono middleware
paths mentioned by the advisories; exploitability is not asserted either way.

Verification: frozen npm ci --ignore-scripts, package build and root TypeScript
PASS. Full MCP suite: 209 PASS, 0 FAIL, 2 platform skips (unsupported-platform and
Linux-helper checks are skipped on macOS). Proposal bridge security: 6 PASS.
The existing hosted suite includes wrong credentials/Host/Origin, malformed JSON
and oversized body rejection before upstream access. No long-duration load run.

Audit now reports only Zod (one high-severity package entry), rather than the
previous three vulnerable package entries/eight advisories. This is not full
security remediation. #8 stays open for separately reviewed Zod major migration.
That migration must preserve nested config defaults and generated tool schemas;
blind audit fix --force is not part of this patch.
