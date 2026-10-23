async page=>{
  const results=[];
  const origin=new URL(page.url()).origin;
  const run=Date.now().toString(36);
  const cdp=await page.context().newCDPSession(page);
  const remote=async(doc,edits)=>{const r=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!r.ok())throw new Error(await r.text());return r.json();};
  const converged=async()=>{try{await page.waitForFunction(()=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(p=>!p.pending&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model)&&JSON.stringify(p.model)===JSON.stringify(s.server.model));},null,{timeout:3000});return true;}catch{return false;}};
  const prepare=async(doc,name,anchor=4,focus=anchor)=>{
    doc=`${doc}-${run}`;
    await page.goto(`${origin}/?doc=${doc}&trace=1`);await page.waitForFunction(()=>window.compat&&window.imeProbe);
    await remote(doc,[{op:'insert',at:[0,0],content:'abcdefgh'},{op:'insert',at:[1],content:[{type:'paragraph',runs:[{text:'tail',marks:{}}]}]}]);
    if(!await converged())throw new Error('seed did not converge');
    const p=page.getByRole('textbox',{name,exact:true}).locator('p').first();await p.click();
    await p.evaluate((p,{anchor,focus})=>{const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);const node=walker.nextNode();window.getSelection().setBaseAndExtent(node,anchor,node,focus);},{anchor,focus});
    await page.waitForTimeout(120);await page.evaluate(()=>{window.imeProbe.clear();window.compat.clearTrace();});
  };
  const read=()=>page.evaluate(()=>({probe:window.imeProbe.read(),snapshot:window.compat.snapshot(),operations:window.compat.trace()}));
  const cursorCases=[
    {id:'insert-before',edits:[{op:'insert',at:[0,0],content:'R'}],anchor:4,focus:4,expected:[0,5,0,5],selected:''},
    {id:'insert-after',edits:[{op:'insert',at:[0,8],content:'R'}],anchor:4,focus:4,expected:[0,4,0,4],selected:''},
    {id:'delete-before',edits:[{op:'delete',at:[0,0],count:1}],anchor:4,focus:4,expected:[0,3,0,3],selected:''},
    {id:'delete-anchor',edits:[{op:'delete',at:[0,2],count:3}],anchor:4,focus:4,expected:[0,2,0,2],selected:''},
    {id:'forward-selection',edits:[{op:'insert',at:[0,0],content:'R'}],anchor:2,focus:6,expected:[0,3,0,7],selected:'cdef'},
    {id:'backward-selection',edits:[{op:'insert',at:[0,0],content:'R'}],anchor:6,focus:2,expected:[0,7,0,3],selected:'cdef'},
    {id:'split-before',edits:[{op:'split',at:[0,2]}],anchor:4,focus:4,expected:[1,2,1,2],selected:''},
    {id:'format-before',edits:[{op:'update',at:[0,1],length:2,attrs:{bold:true}}],anchor:4,focus:4,expected:[0,4,0,4],selected:''},
  ];
  for(const [name,short]of[['slate-a','s'],['lexical-a','l'],['pm-a','p']]){
    for(const test of cursorCases){
      const doc=`cursor-${short}-${test.id}`;
      try{
        await prepare(doc,name,test.anchor,test.focus);const before=await read();
        const submitted=await remote(`${doc}-${run}`,test.edits);const same=await converged();const after=await read();
        const s=after.probe.selection,a=s.anchor,f=s.focus;
        const actual=a&&f?[a.paragraph,a.offset,f.paragraph,f.offset]:null;
        const maintained=same&&a?.editor===name&&f?.editor===name&&after.probe.active===name&&JSON.stringify(actual)===JSON.stringify(test.expected)&&s.text===test.selected;
        results.push({category:'cursor',name,case:test.id,status:maintained?'passed':'failed',converged:same,expected:{positions:test.expected,selected:test.selected},actual,before,after,submitted});
      }catch(error){results.push({category:'cursor',name,case:test.id,status:'error',error:String(error)});}
    }
    for(const mode of['control','prefix','same-boundary','other-paragraph']){
      const doc=`ime-${short}-${mode}`;
      try{
        await prepare(doc,name);
        for(const text of['ㅎ','하','한'])await cdp.send('Input.imeSetComposition',{text,selectionStart:1,selectionEnd:1});
        await page.waitForTimeout(100);const during=await read();
        const edits=mode==='prefix'?[{op:'insert',at:[0,0],content:'R'}]:mode==='same-boundary'?[{op:'insert',at:[0,4],content:'R'}]:[{op:'insert',at:[1,0],content:'R'}];
        const submitted=mode==='control'?null:await remote(`${doc}-${run}`,edits);await page.waitForTimeout(400);const afterRemote=await read();
        const compositionSurvived=afterRemote.probe.composing.includes(name)&&afterRemote.probe.active===name;
        await cdp.send('Input.insertText',{text:'한'});
        await page.waitForTimeout(250);const same=await converged();const final=await read();
        const text=final.snapshot.server?.model.children.map(n=>(n.runs??[]).map(r=>r.text??'').join('')).join('\n');
        const expected=mode==='control'?['abcd한efgh\ntail']:mode==='prefix'?['Rabcd한efgh\ntail']:mode==='same-boundary'?['abcdR한efgh\ntail','abcd한Refgh\ntail']:['abcd한efgh\nRtail'];
        const starts=final.probe.events.filter(e=>e.name===name&&e.type==='compositionstart').length;
        const ended=final.probe.events.some(e=>e.name===name&&e.type==='compositionend');
        const passed=same&&compositionSurvived&&starts===1&&ended&&expected.includes(text);
        const image=`output/playwright/screen-next-compat-20261023/input-fixed/${doc}.png`;
        await page.screenshot({path:image,fullPage:true});
        results.push({category:'ime-cdp',name,case:mode,status:passed?'passed':'failed',inputMethod:'Chrome Input.imeSetComposition + Input.insertText; OS keyboard not used',compositionSurvived,converged:same,starts,ended,expected,actual:text,during,afterRemote,final,submitted,screenshot:image});
      }catch(error){results.push({category:'ime-cdp',name,case:mode,status:'error',error:String(error)});}
    }
  }
  await cdp.detach();
  return {run,browserVersion:page.context().browser().version(),results};
}
