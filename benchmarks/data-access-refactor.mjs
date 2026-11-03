// Source-only paired access-layer benchmark. No package build or dist imports.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync, realpathSync, statSync, existsSync, accessSync, constants} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const baselineCommit = 'ec9622571a04a7d7ea3f967bb3e6423b17ce5194';
const options = {};
for (let i=2; i<process.argv.length; i+=2) {
    const key=process.argv[i], value=process.argv[i+1];
    if (!['--baseline-root','--output','--sizes','--rounds'].includes(key) || !value || value.startsWith('--') || key in options) throw new Error(`Invalid or duplicate option: ${key}`);
    options[key]=value;
}
for (const key of ['--baseline-root','--output']) if (!options[key]) throw new Error(`Required option: ${key}`);
const positive = value => { if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Expected positive integer: ${value}`); return Number(value); };
const sizes=(options['--sizes']??'100,1000,10000').split(',').map(positive);
const rounds=positive(options['--rounds']??'5');
const baselineRoot=realpathSync(resolve(options['--baseline-root']));
const currentRoot=fileURLToPath(new URL('../',import.meta.url));
if (baselineRoot===realpathSync(currentRoot)) throw new Error('Baseline must be an external archive, not this checkout');
const sourceRoot=join(baselineRoot,'packages/doc-sync/src');
for (const path of ['client/index.ts','data/schema.ts','data/access.ts']) if (!statSync(join(sourceRoot,path)).isFile()) throw new Error(`Missing baseline source: ${path}`);
const output=resolve(options['--output']);
if (existsSync(output)) throw new Error(`Refusing to overwrite output: ${output}`);
if (!statSync(dirname(output)).isDirectory()) throw new Error('Output parent must be a directory');
accessSync(dirname(output),constants.W_OK);
const {Client}=await import(pathToFileURL(join(sourceRoot,'client/index.ts')).href);
const {createDataSchema}=await import(pathToFileURL(join(sourceRoot,'data/schema.ts')).href);
const {createDataAccess:baseline}=await import(pathToFileURL(join(sourceRoot,'data/access.ts')).href);
const {createDataAccess:current}=await import(pathToFileURL(join(currentRoot,'packages/doc-sync/src/data/access.ts')).href);
const fileHash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const closureHashes = root => Object.fromEntries(readdirSync(root,{recursive:true}).filter(path=>path.endsWith('.ts')).sort().map(path=>[path,fileHash(join(root,path))]));
const id = n => `data:00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const summarize = values => { const sorted = values.toSorted((a,b)=>a-b); return {count: sorted.length, medianMs: sorted[Math.floor(sorted.length/2)], p95Ms: sorted[Math.ceil(sorted.length*.95)-1]}; };
const sourceHashes = {baseline:fileHash(join(sourceRoot,'data/access.ts')),current:fileHash(join(currentRoot,'packages/doc-sync/src/data/access.ts')),client:fileHash(join(sourceRoot,'client/index.ts')),benchmark:fileHash(fileURLToPath(import.meta.url)),sourceClosureHashes:{baseline:closureHashes(sourceRoot),current:closureHashes(join(currentRoot,'packages/doc-sync/src'))}};
const results = [];
for (const n of sizes) {
    console.log(`prepare N=${n}`);
    const empty = new Client({schema:createDataSchema(),actor:'data-perf'});
    const state = empty.captureState(); empty.dispose();
    // Linear bulk checkpoint seed. Avoid the model editor's repeated insert projection.
    let clock=0;
    const token = (type, dataId, after, attrs={}) => {
        const key=`${++clock}@data-perf`;
        return {i:key,o:after,k:'n',b:type,a:[['$type',type,key],['id',dataId,key],...Object.entries(attrs).map(([name,value])=>[name,value,key])]};
    };
    const head = key => ({i:key,o:null,k:'n',y:'root'});
    const listToken=token('list',id(1),'0@~root'), mapToken=token('map',id(2),listToken.i);
    const line = (parent,offset,isMap) => {
        const key=`0@${parent.i}/body`, items=[head(key)];
        for(let i=0;i<n;i++) items.push(token('entry',id(offset+i),items.at(-1).i,{...(isMap?{key:`key-${i}`}:{ }),value:{scalar:i}}));
        return {key,owner:parent.i,slot:'body',items};
    };
    const lines=[{key:'0@~root',owner:null,slot:'',items:[head('0@~root'),listToken,mapToken]},line(listToken,10,false),line(mapToken,10+n,true)];
    state.engine.document={format:2,capabilities:[],lamport:clock,lines};
    state.engine.revision=clock;
    const client=Client.fromState(state,{schema:createDataSchema()});
    console.log(`seeded N=${n}`);
    const access = [baseline(client, ()=>{}, ()=>{}), current(client, ()=>{}, ()=>{})];
    const samples = Object.fromEntries(['firstRead','cachedListAt','cachedMapSize','editAndRead'].map(k=>[k,[[],[]]]));
    let revision = 0;
    for (let round=0; round<rounds; round++) for (const lane of [0,1,1,0]) {
        console.log(`sample N=${n} round=${round} lane=${lane}`);
        globalThis.gc?.();
        const fresh = [baseline,current][lane](client, ()=>{}, ()=>{});
        let start = performance.now();
        const list = fresh.getList(id(1)), map = fresh.getMap(id(2));
        const first = list.at(n-1); const size = map.size;
        samples.firstRead[lane].push(performance.now()-start);
        assert.deepEqual(first,{id:id(9+n),value:n-1}); assert.equal(size,n);
        const data = access[lane], cachedList = data.getList(id(1)), cachedMap = data.getMap(id(2));
        // Warm each cached projection before timing.
        cachedList.at(0); void cachedMap.size;
        start=performance.now();
        for(let i=0;i<3;i++) { const value=cachedList.at(n-1); assert.equal(value.id,id(9+n)); assert.equal(value.value,n-1); }
        samples.cachedListAt[lane].push((performance.now()-start)/3);
        start=performance.now();
        for(let i=0;i<3;i++) assert.equal(cachedMap.size,n);
        samples.cachedMapSize[lane].push((performance.now()-start)/3);
        start=performance.now();
        client.edit([{op:'update',at:[0,0],attrs:{value:{scalar:++revision}}}],null);
        const edited=cachedList.at(0); const afterSize=cachedMap.size;
        samples.editAndRead[lane].push(performance.now()-start);
        assert.deepEqual(edited,{id:id(10),value:revision}); assert.equal(afterSize,n);
    }
    results.push({n,metrics:Object.fromEntries(Object.entries(samples).map(([key,lanes])=>[key,{baseline:summarize(lanes[0]),current:summarize(lanes[1])}]))});
    // Full independent seed-formula oracles. Excluded from every timed interval.
    assert.deepEqual(access[0].getList(id(1)).entries(), Array.from({length:n},(_,i)=>({id:id(10+i),value:i===0?revision:i})));
    assert.deepEqual(access[1].getList(id(1)).entries(), access[0].getList(id(1)).entries());
    const expectedMap=Array.from({length:n},(_,i)=>[`key-${i}`,i]).sort(([a],[b])=>a<b?-1:a>b?1:0);
    for (const data of access) assert.deepEqual(data.getMap(id(2)).entries(),expectedMap);
    client.dispose();
}
const report={node:process.version, gc:!!globalThis.gc, order:`ABBA x ${rounds}`, cli:{argv:process.argv.slice(2),execArgv:process.execArgv,nodeOptions:process.env.NODE_OPTIONS??null,options,sizes,rounds,baselineRoot,output}, baselineProvenance:'Caller-provided external git archive of baselineCommit; hashes record exact source bytes. No git or checkout mutation in benchmark.', unit:'milliseconds per operation', cachedBatch:3, baselineCommit, hashes:sourceHashes, scope:'Baseline and current source access layers use the SAME archived baseline Client instance and archived createDataSchema. Shared linear checkpoint seed and sequential edits in ABBA order; firstRead uses a fresh access layer on that same Client. Full list and map seed-formula oracles run after timing. FirstRead includes projection; editAndRead includes edit plus projection. Assertions outside projection timings; cached assertion overhead included equally. Heap allocations not inferred from retained heap.', results};
writeFileSync(output, JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
