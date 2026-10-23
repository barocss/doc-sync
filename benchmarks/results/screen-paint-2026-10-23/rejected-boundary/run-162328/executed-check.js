async page => {
    const OUT = "/Users/user/github/doc-sync/output/playwright/screen-next-boundary-20261023/run-162328";
    const ORIGIN = "http://localhost:53004";
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
        return {composing,allRemote,block:rect(block.getBoundingClientRect()),cell:cell?rect(cell.getBoundingClientRect()):null,table:cell?rect(cell.closest('table').getBoundingClientRect()):null,carets,ranges,scrollX,scrollY,devicePixelRatio, isolation:getComputedStyle(block).isolation};
    }, selector);
    const pair = async (name, selector, expectedCandidateIsolation='isolate') => {
        const viewport = page.viewportSize();
        const records = [];
        for (const baseline of [true,false]) {
            await page.evaluate(baseline => { __boundary.style.textContent = baseline ? '.surface .blk{isolation:auto!important}' : ''; }, baseline);
            await frames(); const g = await geometry(selector);
            const block = g.block;
            const x = Math.max(0,Math.floor(block.left-15)), y = Math.max(0,Math.floor(block.top-45));
            const right = Math.min(viewport.width,Math.ceil(Math.max(g.table?.right??block.right,...g.carets.map(c=>c.label.right))+15));
            const bottom = Math.min(viewport.height,Math.ceil(Math.min(block.bottom,block.top+180)+25));
            const clip = {x,y,width:right-x,height:bottom-y};
            const mode = baseline?'baseline':'candidate';
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
        return result;
    };
    const captures = [];
    await setPresence('#pane-a .surface > .blk[data-b="1"]',0,null);
    captures.push(await pair('paragraph-long-label','#pane-a .surface > .blk[data-b="1"]'));
    await page.locator('#pane-a table tr:first-child td:first-child .blk').scrollIntoViewIfNeeded();
    const cellHead = await page.evaluate(() => {
        const block = document.querySelector('#pane-a table tr:first-child td:first-child .blk');
        const chars = [...block.querySelectorAll('.ch')];
        const firstTop = chars[0].getBoundingClientRect().top;
        const nextLine = chars.find(n => n.getBoundingClientRect().top > firstTop + 3)?.getBoundingClientRect().top;
        if (nextLine === undefined) throw Error('Table fixture did not wrap');
        const second = chars.filter(n => Math.abs(n.getBoundingClientRect().top - nextLine) < 2);
        return Number(second.at(-2).dataset.o) + 1;
    });
    await setPresence('#pane-a table tr:first-child td:first-child .blk',cellHead,3);
    captures.push(await pair('cell-long-label','#pane-a table tr:first-child td:first-child .blk'));
    await setPresence('#pane-a .surface > .blk[data-b="1"]',18,3,7,22);
    captures.push(await pair('overlapping-forward-reverse','#pane-a .surface > .blk[data-b="1"]'));
    const overlap = await page.evaluate(() => {
        const block = document.querySelector('#pane-a .surface > .blk[data-b="1"]');
        const selected = actor => [...block.querySelectorAll('.ch')].filter(n=>n.querySelector(`.remote-selection[data-actor="${actor}"]`)).map(n=>Number(n.dataset.o));
        return {c:selected('boundary-C'),d:selected('boundary-D'),overlap:[...block.querySelectorAll('.ch')].filter(n=>n.querySelectorAll('.remote-selection').length===2).map(n=>Number(n.dataset.o))};
    });
    if(JSON.stringify(overlap.c)!==JSON.stringify(Array.from({length:15},(_,i)=>i+3)) || JSON.stringify(overlap.d)!==JSON.stringify(Array.from({length:15},(_,i)=>i+7)) || overlap.overlap.length!==11) throw Error('Forward/reverse overlap differs: '+JSON.stringify(overlap));
    const checks=[{name:'forward/reverse ranges and two-user overlap',...overlap}];
    await page.evaluate(checks=>__boundary.checks=checks,checks);
    // Fixture-only stronger overflow stress. Actual product label styles above are preserved separately.
    const nowrap = await page.addStyleTag({content:'.caret.remote::after{white-space:nowrap!important;width:max-content!important}'});
    await setPresence('#pane-a table tr:first-child td:first-child .blk',cellHead,3);
    captures.push(await pair('cell-nowrap-stress','#pane-a table tr:first-child td:first-child .blk'));
    await setPresence('#pane-a .surface > .blk[data-b="1"]',18,3,18,7);
    captures.push(await pair('overlapping-caret-nowrap-stress','#pane-a .surface > .blk[data-b="1"]'));
    await nowrap.evaluate(node=>node.remove());
    // Exercise hit testing and real input after scrolling. Then undo, preserving all content.
    const findMain = async prefix => page.evaluate(prefix=>{
        const block=[...document.querySelectorAll('#pane-a .surface > .blk')].find(n=>n.textContent.startsWith(prefix));
        if(!block)throw Error('Fixture block missing: '+prefix);
        return '#pane-a .surface > .blk[data-b="'+block.dataset.b+'"]';
    },prefix);
    const locators=[['offscreen',await findMain('offscreen-60-')],['heading','#pane-a .blk.heading1'],['quote','#pane-a .blk.quote'],['list','#pane-a .blk.bullet'],['table','#pane-a table td:first-child .blk'],['callout','#pane-a .box.callout .blk'],['wrapped',await findMain('Wrapped paragraph')]];
    for(const [name,selector] of locators){
        const block=page.locator(selector).first(),char=block.locator('.ch[data-o="4"]');
        await char.scrollIntoViewIfNeeded();
        const before=await block.textContent();
        await char.click({position:{x:.1,y:5}});
        const selected=await page.evaluate(()=>({b:__boundary.editor.pos.b,o:__boundary.editor.pos.o,line:__boundary.editor.pos.line??null}));
        if(selected.o!==4) throw Error(`${name}: hit test offset ${selected.o}`);
        await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');
        const selection=await page.evaluate(()=>({focus:__boundary.editor.focus, pos:__boundary.editor.pos, chars:document.querySelectorAll('#pane-a .ch.sel').length}));
        if(selection.chars!==2)throw Error(`${name}: selection length ${selection.chars}`);
        await page.keyboard.press('ArrowRight');await page.keyboard.press('z');
        await page.waitForFunction(()=>document.querySelector('#converged').classList.contains('ok'));
        if((await block.textContent())===before)throw Error(`${name}: typed input missing`);
        await page.keyboard.press('Meta+z');
        await page.waitForFunction(({selector,before})=>document.querySelector(selector)?.textContent===before,{selector,before});
        await page.waitForFunction(()=>[__boundary.editor.client,__boundary.c.client,__boundary.d.client].every(c=>c.pending.length===0 && JSON.stringify(c.doc.toJSON())===JSON.stringify(__boundary.editor.client.doc.toJSON())));
        checks.push({name:`${name} scroll/hit-test/range/input/undo`,selected,selection});
        await page.evaluate(checks=>__boundary.checks=checks,checks);
    }
    // Composition event preview is an explicit synthetic fixture, not native OS IME evidence.
    await page.locator('#pane-a .blk.heading1 .ch[data-o="3"]').click({position:{x:.1,y:5}});
    await page.evaluate(()=>{const input=__boundary.editor.input;input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.dispatchEvent(new CompositionEvent('compositionupdate',{data:'조합미리보기',bubbles:true}));});
    await page.waitForFunction(()=>document.querySelector('#pane-a .composing')?.textContent==='조합미리보기');
    captures.push(await pair('ime-preview','#pane-a .blk.heading1','auto'));
    const imeCycle=[];
    for(const [index,baseline] of [false,true,false].entries()){
        await page.evaluate(baseline=>{__boundary.style.textContent=baseline?'.surface .blk{isolation:auto!important}':''},baseline);
        await frames();await page.waitForTimeout(120);await frames();
        const g=await geometry('#pane-a .blk.heading1');
        const prior=captures.at(-1).records[0];const mode=baseline?'baseline':'candidate';
        const image=`ime-cycle-${index}-${mode}.png`;
        await page.screenshot({path:`${OUT}/${image}`,clip:prior.clip,animations:'disabled'});
        imeCycle.push({index,mode,geometry:g,clip:prior.clip,image});
    }
    await page.evaluate(imeCycle=>__boundary.imeCycle=imeCycle,imeCycle);
    await page.evaluate(()=>__boundary.editor.input.dispatchEvent(new CompositionEvent('compositionend',{data:'',bubbles:true})));
    await page.waitForFunction(()=>!document.querySelector('#pane-a .composing'));
    const imeAfter=await page.evaluate(()=>getComputedStyle(document.querySelector('#pane-a .blk.heading1')).isolation);
    if(imeAfter!=='isolate')throw Error('IME end did not restore isolation');
    // Repeat start/update/end and verify that the exception follows real preview existence.
    const imeTransitions=[{step:'end',isolation:imeAfter}];
    for(const data of ['가','가나다']){
      await page.evaluate(data=>{const input=__boundary.editor.input;input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.dispatchEvent(new CompositionEvent('compositionupdate',{data,bubbles:true}));},data);
      await page.waitForFunction(data=>document.querySelector('#pane-a .composing')?.textContent===data,data);
      const state=await page.evaluate(()=>({text:document.querySelector('#pane-a .composing').textContent,isolation:getComputedStyle(document.querySelector('#pane-a .blk.heading1')).isolation}));
      if(state.isolation!=='auto')throw Error('IME preview did not disable isolation');imeTransitions.push({step:'preview',...state});
    }
    await page.evaluate(()=>__boundary.editor.input.dispatchEvent(new CompositionEvent('compositionend',{data:'',bubbles:true})));
    await page.waitForFunction(()=>!document.querySelector('#pane-a .composing'));
    if(await page.evaluate(()=>getComputedStyle(document.querySelector('#pane-a .blk.heading1')).isolation)!=='isolate')throw Error('Repeated IME end did not restore isolation');
    checks.push({name:'IME auto/isolate preview transition',states:imeTransitions});
    for(const [name,prefix] of [['image-placeholder','BOUNDARY IMAGE'],['divider','BOUNDARY DIVIDER'],['callout-plain','BOUNDARY CALLOUT'],['empty-paragraph','BOUNDARY EMPTY'],['list-marker','BOUNDARY LIST']]){
      const source=await findMain(prefix);await setPresence(source,3,null);
      const target=await page.evaluate(selector=>{const n=document.querySelector(selector).nextElementSibling;return{type:n.className,rect:{top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom},placeholder:n.querySelector('[data-placeholder]')?.dataset.placeholder??null}},source);
      const pairResult=await pair('boundary-'+name,source);pairResult.target=target;
      captures.push(pairResult);await page.evaluate(captures=>__boundary.captures=captures,captures);
    }
    checks.push({name:'synthetic IME preview shown and cancelled; not native OS IME'});
    const final=await page.evaluate(async()=>{
        const server=await(await fetch('/api/docs/boundary/state')).json();
        const clients=[__boundary.editor.client,__boundary.c.client,__boundary.d.client];
        const models=clients.map(c=>c.doc.toJSON());
        const same=models.every(m=>JSON.stringify(m)===JSON.stringify(server.model));
        return {modelsEqual:same,pending:clients.map(c=>c.pending.length),serverSeq:server.serverSeq,images:document.querySelectorAll('#pane-a .inline-img').length};
    });
    if(!final.modelsEqual||final.pending.some(Boolean)||final.images!==2)throw Error('Final convergence/image differs '+JSON.stringify(final));
    await page.evaluate(()=>{for(const peer of [__boundary.c,__boundary.d]){peer.transport.leave();peer.client.disconnect();}});
    return {captures,checks,final,imeCycle,limits:['Synthetic IME preview only; no native OS keyboard claim','Screenshot pixels are compared separately; DOM presence alone is not a visibility pass']};
}
