import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
import {createProfile,profileActor} from '../../bot/src/profiles.ts';
// @ts-expect-error The demo controller is an executable JavaScript module.
import {durableBots} from '../products/durable-bots.mjs';

test('browser controller restores profiles and fails closed for interrupted work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-browser-profiles-'));
 try{
  const mori=await createProfile(dir,{id:'mori',name:'Mori',character:'fox',personality:'curious',role:'writer',color:'#a14418'});
  const nuri=await createProfile(dir,{id:'nuri',name:'Nuri',character:'owl',personality:'careful',role:'reviewer',color:'#7051bd'});
  const origin='http://127.0.0.1:60000',url=origin+'/profiles/word',doc='sample';
  const actor=profileActor(mori,url,doc);assert.notEqual(actor,profileActor(nuri,url,doc));
  const directory=join(dir,'missions');await mkdir(directory);
  const mission={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',profileId:'mori',url,document:doc,actor,status:'running',pending:{revision:{epoch:'a',serverSeq:0,schemaVersion:'v'},plan:{action:'insert'}},createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
  await writeFile(join(directory,`${mission.id}.json`),JSON.stringify(mission));
  const completed={...mission,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'completed',pending:null,createdAt:'2025-12-01T00:00:00Z',steps:['Done']};
  await writeFile(join(directory,`${completed.id}.json`),JSON.stringify(completed));
  const controller=durableBots({root:process.cwd(),stateDir:dir,children:[]});
  const view=await controller.records('word',doc,origin);
  assert.equal(view.durable,true);assert.deepEqual(view.profiles.map((p:{id:string})=>p.id),['mori','nuri']);
  assert.equal(view.jobs[0].actor,actor);assert.equal(view.jobs[0].status,'interrupted');assert.equal(view.jobs[0].blocked,true);
  assert.deepEqual(view.history.map((entry:{id:string})=>entry.id),[mission.id,completed.id]);assert.equal(view.history[0].pending,true);assert.equal(view.history[1].pending,false);
  assert.equal('actor' in view.history[0],false);
  await assert.rejects(controller.launch({profile:'word',doc,id:'mori',mission:'Try again',origin}),/recovery inspection/);
  const unrelated=await controller.records('word','other',origin);assert.deepEqual(unrelated.jobs,[]);assert.deepEqual(unrelated.history,[]);
  const otherServer=await controller.records('word',doc,'http://127.0.0.1:60001');assert.deepEqual(otherServer.jobs,[]);assert.deepEqual(otherServer.history,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
