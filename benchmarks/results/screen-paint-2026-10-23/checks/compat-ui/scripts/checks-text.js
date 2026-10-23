async page => {
  const results=[];
  const text=model=>model.children.filter(n=>n.type==='paragraph').map(n=>(n.runs??[]).map(r=>r.text??'').join('')).join('\n');
  const state=()=>page.evaluate(()=>window.compat.snapshot());
  const endOfParagraph=async(name,last=false)=>{
    const paragraphs=page.getByRole('textbox',{name,exact:true}).locator('p');
    const paragraph=last?paragraphs.last():paragraphs.first();
    await paragraph.click();
    await paragraph.evaluate(p=>{const range=document.createRange();range.selectNodeContents(p);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
    await page.waitForTimeout(100);
  };
  const wait=async expected=>{
    await page.evaluate(value=>{window.textCheckStage=value;},expected??'model convergence');
    await page.waitForFunction(expected=>{const s=window.compat.snapshot();const text=s.server?.model.children.filter(n=>n.type==='paragraph').map(n=>(n.runs??[]).map(r=>r.text??'').join('')).join('\n');return (expected===undefined||text===expected)&&!s.failures.length&&s.server&&s.peers.every(p=>p.online&&!p.pending&&JSON.stringify(p.model)===JSON.stringify(s.server.model)&&JSON.stringify(p.nativeModel)===JSON.stringify(s.server.model));},expected);
    const s=await state();if(expected!==undefined&&text(s.server.model)!==expected)throw new Error(`text mismatch: ${text(s.server.model)} != ${expected}`);return s;
  };
  const reset=async()=>{await page.locator('#reset').click();await page.waitForFunction(()=>{const s=window.compat.snapshot();return s.server?.seq===0&&s.peers.every(p=>p.seq===0&&p.model.children.length===1&&!p.model.children[0].runs.length&&JSON.stringify(p.nativeModel)===JSON.stringify(p.model));});};
  const note=async name=>{results.push({name,snapshot:await wait()});await page.evaluate(value=>{window.textCheckProgress=value;},results);};
  await reset();
  await page.getByRole('textbox',{name:'slate-a',exact:true}).click();await page.keyboard.type('Slate ');await wait('Slate ');
  await page.getByRole('textbox',{name:'lexical-a',exact:true}).locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type('Lexical');await wait('Slate Lexical');
  await note('Slate to Lexical and Lexical to Slate via native typing');
  await page.keyboard.insertText(' 한글😀');await wait('Slate Lexical 한글😀');await note('Korean and emoji insertion (not OS IME)');
  await endOfParagraph('slate-b');await page.keyboard.press('Enter');await page.keyboard.type('S-next');await wait('Slate Lexical 한글😀\nS-next');
  await endOfParagraph('lexical-b',true);await page.keyboard.press('Enter');await page.keyboard.type('L-next');await wait('Slate Lexical 한글😀\nS-next\nL-next');
  await page.keyboard.press('Meta+ArrowLeft');await page.waitForTimeout(100);await page.keyboard.press('Backspace');await wait('Slate Lexical 한글😀\nS-nextL-next');await note('Enter in both editors and Lexical Backspace join');
  await page.getByRole('textbox',{name:'slate-a',exact:true}).locator('p').first().click();await page.keyboard.press('Meta+ArrowLeft');await page.keyboard.press('Meta+Shift+ArrowRight');await page.waitForTimeout(100);await page.locator('#slate-a').getByRole('button',{name:'굵게',exact:true}).click();await wait();
  let s=await state();if(!s.server.model.children[0].runs.some(r=>r.marks.bold))throw new Error('Slate bold did not arrive');
  await page.getByRole('textbox',{name:'lexical-a',exact:true}).locator('p').first().click();await page.keyboard.press('Meta+ArrowLeft');await page.keyboard.press('Meta+Shift+ArrowRight');await page.waitForTimeout(100);await page.keyboard.press('Meta+i');await page.waitForTimeout(100);await wait();
  s=await state();if(!s.server.model.children[0].runs.some(r=>r.marks.bold&&r.marks.italic))throw new Error('Lexical italic did not arrive');await note('Slate bold and Lexical italic preserve marks');
  await reset();
  await page.getByRole('textbox',{name:'slate-a',exact:true}).click();await page.keyboard.type('base');await wait('base');
  await page.getByRole('textbox',{name:'lexical-a',exact:true}).locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type('L');await wait('baseL');
  await page.locator('#slate-a').getByRole('button',{name:'되돌리기',exact:true}).click();await wait('basL');
  await note('Slate undo preserves remote Lexical edit');
  await page.locator('#slate-a').getByRole('button',{name:'다시하기',exact:true}).click();await wait('baseL');
  await page.locator('#lexical-a').getByRole('button',{name:'되돌리기',exact:true}).click();await wait('base');
  await page.locator('#lexical-a').getByRole('button',{name:'다시하기',exact:true}).click();await wait('baseL');await note('Undo and redo for both editor types');
  await page.evaluate(result=>window.textCheckResults=result,results);
  return {browserVersion:page.context().browser().version(),userAgent:await page.evaluate(()=>navigator.userAgent),checks:results};
}
