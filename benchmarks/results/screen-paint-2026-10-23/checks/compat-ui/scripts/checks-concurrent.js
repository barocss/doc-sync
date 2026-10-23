async page => {
  const checks=[];
  const snap=()=>page.evaluate(()=>window.compat.snapshot());
  const wait=()=>page.waitForFunction(()=>{const s=window.compat.snapshot();return !s.failures.length&&s.server&&s.peers.every(p=>p.online&&!p.pending&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model)&&JSON.stringify(p.model)===JSON.stringify(s.server.model));});
  const reset=async()=>{await page.locator('#reset').click();await page.waitForFunction(()=>{const s=window.compat.snapshot();return s.server?.seq===0&&s.peers.every(p=>p.seq===0&&p.model.children.length===1&&!p.model.children[0].runs.length&&JSON.stringify(p.nativeModel)===JSON.stringify(p.model));});};
  await reset();
  await page.getByRole('textbox',{name:'slate-a',exact:true}).click();await page.keyboard.type('abcdefgh');await wait();
  await page.locator('#disconnect').click();await page.waitForFunction(()=>window.compat.snapshot().peers.every(p=>!p.online));
  for(const [name,letter] of [['slate-a','A'],['slate-b','B'],['lexical-a','C'],['lexical-b','D'],['pm-a','E']]){
    const paragraph=page.getByRole('textbox',{name,exact:true}).locator('p').first();
    await paragraph.click();
    await paragraph.evaluate(p=>{const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);const text=walker.nextNode();if(text.textContent!=='abcdefgh')throw new Error('unexpected seed text');window.getSelection().collapse(text,4);});
    await page.waitForTimeout(100);
    const offset=await page.evaluate(()=>window.getSelection().anchorOffset);
    if(offset!==4)throw new Error(`${name}: unexpected browser caret ${offset}`);
    await page.keyboard.press('Enter');await page.keyboard.type(letter);
  }
  const offline=await snap();
  if(offline.peers.some(p=>!p.pending))throw new Error('offline edits were not queued');
  await page.locator('#connect').click();await wait();
  let final=await snap();
  if(final.server.model.children.length!==2)throw new Error(`concurrent Enter made ${final.server.model.children.length} paragraphs`);
  const tail=final.server.model.children[1].runs.map(r=>r.text).join('');
  if(!['A','B','C','D','E','efgh'].every(t=>tail.includes(t)))throw new Error(`concurrent text lost: ${tail}`);
  checks.push({name:'Same-position concurrent Enter in Slate 2 + Lexical 2 + ProseMirror 1, offline/reconnect',offline,final});
  await page.evaluate(result=>window.concurrentCheckResults=result,checks);
  await page.screenshot({path:'output/playwright/screen-next-compat-20261023/reconnect-fixed/concurrent-enter.png',fullPage:true});
  await reset();
  await page.locator('#disconnect').click();await page.waitForFunction(()=>window.compat.snapshot().peers.every(p=>!p.online));
  for(const [name,text] of [['slate-a','슬레이트A'],['slate-b','슬레이트B'],['lexical-a','렉시컬C'],['lexical-b','렉시컬D'],['pm-a','프로즈E']]){
    await page.getByRole('textbox',{name,exact:true}).click();await page.keyboard.insertText(text);
  }
  const offlineText=await snap();
  await page.locator('#connect').click();
  await wait();
  final=await snap();
  const text=final.server.model.children[0].runs.map(r=>r.text).join('');
  if(!['슬레이트A','슬레이트B','렉시컬C','렉시컬D','프로즈E'].every(t=>text.includes(t)))throw new Error(`offline text lost: ${text}`);
  checks.push({name:'Concurrent Korean inserts while disconnected, then reconnect',offline:offlineText,final});
  await page.screenshot({path:'output/playwright/screen-next-compat-20261023/reconnect-fixed/empty-document-reconnected.png',fullPage:true});
  await page.evaluate(result=>window.concurrentCheckResults=result,checks);
  return {checks};
}
