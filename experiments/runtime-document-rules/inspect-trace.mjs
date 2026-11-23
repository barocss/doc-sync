// Inspect preserved failed output. This is diagnostic only and never grants a source-frozen PASS.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]);
const ts=JSON.parse(readFileSync(resolve(out,'typescript-trace.json'))),native=JSON.parse(readFileSync(resolve(out,'native.stdout')));
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const model=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>('text'in r||'units'in r)?{units:r.units??units(r.text),marks:r.marks??{}}:model(r))});
const wire=op=>op.t==='text'?{...Object.fromEntries(Object.entries(op).filter(([k])=>k!=='text')),units:op.units??units(op.text),marks:op.marks??{}}:op.t==='node'?{...op,boundary:op.boundary??'',attrs:op.attrs??{}}:op;
const mismatches=[];
for(let i=0;i<ts.documents.length;i++){const a=native.documents[i],b=ts.documents[i];if(!a)continue;for(let j=0;j<b.trace.length;j++){const x=a.trace[j],y=b.trace[j],ctx=`${b.name}/${y.label}`;const cmp=(field,n,t)=>{try{assert.deepEqual(n,t);}catch(e){mismatches.push({ctx,field,native:n,typescript:t,diff:e.message});}};cmp('ops',x.ops.map(wire),y.ops.map(wire));cmp('selection',x.selection,y.selection);for(const actor of ['A','B']){cmp(actor+' model',model(x[actor].model),model(y[actor].model));cmp(actor+' History',x[actor].history,y[actor].history);cmp(actor+' clock',x[actor].state.clock,y[actor].clock);}if(mismatches.length&&!process.argv.includes('--all'))break;}if(mismatches.length&&!process.argv.includes('--all'))break;}
const report={status:mismatches.length?'MISMATCH':'NO_MISMATCH_IN_DIAGNOSTIC_FIELDS',qualification:'DIAGNOSTIC_ONLY',mismatches};writeFileSync(resolve(out,'diagnostic-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,first:mismatches.map(({ctx,field,diff})=>({ctx,field,diff})).filter((m,i,a)=>a.findIndex(x=>x.field===m.field)===i).map(m=>({...m,diff:m.diff.slice(0,2500)}))},null,2));
