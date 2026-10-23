from pathlib import Path
import os,subprocess,json,tempfile,re,time,hashlib,datetime
root=Path(os.environ.get('DOCSYNC_SOURCE_ROOT',Path.cwd()));base=Path(os.environ['DOCSYNC_MEASURE_OUT']);env=dict(os.environ);env['PATH']='/Users/user/.nvm/versions/node/v22.19.0/bin:'+env['PATH']
data=Path(tempfile.mkdtemp(prefix='doc-sync-roadmap-latency-'))
seed="""import {Doc} from './packages/doc-sync/src/index.ts';import {DEMO_SCHEMA} from './fixtures/demo-schema.ts';import {writeFileSync} from 'node:fs';const doc=new Doc('latency-seed',DEMO_SCHEMA);const content=Array.from({length:625},()=>({type:'paragraph',runs:[{text:'x'.repeat(160),marks:{}}]}));const {ops}=doc.edit([{op:'delete',at:[0],count:1},{op:'insert',at:[0],content}]);writeFileSync(SEED,JSON.stringify({change:{actor:'latency-seed',seq:1,ops}})+'\\n',{flag:'wx'});""".replace('SEED',json.dumps(str(data/'latency100k.jsonl')))
subprocess.run(['node','--input-type=module','-'],input=seed,text=True,cwd=root,env=env,check=True)
serverlog=(base/'server.log').open('x');server=subprocess.Popen(['node',str(base/'server-launch.mjs')],cwd=root,env={**env,'PORT':'0','DATA_DIR':str(data)},stdout=serverlog,stderr=subprocess.STDOUT)
port=None
for _ in range(200):
 m=re.search(r'http://localhost:(\d+)',(base/'server.log').read_text())
 if m:port=int(m[1]);break
 if server.poll() is not None:raise RuntimeError('server failed')
 time.sleep(.05)
assert port
cli='/Users/user/.codex/skills/playwright/scripts/playwright_cli.sh';session=os.environ['DOCSYNC_SESSION'];summary={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':f'http://localhost:{port}/pm?doc=latency100k','serverPid':server.pid,'dataDirectory':str(data),'loadBefore':os.getloadavg(),'status':'running'}
(base/'run.json').write_text(json.dumps(summary,indent=2)+'\n')
def run(label,*args):
 result=subprocess.run([cli,'--session',session,*args],cwd=root,env=env,text=True,capture_output=True)
 (base/(label+'.log')).write_text(result.stdout+result.stderr)
 if result.returncode or '### Error' in result.stdout:raise RuntimeError(label+': '+result.stdout[-1500:]+result.stderr[-500:])
 if '### Result\n' in result.stdout:
  d=json.JSONDecoder().raw_decode(result.stdout.split('### Result\n')[1])[0];(base/(label+'.json')).write_text(json.dumps(d,ensure_ascii=False)+'\n');return d
 return None
def code(label,name,**replacements):
 s=(base/name).read_text()
 for k,v in replacements.items():s=s.replace(k,json.dumps(v))
 p=base/(label+'.js');p.write_text(s)
 return run(label,'run-code','--filename',str(p))
try:
 run('open','open',summary['url'],'--browser','chrome','--headed')
 installed=code('install','install-instrumentation.js');assert installed['charsDemo']==installed['charsPm']==100000
 run('capture','run-code','async page=>{await page.locator(".ProseMirror > p:first-child").click({position:{x:15,y:8}});await page.waitForFunction(()=>__latency.editor&&__latency.binding&&__latency.view);return {ready:true};}')
 for direction in ['demo-to-pm','pm-to-demo']:
  code(direction+'-prepare','prepare-direction.js',DIRECTION=direction)
  code(direction+'-warmup','run-batch.js',CONFIG={'phase':'warmup','start':0,'count':5})
  for start in range(0,30,5):
   rows=code(direction+'-'+str(start),'run-batch.js',CONFIG={'phase':'measured','start':start,'count':5});assert len(rows)==5 and all(x['correct'] and x['trusted'] for x in rows)
   print(json.dumps({'direction':direction,'completed':start+5,'frameMs':[x['frameMs'] for x in rows],'load':os.getloadavg()}),flush=True)
 code('export','export-results.js')
 raw=json.loads((base/'browser-raw.json').read_text());model=raw['server']['model'];assert all(c['model']==model and c['pending']==0 for c in raw['clients']);assert len(raw['samples'])==70
 rows=[]
 for direction in ['demo-to-pm','pm-to-demo']:
  samples=[s for s in raw['samples'] if s['direction']==direction and s['phase']=='measured'];assert len(samples)==30
  values=sorted(s['queuedInputToRenderOpportunityMs'] for s in samples);assert all(s['correct'] and s['sourceCorrect'] for s in samples)
  rows.append({'direction':direction,'samples':len(values),'p50':values[15],'p95':values[28],'max':values[-1]})
 hashes=json.loads((base/'source-manifest.json').read_text());assert all(hashlib.sha256((root/x['path']).read_bytes()).hexdigest()==x['sha256'] for x in hashes['files'])
 result={'unit':'ms','metric':'key event timestamp through remote DOM and second rAF; rendering opportunity, not physical display','rows':rows,'correctness':{'modelsEqual':True,'pending':[c['pending'] for c in raw['clients']],'fallbacks':[c['eventStats']['fallbacks'] for c in raw['clients']],'totalInputs':len(raw['samples'])},'limits':['Same renderer thread and local HTTP/SSE','External desktop load is recorded; no other test jobs are launched during timing','ASCII sequential inserts only; no OS IME or large-table performance claim']}
 (base/'summary.json').write_text(json.dumps(result,indent=2)+'\n');summary['status']='passed';print(json.dumps(result),flush=True)
 code('profile','profile.js')
except Exception as e:
 summary['status']='failed';summary['error']=str(e);raise
finally:
 try:run('close','close')
 finally:server.terminate();server.wait(timeout=10);serverlog.close()
 summary.update({'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'loadAfter':os.getloadavg(),'browserClosed':True,'serverStopped':server.poll() is not None});(base/'run.json').write_text(json.dumps(summary,indent=2)+'\n')
