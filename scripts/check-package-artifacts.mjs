import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'output/binding-packages');
mkdirSync(output, {recursive: true});
const temp = mkdtempSync(join(tmpdir(), 'doc-sync-pack-'));
const cache = process.env.DOC_SYNC_NPM_CACHE ?? '/tmp/doc-sync-binding-npm-cache';
const names = ['doc-sync-core', 'doc-sync-prosemirror', 'doc-sync-slate', 'doc-sync-lexical', 'doc-sync-tiptap', 'doc-sync'];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, {cwd, encoding: 'utf8', env: {...process.env, NODE_PATH: '', NODE_OPTIONS: '', npm_config_cache: cache}, maxBuffer: 16 * 1024 * 1024});
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const manifest = Object.fromEntries(names.map(name => [name, json(join(root, 'packages', name, 'package.json'))]));
const tarballs = {};
const packs = [];
const walk = path => readdirSync(path, {withFileTypes: true}).flatMap(item => item.isDirectory() ? walk(join(path, item.name)) : [join(path, item.name)]);
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
for (const name of names) {
    const directory = join(root, 'packages', name);
    // A plain npm pack must rebuild stale generated JavaScript before archiving.
    const entry = join(directory, 'dist/index.js');
    const stale = '// DOC_SYNC_PREPACK_STALE_SENTINEL\n';
    writeFileSync(entry, stale + readFileSync(entry, 'utf8'));
    const orphan = join(directory, 'dist/prepack-orphan.js');
    writeFileSync(orphan, stale);
    const result = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', temp], directory))[0];
    assert(!existsSync(orphan), `${name}: npm pack kept an orphan dist file`);
    assert(!readFileSync(entry, 'utf8').includes(stale), `${name}: npm pack kept stale dist`);
    assert(result.files.some(file => file.path === 'dist/index.js'));
    assert(result.files.some(file => file.path === 'dist/index.d.ts'));
    assert(result.files.every(file => !file.path.startsWith('src/')));
    for (const file of walk(join(directory, 'dist')).filter(path => path.endsWith('.js') || path.endsWith('.d.ts'))) {
        const source = readFileSync(file, 'utf8');
        assert(!file.endsWith(".js") || !/(?:from\s*|import\s*\()["'][^"']+\.ts["']/.test(source), file);
        assert(!source.includes(root), file);
        if (name !== 'doc-sync') assert(!/["']@barocss\/doc-sync(?:\/|["'])/.test(source), file);
    }
    tarballs[name] = join(temp, result.filename);
    cpSync(tarballs[name], join(output, result.filename));
    packs.push({name, prepackRebuiltStaleDist: true, prepackRemovedOrphanDist: true, filename: result.filename, integrity: result.integrity, sha256: digest(tarballs[name]), files: result.files.map(file => file.path)});
}
assert.deepEqual(manifest['doc-sync-core'].dependencies ?? {}, {});
assert(!manifest['doc-sync-core'].peerDependencies);
// All package edges, including peers, must be acyclic.
const visited = new Set(), active = new Set();
function visit(name) {
    assert(!active.has(name), `package cycle at ${name}`);
    if (visited.has(name)) return;
    active.add(name);
    const pkg = manifest[name];
    for (const key of Object.keys({...pkg.dependencies, ...pkg.peerDependencies})) if (key.startsWith('@barocss/')) visit(key.replace('@barocss/', ''));
    active.delete(name); visited.add(name);
}
names.forEach(visit);
const cases = [];
function consumer(name, packages, extras = {}) {
    const directory = join(temp, name); mkdirSync(directory);
    writeJson(join(directory, 'package.json'), {name: `check-${name}`, version: '1.0.0', private: true, type: 'module', dependencies: {...Object.fromEntries(packages.map(pkg => [`@barocss/${pkg}`, tarballs[pkg]])), ...extras}});
    run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
    for (const pkg of packages) assert(realpathSync(join(directory, 'node_modules/@barocss', pkg)).startsWith(realpathSync(directory) + "/"), `workspace leak: ${pkg}`);
    return directory;
}
function script(directory, text, file = 'check.mjs') {writeFileSync(join(directory, file), text); return run(process.execPath, [file], directory);}
function types(directory, text) {
    writeFileSync(join(directory, 'check.ts'), text);
    writeJson(join(directory, 'tsconfig.json'), {compilerOptions: {target: 'ES2022', lib: ['ES2022','DOM','DOM.Iterable','ESNext.Disposable'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: []}, include: ['check.ts']});
    run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], directory);
}
const core = consumer('core-only', ['doc-sync-core', 'doc-sync']);
script(core, `import assert from 'node:assert/strict';
import * as old from '@barocss/doc-sync'; import * as core from '@barocss/doc-sync-core';
assert.equal(old.Doc, core.Doc); assert.equal(old.History, core.History);
for (const entry of ['sync','server','node']) { const a=await import('@barocss/doc-sync/'+entry), b=await import('@barocss/doc-sync-core/'+entry); for(const key of Object.keys(a)) assert.equal(a[key],b[key]); }
await import('@barocss/doc-sync-core/editor'); await import('@barocss/doc-sync-core/engine');
const {LocalClient,LocalEditorHost,createLocalEditorHost}=await import('@barocss/doc-sync-core/local');
const schema={root:'content',marks:[],nodes:{content:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const originalFetch=globalThis.fetch;let network=0;
globalThis.fetch=()=>{network++;throw Error('Local editing attempted network access');};
try {
 const local=new LocalClient({schema,actor:'package-local'}), host=createLocalEditorHost(local);
 assert(host instanceof LocalEditorHost);assert.deepEqual(host.status(),{online:false,synchronized:false});
 local.edit([{op:'insert',at:[0,0],content:'local'}]);assert.equal(local.model().children[0].runs[0].text,'local');
 host.undo();assert.deepEqual(local.model().children[0].runs,[]);host.redo();assert.equal(local.model().children[0].runs[0].text,'local');
 assert.equal(network,0);assert.equal('transport' in local,false);assert.equal([...host.presence()].length,0);
 local.dispose();
} finally {globalThis.fetch=originalFetch;}

for (const name of ['@barocss/doc-sync-prosemirror','@barocss/doc-sync-tiptap','@barocss/doc-sync-slate','@barocss/doc-sync-lexical','prosemirror-model','@tiptap/core','slate','lexical']) assert.throws(()=>import.meta.resolve(name));
`);
// Node's loader records every actual loaded module. No editor may enter the core graph.
writeFileSync(join(core, 'loader.mjs'), `import {appendFileSync} from 'node:fs'; export async function load(url,context,next){ appendFileSync(new URL('./loads.log',import.meta.url),url+'\\n'); return next(url,context); }`);
run(process.execPath, ['--loader', './loader.mjs', 'check.mjs'], core);
assert(!/node_modules\/(?:prosemirror-|slate|lexical|@tiptap\/|@lexical\/|@barocss\/doc-sync-(?:prosemirror|tiptap|slate|lexical))/.test(readFileSync(join(core, 'loads.log'), 'utf8')));
types(core, `import {Doc,History,type Schema,type HistorySnapshot} from '@barocss/doc-sync'; import {Doc as CoreDoc,typescriptEngine} from '@barocss/doc-sync-core'; import {SyncClient} from '@barocss/doc-sync/sync'; import {DocHub} from '@barocss/doc-sync/server'; import {NodeHttpTransport} from '@barocss/doc-sync/node'; import type * as Engine from '@barocss/doc-sync-core/engine'; import {LocalClient,LocalEditorHost,createLocalEditorHost,type LocalNotificationError} from '@barocss/doc-sync-core/local'; import type {EditorHost} from '@barocss/doc-sync-core/editor'; const ctor:typeof CoreDoc=Doc; const createLocal:(client:LocalClient)=>EditorHost=createLocalEditorHost; const notify=(error:LocalNotificationError)=>error.message; void [ctor,History,SyncClient,DocHub,NodeHttpTransport,typescriptEngine,LocalClient,LocalEditorHost,createLocal,notify];`);
cases.push({name:'facade-core-only',status:'PASS',directory:core,noEditorInstalled:true,noEditorLoaded:true,types:'PASS'});
const editorPeers = {
    'doc-sync-prosemirror': ['prosemirror-model','prosemirror-state','prosemirror-transform','prosemirror-view'],
    'doc-sync-tiptap': ['@tiptap/core','@tiptap/pm'],
    'doc-sync-slate': ['slate'],
    'doc-sync-lexical': ['lexical','@lexical/rich-text','@lexical/table'],
};
const lock = json(join(root, 'package-lock.json'));
function versions(peers) {return Object.fromEntries(peers.map(key=>[key,lock.packages[`node_modules/${key}`]?.version ?? manifest['doc-sync'].devDependencies[key]]));}
for (const binding of Object.keys(editorPeers)) {
    const packages = ['doc-sync-core', binding, ...(binding === 'doc-sync-tiptap' ? ['doc-sync-prosemirror'] : [])];
    const ownPeers = [...editorPeers[binding], ...(binding === 'doc-sync-tiptap' ? editorPeers['doc-sync-prosemirror'] : [])];
    const directory = consumer(binding, packages, versions(ownPeers));
    script(directory, `import assert from 'node:assert/strict';const binding=await import('@barocss/${binding}');assert(Object.keys(binding).length);`);
    if (binding === 'doc-sync-prosemirror') {
        script(directory, `import assert from 'node:assert/strict';
import {SyncClient} from '@barocss/doc-sync-core/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';
import {PmHostBinding,buildPmSchema} from '@barocss/doc-sync-prosemirror';
const schema={root:'content',marks:[],nodes:{content:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const client=new SyncClient('package-host',{subscribe:()=>()=>{},send:async()=>{}},{schema});
const host=createSyncClientEditorHost(client), binding=new PmHostBinding(host,buildPmSchema(schema));
binding.dispatch(binding.state.tr.insertText('host',1));
assert.equal(binding.state.doc.textContent,'host'); assert.equal(client.pending.length,1);
binding.undo(); assert.equal(binding.state.doc.textContent,'');
binding.redo(); assert.equal(binding.state.doc.textContent,'host');
binding.dispose(); assert.equal(client.pending.length,3);
`, 'host.mjs');
        types(directory, `import {type EditorHost,createSyncClientEditorHost} from '@barocss/doc-sync-core/editor'; import {PmHostBinding} from '@barocss/doc-sync-prosemirror'; const create:(...args:Parameters<typeof createSyncClientEditorHost>)=>EditorHost=createSyncClientEditorHost; void [create,PmHostBinding];`);
    }
    if (binding === 'doc-sync-slate') {
        script(directory, `import assert from 'node:assert/strict';
import {createEditor,Transforms} from 'slate';
import {SyncClient} from '@barocss/doc-sync-core/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';
import {SlateHostBinding,fromSlate} from '@barocss/doc-sync-slate';
const schema={root:'content',marks:[],nodes:{content:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const client=new SyncClient('slate-package-host',{subscribe:()=>()=>{},send:async()=>{}},{schema});
const editor=createEditor(), binding=new SlateHostBinding(createSyncClientEditorHost(client),editor);
const flush=()=>new Promise(resolve=>setImmediate(resolve)); await flush();
Transforms.select(editor,{path:[0,0],offset:0}); Transforms.insertText(editor,'A😀'); await flush();
assert.equal(fromSlate(schema,editor.children).children[0].runs[0].text,'A😀'); assert.equal(client.pending.length,1);
binding.undo(); await flush(); assert.deepEqual(client.doc.toJSON().children[0].runs,[]);
binding.redo(); await flush(); assert.equal(client.doc.toJSON().children[0].runs[0].text,'A😀'); binding.dispose();
`, 'host.mjs');
    }
    if (binding === 'doc-sync-lexical') {
        script(directory, `import assert from 'node:assert/strict';
import {createEditor,$getSelection,$isRangeSelection} from 'lexical';
import {registerRichText} from '@lexical/rich-text';
import {SyncClient} from '@barocss/doc-sync-core/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';
import {LexicalHostBinding,buildLexicalSchema,$setLexicalSelection,readLexicalModel} from '@barocss/doc-sync-lexical';
const schema={root:'content',marks:[],nodes:{content:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const client=new SyncClient('lexical-package-host',{subscribe:()=>()=>{},send:async()=>{}},{schema});
const info=buildLexicalSchema(schema), editor=createEditor({nodes:info.nodes,onError:error=>{throw error;}});
const stop=registerRichText(editor), binding=new LexicalHostBinding(createSyncClientEditorHost(client),editor,info);
editor.update(()=>{assert($setLexicalSelection(info,{anchor:[0,0],focus:[0,0]})); const selection=$getSelection(); assert($isRangeSelection(selection)); selection.insertText('A😀');},{discrete:true});
assert.equal(readLexicalModel(editor,info).children[0].runs[0].text,'A😀'); assert.equal(client.pending.length,1);
binding.undo(); assert.deepEqual(client.doc.toJSON().children[0].runs,[]);
binding.redo(); assert.equal(client.doc.toJSON().children[0].runs[0].text,'A😀'); binding.dispose(); stop();
`, 'host.mjs');
    }
    const forbidden = binding === 'doc-sync-slate' ? ['lexical','prosemirror-model','@tiptap/core'] : binding === 'doc-sync-lexical' ? ['slate','prosemirror-model','@tiptap/core'] : ['slate','lexical',...(binding === 'doc-sync-prosemirror'?['@tiptap/core']:[])];
    for (const peer of forbidden) assert(!existsSync(join(directory, 'node_modules', peer)), `${binding} installed unrelated ${peer}`);
    types(directory, `import * as binding from '@barocss/${binding}'; import {Doc,type Schema} from '@barocss/doc-sync-core'; void [binding,Doc];`);
    cases.push({name:binding,status:'PASS',directory,types:'PASS',unrelatedEditorsAbsent:true});
}
const all = consumer('all-old-new', names, {...versions(Object.values(editorPeers).flat()),jsdom:'26.1.0'});
script(all, `import assert from 'node:assert/strict';
for (const name of ['prosemirror','tiptap','slate','lexical']) { const old=await import('@barocss/doc-sync/'+name), current=await import('@barocss/doc-sync-'+name); for(const key of Object.keys(old)) assert.equal(old[key],current[key]); }
for(const part of ['model','state','transform','view']) { const upstream=await import('prosemirror-'+part), tiptap=await import('@tiptap/pm/'+part); for(const key of Object.keys(upstream)) if(typeof upstream[key]==='function') assert.equal(upstream[key],tiptap[key],part+'.'+key); }
`);
types(all, `import {Doc,type Schema} from '@barocss/doc-sync'; import {Doc as CoreDoc} from '@barocss/doc-sync-core'; import {SyncClient} from '@barocss/doc-sync/sync'; import {PmBinding as OldPm} from '@barocss/doc-sync/prosemirror'; import {PmBinding} from '@barocss/doc-sync-prosemirror'; import {SlateBinding} from '@barocss/doc-sync/slate'; import {LexicalBinding} from '@barocss/doc-sync/lexical'; import {DocSync,createTiptapExtensions} from '@barocss/doc-sync-tiptap'; import * as tiptap from '@barocss/doc-sync/tiptap'; const ctor:typeof CoreDoc=Doc; const pm:typeof PmBinding=OldPm; void [ctor,pm,SyncClient,SlateBinding,LexicalBinding,DocSync,createTiptapExtensions,tiptap];`);
// Copy the real in-memory network helper and native Tiptap regression cases, then use only tarball public entries.
cpSync(join(root, 'fixtures/demo-schema.ts'), join(all, 'schema.ts'));
let harness = readFileSync(join(root, 'packages/doc-sync/test/harness.ts'), 'utf8');
harness = harness.replace('../../../fixtures/demo-schema.ts', './schema.ts');
let native = readFileSync(join(root, 'packages/doc-sync/test/tiptap.test.ts'), 'utf8');
for (const [name, pkg] of [['harness.ts','doc-sync-core'],['native.test.ts','doc-sync-core']]) {
    let text = name==='harness.ts' ? harness : native;
    text=text.replace(/(["'])(?:\.\.\/)+doc-sync-core\/(?:src|dist)\/crdt\/[^"']+\1/g,'"@barocss/doc-sync-core"')
        .replace(/(["'])(?:\.\.\/)+doc-sync-core\/(?:src|dist)\/sync\/[^"']+\1/g,'"@barocss/doc-sync-core/sync"')
        .replace(/(["'])(?:\.\.\/)+doc-sync-core\/(?:src|dist)\/server\/[^"']+\1/g,'"@barocss/doc-sync-core/server"')
        .replace(/(["'])(?:\.\.\/)+doc-sync-prosemirror\/(?:src|dist)\/[^"']+\1/g,'"@barocss/doc-sync-prosemirror"');
    writeFileSync(join(all,name),text);
}
const nativeResult = run(process.execPath, ['--test','native.test.ts'], all);
writeFileSync(join(output,'tarball-tiptap-tests.log'),nativeResult);
cases.push({name:'all-eight-legacy-imports-and-six-packages',status:'PASS',directory:all,types:'PASS',singlePmClassGraph:true,nativeTiptapTests:'PASS'});
// Prove a binding patch can be packed independently without changing its siblings or facade.
const before = Object.fromEntries(names.map(name=>[name,walk(join(root,'packages',name,'dist')).map(file=>[file,digest(file)])]));
const releaseRoot = join(temp,'independent-release'); mkdirSync(join(releaseRoot,'packages'), {recursive:true});
cpSync(join(root,'tsconfig.base.json'),join(releaseRoot,'tsconfig.base.json'));
mkdirSync(join(releaseRoot,'scripts')); cpSync(join(root,'scripts/build-package.mjs'),join(releaseRoot,'scripts/build-package.mjs'));
writeJson(join(releaseRoot,'package.json'),{private:true,type:'module',dependencies:{'@barocss/doc-sync-core':tarballs['doc-sync-core'],...versions(['slate']),typescript:json(join(root,'node_modules/typescript/package.json')).version,'@types/node':lock.packages['node_modules/@types/node'].version}});
run(npm,['install','--ignore-scripts','--no-audit','--no-fund'],releaseRoot);
const independent = join(releaseRoot,'packages/doc-sync-slate'); cpSync(join(root,'packages/doc-sync-slate'),independent,{recursive:true,filter:source=>!source.includes('/node_modules')});
const patch = json(join(independent,'package.json')); patch.version='0.0.1'; writeJson(join(independent,'package.json'),patch);
const patchPack=JSON.parse(run(npm,['pack','--json','--pack-destination',temp],independent))[0];
const patchPath=join(temp,patchPack.filename); const original=tarballs['doc-sync-slate']; tarballs['doc-sync-slate']=patchPath;
const patched=consumer('independent-binding-patch',['doc-sync-core','doc-sync','doc-sync-slate'],versions(['slate']));
script(patched, `import assert from 'node:assert/strict'; import {SlateBinding as old} from '@barocss/doc-sync/slate'; import {SlateBinding as current} from '@barocss/doc-sync-slate'; assert.equal(old,current);`);
tarballs['doc-sync-slate']=original;
for(const name of names) assert.deepEqual(walk(join(root,'packages',name,'dist')).map(file=>[file,digest(file)]),before[name]);
cases.push({name:'independent-slate-0.0.1-with-unchanged-facade',status:'PASS',directory:patched,siblingDistUnchanged:true});
const receipt = {status:'PASS',node:process.version,typescript:json(join(root,'node_modules/typescript/package.json')).version,temp,packages:packs,cases,registryPublished:false,privateFlagsRetained:true};
writeJson(join(output,'pack-consumers.json'),receipt);
console.log(JSON.stringify({status:receipt.status,cases:cases.map(x=>({name:x.name,status:x.status})),receipt:join(output,'pack-consumers.json')},null,2));
