import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc} from '@barocss/doc-sync';
import {SyncClient} from '@barocss/doc-sync/sync';
import {createEditor,$getRoot,$createParagraphNode,$createTextNode} from 'lexical';
import {TableNode,TableRowNode,TableCellNode,$createTableNodeWithDimensions} from '@lexical/table';
import {InputSession,slateModelPoint,slateNativePoint,lexicalBlocks,lexicalModelPoint,lexicalNativePoint} from '../input-session.mjs';
import {schema,canon,editsFor,commitModelEdits,toSlate} from '../model.mjs';
const paragraph=text=>({type:'paragraph',runs:text?[{text,marks:{}}]:[]});
const model=(text,tail='tail')=>canon({type:'content',children:[paragraph(text),paragraph(tail)]});
const text=doc=>doc.toJSON().children.map(n=>(n.runs??[]).map(r=>r.text).join('')).join('\n');
function setup(){
  const client=new SyncClient('local',{subscribe:()=>()=>{},send:async()=>{}},{schema});
  client.doc.edit([{op:'insert',at:[0,0],content:'abcdefgh'},{op:'insert',at:[1],content:[paragraph('tail')]}]);
  const remote=Doc.fromSnapshot('remote',client.doc.snapshot(),schema),session=new InputSession(client);
  return{client,remote,session,receive:edits=>{const ops=remote.edit(edits).ops;ops.forEach(op=>client.doc.apply(op));return ops;}};
}
function native(session,next){const doc=session.doc,before=doc.toJSON();const ops=commitModelEdits(doc,before,editsFor(before,next));session.commit(ops);}
for(const [name,range,edits,expected]of[
  ['prefix',{anchor:[0,4],focus:[0,4]},[{op:'insert',at:[0,0],content:'R'}],{anchor:[0,5],focus:[0,5]}],
  ['suffix',{anchor:[0,4],focus:[0,4]},[{op:'insert',at:[0,8],content:'R'}],{anchor:[0,4],focus:[0,4]}],
  ['delete-before',{anchor:[0,4],focus:[0,4]},[{op:'delete',at:[0,0],count:1}],{anchor:[0,3],focus:[0,3]}],
  ['delete-anchor',{anchor:[0,4],focus:[0,4]},[{op:'delete',at:[0,2],count:3}],{anchor:[0,2],focus:[0,2]}],
  ['forward',{anchor:[0,2],focus:[0,6]},[{op:'insert',at:[0,0],content:'R'}],{anchor:[0,3],focus:[0,7]}],
  ['backward',{anchor:[0,6],focus:[0,2]},[{op:'insert',at:[0,0],content:'R'}],{anchor:[0,7],focus:[0,3]}],
  ['split',{anchor:[0,4],focus:[0,4]},[{op:'split',at:[0,2]}],{anchor:[1,2],focus:[1,2]}],
  ['format',{anchor:[0,4],focus:[0,4]},[{op:'update',at:[0,1],length:2,attrs:{bold:true}}],{anchor:[0,4],focus:[0,4]}],
])test(`token selection survives ${name}`,()=>{const {session,receive}=setup(),saved=session.capture(range);receive(edits);assert.deepEqual(session.resolve(saved),expected);});

