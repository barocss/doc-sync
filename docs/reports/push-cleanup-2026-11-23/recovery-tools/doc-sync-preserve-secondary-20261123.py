import pathlib,json,hashlib,tarfile,os,tempfile,subprocess,datetime,stat
ROOT=pathlib.Path('/Users/user/github/doc-sync'); OUT=ROOT/'docs/reports/push-cleanup-2026-11-23'; PLAN=json.loads((OUT/'worktree-backup-plan.json').read_text()); BACKUP=pathlib.Path('/Users/user/github/doc-sync-private-backup-20261123.tar.gz')
def hfile(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1048576),b''):h.update(c)
 return h.hexdigest()
def git(w,*a,env=None,input=None,check=True):
 e=os.environ.copy();e.update(env or {});p=subprocess.run(['git','-c','gc.auto=0','-c','maintenance.auto=false','-C',str(w),*a],env=e,input=input,capture_output=True)
 if check and p.returncode:raise RuntimeError('git '+a[0]+' failed: '+p.stderr.decode(errors='replace')[:1600])
 return p
state={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'private_archive':str(BACKUP),'worktrees':[],'remote_verified_count':0,'status':'IN_PROGRESS'}
def save(): (OUT/'secondary-recovery-index.json').write_text(json.dumps(state,indent=2)+'\n')
# Build a private archive from explicit secondary paths and main runtime roots.
entries={}
for w in PLAN['worktrees'][1:]:
 for rel in w['private_ignored_retain_paths']:
  p=pathlib.Path(w['worktree'])/rel
  if not p.exists() and not p.is_symlink():raise RuntimeError('Private input missing: '+str(p))
  entries[str(p.relative_to(ROOT.parent))]=p
for name in ['data','.doc-sync-bots','.doc-sync-recovery']:
 base=ROOT/name
 if base.exists():
  for p in [base,*sorted(base.rglob('*'))]:entries[str(p.relative_to(ROOT.parent))]=p
for p in ROOT.iterdir():
 if p.is_file() and (p.name.startswith('.env') or p.name.endswith('.env')):entries[str(p.relative_to(ROOT.parent))]=p
manifest=[]
for arc,p in sorted(entries.items()):
 rec={'archive_path':arc,'type':'symlink' if p.is_symlink() else ('directory' if p.is_dir() else 'file')}
 if rec['type']=='file':rec.update(bytes=p.stat().st_size,sha256=hfile(p))
 if rec['type']=='symlink':rec['link_target_sha256']=hashlib.sha256(os.readlink(p).encode()).hexdigest()
 manifest.append(rec)
if BACKUP.exists():raise RuntimeError('Private backup already exists; refusing overwrite')
fd,tmp=tempfile.mkstemp(prefix='.doc-sync-private-',suffix='.tar.gz',dir=str(ROOT.parent));os.close(fd)
try:
 os.chmod(tmp,0o600)
 with tarfile.open(tmp,'w:gz',compresslevel=6,dereference=False) as tf:
  for arc,p in sorted(entries.items()):tf.add(p,arcname=arc,recursive=False)
 with tarfile.open(tmp,'r:gz') as tf:
  seen={}
  for m in tf:
   if m.isfile():
    f=tf.extractfile(m);h=hashlib.sha256();n=0
    for c in iter(lambda:f.read(1048576),b''):h.update(c);n+=len(c)
    seen[m.name]=(n,h.hexdigest())
  for rec in manifest:
   if rec['type']=='file' and seen.get(rec['archive_path'])!=(rec['bytes'],rec['sha256']):raise RuntimeError('Archive readback mismatch')
 for rec in manifest:
  if rec['type']=='file' and hfile(entries[rec['archive_path']])!=rec['sha256']:raise RuntimeError('Private source changed during backup')
 os.rename(tmp,BACKUP)
finally:
 if os.path.exists(tmp):os.unlink(tmp)
