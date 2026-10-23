async (page) => {
    const origin = ORIGIN;
    await page.goto(origin + '/pm?doc=nested-render');
    await page.waitForFunction(() => document.querySelector('.ProseMirror > p'));
    await page.evaluate(async () => {
        const [{Doc}, {DEMO_SCHEMA}] = await Promise.all([import('@barocss/doc-sync'), import('/fixtures/demo-schema.ts')]);
        const paragraph = text => ({type:'paragraph',runs:[{text,marks:{}}]});
        const doc = new Doc('nested-seed',DEMO_SCHEMA);
        const content=[paragraph('head'), {type:'table',children:Array.from({length:2},(_,i)=>({type:'table-row',children:Array.from({length:2},(_,j)=>({type:'table-cell',children:[{type:'table-cell-body',children:[paragraph('cell'+i+j)]}]}))}))}, {type:'callout',attrs:{tone:'info'},children:[paragraph('box-one'),paragraph('box-two')]}, paragraph('tail')];
        const {ops}=doc.edit([{op:'delete',at:[0],count:1},{op:'insert',at:[0],content}]);
        const response=await fetch('/api/docs/nested-render/changes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:'nested-seed',seq:1,ops})});
        if (!response.ok) throw new Error(await response.text());
    });
    await page.waitForFunction(() => document.querySelectorAll('#pane-a table td').length===4 && document.querySelectorAll('#pane-a .box .blk').length===2 && document.querySelector('#converged').classList.contains('ok'));
    await page.waitForTimeout(300);
    await page.locator('#pane-a table td').first().locator('.ch[data-o="2"]').click({position:{x:.1,y:5}});
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        window.__grid=document.querySelector('#pane-a .grid-wrap');
        window.__cellOther=document.querySelectorAll('#pane-a table td .blk')[3];
        window.__boxOther=document.querySelectorAll('#pane-a .box .blk')[1];
        window.__head=document.querySelector('#pane-a .surface > .blk');
    });
    const stable = async () => {
        const kept = await page.evaluate(() => ({grid:__grid===document.querySelector('#pane-a .grid-wrap'),cell:__cellOther===document.querySelectorAll('#pane-a table td .blk')[3],box:__boxOther===document.querySelectorAll('#pane-a .box .blk')[1],head:__head===document.querySelector('#pane-a .surface > .blk')}));
        if (!Object.values(kept).every(Boolean)) throw new Error('Unrelated nested DOM replaced: '+JSON.stringify(kept));
    };
    await page.keyboard.press('q');
    await page.waitForFunction(() => document.querySelector('.ProseMirror table td').textContent.includes('q'));
    await stable();
    await page.locator('#pane-a .box .blk').first().locator('.ch[data-o="2"]').click({position:{x:.1,y:5}});
    await page.keyboard.press('w');
    await page.waitForFunction(() => document.querySelector('.ProseMirror .pm-box p').textContent.includes('w'));
    await stable();
    await page.locator('#pane-a table td').first().locator('.ch[data-o="1"]').click({position:{x:.1,y:5}});
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.locator('#pane-a .mark-btn.bold').click();
    await page.waitForFunction(() => document.querySelectorAll('#pane-a table td .ch.bold').length===2);
    await stable();
    await page.locator('.ProseMirror table td p').first().click();
    await page.locator('#pm-tools').getByRole('button',{name:'열 +',exact:true}).click();
    await page.waitForFunction(() => [...document.querySelectorAll('#pane-a table tr')].every(r=>r.cells.length===3));
    await page.locator('#pm-tools').getByRole('button',{name:'행 +',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pane-a table tr').length===3);
    await page.locator('#pane-a table td').first().locator('.ch').first().click({position:{x:.1,y:5}});
    await page.locator('#pane-a').getByRole('button',{name:'→ 합치기',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#pane-a td[colspan="2"]') && document.querySelector('.ProseMirror td[colspan="2"]'));
    await page.locator('#pane-a').getByRole('button',{name:'나누기',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pane-a table td').length===9 && document.querySelector('#converged').classList.contains('ok'));
    const text=await page.locator('#pane-a .surface').textContent();
    const fresh=await page.context().newPage();
    await fresh.goto(origin+'/pm?doc=nested-render');
    await fresh.waitForFunction(() => document.querySelectorAll('#pane-a table td').length===9 && document.querySelector('#converged').classList.contains('ok'));
    if (await fresh.locator('#pane-a .surface').textContent()!==text) throw new Error('Fresh open differs');
    await fresh.close();
    return {checks:['table cell typing','callout typing','unchanged nested DOM retained','cell formatting','add column','add row','merge cell','split cell','fresh open matches'],passed:9};
}
