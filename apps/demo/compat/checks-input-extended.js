async page=>{
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  const cdp=await page.context().newCDPSession(page);
  const remote=async(doc,edits)=>{const r=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!r.ok())throw new Error(await r.text());return r.json();};
  const wait=()=>page.waitForFunction(()=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(p=>p.online&&!p.pending&&JSON.stringify(p.model)===JSON.stringify(s.server.model)&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model));},null,{timeout:5000});
  const read=()=>page.evaluate(()=>({probe:window.imeProbe.read(),snapshot:window.compat.snapshot(),operations:window.compat.trace()}));
  const serverText=s=>s.snapshot.server.model.children.map(n=>(n.runs??[]).map(r=>r.text??'').join('')).join('\n');
  const compose=async texts=>{for(const text of texts)await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});};
  const tests=[
    {id:'delete-before',edits:[{op:'delete',at:[0,0],count:1}],expected:'bcd한efgh\ntail'},
    {id:'delete-anchor',edits:[{op:'delete',at:[0,2],count:3}],expected:'ab한fgh\ntail'},
    {id:'split-before',edits:[{op:'split',at:[0,2]}],expected:'ab\ncd한efgh\ntail'},
    {id:'format-overlap',edits:[{op:'update',at:[0,2],length:4,attrs:{bold:true}}],expected:'abcd한efgh\ntail'},
    {id:'multiple-remotes',edits:[{op:'insert',at:[0,0],content:'X'}],second:[{op:'insert',at:[0,0],content:'Y'}],expected:'YXabcd한efgh\ntail'},
    {id:'cancel',edits:[{op:'insert',at:[0,0],content:'R'}],expected:'Rabcdefgh\ntail'},
    {id:'undo-redo',edits:[{op:'insert',at:[0,0],content:'R'}],expected:'Rabcd한efgh\ntail'},
    {id:'offline-reconnect',edits:[{op:'insert',at:[0,0],content:'R'}],expected:'Rabcd한efgh\ntail'},
    {id:'unicode',seed:'a😀bcdefgh',offset:5,edits:[{op:'insert',at:[0,0],content:'R'}],expected:'Ra😀bc한defgh\ntail'},
    {id:'empty',seed:'',offset:0,edits:[{op:'insert',at:[0,0],content:'R'}],expected:['R한\ntail','한R\ntail']},
    {id:'repeat-composition',edits:[{op:'insert',at:[0,0],content:'R'}],expected:'Rabcd한efgh\ntail'},
  ];
  for(const [name,short]of[['slate-a','s'],['lexical-a','l'],['pm-a','p']])for(const test of tests){
    const doc=`ext-${short}-${test.id}-${run}`;
    try{
      await page.goto(`${origin}/?doc=${doc}&trace=1`);await page.waitForFunction(()=>window.compat&&window.imeProbe);
      await remote(doc,[{op:'insert',at:[0,0],content:test.seed??'abcdefgh'},{op:'insert',at:[1],content:[{type:'paragraph',runs:[{text:'tail',marks:{}}]}]}]);await wait();
      const p=page.getByRole('textbox',{name,exact:true}).locator('p').first();await p.click();
      await p.evaluate((p,offset)=>{const n=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().collapse(n??p,offset);},test.offset??4);
      await page.waitForTimeout(100);await page.evaluate(()=>{window.compat.clearTrace();window.imeProbe.clear();});
      if(test.id==='offline-reconnect'){await page.locator('#disconnect').evaluate(button=>button.click());await page.waitForFunction(()=>window.compat.snapshot().peers.every(p=>!p.online));}
      await compose(['ㅎ','하','한']);const during=await read();
      await remote(doc,test.edits);if(test.second)await remote(doc,test.second);await page.waitForTimeout(200);const afterRemote=await read();
      if(test.id==='cancel')await cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});
      else await cdp.send('Input.insertText',{text:'한'});
      await page.waitForTimeout(100);
      if(test.id==='offline-reconnect')await page.locator('#connect').evaluate(button=>button.click());
      await wait();let final=await read();
      const expected=Array.isArray(test.expected)?test.expected:[test.expected];
      const checks={text:expected.includes(serverText(final)),focus:final.probe.active===name,compositionStarted:during.probe.events.filter(e=>e.name===name&&e.type==='compositionstart').length===1,compositionSurvived:afterRemote.probe.composing.includes(name),compositionEnded:final.probe.events.some(e=>e.name===name&&e.type==='compositionend')};
      if(test.id==='format-overlap')checks.marks=final.snapshot.server.model.children[0].runs.filter(r=>r.marks.bold).map(r=>r.text).join('')==='cdef';
      if(test.id==='undo-redo'){
        await page.locator(`#${name}`).getByRole('button',{name:'되돌리기',exact:true}).click();await wait();
        checks.undo=serverText(await read())===test.expected.replace('한','');
        await page.locator(`#${name}`).getByRole('button',{name:'다시하기',exact:true}).click();await wait();
        checks.redo=serverText(await read())===test.expected;final=await read();
      }else if(test.id==='repeat-composition'){
        await compose(['ㄱ','그','글']);await cdp.send('Input.insertText',{text:'글'});await page.waitForTimeout(100);await wait();
        checks.repeat=serverText(await read())===test.expected.replace('한','한글');final=await read();
      }else{
        await page.keyboard.insertText('Z');await wait();final=await read();
        const continued=test.id==='cancel'?['RabcdZefgh\ntail']:expected.map(text=>text.replace('한','한Z'));
        checks.continuedTyping=continued.includes(serverText(final));
      }
      results.push({name,case:test.id,status:Object.values(checks).every(Boolean)?'passed':'failed',checks,expected:test.expected,during,afterRemote,final,actual:serverText(final)});
    }catch(error){results.push({name,case:test.id,status:'error',error:String(error),state:await read().catch(()=>null)});}
  }
  await cdp.detach();return{run,browserVersion:page.context().browser().version(),results};
}
