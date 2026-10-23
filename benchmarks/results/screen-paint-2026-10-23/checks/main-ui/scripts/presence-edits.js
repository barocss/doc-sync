async (page) => {
    await page.goto('__SCREEN_ORIGIN__/pm?doc=presence-20261022');
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(180);
    const chars = () => page.locator('#pane-a .ch').evaluateAll(nodes => nodes.filter(n => n.querySelector('.remote-selection')).map(n => n.textContent).join(''));
    if (await chars() !== 'cdef') throw new Error('initial range');
    await page.locator('#pane-a .ch[data-o="0"]').click({position: {x: 0.1, y: 5}});
    await page.keyboard.type('X');
    await page.waitForTimeout(300);
    const afterInsert = await chars();
    if (afterInsert !== 'cdef') throw new Error('after insert: ' + afterInsert);
    await page.locator('#pane-a .ch[data-o="3"]').click({position: {x: 0.1, y: 5}});
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    const afterDelete = await chars();
    if (afterDelete !== 'def') throw new Error('after delete: ' + afterDelete);
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-after-edits.png', fullPage: true});
    return {results: [{name: 'existing remote token anchors follow UI insertion', selected: afterInsert}, {name: 'existing remote token anchors follow UI deletion', selected: afterDelete}]};
}
