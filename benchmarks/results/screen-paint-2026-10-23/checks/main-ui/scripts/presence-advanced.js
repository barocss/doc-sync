async (page) => {
    const results = [];
    await page.goto('__SCREEN_ORIGIN__/pm?doc=presence-multiple-20261022');
    await page.locator('#reset').click();
    await page.waitForTimeout(300);
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('firstpara');
    await page.keyboard.press('Enter');
    await page.keyboard.type('secondpara');
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(300);
    const selected = await page.locator('#pane-a .ch').evaluateAll(nodes => nodes.filter(n => n.querySelector('.remote-selection')).map(n => n.textContent).join(''));
    if (selected !== 'firstparasecondpara') throw new Error('multiple paragraphs: ' + selected);
    results.push({name: 'PM multiple paragraphs to demo', selected});
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-multiple-paragraphs.png', fullPage: true});
    // C is an independent participant. All selections below use UI input.
    const other = await page.context().newPage();
    await other.goto('__SCREEN_ORIGIN__/?doc=presence-multiple-20261022&peers=1&names=C&observer=0');
    await other.locator('.ch').first().waitFor();
    await other.locator('.ch').first().click({position: {x: 0.1, y: 5}});
    await other.keyboard.press('Meta+a');
    await page.waitForTimeout(300);
    await page.locator('#pane-a .ch').first().click({position: {x: 0.1, y: 5}});
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(300);
    const overlap = await page.locator('.ProseMirror .pm-remote-selection').evaluateAll(nodes => ({
        actors: [...new Set(nodes.map(n => n.dataset.actor))],
        nested: nodes.some(n => n.querySelector('.pm-remote-selection')),
        colors: [...new Set(nodes.map(n => getComputedStyle(n).backgroundColor))]
    }));
    if (overlap.actors.length !== 2 || !overlap.nested || overlap.colors.length !== 2) throw new Error('overlap: ' + JSON.stringify(overlap));
    results.push({name: 'overlapping independent users in PM', ...overlap});
    const demoOverlap = await page.locator('#pane-a .ch').evaluateAll(nodes => nodes.some(n => n.querySelectorAll('.remote-selection').length === 2));
    if (!demoOverlap) throw new Error('demo overlap missing');
    results.push({name: 'overlapping independent users in demo', layered: demoOverlap});
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-overlap.png', fullPage: true});
    await other.close();
    await page.waitForTimeout(500);
    const afterLeave = await page.locator('.ProseMirror .pm-remote-selection').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.actor))]);
    if (afterLeave.length !== 1 || !afterLeave[0].startsWith('A-')) throw new Error('leave: ' + afterLeave);
    results.push({name: 'independent page close sends leave and removes C', actors: afterLeave});
    await page.locator('#all-off').click();
    await page.waitForTimeout(300);
    const offline = await page.locator('.pm-remote-selection, .pm-remote-caret, .remote-selection, .caret.remote').count();
    if (offline !== 0) throw new Error('offline decorations: ' + offline);
    results.push({name: 'local disconnect hides all remote ranges and carets', count: offline});
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-disconnected.png', fullPage: true});
    return {results};
}
