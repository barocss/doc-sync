async page=>{
 const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
 const wait=async()=>{await page.waitForFunction(async()=>window.products?.ready()&&!window.products.errors.length&&(await window.products.snapshot()).equal,null,{timeout:60000});};
 for(const profile of ['word','notion','presentation']){
  const doc=`retain-${profile}-${run}`;
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(`${origin}/?profile=${profile}&size=large&doc=${doc}`);await wait();
  await page.evaluate(()=>{window.retainedParagraphs={};});
  for(const name of ['Slate','Lexical','ProseMirror']) await page.getByRole('textbox',{name,exact:true}).evaluate((root,name)=>{
   const node=[...root.querySelectorAll('p')].find(node=>node.textContent.startsWith('Block 600. '));
   if(!node)throw new Error(`Missing unchanged paragraph: ${name}`);
   window.retainedParagraphs[name]=node;
  },name);
  const target=await page.evaluate(()=>window.products.target);
  const response=await page.request.post(`${origin}/test/remote`,{data:{profile,doc,edits:[{op:'insert',at:[...target.path,0],content:'retained-'}]}});
  if(!response.ok())throw new Error(await response.text());
  await wait();
  for(const name of ['Slate','Lexical','ProseMirror']){
   if(await page.getByRole('textbox',{name,exact:true}).locator('p').filter({hasText:`retained-${target.text}`}).count()!==1)throw new Error(`${name}: remote text did not appear`);
   const retained=await page.getByRole('textbox',{name,exact:true}).evaluate((root,name)=>{
    const old=window.retainedParagraphs[name];
    const current=[...root.querySelectorAll('p')].find(node=>node.textContent.startsWith('Block 600. '));
    return old===current&&old.isConnected;
   },name);
   if(!retained)throw new Error(`${profile}/${name}: unchanged DOM paragraph was rebuilt`);
   results.push({profile,editor:name,case:'100k remote input retains unchanged native DOM paragraph',status:'passed'});
  }
 }
 return {browserVersion:page.context().browser().version(),results};
}
