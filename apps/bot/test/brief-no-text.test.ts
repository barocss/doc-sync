/** Malformed-evidence hardening, not a claim that canonical server models emit forbidden text. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {schemaVersion,type Schema} from '@barocss/doc-sync';
import {verifyBrief,type Requirement} from '../src/brief.ts';
const schema=(acceptsText:boolean):Schema=>({root:'root',marks:[],markValues:{link:{default:''}},nodes:{root:{shape:'flow',children:['label'],default:'label'},label:{shape:'text',children:['link'],text:acceptsText},link:{shape:'span',mark:'link',attr:'url'}}});
function verify(s:Schema,runs:unknown[],requirement:Requirement){return verifyBrief({version:1,objective:'Check synthetic evidence',requirements:[requirement]},{type:'root',children:[{type:'label',runs}]},s,{epoch:'synthetic',serverSeq:1,schemaVersion:schemaVersion(s)});}
const exact=(text:string):Requirement=>({id:'exact',kind:'exact_text',path:[0],text});
const occurrence=(text:string,count:number):Requirement=>({id:'count',kind:'text_occurrences',path:[0],text,count});
for(const depth of [0,1,3])test(`no-text rejects nonempty malformed raw text at span depth ${depth}`,()=>{
 const s=schema(false);let runs:unknown[]=[{text:'forbidden',marks:{}}];for(let i=0;i<depth;i++)runs=[{type:'link',attrs:{url:'https://example.com'},runs}];
 const original=JSON.stringify(runs);assert.equal(verify(s,runs,exact('forbidden')).status,'failed');assert.equal(verify(s,runs,occurrence('forbidden',1)).status,'failed');assert.equal(JSON.stringify(runs),original);
});
for(const runs of [[],[{text:'',marks:{}}],[{type:'link',attrs:{url:''},runs:[{text:'',marks:{}}]}]])test(`no-text empty runs remain valid: ${JSON.stringify(runs)}`,()=>{
 const s=schema(false);assert.equal(verify(s,runs,exact('')).status,'passed');assert.equal(verify(s,runs,occurrence('missing',0)).status,'passed');
});
test('ordinary text-enabled node retains direct and nested span exact-text behavior',()=>{
 const s=schema(true),runs=[{text:'Hello ',marks:{}},{type:'link',attrs:{url:'https://example.com'},runs:[{text:'world',marks:{}}]}];
 assert.equal(verify(s,runs,exact('Hello world')).status,'passed');assert.equal(verify(s,runs,occurrence('world',1)).status,'passed');assert.equal(verify(s,runs,exact('wrong')).status,'failed');
});
test('text omitted retains default text acceptance',()=>{
 const s=schema(true);delete (s.nodes.label as {text?:boolean}).text;assert.equal(verify(s,[{text:'Allowed',marks:{}}],exact('Allowed')).status,'passed');
});
