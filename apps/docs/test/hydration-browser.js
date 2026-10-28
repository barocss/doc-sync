async page=>{
 const origin=new URL('/doc-sync/',page.url()).href,results=[],errors=[];page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push({url:page.url(),type:m.type(),message:m.text()})});
 for(const slug of ['slate','lexical','prosemirror']){
  let release;const gate=new Promise(resolve=>release=resolve);let intercepted;const reached=new Promise(resolve=>intercepted=resolve);
  const route=async r=>{if(r.request().url().includes(`guide_${slug}.md`)&&r.request().url().includes('.lean.js')){intercepted(r.request().url());await gate;}try{await r.continue()}catch{} };
  await page.route('**/*.lean.js',route);await page.goto(`${origin}guide/${slug}.html`,{waitUntil:'domcontentloaded'});let timer=setTimeout(()=>intercepted(null),5000);let url=await reached;clearTimeout(timer);if(!url){release();throw Error('Initial lean module not intercepted for '+slug)};
  await page.locator('main').locator(`a[href*="schema-transition.html#${slug}"]`).first().click({noWaitAfter:true});await page.waitForTimeout(250);release();await page.waitForTimeout(300);await page.unroute('**/*.lean.js',route);
  try{await page.locator(`#${slug}`).waitFor({timeout:6000});results.push({slug,status:'passed',url:page.url()});}catch(e){results.push({slug,status:'failed',url:page.url(),title:await page.title(),h1:await page.locator('main h1').first().textContent().catch(()=>null)});}
 }
 await page.goto(`${origin}guide/slate.html`);await page.waitForFunction(()=>document.documentElement.dataset.docSyncHydrated==='true');
 await page.evaluate(()=>window.__docsNavigationCheck='preserved');
 await page.locator('main').locator('a[href*="schema-transition.html#slate"]').first().click();await page.locator('#slate').waitFor();
 const clientNavigation=await page.evaluate(()=>window.__docsNavigationCheck==='preserved');
 if(!clientNavigation||results.some(r=>r.status!=='passed')||errors.length)throw Error(JSON.stringify({results,errors,clientNavigation}));
 return {results,errors,clientNavigation};
}
