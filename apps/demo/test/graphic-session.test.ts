import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@barocss/doc-sync/client';
import {DocHub} from '@barocss/doc-sync/server';
import type {Transport} from '@barocss/doc-sync/sync';
import {CANVAS_SCHEMA, CANVAS_SAMPLE} from '../../../fixtures/graphic-canvas-schema.ts';
import {SceneSession} from '../graphic/session.ts';
import {worldTransform} from '../graphic/geometry.ts';
function pair() {
    const hub = new DocHub({schema: CANVAS_SCHEMA});
    const seed = new Client({schema: CANVAS_SCHEMA, actor: 'seed'});
    hub.submit({actor: 'seed', seq: 1, ops: seed.edit([{op:'insert',at:[0],content:CANVAS_SAMPLE.children!}])}); seed.dispose();
    const transport = (actor: string): Transport => ({
        subscribe(since, receive, epoch) { const stop = hub.listen(receive); receive(hub.hello(since, epoch)); return stop; },
        async send(message) { if (message.kind === 'change') hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence(value) { hub.setPresence(value); },
    });
    const a = new SceneSession({actor:'alice', transport:transport('alice')}), b = new SceneSession({actor:'bob', transport:transport('bob')});
    return {a,b,hub};
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
test('stable IDs, field merges, presence and actor-local undo', async () => {
    const {a,b,hub} = pair();
    try {
        await tick(); const shape = a.model().find(o=>o.type==='rectangle')!;
        a.hold(true); b.hold(true);
        a.moveWorld(shape.id, 220, 240); b.update(shape.id,{fill:'#FF0000',transform:{rotation:37,scale:1.2}});
        await tick(); a.hold(false); b.hold(false); await tick();
        assert.deepEqual(a.snapshot().model,b.snapshot().model);
        const merged = a.model().find(o=>o.id===shape.id)!;
        assert.equal(merged.fill,'#FF0000'); assert.equal(merged.transform.rotation,37); assert.equal(merged.transform.scale,1.2);
        a.undo(); await tick(); assert.equal(a.model().find(o=>o.id===shape.id)!.fill,'#FF0000');
        const before = hub.serverSeq; a.select([shape.id]); a.pointer({x:3,y:4}); await tick(); assert.equal(hub.serverSeq,before);
        assert.equal(b.snapshot().peers.find(p=>p.actor==='alice')!.metadata!.graphic !== undefined,true);
        const count=a.metrics.reindexCount; for(let i=0;i<1000;i++) a.snapshot(); assert.equal(a.metrics.reindexCount,count);
    } finally {a.dispose();b.dispose();}
});
test('reparent preserves world and stale IDs fail without editing another object', async()=>{
    const {a,b} = pair();
    try {
        await tick(); const shape=a.model().find(o=>o.type==='rectangle')!, target=a.model().find(o=>o.type==='frame'&&o.parentId===null&&o.id!==shape.parentId)!;
        const transform=shape.transform, world=worldTransform(new Map(a.model().map(o=>[o.id,o])),shape.id)!; a.reparent(shape.id,target.id); await tick();
        assert.equal(a.model().find(o=>o.id===shape.id)!.parentId,target.id); const afterWorld=worldTransform(new Map(a.model().map(o=>[o.id,o])),shape.id)!; for (const key of ['x','y','rotation','scale'] as const) assert.ok(Math.abs(afterWorld[key]-world[key])<1e-9); assert.deepEqual(a.snapshot().model,b.snapshot().model);
        a.undo(); await tick(); assert.equal(a.model().find(o=>o.id===shape.id)!.parentId,shape.parentId); assert.deepEqual(a.model().find(o=>o.id===shape.id)!.transform,transform);
        b.delete(shape.id); await tick(); const before=JSON.stringify(a.snapshot().model);
        assert.throws(()=>a.update(shape.id,{fill:'#FFFFFF'}),/missing/); assert.equal(JSON.stringify(a.snapshot().model),before);
    } finally {a.dispose();b.dispose();}
});
test('create label and edit text; lock prevents drag',async()=>{
    const {a,b}=pair(); try { await tick(); const id=a.create('label',{text:'Hello'}); await tick(); a.update(id,{text:'World'}); await tick(); assert.equal(b.model().find(o=>o.id===id)!.text,'World'); a.update(id,{locked:true}); assert.throws(()=>a.moveWorld(id,1,2),/locked/); a.update(id,{locked:false}); a.delete(id); await tick(); assert.equal(b.model().some(o=>o.id===id),false); } finally {a.dispose();b.dispose();}
});

test('fresh ID resolution survives peer insert, reparent and sibling reorder',async()=>{
    const {a,b}=pair(); try {
        await tick(); const object=a.model().find(o=>o.type==='ellipse'&&o.parentId===null)!, target=a.model().find(o=>o.type==='object-group'&&o.parentId===null)!;
        b.create('rectangle',{fill:'#112233'}); b.reparent(object.id,target.id); await tick();
        a.update(object.id,{fill:'#ABCDEF'}); await tick(); assert.equal(b.lookup(object.id)!.fill,'#ABCDEF'); assert.equal(a.lookup(object.id)!.parentId,target.id);
        a.reorder(target.id,0); await tick(); a.update(object.id,{opacity:0.5}); await tick(); assert.equal(b.lookup(object.id)!.opacity,0.5); assert.deepEqual(a.snapshot().model,b.snapshot().model);
        const count=a.metrics.reindexCount; const result=a.benchmarkLookup(1000); assert.equal(result.reindexCount,count); assert.equal(a.lookup('missing'),null);
    } finally {a.dispose();b.dispose();}
});

test('duplicate display names remain distinct and delete undo restores the same stable ID',async()=>{
    const {a,b}=pair(); try {
        await tick(); const first=a.create('rectangle',{name:'Duplicate',fill:'#111111'}),second=a.create('rectangle',{name:'Duplicate',fill:'#222222'});await tick();
        assert.notEqual(first,second);assert.equal(a.lookup('missing'),null);
        a.update(second,{fill:'#333333'});await tick();assert.equal(b.lookup(first)!.fill,'#111111');assert.equal(b.lookup(second)!.fill,'#333333');
        a.delete(first);await tick();assert.equal(a.lookup(first),null);const before=JSON.stringify(a.snapshot().model);assert.throws(()=>a.delete(first),/missing/);assert.equal(JSON.stringify(a.snapshot().model),before);
        a.undo();await tick();assert.equal(a.lookup(first)!.id,first);assert.equal(b.lookup(first)!.id,first);assert.equal(b.lookup(second)!.fill,'#333333');assert.deepEqual(a.snapshot().model,b.snapshot().model);
    } finally {a.dispose();b.dispose();}
});

test('held incoming overflow closes a synchronous subscription without a temporal dead zone',async()=>{
    const {HeldTransport}=await import('../graphic/transport.ts');let stopped=0,failed=0,received=0;
    const transport:Transport={subscribe(_since,receive){for(let at=0;at<2049;at++)receive({type:'leave',actor:'peer'});return()=>{stopped++;};},async send(){},sendPresence(){}};
    const held=new HeldTransport(transport,()=>{},()=>{failed++;});held.hold(true);held.subscribe(0,()=>{received++;});
    assert.equal(stopped,1);assert.equal(failed,1);assert.equal(held.queued,2048);held.hold(false);assert.equal(received,0);assert.equal(held.queued,0);
});

test('concurrent label inspector splices keep different-locus edits and actor-local undo',async()=>{
    const {a,b}=pair();try {
        await tick();const id=a.create('label',{text:'Hello'});await tick();a.client.clearHistory();b.client.clearHistory();
        a.hold(true);b.hold(true);a.update(id,{text:'hello'},'Hello');b.update(id,{text:'Hello!'},'Hello');await tick();a.hold(false);b.hold(false);await tick();
        assert.equal(a.lookup(id)!.text,'hello!');assert.equal(b.lookup(id)!.text,'hello!');
        a.undo();await tick();assert.equal(a.lookup(id)!.text,'Hello!');assert.equal(b.lookup(id)!.text,'Hello!');
        b.undo();await tick();assert.equal(a.lookup(id)!.text,'Hello');assert.equal(b.lookup(id)!.text,'Hello');
        assert.throws(()=>a.update(id,{text:'stale'},'wrong base'),/Label changed/);assert.equal(a.lookup(id)!.text,'Hello');
    }finally{a.dispose();b.dispose();}
});
test('label splice boundaries keep complete surrogate pairs and unchanged character IDs',async()=>{
    const {a,b,hub}=pair();try {
        await tick();const id=a.create('label',{text:'A😀Z'});await tick();
        const edgeIds=()=>{const block=a.client.sync!.doc.blocks().find(block=>block.marker.key===id);assert.ok(block?.kind==='text');return [block.chars[0].key,block.chars.at(-1)!.key];};
        const originalEdges=edgeIds();
        for(const [text,inserted] of [['A😁Z','😁'],['A🈁Z','🈁'],['A😀Z','😀'],['A😀!Z','!']] as const){
            const previous=a.lookup(id)!.text!;
            a.update(id,{text},previous);await tick();
            assert.equal(a.lookup(id)!.text,text);assert.equal(b.lookup(id)!.text,text);assert.deepEqual(edgeIds(),originalEdges);
            const ops=hub.log.at(-1)!.change!.ops;
            assert.deepEqual(ops.filter(op=>op.t==='text').map(op=>op.text),[inserted]);
        }
        const beforeSeq=hub.serverSeq;a.update(id,{text:'A😀!Z'});await tick();assert.equal(hub.serverSeq,beforeSeq);
    }finally{a.dispose();b.dispose();}
});

test('view notifications run after client edit, coalesce, and stop safely on disposal',async()=>{
    const {a,b}=pair();try {
        await tick();const id=a.model().find(o=>o.type==='rectangle')!.id;let insideEdit=false,calls=0;
        const stop=a.subscribe(()=>{assert.equal(insideEdit,false);calls++;});
        insideEdit=true;a.update(id,{fill:'#102030'});a.update(id,{opacity:0.7});assert.equal(calls,0);insideEdit=false;
        await Promise.resolve();assert.equal(calls,1);await tick();stop();
        let afterStop=0;a.subscribe(()=>{afterStop++;});a.select([id]);a.dispose();await Promise.resolve();assert.equal(afterStop,0);
    }finally {a.dispose();b.dispose();}
});
