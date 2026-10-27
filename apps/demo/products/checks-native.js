async page=>{
 const origin=new URL(page.url()).origin,run=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,results=[];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const at=(root,path)=>path.reduce((node,index)=>node.children[index],root);
 const text=node=>(node.runs??[]).map(run=>'text'in run?run.text:text({runs:run.runs})).join('');
 const wait=async()=>{
  await page.waitForFunction(()=>window.products?.ready()&&!window.products.errors.length&&window.products.status().every(peer=>peer.online&&!peer.pending),null,{timeout:20000});
  await page.waitForFunction(async()=>{const s=await window.products.snapshot();return s.equal;},null,{timeout:20000});
  return page.evaluate(()=>window.products.snapshot());
 };
 const note=async(name,details={})=>{results.push({name,status:'passed',profile:await page.evaluate(()=>window.products.profile),...details});};
 const select=async(name,expected,anchor,focus=anchor)=>{
  const paragraph=page.getByRole('textbox',{name,exact:true}).locator('p').filter({hasText:expected}).first();await paragraph.scrollIntoViewIfNeeded();await paragraph.click();
  await paragraph.evaluate((node,{anchor,focus})=>{
   const point=offset=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let part;while(part=walker.nextNode()){if(offset<=part.textContent.length)return [part,offset];offset-=part.textContent.length;}throw new Error('Selection offset exceeds text');};
   const a=point(anchor),f=point(focus);window.getSelection().setBaseAndExtent(...a,...f);document.dispatchEvent(new Event('selectionchange'));
  },{anchor,focus});await page.waitForTimeout(120);
 };
 const remote=async(profile,doc,edits)=>{const response=await page.request.post(`${origin}/test/remote`,{data:{profile,doc,edits}});if(!response.ok())throw new Error(await response.text());};
 for(const profile of ['word','notion','presentation']){
  for(const name of ['Slate','Lexical','ProseMirror']){
   const doc=`n-${profile.slice(0,1)}-${name.slice(0,1).toLowerCase()}-${run}`;
   await page.goto(`${origin}/?profile=${profile}&doc=${doc}`);let state=await wait();
   const target=await page.evaluate(()=>window.products.target),path=target.path,base=target.text;
   if(text(at(state.server,path))!==base)throw new Error('Unexpected target path');
   await note(`${name}: complete rich model loads into three native editors`,{doc});
   await page.evaluate(()=>window.products.clearHistory());
   await select(name,base,base.length);await page.keyboard.insertText(' A😀한');let expected=base+' A😀한';state=await wait();
   if(text(at(state.server,path))!==expected)throw new Error(`${name}: native Unicode insertion mismatch`);
   await note(`${name}: native Unicode input in nested container`);
   await page.locator(`#${name}`).getByRole('button',{name:'Undo',exact:true}).click();state=await wait();if(text(at(state.server,path))!==base)throw new Error('Input undo mismatch');
   await page.locator(`#${name}`).getByRole('button',{name:'Redo',exact:true}).click();state=await wait();if(text(at(state.server,path))!==expected)throw new Error('Input redo mismatch');
   await note(`${name}: native input undo and redo`);
   await select(name,expected,expected.length);await page.keyboard.press('Backspace');expected=expected.slice(0,-1);state=await wait();if(text(at(state.server,path))!==expected)throw new Error('Korean deletion mismatch');
   await page.keyboard.press('Backspace');expected=expected.slice(0,-2);state=await wait();if(text(at(state.server,path))!==expected)throw new Error('Surrogate deletion mismatch');
   await note(`${name}: native Backspace removes Korean and one whole emoji`);
   for(const backward of [false,true]){
    const anchor=backward?6:2,focus=backward?2:6,selected=expected.slice(2,6);
    await select(name,expected,anchor,focus);
    await remote(profile,doc,[{op:'insert',at:[...path,0],content:'R'}]);expected='R'+expected;state=await wait();
    const range=await page.evaluate(name=>window.products.range(name),name);
    if(!same(range,{anchor:[...path,anchor+1],focus:[...path,focus+1]}))throw new Error(`${name}: shifted ${backward?'backward':'forward'} range ${JSON.stringify(range)}`);
    if(await page.evaluate(()=>window.getSelection().toString())!==selected)throw new Error('Selected content changed after remote input');
    await note(`${name}: ${backward?'backward':'forward'} selection follows remote insertion`,{range});
   }
   await select(name,expected,2,6);await page.locator(`#${name}`).getByRole('button',{name:'Bold',exact:true}).click();state=await wait();
   if(!at(state.server,path).runs.some(run=>run.marks?.bold))throw new Error('Native formatting did not apply');
   await page.locator(`#${name}`).getByRole('button',{name:'Undo',exact:true}).click();state=await wait();
   if(at(state.server,path).runs.some(run=>run.marks?.bold)||text(at(state.server,path))!==expected)throw new Error('Formatting undo changed foreign text');
   await page.locator(`#${name}`).getByRole('button',{name:'Redo',exact:true}).click();state=await wait();
   if(!at(state.server,path).runs.some(run=>run.marks?.bold)||text(at(state.server,path))!==expected)throw new Error('Formatting redo mismatch');
   await note(`${name}: formatting undo/redo preserves foreign input`);
   await page.evaluate(()=>window.products.clearHistory());
   await select(name,expected,expected.length);await page.keyboard.insertText('Z');await wait();
   await remote(profile,doc,[{op:'insert',at:[...path,0],content:'F'}]);expected='F'+expected;await wait();
   await page.locator(`#${name}`).getByRole('button',{name:'Undo',exact:true}).click();state=await wait();if(text(at(state.server,path))!==expected)throw new Error('Participant undo lost foreign input');
   await page.locator(`#${name}`).getByRole('button',{name:'Redo',exact:true}).click();state=await wait();expected+='Z';if(text(at(state.server,path))!==expected)throw new Error('Participant redo lost foreign input');
   await note(`${name}: participant input undo/redo preserves a later foreign edit`);
   const before=structuredClone(state.server),index=path.at(-1),parent=path.slice(0,-1);
   await select(name,expected,3);await page.keyboard.press('Enter');state=await wait();
   const siblings=at(state.server,parent).children;
   if(text(siblings[index])!==expected.slice(0,3)||text(siblings[index+1])!==expected.slice(3))throw new Error('Nested Enter did not split text in place');
   await page.keyboard.press('Backspace');state=await wait();if(!same(state.server,before))throw new Error('Nested join did not restore complete rich model');
   await note(`${name}: native nested Enter and Backspace preserve all other structure`);
   if(state.peers.some(peer=>peer.fallbacks))throw new Error('Unexpected event fallback');
   await note(`${name}: final native/client/server equality and zero event fallbacks`,{finalModel:state.server});
  }
  await page.setViewportSize({width:1680,height:1100});await page.screenshot({path:`output/playwright/product-native/${run}/${profile}-desktop.png`,fullPage:false});
 }
 return {browserVersion:page.context().browser().version(),run,results};
}
