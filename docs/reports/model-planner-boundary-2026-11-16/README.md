# Creator model-planner boundary: design review

Date: 2026-11-16. Status: **design only; issue #10 remains open**.

No production adapter was added, no provider/model was invoked, and no credentials, private provider configuration, or authentication files were inspected. This review inspected repository source only. It does not establish actual-model safety or quality results.

## Observed implementation versus proposed boundary

Existing `apps/bot/src/codex.ts` starts a local Codex command without explicit `env` or `cwd`, so the child inherits both. Its read-only sandbox flag and instruction not to use tools are not proof that the child cannot read credentials, local files, or environment variables. Error handling includes captured stderr. This code is not an isolated creator planner and must not be reused under that claim.

The existing creator path is deliberately different:

- `apps/bot/src/proposal-planner.ts` accepts an injected function, validates bounded output, assigns the authoritative base/target/request ID itself, and durably saves the exact request before creation.
- `apps/bot/src/proposal-plan-input.ts` reads a private prepared JSON plan as data, not executable code.
- `apps/bot/src/proposal-client.ts` exposes only authorized target capture and proposal creation. A created acknowledgement is not document application.
- `apps/bot/src/main.ts` currently uses prepared plan data for `proposal-plan`. It does not demonstrate an actual model generating a proposal from a captured target.

The existing focused `proposal-client` + `proposal-planner` regression was reported by the coordinating reviewer as 6/6 PASS on this date (about 0.3 seconds). This is existing-boundary regression evidence, not proof of a provider adapter or actual-model behavior.

These are existing guarantees, not evidence that an arbitrary injected JavaScript callback is isolated. Such callbacks execute inside the trusted application process and must themselves be trusted code.

## Recommended smallest implementation

Use a trusted, tool-free HTTPS adapter rather than launching an agent subprocess. The trusted runtime would capture the target first and construct a provider request containing only the brief and bounded plain text, plus fixed instructions and output-format constraints. The model need not receive the document route, target path or block ID, base revision, mission filename, creator bearer, or owner credentials.

The adapter would hold the provider credential only in transport authentication. Never put credentials in prompt content, arguments, diagnostic output, model-visible tools, or persisted mission data. Do not allow the model or document content to select the destination, authentication, model configuration, or request headers. Provider output is untrusted data, not executable code or new authority.

Required transport and execution limits:

1. An explicitly approved fixed HTTPS provider destination and model; reject redirects and runtime/model-selected URLs. No arbitrary proxy destination option in the initial slice.
2. No shell, local child, tools, remote MCP, browsing, filesystem interface, or conversation/session continuation supplied to the model.
3. Explicit request and response byte limits, timeout, output-token limit, and bounded call count. Provider-specific details must be verified against official documentation before implementation; none are assumed here.
4. Strictly validate the response envelope and one JSON result. Reject extra fields, unsupported tool calls, malformed/truncated output, refusals that do not satisfy the contract, invalid offsets, split surrogate pairs, and no-op or unsupported replacements. Provider structured output is not a replacement for local validation.
5. Preserve the existing runtime-owned base, path, block ID, request ID and exact durable request. A failed or uncertain create must not cause another model call, a fresh request ID, or silent rebase. Existing server checks remain authoritative if the document changes after capture.
6. Treat generated explanations and replacement text as untrusted text in the owner UI. Keep creation and application separate; this adapter cannot approve, reject, reconcile, edit, or upgrade schema.

The initial scope remains the existing stored, root-level, unstyled plain-text target. Omitting schema/attributes from provider input does not enable structured targets. The present `ProposalPlanner` contract requires a replacement and has no explicit no-change/refusal result. A future adapter must define typed abstention and a safe mission outcome separately for missing information or refusal; it must not manufacture a replacement or encode refusal as a no-op, which the current runtime rejects. That contract is proposed, not implemented here.

