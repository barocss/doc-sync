async page=>{
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  let expectedSeq=0;
  const p=text=>({type:'paragraph',runs:[{text,marks:{}}]});
  const cell=text=>({type:'table-cell',children:[{type:'table-cell-body',children:[p(text)]}]});
  const remote=async(doc,edits)=>{const r=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!r.ok())throw new Error(await r.text());const receipt=await r.json();if(!Number.isSafeInteger(receipt.serverSeq))throw new Error('Remote edit did not return a server revision');expectedSeq=Math.max(expectedSeq,receipt.serverSeq);};
  const wait=async()=>{await page.waitForFunction(expectedSeq=>{const s=window.compat?.snapshot();return s?.server&&s.server.seq>=expectedSeq&&!s.failures.length&&s.peers.every(p=>p.seq>=expectedSeq&&p.online&&!p.pending&&!p.fallbacks&&JSON.stringify(p.model)===JSON.stringify(s.server.model)&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model));},expectedSeq,{timeout:15000});return page.evaluate(()=>window.compat.snapshot());};
  const text=cell=>cell.children[0].children.flatMap(p=>(p.runs??[]).map(r=>r.text??'')).join('');
  const note=async(name,edited,merged)=>{
    const snapshot=await wait(),table=snapshot.server.model.children[1];
    if(text(table.children[1].children[2])!==(edited?'cZ12':'cell12'))throw new Error(`${name}: edited wrong logical cell`);
    if(text(table.children[1].children[1])!=='Xcell11'||Boolean(table.children[1].children[1].attrs?.spanned)!==merged)throw new Error(`${name}: lost hidden content/visibility`);
    results.push({name,status:'passed',snapshot});
  };
  for(const [actor,short]of[['slate-a','s'],['lexical-a','l'],['pm-a','p']])for(const reverse of[false,true]){
    const doc=`merge-range-${short}-${reverse?'b':'f'}-${run}`;
    expectedSeq=0;
    await page.goto(`${origin}/?doc=${doc}`);await wait();
    await remote(doc,[{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:[p('before'),{type:'table',children:Array.from({length:3},(_,r)=>({type:'table-row',children:Array.from({length:3},(_,c)=>cell(`cell${r}${c}`))}))},p('after')]},{op:'update',at:[1,0,0],attrs:{colspan:2,rowspan:2}}]);await wait();
    const paragraph=page.getByRole('textbox',{name:actor,exact:true}).locator('p').filter({hasText:/^cell12$/});
    await paragraph.click();await paragraph.evaluate((node,reverse)=>{const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(text,reverse?4:1,text,reverse?1:4);document.dispatchEvent(new Event('selectionchange'));},reverse);
    await page.waitForTimeout(100);
    await remote(doc,[{op:'insert',at:[1,1,1,0,0,0],content:'X'}]);await wait();
    const selection=await page.evaluate(()=>{const s=window.getSelection();return {anchor:s.anchorNode.textContent,focus:s.focusNode.textContent,anchorOffset:s.anchorOffset,focusOffset:s.focusOffset,active:document.activeElement.getAttribute('aria-label')};});
    if(selection.anchor!=='cell12'||selection.focus!=='cell12'||selection.anchorOffset!==(reverse?4:1)||selection.focusOffset!==(reverse?1:4)||selection.active!==actor)throw new Error(`range restored to wrong native cell: ${JSON.stringify(selection)}`);
    await note(`${actor} ${reverse?'backward':'forward'}: range survives hidden foreign edit`,false,true);
    results.at(-1).selection=selection;
    await page.keyboard.type('Z');await note(`${actor} ${reverse?'backward':'forward'}: native range replacement uses logical column 2`,true,true);
    await page.locator(`#${actor}`).getByRole('button',{name:'되돌리기',exact:true}).click();await note(`${actor} ${reverse?'backward':'forward'}: undo keeps hidden foreign edit`,false,true);
    await page.locator(`#${actor}`).getByRole('button',{name:'다시하기',exact:true}).click();await note(`${actor} ${reverse?'backward':'forward'}: redo keeps hidden foreign edit`,true,true);
    await remote(doc,[{op:'update',at:[1,0,0],attrs:{colspan:1,rowspan:1}}]);await note(`${actor} ${reverse?'backward':'forward'}: unmerge keeps both edited cells`,true,false);
  }
  return {browserVersion:page.context().browser().version(),results};
}
