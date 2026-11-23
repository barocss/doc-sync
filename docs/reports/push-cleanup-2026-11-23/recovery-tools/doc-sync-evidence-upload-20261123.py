import pathlib,subprocess,os,tempfile,json,hashlib,datetime,time,re
ROOT=pathlib.Path('/Users/user/github/doc-sync');OUT=ROOT/'docs/reports/push-cleanup-2026-11-23';BASE='3e100844c08607c3f107e7e6f9109a060488a4da';REF='refs/heads/codex/archive/20261123/verification-evidence';LIMIT=160*1024*1024
OUT.mkdir(parents=True,exist_ok=True)
def git(*a,env=None,input=None,timeout=180,check=True):
 e=os.environ.copy();e.update(env or {});p=subprocess.run(['git','-c','gc.auto=0','-c','maintenance.auto=false','-C',str(ROOT),*a],env=e,input=input,capture_output=True,timeout=timeout)
 if check and p.returncode:raise RuntimeError('git '+a[0]+' failed exit '+str(p.returncode)+' '+re.sub(r'https?://\S+','[remote]',p.stderr.decode(errors='replace')[-1000:]))
 return p

def sha256(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
if git('rev-parse','--verify',REF,check=False).returncode==0:raise RuntimeError('Archive ref exists; refuse overwrite')
if git('ls-remote','--heads','origin',REF).stdout.strip():raise RuntimeError('Remote archive ref exists; refuse overwrite')
raw=git('ls-files','--others','--exclude-standard','-z','--','docs/reports').stdout.decode();files=[]
for s in raw.split('\0'):
 if s and s.endswith(('.tar.gz','.tgz','.gz','.zip')):
  p=ROOT/s;size=p.stat().st_size
  if size>=100*1024*1024:raise RuntimeError('Archive exceeds file size cap')
  files.append({'path':s,'bytes':size,'sha256':sha256(p)})
if len(files)!=31 or sum(f['bytes'] for f in files)!=1046335543:raise RuntimeError('Evidence inventory differs from authorized31 archive snapshot')
chunks=[];cur=[];size=0
for f in files:
 if cur and size+f['bytes']>LIMIT:chunks.append(cur);cur=[];size=0
 cur.append(f);size+=f['bytes']
if cur:chunks.append(cur)
state={'status':'IN_PROGRESS','base_sha':BASE,'archive_branch':REF.removeprefix('refs/heads/'),'archive_count':len(files),'archive_bytes':sum(f['bytes'] for f in files),'chunk_limit_bytes':LIMIT,'files':files,'chunks':[],'archive_entry_path_review':'Previously reviewed by parent; source/private files outside this scope.','normal_index_touched':False,'main_ref_touched':False}
def save():
 (OUT/'evidence-upload.json').write_text(json.dumps(state,indent=2)+'\n')
 lines=['# Verification evidence upload','',f"Status: {state['status']}. {len(state['chunks'])}/{len(chunks)} chunks recorded; {len(files)} archives; {state['archive_bytes']} bytes.",'',f"Backup branch: {state['archive_branch']}",f"Base: {BASE}",'','Only the listed archive files are added. Main and its normal index are unchanged by this task.','','| Chunk | Files | Bytes | Commit | Remote SHA |','|---|---:|---:|---|---|']
 for c in state['chunks']:lines.append(f"| {c['number']} | {len(c['files'])} | {c['bytes']} | {c['commit_sha']} | {'verified' if c.get('remote_verified') else 'pending'} |")
 (OUT/'evidence-upload.md').write_text('\n'.join(lines)+'\n')
save();print('Inventory verified:31 files 1046335543 bytes;',len(chunks),'chunks',flush=True)
fd,idx=tempfile.mkstemp(prefix='doc-sync-evidence-index-');os.close(fd);os.unlink(idx);env={'GIT_INDEX_FILE':idx,'GIT_LITERAL_PATHSPECS':'1'};parent=BASE
try:
 git('read-tree',BASE,env=env)
 for i,chunk in enumerate(chunks,1):
  started=time.monotonic()
  for f in chunk:
   p=ROOT/f['path']
   if p.stat().st_size!=f['bytes'] or sha256(p)!=f['sha256']:raise RuntimeError('Evidence input changed')
  git('add','--pathspec-from-file=-','--pathspec-file-nul',env=env,input=b'\0'.join(f['path'].encode() for f in chunk)+b'\0')
  staged=git('ls-files','--stage','-z',env=env).stdout.decode();blobmap={}
  for entry in staged.split('\0'):
   if entry:
    meta,path=entry.split('\t',1);blobmap[path]=meta.split()[1]
  for f in chunk:
   f['git_blob_sha']=blobmap[f['path']]
   if sha256(ROOT/f['path'])!=f['sha256']:raise RuntimeError('Evidence input changed during stage')
  tree=git('write-tree',env=env).stdout.decode().strip();commit=git('commit-tree',tree,'-p',parent,'-m',f'Preserve verification evidence chunk {i}/{len(chunks)} before cleanup').stdout.decode().strip()
  git('update-ref',REF,commit,parent if i>1 else '0'*40)
  rec={'number':i,'files':[f['path'] for f in chunk],'bytes':sum(f['bytes'] for f in chunk),'parent_sha':parent,'commit_sha':commit,'tree_sha':tree,'remote_verified':False};state['chunks'].append(rec);save()
  git('push','--quiet','origin',REF+':'+REF,timeout=180)
  remote=git('ls-remote','--heads','origin',REF).stdout.decode().split()
  if not remote or remote[0]!=commit:raise RuntimeError('Remote archive SHA mismatch')
  rec.update(remote_verified=True,remote_sha=remote[0],elapsed_seconds=round(time.monotonic()-started,3),verified_utc=datetime.datetime.now(datetime.timezone.utc).isoformat());parent=commit;save();print(f'Chunk {i}/{len(chunks)} remote verified: {len(chunk)} files {rec["bytes"]} bytes {commit[:12]} in {rec["elapsed_seconds"]}s',flush=True)
 state.update(status='PASS',final_remote_sha=parent,remote_verified_archive_count=sum(len(c['files']) for c in state['chunks'] if c['remote_verified']),completed_utc=datetime.datetime.now(datetime.timezone.utc).isoformat());save();print('PASS: all31 archives remote backed;',parent,flush=True)
except Exception as e:
 state['status']='FAIL';state['failure']=str(e);save();raise
finally:
 for suffix in ['','.lock']:
  if os.path.exists(idx+suffix):os.unlink(idx+suffix)
