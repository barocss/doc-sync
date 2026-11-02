import assert from 'node:assert/strict';
import {chmod,link,mkdtemp,mkdir,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {claimProfile,createProfile,loadProfile,listProfiles,profileActor} from '../src/profiles.ts';
import {runMission} from '../src/runner.ts';

test('profiles persist, reject overwrites and keep document-scoped identities', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profiles-'));
 try{
  const profile=await createProfile(dir,{id:'mori',name:'Mori',character:'fox',personality:'curious',role:'writer',color:'#a14418'});
  assert.deepEqual(await loadProfile(dir,'mori'),profile);
  assert.deepEqual(await listProfiles(dir),[profile]);
  await assert.rejects(createProfile(dir,{...profile,name:'Overwrite'}),/exist/i);
  assert.equal((await loadProfile(dir,'mori')).name,'Mori');
  await assert.rejects(loadProfile(dir,'../mori'),/Invalid profile ID/);
  const actor=profileActor(profile,'http://localhost:5410','doc-one');
  assert.equal(actor,profileActor(await loadProfile(dir,'mori'),'http://localhost:5410','doc-one'));
  assert.notEqual(actor,profileActor(profile,'http://localhost:5410','doc-two'));
  assert.notEqual(actor,profileActor(profile,'http://localhost:5411','doc-one'));
  const nuri=await createProfile(dir,{id:'nuri',name:'Nuri',character:'owl',personality:'careful',role:'reviewer',color:'#7051bd'});
  assert.notEqual(actor,profileActor(nuri,'http://localhost:5410','doc-one'));
  assert.match(actor,/^bot-[a-f0-9]{32}$/);
  const raw=JSON.parse(await readFile(join(dir,'profiles','mori.json'),'utf8'));
  assert.equal(raw.version,1);
  assert.equal((await stat(join(dir,'profiles','mori.json'))).mode & 0o777,0o600);
  assert.equal(profileActor(profile,'http://localhost:5410/','doc-one'),actor);
  assert.throws(()=>profileActor(profile,'http://user:pass@localhost:5410','doc-one'),/Invalid profile server URL/);
  assert.throws(()=>profileActor(profile,'http://localhost:5410?secret=1','doc-one'),/Invalid profile server URL/);
  await writeFile(join(dir,'profiles','broken.json'),'{bad');
  await assert.rejects(loadProfile(dir,'broken'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('profile CLI persists across processes and reports identity without running a model',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profile-cli-'));
 try{
  const cli=fileURLToPath(new URL('../src/main.ts',import.meta.url));
  const invoke=(args:string[])=>spawnSync(process.execPath,[cli,...args,'--state-dir',dir],{encoding:'utf8'});
  const create=invoke(['profile-create','--id','nuri','--name','Nuri','--character','owl','--personality','careful','--role','reviewer','--color','#7051bd']);
  assert.equal(create.status,0,create.stderr);
  const show=invoke(['profile-show','--id','nuri']);assert.equal(show.status,0,show.stderr);
  assert.equal(JSON.parse(show.stdout).role,'reviewer');
  const list=invoke(['profile-list']);assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout).map((p:{id:string})=>p.id),['nuri']);
  const unsafe=invoke(['run','--profile','nuri','--url','http://127.0.0.1:1','--doc','doc','--mission','Review','--ephemeral','true']);
  assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/durable/i);
  const override=invoke(['run','--profile','nuri','--actor','other','--url','http://127.0.0.1:1','--doc','doc','--mission','Review']);
  assert.notEqual(override.status,0);assert.match(override.stderr,/cannot be overridden/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('profile claims exclude other tasks and unresolved records block direct runner calls', {skip:(process.platform!=='darwin'&&process.platform!=='linux')},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profile-claim-'));
 try {
  const profile=await createProfile(dir,{id:'mori',name:'Mori',character:'fox',personality:'curious',role:'writer',color:'#a14418'});
  const url='http://127.0.0.1:5410',document='doc',actor=profileActor(profile,url,document);
  const release=await claimProfile(dir,actor);
  await assert.rejects(claimProfile(dir,actor));await release();
  const again=await claimProfile(dir,actor);await again();
  await mkdir(join(dir,'missions'));
  await writeFile(join(dir,'missions','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.json'),JSON.stringify({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',profileId:profile.id,url,document,actor,status:'running',pending:null,createdAt:'2026-10-29T00:00:00Z'}));
  let planned=false;
  await assert.rejects(runMission({url,document,actor,profileId:profile.id,mission:'Test',stateDir:dir},async()=>{planned=true;return {action:'finish',at:[],text:'',count:0,message:'done'};}),/recovery inspection/);
  assert.equal(planned,false);
  const after=await claimProfile(dir,actor);await after();
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('a killed process releases the profile claim', {timeout:15000,skip:(process.platform!=='darwin'&&process.platform!=='linux')},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profile-claim-kill-'));
 const moduleUrl=new URL('../src/profiles.ts',import.meta.url).href;
 const actor='bot-'+ 'a'.repeat(32);
 const child=spawn(process.execPath,['--input-type=module','-e',`import {claimProfile} from ${JSON.stringify(moduleUrl)}; await claimProfile(process.argv[1],process.argv[2]); console.log('ready'); setInterval(()=>{},1000);`,dir,actor],{stdio:['ignore','pipe','pipe']});
 try{
  let output='';await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('claim child timeout')),10000);child.once('exit',code=>reject(Error(`claim child exited ${code}`)));child.stdout!.on('data',chunk=>{output+=chunk;if(output.includes('ready')){clearTimeout(timer);resolve();}});});
  await assert.rejects(claimProfile(dir,actor));
  const inode=(await stat(join(dir,'claims',`${actor}.lock`))).ino;
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  const release=await claimProfile(dir,actor);
  try {assert.equal((await stat(join(dir,'claims',`${actor}.lock`))).ino,inode);}
  finally {await release();}
 } finally {if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await rm(dir,{recursive:true,force:true});}
});

for(const unsafe of ['symlink','hardlink','public','fifo'])test(`profile claims refuse ${unsafe} lock input without replacing it`,{timeout:15000,skip:process.platform!=='darwin'&&process.platform!=='linux'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profile-private-')),actor='bot-'+'a'.repeat(32);
 const claims=join(dir,'claims'),path=join(claims,`${actor}.lock`),target=join(dir,'target');
 try {
  await mkdir(claims,{mode:0o700});await writeFile(target,'preserve',{mode:0o600});
  if(unsafe==='symlink')await symlink(target,path);
  else if(unsafe==='hardlink')await link(target,path);
  else if(unsafe==='fifo')assert.equal(spawnSync('mkfifo',['-m','600',path]).status,0);
  else {await writeFile(path,'preserve',{mode:0o600});await chmod(path,0o644);}
  const before=await stat(path);
  await assert.rejects(claimProfile(dir,actor));
  assert.equal((await stat(path)).ino,before.ino);
  assert.equal(await readFile(target,'utf8'),'preserve');
  if(unsafe!=='fifo')assert.equal(await readFile(path,'utf8'),'preserve');
  else assert.ok((await stat(path)).isFIFO());
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('canonical state-directory aliases share one claim and retain its private inode',{skip:process.platform!=='darwin'&&process.platform!=='linux'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profile-alias-')),actor='bot-'+'b'.repeat(32),state=join(dir,'state'),alias=join(dir,'alias');
 try {
  await mkdir(state,{mode:0o700});await symlink(state,alias);
  const release=await claimProfile(state,actor),path=join(state,'claims',`${actor}.lock`);
  let inode:number;
  try {
   const file=await stat(path);inode=file.ino;assert.equal(file.mode&0o777,0o600);
   assert.equal((await stat(join(state,'claims'))).mode&0o777,0o700);
   await assert.rejects(claimProfile(alias,actor),/active writer/);
  } finally {await release();}
  const again=await claimProfile(alias,actor);
  try {assert.equal((await stat(path)).ino,inode!);}
  finally {await again();}
 } finally {await rm(dir,{recursive:true,force:true});}
});
