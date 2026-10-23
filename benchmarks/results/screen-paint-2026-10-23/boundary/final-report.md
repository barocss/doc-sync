# Boundary validation of the final paragraph isolation candidate

Final `run-163002` and single bullet supplement `run-164136` **passed within the checked scope**. All 13 static screen pairs and 13 same-baseline repeat pairs had 0 changed pixels. All three IME candidate→baseline→candidate comparisons also had 0. The supplement's actual bullet-overlap pair and baseline repeat differed by 0. Actual regressions and fixture failures from the broader `.blk` candidate were preserved.

The final product rule follows.

```css
.surface > .blk.paragraph:not(:has(.composing)) {
    isolation: isolate;
}
```

Only top-level paragraphs are isolated. Headings, quotes, lists, nested cells/callouts/images/captions, and top-level paragraphs with synthetic IME preview are excluded. Root changed product source. This worker changed only the owned validation folder.

## Evidence

- Final state and source hashes: `run-163002/summary.json`
- Browser functional results and geometry: `run-163002/browser-results.json`
- IME B→A→B comparisons and state immediately before capture: `run-163002/ime-cycle-comparison.json`
- Samples of next-block overlap with actual label colors: `run-163002/boundary-overlap.json`
- Static screens: `run-163002/*-{baseline,candidate,baseline-repeat}.png`
- Pixel differences: `run-163002/*-diff.png`
- Executed fixtures: `run-163002/{seed-next.mjs,check-next.js,run-next.py,executed-check.js}`
- Own resource cleanup: `cleanup.json`
- Actual bullet overlap: `run-164136/summary.json`, `run-164136/marker-without-presence.png`, `run-164136/boundary-marker-direct-*.png`

This used actual demo Editor/Doc/SyncClient/HTTP/SSE servers and a separate Chrome session. Two independent clients C/D with long names sent actual Presence. The temporary document used the actual schema. The server used a dynamic port.

The reproduction command follows. Current product source must match the final rule to reproduce the same scope.

```sh
/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/playwright/screen-next-boundary-20261023/run-next.py
```

The 8 target source hashes matched at start and end. Final CSS SHA-256 was `8be763b66e6576f238a95d59bbb4a91c35de77c1788983ba3b657459411b9aec`. Other product source hashes are in the summary.

## Visual results

Every screen captured baseline→candidate→baseline. Baseline applied `.surface .blk{isolation:auto!important}` only on the validation page. Candidate styles were restored after every capture. Animation pauses also applied only to the validation page.

| Screen | Candidate changed pixels | Baseline repeat changed pixels |
| --- | ---: | ---: |
| Default long label at paragraph boundary | 0 | 0 |
| Default label on first cell, second line | 0 | 0 |
| Two users' forward/reverse range overlap | 0 | 0 |
| Nowrap long label at table cell boundary | 0 | 0 |
| Two same-position carets and nowrap labels | 0 | 0 |
| Top-level paragraph IME preview | 0 | 0 |
| Image and empty caption placeholder | 0 | 0 |
| divider | 0 | 0 |
| Callout background and ordinary text | 0 | 0 |
| Empty paragraph | 0 | 0 |
| Ordinary list-block text | 0 | 0 |
| Quote border and ordinary text | 0 | 0 |
| Table colored background and text | 0 | 0 |

The pixel threshold was RGB channel difference >12. It was not relaxed after earlier failures. Source-block, remote-label, and next-block/descendant rects were stored at every capture. DOM existence or computed style alone did not establish a visual pass. PNGs were inspected directly.

Table nowrap stress applied `white-space:nowrap;width:max-content` only on the validation page. Near the end of the first cell's second line, the label extended over colored background/text in the right cell. Both images had 1,526 colored label pixels over the right cell. Default labels wrapped narrowly, so that screen was not used as evidence of crossing into the right cell.

Seven extra structure screens placed the preceding paragraph's default long label over the next structural region. Candidate label-color pixels within the next target were: image/placeholder container 252, caption placeholder 186, divider 213, callout 378, empty paragraph 278, list ordinary text 200, quote 245, table 339. These are pixel samples from intersecting rects. Full-screenshot difference 0 checked existing occlusion order with images and other content.

The main list fixture had label x63.9..80 and bullet x35..53, without overlap. This was not treated as direct bullet-overlap evidence. After root timing ended, approved single supplement `run-164136` moved source head to 1 to overlap bullet and label. A label-free reference screenshot confirmed 8 actual bullet-ink pixels inside the label rect. Overlapping baseline/candidate/baseline-repeat screen differences were all 0. Label-colored pixels were 828 in each. Three client models matched; pending was `[0,0,0]`. Scope did not expand beyond this single supplement.

## Functional results

Ten functional checks passed.

- Two users' ranges: C 3..17, D 7..21, overlap 11 characters. Forward/reverse results matched.
- Seven structures (offscreen paragraph, heading, quote, list, table, callout, wrapped paragraph): scrolling, offset 4 hit test, two-character selection, actual `z` input, undo.
- Synthetic IME preview creation/update/cancel and `isolate → auto → isolate` transitions. Both `가` and `가나다` previews used auto.
- Three synthetic IME preview B→A→B captures had equal strings/rects and 0 pixel differences.

After every edit, models and pending state were compared across 3 actual clients. The final server model also matched. Pending was `[0,0,0]`; server sequence was 15. Two images were confirmed rendered. Image editing/dragging was not tested. Synthetic composition events do not validate OS IME. This run does not establish performance or full main UI/network-failure coverage.

## Separate failures and residuals

| Run | Result |
| --- | --- |
| run-161029 | Missing viewport setup. Fixture failed |
| run-161111 | Wrong wrap locator. Fixture failed |
| run-161531 | Full `.blk` isolation showed a 155-pixel IME overlap difference |
| run-161848 | B→A→B confirmed actual paint-order regression with 155/155/0 pixels. Original report: `report.md` |
| run-162328 | Composition-exception candidate. IME difference 0. Preserved 5-pixel callout-top difference, excluded from final-candidate evidence |
| run-162714 | Added table made strict locator match two cells. Fixture failed |
| run-162755 | Final selector. 12 pairs passed. 2 preceding callout-corner pixels in empty-paragraph crop: A→B=2, B→A-repeat=0, A→A-repeat=2 |
| run-163002 | Idle 500ms after scrolling. All 13 pairs/repeats differed by 0 at the same threshold. Final pass |
| run-164136 | Confirmed 8 actual bullet-ink pixels overlap label rect. Single screen pair/repeat differed by 0. Supplement passed |

The 2 pixels in run-162755 were viewport `(38,448)` and `(36,450)`. Baseline `(214,162,122)` changed to `(227,190,162)` in both candidate and baseline-repeat. They were outside label/empty-paragraph regions and did not repeat with CSS state. They were classified as first-capture residuals after scrolling. Raw data was retained and never overwritten with passing values.

## Resource cleanup and assessment scope

All created Chrome sessions and servers were closed. Temporary DATA was copied to each run's `server-data/`, then deleted. User servers, tabs, and processes were unchanged. The Chrome slot was returned to root.

The final candidate passed actual screenshot comparisons and functional checks in this controlled fixture. OS IME, full browser integration regressions, and final performance require separate evidence.