This is a model-authority boundary, not isolation from a malicious trusted Node dependency or compromised host. The provider receives the approved text and may generate incorrect or adversarial content; the owner must still review the stored proposal.

## Authorization and real-model gates

Implementation with synthetic/mock responses can proceed without invoking a model. Before any actual provider request, establish:

- Which provider and account receive the data, and which model is permitted.
- The specific text/brief allowed to leave the application. Approval for public synthetic fixtures is not permission to transmit unrelated private documents, sensitive personal data, or credentials.
- Permission to use the selected API credential for that provider/account. Do not discover or reuse unrelated local authentication merely because it exists.
- A concrete cost/call/token budget and any applicable account or service restrictions. Do not imply that existing ChatGPT or Codex access provides API entitlement or a spending allowance.
- The expected data-handling constraints and any unresolved provider retention/storage settings. Verify actual supported settings before making assurances.

A first live qualification should use a clearly identified public/synthetic fixture, a bounded single request, no tools, and a recorded redacted outcome. Quality and prompt-injection evaluation remain distinct from transport authorization and deterministic safety tests. Issue #10 should remain open until its actual-model acceptance scope is demonstrated; broader evaluation remains separate.

## Validation matrix for a future implementation

| Area | Test input or failure | Required observable result |
| --- | --- | --- |
| Data minimization | Capture contains synthetic creator token, endpoint, path, ID and base | Intercepted provider body contains only approved brief/text and fixed protocol fields; no authority metadata or credential |
| Authentication | Distinct synthetic provider and creator credentials | Provider credential appears only in its authorization channel; creator credential never reaches provider; neither appears in logs/errors/artifacts |
| Destination | Redirect, userinfo URL, non-HTTPS or unapproved host | Request rejected; no credential forwarded to another destination |
| Bounds | Oversized request/body, chunked oversized response, stalled response | Abort within defined limits; no partial result used or proposal created |
| Output validation | Malformed JSON, additional authority fields, bad offsets, tool calls, no-op | Local rejection before create; no model-defined base/ID/path accepted |
| Injection | Brief/text asks to read files, use tools, disclose tokens or approve | No execution/tool channel exists; output still passes only data validation and owner review |
| Stale capture | Peer edit/schema change during model request | Original captured base retained; stale creation/application rejected by existing server rules; no automatic replan |
| Uncertain create | Response lost before or after durable creation | Resume uses the byte-equivalent saved request and original ID; no second model call or new decision |
| Interrupted planning | Provider timeout/process exit before durable proposal intent | No application; do not describe the provider request as unbilled or automatically safe to repeat; retries must remain inside budget |
| Disclosure failures | Provider reflects credential or includes sensitive diagnostics | Generic redacted error; do not echo raw response into logs or UI; never claim substring checks prove complete secret removal |
| Review separation | Valid generated proposal | Creation only; owner independently inspects and authorizes application through existing flow |
| Live qualification | Explicitly approved synthetic fixture | Record provider/model, bounded call result, validation result and limitations without tokens or private content |

## Why not a local agent subprocess yet?

A real OS sandbox alternative would need platform-specific enforcement and negative tests for filesystem reads outside the permitted input, inherited environment, IPC, credential stores, network destinations, child processes, and output escape paths. A temporary working directory, sanitized environment, read-only flag, or prompt instruction alone does not prove those boundaries. It also introduces provider-authentication and platform-portability work absent from a tool-free HTTP request.

## Exclusions

This design does not authorize a provider call, supply authentication, select pricing, create a provider account, launch a model, or implement a new adapter. It does not promise semantic correctness, universal prompt-injection resistance, arbitrary document/schema support, automatic migration or recovery, new owner authority, long-load results, or isolation from compromised application code. Existing manual plan-file behavior remains unchanged.

## Documentation validation

Docs build and internal-link check passed: 55 pages, 2,613 internal links. Build emitted the existing large-chunk advisory; no build error. This report is a repository design record, not a newly published documentation page. Whitespace check passed. Original checkout WIP was not modified.
