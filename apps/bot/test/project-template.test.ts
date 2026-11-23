import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Doc, History, schemaVersion} from '@barocss/doc-sync';
import type {Schema} from '@barocss/doc-sync';
import {projectProposalTemplate} from '../src/project-template.ts';
import {verifyBrief} from '../src/brief.ts';
const roles=['title','problem','objectives','approach','successCriteria'] as const;
const schema:Schema={root:'proposal',marks:[],nodes:{proposal:{shape:'flow',children:['heading','body'],default:'body'},heading:{shape:'text'},body:{shape:'text'}}};
function input(){return {schema:structuredClone(schema),mapping:{title:'heading',problem:'body',objectives:'body',approach:'body',successCriteria:'body'},inputs:{title:'Shared draft pilot',problem:'Reviewers duplicate edits.',objectives:'Keep one shared draft.',approach:'Run one synthetic pilot.',successCriteria:'Preserve both participants’ edits.'}};}
const context={epoch:'local',serverSeq:0,schemaVersion:schemaVersion(schema)};
test('project proposal retains exactly five supplied sections with detached deterministic checks',()=>{
 const source=input(),before=structuredClone(source),result=projectProposalTemplate(source);
 assert.equal(result.status,'ready');if(result.status!=='ready')return;
 assert.deepEqual(source,before);assert.equal(result.schemaVersion,context.schemaVersion);
 assert.deepEqual(result.draft,{type:'proposal',children:roles.map(role=>({type:source.mapping[role],runs:[{text:source.inputs[role],marks:{}}]}))});
 assert.equal(result.brief.requirements.length,6);
 assert.equal(verifyBrief(result.brief,result.draft,schema,context).status,'passed');
 result.draft.children![4].runs=[{text:'Invented deadline',marks:{}}];
 assert.equal(verifyBrief(result.brief,result.draft,schema,context).status,'failed');
 assert.deepEqual(source,before);
});
test('missing project facts remain requirements, not fabricated goals or commitments',()=>{
 for(const role of roles)for(const value of [undefined,'',' ',1,'x'.repeat(8193)]){
  const source=input() as any;source.inputs[role]=value;
  const result=projectProposalTemplate(source);assert.equal(result.status,'needs_input');
  if(result.status==='needs_input')assert.ok(result.requirements.some(r=>r.startsWith(`inputs.${role}:`)));
 }
 assert.equal(projectProposalTemplate(null).status,'needs_input');
});
test('project mappings are explicit and unsupported schemas do not silently substitute',()=>{
 for(const role of roles){const source=input();source.mapping[role]='unknown';assert.equal(projectProposalTemplate(source).status,'needs_input');}
 for(const change of [(x:any)=>x.schema.nodes.body.text=false,(x:any)=>x.schema.nodes.proposal.childRules={body:{min:1}},(x:any)=>x.schema.nodes.proposal.shape='container',(x:any)=>x.schema.root='missing']){
  const source=input();change(source);assert.equal(projectProposalTemplate(source).status,'needs_input');
 }
});
test('wrong section order or dropped section cannot satisfy project completion',()=>{
 const result=projectProposalTemplate(input());assert.equal(result.status,'ready');if(result.status!=='ready')return;
 const reversed=structuredClone(result.draft);reversed.children!.reverse();
 assert.equal(verifyBrief(result.brief,reversed,schema,context).status,'failed');
 const missing=structuredClone(result.draft);missing.children!.pop();
 assert.equal(verifyBrief(result.brief,missing,schema,context).status,'failed');
});
test('project insertion undo and redo preserve a concurrent participant edit',()=>{
 const result=projectProposalTemplate(input());assert.equal(result.status,'ready');if(result.status!=='ready')return;
 const a=new Doc('writer',schema),history=new History();a.edit([{op:'insert',at:[0,0],content:'peer'}]);
 const b=Doc.fromSnapshot('peer',a.snapshot(),schema);
 const inserted=a.edit([{op:'insert',at:[1],content:result.draft.children!}]).ops;history.record(inserted,a,{caretBefore:'',caretAfter:''});
 const concurrent=b.edit([{op:'insert',at:[0,4],content:' preserved'}]).ops;
 inserted.forEach(op=>b.apply(op));concurrent.forEach(op=>a.apply(op));
 history.undo(a).ops.forEach(op=>b.apply(op));assert.deepEqual(a.toJSON(),b.toJSON());
 assert.deepEqual(a.toJSON().children!.map(n=>(n.runs??[]).map(r=>'text'in r?r.text:'').join('')),['peer preserved']);
 history.redo(a).ops.forEach(op=>b.apply(op));assert.deepEqual(a.toJSON(),b.toJSON());
 assert.equal(a.toJSON().children!.length,6);assert.equal(a.toJSON().children![1].type,'heading');
});
test('template-project CLI works offline and exits nonzero for missing facts',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const dir=await mkdtemp(join(tmpdir(),'project-template-'));const file=join(dir,'input.json');
 const run=()=>promisify(execFile)(process.execPath,['src/main.ts','template-project','--input',file],{cwd:new URL('..',import.meta.url).pathname.replace(/test\/$/,''),timeout:10000});
 try {await writeFile(file,JSON.stringify(input()));const output=JSON.parse((await run()).stdout);assert.equal(output.status,'ready');assert.equal(output.draft.children.length,5);
  const source=input();source.inputs.successCriteria='';await writeFile(file,JSON.stringify(source));
  await assert.rejects(run(),(error:any)=>error.code===1&&JSON.parse(error.stdout).status==='needs_input');
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('published project JSON example creates the documented five-section draft',async()=>{
 const {readFile}=await import('node:fs/promises');
 const guide=await readFile(new URL('../../docs/src/guide/bots.md',import.meta.url),'utf8');
 const section=guide.split('## Prepare a project proposal without a model call')[1]!;
 const match=section.match(/```json\n([\s\S]*?)\n```/);assert.ok(match);
 const result=projectProposalTemplate(JSON.parse(match[1]!));assert.equal(result.status,'ready');
 if(result.status==='ready'){assert.equal(result.draft.children!.length,5);assert.equal(result.brief.requirements.length,6);}
});
