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
const names = ['doc-sync', 'doc-sync-prosemirror', 'doc-sync-slate', 'doc-sync-lexical', 'doc-sync-tiptap'];
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
        assert(!source.includes('@barocss/doc-sync-core'), file);
    }
    tarballs[name] = join(temp, result.filename);
    cpSync(tarballs[name], join(output, result.filename));
    packs.push({name, prepackRebuiltStaleDist: true, prepackRemovedOrphanDist: true, filename: result.filename, integrity: result.integrity, sha256: digest(tarballs[name]), files: result.files.map(file => file.path)});
}
assert.deepEqual(manifest['doc-sync'].dependencies ?? {}, {});
assert(!manifest['doc-sync'].peerDependencies);
assert.deepEqual(Object.keys(manifest['doc-sync'].exports).sort(), ['.','./client','./editor','./engine','./local','./node','./server','./sync']);
for (const name of names) {
    assert.equal(manifest[name].private, true, `${name}: package must remain private`);
    assert.equal(manifest[name].version, '0.0.0', `${name}: preparation must not advance versions`);
    if (name !== 'doc-sync') assert.equal(manifest[name].peerDependencies['@barocss/doc-sync'], '>=0.0.0 <0.1.0');
}
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
const core = consumer('core-only', ['doc-sync']);
script(core, `import assert from 'node:assert/strict';
import * as core from '@barocss/doc-sync';
assert.equal(typeof core.Doc,'function'); assert.equal(typeof core.History,'function');
for (const entry of ['client','sync','server','node','editor','engine','local']) assert(Object.keys(await import('@barocss/doc-sync/'+entry)).length);
for (const entry of ['prosemirror','tiptap','slate','lexical']) await assert.rejects(import('@barocss/doc-sync/'+entry),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
await import('@barocss/doc-sync/editor'); await import('@barocss/doc-sync/engine');
const {LocalClient,LocalEditorHost,createLocalEditorHost}=await import('@barocss/doc-sync/local');
const schema={root:'content',marks:[],nodes:{content:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const {Client,clientOwner,createEditorHost,isBindingClient}=await import('@barocss/doc-sync/client');
assert.equal(Client,core.Client);
const unified=new Client({schema,actor:'package-unified'});
assert.equal(unified.mode,'local');assert.equal(unified.sync,null);assert(clientOwner(unified) instanceof LocalClient);assert(isBindingClient(unified));
unified.edit([{op:'insert',at:[0,0],content:'unified'}]);assert.equal(unified.model().children[0].runs[0].text,'unified');
const firstHost=createEditorHost(unified),secondHost=createEditorHost(unified);assert.notEqual(firstHost,secondHost);
unified.undo();assert.deepEqual(unified.model().children[0].runs,[]);unified.redo();assert.equal(unified.model().children[0].runs[0].text,'unified');
const saved=JSON.parse(JSON.stringify(unified.captureState())), reopened=Client.fromState(saved,{schema});
assert.equal(reopened.actor,unified.actor);assert.equal(reopened.sync,null);assert(clientOwner(reopened) instanceof LocalClient);assert.deepEqual(reopened.model(),unified.model());
reopened.undo();assert.deepEqual(reopened.model().children[0].runs,[]);reopened.redo();assert.deepEqual(reopened.model(),unified.model());
const low=new LocalClient({schema,actor:'package-low-state'});low.edit([{op:'insert',at:[0,0],content:'state'}]);const lowOpen=LocalClient.fromState(JSON.parse(JSON.stringify(low.captureState())),{schema});assert.deepEqual(lowOpen.model(),low.model());lowOpen.undo();assert.deepEqual(lowOpen.model().children[0].runs,[]);lowOpen.dispose();low.dispose();reopened.dispose();unified.dispose();
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

const graphic={domain:'graphic',root:'canvas',marks:[],nodes:{canvas:{shape:'container',children:['frame','rect']},frame:{shape:'container',children:['rect']},rect:{shape:'atom'}}};
const graphicClient=new Client({schema:graphic,actor:'packed-graphic'});
assert.deepEqual(graphicClient.model(),{type:'canvas',children:[]});
graphicClient.edit([{op:'insert',at:[0],content:[{type:'frame',children:[]},{type:'rect'}]}]);
graphicClient.edit([{op:'move',from:[1],at:[0,0]}]);
assert.deepEqual(graphicClient.model(),{type:'canvas',children:[{type:'frame',children:[{type:'rect'}]}]});
const graphicReopened=Client.fromState(JSON.parse(JSON.stringify(graphicClient.captureState())),{schema:graphic});
graphicReopened.undo();assert.deepEqual(graphicReopened.model(),{type:'canvas',children:[{type:'frame',children:[]},{type:'rect'}]});
graphicReopened.redo();assert.deepEqual(graphicReopened.model(),graphicClient.model());
assert.equal(core.schemaVersion(schema),core.schemaVersion({...schema,domain:'document'}));
const {DocHub}=await import('@barocss/doc-sync/server');
const {CONTAINER_CAPABILITY}=await import('@barocss/doc-sync/sync');
assert(new DocHub({schema:graphic}).hello().capabilities.includes(CONTAINER_CAPABILITY));
graphicReopened.dispose();graphicClient.dispose();

for (const name of ['@barocss/doc-sync-prosemirror','@barocss/doc-sync-tiptap','@barocss/doc-sync-slate','@barocss/doc-sync-lexical','prosemirror-model','@tiptap/core','slate','lexical','pixi.js','@visactor/vtable','@visactor/vtable-editors']) assert.throws(()=>import.meta.resolve(name));
`);
// Node's loader records every actual loaded module. No editor may enter the core graph.
writeFileSync(join(core, 'loader.mjs'), `import {appendFileSync} from 'node:fs'; export async function load(url,context,next){ appendFileSync(new URL('./loads.log',import.meta.url),url+'\\n'); return next(url,context); }`);
run(process.execPath, ['--loader', './loader.mjs', 'check.mjs'], core);
assert(!/node_modules\/(?:prosemirror-|slate|lexical|pixi\.js|@visactor\/|@tiptap\/|@lexical\/|@barocss\/doc-sync-(?:prosemirror|tiptap|slate|lexical))/.test(readFileSync(join(core, 'loads.log'), 'utf8')));
types(core, `import {Client,type ClientOptions,clientOwner,createEditorHost,type BindingClient,type LocalClientState} from '@barocss/doc-sync/client'; import {Doc,History,type Schema,type HistorySnapshot,typescriptEngine} from '@barocss/doc-sync'; import {SyncClient} from '@barocss/doc-sync/sync'; import {DocHub} from '@barocss/doc-sync/server'; import {NodeHttpTransport} from '@barocss/doc-sync/node'; import type * as Engine from '@barocss/doc-sync/engine'; import {LocalClient,LocalEditorHost,createLocalEditorHost,type LocalNotificationError} from '@barocss/doc-sync/local'; import type {EditorHost} from '@barocss/doc-sync/editor'; const captured:LocalClientState|null=null; const restore:(state:unknown,options:{schema:Schema})=>Client=Client.fromState; const options:ClientOptions={schema:{} as Schema}; const client:BindingClient=new Client(options); const createLocal:(client:LocalClient)=>EditorHost=createLocalEditorHost; const notify=(error:LocalNotificationError)=>error.message; void [captured,restore,clientOwner(client),createEditorHost(client),Doc,History,SyncClient,DocHub,NodeHttpTransport,typescriptEngine,LocalClient,LocalEditorHost,createLocal,notify];`);
const publicProfileTypes = `
import {Client} from '@barocss/doc-sync/client';
import type {ActorProfile,ResolvedActorProfile,ProfileJSON} from '@barocss/doc-sync';
import type {ActorProfile as ClientProfile,ResolvedActorProfile as ClientResolved,ProfileJSON as ClientJSON} from '@barocss/doc-sync/client';
import type {ActorProfile as LocalProfile,ResolvedActorProfile as LocalResolved,ProfileJSON as LocalJSON} from '@barocss/doc-sync/local';
import type {ActorProfile as SyncProfile,ResolvedActorProfile as SyncResolved,ProfileJSON as SyncJSON,PresenceInput} from '@barocss/doc-sync/sync';
import type {Schema} from '@barocss/doc-sync';
const metadata:ProfileJSON={source:'packed-consumer',nested:[true,null,1]};
const jsonEntries:[ClientJSON,LocalJSON,SyncJSON]=[metadata,metadata,metadata];
const profile:ActorProfile={name:'Alice',color:'#2274a5',avatar:'alice.png',userId:'alice',kind:'human',metadata:{details:metadata}};
const profiles:[ClientProfile,LocalProfile,SyncProfile]=[profile,profile,profile];
const client=new Client({schema:{} as Schema,profile});
const resolved:ResolvedActorProfile=client.profile;
const resolvedEntries:[ClientResolved,LocalResolved,SyncResolved]=[resolved,resolved,resolved];
const name:string=resolved.name,color:string=resolved.color;
const presence:PresenceInput={anchor:null,focus:null};
const override:PresenceInput={...presence,name:'Alias',color:'#000'};
client.setPresence(presence);client.setPresence(override);
void [jsonEntries,profiles,resolvedEntries,name,color];
`;
types(core, publicProfileTypes);
types(core, `import {Client,type Schema,type DocumentSchema,type GraphicSchema,type ContainerSpec,type OrderedSpec,type SchemaDomain} from '@barocss/doc-sync';
import {CONTAINER_CAPABILITY} from '@barocss/doc-sync/sync';
const document:DocumentSchema={root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const container:ContainerSpec={shape:'container',children:[]};
const graphic:GraphicSchema={domain:'graphic',root:'canvas',marks:[],nodes:{canvas:container}};
const ordered:OrderedSpec=container;
const schemas:Schema[]=[document,graphic];
const domain:SchemaDomain='graphic';
const capability:'containers-v1'=CONTAINER_CAPABILITY;
const client=new Client({schema:graphic});client.edit([{op:'insert',at:[0],content:[]}]);client.dispose();
void [schemas,ordered,domain,capability];`);

