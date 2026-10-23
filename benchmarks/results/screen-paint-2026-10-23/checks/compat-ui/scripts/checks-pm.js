async page => {
  await page.waitForFunction(()=>document.querySelector('#converged').classList.contains('ok'));
  await page.locator('#pane-a .surface').click({position:{x:20,y:20}});await page.keyboard.type('Demo ');
  await page.waitForFunction(()=>document.querySelector('#converged').classList.contains('ok')&&document.querySelector('#pm-mount').textContent==='Demo ');
  await page.locator('#pm-mount p').first().click();await page.keyboard.press('End');await page.waitForTimeout(100);await page.keyboard.type('PM');
  await page.waitForFunction(()=>document.querySelector('#converged').classList.contains('ok')&&document.querySelector('#pm-mount').textContent==='Demo PM');
  await page.locator('#pane-p button[title="2×3 표 넣기"]').click();
  await page.waitForFunction(()=>document.querySelector('#converged').classList.contains('ok')&&document.querySelectorAll('main table').length===2);
  await page.locator('#pm-mount td p').first().click();await page.locator('#pane-p button[title="오른쪽에 열"]').click();
  await page.waitForFunction(()=>document.querySelector('#converged').classList.contains('ok')&&[...document.querySelectorAll('main table tr')].every(r=>r.children.length===4));
  const result=await page.evaluate(async()=>({badge:document.querySelector('#converged').textContent,tableShapes:[...document.querySelectorAll('main table')].map(t=>[...t.rows].map(r=>r.cells.length)),server:await(await fetch('/api/docs/chrome-pm-final/state')).json()}));
  await page.screenshot({path:'output/playwright/screen-next-compat-20261023/prosemirror-chrome.png',fullPage:true});
  return result;
}
