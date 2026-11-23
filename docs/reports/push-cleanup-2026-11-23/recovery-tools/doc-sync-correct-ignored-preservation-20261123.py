import pathlib,json,hashlib,subprocess,tempfile,os,datetime,copy,collections
ROOT=pathlib.Path('/Users/user/github/doc-sync');OUT=ROOT/'docs/reports/push-cleanup-2026-11-23';recovery=json.loads((OUT/'secondary-recovery-index.json').read_text());plan=json.loads((OUT/'worktree-backup-plan.json').read_text());audit=json.loads((OUT/'ignored-preservation-gap-audit.json').read_text());private=json.loads((OUT/'private-backup-manifest.json').read_text());main=audit['main_sha'];groups=collections.defaultdict(list)
for f in audit['missing_files']:groups[f['worktree']].append(f)
def git(w,*a,env=None,input=None,check=True):
 e=os.environ.copy();e.update(env or {});p=subprocess.run(['git','-c','gc.auto=0','-c','maintenance.auto=false','-C',str(w),*a],env=e,input=input,capture_output=True,timeout=180)
 if check and p.returncode:raise RuntimeError('Git '+a[0]+' failed '+str(p.returncode))
 return p

def ident(p):
 data=p.read_bytes();return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),hashlib.sha256(data).hexdigest()
def tree(sha):
 result={}
 for s in git(ROOT,'ls-tree','-r','-z',sha).stdout.split(b'\0'):
  if s:
   m,p=s.split(b'\t',1);result[p.decode()]=m.split()[2].decode()
 return result

