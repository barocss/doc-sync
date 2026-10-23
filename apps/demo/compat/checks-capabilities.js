async page => {
  const origin=new URL(page.url()).origin,run=Date.now().toString(36),results=[];
  const p=text=>({type:'paragraph',runs:[{text,marks:{}}]});
  const wait=async()=>{
    await page.waitForFunction(()=>{const s=window.compat?.snapshot();return s?.server&&!s.failures.length&&s.peers.every(peer=>peer.online&&!peer.pending&&JSON.stringify(peer.model)===JSON.stringify(s.server.model)&&JSON.stringify(peer.nativeModel)===JSON.stringify(s.server.model));},null,{timeout:15000});
    return page.evaluate(()=>window.compat.snapshot());
  };
  const remote=async(doc,edits)=>{const response=await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});if(!response.ok())throw new Error(await response.text());return response.json();};
  const open=async prefix=>{const doc=`${prefix}-${run}`;await page.goto(`${origin}/?doc=${doc}`);await wait();return doc;};
  const note=async(name,extra={})=>{results.push({name,status:'passed',snapshot:await wait(),...extra});await page.evaluate(value=>window.capabilityResults=value,results);};
  let doc=await open('capability-move');
  await remote(doc,[{op:'insert',at:[0,0],content:'root'},{op:'insert',at:[1],content:[p('abcdef'),{type:'callout',children:[p('inside')]}]}]);await wait();
  const id=await page.evaluate(()=>window.compat.annotate('slate-a',{anchor:[1,0],focus:[1,6]},{message:'Keep this range'},{expand:'none'}));await wait();
  const records=()=>page.evaluate(()=>window.compat.annotations());
  const expectedRange=async range=>{
    await page.waitForFunction(({id,range})=>window.compat.annotations().every(peer=>peer.records.length===1&&peer.records[0].id===id&&peer.records[0].status==='resolved'&&JSON.stringify(peer.records[0].range)===JSON.stringify(range)),{id,range});
  };
  await expectedRange({anchor:[1,0],focus:[1,6]});
  await remote(doc,[{op:'move',from:[1],at:[2,1]}]);await wait();
  await expectedRange({anchor:[1,1,0],focus:[1,1,6]});
  await note('paragraph move follows stable annotation endpoints across five native editors',{annotations:await records()});
  await remote(doc,[{op:'split',at:[1,1,3]}]);await wait();
  await expectedRange({anchor:[1,1,0],focus:[1,2,3]});
  await remote(doc,[{op:'merge',at:[1,2]}]);await wait();
  await expectedRange({anchor:[1,1,0],focus:[1,1,6]});
  await note('moved paragraph Enter and join preserve the annotated content');
  await page.evaluate(id=>window.compat.updateAnnotation('lexical-b',id,{data:{resolved:true}}),id);await wait();
  if(!(await records()).every(peer=>peer.records[0].data.resolved===true))throw new Error('annotation metadata did not replicate');
  await page.evaluate(id=>window.compat.deleteAnnotation('slate-b',id),id);await wait();
  if(!(await records()).every(peer=>peer.records.length===0))throw new Error('annotation deletion did not replicate');
  await note('persistent annotation metadata updates and deletion replicate over HTTP');
  doc=await open('capability-schema');
  const cell=text=>({type:'table-cell',children:[{type:'table-cell-body',children:[p(text)]}]});
  const scene=[
    {type:'paragraph',runs:[{text:'Text ',marks:{bold:true}},{type:'inline-hyperlink',attrs:{url:'https://example.com'},runs:[{text:'link',marks:{}}]},{type:'inline-image',attrs:{src:'',width:32,height:24}}]},
    {type:'heading1',runs:[{text:'Heading one',marks:{}}]},
    {type:'heading2',runs:[{text:'Heading two',marks:{}}]},
    {type:'quote',runs:[{text:'Quote',marks:{italic:true}}]},
    {type:'list',attrs:{listType:'bullet'},children:[{type:'list-item',attrs:{listType:'bullet',level:0},runs:[{text:'Item',marks:{}}]}]},
    {type:'table',attrs:{header:true},children:[{type:'table-row',children:[cell('A'),cell('B')]}]},
    {type:'image-component',children:[{type:'image',runs:[{type:'inline-image',attrs:{src:'',width:32,height:24}}]},{type:'caption',children:[{type:'caption-paragraph',runs:[{text:'Caption',marks:{}}]}]}]},
    {type:'callout',attrs:{tone:'warn'},children:[p('Container')]},
    {type:'divider'},
  ];
  await remote(doc,[{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:scene}]);await wait();
  await note('complete demo schema renders and roundtrips all nine shapes');
  for(const type of ['table','callout','divider','list']){
    const snapshot=await wait(),index=snapshot.server.model.children.findIndex(node=>node.type===type);
    if(index<0)throw new Error(`missing ${type}`);
    await remote(doc,[{op:'move',from:[index],at:[0]}]);
    const next=await wait();const first=next.server.model.children.find(node=>node.type!=='paragraph'||node.runs?.length);if(first?.type!==type)throw new Error(`${type} did not move before authored content`);
    const moved=next.server.model.children.find(node=>node.type===type);if(JSON.stringify(moved)!==JSON.stringify(snapshot.server.model.children[index]))throw new Error(`${type} content changed during movement`);
    await note(`move ${type} while preserving native/client/server equality`);
  }
  return {browserVersion:page.context().browser().version(),run,results};
}
