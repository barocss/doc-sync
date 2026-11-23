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
private=json.loads((OUT/'private-backup-manifest.json').read_text())
if hfile(BACKUP)!=private['archive_sha256']:raise RuntimeError('Existing private archive hash differs')
state['private_backup']={k:v for k,v in private.items() if k!='entries'}
save()
print('Reused verified private backup',private['archive_sha256'],flush=True)
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
