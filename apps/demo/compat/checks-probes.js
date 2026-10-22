async page=>{
  const origin=new URL(page.url()).origin;
  const run=Date.now().toString(36),checks=[];
  const wait=()=>page.waitForFunction(()=>{
    const s=window.compat?.snapshot();
    return s?.server&&!s.failures.length&&s.peers.every(p=>p.online&&!p.pending&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model)&&JSON.stringify(p.model)===JSON.stringify(s.server.model));
  });
  for(const enabled of [false,true]){
    const doc=`probe-${enabled?'on':'off'}-${run}`;
    await page.goto(`${origin}/?doc=${doc}${enabled?'&trace=1':''}`);
    await wait();
    for(const name of ['slate-a','lexical-a','pm-a']){
      await page.getByRole('textbox',{name,exact:true}).locator('p').first().click();
      await page.keyboard.press('End');
      await page.keyboard.insertText('한😀');
      await wait();
      const records=await page.evaluate(()=>window.compat.trace());
      if(enabled&&!records.some(r=>r.name===name&&r.phase==='local'))throw new Error(`missing local trace: ${name}`);
      if(!enabled&&records.length)throw new Error('trace enabled without opt-in');
    }
    const probe=await page.evaluate(()=>window.imeProbe.read());
    if(!probe.events.some(e=>e.type==='input'&&e.isTrusted))throw new Error('trusted browser input was not observed');
    const response=await page.request.post(`${origin}/test/remote`,{data:{doc,edits:[{op:'insert',at:[0,0],content:'R'}]}});
    if(!response.ok())throw new Error(await response.text());
    await wait();
    const result=await page.evaluate(()=>({snapshot:window.compat.snapshot(),trace:window.compat.trace()}));
    const text=result.snapshot.server.model.children[0].runs.map(r=>r.text).join('');
    if(text!=='R한😀한😀한😀')throw new Error(`unexpected remote result: ${text}`);
    if(enabled&&result.snapshot.peers.some(p=>!result.trace.some(r=>r.name===p.name&&r.phase==='remote')))throw new Error('missing remote native trace');
    if(!enabled&&result.trace.length)throw new Error('remote trace enabled without opt-in');
    await page.evaluate(()=>window.compat.clearTrace());
    if((await page.evaluate(()=>window.compat.trace())).length)throw new Error('trace not cleared');
    checks.push({name:enabled?'opt-in tracing':'default tracing disabled',text,peerCount:result.snapshot.peers.length,records:result.trace.length,trustedInputObserved:true});
  }
  return {checks};
}
