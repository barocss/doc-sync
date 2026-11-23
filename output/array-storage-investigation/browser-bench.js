(async () => {
 const rows=[]; let sink=0;
 const quant=(a,p)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1];
 function sample(name,n,ops,fn){
  for(let w=0;w<3;w++) sink+=fn();
  const times=[];for(let r=0;r<11;r++){const t=performance.now();sink+=fn();times.push(performance.now()-t);}
  rows.push({name,n,ops,medianMs:quant(times,.5),p95Ms:quant(times,.95),medianNsPerOp:quant(times,.5)*1e6/ops,timesMs:times});
 }
 for(const n of [10000,100000,1000000]){
  const a=[];for(let i=0;i<n;i++)a.push({id:i,key:String(i)+'@bench',kind:'char',ch:'x',origin:i-1,index:i});
  const idx=new Uint32Array(1000000);let seed=17;for(let i=0;i<idx.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;idx[i]=seed%n;}
  sample('direct-sequential',n,1000000,()=>{let s=0;for(let i=0;i<1000000;i++)s+=a[i%n].id;return s;});
  sample('direct-random',n,1000000,()=>{let s=0;for(let i=0;i<idx.length;i++)s+=a[idx[i]].id;return s;});
  const lookupCount=n===10000?4096:n===100000?1024:128; const targets=[];for(let i=0;i<lookupCount;i++)targets.push(a[idx[i]]);
  sample('array-indexOf-random-existing',n,lookupCount,()=>{let s=0;for(const t of targets)s+=a.indexOf(t);return s;});
  const middle=n>>>1,marker={id:-1,key:'-1',kind:'char',ch:'y',origin:0,index:middle};
  const spliceCount=n===10000?4096:n===100000?1024:128; sample('middle-insert-remove-pair',n,spliceCount,()=>{let s=0;for(let i=0;i<spliceCount;i++){a.splice(middle,0,marker);s+=a[middle].id;a.splice(middle,1);}return s;});
  if(a.length!==n||a[middle].id!==middle)throw Error('restore failure');
  // Explicit linked-list traversal: node objects are separate allocations; no array internals implied.
  let head=null;for(let i=n-1;i>=0;i--)head={id:i,next:head};
  const listCount=n===10000?256:n===100000?32:8; sample('linked-list-locate-middle',n,listCount,()=>{let s=0;for(let q=0;q<listCount;q++){let p=head;for(let i=0;i<middle;i++)p=p.next;s+=p.id;}return s;});
 }
 globalThis.arrayBench={ua:navigator.userAgent,at:new Date().toISOString(),warmups:3,samples:11,p95Definition:'nearest rank; 11 samples => maximum; descriptive only',sink,rows};
 return globalThis.arrayBench;
})()
