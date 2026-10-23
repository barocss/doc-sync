from pathlib import Path
import subprocess,json,os,re
root=Path.cwd();base=root/'output/playwright/screen-next-compat-20261023';env=dict(os.environ);env['PATH']='/Users/user/.nvm/versions/node/v22.19.0/bin:'+env['PATH']
cli='/Users/user/.codex/skills/playwright/scripts/playwright_cli.sh'
scripts=['checks-ime-cursor.js','checks-input-extended.js','checks-table-input.js','checks-input-reset.js','checks-text.js','checks-table.js','checks-concurrent.js','checks-three.js','checks-probes.js','checks-operation-traces.js']
summary=[]
for script in scripts:
 p=base/'checks'/script
 text=p.read_text()
 # Create each literal screenshot directory before invoking the existing assertions.
 for dirname in re.findall(r'output/playwright/screen-next-compat-20261023/[^`\'"\n]*?/',text):Path(dirname).mkdir(parents=True,exist_ok=True)
 result=subprocess.run([cli,'--session','screen-next-compat-20261023','run-code','--filename',str(p)],env=env,text=True,capture_output=True)
 (base/(script+'.log')).write_text(result.stdout+result.stderr)
 if '### Result\n' not in result.stdout:
  print(json.dumps({'script':script,'returncode':result.returncode,'error':result.stdout[-1000:]+result.stderr[-1000:]}),flush=True);raise SystemExit(1)
 data=json.JSONDecoder().raw_decode(result.stdout.split('### Result\n',1)[1])[0]
 (base/(script+'.json')).write_text(json.dumps(data,ensure_ascii=False)+'\n')
 cases=data.get('results',data.get('checks',[])) if isinstance(data,dict) else data
 failed=[x for x in cases if isinstance(x,dict) and (x.get('status') in ['failed','error'] or x.get('passed') is False)]
 row={'script':script,'cases':len(cases),'failed':len(failed),'browserVersion':data.get('browserVersion') if isinstance(data,dict) else None}
 summary.append(row);(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(row),flush=True)
 if failed: print(json.dumps([{k:x.get(k) for k in ['category','name','case','status','error']} for x in failed]),flush=True);raise SystemExit(1)
