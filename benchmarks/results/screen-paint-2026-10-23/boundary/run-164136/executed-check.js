async page => {
    const OUT = "/Users/user/github/doc-sync/output/playwright/screen-next-boundary-20261023/run-164136";
    const ORIGIN = "http://localhost:54480";
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${ORIGIN}/pm?doc=boundary`);
    await page.waitForFunction(() => document.querySelectorAll('#pane-a .blk').length > 85 && document.querySelector('#converged').classList.contains('ok'));
    await page.addStyleTag({content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
    await page.evaluate(async () => {
        const [{Editor}, {SyncClient, HttpTransport}, {DEMO_SCHEMA}] = await Promise.all([
            import('/apps/demo/ui/editor.ts'), import('@barocss/doc-sync/sync'), import('/fixtures/demo-schema.ts')]);
        const original = Editor.prototype.render;
        window.__boundary = {captures: [], checks: []};
        Editor.prototype.render = function(...args) { window.__boundary.editor = this; return original.apply(this, args); };
        const make = actor => {
            const transport = new HttpTransport('boundary', actor);
            const client = new SyncClient(actor, transport, {schema: DEMO_SCHEMA, ackDelay: 50});
            client.connect(); return {client, transport};
        };
        __boundary.c = make('boundary-C'); __boundary.d = make('boundary-D');
        const style = document.createElement('style'); style.id = 'boundary-baseline';
        document.head.append(style); __boundary.style = style;
    });
    await page.waitForFunction(() => __boundary.editor && __boundary.c.client.doc.toJSON().children.length > 80 && __boundary.d.client.doc.toJSON().children.length > 80);
    const frames = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = r => ({x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom});
    const setPresence = async (selector, cHead, cFocus, dHead = null, dFocus = null) => {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await page.evaluate(({selector,cHead,cFocus,dHead,dFocus}) => {
            const block = document.querySelector(selector), b = Number(block.dataset.b), line = block.dataset.line;
            const anchor = (peer, o) => peer.client.doc.anchorOf({...(line ? {line} : {}), b, o});
            for (const [peer, name, color, head, focus] of [[__boundary.c, 'C-LONG-PRESENCE-LABEL-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#e11d48', cHead, cFocus], [__boundary.d, 'D-LONG-PRESENCE-LABEL-ABCDEFGHIJKLMNOPQRSTUVWXYZ-9876543210', '#0d9488', dHead, dFocus]]) {
                peer.client.setPresence({name,color,anchor:head === null ? null : anchor(peer,head),focus:focus === null ? null : anchor(peer,focus)});
            }
        }, {selector,cHead,cFocus,dHead,dFocus});
        await page.waitForFunction(() => document.querySelectorAll('#pane-a .caret.remote[data-actor="boundary-C"]').length === 1);
        await page.waitForTimeout(160);
        await frames();
    };
    const geometry = async selector => page.evaluate(selector => {
        const rect = r => ({x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom});
        const block = document.querySelector(selector), cell = block.closest('td');
        const carets = [...block.querySelectorAll('.caret.remote')].map(node => {
            const box = node.getBoundingClientRect(), after = getComputedStyle(node,'::after');
            const left = box.left + parseFloat(after.left), top = box.top + parseFloat(after.top);
            const width = parseFloat(after.width) + parseFloat(after.paddingLeft) + parseFloat(after.paddingRight);
            const height = parseFloat(after.height) + parseFloat(after.paddingTop) + parseFloat(after.paddingBottom);
            return {actor:node.dataset.actor, name:node.dataset.name, color:getComputedStyle(node).getPropertyValue('--who').trim(), caret:rect(box), label:{left,top,right:left+width,bottom:top+height,width,height}};
        });
        const ranges = [...block.querySelectorAll('.remote-selection')].map(n => ({actor:n.dataset.actor, rect:rect(n.getBoundingClientRect())}));
        const composing=[...document.querySelectorAll('#pane-a .composing')].map(n=>({text:n.textContent,rect:rect(n.getBoundingClientRect())}));
        const allRemote=[...document.querySelectorAll('#pane-a .caret.remote')].map(n=>({actor:n.dataset.actor,name:n.dataset.name,block:n.closest('.blk').dataset.b,caret:rect(n.getBoundingClientRect()),labelStyle:{content:getComputedStyle(n,'::after').content,width:getComputedStyle(n,'::after').width,height:getComputedStyle(n,'::after').height,left:getComputedStyle(n,'::after').left,top:getComputedStyle(n,'::after').top}}));
        const next=block.nextElementSibling;const nextState=next?{className:next.className,rect:rect(next.getBoundingClientRect()),descendants:[...next.querySelectorAll('img,hr,[data-placeholder],.blk')].map(n=>({className:n.className,placeholder:n.dataset.placeholder??null,rect:rect(n.getBoundingClientRect()),isolation:getComputedStyle(n).isolation})),topSamples:[...Array(12)].map((_,i)=>{const r=next.getBoundingClientRect(),x=r.left+i,y=Math.floor(r.top);return{x,y,elements:document.elementsFromPoint(x,y).slice(0,5).map(n=>({tag:n.tagName,className:n.className,background:getComputedStyle(n).backgroundColor,borderLeft:getComputedStyle(n).borderLeftColor,borderRadius:getComputedStyle(n).borderRadius}))}})}:null;
        return {nextState,composing,allRemote,block:rect(block.getBoundingClientRect()),cell:cell?rect(cell.getBoundingClientRect()):null,table:cell?rect(cell.closest('table').getBoundingClientRect()):null,carets,ranges,scrollX,scrollY,devicePixelRatio, isolation:getComputedStyle(block).isolation};
    }, selector);
    const pair = async (name, selector, expectedCandidateIsolation='isolate') => {
        if(name.startsWith('boundary-')){await page.evaluate(selector=>document.querySelector(selector).scrollIntoView({block:'center'}),selector);await page.waitForTimeout(500);await frames();}
        const viewport = page.viewportSize();
        const records = [];
        for (const [captureIndex,baseline] of [true,false,true].entries()) {
            await page.evaluate(baseline => { __boundary.style.textContent = baseline ? '.surface .blk{isolation:auto!important}' : ''; }, baseline);
            await frames(); const g = await geometry(selector);
            const block = g.block;
            const x = Math.max(0,Math.floor(block.left-15)), y = Math.max(0,Math.floor(block.top-45));
            const right = Math.min(viewport.width,Math.ceil(Math.max(g.table?.right??block.right,...g.carets.map(c=>c.label.right))+15));
            const boundaryTarget=name.startsWith('boundary-')?await page.evaluate(selector=>document.querySelector(selector).nextElementSibling.getBoundingClientRect().bottom,selector):null;
            const bottom = Math.min(viewport.height,Math.ceil(Math.min(Math.max(block.bottom,boundaryTarget??0),block.top+240)+25));
            const clip = {x,y,width:right-x,height:bottom-y};
            const mode = captureIndex===2?'baseline-repeat':baseline?'baseline':'candidate';
            await page.screenshot({path:`${OUT}/${name}-${mode}.png`,clip,animations:'disabled'});
            records.push({mode,geometry:g,clip,image:`${name}-${mode}.png`});
        }
        const [a,b]=records;
        if(a.geometry.isolation!=='auto'||b.geometry.isolation!==expectedCandidateIsolation)throw Error(`${name}: candidate/baseline style toggle was not applied`);
        for (const key of ['left','top','width','height']) if (Math.abs(a.geometry.block[key]-b.geometry.block[key])>.05) throw Error(`${name}: block geometry changed ${key}`);
        if (a.geometry.carets.length!==b.geometry.carets.length) throw Error(`${name}: caret count changed`);
        for(let i=0;i<a.geometry.carets.length;i++) for(const key of ['left','top','width','height']) if(Math.abs(a.geometry.carets[i].label[key]-b.geometry.carets[i].label[key])>.05) throw Error(`${name}: label geometry changed ${key}`);
        const result={name,selector,records};
        await page.evaluate(result=>__boundary.captures.push(result),result);
        await page.evaluate(()=>{__boundary.style.textContent=''});await frames();
        return result;
    };
    const source=await page.evaluate(()=>{const n=[...document.querySelectorAll('#pane-a .surface > .blk')].find(n=>n.textContent.startsWith('BOUNDARY LIST'));if(!n)throw Error('Marker fixture source missing');return '#pane-a .surface > .blk[data-b="'+n.dataset.b+'"]'});
    await setPresence(source,1,null);
    const capture=await pair('boundary-marker-direct',source);
    const marker=await page.evaluate(selector=>{const n=document.querySelector(selector).nextElementSibling,r=n.getBoundingClientRect(),before=getComputedStyle(n,'::before');const left=r.left+parseFloat(before.left),width=parseFloat(before.width);return{content:before.content,color:before.color,rect:{left,top:r.top,right:left+width,bottom:r.bottom,width,height:r.height},targetClass:n.className}},source);
    await page.evaluate(()=>{__boundary.c.client.setPresence({name:'C',color:'#e11d48',anchor:null,focus:null});__boundary.d.client.setPresence({name:'D',color:'#0d9488',anchor:null,focus:null})});
    await page.waitForFunction(()=>document.querySelectorAll('#pane-a .caret.remote[data-actor="boundary-C"]').length===0);
    await page.waitForTimeout(500);await frames();
    await page.screenshot({path:`${OUT}/marker-without-presence.png`,clip:capture.records[0].clip,animations:'disabled'});
    const final=await page.evaluate(()=>({modelsEqual:[__boundary.editor.client,__boundary.c.client,__boundary.d.client].every(c=>JSON.stringify(c.doc.toJSON())===JSON.stringify(__boundary.editor.client.doc.toJSON())),pending:[__boundary.editor.client,__boundary.c.client,__boundary.d.client].map(c=>c.pending.length)}));
    if(!final.modelsEqual||final.pending.some(Boolean))throw Error('Marker clients did not converge');
    await page.evaluate(()=>{for(const peer of [__boundary.c,__boundary.d]){peer.transport.leave();peer.client.disconnect();}});
    return{captures:[capture],checks:[{name:'direct bullet-label overlap',marker,referenceImage:'marker-without-presence.png'}],final,limits:['One controlled bullet overlap scene only; screenshot and pixel verdict remain required']};
}