for(const [name,edit,expected]of[
  ['prefix',{op:'insert',at:[0,0],content:'R'},'Rabcd한efgh\ntail'],
  ['same-boundary',{op:'insert',at:[0,4],content:'R'},'abcdR한efgh\ntail'],
  ['other-paragraph',{op:'insert',at:[1,0],content:'R'},'abcd한efgh\nRtail'],
])test(`composition preserves ${name} remote edit and undoes as one group`,()=>{
  const {session,client,remote,receive}=setup();session.begin();
  native(session,model('abcdㅎefgh'));receive([edit]);
  native(session,model('abcd하efgh'));native(session,model('abcd한efgh'));
  assert.equal(client.pending.length,0,'preedit is not sent as a complete user edit');
  const saved=session.capture({anchor:[0,5],focus:[0,5]}),ops=session.end();
  ops.forEach(op=>remote.apply(op));
  const actual=text(client.doc);
  assert.ok(actual===expected||(name==='same-boundary'&&actual==='abcd한Refgh\ntail'));
  assert.deepEqual(client.doc.toJSON(),remote.toJSON());
  assert.equal(client.pending.length,1);assert.ok(session.resolve(saved));
  client.undo();assert.equal(text(client.doc),expected.replace('한',''));
  client.redo();assert.equal(text(client.doc),actual);
});
test('composition cancellation and reset discard drafts without resurrecting text',()=>{
  const {session,client}=setup();session.begin();native(session,model('abcd한efgh'));session.cancel();
  assert.equal(text(client.doc),'abcdefgh\ntail');assert.equal(client.pending.length,0);
  session.begin();native(session,model('abcd한efgh'));client.doc=new Doc(client.actor,schema);session.cancel();
  assert.deepEqual(session.end(),[]);assert.equal(text(client.doc),'');
});
test('local composition IDs observe later remote clocks and facade keeps transport state live',()=>{
  const {session,client,receive}=setup(),facade=session.bindingClient();session.begin();
  receive([{op:'insert',at:[1,0],content:'x'.repeat(40)}]);
  const clock=client.doc.clock.lamport;
  const ops=session.doc.edit([{op:'insert',at:[0,4],content:'한😀'}]).ops;
  assert.ok(ops[0].id.lamport>clock);facade.commit(ops,{caretBefore:'',caretAfter:'',typing:true});
  assert.notEqual(facade.doc,client.doc);session.end();assert.equal(facade.doc,client.doc);
  assert.equal(client.pending.length,1);assert.ok(text(client.doc).includes('abcd한😀efgh'));
});
test('draft tickets stay distinct from live undo and later input after cancellation',()=>{
  const {session,client}=setup();
  client.commit(client.doc.edit([{op:'insert',at:[0,8],content:'X'}]).ops);
  session.begin();
  const draft=session.doc.edit([{op:'insert',at:[0,4],content:'한😀'}]).ops;
  session.commit(draft);
  const draftEnd=draft[0].id.lamport+draft[0].text.length-1;
  client.undo();
  const undo=client.pending.at(-1).ops;
  assert.ok(undo[0].at.lamport>draftEnd,'live undo must not reuse a staged actor ticket');
  session.cancel();
  const next=client.doc.edit([{op:'insert',at:[0,0],content:'Z'}]).ops;
  assert.ok(next[0].id.lamport>undo[0].at.lamport);
});
test('a reconnect snapshot cannot release tickets reserved by an active draft',()=>{
  let receive;
  const client=new SyncClient('local',{subscribe:(_since,fn)=>{receive=fn;return()=>{};},send:async()=>{}},{schema,ackDelay:0});
  client.commit(client.doc.edit([{op:'insert',at:[0,0],content:'baseX'}]).ops);
  const session=new InputSession(client);
  const accepted=client.doc.snapshot();
  let snapshotUpdates=0;
  client.onModelEvents=(_events,info)=>{if(info.cause==='snapshot')snapshotUpdates++;};
  client.onUpdate=()=>session.reserveClock();
  client.connect();
  session.begin();
  const draft=session.doc.edit([{op:'insert',at:[0,4],content:'한'}]).ops;
  session.commit(draft);
  receive({type:'hello',serverSeq:1,snapshot:accepted,clientSeqs:[['local',1]],delSeqs:[],presence:[]});
  assert.equal(snapshotUpdates,0,'equal models skip onModelEvents but still call onUpdate');
  client.undo();
  assert.ok(client.pending.at(-1).ops[0].at.lamport>draft[0].id.lamport);
  session.end();
  assert.ok(text(client.doc).includes('한'));
  assert.ok(!text(client.doc).includes('X'));
  client.disconnect();
});
test('Slate positions cross formatted leaves and UTF-16 emoji offsets',()=>{
  const children=toSlate(canon({type:'content',children:[{type:'paragraph',runs:[{text:'a😀',marks:{}},{text:'bc',marks:{bold:true}}]}]}));
  assert.deepEqual(slateModelPoint(children,{path:[0,1],offset:1}),[0,4]);
  assert.deepEqual(slateNativePoint(children,[0,4]),{path:[0,1],offset:1});
  assert.equal(slateNativePoint(children,[9,4]),null);
});
test('Lexical maps formatted text and table cell-body paths using real nodes',()=>{
  const editor=createEditor({nodes:[TableNode,TableRowNode,TableCellNode],onError:error=>{throw error;}});
  editor.update(()=>{
    const a=$createTextNode('a😀'),b=$createTextNode('bc').toggleFormat('bold');
    $getRoot().append($createParagraphNode().append(a,b),$createTableNodeWithDimensions(1,1,false));
    const blocks=lexicalBlocks($getRoot());
    assert.deepEqual(lexicalModelPoint(blocks,{key:b.getKey(),offset:1}),[0,4]);
    assert.deepEqual(lexicalNativePoint(blocks,[0,4]),{key:b.getKey(),offset:1,type:'text'});
    assert.deepEqual(blocks[1].path,[1,0,0,0,0]);
    assert.equal(lexicalNativePoint(blocks,[1,0,0,0,0,0]).offset,0);
    blocks[1].node.clear();
    assert.equal(lexicalNativePoint(blocks,[1,0,0,0,0,0]).type,'element');
  },{discrete:true});
});
