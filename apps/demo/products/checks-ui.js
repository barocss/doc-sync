async page=>{
 const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
 const wait=async()=>{await page.waitForFunction(async()=>window.products?.ready()&&!window.products.errors.length&&(await window.products.snapshot()).equal,null,{timeout:20000});return page.evaluate(()=>window.products.snapshot());};
 for(const profile of ['word','notion','presentation']){
  const doc=`ui-${profile[0]}-${run}`;await page.setViewportSize({width:1680,height:1100});await page.goto(`${origin}/?profile=${profile}&doc=${doc}`);await wait();
  await page.screenshot({path:`output/playwright/product-native/${profile}-desktop-final.png`});results.push({profile,case:'desktop native views',status:'passed'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(450);
  const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));if(width.scroll>width.viewport)throw new Error(`Mobile overflow ${profile} ${JSON.stringify(width)}`);
  await page.screenshot({path:`output/playwright/product-native/${profile}-mobile.png`});results.push({profile,case:'mobile width',status:'passed',width});
  await page.evaluate(()=>window.products.edit('Slate',[{op:'insert',at:[0,0],content:'Keep '} ]));const before=await wait();
  const response=await page.request.post(`${origin}/test/seed`,{data:{profile,doc,size:'large'}});if(!response.ok())throw new Error(await response.text());const after=await wait();if(JSON.stringify(before.server)!==JSON.stringify(after.server))throw new Error('Reload seed replaced shared edits');
  results.push({profile,case:'existing document seed preserves edits',status:'passed'});
 }
 for(const [name,data] of [['unknown profile',{profile:'unknown',doc:'valid'}],['invalid document',{profile:'word',doc:'../unsafe'}],['invalid size',{profile:'word',doc:'valid',size:'huge'}]]){
  const response=await page.request.post(`${origin}/test/seed`,{data});if(response.status()!==400)throw new Error(`Guard ${name}: ${response.status()}`);results.push({case:name,status:'passed'});
 }
 return {browserVersion:page.context().browser().version(),results};
}
