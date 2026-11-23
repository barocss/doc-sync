# Persistent watch CLI opt-in (#34)

`watch --checkpoint file` now selects `PersistentReviewWatch` through
`apps/bot/src/watch-command.ts`. Default selection remains in-memory. Configured
endpoint/document/mission/model plus reviewer contract/version bind the private
checkpoint; maxRuns is validated separately by the existing API. Interval can
change without resetting cursor or budget. Credential/query/fragment URLs are
rejected in checkpoint mode. Binding is not authentication or actual model identity.

Clean close retains reviewed cursor and cumulative budget. CLI Ctrl-C/SIGTERM
stops further polling, awaits an active review and closes the lock in finally.
It is not immediate model cancellation. Failure/in-flight/blocked checkpoints
still require inspection, with no automatic review replay/reset/repair. Local
owned mode-0700 parent/mode-0600 file and macOS/Linux kernel lock requirements
remain unchanged. No persistent actor privilege or new scheduler is introduced.

The existing reviewer callback is used only when users explicitly run the CLI.
Tests inject fake read/review callbacks, plus a loopback synthetic recovery-state
HTTP server for actual CLI startup, SIGTERM, clean restart and lock release.
That CLI fixture never advances the baseline and does not invoke the model.
Separate fake-callback tests cover active-review drain, concurrent lock refusal,
configuration mismatch, cumulative budget, failed callback and a synthetic
interrupted in-flight checkpoint. No actual-model quality, exactly-once execution,
power-loss durability or production service qualification is claimed.

Independent review found no blocking issue. In-memory factory close alone does
not drain callbacks; the CLI's sequential await/finally structure supplies that
boundary. Real signal testing covers idle polling; active callback draining is
verified through the factory with controlled promises, not a real model process.

Focused CLI selection tests: 7/7 pass. Existing persistent API plus the first six
CLI tests: 16/16 pass. Long-duration load and external user-document transmission
were not performed. #10/#14 remain separate.

Final full bot suite: 179/179 pass (27.5 seconds). Docs build/check: 56 pages, 2688 links pass.