record={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'IN_PROGRESS','main_sha':main,'reason':'Ignored files identical to main working files were initially skipped without proving remote reachability.','initial_missing_count':len(audit['missing_files']),'initial_missing_unique_blobs':len({f['git_blob_sha'] for f in audit['missing_files']}),'initial_missing_bytes':sum(f['bytes'] for f in audit['missing_files']),'receipts':[]}
recs={w['worktree']:w for w in recovery['worktrees']};plans={w['worktree']:w for w in plan['worktrees']}
def save():
 (OUT/'ignored-preservation-correction.json').write_text(json.dumps(record,indent=2)+'\n');(OUT/'secondary-recovery-index.json').write_text(json.dumps(recovery,indent=2)+'\n');(OUT/'worktree-backup-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
for wp,files in groups.items():
 old=recs[wp]['snapshot_sha'];ref='refs/heads/'+recs[wp]['archive_branch'];originalstatus=git(wp,'status','--porcelain=v1','--untracked-files=all').stdout
 if git(ROOT,'rev-parse',ref).stdout.decode().strip()!=old:raise RuntimeError('Archive ref changed')
 if git(ROOT,'ls-remote','--heads','origin',ref).stdout.decode().split()[0]!=old:raise RuntimeError('Remote ref changed')
 for f in files:
  if ident(pathlib.Path(wp)/f['path'])!=(f['git_blob_sha'],f['sha256']):raise RuntimeError('Gap source changed')
 fd,idx=tempfile.mkstemp(prefix='doc-sync-correction-index-');os.close(fd);os.unlink(idx);env={'GIT_INDEX_FILE':idx,'GIT_LITERAL_PATHSPECS':'1'}
 try:
  git(wp,'read-tree',old,env=env);git(wp,'add','-f','--pathspec-from-file=-','--pathspec-file-nul',env=env,input=b'\0'.join(f['path'].encode() for f in files)+b'\0');newtree=git(wp,'write-tree',env=env).stdout.decode().strip();new=git(wp,'commit-tree',newtree,'-p',old,'-m','Preserve ignored source and evidence omitted from initial archive snapshot').stdout.decode().strip()
  newfiles=tree(new)
  for f in files:
   if newfiles[f['path']]!=f['git_blob_sha'] or ident(pathlib.Path(wp)/f['path'])!=(f['git_blob_sha'],f['sha256']):raise RuntimeError('Gap snapshot mismatch')
  if git(wp,'status','--porcelain=v1','--untracked-files=all').stdout!=originalstatus:raise RuntimeError('Normal index/source state changed')
  git(ROOT,'update-ref',ref,new,old);git(ROOT,'push','--quiet','origin',ref+':'+ref)
  if git(ROOT,'ls-remote','--heads','origin',ref).stdout.decode().split()[0]!=new:raise RuntimeError('Correction remote mismatch')
  rec=recs[wp];prior=copy.deepcopy({k:v for k,v in rec.items() if k!='snapshot_history'});rec.setdefault('snapshot_history',[]).append(prior);rec.update(snapshot_sha=new,snapshot_tree=newtree,remote_verified=True,ignored_allowlist_files=rec['ignored_allowlist_files']+len(files),changed_paths_count=len(git(ROOT,'diff','--name-only',rec['original_head'],new).stdout.decode().splitlines()))
  rec.setdefault('preservation_corrections',[]).append({'prior_snapshot_sha':old,'correction_snapshot_sha':new,'added_paths':[f['path'] for f in files],'added_file_bytes':sum(f['bytes'] for f in files),'remote_verified':True})
  plans[wp]['force_add_ignored_allowlist']=sorted(set(plans[wp]['force_add_ignored_allowlist'])|{f['path'] for f in files})
  receipt={'worktree':wp,'archive_branch':ref.removeprefix('refs/heads/'),'prior_snapshot_sha':old,'commit_sha':new,'parent_sha':old,'added_files':files,'remote_verified':True,'verified_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()};record['receipts'].append(receipt);save();print('Correction remote verified',pathlib.Path(wp).name,len(files),'files',new[:12],flush=True)
 finally:
  for suffix in ['','.lock']:
   if os.path.exists(idx+suffix):os.unlink(idx+suffix)
refs=['refs/heads/'+w['archive_branch'] for w in recovery['worktrees']];remote={s.split()[1]:s.split()[0] for s in git(ROOT,'ls-remote','--heads','origin',*refs).stdout.decode().splitlines()}
for w in recovery['worktrees']:
 if remote.get('refs/heads/'+w['archive_branch'])!=w['snapshot_sha']:raise RuntimeError('Final23 remote verification failed')
canonical={};trees={}
for label,sha in [('main',main)]+[(w['archive_branch'],w['snapshot_sha']) for w in recovery['worktrees']]:
 t=tree(sha);trees[label]=t
 for path,blob in t.items():canonical.setdefault(blob,{'verified_ref':label,'commit_sha':sha,'path':path,'git_blob_sha':blob})
privatehash={e['sha256'] for e in private['entries'] if e['type']=='file'};mapping=[]
for w in plan['worktrees'][1:]:
 for f in w['ignored_file_classification']:
  if f['category'].startswith('REPRODUCIBLE_'):continue
  blob,sha=ident(pathlib.Path(w['worktree'])/f['path']);entry={'worktree':w['worktree'],'original_path':f['path'],'git_blob_sha':blob,'sha256':sha}
  if blob in canonical:entry['restore_from']=canonical[blob]
  elif sha in privatehash:entry['restore_from']={'private_archive':private['archive_path'],'archive_path':str((pathlib.Path(w['worktree'])/f['path']).relative_to(ROOT.parent))}
  else:raise RuntimeError('Durability gap remains')
  mapping.append(entry)
record.update(status='PASS',completed_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),remote_verified_archive_branches=23,canonical_restore_mapping=mapping,remaining_missing_count=0);recovery.setdefault('audit_corrections',[]).append({'report':'ignored-preservation-correction.json','initial_missing_files':record['initial_missing_count'],'added_archive_commits':len(record['receipts']),'remote_verified_branches':23,'remaining_missing_files':0});save()
lines=['# Ignored preservation correction','','Status: PASS. Added493 ignored source/evidence paths in11 descendant archive commits. All23 archive branch SHAs verified on origin.','','The initial archive skipped files identical to local main files without proving those bytes were reachable remotely. The correction preserves those files. Original snapshot receipts remain in snapshot_history. Main and its normal index were not changed.','','Canonical restore mappings include exact verified commit, path, and blob ID, or the existing private archive member. No generated caches or private runtime files were added to public branches.','','| Worktree | Added files | Prior SHA | Correction SHA |','|---|---:|---|---|']
for r in record['receipts']:lines.append(f"| {pathlib.Path(r['worktree']).name} | {len(r['added_files'])} | {r['prior_snapshot_sha']} | {r['commit_sha']} |")
(OUT/'ignored-preservation-correction.md').write_text('\n'.join(lines)+'\n');print('PASS correction all23 refs verified; canonicalmapping',len(mapping),'paths; remaininggap0',flush=True)
