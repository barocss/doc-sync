# Document bots: product and behavior design

This document separates the local prototype from proposed product behavior. A bot is a document participant with an identity and an assigned task. A character makes its current work legible; it must not imply actions or emotions that the system has not observed.

## Design principles

- Keep the document primary. Show compact character faces near the editor; reveal a name on hover or keyboard focus. A cursor appears only when the bot has a known position.
- Separate identity, personality, role, and permission. A character and a personality can make a bot recognizable; neither grants an action or overrides a user's task.
- Express observed work states. A thinking face means a planning call is active, an editing face means an edit is being submitted, a happy face means the bounded task reported completion, and a concerned face means it needs attention. These are system states, not claims about feelings or quality.
- Let the user understand and control actions. Show task scope, permitted actions, current status, last activity, and any uncertain outcome. Avoid background changes without an assigned task.

## Bot identity and personality

| Property | Purpose | Current prototype |
| --- | --- | --- |
| Actor ID | Stable collaboration identity and separate undo history | CLI profiles derive a stable per-server, per-document actor; the browser demo can use them with persistent storage or use temporary actors without it. |
| Name and appearance | Make a bot recognizable | Four round mascot color presets, name, and participant color. Names appear on hover/focus. |
| Personality | A style preference for how the bot plans and reports | `curious`, `careful`, `creative`, `concise`; supplied to the planner. It is not a guarantee of behavior. |
| Task | The specific user request | One bounded mission per run. |
| Role | A reusable job description | Writer, reviewer, and organizer guide plans; the runner blocks reviewer edits. Server authorization is not implemented. |
| Permission | What the bot can actually do | Current prototype allows bounded schema-checked text and structural edits through the existing MCP checks. A production permission system is not implemented. |
| Memory | Information retained between tasks | Local profiles, mission records, and MCP history exist. Personal memory and long-term preferences are not implemented. |

For non-profile missions, default appearance and personality are derived from the actor ID and can collide. A local profile stores an explicit identity and persona. A user can choose them explicitly. The MVP does not promise a unique visual design for every possible actor.

## Example characters

These examples show how identity and personality can affect a task without changing permissions:

- **Mori, the curious orange bot** asks clarifying questions when a brief is ambiguous and looks for useful connections. When asked to draft, it preserves existing content and reports what it changed.
- **Nuri, the careful violet bot** checks whether a statement has support and points out missing evidence. In a review-only task it reports findings rather than silently rewriting the document.
- **Bori, the creative rose bot** suggests alternative wording or structure, while keeping the user's scope and factual constraints.
- **Tobi, the concise mint bot** organizes requested changes into short steps and reports completion briefly.

The local demo offers these four presets as concurrent one-shot participants. The current personality presets are guidance to the model, so behavior must be evaluated rather than assumed. Users may rename a bot and choose a different character or personality. A role, task, and permission remain separate choices.

## Proposed roles and capabilities

Writer, reviewer and organizer guide the current planner. The runner blocks reviewer edits; an authorization layer must enforce permissions independently. The broader roles below are design candidates.

| Role | Example task | Proposed allowed action | Important limit |
| --- | --- | --- | --- |
| Reviewer | Find unclear claims or missing steps | Read; propose comments or a review report | No silent document edits unless separately authorized. |
| Writer | Draft a section from a brief | Read and edit within an assigned scope | Preserve unrelated content and explain significant edits. |
| Organizer | Group notes and update task structure | Propose or apply scoped structural changes | Respect stable identities and concurrent changes. |
| Researcher | Investigate a question and cite sources | Use explicitly enabled sources, then propose a draft | No external source or citation verification exists in the prototype. |
| Scribe | Turn meeting notes into decisions and action items | Read assigned notes and draft a summary | Avoid inventing owners or decisions. |

A role is not a substitute for a task. A user should see the specific scope and capabilities before assigning work. Distinct personalities can be used with any permitted role. Two bots should not share an actor ID or recovery journal.

## Task lifecycle and autonomous activity

Each current runner supports one explicit task, a bounded number of model steps, and `completed` or `needs_attention`. It persists the task, confirmed/stale plans, and an intent before an edit. On a definite stale rejection it reads again and replans; on an unknown result it stops. A process interruption can leave a `running` record with a pending edit and requires inspection. It does not automatically resume.

For a future persistent service, use explicit triggers: run once, watch a selected document change, or run on a user-selected schedule. Every trigger needs a scope, rate limit, execution and cost budget, pause/stop control, and an idempotency policy. A scheduler should coalesce changes and avoid triggering on the bot's own edits. Record why each run started. Do not advertise continuous activity until restart, duplicate-trigger, cancellation, and recovery behavior has been tested.

For significant or ambiguous changes, the application may offer propose/review/apply modes. A user-approved task is not proof that every possible output is correct. External messages, publication, and access to third-party services require separately granted capabilities. These controls are proposed; the current demo server does not enforce authentication or authorization.

## Presence and motion

Presence is best effort. A document-wide reading activity has no implied caret. A selected review range is published only after its two visible same-line endpoints pass revision validation. The range is cleared when the next read has a different revision. The bot publishes a work state and an explicit token-anchored position. It must not draw a guessed path or pretend to type while a model is thinking. If a position is unknown, show the character without a document caret. If the position cannot be resolved safely, hide the caret. On leave, remove transient presence; keep the task outcome in the mission record. Motion should be brief and respect reduced-motion settings. Do not rely on color alone: expose names and work states to assistive technology.

The legacy `fox`, `owl`, `cat`, and `robot` identifiers select round mascot colors and remain compatible with existing presence messages. The [mascot expression sheet](../apps/docs/src/public/mascots/expression-sheet.svg) is generated from the runtime vectors. The current product demo displays the bot character in each connected editor. It changes the face with the reported work state. Names are visually hidden until hover or focus. The profile-backed local demo offers per-bot task selection and restores profile identities and completed mission status. It does not automatically resume interrupted tasks.

## Product capabilities to build in order

1. **Task controls and activity:** create a task for a selected document or range; show state, last action, result, and stop control. Keep the document canvas free of persistent bot labels.
2. **Scoped permissions:** enforce read, suggest, and edit capabilities at the server boundary, including access to a specific document or range. The local demo has no such authorization today.
3. **Recovery and coordination:** retain work and idempotency evidence across a process or server restart; prevent duplicate triggers and conflicting active work for the same actor.
4. **Suggestions and review:** support non-destructive comments or proposed edits, plus accept and reject flows. These are not implemented by the current runner.
5. **Continuous work:** add explicit event-based or scheduled triggers with coalescing, limits, cost controls, and pause/resume. A bot should not react indefinitely to its own edits.
6. **Optional tools and memory:** only enable external sources or persistent memory per user configuration. Show what information is retained and give the user a way to remove it.

## Next evidence before broad use

1. Test task cancellation, repeated triggers, process and server restarts, and exact recovery of uncertain edits.
2. Specify role permissions and scoped edits, then test that disallowed operations are rejected at the server boundary.
3. Test multiple bots with conflicting tasks, sustained load, large documents, and actual user editing. Measure input-to-remote-DOM and rendering opportunity separately from model response time.
4. Add accessible task controls and an activity history before making bots autonomous in a shared product.
5. Add authentication, authorization, storage retention, budget enforcement, and monitoring for the intended deployment environment.
