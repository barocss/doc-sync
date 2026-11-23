import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
const root='/Users/user/github/doc-sync-local',main='/Users/user/github/doc-sync';
const schedule=[['A1',main,'sync'],['B1',root,'local'],['B2',root,'local'],['A2',main,'sync']];
for(const [label,target,backend]of schedule){
 const {Doc}=await import(pathToFileURL(join(target,'packages/doc-sync-core/dist/index.js')).href);
 const req=createRequire(join(target,'packages/doc-sync-prosemirror/dist/index.js'));
 const {Node:PmNode}=await import(pathToFileURL(req.resolve('prosemirror-model').replace(/\/dist\/index\.cjs$/,'/dist/index.js')).href);
 const methods=[[Doc.prototype,'snapshot'],[Doc,'fromSnapshot'],[Doc.prototype,'toJSON'],[PmNode,'fromJSON']].map(([obj,key])=>[obj,key,obj[key]]);
 process.argv=[process.execPath,join(root,'benchmarks/local-client.mjs'),`--target=${target}`,`--backend=${backend}`,'--mode=timing','--reps=10','--warmups=3','--blocks=1',`--output=${root}/output/local-client/paired-${label}.json`];
 try{await import(pathToFileURL(join(root,'benchmarks/local-client.mjs')).href+`?paired=${label}`);}finally{for(const [obj,key,original]of methods)obj[key]=original;}
}
for(const [label,names]of [['A',['A1','A2']],['B',['B1','B2']]]){const reports=await Promise.all(names.map(async name=>JSON.parse(await readFile(join(root,`output/local-client/paired-${name}.json`),'utf8'))));const merged={...reports[0],rows:reports.flatMap((report,block)=>report.rows.map(row=>({...row,block}))),pairedSchedule:'A1 baseline / B1 local / B2 local / A2 baseline',processId:process.pid,inputs:names};await writeFile(join(root,`output/local-client/paired-${label}-aggregate.json`),JSON.stringify(merged,null,2)+'\n');}
