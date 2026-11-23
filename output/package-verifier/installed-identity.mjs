import assert from 'node:assert/strict';
import {readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root='/Users/user/github/doc-sync-bindings';
const receipt=JSON.parse(readFileSync(join(root,'output/binding-packages/pack-consumers.json'),'utf8'));
const directory=receipt.cases.find(x=>x.name==='all-eight-legacy-imports-and-six-packages').directory;
const req=createRequire(join(directory,'package.json'));
const entries=Object.fromEntries(['doc-sync','doc-sync-core','doc-sync-prosemirror','doc-sync-tiptap','doc-sync-slate','doc-sync-lexical'].map(n=>[n,req.resolve('@barocss/'+n)]));
for(const path of Object.values(entries)) assert(realpathSync(path).startsWith(realpathSync(directory)+'/'));
const core=entries['doc-sync-core'];
const coreOrigins={};
for(const [name,path] of Object.entries(entries)){
 const local=createRequire(path);
 coreOrigins[name]=local.resolve('@barocss/doc-sync-core');
 assert.equal(realpathSync(coreOrigins[name]),realpathSync(core));
}
const esmResolve=(name,parent)=>fileURLToPath(import.meta.resolve(name,pathToFileURL(parent).href));
const pmOrigins={};
for(const [name,path] of Object.entries(entries).filter(([n])=>['doc-sync-prosemirror','doc-sync-tiptap'].includes(n))){
 const local=createRequire(path);pmOrigins[name]={};
 for(const part of ['model','state','transform','view']){
  const origin=esmResolve('prosemirror-'+part,path);pmOrigins[name][part]=origin;
  assert.equal(realpathSync(origin),realpathSync(esmResolve('prosemirror-'+part,join(directory,'check.mjs'))));
 }
}
const tiptapReq=createRequire(req.resolve('@tiptap/core'));
for(const part of ['model','state','transform','view']){
 const upstream=await import(pathToFileURL(esmResolve('prosemirror-'+part,join(directory,'check.mjs'))));
 const tiptap=await import(pathToFileURL(esmResolve('@tiptap/pm/'+part,req.resolve('@tiptap/core'))));
 for(const key of Object.keys(upstream)) if(typeof upstream[key]==='function') assert.equal(upstream[key],tiptap[key],part+'.'+key);
}
const facade=await import(pathToFileURL(entries['doc-sync']));const canonical=await import(pathToFileURL(core));
assert.equal(facade.Doc,canonical.Doc);assert.equal(facade.History,canonical.History);
const oldPm=await import(pathToFileURL(req.resolve('@barocss/doc-sync/prosemirror')));const newPm=await import(pathToFileURL(entries['doc-sync-prosemirror']));assert.equal(oldPm.PmBinding,newPm.PmBinding);
const rootPackage=JSON.parse(readFileSync(join(directory,'node_modules/@barocss/doc-sync/package.json'),'utf8'));
const report={status:'PASS',scope:'Actual external tarball consumer; per-binding core/PM resolve and runtime Doc/History/PmBinding/upstream Tiptap PM class identities',directory,entries,coreOrigins,pmOrigins,facadeVersion:rootPackage.version};
writeFileSync(join(root,'output/package-verifier/installed-identity.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
