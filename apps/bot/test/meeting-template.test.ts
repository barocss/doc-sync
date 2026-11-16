import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc,History,schemaVersion} from '@barocss/doc-sync';
import type {Schema} from '@barocss/doc-sync';
import {meetingNotesTemplate} from '../src/meeting-template.ts';
import {verifyBrief} from '../src/brief.ts';
const schema:Schema={root:'notes',marks:[],nodes:{notes:{shape:'flow',children:['line','subject'],default:'line'},line:{shape:'text'},subject:{shape:'text'}}};
const input=()=>({schema, mapping:{title:'subject',summary:'line',decisions:'line',actions:'line'},inputs:{title:'Weekly meeting',summary:'Reviewed prototype',decisions:'No decisions recorded',actions:'Alex: test editor'}});
test('explicit custom schema mapping creates a detached verifiable draft',()=>{
 const source=input(),before=structuredClone(source),result=meetingNotesTemplate(source);assert.equal(result.status,'ready');if(result.status!=='ready')return;
 assert.deepEqual(source,before);assert.equal(result.schemaVersion,schemaVersion(schema));
 assert.equal(verifyBrief(result.brief,result.draft,schema,{epoch:'e',serverSeq:0,schemaVersion:result.schemaVersion}).status,'passed');
 result.draft.children![0].runs=[{text:'invented',marks:{}}];assert.equal(source.inputs.title,'Weekly meeting');
 assert.equal(verifyBrief(result.brief,result.draft,schema,{epoch:'e',serverSeq:0,schemaVersion:result.schemaVersion}).status,'failed');
});
test('missing facts and invalid text are actionable, never invented',()=>{
 for(const value of [undefined,'', ' ',42,'a'.repeat(8193)]){const source=input() as any;source.inputs.actions=value;const result=meetingNotesTemplate(source);assert.equal(result.status,'needs_input');if(result.status==='needs_input')assert.ok(result.requirements.some(x=>x.startsWith('inputs.actions:')));}
});
test('unsupported schema mappings refuse rather than substitute types',()=>{
 for(const mutate of [(s:any)=>s.mapping.title='unknown',(s:any)=>s.schema.nodes.subject.text=false,(s:any)=>s.schema.nodes.notes.childRules={line:{min:1}},(s:any)=>s.schema.root='absent']){const source=structuredClone(input());mutate(source);assert.equal(meetingNotesTemplate(source).status,'needs_input');}
 assert.equal(meetingNotesTemplate(null).status,'needs_input');
});
test('draft insertion undo preserves a second actor change and redo restores template',()=>{
 const result=meetingNotesTemplate(input());assert.equal(result.status,'ready');if(result.status!=='ready')return;
 const a=new Doc('A',schema),ha=new History();const initial=a.edit([{op:'insert',at:[0,0],content:'peer base'}]).ops;
 const b=Doc.fromSnapshot('B',a.snapshot(),schema);
 const ops=a.edit([{op:'insert',at:[1],content:result.draft.children!}]).ops;ha.record(ops,a,{caretBefore:'',caretAfter:''});
 const peer=b.edit([{op:'insert',at:[0,9],content:' preserved'}]).ops;
 ops.forEach(op=>b.apply(op));peer.forEach(op=>a.apply(op));
 ha.undo(a).ops.forEach(op=>b.apply(op));assert.deepEqual(a.toJSON(),b.toJSON());assert.ok(JSON.stringify(a.toJSON()).includes('peer base preserved'));
 ha.redo(a).ops.forEach(op=>b.apply(op));assert.deepEqual(a.toJSON(),b.toJSON());assert.ok(JSON.stringify(a.toJSON()).includes('Weekly meeting'));
 assert.ok(initial.length>0);
});

test('CLI emits a template without a server or provider',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const dir=await mkdtemp(join(tmpdir(),'meeting-fixture-'));
 try {const file=join(dir,'input.json');await writeFile(file,JSON.stringify(input()));
 const {stdout}=await promisify(execFile)(process.execPath,['src/main.ts','template-meeting','--input',file],{cwd:new URL('..',import.meta.url).pathname.replace(/test\/$/,''),timeout:10000});
 assert.equal(JSON.parse(stdout).status,'ready');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('noncanonical schema metadata returns actionable requirements',()=>{
 const source=structuredClone(input()) as any;source.schema.nodes.line.ui={weight:Infinity};
 assert.equal(meetingNotesTemplate(source).status,'needs_input');
});
