async (page) => {
    const origin = ORIGIN;
    await page.goto(origin + '/pm?doc=render-regression');
    await page.waitForFunction(() => document.querySelector('.ProseMirror > p'));
    await page.evaluate(async () => {
        const [{Doc}, {DEMO_SCHEMA}] = await Promise.all([import('@barocss/doc-sync'), import('/fixtures/demo-schema.ts')]);
        const doc = new Doc('render-seed', DEMO_SCHEMA);
        const content = Array.from({length: 6}, (_, i) => ({type:'paragraph', runs:[{text:'paragraph-'+i+'-abcdefgh',marks:{}}]}));
        const {ops} = doc.edit([{op:'delete',at:[0],count:1},{op:'insert',at:[0],content}]);
        const response = await fetch('/api/docs/render-regression/changes', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:'render-seed',seq:1,ops})});
        if (!response.ok) throw new Error(await response.text());
    });
    await page.waitForFunction(() => document.querySelectorAll('#pane-a .blk').length === 6 && document.querySelector('#converged').classList.contains('ok'));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__unchangedParagraph = document.querySelector('#pane-a .blk[data-b="5"]'));
    await page.locator('#pane-a .ch[data-b="0"][data-o="2"]').click({position:{x:.1,y:5}});
    await page.keyboard.press('q');
    await page.waitForFunction(() => document.querySelector('.ProseMirror > p').textContent.includes('q'));
    if (!await page.evaluate(() => __unchangedParagraph === document.querySelector('#pane-a .blk[data-b="5"]'))) throw new Error('Unchanged paragraph replaced on insertion');
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__idleParagraph = document.querySelector('#pane-a .blk[data-b="0"]'));
    await page.waitForTimeout(1500);
    if (!await page.evaluate(() => __idleParagraph === document.querySelector('#pane-a .blk[data-b="0"]'))) throw new Error('Periodic status polling replaced unchanged paragraph');
    await page.locator('.ProseMirror > p:first-child').click({position:{x:.1,y:6}});
    await page.keyboard.press('Home');
    for (let i=0;i<3;i++) await page.keyboard.press('Shift+ArrowRight');
    await page.locator('#pm-tools').getByRole('button',{name:'B',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pane-a .blk[data-b="0"] .ch.bold').length === 3);
    if (!await page.evaluate(() => __unchangedParagraph === document.querySelector('#pane-a .blk[data-b="5"]'))) throw new Error('Formatting replaced unrelated paragraph');
    await page.locator('#pm-tools').getByRole('button',{name:'↶',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pane-a .blk[data-b="0"] .ch.bold').length === 0);
    await page.locator('#pm-tools').getByRole('button',{name:'↷',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pane-a .blk[data-b="0"] .ch.bold').length === 3);
    await page.locator('.ProseMirror > p:first-child').click({position:{x:20,y:6}});
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#pane-a .blk').length === 7 && document.querySelector('#converged').classList.contains('ok'));
    return {checks:['unchanged paragraph identity after typing','periodic polling preserves paragraph DOM','remote formatting visible','formatting preserves unrelated paragraph','undo formatting','redo formatting','structural split converges'],passed:7};
}
