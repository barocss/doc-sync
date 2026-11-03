import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '../src/client/index.ts';
import {DocHub} from '../src/server/index.ts';
import type {Transport} from '../src/sync/protocol.ts';
import {CANVAS_SCHEMA, CANVAS_SAMPLE} from '../../../fixtures/graphic-canvas-schema.ts';

test('graphic label replacement and append emit remote events with valid container scope',async()=>{
    const hub=new DocHub({schema:CANVAS_SCHEMA}), errors:unknown[]=[];
    hub.onListenerError=error=>errors.push(error);
    const seed=new Client({schema:CANVAS_SCHEMA,actor:'seed'});
    hub.submit({actor:'seed',seq:1,ops:seed.edit([{op:'insert',at:[0],content:CANVAS_SAMPLE.children!}])}); seed.dispose();
    const transport:Transport={subscribe(since,receive,epoch){const stop=hub.listen(receive);receive(hub.hello(since,epoch));return stop;},async send(message){if(message.kind==='change')hub.submit(message.change);else hub.ack(message.ack);},sendPresence(presence){hub.setPresence(presence);}};
    const a=new Client({schema:CANVAS_SCHEMA,actor:'a',transport}),b=new Client({schema:CANVAS_SCHEMA,actor:'b',transport});
    const events:Array<{fallback:boolean;count:number}>=[];
    b.subscribe({modelEvents:(edits,info)=>events.push({fallback:!!info.fallback,count:edits.length})});
    a.connect();b.connect();events.length=0;
    const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
    try {
        // Existing nested label. This takes the narrow text event scope.
        const label=a.model().children![0].children![0], oldText=label.runs!.map(run=>'text'in run?run.text:'').join('');
        a.edit([{op:'delete',at:[0,0,0],count:oldText.length},{op:'insert',at:[0,0,0],content:'Replaced'}]);await tick();
        assert.deepEqual(errors,[]);assert.deepEqual(a.model(),b.model());assert.deepEqual(hub.doc.toJSON(),b.model());
        assert.equal((b.model().children![0].children![0].runs![0] as {text:string}).text,'Replaced');
        a.edit([{op:'insert',at:[0,0,8],content:' label'}]);await tick();
        assert.deepEqual(errors,[]);assert.deepEqual(a.model(),b.model());assert.deepEqual(hub.doc.toJSON(),b.model());
        assert.equal((b.model().children![0].children![0].runs![0] as {text:string}).text,'Replaced label');
        const changes=events.filter(event=>event.count>0);assert.equal(changes.length,2);assert.ok(changes.every(event=>!event.fallback));
        assert.equal(a.sync!.pending.length,0);assert.equal(b.sync!.connectionError,null);
    } finally {a.clearHistory();b.clearHistory();a.dispose();b.dispose();}
});
