async page=>{
 const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
 const plain=node=>(node.runs??[]).map(run=>'text'in run?run.text:plain({runs:run.runs})).join('');
 const all=(node,path=[])=>[{node,path},...(node.children??[]).flatMap((child,index)=>all(child,[...path,index]))];
 const at=(model,path)=>path.reduce((node,index)=>node.children[index],model);
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const wait=async()=>{await page.waitForFunction(async()=>{if(!window.products?.ready()||window.products.errors.length)return false;return (await window.products.snapshot()).equal;},null,{timeout:20000});return page.evaluate(()=>window.products.snapshot());};
 const contexts={word:[['header','Project header',0],['footer','Page footer',0],['cell','Review',0],['caption','Figure 1. Shared design',0]],notion:[['column','Engineering',0],['database cell','Review',1],['callout','Check dependencies',0],['task','Review this draft',0]],presentation:[['notes','Discuss the two metrics.',0],['object group','Grouped text',0],['cell','Review',0],['title','Overview',0]]};
 for(const profile of Object.keys(contexts)){
  for(const name of ['Slate','Lexical','ProseMirror']){
   const doc=`s-${profile[0]}-${name[0].toLowerCase()}-${run}`;await page.goto(`${origin}/?profile=${profile}&doc=${doc}`);await wait();
   for(const [context,text,index] of contexts[profile]){
    const before=(await wait()).server,entry=all(before).filter(({node})=>plain(node)===text)[index];if(!entry)throw new Error(`Missing ${context}`);
    const exact=new RegExp('^'+text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
    const target=page.getByRole('textbox',{name,exact:true}).locator('p,h1,h2,blockquote').filter({hasText:exact}).nth(index);await target.scrollIntoViewIfNeeded();await target.click();
    await target.evaluate(node=>{const first=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();getSelection().setBaseAndExtent(first,2,first,2);document.dispatchEvent(new Event('selectionchange'));});await page.waitForTimeout(120);
    const range=await page.evaluate(name=>window.products.range(name),name);if(!equal(range,{anchor:[...entry.path,2],focus:[...entry.path,2]}))throw new Error('Native target selection does not match the model path');
    await page.evaluate(()=>window.products.clearHistory());
    await page.keyboard.insertText('v');let state=await wait();const after=state.server;
    if(plain(at(after,entry.path))!==text.slice(0,2)+'v'+text.slice(2))throw new Error(`${name} ${profile} ${context}: native input mismatch`);
    await page.locator(`#${name}`).getByRole('button',{name:'Undo',exact:true}).click();state=await wait();if(!equal(state.server,before))throw new Error(`${context} undo changed the surrounding model`);
    await page.locator(`#${name}`).getByRole('button',{name:'Redo',exact:true}).click();state=await wait();if(!equal(state.server,after))throw new Error(`${context} redo mismatch`);
    if(state.peers.some(peer=>peer.fallbacks))throw new Error('Unexpected model-event fallback');
    results.push({profile,editor:name,context,status:'passed',path:entry.path});
   }
  }
  const doc=`m-${profile[0]}-${run}`;await page.goto(`${origin}/?profile=${profile}&doc=${doc}`);let state=await wait();
  const grid=all(state.server).find(({node})=>node.type==='table').path,hidden=[...grid,1,1];
  await page.evaluate(grid=>{window.products.clearHistory();window.products.edit('Slate',[{op:'update',at:[...grid,0,0],attrs:{colspan:2,rowspan:2}}]);},grid);await wait();
  const response=await page.request.post(`${origin}/test/remote`,{data:{profile,doc,edits:[{op:'insert',at:[...hidden,0,0,0],content:'X'},{op:'update',at:hidden,attrs:{properties:{complete:true}}}]}});if(!response.ok())throw new Error(await response.text());
  state=await wait();if(!at(state.server,hidden).attrs.spanned||!at(state.server,hidden).attrs.properties.complete)throw new Error('Hidden cell metadata lost');
  const counts={};for(const name of ['Slate','Lexical','ProseMirror']){counts[name]=await page.getByRole('textbox',{name,exact:true}).locator('table').first().locator('td:visible').count();if(counts[name]!==1)throw new Error(`${name}: incorrect merged visible-cell count ${counts[name]}`);}
  await page.locator('#Slate').getByRole('button',{name:'Undo',exact:true}).click();state=await wait();if(plain(at(state.server,[...hidden,0,0]))!=='XReview'||!at(state.server,hidden).attrs.properties.complete)throw new Error('Unmerge lost foreign hidden content');
  for(const name of ['Slate','Lexical','ProseMirror'])if(await page.getByRole('textbox',{name,exact:true}).locator('table').first().locator('td:visible').count()!==4)throw new Error('Unmerge did not restore four native visible cells');
  await page.locator('#Slate').getByRole('button',{name:'Redo',exact:true}).click();state=await wait();if(!at(state.server,hidden).attrs.spanned)throw new Error('Merge redo mismatch');
  results.push({profile,context:'merged table, foreign hidden content/fields, native visible cells and history',status:'passed',counts});
 }
 return {browserVersion:page.context().browser().version(),run,results};
}
