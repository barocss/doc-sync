import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {PROTOCOL_VERSION} from '@barocss/doc-sync/sync';
import {createGraphicServer} from '../graphic/server.mjs';
import {SceneSession} from '../graphic/session.ts';
const wait = async (check:()=>boolean) => { for(let at=0;at<200;at++) { if(check()) return; await new Promise(resolve=>setTimeout(resolve,10)); } throw new Error('Timed out waiting for sync'); };
test('real HTTP/SSE: independent clients, reconnect, guards and room isolation', async()=>{
    const runtime=createGraphicServer(); await new Promise<void>(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
    const address=runtime.server.address(); assert.ok(address&&typeof address==='object'); const origin=`http://127.0.0.1:${address.port}`;
    const provision=await fetch(`${origin}/api/graphic/rooms`,{method:'POST',body:JSON.stringify({doc:'http-test',count:'sample'})}); assert.equal(provision.status,201);
    const a=new SceneSession({actor:'http-alice',transport:new NodeHttpTransport('http-test','http-alice',origin)}), b=new SceneSession({actor:'http-bob',transport:new NodeHttpTransport('http-test','http-bob',origin)});
    try {
        await wait(()=>a.snapshot().ready&&b.snapshot().ready);
        const id=a.model().find(o=>o.type==='rectangle')!.id;
        a.update(id,{fill:'#123456'}); await wait(()=>b.lookup(id)?.fill==='#123456'&&a.snapshot().pending===0);
        b.disconnect(); a.update(id,{fill:'#654321'}); await wait(()=>a.snapshot().pending===0); b.connect(); await wait(()=>b.lookup(id)?.fill==='#654321');
        assert.deepEqual(a.snapshot().model,b.snapshot().model);
        const state=await (await fetch(`${origin}/api/docs/http-test/state`)).json(); assert.deepEqual(state.model,a.snapshot().model);
        const headers={'x-doc-sync-protocol':String(PROTOCOL_VERSION),'x-doc-sync-schema':state.schemaVersion,'x-doc-sync-epoch':state.epoch};
        assert.equal((await fetch(`${origin}/api/docs/http-test/changes`,{method:'POST',headers:{...headers,'x-doc-sync-epoch':'stale'},body:'{}'})).status,409);
        assert.equal((await fetch(`${origin}/api/docs/http-test/changes`,{method:'POST',headers:{...headers,'x-doc-sync-protocol':'0'},body:'{}'})).status,426);
        assert.equal((await fetch(`${origin}/api/docs/http-test/changes`,{method:'POST',headers,body:'{broken'})).status,400);
        assert.equal((await fetch(`${origin}/api/docs/http-test/changes`,{method:'POST',headers:{...headers,'x-doc-sync-schema':'wrong'},body:'{}'})).status,409);
        assert.equal((await fetch(`${origin}/api/graphic/rooms`,{method:'POST',body:JSON.stringify({doc:'other',count:100})})).status,201);
        const other=await (await fetch(`${origin}/api/docs/other/state`)).json(); assert.notDeepEqual(other.model,state.model);
        assert.equal((await fetch(`${origin}/api/graphic/rooms`,{method:'POST',body:JSON.stringify({doc:'other',count:1000})})).status,409);
    } finally { a.dispose();b.dispose();await runtime.close(); }
});
