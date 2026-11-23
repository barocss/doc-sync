from pathlib import Path
import os,sys,subprocess,time,json,signal,datetime
root=Path('/Users/user/github/doc-sync');report=root/'docs/reports/push-cleanup-2026-11-23';name=sys.argv[1];cmd=sys.argv[2:];log=report/(name+'.log');receipt=report/(name+'.json');assert not log.exists() and not receipt.exists()
env=os.environ.copy();env.update(CARGO_PROFILE_DEV_DEBUG='0',CARGO_PROFILE_TEST_DEBUG='0',CARGO_INCREMENTAL='0',CARGO_BUILD_JOBS='1',CARGO_TARGET_DIR=str(root/'output/push-cleanup-2026-11-23/native-target'))
start=time.monotonic();started=datetime.datetime.now(datetime.timezone.utc).isoformat();timeout=False
with log.open('w') as stream:
 p=subprocess.Popen(cmd,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=p.wait(timeout=900)
 except subprocess.TimeoutExpired:
  timeout=True;os.killpg(p.pid,signal.SIGTERM)
  try:code=p.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait()
result={'command':cmd,'startedUtc':started,'pid':p.pid,'exit':code,'seconds':round(time.monotonic()-start,3),'watchdogSeconds':900,'timedOut':timeout,'status':'PASS' if code==0 and not timeout else 'FAIL'};receipt.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));sys.exit(0 if result['status']=='PASS' else 1)
