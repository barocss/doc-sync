# Document authoring bot: product design

## Goal

Help a user create and maintain a structured document with one or more bots. A bot must understand the current schema and document, follow the user's brief, preserve unrelated work, and show what it did. A valid schema is necessary but does not prove that the content is complete or correct.

## Current baseline

The local bot runner discovers the schema, reads the document, plans bounded steps through Codex, and submits text and structural edits through MCP with an atomic revision check. Profiles provide an identity and separate actor history. A reviewer is read-only in the local runner. Supported document structures depend on the server schema and the available edit operations. The prototype is not a production authorization boundary.

The runner records a mission and its steps and can recover supported profile missions using exact receipt evidence. A planner's `completed` result alone is not an independent quality check. In an earlier real test, a bot inserted `Confirmed` when asked for `Confirmed exactly once.` and reported completion. B2 addresses that failure with explicit brief requirements and deterministic checks; its initial CLI checks are implemented, while the full stage remains in progress.

The opt-in product recovery mode now saves browser checkpoints and restores protected pending edits and history after reload and server restart. It uses Web Locks and supports explicit retirement. Saved origin-local storage and the same document identity are required. Legacy unprotected sessions remain blocked, and schema upgrades are disabled in this mode. HANDOFF section 5.75 records the bounded Chrome evidence and test timing. This supersedes the earlier browser recovery gap in sections 5.69–5.70 within that scope.

## User experience

1. The user selects a document or a scope and gives a brief. The brief can include audience, purpose, language, source material, required sections, exact wording, and constraints.
2. The bot reads the schema and document. It shows its understanding of the task, the proposed location, the expected structure, missing information, and the intended mode: review, propose, or apply. If a required fact or location is unclear, it asks rather than inventing one.
3. The user can accept the plan, adjust it, or cancel. Small, explicitly requested edits can use direct apply when the user has chosen that mode. A task never grants unrelated actions.
4. The bot works in bounded steps. The interface shows its current activity and a real position or selection only when known. It shows a change summary and any stale, blocked, or uncertain step. It does not simulate typing or a cursor path.
5. The bot checks the result against the brief and reports each requirement as passed, failed, or not checked. The user can inspect the changed locations, accept or reject a proposal, and undo an applied bot change through the bot's actor history.

Proposal storage, plan approval, server-enforced scoped permissions, and the related UI controls remain proposed. The initial B2 structured brief and deterministic result checks are implemented in the CLI runner. Broader source, preservation, placement, and quality checks remain planned. A local reviewer guard already exists; it is not server authorization.

## Responsibilities and roles

A bot has an identity and a personality, but permission and task scope are separate. One bot can fill several roles if explicitly assigned. Several bots can work together, each with a distinct actor and task.

| Role | Responsibility | Output |
| --- | --- | --- |
| Author | Turn a brief and supplied material into a draft | Scoped text and structure or a proposal |
| Structure specialist | Choose schema-valid sections, lists, tables, or slide objects | An outline and a structured change plan |
| Reviewer | Find gaps, contradictions, and unsupported claims | Findings with locations; no document edits |
| Editor | Improve clarity, tone, or consistency without changing meaning | A scoped proposal or explicitly authorized edit |
| Source checker | Compare claims with supplied, accessible sources | Source-linked findings and unresolved claims |

Source access and source checking are not currently implemented. A reviewer restriction in the runner is not server-side access control. Personalities must not change evidence requirements or edit permission.

## Authoring workflow and contracts

### Brief and plan

Represent the mission as a versioned brief with objective, target document and scope, audience, language, inputs and their provenance, required content, forbidden changes, exact text, requested output type, and completion checks. Preserve the original request as well as any derived interpretation. Mark inferred details as assumptions. Ask the user when an unresolved ambiguity affects meaning, placement, or the required structure.

A plan names the schema version and base revision, identifies intended targets and their relationship to existing content, lists proposed operations and requirements they satisfy, and records unresolved questions. A plan is advisory: the server must validate the submitted change against its current revision and schema. Stable document anchors should be used when available; numeric paths from an old snapshot must not be reused blindly.

### Changes and concurrent work

