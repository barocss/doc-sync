async (page) => {
    const traffic = [];
    const posts = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.eventSourceMessageReceived', event => {
        traffic.push({at: Date.now(), ...JSON.parse(event.data)});
    });
    const listener = req => {
        if (req.url().endsWith('/presence')) posts.push({at: Date.now(), ...req.postDataJSON()});
    };
    page.on('request', listener);
    const snapshot = () => page.evaluate(async () => {
        const abort = new AbortController();
        const response = await fetch('/api/docs/presence-20261022/stream?since=0', {signal: abort.signal});
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let data = '';
        while (!data.includes('\n\n')) data += decoder.decode((await reader.read()).value, {stream: true});
        abort.abort();
        return JSON.parse(data.split('\n\n')[0].replace(/^data: /, '')).presence;
    });
    await page.goto('__SCREEN_ORIGIN__/pm?doc=presence-20261022');
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(300);
    const sender = posts.filter(p => p.name === 'P' && p.focus).at(-1);
    if (!sender) throw new Error('sender range was not sent');
    const before = await snapshot();
    const beforeCount = await page.locator('#pane-a .remote-selection').count();
    if (!before.some(p => p.actor === sender.actor) || beforeCount !== 4) throw new Error('before presence mismatch');
    const disconnectAt = Date.now();
    await page.locator('#pane-p .link-toggle').click();
    await page.waitForTimeout(600);
    const after = await snapshot();
    const afterCount = await page.locator('#pane-a .remote-selection, #pane-a .caret.remote').count();
    const leaves = traffic.filter(p => p.type === 'leave' && p.actor === sender.actor && p.at >= disconnectAt);
    const latePosts = posts.filter(p => p.actor === sender.actor && p.at >= disconnectAt);
    const state = await (await page.request.get('__SCREEN_ORIGIN__/api/docs/presence-20261022/state')).json();
    const peer = state.peers.find(p => p.actor === sender.actor);
    if (after.some(p => p.actor === sender.actor) || afterCount !== 0 || leaves.length === 0 || peer.online !== false || latePosts.length !== 0) {
        throw new Error('disconnect mismatch: ' + JSON.stringify({afterCount, leaves, peer, latePosts}));
    }
    await page.screenshot({path: 'output/playwright/screen-next-main-20261023/presence-remote-disconnect.png', fullPage: true});
    page.off('request', listener);
    await cdp.detach();
    return {results: [{name: 'normal SSE disconnect removes remote selection', sender, beforeHelloPresence: before, beforeRangeCharacters: beforeCount, afterHelloPresence: after, afterRemoteDecorations: afterCount, receivedLeave: leaves, latePresencePosts: latePosts, serverPeer: peer}]};
}
