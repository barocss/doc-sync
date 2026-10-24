import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const root=process.cwd(),args=process.argv.slice(2),i=args.indexOf('--receipt');
if(i<0||!args[i+1])throw new Error('Provide a fresh --receipt path');
const receipt=resolve(args[i+1]),copy=mkdtempSync(join(tmpdir(),'doc-sync-structural-browser-before-')),baseline='d46db51b75120539d1f649e4025800b7c96b7506';
execFileSync('tar',['-x','-C',copy],{input:execFileSync('git',['archive',baseline,'package.json','tsconfig.base.json','tsconfig.json','packages/doc-sync','apps/demo','fixtures'],{maxBuffer:32*1024*1024}),maxBuffer:32*1024*1024});
mkdirSync(join(copy,'node_modules'));
for(const name of readdirSync(join(root,'node_modules'))){
 if(name==='@barocss'){
  mkdirSync(join(copy,'node_modules',name));
  for(const pkg of readdirSync(join(root,'node_modules',name)))symlinkSync(pkg==='doc-sync'?join(copy,'packages/doc-sync'):join(root,'node_modules',name,pkg),join(copy,'node_modules',name,pkg),'dir');
 }else symlinkSync(join(root,'node_modules',name),join(copy,'node_modules',name),'dir');
}
symlinkSync(join(root,'apps/demo/compat/node_modules'),join(copy,'apps/demo/compat/node_modules'),'dir');
const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'packages/doc-sync/src'],{encoding:'utf8'}).trim().split('\n');
const hashes=paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(copy,path))).digest('hex')}));
const resolved=execFileSync(process.execPath,['--input-type=module','-e','console.log(import.meta.resolve("@barocss/doc-sync/sync"))'],{cwd:copy,encoding:'utf8'}).trim();
if(!resolved.includes(copy))throw new Error('Baseline alias points outside the archive');
writeFileSync(receipt,JSON.stringify({baseline,copyRoot:copy,resolved,sourceHashes:hashes},null,2)+'\n',{flag:'wx'});
execFileSync(process.execPath,['build.mjs'],{cwd:join(copy,'apps/demo/compat'),stdio:'inherit'});
const server=spawn(process.execPath,['serve.mjs'],{cwd:join(copy,'apps/demo/compat'),env:{...process.env,COMPAT_PORT:'0'},stdio:'inherit'});
process.on('SIGTERM',()=>server.kill('SIGTERM'));process.on('SIGINT',()=>server.kill('SIGINT'));server.on('exit',code=>process.exit(code??0));
