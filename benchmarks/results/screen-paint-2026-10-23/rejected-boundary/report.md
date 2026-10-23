# Boundary tests for `.blk isolation:isolate`

Assessment: **approval blocked by visual regression**. Functional tests and 5 static screen pairs passed. But paint order changed when the preceding paragraph's long Presence label overlapped composition preview in the next heading. Product source was unchanged.

## Reproduction and evidence

The final run was `run-161848`. It used actual demo `Editor`, `Doc`, `SyncClient`, and `HttpTransport`, with a separate HTTP/SSE server, temporary document, and Chrome session. Default-style candidate was compared with baseline applying `.surface .blk{isolation:auto!important}` only on the validation page. Animations were paused only on that page.

Reproduction command:

```sh
/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/playwright/screen-next-boundary-20261023/run.py
```

Reproducing the failure returns exit code 1. The script writes each run to a new `run-HHMMSS` folder. Executed JS is each folder's `executed-check.js`. Initial documents are in `seed.mjs`; post-run server data is in each `server-data/`. `summary.json` contains source hashes. The 8 target source hashes stayed unchanged throughout the final run.

## Actual visual regression

Default product labels are narrow and wrap vertically. C and D cursors shared a position in the second paragraph. The next heading displayed synthetic composition preview `조합미리보기`. Paragraph D's label extended down into that heading.

Captures repeated candidate → baseline → candidate. Immediately before each capture, the script stored composition string/rect and each remote caret's actor, name, rect, and pseudo styles. State matched across all three captures.

| Comparison | Pixels with RGB channel difference >12 | Result |
| --- | ---: | --- |
| candidate 0 → baseline 1 | 155 | Label/final composition character paint order changed |
| baseline 1 → candidate 2 | 155 | Reverse change in the same region |
| candidate 0 → candidate 2 | 0 | Repeated candidate state matched |

Difference bounds were screenshot coordinates `[149,52,162,73]` and viewport coordinates `[169,107,182,128]`. Candidate painted final heading character `기` over the preceding paragraph's D label. Baseline painted the label over that character. Equal composition strings/geometry and reproducible B→A→B exclude a transient or caret-blink explanation. No arbitrary z-index or overflow changes raised the label.

- `run-161848/ime-cycle-comparison.json`: state and pixel comparisons across three captures
- `run-161848/ime-cycle-0-candidate.png`: first candidate screen
- `run-161848/ime-cycle-1-baseline.png`: baseline screen
- `run-161848/ime-cycle-2-candidate.png`: repeated candidate screen
- `run-161848/ime-cycle-diff-0-1.png`: changed region

The candidate creating a stacking context for every `.blk` therefore fails the acceptance criterion of preserving existing label/composition overlap paint order. A broader isolation boundary or Presence overlay structure needs review. This test did not validate alternative performance or safety.

## Passing scope

| Static screen pair | Changed pixels | Visibility evidence |
| --- | ---: | --- |
| Long label at paragraph boundary | 0 | 896 colored pixels on both sides, 351 outside paragraph |
| Default long label on first cell, second line | 0 | 1,104 colored pixels on both sides. Default label did not cross this cell boundary |
| Two users' forward/reverse ranges | 0 | Both colors retained. C range 3..17, D range 7..21, overlap 11 characters |
| Table cell boundary nowrap stress | 0 | 1,679 colored pixels on both sides. 1,526 over right-cell colored background/text |
| Two same-position carets/nowrap labels | 0 | D occluded C as in baseline. 2,326 D-colored pixels retained |

Nowrap stress applied `.caret.remote::after{white-space:nowrap!important;width:max-content!important}` only on the validation page. It is separate from default product styling. Cell-boundary checks used a position near the first cell's second-line end. Default labels did not actually cross the boundary, so those images are not evidence of visibility outside a cell.

Seven structures (offscreen paragraph, heading, quote, list, table, callout, wrapped paragraph) checked scrolling, offset 4 hit test, two-character selection, actual `z` input, and undo. After each edit, models and pending state were compared across 3 actual clients. Final server model also matched, with pending `[0,0,0]`. One image was confirmed rendered. Image editing/dragging was not tested.

Every pair had equal block and contained remote-label rects. Geometry equality does not establish equal paint order. Synthetic compositionstart/update/end preview display and cancellation passed. This does not validate OS IME input. Performance was not measured.

## Earlier failures and cleanup

- `run-161029`: fixture failed due to missing viewport setup. No product assessment.
- `run-161111`: fixture failed due to a wrong wrapped-paragraph locator. No product assessment.
- `run-161531`: functional checks completed. The fixture requirement that the default cell label extend outside the cell did not fit this screen. Both images matched. The IME 155-pixel difference was retained as an actual regression candidate.
- `run-161848`: separated the invalid default-cell boundary assumption while retaining nowrap stress evidence. B→A→B confirmed actual paint-order regression. Overall result failed.

All created Chrome sessions and servers were closed. Temporary DATA was copied into run folders, then deleted. `cleanup.json` stores session shutdown logs and server status. User servers, tabs, and processes were untouched.
