async page => {
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  const p=text=>({type:'paragraph',runs:text?[{text,marks:{}}]:[]});
  const texts=s=>s.server.model.children.map(node=>(node.runs??[]).map(run=>run.text??'').join(''));
  const wait=async expected=>{
    await page.waitForFunction(expected=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(peer=>peer.online&&!peer.pending&&JSON.stringify(peer.model)===JSON.stringify(s.server.model)&&JSON.stringify(peer.nativeModel)===JSON.stringify(s.server.model))&&(!expected||JSON.stringify(s.server.model.children.map(node=>(node.runs??[]).map(run=>run.text??'').join('')))===JSON.stringify(expected));},expected,{timeout:15000});
    const s=await page.evaluate(()=>window.compat.snapshot());if(s.peers.some(peer=>peer.fallbacks))throw new Error('unexpected event fallback');return s;
  };
  const note=async(name,expected)=>results.push({name,status:'passed',snapshot:await wait(expected)});
  const open=async prefix=>{const doc=`scope-${prefix}-${run}`;await page.goto(`${origin}/?doc=${doc}`);await wait();return doc;};
  const remote=async(doc,edits)=>{const r=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!r.ok())throw new Error(await r.text());};
  let doc=await open('required');let initial=await wait();const required=initial.server.model.children.length===2;
  if(required){
    await page.getByRole('textbox',{name:'slate-a',exact:true}).locator('p').nth(1).click();await page.keyboard.type('required');
    await note('native Slate typing in a derived required paragraph reaches all five peers',['','required']);
    await page.getByRole('textbox',{name:'lexical-a',exact:true}).locator('p').nth(1).click();await page.keyboard.press('End');await page.keyboard.insertText('😀');
    await note('native Lexical UTF16 input preserves the required paragraph',['','required😀']);
    await page.locator('#lexical-a').getByRole('button',{name:'되돌리기',exact:true}).click();await wait(['','required']);
    await page.locator('#lexical-a').getByRole('button',{name:'다시하기',exact:true}).click();await wait(['','required😀']);
    await remote(doc,[{op:'update',at:[1,0],length:3,attrs:{bold:true}}]);
    await note('required paragraph undo redo and remote formatting retain native/server equality',['','required😀']);
  }
  doc=await open('move');initial=await wait();
  await remote(doc,[{op:'delete',at:[0],count:initial.server.model.children.length},{op:'insert',at:[0],content:[p('alpha'),p('beta'),p('gamma')]}]);await wait(['alpha','beta','gamma']);
  await remote(doc,[{op:'move',from:[2],at:[0]}]);await wait(['gamma','alpha','beta']);
  await page.getByRole('textbox',{name:'slate-b',exact:true}).locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type('S');await wait(['gammaS','alpha','beta']);
  await page.getByRole('textbox',{name:'lexical-b',exact:true}).locator('p').nth(2).click();await page.keyboard.press('End');await page.keyboard.type('L');
  await note('native edits in moved and stationary paragraphs use the current logical paths',['gammaS','alpha','betaL']);
  await remote(doc,[{op:'update',at:[0,0],length:5,attrs:{bold:true}}]);await wait(['gammaS','alpha','betaL']);
  await page.getByRole('textbox',{name:'pm-a',exact:true}).locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type('!');
  const final=await wait(['gammaS!','alpha','betaL']);if(!final.server.model.children[0].runs.some(run=>run.marks.bold))throw new Error('lost remote formatting');
  await note('ProseMirror typing preserves remote formatting after placement',['gammaS!','alpha','betaL']);
  return{browserVersion:page.context().browser().version(),requiredRuleFixture:required,results};
}