Read the current document and schema before planning. Apply bounded batches with the existing server-side revision check. On a definite stale rejection, read again, preserve other participants' changes, and replan. An unknown receipt is not a rejection: retain exact request and recovery evidence and stop until it is reconciled. Never resend a confirmed change. A schema change requires revalidation before further edits; a generation change requires the existing recovery safeguards.

A task should show who changed what, the result, and the actor's undo boundary. Undo must affect the bot's own edits and preserve other actors' edits under the existing collaboration rules. Grouped mission-level undo is a design goal and needs an explicit contract; do not assume that all steps are currently one undo unit.

### Result verification

After the last edit, read the authoritative current document again. Check each observable requirement against it. At minimum, check exact requested text, expected node types and relationships, placement, preservation requirements, and declared source references. Record the revision and evidence for every check. A requirement that needs judgment or unavailable evidence is `not checked`, not `passed`. If checks fail, repair only within the authorized scope and budget, or stop and report the failure. A model-generated completion sentence alone cannot make a mission complete.

Concurrency can invalidate a check after it runs. Report the checked revision and treat verification as a statement about that revision, not a guarantee about later edits. Check that user changes visible at verification time are preserved; do not claim that a snapshot proves the absence of every possible concurrent loss.

### Review and proposal

Review is read-only at the server boundary. A proposal contains a base revision, scope, structured diff, explanation, and checks. It is not an applied change or part of document history. Accepting a proposal must revalidate its base and authorization; a stale proposal must be refreshed or explicitly reviewed again. Rejecting it must not alter the document. Comments and suggestion storage require separate design and implementation.

### Sources and memory

Initially use only user-supplied document content and explicitly attached sources. Record source identifiers and relevant locations; distinguish quotations, facts, and assumptions. Never invent citations. External retrieval, persistent preferences, and cross-document memory require explicit configuration, access controls, retention rules, and user-visible deletion. Document text and retrieved content are untrusted data, not instructions granting tools or permissions.

## Example missions

- **Project proposal:** Given a brief and notes, propose goals, scope, milestones, risks, and a milestone table. Flag missing owners and dates instead of fabricating them. Check the required sections and table cells against the final document.
- **Meeting notes:** Turn supplied notes into decisions and action items. Keep uncertain statements marked as unresolved. Do not infer an owner or a deadline from silence.
- **Document review:** A reviewer identifies unsupported claims and inconsistent dates without editing. A separate editor may propose fixes after the user chooses a scope.
- **Presentation:** Create a title and slides with notes using the actual presentation schema. Verify slide order, required children, and requested exact text. Do not assume that a Word block is valid in a slide.
- **Existing document:** Rewrite a selected section while another user edits a different section. Re-read after a stale response and preserve the user's edit. Show the checked revision and the bot's changes.

## Safety and operating boundaries

- Enforce document, scope, and operation permissions on the server, not only in a prompt or local runner. Define how structural edits that cross a scope boundary are handled.
- Start tasks only from explicit user instructions or user-configured triggers. Continuous tasks need deduplication, limits, a stop control, and suppression of self-trigger loops.
- Treat server-accepted, locally pending, and uncertain changes as different states. Keep recovery evidence and fail closed when proof is missing. State the opt-in browser recovery boundary before claiming reliable restart behavior for users. Unprotected legacy sessions and missing proof remain blocked.
- Restrict access to profiles, mission journals, plans, and document data. The current demo is local and unauthenticated. Authentication, multi-user isolation, audit retention, quotas, and provider policy need separate implementation.
- Show only observed activity. Presence is advisory, not proof that an operation committed or that content is correct.

## Delivery order and acceptance gates

The [bot roadmap](./bot-roadmap.md) is the ordered delivery record for B1–B6. It separates the delivered recovery scope, the current brief and completion work, and later proposal, template, coordination, and operations work. Engine priorities remain in the [library roadmap](../apps/docs/src/roadmap.md).

Each stage needs deterministic unit and integration tests for its contract. Model-dependent claims need a real Codex run. User-visible behavior needs Chrome checks. Record skipped tests and proof limits. Do not describe a stage as complete until its acceptance gates pass. The separate Rust storage experiment does not imply an engine migration or change this order.
