async (page) => {
  const config = {"phase": "measured", "start": 20, "count": 5};
  const output = [];
  for (let i = config.start; i < config.start + config.count; i++) {
    const char = 'qwertyuiopasdfghjklzcvbnm'[i % 23];
    const id = await page.evaluate(({char, phase, index}) => __latency.begin(__latency.currentDirection, char, phase, index), {char, phase: config.phase, index: i});
    await page.keyboard.press(char);
    await page.waitForFunction(id => __latency.samples.some(s => s.id === id && s.done), id.id, {timeout: 60000});
    const result = await page.evaluate(id => {
      const s = __latency.samples.find(s => s.id === id);
      return {id, correct: s.correct && s.sourceCorrect, trusted: s.inputEvents.every(e => e.trusted), domMs: s.inputToRemoteDomMs, frameMs: s.inputToRenderOpportunityMs, spans: s.spans.length, remoteReceived: s.remoteReceive != null};
    }, id.id);
    if (!result.correct || !result.trusted || !result.remoteReceived) throw new Error(JSON.stringify(result));
    output.push(result);
    await page.waitForTimeout(120);
  }
  return output;
}
