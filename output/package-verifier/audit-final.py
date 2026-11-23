import tarfile,pathlib,json,re,hashlib
root=pathlib.Path('/Users/user/github/doc-sync-bindings');out=root/'output/package-verifier';packs=[];errors=[];owners={name:[] for name in ['Doc','History','PmBinding','SlateBinding','LexicalBinding']};externals={}
receipt=json.loads((root/'output/binding-packages/pack-consumers.json').read_text())
for path in sorted((root/'output/binding-packages').glob('*.tgz')):
 with tarfile.open(path) as tar:
  files={m.name:tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()};pkg=json.loads(files['package/package.json']);targets=[];externals[pkg['name']]=set()
  for key,value in pkg['exports'].items():
   for kind,target in value.items():
    name='package/'+target.removeprefix('./');targets.append(name)
    if name not in files:errors.append(f'{pkg["name"]} absent {key} {kind}: {target}')
    if kind=='types' and not target.endswith('.d.ts'):errors.append('non declaration '+target)
    if kind!='types' and not target.endswith('.js'):errors.append('non JS '+target)
  for name,data in files.items():
   if '/src/' in name or (name.endswith('.ts') and not name.endswith('.d.ts')):errors.append('source leaked '+name)
   if not name.endswith(('.js','.d.ts')):continue
   text=data.decode()
   if re.search(r'/Users/|doc-sync-bindings|file://',text):errors.append('absolute/worktree path '+name)
   if name.endswith('.js'):
    if re.search(r'(?:from\s*|import\s*\()["\'][^"\']+\.ts["\']',text):errors.append('ts runtime import '+name)
    for cls in owners:
     if re.search(r'\bclass\s+'+cls+r'\b',text):owners[cls].append(pkg['name']+':'+name)
    for spec in re.findall(r'(?:from\s*|import\s*\()["\']([^"\']+)["\']',text):
     if not spec.startswith(('.', 'node:')):externals[pkg['name']].add(spec)
     if spec.startswith('.') and not spec.endswith('.js'):errors.append('non-js relative '+name+':'+spec)
   if pkg['name']!='@barocss/doc-sync' and re.search(r'["\']@barocss/doc-sync(?:/|["\'])',text):errors.append('binding/core facade import '+name)
  sha=hashlib.sha256(path.read_bytes()).hexdigest();expected=next(p['sha256'] for p in receipt['packages'] if p['name']==pkg['name'].removeprefix('@barocss/'))
  if sha!=expected:errors.append('receipt hash mismatch '+pkg['name'])
  packs.append({'name':pkg['name'],'manifest':pkg,'sha256':sha,'files':list(files),'exportTargets':targets,'jsCount':sum(n.endswith('.js') for n in files),'declarationCount':sum(n.endswith('.d.ts') for n in files)})
byname={p['name']:p['manifest'] for p in packs};active=set();done=set()
def visit(name):
 if name in active:errors.append('cycle at '+name);return
 if name in done:return
 active.add(name)
 for dep in {**byname[name].get('dependencies',{}),**byname[name].get('peerDependencies',{})}:
  if dep.startswith('@barocss/'):
   if dep not in byname:errors.append('missing internal '+dep)
   else:visit(dep)
 active.remove(name);done.add(name)
for name in byname:visit(name)
for cls,locations in owners.items():
 if len(locations)!=1:errors.append(cls+' owner count '+str(len(locations)))
report={'status':'FAIL' if errors else 'PASS','firstFailure':errors[0] if errors else None,'errors':errors,'packages':packs,'finalFreezeVerified':True,'scope':'Final frozen tarball JS/declaration exports, dependency graph, no source leak, single class definitions; hashes matched to external consumer receipt'}
(out/'tarball-audit.json').write_text(json.dumps(report,indent=2)+'\n')
module={'status':report['status'],'errors':errors,'classDefinitions':owners,'runtimeExternalImports':{k:sorted(v) for k,v in externals.items()},'artifactHashes':{p['name']:p['sha256'] for p in packs},'scope':'Final frozen tarball JS static class definitions and runtime imports'}
(out/'module-ownership.json').write_text(json.dumps(module,indent=2)+'\n')
print(json.dumps({'status':report['status'],'errors':errors,'packages':[{k:p[k] for k in ['name','jsCount','declarationCount','sha256']} for p in packs]},indent=2))
