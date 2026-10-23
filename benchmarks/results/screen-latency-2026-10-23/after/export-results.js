async (page) => {
  const output = '/Users/user/github/doc-sync/output/playwright/screen-latency-20261023/after/browser-raw.json';
  const state = await page.evaluate(() => {
    const B = __latency;
    const clients = Object.values(B.clients).map(client => ({actor: client.actor, serverSeq: client.serverSeq, pending: client.pending.length, eventStats: client.eventStats, model: client.doc.toJSON()}));
    const server = fetch('/api/docs/latency100k/state').then(r => r.json());
    return server.then(server => ({samples: B.samples, longTasks: B.longTasks, clients, server, timeOrigin: performance.timeOrigin, userAgent: navigator.userAgent, visibility: document.visibilityState, devicePixelRatio, browserTime: new Date().toISOString()}));
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(state => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'}));
      a.download = 'browser-raw.json'; a.click(); URL.revokeObjectURL(a.href);
    }, state),
  ]);
  await download.saveAs(output);
  return {output, samples: state.samples.length, clients: state.clients.map(c => ({actor:c.actor,pending:c.pending,serverSeq:c.serverSeq})), serverSeq:state.server.serverSeq};
}
