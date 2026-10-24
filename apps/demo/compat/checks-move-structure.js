async page => {
  const origin = new URL(page.url()).origin, run = Date.now().toString(36), results = [];
  const p = text => ({type: 'paragraph', runs: text ? [{text, marks: {}}] : []});
  const box = {type: 'callout', attrs: {tone: 'info'}, children: [p('body')]};
  const root = (...children) => ({type: 'content', children});
  const wait = async expected => {
    await page.waitForFunction(expected => {
      const s = window.compat?.snapshot();
      return s?.server && !s.failures.length && (!expected || JSON.stringify(s.server.model) === JSON.stringify(expected)) && s.peers.every(peer => peer.online && !peer.pending && !peer.fallbacks && JSON.stringify(peer.model) === JSON.stringify(s.server.model) && JSON.stringify(peer.nativeModel) === JSON.stringify(s.server.model));
    }, expected, {timeout: 15000});
    return page.evaluate(() => window.compat.snapshot());
  };
  const remote = async (doc, edits) => {
    const r = await page.request.post(`${origin}/test/remote`, {data: {doc, edits}});
    if (!r.ok()) throw new Error(await r.text());
  };
  const open = async (prefix, children) => {
    const doc = `ms-${prefix}-${run}`;
    await page.goto(`${origin}/?doc=${doc}`);
    const initial = await wait();
    await remote(doc, [{op: 'delete', at: [0], count: initial.server.model.children.length}, {op: 'insert', at: [0], content: children}]);
    await wait(root(...children));
    return doc;
  };
  // Set a DOM caret, then exercise the editor's actual keyboard/input handlers.
  const caret = async (name, index, offset) => {
    const paragraph = page.getByRole('textbox', {name, exact: true}).locator('p').nth(index);
    await paragraph.click();
    await paragraph.evaluate((node, offset) => {
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
      const selection = window.getSelection();
      if (text) selection.setBaseAndExtent(text, offset, text, offset);
      else {const range = document.createRange(); range.selectNodeContents(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);}
      document.dispatchEvent(new Event('selectionchange'));
    }, offset);
    await page.waitForTimeout(100);
  };
  const note = async (name, expected) => results.push({name, status: 'passed', snapshot: await wait(expected)});
  for (const [name, short] of [['slate-a', 's'], ['lexical-a', 'l'], ['pm-a', 'p']]) {
    let doc = await open(`auto-${short}`, [p('lead'), box]);
    await remote(doc, [{op: 'move', from: [1], at: [0]}]);
    await wait(root(p(''), box, p('lead')));
    await caret(name, 0, 0);
    await page.keyboard.insertText('abc');
    await note(`${name}: native input in automatic leading paragraph appears once`, root(p('abc'), box, p('lead')));
    await caret(name, 0, 1);
    await page.keyboard.press('Enter');
    await note(`${name}: native Enter keeps automatic halves before the moved block`, root(p('a'), p('bc'), box, p('lead')));
    await remote(doc, [{op: 'update', at: [1, 0], length: 1, attrs: {bold: true}}]);
    const marked = {type: 'paragraph', runs: [{text: 'b', marks: {bold: true}}, {text: 'c', marks: {}}]};
    await wait(root(p('a'), marked, box, p('lead')));
    await page.locator(`#${name}`).getByRole('button', {name: '되돌리기', exact: true}).click();
    await wait(root({type: 'paragraph', runs: [{text: 'a', marks: {}}, {text: 'b', marks: {bold: true}}, {text: 'c', marks: {}}]}, box, p('lead')));
    await page.locator(`#${name}`).getByRole('button', {name: '다시하기', exact: true}).click();
    await note(`${name}: split undo/redo preserves remote formatting and order`, root(p('a'), marked, box, p('lead')));
    doc = await open(`order-${short}`, [p('abc'), p('def'), p('ghi')]);
    await remote(doc, [{op: 'move', from: [2], at: [1]}]);
    await wait(root(p('abc'), p('ghi'), p('def')));
    await caret(name, 0, 1);
    await page.keyboard.press('Enter');
    await note(`${name}: native split preserves moved and stationary sibling order`, root(p('a'), p('bc'), p('ghi'), p('def')));
  }
  const doc = await open('replacement', [p('lead'), box]);
  await remote(doc, [{op: 'move', from: [1], at: [0]}]);
  await wait(root(p(''), box, p('lead')));
  await caret('slate-a', 0, 0); await page.keyboard.insertText('X');
  await wait(root(p('X'), box, p('lead')));
  await remote(doc, [{op: 'move', from: [0], at: [1, 1]}]);
  const populated = {...box, children: [p('body'), p('X')]};
  await note('moving automatic input across parents leaves a distinct empty replacement', root(p(''), populated, p('lead')));
  await caret('lexical-a', 0, 0); await page.keyboard.insertText('abc');
  await wait(root(p('abc'), populated, p('lead')));
  await caret('lexical-a', 0, 1); await page.keyboard.press('Enter');
  await note('native input and split in replacement gap pass server validation', root(p('a'), p('bc'), populated, p('lead')));
  return {browserVersion: page.context().browser().version(), results};
}
