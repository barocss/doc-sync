async page => {
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  const p=text=>({type:'paragraph',runs:[{text,marks:{}}]});
  const wait=async expected=>{
    await page.waitForFunction(expected=>{
      const s=window.compat?.snapshot();
      return s?.server&&!s.failures.length&&(!expected||JSON.stringify(s.server.model)===JSON.stringify(expected))&&s.peers.every(peer=>peer.online&&!peer.pending&&!peer.fallbacks&&JSON.stringify(peer.model)===JSON.stringify(s.server.model)&&JSON.stringify(peer.nativeModel)===JSON.stringify(s.server.model));
    },expected,{timeout:15000});
  };
  const cases=[{id:'caret-outside',anchor:4,focus:4,split:6,expected:[11,4,11,4],text:''},
    {id:'forward-outside',anchor:2,focus:5,split:6,expected:[11,2,11,5],text:'cde'},
    {id:'backward-outside',anchor:5,focus:2,split:6,expected:[11,5,11,2],text:'cde'},
    {id:'caret-inside',anchor:4,focus:4,split:10,expected:[11,1,11,1],text:''}];
  for(const [name,short] of [['slate-a','s'],['lexical-a','l'],['pm-a','p']])for(const scenario of cases){
    const doc=`sw-${short}-${scenario.id}-${run}`;
    await page.goto(`${origin}/?doc=${doc}`);await wait();
    let response=await page.request.post(`${origin}/test/remote`,{data:{doc,edits:[{op:'insert',at:[0,0],content:'abcdef'},{op:'insert',at:[1],content:Array.from({length:15},()=>p('abcdef'))}]}});if(!response.ok())throw new Error(await response.text());
    await wait({type:'content',children:Array.from({length:16},()=>p('abcdef'))});
    const paragraph=page.getByRole('textbox',{name,exact:true}).locator('p').nth(10);await paragraph.click();
    await paragraph.evaluate((node,{anchor,focus})=>{const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(text,anchor,text,focus);document.dispatchEvent(new Event('selectionchange'));},scenario);
    await page.waitForTimeout(120);
    response=await page.request.post(`${origin}/test/remote`,{data:{doc,edits:[{op:'split',at:[scenario.split,3]}]}});if(!response.ok())throw new Error(await response.text());
    const children=Array.from({length:16},()=>p('abcdef'));children.splice(scenario.split,1,p('abc'),p('def'));await wait({type:'content',children});
    await page.waitForFunction(({name,expected,text})=>{const s=window.imeProbe.read(),a=s.selection.anchor,f=s.selection.focus;return s.active===name&&a?.editor===name&&f?.editor===name&&JSON.stringify([a.paragraph,a.offset,f.paragraph,f.offset])===JSON.stringify(expected)&&s.selection.text===text;},{name,expected:scenario.expected,text:scenario.text},{timeout:5000});
    results.push({name,case:scenario.id,status:'passed',expected:scenario.expected,probe:await page.evaluate(()=>window.imeProbe.read()),snapshot:await page.evaluate(()=>window.compat.snapshot())});
  }
  return {browserVersion:page.context().browser().version(),results};
}
