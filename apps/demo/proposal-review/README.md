# Local owner proposal review

An explicitly launched, single-owner review workspace for the existing bounded
hosted proposal protocol. The side-by-side supported editor is the ProseMirror
`/pm` demo (with its second peer editor). This does not add planner integration or
structural proposal support. The normal demo and bot processes do not launch it.

## Private setup

Run the document demo and a private hosted service with proposals and acceptance
enabled. Provision an owner grant with `read`, `proposal_read`, `proposal_decide`,
`proposal_accept` for one route. Keep that credential out of every bot environment.
Store configuration in a user-owned, non-symlink, single-link regular file with
exact mode `0600`. For example, using synthetic placeholders:

```json
{
  "enabled": true,
  "endpoint": "http://127.0.0.1:5020/mcp/team/document/reviewer",
  "token": "REPLACE_WITH_PRIVATE_OWNER_BEARER",
  "editorUrl": "http://127.0.0.1:5410/pm?doc=example",
  "document": "example"
}
```

The configuration owner must ensure the hosted route's `upstreamDocument` and
upstream refer to **the exact same document server and document shown by the
editor**. The editor `doc` parameter must equal `document`, but a hosted logical
route can alias another upstream: the bridge cannot infer that private mapping.
Do not use this demo workspace with an untrusted or differently mapped editor.
The editor must run at a separate loopback origin. Upstream owner endpoints may
use HTTPS or numeric loopback HTTP; redirects are rejected.

```sh
node apps/demo/proposal-review/bridge.mjs \
  --config /absolute/private/review.json \
  --access-file /absolute/private/new-review-access.txt
```

The command creates a new `0600` access file and refuses to overwrite an existing
file. Open its URL locally. Never publish, message, or put the access URL in a
report: it contains a short-lived, single-use bootstrap capability in its fragment.
The fragment is removed immediately. The owner bearer never reaches the browser.
No child process is spawned by the bridge and the token is not read from env.

The browser exchanges the bootstrap for a two-hour, origin-specific review session
kept in sessionStorage, not a cookie (localhost cookies cross port boundaries).
All API calls require that session header. Mutations additionally require exact
Origin, JSON content type and a CSRF header. The bridge checks exact Host,
Sec-Fetch-Site when supplied, fixed routes, strict decision bodies and 256 KiB
bounds. There is no CORS opt-in, public listener, arbitrary upstream proxy or
browser-controlled document selection. Failed upstream responses are generic and
successful responses reflecting the owner bearer are refused.

If bootstrap exchange or sessionStorage persistence fails, restart the bridge
with a new access file. Closing/restarting the bridge invalidates its session;
closing an in-flight approval **does not prove cancellation**. Reopen through a
new owner session and inspect the durable proposal record. Local users with the
same OS account can read the private configuration; this is not an OS sandbox.
General denial-of-service hardening and public production security are not claimed.

## Review and recovery

Inspect the before/replacement/context, path and block ID, exact revision/digest,
explanation, questions and unchecked references. Approve and Reject each require
a separate confirmation; Cancel and Close preview send no decision. Questions or
an identical before/after prevent approval. All proposal content is text, not HTML.

A decision UUID/digest is saved before transmission. Buttons lock during a request;
a Web Lock and a second saved-decision check coordinate same-origin review tabs.
A newer saved decision dismisses competing confirmations. Inspection uses the
server's original decision when reconciling, not an overwritten local UUID.

Lost responses stay unconfirmed. Refresh/reload inspects the stored record; it
never automatically reapplies or refreshes a proposal. Reconcile uses the original
UUID/digest and cannot start a pending proposal. If an approval never reached the
server, reconciliation can remain blocked: retain the original decision and use
the documented owner HTTP/CLI workflow, rather than inventing a fresh approval ID.
Stale/not-applied versions need a new proposal and independent review. Rejected
and applied versions are terminal in this UI.

The embedded editor receives accepted changes through synchronization. The review
UI does not call `edit` directly. Its human Undo is **not** proposal-actor Undo;
use the separately authorized actor-history owner workflow for proposal undo.

## Short verification

```sh
node --test apps/demo/proposal-review/bridge.test.mjs
node apps/demo/proposal-review/check-browser.mjs
```

The browser driver uses the repository's `agent-browser` convention and installed
Google Chrome on macOS, with an isolated synthetic fixture. Its receipt and
screenshot are written under ignored `output/proposal-review-browser/`; no private
bearer or bootstrap URL is written there. No actual-model or long-load claim.


### Browser stream budget

Only one tab per owner bridge mounts the live editor, using an origin-scoped Web
Lock. Other review tabs remain review-only and can open the editor after its owner
tab closes. This avoids multiplying the ProseMirror demo's two long-lived SSE
streams for each review tab. The tested flow keeps a separate peer editor page and
an additional review-only tab open while verifying final convergence. Arbitrarily
many independently launched editor pages can still exhaust a browser's HTTP/1
per-origin connection budget; this workspace is not a general connection pool.
