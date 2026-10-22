async page => {
  const checks=[];
  const snapshot=()=>page.evaluate(()=>window.compat.snapshot());
  const wait=expected=>page.waitForFunction(expected=>{const s=window.compat.snapshot();const text=s.server?.model.children.filter(n=>n.type==='paragraph').map(n=>(n.runs??[]).map(r=>r.text??'').join('')).join('\n');return(expected===undefined||text===expected)&&!s.failures.length&&s.server&&s.peers.length===5&&s.peers.every(p=>p.online&&!p.pending&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model)&&JSON.stringify(p.model)===JSON.stringify(s.server.model));},expected);
  const waitReset=()=>page.waitForFunction(()=>{const s=window.compat.snapshot();return !s.failures.length&&s.server?.seq===0&&s.server.model.children.length===1&&s.peers.every(p=>!p.pending&&p.seq===0&&p.model.children.length===1&&!p.model.children[0].runs.length&&JSON.stringify(p.nativeModel)===JSON.stringify(p.model));});
  await page.locator('#reset').click();await waitReset();
  let expected='';
  for(const [name,text] of [['slate-a','S'],['lexical-a','L'],['pm-a','P']]){
    await page.getByRole('textbox',{name,exact:true}).locator('p').first().click();await page.keyboard.press('End');await page.waitForTimeout(100);await page.keyboard.type(text);expected+=text;await wait(expected);
    checks.push({name:`${name} native typing reaches every other editor and server`,snapshot:await snapshot()});
  }
  await page.getByRole('textbox',{name:'slate-a',exact:true}).locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type('X');await wait('SLPX');
  await page.locator('#pm-a').getByRole('button',{name:'되돌리기',exact:true}).click();await wait('SLX');
  await page.locator('#pm-a').getByRole('button',{name:'다시하기',exact:true}).click();await wait('SLPX');
  checks.push({name:'ProseMirror undo and redo preserve remote Slate insertion',snapshot:await snapshot()});
  await page.screenshot({path:'output/playwright/editor-compatibility/reconnect-fixed/three-editor-input.png',fullPage:true});
  const beforeReload=await snapshot();
  for(let attempt=0;attempt<3;attempt++){await page.reload();await wait('SLPX');}
  checks.push({name:'Three fresh reloads restore all five editor models from server snapshot',before:beforeReload,reloads:3,snapshot:await snapshot()});
  let resetRequests=0;
  const observe=request=>{if(request.method()==='POST'&&request.url().endsWith('/reset'))resetRequests++;};
  page.on('request',observe);
  await page.evaluate(()=>{document.querySelector('#reset').click();document.querySelector('#reset').click();});
  await waitReset();page.off('request',observe);
  if(resetRequests!==1)throw new Error(`duplicate reset requests: ${resetRequests}`);
  checks.push({name:'Duplicate manual reset is guarded across all five clients',resetRequests,snapshot:await snapshot()});
  return {checks};
}
