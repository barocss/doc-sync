async page=>{
 const origin=new URL(page.url()).origin,run=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,results=[];
 const at=(root,path)=>path.reduce((node,index)=>node.children[index],root);
 const text=node=>(node.runs??[]).map(run=>'text'in run?run.text:'').join('');
 async function wait(){const until=Date.now()+20000;while(Date.now()<until){const result=await page.evaluate(async()=>window.products?.ready()?window.products.snapshot():null);if(result?.equal)return result;await page.waitForTimeout(100);}throw Error('native/client/server convergence timed out');}
 for(const profile of ['word','notion','presentation'])for(const name of ['Slate','Lexical','ProseMirror'])for(const direction of ['forward','backward','caret']){
  const doc=`schema-${profile[0]}-${name[0].toLowerCase()}-${direction[0]}-${run}`;
  await page.goto(`${origin}/?profile=${profile}&doc=${doc}`);await wait();
  const {path,text:base}=await page.evaluate(()=>window.products.target);
  await page.evaluate(()=>window.products.clearHistory());
  const p=page.locator(`#${name} .editor p`).filter({hasText:base}).first();await p.scrollIntoViewIfNeeded();await p.click();
  await page.evaluate(name=>window.products.disconnect(name),name);
  await p.evaluate(node=>{let w=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),t;while(w.nextNode())t=w.currentNode;window.getSelection().setBaseAndExtent(t,t.length,t,t.length);document.dispatchEvent(new Event('selectionchange'))});
  await page.keyboard.insertText('U');await page.waitForTimeout(150);
  const pending=await page.evaluate(name=>window.products.status().find(peer=>peer.name===name).pending,name);if(pending!==1)throw Error(`${profile}/${name}: pending=${pending}`);
  const other=name==='Slate'?'Lexical':'Slate';
  await page.evaluate(({other,path})=>window.products.edit(other,[{op:'insert',at:[...path,0],content:'R'}]),{other,path});
  let server;for(let n=0;n<100;n++){server=await (await page.request.get(`${origin}/profiles/${profile}/api/docs/${doc}/state`)).json();if(text(at(server.model,path)).startsWith('R'))break;await page.waitForTimeout(100)}
  if(!text(at(server.model,path)).startsWith('R'))throw Error('Remote input did not reach server');
  const anchor=direction==='backward'?6:direction==='caret'?4:2,focus=direction==='backward'?2:direction==='caret'?4:6;
  await p.evaluate((node,{anchor,focus})=>{const t=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(t,anchor,t,focus);document.dispatchEvent(new Event('selectionchange'))},{anchor,focus});await page.waitForTimeout(150);
  const selection=await page.evaluate(name=>({text:window.getSelection().toString(),range:window.products.range(name)}),name);if(!selection.range||(direction!=='caret'&&!selection.text))throw Error('No initial selection');
  const previous=await (await page.request.get(`${origin}/profiles/${profile}/api/docs/${doc}/schema`)).json(),next=structuredClone(previous.schema);next.marks.push('review');next.nodes['review-marker']={shape:'atom'};next.nodes[next.root].children.push('review-marker');
  const response=await page.request.post(`${origin}/profiles/${profile}/api/docs/${doc}/schema`,{headers:{'x-doc-sync-protocol':'3','x-doc-sync-epoch':server.epoch,'x-doc-sync-schema':server.schemaVersion},data:{base:{epoch:server.epoch,serverSeq:server.serverSeq,schemaVersion:server.schemaVersion},schema:next}});
  if(!response.ok())throw Error(`schema transition failed: ${await response.text()}`);
  await page.getByRole('button',{name:'Load server schema',exact:true}).click();
  await page.waitForFunction(()=>window.products.upgradeStatus()==='Schema loaded'||window.products.upgradeStatus().startsWith('Schema transition failed:'),null,{timeout:20000});
  const status=await page.evaluate(()=>window.products.upgradeStatus());if(status!=='Schema loaded')throw Error(status);
  let state=await wait();const expected='R'+base+'U';if(text(at(state.server,path))!==expected)throw Error(`${profile}/${name}: lost input: ${text(at(state.server,path))}`);
  const after=await page.evaluate(name=>({text:window.getSelection().toString(),range:window.products.range(name)}),name);
  if(after.text!==selection.text||JSON.stringify(after.range)!==JSON.stringify({anchor:[...path,anchor+1],focus:[...path,focus+1]}))throw Error(`${profile}/${name}/${direction}: selection changed ${JSON.stringify({selection,after})}`);
  await page.locator(`#${name}`).getByRole('button',{name:'Undo',exact:true}).click();state=await wait();if(text(at(state.server,path))!=='R'+base)throw Error('Undo lost the remote edit');
  await page.locator(`#${name}`).getByRole('button',{name:'Redo',exact:true}).click();state=await wait();if(text(at(state.server,path))!==expected)throw Error('Redo lost an edit');
  const newParagraph=page.locator(`#${name} .editor p`).filter({hasText:base}).first();await newParagraph.click();
  await newParagraph.evaluate(node=>{let w=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),t;while(w.nextNode())t=w.currentNode;window.getSelection().setBaseAndExtent(t,t.length,t,t.length);document.dispatchEvent(new Event('selectionchange'))});
  await page.keyboard.insertText('V');state=await wait();if(text(at(state.server,path))!==expected+'V')throw Error('Native editing failed after schema transition');
  await page.evaluate(({name,index})=>window.products.edit(name,[{op:'insert',at:[index],content:[{type:'review-marker'}]}]),{name,index:state.server.children.length});state=await wait();
  if(!state.server.children.some(node=>node.type==='review-marker'))throw Error('New schema node was not inserted');
  results.push({profile,editor:name,direction,status:'passed',pendingBefore:pending,selection,after,expected,newNode:'review-marker'});
 }
 // No remote content change: focus restoration must preserve the selection by itself.
 for(const name of ['Slate','Lexical','ProseMirror'])for(const direction of ['forward','backward','caret']){
  const doc=`quiet-${name[0].toLowerCase()}-${direction[0]}-${run}`;await page.goto(`${origin}/?profile=word&doc=${doc}`);await wait();
  await page.evaluate(()=>window.products.clearHistory());const p=page.locator(`#${name} .editor p`).filter({hasText:'Opening text'}).first();await p.scrollIntoViewIfNeeded();await p.click();
  await page.evaluate(name=>window.products.disconnect(name),name);
  await p.evaluate(node=>{const t=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(t,t.length,t,t.length);document.dispatchEvent(new Event('selectionchange'))});await page.keyboard.insertText('U');
  const anchor=direction==='backward'?6:direction==='caret'?4:2,focus=direction==='backward'?2:direction==='caret'?4:6;
  await p.evaluate((node,{anchor,focus})=>{const t=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(t,anchor,t,focus);document.dispatchEvent(new Event('selectionchange'))},{anchor,focus});await page.waitForTimeout(150);
  const before=await page.evaluate(name=>({text:window.getSelection().toString(),range:window.products.range(name),pending:window.products.status().find(peer=>peer.name===name).pending}),name);
  if(before.pending!==1||!before.range||(direction!=='caret'&&!before.text))throw Error('Quiet transition precondition failed');
  const state=await(await page.request.get(`${origin}/profiles/word/api/docs/${doc}/state`)).json(),old=await(await page.request.get(`${origin}/profiles/word/api/docs/${doc}/schema`)).json(),next=structuredClone(old.schema);next.marks.push('quietReview');
  const response=await page.request.post(`${origin}/profiles/word/api/docs/${doc}/schema`,{headers:{'x-doc-sync-protocol':'3','x-doc-sync-epoch':state.epoch,'x-doc-sync-schema':state.schemaVersion},data:{base:{epoch:state.epoch,serverSeq:state.serverSeq,schemaVersion:state.schemaVersion},schema:next}});if(!response.ok())throw Error(await response.text());
  await page.getByRole('button',{name:'Load server schema',exact:true}).click();await page.waitForFunction(()=>window.products.upgradeStatus()==='Schema loaded'||window.products.upgradeStatus().startsWith('Schema transition failed:'),null,{timeout:20000});
  const status=await page.evaluate(()=>window.products.upgradeStatus());if(status!=='Schema loaded')throw Error(status);
  const final=await wait(),after=await page.evaluate(name=>({text:window.getSelection().toString(),range:window.products.range(name)}),name);
  if(text(at(final.server,[1,0]))!=='Opening textU'||after.text!==before.text||JSON.stringify(after.range)!==JSON.stringify(before.range))throw Error(`${name}/${direction}: quiet transition lost selection or input ${JSON.stringify({before,after})}`);
  results.push({profile:'word',editor:name,direction:`quiet-${direction}`,status:'passed',before,after});
 }
 // Synthetic composition checks the guard and recovery path; it is not an OS IME test.
 {
  const doc=`schema-compose-${run}`;await page.goto(`${origin}/?profile=word&doc=${doc}`);await wait();
  const p=page.locator('#Slate .editor p').filter({hasText:'Opening text'}).first();await p.click();
  await p.evaluate(node=>{const t=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(t,t.length,t,t.length);document.dispatchEvent(new Event('selectionchange'))});
  await page.locator('#Slate .editor').dispatchEvent('compositionstart',{data:''});await page.keyboard.insertText('D');await page.waitForTimeout(150);
  const state=await(await page.request.get(`${origin}/profiles/word/api/docs/${doc}/state`)).json(),old=await(await page.request.get(`${origin}/profiles/word/api/docs/${doc}/schema`)).json(),next=structuredClone(old.schema);next.marks.push('compReview');
  const response=await page.request.post(`${origin}/profiles/word/api/docs/${doc}/schema`,{headers:{'x-doc-sync-protocol':'3','x-doc-sync-epoch':state.epoch,'x-doc-sync-schema':state.schemaVersion},data:{base:{epoch:state.epoch,serverSeq:state.serverSeq,schemaVersion:state.schemaVersion},schema:next}});if(!response.ok())throw Error(await response.text());
  await page.getByRole('button',{name:'Load server schema',exact:true}).click();await page.waitForFunction(()=>window.products.upgradeStatus().startsWith('Schema transition failed:'),null,{timeout:10000});
  const rejected=await page.evaluate(()=>({status:window.products.upgradeStatus(),schema:window.products.schema().marks,text:document.querySelector('#Slate .editor').textContent,inert:document.querySelector('#Slate').inert}));
  if(!rejected.status.includes('finish composition')||rejected.schema.includes('compReview')||rejected.inert||!rejected.text.includes('Opening textD'))throw Error('Composition draft changed during rejection');
  await page.locator('#Slate .editor').dispatchEvent('compositionend',{data:'D'});await page.waitForTimeout(150);
  await page.getByRole('button',{name:'Load server schema',exact:true}).click();await page.waitForFunction(()=>window.products.upgradeStatus()==='Schema loaded',null,{timeout:20000});
  const final=await wait();if(text(at(final.server,[1,0]))!=='Opening textD')throw Error('Composition draft was lost');
  results.push({profile:'word',editor:'Slate',direction:'synthetic-composition',status:'passed',rejected:rejected.status,finalText:'Opening textD'});
 }
 return {browserVersion:page.context().browser().version(),results};
}
