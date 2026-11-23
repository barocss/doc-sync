# Local document bot and character validation

## Scope

The private bot runner started a real MCP stdio participant, discovered and verified the Word-profile schema, and used authenticated Codex CLI `gpt-6-sol` planning to execute user-assigned text missions. Two separately identified bots ran concurrently on one local document: a curious fox and a careful owl. The product demo mounted Slate, Lexical, and ProseMirror as independent editor peers in one Chrome page. A separate earlier run also included automated native user input during a Codex bot mission; its user edit made the bot's original revision stale, and the bot reread and replanned.

This was a one-shot local prototype. It did not test unattended recurring missions, a production service, role-based authorization, long-term memory, outside research, real OS IME, physical power loss, or arbitrary document operations. The bot runner currently supports text insert and delete only. The character and personality are configuration and planner style guidance; role-specific permissions are not implemented.

## Results

Both actual Codex bot missions reported `completed`. The fox inserted `[FOX]`; the owl's initial edit was rejected as stale, after which it read again and confirmed `[OWL]`. The final server document and all three editor and native models matched: `Opening text [FOX] [OWL]`. The browser observed both characters' thinking, editing, and happy states. Names were hidden in the default design. A separate two-agent Chrome test checked the name tooltip on hover and keyboard focus, selection preservation, and presence removal. A five-agent fixture checked desktop and 390 px mobile layout, no horizontal overflow, and reduced-motion behavior. These are automated Chrome checks, not manual human or real OS IME acceptance.

The bot process was also killed in a controlled test after the server accepted a conditional edit but before its response was delivered. The pending mission intent and the MCP journal remained, and the server retained one copy after restart. This establishes the tested process/server restart path and inspection evidence; the runner does not automatically reconcile or resume that mission, and it does not prove physical power-loss safety.

## Observed task duration

For the two actual bot missions in this single shared-host run, elapsed wall time from the stored creation timestamp to the stored completion timestamp was 15.098 seconds for the fox and 24.388 seconds for the owl, which replanned after a stale rejection. These measurements include model calls, local MCP/server work, and mission persistence. They are not an inference benchmark, percentile, production latency target, or a controlled before/after comparison. The state is persisted before the brief completion-presence grace period. Model planning output was not retained separately from the confirmed/stale plans in mission records.

Node 24.22.1, Chrome 156.0.8078.48, Darwin arm64, local Word-style sample, shared host, `gpt-6-sol`. The checked-in [result.json](result.json) contains synthetic mission and browser event data. Raw local logs and screenshots are in `output/validation/bot-runtime-20261028/` on the test host; installed dependencies and host conditions were not frozen.

## Source identity

SHA-256: runner `1806204c3afcdef38d337ebd8ac623f4fa0b7b9594967a0eafb271c7d60ea9f6`, Codex planner `bb48a503f4eea46d325268baaef5a465170dbf38aec291a88fa5995db88ff58e`, MCP entry `b168882cd19c537154b4db4b9a1634a94ec6cd974602c95989269aaf403581c2`, MCP session `834ab6534f85466c30244073a9540e01fded267e131a909e3e0de973c5c24190`, ProseMirror binding `bbc14aeeea1bb43b4d567a0e0acef488c71b4a9bcaed59509da7bce2a0e549b8`, product editor `a32732fc2e76226564806b4ee70d106f61ee1ab71cf32ccf2b44aa419b57cef4`, product HTML `bc483beead723a9cc463c766263dc2b6ccdeeb259cb230abbd2c21d9988cb754`, browser bundle `f67c2e65367c6e7714e3916aa42bb9dcb394fb46cd61e5c7c4e31050fb2b9b06`.
