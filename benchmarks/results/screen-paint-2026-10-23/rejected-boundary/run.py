from pathlib import Path
import os,sys,subprocess,tempfile,re,time,json,datetime,hashlib
from PIL import Image, ImageChops
ROOT=Path('/Users/user/github/doc-sync'); BASE=ROOT/'output/playwright/screen-next-boundary-20261023'
OUT=BASE/('run-'+datetime.datetime.now().strftime('%H%M%S'));OUT.mkdir()
ENV={**os.environ,'PATH':'/Users/user/.nvm/versions/node/v22.19.0/bin:'+os.environ['PATH']}
DATA=Path(tempfile.mkdtemp(prefix='doc-sync-boundary-')); SESSION='boundary-'+datetime.datetime.now().strftime('%H%M%S')
CLI='/Users/user/.codex/skills/playwright/scripts/playwright_cli.sh'
server=None;summary={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'output':str(OUT),'session':SESSION,'data':str(DATA),'status':'running'}
SOURCE_PATHS=['apps/demo/ui/editor.ts','apps/demo/ui/style.css','apps/demo/ui/pm-app.ts','apps/demo/ui/pm.html','fixtures/demo-schema.ts','packages/doc-sync/src/crdt/doc.ts','packages/doc-sync/src/crdt/model.ts','packages/doc-sync/src/pm/binding.ts']
summary['initialSourceHashes']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCE_PATHS}
def cli(label,*args):
 r=subprocess.run([CLI,'--session',SESSION,*args],cwd=ROOT,env=ENV,text=True,capture_output=True)
 (OUT/(label+'.log')).write_text(r.stdout+r.stderr)
 if r.returncode or '### Error' in r.stdout:raise RuntimeError(label+': '+r.stdout[-1800:]+r.stderr[-500:])
 if '### Result\n' in r.stdout:return json.JSONDecoder().raw_decode(r.stdout.split('### Result\n')[1])[0]
def pixels(capture):
 rows=[];failures=[]
 for record in capture['records']:
  image=Image.open(OUT/record['image']).convert('RGB');g=record['geometry'];clip=record['clip'];sx=image.width/clip['width'];sy=image.height/clip['height']
  actors=[]
  for caret in g['carets']:
   color=tuple(int(caret['color'].lstrip('#')[i:i+2],16)for i in (0,2,4));label=caret['label'];boundary=g['cell']or g['block'];n=outside=right_of_cell=0
   for y in range(max(0,int((label['top']-clip['y'])*sy)),min(image.height,int((label['bottom']-clip['y'])*sy)+1)):
    for x in range(max(0,int((label['left']-clip['x'])*sx)),min(image.width,int((label['right']-clip['x'])*sx)+1)):
     c=image.getpixel((x,y))
     if max(abs(c[i]-color[i])for i in range(3))<12:
      n+=1;wx=clip['x']+x/sx;wy=clip['y']+y/sy
      if not(boundary['left']<=wx<=boundary['right']and boundary['top']<=wy<=boundary['bottom']):outside+=1
      if g['cell'] and wx>boundary['right'] and boundary['top']<=wy<=boundary['bottom']:right_of_cell+=1
   actors.append({'actor':caret['actor'],'coloredPixels':n,'outsideBoundaryPixels':outside,'rightOfCellPixels':right_of_cell})
  rows.append({'mode':record['mode'],'actors':actors})
 a=Image.open(OUT/capture['records'][0]['image']).convert('RGB');b=Image.open(OUT/capture['records'][1]['image']).convert('RGB')
 if a.size!=b.size:raise AssertionError(capture['name']+': screenshot size changed')
 diff=ImageChops.difference(a,b);diff.save(OUT/(capture['name']+'-diff.png'));changed=sum(1 for p in diff.getdata() if max(p)>12)
 for i,candidate in enumerate(rows[1]['actors']):
  baseline=rows[0]['actors'][i]
  if baseline['coloredPixels']<5 and capture['name']!='overlapping-caret-nowrap-stress':failures.append('baseline actor is not visibly painted '+str(baseline))
  if candidate['coloredPixels']<baseline['coloredPixels']*.97:failures.append('candidate loses label pixels '+str(rows))
 if capture['name']in('paragraph-long-label','cell-nowrap-stress'):
  if rows[0]['actors'][0]['outsideBoundaryPixels']<5 or rows[1]['actors'][0]['outsideBoundaryPixels']<5:failures.append('label not visibly outside boundary '+str(rows))
 if capture['name']=='cell-nowrap-stress' and (rows[0]['actors'][0]['rightOfCellPixels']<20 or rows[1]['actors'][0]['rightOfCellPixels']<20):failures.append('stress name is not visibly over the colored right neighbor cell '+str(rows))
 if changed:failures.append('same stationary scene has changed pixels; requires investigation, not automatic visual approval')
 return {'name':capture['name'],'passed':not failures,'failures':failures,'pixelModes':rows,'changedPixelsAbove12':changed,'totalPixels':a.width*a.height,'diffImage':capture['name']+'-diff.png'}
try:
 subprocess.run(['node',str(BASE/'seed.mjs'),str(ROOT),str(DATA)],cwd=ROOT,env=ENV,check=True)
 log=(OUT/'server.log').open('x');server=subprocess.Popen(['node','apps/demo/server.ts'],cwd=ROOT,env={**ENV,'PORT':'0','DATA_DIR':str(DATA)},stdout=log,stderr=subprocess.STDOUT)
 for _ in range(200):
  m=re.search(r'http://localhost:(\d+)',(OUT/'server.log').read_text())
  if m:break
  if server.poll()is not None:raise RuntimeError('Owned server exited')
  time.sleep(.05)
 else:raise RuntimeError('No dynamic server port')
 origin='http://localhost:'+m[1];summary.update({'url':origin+'/pm?doc=boundary','serverPid':server.pid})
 cli('open','open',summary['url'],'--browser','chrome','--headed');cli('snapshot','snapshot')
 script=(BASE/'check.js').read_text().replace('OUTPUT_DIRECTORY',json.dumps(str(OUT))).replace('BASE_ORIGIN',json.dumps(origin));(OUT/'executed-check.js').write_text(script)
 result=cli('check','run-code','--filename',str(OUT/'executed-check.js'));(OUT/'browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 summary['pixelChecks']=[pixels(c)for c in result['captures']];summary['browser']=result
 if not all(p['passed'] for p in summary['pixelChecks']):raise AssertionError('Screenshot/pixel checks failed; inspect preserved summary and diff images')
 summary['status']='passed'
except Exception as e:
 summary.update({'status':'failed','error':str(e)})
 try:
  partial=cli('partial','run-code','async page=>page.evaluate(()=>({captures:window.__boundary?.captures??[],checks:window.__boundary?.checks??[],preview:document.querySelector(".composing")?.textContent??null}))')
  (OUT/'partial-browser-results.json').write_text(json.dumps(partial,ensure_ascii=False,indent=2)+'\n')
 except Exception as partial_error:summary['partialCaptureError']=str(partial_error)
 raise
finally:
 try:cli('close','close')
 except Exception as e:summary['browserCloseError']=str(e)
 if server is not None:server.terminate();server.wait(timeout=10);log.close()
 summary['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();summary['serverStopped']=server is None or server.poll()is not None
 summary['sourceHashes']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCE_PATHS}
 summary['sourceChangedDuringRun']=summary['sourceHashes']!=summary['initialSourceHashes']
 (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'output':str(OUT),'status':summary['status'],'error':summary.get('error')}),flush=True)
