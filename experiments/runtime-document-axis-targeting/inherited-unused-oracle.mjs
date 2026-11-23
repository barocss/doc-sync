import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
const root=new URL('../../',import.meta.url).pathname;
const binary=resolve(root,process.env.UNUSED_ORACLE_BINARY??'output/rust-d2-unused-2026-11-04/native-target/debug/doc-sync-rust-shadow');
const out=resolve(root,'output/rust-d3-axis-targeting-2026-11-05/compare-regression-unused-oracle/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const sourcePaths=[binary,new URL(import.meta.url).pathname,resolve(root,'fixtures/product-schemas.ts'),...['doc','schema','schema-version'].map(p=>resolve(root,'packages/doc-sync/dist/crdt/'+p+'.js'))];
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const invoke=(schema,requests)=>{const run=spawnSync(binary,[],{input:requests.map(r=>JSON.stringify({...r,replica:'r',schema:checkSchema(schema).length?'invalid-schema-probe':schemaVersion(schema)})).join('\n')+'\n',encoding:'utf8'});assert.equal(run.status,0,run.stderr);return run.stdout.trim().split('\n').map(JSON.parse);};
const fresh=s=>({cmd:'new',actor:'A',runtimeSchema:s});
const base=()=>({root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}});
const model=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>'text'in r||'units'in r?{units:r.units??Array.from({length:r.text.length},(_,i)=>r.text.charCodeAt(i)),marks:r.marks??{}}:model(r))});
const t=(lamport,actor='A')=>({lamport,actor}),head=t(0,'~root');
const node=(type,id=1,origin=head)=>({t:'node',id:t(id),origin,type,boundary:origin.lamport+'@'+origin.actor+'|end'});
const set=(type,id=1,target=head)=>({t:'set',at:t(id),ids:[target],key:'$type',value:type});
const cases=[];const add=(name,extra,tsValid,nativeAccepted)=>cases.push({name,schema:{...base(),nodes:{...base().nodes,...extra}},tsValid,nativeAccepted});
add('unused boolean span without value declaration',{unusedSpan:{shape:'span',mark:'bold',attr:'value'}},false,false);
add('unused atom',{unused:{shape:'atom'}},true,true);
add('unused text next cycle',{x:{shape:'text',next:'y'},y:{shape:'text',next:'x'}},true,true);
add('unused optional flow cycle',{x:{shape:'flow',children:['p','y'],default:'p'},y:{shape:'flow',children:['p','x'],default:'p'}},true,true);
add('unused required flow cycle',{x:{shape:'flow',children:['p','y'],default:'p',childRules:{y:{min:1}}},y:{shape:'flow',children:['p','x'],default:'p',childRules:{x:{min:1}}}},false,false);
add('unused missing child',{x:{shape:'flow',children:['absent'],default:'absent'}},false,false);
add('unused bad next',{x:{shape:'text',next:'absent'}},false,false);
add('unused malformed grid',{x:{shape:'grid',children:['p']}},false,false);
add('unused malformed group',{x:{shape:'group',children:['p'],by:['absent']}},false,false);
add('unused reserved name',{'$bad':{shape:'atom'}},false,false);
add('unused malformed text flag',{x:{shape:'text',text:'false'}},true,false);
add('unused regex strict subset',{x:{shape:'atom',attrs:{v:{default:'a',pattern:'a+'}}}},true,false);
const grid={unusedGrid:{shape:'grid',children:['unusedRow']},unusedRow:{shape:'row',children:['unusedCell']},unusedCell:{shape:'cell',children:['unusedBody']},unusedBody:{shape:'flow',children:['p'],default:'p'}};
add('unused valid grid',grid,true,true);add('unused valid group',{unusedGroup:{shape:'group',children:['unusedItem'],by:[]},unusedItem:{shape:'text'}},true,true);
let failure=null;const schemaResults=[],placementResults=[],metamorphic=[];let before;
try{before=hashes();for(const c of cases){const problems=checkSchema(c.schema),response=invoke(c.schema,[fresh(c.schema)])[0];assert.equal(problems.length===0,c.tsValid,c.name+' TS validity');assert.equal(response.ok,c.nativeAccepted,c.name+JSON.stringify(response));schemaResults.push({...c,problems,response,boundary:c.tsValid&&!c.nativeAccepted?'native strict subset':'schema admission'});}
for(const [name,schema,unused]of [['word',WORD_SCHEMA,'divider'],['presentation',PRESENTATION_SCHEMA,'heading1'],['flat-unused-atom',{...base(),nodes:{...base().nodes,orphan:{shape:'atom'}}},'orphan'],['flat-unused-text',{...base(),nodes:{...base().nodes,orphan:{shape:'text'}}},'orphan']]){
 assert.deepEqual(checkSchema(schema),[]);const registered=schema.nodes[unused];assert(registered);
 const scenarios=[['unused root node',[node(unused)],false],['unused root type',[set(unused)],false],['known wrong parent',[node(name==='word'?'heading1':name==='presentation'?'image':unused)],false],['raw batch valid prefix then unused node',[{t:'text',id:t(1),origin:head,text:'ok'},node(unused,3,t(2))],false],['root allowed paragraph',[node(schema.root==='doc'?'p':'paragraph')],true]];
 for(const[label,ops,accepted]of scenarios){const d=new Doc('A',schema),snapshot=d.snapshot(),problem=d.check(ops);assert.equal(problem===null,accepted,name+'/'+label+' TS placement');assert.deepEqual(d.snapshot(),snapshot);const wire=ops.map(o=>o.t==='text'?{...Object.fromEntries(Object.entries(o).filter(([k])=>k!=='text')),units:[111,107],marks:{}}:{...o,...(o.t==='node'?{attrs:{}}:{})});const r=invoke(schema,[fresh(schema),{cmd:'snapshot'},{cmd:'apply',ops:wire},{cmd:'snapshot'}]);assert.equal(r[0].ok,true);assert.equal(r[2].ok,accepted,name+'/'+label+JSON.stringify(r[2]));if(!accepted)assert.deepEqual(r[3].snapshot,r[1].snapshot,name+'/'+label+' atomic reject');placementResults.push({name,label,ops,problem,accepted,responses:r});}
}
for(const extra of [{},grid,{unusedGroup:{shape:'group',children:['unusedItem'],by:[]},unusedItem:{shape:'text'}}]){const schema={...base(),nodes:{...base().nodes,...extra}},d=new Doc('A',schema);const ops=d.edit([{op:'insert',at:[0,0],content:'ab😀'}]).ops;const wire=ops.map(o=>o.t==='text'?{...Object.fromEntries(Object.entries(o).filter(([k])=>k!=='text')),units:Array.from({length:o.text.length},(_,i)=>o.text.charCodeAt(i)),marks:{}}:o);const r=invoke(schema,[fresh(schema),{cmd:'apply',ops:wire},{cmd:'snapshot'}]);assert.equal(r[1].ok,true,JSON.stringify(r));const row={identity:schemaVersion(schema),ops,typescriptModel:d.toJSON(),nativeModel:r[1].state.model,nativeSnapshot:r[2].snapshot};if(metamorphic.length){assert.notEqual(row.identity,metamorphic[0].identity);assert.deepEqual(row.ops,metamorphic[0].ops);assert.deepEqual(row.typescriptModel,metamorphic[0].typescriptModel);assert.deepEqual(row.nativeModel,metamorphic[0].nativeModel);}metamorphic.push(row);}
assert.deepEqual(hashes(),before);
}catch(e){failure=e.stack;console.error(failure);process.exitCode=1;}
writeFileSync(resolve(out,'results.json'),JSON.stringify({schemaResults,placementResults,metamorphic},null,2)+'\n');writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:failure?'FAIL':'PASS',schemaCases:schemaResults.length,placementCases:placementResults.length,metamorphicVariants:metamorphic.length,hashesBefore:before,hashesAfter:hashes(),failure,scope:'Schema registry admission, exact original product wrong-parent placement and atomic raw batch rejection, plus active-root TS authored operations applied to native with unused grid/group. Metamorphic native SDK authoring is tested separately by SDK suite. No full product authoring claim.'},null,2)+'\n');console.log(JSON.stringify({status:failure?'FAIL':'PASS',out,schemaCases:schemaResults.length,placementCases:placementResults.length,metamorphicVariants:metamorphic.length}));
