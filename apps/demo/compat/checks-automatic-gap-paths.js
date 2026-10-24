async page => {
  const origin = new URL(page.url()).origin, run = Date.now().toString(36), results = [];
  const p = text => ({type:'paragraph',runs:text?[{text,marks:{}}]:[]});
  const box = {type:'callout',attrs:{tone:'info'},children:[p('body')]};
  const root = (...children) => ({type:'content',children});
  const wait = async expected => {
    await page.waitForFunction(expected => {
      const s = window.compat?.snapshot();
      return s?.server && !s.failures.length && (!expected || JSON.stringify(s.server.model) === JSON.stringify(expected)) && s.peers.every(peer => peer.online && !peer.pending && !peer.fallbacks && JSON.stringify(peer.model) === JSON.stringify(s.server.model) && JSON.stringify(peer.nativeModel) === JSON.stringify(s.server.model));
    }, expected, {timeout:15000});
    return page.evaluate(() => window.compat.snapshot());
  };
  const remote = async (doc, edits) => {
    const response = await page.request.post(`${origin}/test/remote`,{data:{doc,edits}});
    if (!response.ok()) throw new Error(await response.text());
  };
  const caret = async (name, anchor, focus = anchor) => {
    const paragraph = page.getByRole('textbox',{name,exact:true}).locator('p').filter({hasText:/^ab$/});
    await paragraph.click();
    await paragraph.evaluate((node,{anchor,focus}) => {
      const text = document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();
      window.getSelection().setBaseAndExtent(text,anchor,text,focus);
      document.dispatchEvent(new Event('selectionchange'));
    },{anchor,focus});
    await page.waitForTimeout(100);
  };
  for (const [name,short] of [['slate-a','s'],['lexical-a','l'],['pm-a','p']]) {
    for (const action of ['insert','delete','format','split']) {
      const doc = `gap-${short}-${action}-${run}`;
      await page.goto(`${origin}/?doc=${doc}`);
      const initial = await wait();
      await remote(doc,[{op:'delete',at:[0],count:initial.server.model.children.length},{op:'insert',at:[0],content:[p('lead'),box]}]);
      await wait(root(p('lead'),box));
      await remote(doc,[{op:'move',from:[1],at:[0]}]); await wait(root(p(''),box,p('lead')));
      await remote(doc,[{op:'insert',at:[0,0],content:'a'}]); await wait(root(p('a'),box,p('lead')));
      await remote(doc,[{op:'move',from:[1],at:[0]}]); await wait(root(p(''),box,p('a'),p('lead')));
      // Keep the replacement empty while another change invalidates projection.
      await remote(doc,[{op:'insert',at:[2,1],content:'b'}]); await wait(root(p(''),box,p('ab'),p('lead')));
      await caret(name,action === 'format' ? 0 : 1,action === 'format' ? 1 : undefined);
      let expected;
      if (action === 'insert') {await page.keyboard.insertText('X'); expected = root(p(''),box,p('aXb'),p('lead'));}
      else if (action === 'delete') {await page.keyboard.press('Backspace'); expected = root(p(''),box,p('b'),p('lead'));}
      else if (action === 'format') {
        if (name === 'slate-a') await page.locator(`#${name}`).getByRole('button',{name:'굵게',exact:true}).click();
        else await page.keyboard.press('Meta+b');
        expected = root(p(''),box,{type:'paragraph',runs:[{text:'a',marks:{bold:true}},{text:'b',marks:{}}]},p('lead'));
      } else {await page.keyboard.press('Enter'); expected = root(p(''),box,p('a'),p('b'),p('lead'));}
      await wait(expected);
      if (action === 'delete') {
        await page.locator(`#${name}`).getByRole('button',{name:'되돌리기',exact:true}).click(); await wait(root(p(''),box,p('ab'),p('lead')));
        await page.locator(`#${name}`).getByRole('button',{name:'다시하기',exact:true}).click(); await wait(expected);
      }
      results.push({name,action,status:'passed',snapshot:await wait(expected)});
    }
  }
  return {browserVersion:page.context().browser().version(),results};
}