private={'archive_path':str(BACKUP),'archive_bytes':BACKUP.stat().st_size,'archive_sha256':hfile(BACKUP),'entry_count':len(manifest),'regular_file_count':sum(m['type']=='file' for m in manifest),'source_file_bytes':sum(m.get('bytes',0) for m in manifest),'readback_verified':True,'entries':manifest}
(OUT/'private-backup-manifest.json').write_text(json.dumps(private,indent=2)+'\n');state['private_backup']={k:v for k,v in private.items() if k!='entries'};save();print('Private archive verified',private['regular_file_count'],'files',private['archive_bytes'],'bytes',flush=True)
for w in PLAN['worktrees'][1:]:
 wp=pathlib.Path(w['worktree']);head=w['snapshot_head'];ref='refs/heads/'+w['archive_branch']
 if git(wp,'rev-parse','HEAD').stdout.decode().strip()!=head:raise RuntimeError('HEAD changed '+str(wp))
 before=git(wp,'status','--porcelain=v1','--untracked-files=all').stdout
 paths=w['tracked_change_paths']+w['untracked_source_evidence_paths']; forced=w['force_add_ignored_allowlist']
 prohibited=set(w['private_ignored_retain_paths'])|{x['path'] for x in w['public_path_flags']}
 if prohibited.intersection(paths+forced):raise RuntimeError('Private path in public inputs')
 expected={x['path']:x['sha256'] for x in w['ignored_file_classification']}
 stable={}
 for rel in paths+forced:
  p=wp/rel
  if p.is_file() and not p.is_symlink():stable[rel]=hfile(p)
  if rel in forced and (not p.is_file() or stable.get(rel)!=expected[rel]):raise RuntimeError('Ignored source changed/missing '+str(p))
 fd,idx=tempfile.mkstemp(prefix='doc-sync-archive-index-');os.close(fd);os.unlink(idx);env={'GIT_INDEX_FILE':idx,'GIT_LITERAL_PATHSPECS':'1'}
 try:
  git(wp,'read-tree',head,env=env)
  if paths:git(wp,'add','-A','--pathspec-from-file=-','--pathspec-file-nul',env=env,input=b'\0'.join(x.encode() for x in paths)+b'\0')
  if forced:git(wp,'add','-f','--pathspec-from-file=-','--pathspec-file-nul',env=env,input=b'\0'.join(x.encode() for x in forced)+b'\0')
  for rel,sha in stable.items():
   if hfile(wp/rel)!=sha:raise RuntimeError('Source changed while snapshotting '+str(wp/rel))
  if git(wp,'status','--porcelain=v1','--untracked-files=all').stdout!=before:raise RuntimeError('Worktree status changed during snapshot '+str(wp))
  tree=git(wp,'write-tree',env=env).stdout.decode().strip();original_tree=git(wp,'rev-parse',head+'^{tree}').stdout.decode().strip()
  existing=git(wp,'rev-parse','--verify',ref,check=False)
  if existing.returncode==0:
   sha=existing.stdout.decode().strip()
   if git(wp,'rev-parse',sha+'^{tree}').stdout.decode().strip()!=tree:raise RuntimeError('Existing archive ref differs '+ref)
  else:
   sha=head if tree==original_tree else git(wp,'commit-tree',tree,'-p',head,'-m','Archive '+wp.name+' work before disk cleanup (2026-11-23)').stdout.decode().strip()
   git(wp,'update-ref',ref,sha,'0'*40)
  changed=git(wp,'diff','--name-only',head,sha).stdout.decode().splitlines()
  rec={'worktree':str(wp),'original_head':head,'archive_branch':w['archive_branch'],'snapshot_sha':sha,'snapshot_tree':tree,'changed_paths_count':len(changed),'input_regular_files':len(stable),'input_file_bytes':sum((wp/r).stat().st_size for r in stable),'ignored_allowlist_files':len(forced),'normal_index_preserved':True,'source_stability_verified':True,'remote_verified':False}
  state['worktrees'].append(rec);save();print('Snapshot ready',wp.name,sha[:12],len(changed),'paths',flush=True)
 finally:
  for suffix in ['', '.lock']:
   if os.path.exists(idx+suffix):os.unlink(idx+suffix)
refs=['refs/heads/'+w['archive_branch'] for w in state['worktrees']]
git(ROOT,'push','origin',*[r+':'+r for r in refs]);print('Pushed',len(refs),'archive refs',flush=True)
remote=git(ROOT,'ls-remote','--heads','origin',*refs).stdout.decode().splitlines();found={x.split()[1]:x.split()[0] for x in remote}
for w in state['worktrees']:
 ref='refs/heads/'+w['archive_branch'];w['remote_verified']=found.get(ref)==w['snapshot_sha']
 if not w['remote_verified']:raise RuntimeError('Remote archive verification failed '+ref)
state['remote_verified_count']=len(state['worktrees']);state['status']='PASS';save()
lines=['# Secondary worktree recovery index','',f"Status: PASS. All {len(refs)} archive branch SHAs verified with origin.",'',f"Private archive: {BACKUP}",f"Private archive SHA-256: {private['archive_sha256']}",f"Private archive size: {private['archive_bytes']} bytes; {private['regular_file_count']} regular files. Every regular file was read back and hash verified.",'','Original worktree branches and normal indexes were preserved. No worktrees or source files were deleted.','','| Worktree | Archive branch | SHA | Changed paths | Remote |','|---|---|---|---:|---|']
for w in state['worktrees']:lines.append(f"| {pathlib.Path(w['worktree']).name} | {w['archive_branch']} | {w['snapshot_sha']} | {w['changed_paths_count']} | verified |")
(OUT/'secondary-recovery-index.md').write_text('\n'.join(lines)+'\n');print('PASS all',len(refs),'remote archive SHAs verified',flush=True)
