# Proposed process cleanup — 2026-11-23

No process was stopped. This is an inventory, not an executed cleanup.

The old browser driver tree has exact registered worktree CWD ownership:

- PID 25047: `/Users/user/Library/pnpm/global/5/.pnpm/agent-browser@0.23.4/node_modules/agent-browser/bin/agent-browser-darwin-arm64`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25048: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25060: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/chrome_crashpad_handler`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25062: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/chrome_crashpad_handler`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25067: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper (GPU).app/Contents/MacOS/Google Chrome for Testing Helper (GPU)`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25068: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper.app/Contents/MacOS/Google Chrome for Testing Helper`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25069: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper.app/Contents/MacOS/Google Chrome for Testing Helper`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25072: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper (Renderer).app/Contents/MacOS/Google Chrome for Testing Helper (Renderer)`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25073: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper (Renderer).app/Contents/MacOS/Google Chrome for Testing Helper (Renderer)`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25075: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper (Renderer).app/Contents/MacOS/Google Chrome for Testing Helper (Renderer)`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 25078: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper (Renderer).app/Contents/MacOS/Google Chrome for Testing Helper (Renderer)`; CWD `/Users/user/github/doc-sync-issue-2`.
- PID 56000: `/Users/user/.agent-browser/browsers/chrome-147.0.7727.56/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Versions/147.0.7727.56/Helpers/Google Chrome for Testing Helper (Renderer).app/Contents/MacOS/Google Chrome for Testing Helper (Renderer)`; CWD `/Users/user/github/doc-sync-issue-2`.

Propose TERM only after the root final verification finishes and remote source preservation is verified. Recheck PID, start time, executable and CWD immediately before each action. The driver PID is 25047, Chrome root PID is 25048; crash handlers 25060/25062 were reparented to launchd but retain the same exact issue-2 CWD. Stop the owned driver/browser tree, never shared Chrome processes.

KEEP the current test controller 96847, npm descendants 96858/96859/97260, and all current or later test descendants. The bot test/server processes in the snapshot belong to this active verification. KEEP current CUA node_repl processes 71728/71729/71730 until the root no longer needs its tools. No unrelated project process is a cleanup candidate.

No unregistered adjacent `doc-sync*` directory was found under `/Users/user/github`. All 24 directories are registered main/secondary worktrees. `.omx` metadata was inventoried without invoking OMX; no active related tmux pane was found (tmux list exited 1). Native tool processes do not require tmux.

Do not manually delete Codex database or session files. The root handles the app-level chat deletion and its final confirmation. Preserve the separate private backup. Detailed process/start/CWD ownership and metadata counts are in `process-inventory.json`.
