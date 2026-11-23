import fs from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root='/Users/user/github/doc-sync-bindings';
const receipt=JSON.parse(fs.readFileSync(join(root,'output/binding-packages/pack-consumers.json'),'utf8'));
const before=receipt.cases.find(x=>x.name==='all-eight-legacy-imports-and-six-packages').directory;
const patched=receipt.cases.find(x=>x.name==='independent-slate-0.0.1-with-unchanged-facade').directory;
const manifest=(dir,name)=>JSON.parse(fs.readFileSync(join(dir,'node_modules/@barocss',name,'package.json'),'utf8'));
assert.equal(manifest(patched,'doc-sync').version,'0.0.0');assert.equal(manifest(patched,'doc-sync-core').version,'0.0.0');assert.equal(manifest(patched,'doc-sync-slate').version,'0.0.1');
assert.equal(manifest(patched,'doc-sync').peerDependencies['@barocss/doc-sync-slate'],'>=0.0.0 <0.1.0');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
function digest(dir){return walk(dir).map(p=>[p.slice(dir.length+1),createHash('sha256').update(fs.readFileSync(p)).digest('hex')]);}
for(const name of ['doc-sync','doc-sync-core']) assert.deepEqual(digest(join(before,'node_modules/@barocss',name)),digest(join(patched,'node_modules/@barocss',name)),name+' changed');
const req=createRequire(join(patched,'package.json'));const old=await import(pathToFileURL(req.resolve('@barocss/doc-sync/slate')));const current=await import(pathToFileURL(req.resolve('@barocss/doc-sync-slate')));assert.equal(old.SlateBinding,current.SlateBinding);
const report={status:'PASS',node:process.version,scope:'Installed local tarball patch only; no registry publish',facadeVersion:'0.0.0',coreVersion:'0.0.0',slateVersion:'0.0.1',facadeAndCoreInstalledFilesUnchanged:true,legacyAndNewSlateClassIdentity:true,directory:patched};
fs.writeFileSync(join(root,'output/package-verifier/independent-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
