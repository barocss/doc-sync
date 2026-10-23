async (page) => {
    await page.goto('__SCREEN_ORIGIN__/pm?doc=presence-20261022');
    await page.locator('#reset').click();
    await page.waitForTimeout(300);
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('abcdefgh');
    await page.waitForTimeout(200);
    const sent = [];
    const listener = req => {
        if (req.url().endsWith('/presence') && req.method() === 'POST') sent.push(req.postDataJSON());
    };
    page.on('request', listener);
    const results = [];
    const wait = () => page.waitForTimeout(180);
    const chars = () => page.locator('#pane-a .ch').evaluateAll(nodes => nodes.filter(n => n.querySelector('.remote-selection')).map(n => n.textContent).join(''));
    const capture = async (name, expected, target = 'demo') => {
        await wait();
        const selected = target === 'demo' ? await chars() : await page.locator('.ProseMirror .pm-remote-selection').allTextContents();
        const text = Array.isArray(selected) ? selected.join('') : selected;
        if (text !== expected) throw new Error(name + ': expected ' + expected + ', got ' + text);
        results.push({name, selected: text, presence: sent.filter(p => p.actor.startsWith(target === 'demo' ? 'P-' : 'A-')).at(-1)});
    };
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await capture('PM to demo forward', 'cdef');
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-pm-to-demo-forward.png', fullPage: true});
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    await capture('PM to demo backward', 'cdef');
    await page.keyboard.press('ArrowLeft');
    await capture('PM to demo collapsed', '');
    await page.locator('#pane-a .ch[data-o="2"]').click({position: {x: 0.1, y: 5}});
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await capture('demo to PM forward', 'cdef', 'pm');
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-demo-to-pm-forward.png', fullPage: true});
    await page.locator('#pane-a .ch[data-o="6"]').click({position: {x: 0.1, y: 5}});
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    await capture('demo to PM backward', 'cdef', 'pm');
    await page.keyboard.press('ArrowLeft');
    await capture('demo to PM collapsed', '', 'pm');
    page.off('request', listener);
    return {results};
}