cases.push({name:'core-only',status:'PASS',directory:core,noEditorInstalled:true,noEditorLoaded:true,types:'PASS',unifiedClientLocalRuntime:'PASS',publicProfileTypes:'PASS',schemaDomainTypes:'PASS',emptyGraphicClientRuntime:'PASS'});
const editorPeers = {
    'doc-sync-prosemirror': ['prosemirror-model','prosemirror-state','prosemirror-transform','prosemirror-view'],
    'doc-sync-tiptap': ['@tiptap/core','@tiptap/pm'],
    'doc-sync-slate': ['slate'],
    'doc-sync-lexical': ['lexical','@lexical/rich-text','@lexical/table'],
};
// The same direct-client lifecycle runs inside each isolated editor consumer.
function unifiedBindingSource(binding) {
    const common = `import assert from 'node:assert/strict';
import {Client} from '@barocss/doc-sync/client';
const schema={root:'content',marks:[],nodes:{content:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const client=new Client({schema,actor:'direct-package-client'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
`;
    const bodies = {
        'doc-sync-prosemirror': `import {PmBinding,buildPmSchema} from '@barocss/doc-sync-prosemirror';
const info=buildPmSchema(schema),first=new PmBinding(client,info),second=new PmBinding(client,info);
const read=binding=>binding.state.doc.textContent;
const type=()=>first.dispatch(first.state.tr.insertText('A😀',1));
const cleanup=()=>{};
`,
        'doc-sync-slate': `import {createEditor,Transforms} from 'slate';
import {SlateBinding,fromSlate} from '@barocss/doc-sync-slate';
const first=new SlateBinding(client,createEditor()),second=new SlateBinding(client,createEditor());
const read=binding=>fromSlate(schema,binding.editor.children).children[0].runs.map(run=>run.text??'').join('');
const type=()=>{Transforms.select(first.editor,{path:[0,0],offset:0});Transforms.insertText(first.editor,'A😀');};
const cleanup=()=>{};
`,
        'doc-sync-lexical': `import {createEditor,$getSelection,$isRangeSelection} from 'lexical';
import {registerRichText} from '@lexical/rich-text';
import {LexicalBinding,buildLexicalSchema,readLexicalModel,$setLexicalSelection} from '@barocss/doc-sync-lexical';
const info=buildLexicalSchema(schema),make=()=>createEditor({nodes:info.nodes,onError:error=>{throw error;}});
const a=make(),b=make(),stopA=registerRichText(a),stopB=registerRichText(b);
const first=new LexicalBinding(client,a,info),second=new LexicalBinding(client,b,info);
assert.equal(first.input,first.session);
const read=binding=>readLexicalModel(binding.editor,info).children[0].runs.map(run=>run.text??'').join('');
const type=()=>a.update(()=>{assert($setLexicalSelection(info,{anchor:[0,0],focus:[0,0]}));const selection=$getSelection();assert($isRangeSelection(selection));selection.insertText('A😀');},{discrete:true});
const cleanup=()=>{stopA();stopB();};
`,
    };
    return common + bodies[binding] + `
try {
 assert.equal(first.client,client);assert.equal(second.client,client);assert.notEqual(first.host,second.host);
 await flush();type();await flush();assert.equal(read(first),'A😀');assert.equal(read(second),'A😀');
 client.edit([{op:'insert',at:[0,0],content:'X'}]);await flush();assert.equal(read(first),'XA😀');assert.equal(read(second),'XA😀');
 first.undo();await flush();assert.equal(read(first),'A😀');assert.equal(read(second),'A😀');
 second.undo();await flush();assert.equal(read(first),'');assert.equal(read(second),'');assert.equal(client.historyStatus().canUndo,false);
 second.redo();await flush();assert.equal(read(first),'A😀');assert.equal(read(second),'A😀');
} finally {first.dispose();second.dispose();cleanup();client.dispose();}
`;
}
const lock = json(join(root, 'package-lock.json'));
function versions(peers) {return Object.fromEntries(peers.map(key=>[key,lock.packages[`node_modules/${key}`]?.version ?? manifest['doc-sync'].devDependencies[key]]));}
for (const binding of Object.keys(editorPeers)) {
    const packages = ['doc-sync', binding, ...(binding === 'doc-sync-tiptap' ? ['doc-sync-prosemirror'] : [])];
    const ownPeers = [...editorPeers[binding], ...(binding === 'doc-sync-tiptap' ? editorPeers['doc-sync-prosemirror'] : [])];
    const directory = consumer(binding, packages, versions(ownPeers));
    script(directory, `import assert from 'node:assert/strict';const binding=await import('@barocss/${binding}');assert(Object.keys(binding).length);`);
    if (binding === 'doc-sync-prosemirror') {
        script(directory, `import assert from 'node:assert/strict';
import {SyncClient} from '@barocss/doc-sync/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync/editor';
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
        types(directory, `import {type EditorHost,createSyncClientEditorHost} from '@barocss/doc-sync/editor'; import {PmHostBinding} from '@barocss/doc-sync-prosemirror'; const create:(...args:Parameters<typeof createSyncClientEditorHost>)=>EditorHost=createSyncClientEditorHost; void [create,PmHostBinding];`);
    }
    if (binding === 'doc-sync-slate') {
        script(directory, `import assert from 'node:assert/strict';
import {createEditor,Transforms} from 'slate';
import {SyncClient} from '@barocss/doc-sync/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync/editor';
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
import {SyncClient} from '@barocss/doc-sync/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync/editor';
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
    if (binding !== 'doc-sync-tiptap') {
        script(directory, unifiedBindingSource(binding), 'unified-client.mjs');
        const bindingName = {'doc-sync-prosemirror':'PmBinding','doc-sync-slate':'SlateBinding','doc-sync-lexical':'LexicalBinding'}[binding];
        const construct = binding === 'doc-sync-prosemirror' ? 'new PmBinding(client,buildPmSchema(schema))' : binding === 'doc-sync-slate' ? 'new SlateBinding(client,createEditor())' : 'new LexicalBinding(client,createEditor(),buildLexicalSchema(schema))';
        const legacyInput = binding === 'doc-sync-lexical' ? "import type {InputSession,EditorSession} from '@barocss/doc-sync/editor'; const oldInput:InputSession=legacy.input; const newInput:EditorSession=binding.input; void [oldInput,newInput];" : '';
        const peers = binding === 'doc-sync-prosemirror' ? "import {buildPmSchema} from '@barocss/doc-sync-prosemirror';" : binding === 'doc-sync-slate' ? "import {createEditor} from 'slate';" : "import {createEditor} from 'lexical'; import {buildLexicalSchema} from '@barocss/doc-sync-lexical';";
        types(directory, `import {Client} from '@barocss/doc-sync/client'; import type {Schema} from '@barocss/doc-sync'; import {${bindingName}} from '@barocss/${binding}'; ${peers} declare const schema:Schema; const client=new Client({schema}); const binding=${construct}; const exact:Client=binding.client; const legacy:${bindingName}=null as unknown as ${bindingName}; const raw:import('@barocss/doc-sync/sync').SyncClient=legacy.client; ${legacyInput} void [exact,legacy,raw];`);
    } else {
        types(directory, `import {Client} from '@barocss/doc-sync/client'; import type {Schema} from '@barocss/doc-sync'; import {DocSync,createTiptapExtensions} from '@barocss/doc-sync-tiptap'; declare const schema:Schema; const client=new Client({schema}); const extension=DocSync.configure({client}); void [extension,createTiptapExtensions(schema)];`);
    }
    const forbidden = binding === 'doc-sync-slate' ? ['lexical','prosemirror-model','@tiptap/core'] : binding === 'doc-sync-lexical' ? ['slate','prosemirror-model','@tiptap/core'] : ['slate','lexical',...(binding === 'doc-sync-prosemirror'?['@tiptap/core']:[])];
    for (const peer of forbidden) assert(!existsSync(join(directory, 'node_modules', peer)), `${binding} installed unrelated ${peer}`);
    types(directory, `import * as binding from '@barocss/${binding}'; import {Doc,type Schema} from '@barocss/doc-sync'; void [binding,Doc];`);
    cases.push({name:binding,status:'PASS',directory,types:'PASS',unrelatedEditorsAbsent:true,unifiedClientTypes:'PASS',...(binding !== 'doc-sync-tiptap' ? {unifiedClientNativeLifecycle:'PASS'} : {})});
}
const all = consumer('all-five-packages', names, {...versions(Object.values(editorPeers).flat()),jsdom:'26.1.0'});
script(all, `import assert from 'node:assert/strict';
for (const name of ['prosemirror','tiptap','slate','lexical']) assert(Object.keys(await import('@barocss/doc-sync-'+name)).length);
for(const part of ['model','state','transform','view']) { const upstream=await import('prosemirror-'+part), tiptap=await import('@tiptap/pm/'+part); for(const key of Object.keys(upstream)) if(typeof upstream[key]==='function') assert.equal(upstream[key],tiptap[key],part+'.'+key); }
`);
types(all, `import {Client,type BindingClient} from '@barocss/doc-sync/client'; import {Doc,type Schema} from '@barocss/doc-sync'; import {SyncClient} from '@barocss/doc-sync/sync'; import {PmBinding} from '@barocss/doc-sync-prosemirror'; import {SlateBinding} from '@barocss/doc-sync-slate'; import {LexicalBinding} from '@barocss/doc-sync-lexical'; import {DocSync,createTiptapExtensions} from '@barocss/doc-sync-tiptap'; const client:BindingClient=new Client({schema:{} as Schema}); void [client,Doc,SyncClient,PmBinding,SlateBinding,LexicalBinding,DocSync,createTiptapExtensions];`);
// Copy the real in-memory network helper and native Tiptap regression cases, then use only tarball public entries.
cpSync(join(root, 'fixtures/demo-schema.ts'), join(all, 'schema.ts'));
let harness = readFileSync(join(root, 'packages/doc-sync/test/harness.ts'), 'utf8');
harness = harness.replace('../../../fixtures/demo-schema.ts', './schema.ts');
let native = readFileSync(join(root, 'packages/doc-sync/test/tiptap.test.ts'), 'utf8');
for (const name of ['harness.ts','native.test.ts']) {
    let text = name==='harness.ts' ? harness : native;
    text=text.replace(/(["'])(?:\.\.\/)+doc-sync\/(?:src|dist)\/crdt\/[^"']+\1/g,'"@barocss/doc-sync"')
        .replace(/(["'])(?:\.\.\/)+doc-sync\/(?:src|dist)\/sync\/[^"']+\1/g,'"@barocss/doc-sync/sync"')
        .replace(/(["'])(?:\.\.\/)+doc-sync\/(?:src|dist)\/server\/[^"']+\1/g,'"@barocss/doc-sync/server"')
        .replace(/(["'])(?:\.\.\/)+doc-sync-prosemirror\/(?:src|dist)\/[^"']+\1/g,'"@barocss/doc-sync-prosemirror"');
    writeFileSync(join(all,name),text);
}
const nativeResult = run(process.execPath, ['--test','native.test.ts'], all);
writeFileSync(join(output,'tarball-tiptap-tests.log'),nativeResult);
cases.push({name:'all-five-independent-packages',status:'PASS',directory:all,types:'PASS',singlePmClassGraph:true,nativeTiptapTests:'PASS',unifiedClientTypes:'PASS'});
// Prove a binding patch can be packed independently without changing its siblings or core.
const before = Object.fromEntries(names.map(name=>[name,walk(join(root,'packages',name,'dist')).map(file=>[file,digest(file)])]));
const releaseRoot = join(temp,'independent-release'); mkdirSync(join(releaseRoot,'packages'), {recursive:true});
cpSync(join(root,'tsconfig.base.json'),join(releaseRoot,'tsconfig.base.json'));
mkdirSync(join(releaseRoot,'scripts')); cpSync(join(root,'scripts/build-package.mjs'),join(releaseRoot,'scripts/build-package.mjs'));
writeJson(join(releaseRoot,'package.json'),{private:true,type:'module',dependencies:{'@barocss/doc-sync':tarballs['doc-sync'],...versions(['slate']),typescript:json(join(root,'node_modules/typescript/package.json')).version,'@types/node':lock.packages['node_modules/@types/node'].version}});
run(npm,['install','--ignore-scripts','--no-audit','--no-fund'],releaseRoot);
const independent = join(releaseRoot,'packages/doc-sync-slate'); cpSync(join(root,'packages/doc-sync-slate'),independent,{recursive:true,filter:source=>!source.includes('/node_modules')});
const patch = json(join(independent,'package.json')); patch.version='0.0.1'; writeJson(join(independent,'package.json'),patch);
const patchPack=JSON.parse(run(npm,['pack','--json','--pack-destination',temp],independent))[0];
const patchPath=join(temp,patchPack.filename); const original=tarballs['doc-sync-slate']; tarballs['doc-sync-slate']=patchPath;
const patched=consumer('independent-binding-patch',['doc-sync','doc-sync-slate'],versions(['slate']));
script(patched, unifiedBindingSource('doc-sync-slate'));
assert.equal(json(join(patched,'node_modules/@barocss/doc-sync-slate/package.json')).version,'0.0.1');
assert.equal(json(join(patched,'node_modules/@barocss/doc-sync/package.json')).version,'0.0.0');
tarballs['doc-sync-slate']=original;
for(const name of names) assert.deepEqual(walk(join(root,'packages',name,'dist')).map(file=>[file,digest(file)]),before[name]);
cases.push({name:'independent-slate-0.0.1-with-unchanged-core',status:'PASS',directory:patched,siblingDistUnchanged:true});
const receipt = {status:'PASS',node:process.version,typescript:json(join(root,'node_modules/typescript/package.json')).version,temp,packages:packs,cases,registryPublished:false,privateFlagsRetained:true};
writeJson(join(output,'pack-consumers.json'),receipt);
console.log(JSON.stringify({status:receipt.status,cases:cases.map(x=>({name:x.name,status:x.status})),receipt:join(output,'pack-consumers.json')},null,2));
