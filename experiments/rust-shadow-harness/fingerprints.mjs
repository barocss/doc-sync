// One input manifest for all native parity harnesses and the SDK comparison.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {Doc as PackagedDoc, History as PackagedHistory} from '@barocss/doc-sync';

const root=fileURLToPath(new URL('../../',import.meta.url));
const packageNames=['doc-sync','doc-sync-prosemirror','doc-sync-slate','doc-sync-lexical','doc-sync-tiptap'];
const harnessNames=['shadow','history','selection','structure','blocks','nested','shapes','move'];
const tree=(directory,accept)=>readdirSync(resolve(root,directory),{recursive:true}).filter(path=>accept(String(path))).map(path=>`${directory}/${path}`);
export const hashFile=path=>createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');

export function runtimeProvenance(actualDoc,actualHistory){
    assert.equal(actualDoc,Doc,'oracle must execute the canonical compiled Doc');
    assert.equal(actualHistory,History,'oracle must execute the canonical compiled History');
    assert.equal(PackagedDoc,Doc,'package entry must export the executed compiled Doc');
    assert.equal(PackagedHistory,History,'package entry must export the executed compiled History');
    const urls={corePackageEntry:import.meta.resolve('@barocss/doc-sync'),docModule:new URL('../../packages/doc-sync/dist/crdt/doc.js',import.meta.url).href,historyModule:new URL('../../packages/doc-sync/dist/crdt/history.js',import.meta.url).href};
    const modules=Object.fromEntries(Object.entries(urls).map(([name,url])=>{const path=relative(root,fileURLToPath(url));assert.ok(!path.startsWith('..')&&!isAbsolute(path),'runtime module must be inside this checkout');return [name,{url,path,sha256:hashFile(path)}];}));
    const typescript=JSON.parse(readFileSync(resolve(root,'node_modules/typescript/package.json'),'utf8'));
    assert.equal(typescript.version,'5.8.3','pinned build compiler');
    return {modules,typescriptVersion:typescript.version,node:process.version,nodeExecutable:process.execPath};
}

export function collectFingerprints(binary,extraPaths=[]){
    const paths=['package.json','package-lock.json','tsconfig.json','tsconfig.base.json','scripts/build-package.mjs','scripts/build-packages.mjs','node_modules/typescript/package.json','packages/doc-sync/test/harness.ts','packages/doc-sync/test/move-cursor-regressions.test.ts','experiments/rust-shadow-harness/fingerprints.mjs'];
    for(const name of packageNames){
        const directory=`packages/${name}`;
        paths.push(`${directory}/package.json`,...tree(directory,path=>/^tsconfig[^/]*\.json$/.test(path)),...tree(`${directory}/src`,path=>path.endsWith('.ts')),...tree(`${directory}/dist`,path=>path.endsWith('.js')||path.endsWith('.d.ts')));
    }
    paths.push(...tree('node_modules/typescript/lib',path=>/\.(?:js|json|ts)$/.test(path)),...tree('fixtures',path=>path.endsWith('.ts')));
    for(const name of ['shadow','sdk']){
        const directory=`experiments/rust-${name}`;
        paths.push(`${directory}/Cargo.toml`,`${directory}/Cargo.lock`,`${directory}/README.md`,...tree(`${directory}/src`,path=>path.endsWith('.rs')));
    }
    paths.push(...tree('experiments/rust-shadow/tests',path=>path.endsWith('.rs')),...tree('experiments/rust-shadow',path=>/^schema[^/]*\.json$/.test(path)),...tree('experiments/rust-sdk/examples',path=>path.endsWith('.rs')),'experiments/rust-sdk/scripts/compare-typescript.mjs');
    for(const name of harnessNames)paths.push(...tree(`experiments/rust-${name}-harness`,path=>/\.(?:ts|md|mjs)$/.test(path)));
    paths.push(...extraPaths);
    const nativePath=resolve(binary),nativeRelative=relative(root,nativePath);
    paths.push(nativeRelative.startsWith('..')||isAbsolute(nativeRelative)?nativePath:nativeRelative);
    return Object.fromEntries([...new Set(paths)].sort().map(path=>[path,hashFile(path)]));
}
