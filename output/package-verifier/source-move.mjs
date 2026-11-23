import ts from '../../node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
import path from 'node:path';
const baseline='/Users/user/github/doc-sync/packages/doc-sync/src';const current='/Users/user/github/doc-sync-bindings/packages';
const mappings={crdt:'doc-sync-core/src/crdt',sync:'doc-sync-core/src/sync',editor:'doc-sync-core/src/editor',server:'doc-sync-core/src/server',pm:'doc-sync-prosemirror/src',tiptap:'doc-sync-tiptap/src',slate:'doc-sync-slate/src',lexical:'doc-sync-lexical/src'};
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
function implementation(file){const text=fs.readFileSync(file,'utf8');const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);const nodes=source.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n));return nodes.map(n=>ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Unspecified,n,source)).join('\n');}
const results=[];
for(const [oldDir,newDir] of Object.entries(mappings)) for(const old of walk(path.join(baseline,oldDir)).filter(f=>f.endsWith('.ts'))){const relative=path.relative(path.join(baseline,oldDir),old);const target=path.join(current,newDir,relative);results.push({file:oldDir+'/'+relative,target:target.slice(current.length+1),exists:fs.existsSync(target),implementationEqual:fs.existsSync(target)&&implementation(old)===implementation(target)});}
const report={status:results.every(r=>r.exists&&r.implementationEqual)?'PASS':'FAIL',scope:'All existing implementation AST statements excluding imports/reexports/comments, baseline main source versus extracted canonical source. Public exported symbol names checked separately.',fileCount:results.length,changed:results.filter(r=>!r.implementationEqual),results};
fs.writeFileSync('output/package-verifier/source-move.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,fileCount:report.fileCount,changed:report.changed},null,2));
