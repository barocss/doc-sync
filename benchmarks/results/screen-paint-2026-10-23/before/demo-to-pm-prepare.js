async (page) => {
  const direction = "demo-to-pm";
  await page.evaluate(direction => {
    const B = window.__latency;
    B.currentDirection = direction;
    if (direction === 'demo-to-pm') {
      B.editor.moveTo({b: 0, o: 50});
      B.editor.focusInput();
    } else {
      const view = B.view;
      B.binding.dispatch(view.state.tr.setSelection(B.TextSelection.create(view.state.doc, 51)));
      view.focus();
    }
    window.scrollTo(0, 0);
  }, direction);
  await page.waitForTimeout(1800);
  return await page.evaluate(() => ({direction: __latency.currentDirection, focused: document.activeElement.className, visible: document.visibilityState, demoRect: document.querySelector('#pane-a .blk').getBoundingClientRect().toJSON(), pmRect: document.querySelector('.ProseMirror > p').getBoundingClientRect().toJSON()}));
}
