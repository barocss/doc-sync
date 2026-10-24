async page=>{
 const config=CONFIG,origin=new URL(page.url()).origin;
 await page.setViewportSize({width:1680,height:1100});
 const wait=async()=>{await page.waitForFunction(()=>window.products?.ready()&&!window.products.errors.length&&window.products.status().every(peer=>peer.online&&!peer.pending),null,{timeout:60000});};
 if(config.setup){await page.goto(`${origin}/?profile=${config.profile}&size=${config.size}&doc=${config.doc}`);await wait();}
 await wait();
 const before=await page.evaluate(()=>window.products.snapshot());if(!before.equal)throw new Error('Initial native/client/server mismatch');
 const target=await page.evaluate(()=>window.products.target);
 const paragraph=name=>page.getByRole('textbox',{name,exact:true}).locator('p').filter({hasText:target.text}).first();
 for(const name of ['Slate','Lexical','ProseMirror'])await (await paragraph(name)).evaluate(node=>node.scrollIntoView({block:'center'}));
 const visibility={};
 for(const name of ['Slate','Lexical','ProseMirror']){
  visibility[name]=await (await paragraph(name)).evaluate(node=>{const a=node.getBoundingClientRect(),b=node.closest('[role="textbox"]').getBoundingClientRect();return {visible:a.top>=Math.max(0,b.top)&&a.bottom<=Math.min(innerHeight,b.bottom),top:a.top,bottom:a.bottom,editorTop:b.top,editorBottom:b.bottom};});
  if(!visibility[name].visible)throw new Error(`Target not visible: ${name} ${JSON.stringify(visibility[name])}`);
 }
 const selected=paragraph(config.source);await selected.click();
 await selected.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));});await page.waitForTimeout(120);
 await page.evaluate(()=>{window.products.clearHistory();window.products.clearMeasurements();});
 for(let index=0;index<config.warmups+config.samples;index++){
  const expected=await selected.textContent()+'q';
  await page.evaluate(({source,expected})=>window.products.arm(source,expected),{source:config.source,expected});
  await page.keyboard.type('q');
  await page.waitForFunction(()=>window.products.measurement()?.complete||window.products.measurement()?.error||window.products.errors.length,null,{timeout:30000});
  const row=await page.evaluate(()=>window.products.measurement());
  if(row.error||!row.complete||!row.input?.trusted||Object.keys(row.receive).length!==3)throw new Error(`Incomplete measurement ${JSON.stringify(row)}`);
  await wait();
 }
 const after=await page.evaluate(()=>window.products.snapshot());if(!after.equal)throw new Error('Final native/client/server mismatch');
 if(after.peers.some(peer=>peer.fallbacks))throw new Error('Unexpected event fallback');
 const records=await page.evaluate(()=>window.products.records()),longTasks=await page.evaluate(()=>window.products.longTasks?.()??[]);
 const source=after.peers.find(peer=>peer.name===config.source),range=await page.evaluate(name=>window.products.range(name),config.source);
 return {browserVersion:page.context().browser().version(),config,visibility,verified:{beforeEqual:before.equal,afterEqual:after.equal,zeroFallbacks:true,range},beforeModel:config.setup?before.server:undefined,records,longTasks,peerStatus:after.peers.map(({name,seq,pending})=>({name,seq,pending}))};
}
