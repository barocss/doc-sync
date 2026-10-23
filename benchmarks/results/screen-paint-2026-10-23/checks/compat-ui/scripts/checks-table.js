async page => {
  const checks=[];
  const snap=()=>page.evaluate(()=>window.compat.snapshot());
  const wait=()=>page.waitForFunction(()=>{const s=window.compat.snapshot();return !s.failures.length&&s.server&&s.peers.every(p=>p.online&&!p.pending&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model)&&JSON.stringify(p.model)===JSON.stringify(s.server.model));});
  const shape=s=>s.server.model.children.find(n=>n.type==='table')?.children.map(r=>r.children.length);
  const reset=async()=>{await page.locator('#reset').click();await page.waitForFunction(()=>{const s=window.compat.snapshot();return s.server?.seq===0&&s.peers.every(p=>p.seq===0&&p.model.children.length===1&&!p.model.children[0].runs.length&&JSON.stringify(p.nativeModel)===JSON.stringify(p.model));});};
  for(const kind of ['slate-a','lexical-a','pm-a']){
    await reset();
    await page.locator(`#${kind}`).getByRole('button',{name:'표 2×3',exact:true}).click();await wait();
    let s=await snap();if(JSON.stringify(shape(s))!=='[3,3]')throw new Error(`${kind} table insert failed`);
    await page.getByRole('textbox',{name:kind,exact:true}).locator('td p').first().click();
    await page.locator(`#${kind}`).getByRole('button',{name:'열 추가',exact:true}).click();await wait();
    s=await snap();if(JSON.stringify(shape(s))!=='[4,4]')throw new Error(`${kind} column insert failed`);
    await page.getByRole('textbox',{name:kind,exact:true}).locator('td p').first().click();await page.keyboard.insertText(`${kind} 칸`);await wait();
    s=await snap();if(!JSON.stringify(s.server.model).includes(`${kind} 칸`))throw new Error(`${kind} cell text failed`);
    checks.push({name:`${kind}: native 2x3 table insertion, column addition to 2x4, cell editing`,snapshot:s});
  }
  await reset();
  await page.locator('#slate-a').getByRole('button',{name:'표 2×3',exact:true}).click();await wait();
  await page.locator('#disconnect').click();await page.waitForFunction(()=>window.compat.snapshot().peers.every(p=>!p.online));
  await page.locator('#slate-a').getByRole('button',{name:'행 추가',exact:true}).click();
  await page.locator('#lexical-a').getByRole('button',{name:'열 추가',exact:true}).click();
  await page.getByRole('textbox',{name:'pm-a',exact:true}).locator('td p').last().click();await page.keyboard.type('PM-cell');
  const offline=await snap();
  await page.locator('#connect').click();await wait();const final=await snap();
  if(JSON.stringify(shape(final))!=='[4,4,4]')throw new Error(`concurrent row/column mismatch: ${shape(final)}`);
  if(!JSON.stringify(final.server.model).includes('PM-cell'))throw new Error('concurrent ProseMirror cell text lost');
  checks.push({name:'Concurrent Slate row insertion, Lexical column insertion and ProseMirror cell edit, reconnect to 3x4',offline,final});
  await page.screenshot({path:'output/playwright/screen-next-compat-20261023/reconnect-fixed/table.png',fullPage:true});
  await page.evaluate(result=>window.tableCheckResults=result,checks);
  return {checks};
}
