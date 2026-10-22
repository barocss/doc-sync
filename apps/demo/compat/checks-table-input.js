async page=>{
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[],cdp=await page.context().newCDPSession(page);
  const paragraph=text=>({type:'paragraph',runs:text?[{text,marks:{}}]:[]});
  const cell=text=>({type:'table-cell',children:[{type:'table-cell-body',children:[paragraph(text)]}]});
  const row=()=>({type:'table-row',children:[cell(''),cell(''),cell('')]});
  const wait=()=>page.waitForFunction(()=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(p=>!p.pending&&JSON.stringify(p.model)===JSON.stringify(s.server.model)&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model));},null,{timeout:5000});
  const remote=async(doc,edits)=>{const r=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!r.ok())throw new Error(await r.text());};
  const read=()=>page.evaluate(()=>{
    const s=window.getSelection(),n=s.anchorNode,element=n?.nodeType===1?n:n?.parentElement,td=element?.closest('td'),p=element?.closest('p');let offset=null;
    if(p){const r=document.createRange();r.selectNodeContents(p);r.setEnd(n,s.anchorOffset);offset=r.toString().length;}
    return{selection:{editor:element?.closest('.editor')?.getAttribute('aria-label'),row:td?.parentElement.rowIndex,column:td?.cellIndex,offset,text:p?.textContent},probe:window.imeProbe.read(),snapshot:window.compat.snapshot()};
  });
  for(const [name,short]of[['slate-a','s'],['lexical-a','l'],['pm-a','p']])for(const mode of['column-before','row-before','cell-prefix','ime-column-before']){
    const doc=`cell-${short}-${mode}-${run}`;
    try{
      await page.goto(`${origin}/?doc=${doc}&trace=1`);await page.waitForFunction(()=>window.compat);
      const table={type:'table',children:[row(),row()]};table.children[0].children[0]=cell('abcd');
      await remote(doc,[{op:'insert',at:[1],content:[table]}]);await wait();
      const p=page.getByRole('textbox',{name,exact:true}).locator('td p').first();await p.click();
      await p.evaluate(p=>window.getSelection().collapse(document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode(),2));await page.waitForTimeout(100);await page.evaluate(()=>window.imeProbe.clear());
      if(mode==='ime-column-before')for(const text of['ㅎ','하','한'])await cdp.send('Input.imeSetComposition',{text,selectionStart:1,selectionEnd:1});
      const edits=mode==='row-before'?[{op:'insert',at:[1,0],content:[row()]}]:mode==='cell-prefix'?[{op:'insert',at:[1,0,0,0,0,0],content:'R'}]:[{op:'insert',at:[1,0,0],content:[cell('')]},{op:'insert',at:[1,1,0],content:[cell('')]}];
      await remote(doc,edits);await page.waitForTimeout(200);
      if(mode==='ime-column-before'){await cdp.send('Input.insertText',{text:'한'});await page.waitForTimeout(100);}
      await wait();const after=await read();
      const expected={editor:name,row:mode==='row-before'?1:0,column:mode.includes('column')?1:0,offset:mode==='cell-prefix'||mode==='ime-column-before'?3:2,text:mode==='cell-prefix'?'Rabcd':mode==='ime-column-before'?'ab한cd':'abcd'};
      const matches=Object.entries(expected).every(([key,value])=>after.selection[key]===value)&&after.probe.active===name;
      await page.keyboard.insertText('Z');await wait();const final=await read();
      const continued=mode==='cell-prefix'?'RabZcd':mode==='ime-column-before'?'ab한Zcd':'abZcd';
      results.push({name,case:mode,status:matches&&final.selection.text===continued?'passed':'failed',expected,after,final});
    }catch(error){results.push({name,case:mode,status:'error',error:String(error),state:await read().catch(()=>null)});}
  }
  await cdp.detach();return{run,browserVersion:page.context().browser().version(),results};
}
