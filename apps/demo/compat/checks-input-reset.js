async page=>{
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  const cdp=await page.context().newCDPSession(page);
  const wait=expected=>page.waitForFunction(expected=>{
    const s=window.compat?.snapshot();
    const text=s?.server?.model.children.map(n=>(n.runs??[]).map(r=>r.text??'').join('')).join('\n');
    return text===expected&&!s.failures.length&&s.peers.every(p=>!p.pending&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model)&&JSON.stringify(p.model)===JSON.stringify(s.server.model));
  },expected);
  try{
    for(const [name,short] of [['slate-a','s'],['lexical-a','l'],['pm-a','p']]){
      const doc=`reset-${short}-${run}`;
      await page.goto(`${origin}/?doc=${doc}`);
      await wait('');
      await page.getByRole('textbox',{name,exact:true}).click();
      for(const text of ['ㅎ','하','한'])await cdp.send('Input.imeSetComposition',{text,selectionStart:1,selectionEnd:1});
      const composing=await page.evaluate(()=>window.imeProbe.read());
      if(!composing.composing.includes(name))throw new Error(`composition not started: ${name}`);
      const response=await page.request.post(`${origin}/api/docs/${doc}/reset`);
      if(!response.ok())throw new Error(`reset HTTP ${response.status()}`);
      await wait('');
      await cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});
      await wait('');
      await page.keyboard.insertText('Z');
      await wait('Z');
      const snapshot=await page.evaluate(()=>window.compat.snapshot());
      results.push({name,status:'passed',case:'reset during composition on an otherwise empty live document',snapshot});
    }
  }finally{await cdp.detach();}
  return{results};
}
