// Untimed structural diagnostic. Never import or call a stopwatch.
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from '../../../node_modules/typescript/lib/typescript.js';
assert.equal(process.version,'v24.22.1');
const [tree,output]=process.argv.slice(2),source=resolve(tree),base=pathToFileURL(source+'/').href;
const hash=x=>createHash('sha256').update(x).digest('hex');
const receipt=JSON.parse(readFileSync(resolve(import.meta.dirname,'../fallback-controls/abba-final-01/cycle1-doc-1-A.json')));
let phase='import';const counts={},definitions={},loaded=[];
globalThis.__countHit=label=>{const row=counts[phase]??(counts[phase]={});row[label]=(row[label]??0)+1;};
function tokens(text){const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,text),parts=[];for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan())parts.push(scanner.getTokenText());return hash(parts.join('\n'));}
registerHooks({load(url,context,next){const result=next(url,context);if(!url.startsWith(base)||!url.endsWith('.ts'))return result;const path=url.slice(base.length);loaded.push(path);const text=String(result.source),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),edits=[],anonymous=new Map();
 function visit(node,owner='module'){
  let label=owner;
  const callable=ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isGetAccessor(node)||ts.isSetAccessor(node)||ts.isConstructorDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node);
  if(callable&&node.body){
   if(ts.isConstructorDeclaration(node))label=(node.parent.name?.text??'class')+'.constructor';
   else if(ts.isMethodDeclaration(node)||ts.isGetAccessor(node)||ts.isSetAccessor(node))label=(node.parent.name?.text??owner)+'.'+node.name.getText(ast);
   else if(node.name)label=node.name.text;
   else if(ts.isVariableDeclaration(node.parent)&&ts.isIdentifier(node.parent.name))label=node.parent.name.text;
   else{const n=anonymous.get(owner)??0;anonymous.set(owner,n+1);label=owner+'/callback'+n;}
   const key=path+':'+label;definitions[key]=tokens(node.body.getText(ast));
   const call='globalThis.__countHit('+JSON.stringify(key)+');';
   if(ts.isBlock(node.body))edits.push([node.body.getStart(ast)+1,call]);
   else{edits.push([node.body.getStart(ast),'(globalThis.__countHit('+JSON.stringify(key)+'),(']);edits.push([node.body.end, '))']);}
  }
  ts.forEachChild(node,child=>visit(child,label));
 }
 visit(ast);let changed=text;for(const [at,insert] of edits.sort((a,b)=>b[0]-a[0]))changed=changed.slice(0,at)+insert+changed.slice(at);
 return {...result,source:changed};
}});
const {Doc}=await import(base+'crdt/doc.ts');
phase='seed';const pattern='ab가🙂cd한글XYZ';let text=pattern.repeat(Math.ceil(100000/pattern.length)).slice(0,100000);if(/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1)+'a';assert.equal(hash(text),receipt.seedTextSHA);
const seed=new Doc(receipt.seedActor,receipt.schema);seed.edit([{op:'insert',at:[0,0],content:text}]);seed.toJSON();const snapshot=seed.snapshot();assert.equal(hash(JSON.stringify(snapshot)),receipt.fixtureSHA);
phase='restore';const local=Doc.fromSnapshot(receipt.actor,snapshot,receipt.schema),remote=Doc.fromSnapshot(receipt.actor,snapshot,receipt.schema);
phase='local';const result=local.edit(receipt.edits),localModel=local.toJSON();assert.equal(hash(JSON.stringify(result.ops)),receipt.expectedOperationSHA);const wire=JSON.parse(JSON.stringify(result.ops));assert.equal(wire.length,16);
phase='remote';for(const op of wire)remote.apply(op);
phase='oracle';assert.equal(hash(JSON.stringify(remote.toJSON())),receipt.expectedModelSHA);assert.equal(hash(JSON.stringify(remote.snapshot())),receipt.expectedSnapshotSHA);assert.deepEqual(remote.toJSON(),localModel);
const files={};function manifest(d){for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(d,e.name);if(e.isDirectory())manifest(p);else files[relative(source,p)]=hash(readFileSync(p));}}manifest(source);
const closure=hash(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,h])=>h+'  '+p+'\n').join(''));
writeFileSync(output,JSON.stringify({status:'PASS',diagnostic:'UNTIMED; source hooks; not performance evidence',source,closure,loaded,wireOperations:wire.length,operationSHA:hash(JSON.stringify(wire)),modelSHA:hash(JSON.stringify(localModel)),snapshotSHA:receipt.expectedSnapshotSHA,counts,definitions},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',output,closure,remoteFunctions:Object.keys(counts.remote).length,remoteFunctionCalls:Object.values(counts.remote).reduce((a,b)=>a+b,0)}));
