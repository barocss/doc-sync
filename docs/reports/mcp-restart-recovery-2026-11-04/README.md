# MCP restart recovery

Final source-bound qualification is complete. The selected evidence archive is sealed and verified.

Three recovery changes are implemented and pass focused tests. The historical undo after-accept second-restart failure is **NOT_REPRODUCED**. Its original error body is missing. These changes do not establish its cause.

## Changes

1. **Finish accepted-intent cleanup after restart.** A crash or clear error can leave an accepted intent beside a settled checkpoint that already contains it. Restore now recognizes the exact matching intent digest and actor sequence, verifies the accepted receipt and original reservation, and completes cleanup without adding History twice. Different or unknown intent evidence remains blocked.
2. **Use fresh server state before local restore.** After remote proofs, restore reads current recovery state. Generation and schema must still match. The server cursor must cover both the checkpoint and the accepted conditional receipt. A same-generation hub reopen can supply its current epoch. Lost history or a later incompatible epoch remains blocked.
3. **Retry bounded recovery HTTP operations.** Schema read, recovery-state read, exact reservation proof and atomic pending recovery can retry selected temporary HTTP or connection failures. Four attempts share one 10-second deadline, with 100/200/400 ms delays. Request identity and body stay exact. Body reads are inside the attempt, so a lost socket after HTTP 200 headers can recover. Complete malformed JSON, unsafe protection, conflicts and permanent failures remain blocked. Ordinary change sends and conditional submissions do not receive these retries.

## Evidence

| Scope | Before | Final focused result |
|---|---|---|
| Session source, seven-case pre-fix probe | 3 FAIL, 4 PASS | New full regression file: 11 PASS |
| Transport source before edit | 6 FAIL, 2 PASS | Current unit file: 9 PASS |
| Partial HTTP 200 body socket loss, reconstructed pre-retry control | 1 FAIL; one request | Fixed test and independent probe PASS; two identical requests |
| Second-restart process behavior, reconstructed pre-retry alias | Lease-before case FAIL; one request | 12 PASS: eight existing recovery cases and four new process cases |

The reconstructed transport controls preserve pre-retry behavior but are not byte-identical historical source. The earlier file named `process-retry-before-fix.log` ran the first rebuilt implementation and passed. It is **NOT_BASELINE**.

The process regressions cover a lease HTTP 503 before forwarding, a lease HTTP 503 after the server confirms protection, a recovery-state HTTP 503, and a persistent lease failure. They retain exact accepted sequence, zero ordinary pending resend, checkpoint byte preservation on failure, another user's text, immediate recovery status and working undo/redo. Persistent failure stops at four attempts, blocks edits and permits a later healthy restart.

Thirty successful stress repetitions did not reproduce the old intermittent failure. They are not evidence of causality. The independent final source review has no open actionable finding in the reviewed scope. The review does not replace full workspace qualification.

## Qualification

- Parent build 2: PASS, exit 0, 8.201 seconds.
- Parent TypeScript check: PASS, exit 0, 8.843 seconds.
- Parent package artifact check: PASS.
- Documentation build/site check: separate parent gate; not included in the source-bound test result.
- Parent full workspace tests: PASS, exit 0, 2108 tests, 2106 PASS, 0 FAIL, 2 SKIP, 0 CANCELLED; 109.213 seconds.
- Full source boundary: 1,427 Git-visible runtime, test, fixture and config files. The complete before/after hash maps match exactly. Prose and evidence files are outside that boundary.
- Browser, Chrome and mobile tests: NOT_RUN in this task. Process tests use Node and the MCP SDK. No Codex model invocation, Git commit, push, release or publication is claimed.

Selected evidence: [archive](selected-evidence.tar.gz), [SHA-256 manifest](manifest.json), [verification seal](seal.json). The manifest covers all selected members. The seal records the archive hash and verifies every archived byte against the manifest. Source hashes bind this result to the 1,427-file qualification map; they do not establish the cause of the historical failure. Existing reports and seals are preserved.

Artifact staging revision: evidence files are stored beside this report so its links remain valid when published. Runtime, test and baseline evidence is unchanged. The prior seal is preserved in the local `pre-public-links` directory.
