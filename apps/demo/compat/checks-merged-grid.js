async page => {
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  const p=text=>({type:'paragraph',runs:[{text,marks:{}}]});
  const cell=text=>({type:'table-cell',children:[{type:'table-cell-body',children:[p(text)]}]});
  const wait=async()=>{
    await page.waitForFunction(()=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(peer=>peer.online&&!peer.pending&&!peer.fallbacks&&JSON.stringify(peer.model)===JSON.stringify(s.server.model)&&JSON.stringify(peer.nativeModel)===JSON.stringify(s.server.model));},null,{timeout:15000});
    return page.evaluate(()=>window.compat.snapshot());
  };
  const remote=async(doc,edits)=>{const response=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!response.ok())throw new Error(await response.text());};
  const text=cell=>cell.children[0].children.flatMap(p=>(p.runs??[]).map(run=>run.text??'')).join('');
  const note=async(name,{rows,cols,hiddenRow,hiddenColumn,foreign=false,typed=false,merged=true})=>{
    const snapshot=await wait(),table=snapshot.server.model.children[1],master=table.children[0].children[0],hidden=table.children[hiddenRow].children[hiddenColumn];
    if(table.children.length!==3||table.children.some(row=>row.children.length!==3))throw new Error(`${name}: grid dimensions`);
    if(text(master)!==`cell00${typed?'!':''}`)throw new Error(`${name}: visible text ${text(master)}`);
    if(text(hidden)!==`${foreign?'X':''}cell${hiddenRow}${hiddenColumn}`)throw new Error(`${name}: hidden text ${text(hidden)}`);
    if(Boolean(hidden.attrs?.spanned)!==merged)throw new Error(`${name}: hidden visibility`);
    if(foreign&&(!hidden.children[0].children[0].runs[0].marks.bold||hidden.attrs?.backgroundColor!=='#00ff00'))throw new Error(`${name}: foreign format/attributes`);
    const geometry=await page.getByRole('textbox').evaluateAll(editors=>editors.map(editor=>{
      const cells=[...editor.querySelectorAll('td,th')].filter(cell=>getComputedStyle(cell).display!=='none');
      return {name:editor.getAttribute('aria-label'),count:cells.length,colspan:cells[0].colSpan,rowspan:cells[0].rowSpan};
    }));
    for(const grid of geometry)if(grid.count!==(merged?10-rows*cols:9)||grid.colspan!==(merged?cols:1)||grid.rowspan!==(merged?rows:1))throw new Error(`${name}: native geometry ${JSON.stringify(grid)}`);
    results.push({name,status:'passed',geometry,snapshot});
  };
  for(const [actor,short] of [['slate-a','s'],['lexical-a','l'],['pm-a','p']])for(const [rows,cols] of [[1,2],[2,1],[2,2],[3,3]]){
    const doc=`merge-${short}-${rows}${cols}-${run}`;
    await page.goto(`${origin}/?doc=${doc}`);await wait();
    const table={type:'table',children:Array.from({length:3},(_,r)=>({type:'table-row',children:Array.from({length:3},(_,c)=>cell(`cell${r}${c}`))}))};
    await remote(doc,[{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:[p('before'),table,p('after')]}]);await wait();
    const hiddenRow=rows>1?1:0,hiddenColumn=cols>1?1:0,options={rows,cols,hiddenRow,hiddenColumn};
    await page.evaluate(({actor,rows,cols})=>window.compat.edit(actor,[{op:'update',at:[1,0,0],attrs:{rowspan:rows,colspan:cols}}]),{actor,rows,cols});
    await note(`${actor} ${rows}x${cols}: merged native models and DOM geometry`,options);
    const paragraph=page.getByRole('textbox',{name:actor,exact:true}).locator('p').filter({hasText:/^cell00$/});
    await paragraph.click();await paragraph.evaluate(node=>{const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();window.getSelection().setBaseAndExtent(text,text.length,text,text.length);document.dispatchEvent(new Event('selectionchange'));});
    await page.waitForTimeout(80);await page.keyboard.type('!');
    await note(`${actor} ${rows}x${cols}: native typing in merged owner`,{...options,typed:true});
    await remote(doc,[{op:'insert',at:[1,hiddenRow,hiddenColumn,0,0,0],content:'X'},{op:'update',at:[1,hiddenRow,hiddenColumn,0,0,0],length:1,attrs:{bold:true}},{op:'update',at:[1,hiddenRow,hiddenColumn],attrs:{backgroundColor:'#00ff00'}}]);
    await note(`${actor} ${rows}x${cols}: foreign hidden text format and attributes`,{...options,foreign:true,typed:true});
    const undo=()=>page.locator(`#${actor}`).getByRole('button',{name:'되돌리기',exact:true}).click();
    const redo=()=>page.locator(`#${actor}`).getByRole('button',{name:'다시하기',exact:true}).click();
    await undo();await note(`${actor} ${rows}x${cols}: typing undo preserves foreign hidden edit`,{...options,foreign:true});
    await undo();await note(`${actor} ${rows}x${cols}: merge undo reveals foreign hidden edit`,{...options,foreign:true,merged:false});
    await redo();await note(`${actor} ${rows}x${cols}: merge redo retains foreign hidden edit`,{...options,foreign:true});
    await redo();await note(`${actor} ${rows}x${cols}: typing redo retains foreign hidden edit`,{...options,foreign:true,typed:true});
    await remote(doc,[{op:'update',at:[1,0,0],attrs:{rowspan:1,colspan:1}}]);
    await note(`${actor} ${rows}x${cols}: unmerge retains all nine cells`,{...options,foreign:true,typed:true,merged:false});
  }
  return {browserVersion:page.context().browser().version(),results};
}
