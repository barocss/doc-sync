async page => {
  const origin = new URL(page.url()).origin, run = Date.now().toString(36), results = [];
  const p = text => ({type:'paragraph',runs:text?[{text,marks:{}}]:[]});
  const box = (...children) => ({type:'callout',attrs:{tone:'info'},children});
  const cell = text => ({type:'table-cell',children:[{type:'table-cell-body',children:[p(text)]}]});
  const table = () => ({type:'table',attrs:{header:false},children:[0,1].map(i => ({type:'table-row',children:[cell(`cell${i}a`),cell(`cell${i}b`)]}))});
  const scene = () => ({type:'content',children:[...Array.from({length:12},(_,i)=>p(`p${i}:abcdef`)),box(p('inside'),p('second')),table(),p('tail')]});
  const clone = value => JSON.parse(JSON.stringify(value));
  const wait = async (expected, native = true) => {
    await page.waitForFunction(({expected,native}) => {
      const s = window.compat?.snapshot();
      return s?.server && !s.failures.length && (!expected || JSON.stringify(s.server.model) === JSON.stringify(expected)) && s.peers.every(peer => peer.online && !peer.pending && !peer.fallbacks && JSON.stringify(peer.model) === JSON.stringify(s.server.model) && (!native || JSON.stringify(peer.nativeModel) === JSON.stringify(s.server.model)));
    },{expected,native},{timeout:15000});
    return page.evaluate(()=>window.compat.snapshot());
  };
  const remote = async (doc,edits) => {
    const response = await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});
    if (!response.ok()) throw new Error(await response.text());
  };
  const caret = async (name,text,offset) => {
    const paragraph = page.getByRole('textbox',{name,exact:true}).locator('p').filter({hasText:new RegExp(`^${text}$`)});
    await paragraph.click();
    await paragraph.evaluate((node,offset)=>{
      const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();
      window.getSelection().setBaseAndExtent(text,offset,text,offset);
      document.dispatchEvent(new Event('selectionchange'));
    },offset);
    await page.waitForTimeout(100);
  };
  const note = async (name,expected) => results.push({name,status:'passed',snapshot:await wait(expected)});
  for (const [name,short] of [['slate-a','s'],['lexical-a','l'],['pm-a','p']]) {
    const doc=`structure-${short}-${run}`;
    await page.goto(`${origin}/?doc=${doc}`);
    const initial=await wait();
    let expected=scene();
    await remote(doc,[{op:'delete',at:[0],count:initial.server.model.children.length},{op:'insert',at:[0],content:expected.children}]); await wait(expected);
    await caret(name,'p6:abcdef',3); await page.keyboard.press('Enter');
    expected.children.splice(6,1,p('p6:'),p('abcdef'));
    await note(`${name}: root Enter in a guarded structural window`,expected);
    await caret(name,'abcdef',0); await page.keyboard.press('Backspace');
    expected=scene();
    await note(`${name}: root Backspace join retains all neighboring paragraphs`,expected);
    await caret(name,'inside',3); await page.keyboard.press('Enter');
    expected.children[12]=box(p('ins'),p('ide'),p('second'));
    await note(`${name}: nested Enter retains outer model paths`,expected);
    await remote(doc,[{op:'update',at:[12,1,0],length:1,attrs:{bold:true}}]);
    const tail={type:'paragraph',runs:[{text:'i',marks:{bold:true}},{text:'de',marks:{}}]};
    expected.children[12]=box(p('ins'),tail,p('second')); await wait(expected);
    await page.locator(`#${name}`).getByRole('button',{name:'되돌리기',exact:true}).click();
    const joined=clone(expected);joined.children[12]=box({type:'paragraph',runs:[{text:'ins',marks:{}},{text:'i',marks:{bold:true}},{text:'de',marks:{}}]},p('second')); await wait(joined);
    await page.locator(`#${name}`).getByRole('button',{name:'다시하기',exact:true}).click();
    await note(`${name}: structural undo redo preserves foreign formatting`,expected);
    await caret(name,'cell0a',3); await page.keyboard.press('Enter');
    expected.children[13].children[0].children[0].children[0].children=[p('cel'),p('l0a')];
    await note(`${name}: cell Enter changes only the bounded table subtree`,expected);
    await caret(name,'l0a',0); await page.keyboard.press('Backspace');
    expected.children[13]=table();
    await note(`${name}: cell Backspace restores the original grid content`,expected);
    const newRow={type:'table-row',children:[cell('new-a'),cell('new-b')]};
    await remote(doc,[{op:'insert',at:[13,1],content:[newRow]}]);
    expected.children[13].children.splice(1,0,newRow); await wait(expected);
    await remote(doc,[{op:'delete',at:[13,1],count:1}]);expected.children[13]=table();
    await note(`${name}: table row insertion and deletion preserve surrounding content`,expected);
    await remote(doc,[{op:'update',at:[13,0,0],attrs:{rowspan:1,colspan:2}}]);
    const merged=clone(expected), cells=merged.children[13].children[0].children;
    cells[0]={type:'table-cell',attrs:{colspan:2,rowspan:1},children:cells[0].children};
    cells[1]={type:'table-cell',attrs:{spanned:true},children:cells[1].children};
    await note(`${name}: merged native models preserve hidden text`,merged);
    await remote(doc,[{op:'update',at:[13,0,0],attrs:{rowspan:1,colspan:1}}]);
    await note(`${name}: merged-cell visibility and hidden text survive unmerge`,expected);
  }
  return {browserVersion:page.context().browser().version(),results};
}
