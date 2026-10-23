async page=>{
  const results=[],run=Date.now().toString(36);
  const origin=new URL(page.url()).origin;
  const wait=()=>page.waitForFunction(()=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(p=>!p.pending&&JSON.stringify(p.model)===JSON.stringify(s.server.model)&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model));},null,{timeout:5000});
  const select=async(name,paragraph,anchor,focus=anchor)=>{
    const p=page.getByRole('textbox',{name,exact:true}).locator('p').nth(paragraph);await p.click();
    await p.evaluate((p,{anchor,focus})=>{const n=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(n,anchor,n,focus);},{anchor,focus});await page.waitForTimeout(100);
  };
  for(const name of['slate-a','lexical-a','pm-a']){
    await page.goto(`${origin}/?doc=operations-${name}-${run}&trace=1`);await wait();
    const capture=async(operation,act)=>{
      const before=await page.evaluate(()=>window.compat.snapshot());await page.evaluate(()=>window.compat.clearTrace());
      await act();await page.waitForTimeout(150);await wait();
      const after=await page.evaluate(()=>({snapshot:window.compat.snapshot(),trace:window.compat.trace()}));
      const local=after.trace.filter(r=>r.name===name&&r.phase==='local');
      results.push({name,operation,status:local.length?'captured':'missing-local-trace',before,after});
    };
    await capture('insert',async()=>{await page.getByRole('textbox',{name,exact:true}).click();await page.keyboard.insertText('abcdef');});
    await select(name,0,3);await capture('split',()=>page.keyboard.press('Enter'));
    await select(name,1,0);await capture('merge',()=>page.keyboard.press('Backspace'));
    await select(name,0,1,3);await capture('bold',()=>name==='slate-a'?page.locator(`#${name}`).getByRole('button',{name:'굵게',exact:true}).click():page.keyboard.press('Meta+b'));
    await select(name,0,1);await capture('delete',()=>page.keyboard.press('Backspace'));
    await capture('table',()=>page.locator(`#${name}`).getByRole('button',{name:'표 2×3',exact:true}).click());
    await page.getByRole('textbox',{name,exact:true}).locator('td p').first().click();
    await capture('column',()=>page.locator(`#${name}`).getByRole('button',{name:'열 추가',exact:true}).click());
    await page.getByRole('textbox',{name,exact:true}).locator('td p').first().click();
    await capture('row',()=>page.locator(`#${name}`).getByRole('button',{name:'행 추가',exact:true}).click());
    await page.getByRole('textbox',{name,exact:true}).locator('td p').first().click();
    await capture('cell-text',()=>page.keyboard.insertText('칸'));
    // Undo uses SyncClient history; its model event is labelled with cause=undo.
    await page.evaluate(()=>window.compat.clearTrace());await page.locator(`#${name}`).getByRole('button',{name:'되돌리기',exact:true}).click();await wait();
    const undone=await page.evaluate(()=>({snapshot:window.compat.snapshot(),trace:window.compat.trace()}));
    const historyTrace=undone.trace.some(record=>record.name===name&&record.phase==='remote'&&record.cause==='undo');
    results.push({name,operation:'undo',status:historyTrace?'captured':'missing-history-trace',after:undone});
  }
  return{run,browserVersion:page.context().browser().version(),results};
}
