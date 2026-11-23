from pathlib import Path
import subprocess,json,base64
p=Path('output/local-client/docs-browser');session='local-docs-review-1102';records=[]
def ab(*args):
 r=subprocess.run(['agent-browser','--session',session,'--json',*args],capture_output=True,text=True,check=True)
 data=json.loads(r.stdout);records.append({'args':args,'result':data});(p/'commands.json').write_text(json.dumps(records,indent=2));assert data['success'],data
 return data.get('data',{})
def ev(code):return ab('eval','-b',base64.b64encode(code.encode()).decode())['result']
expected=['Guide','Editor integrations','AI & bots','Reference']
ab('set','viewport','1280','900')
routes=[('guide/editors.html','Editor integrations'),('guide/prosemirror.html','Editor integrations'),('guide/tiptap.html','Editor integrations'),('guide/slate.html','Editor integrations'),('guide/lexical.html','Editor integrations'),('guide/custom-editor.html','Editor integrations'),('guide/local-editing.html','Guide'),('ai/server.html','AI & bots'),('guide/ai.html','AI & bots'),('reference/api.html','Reference'),('status.html','Reference'),('roadmap.html','Reference'),('performance.html','Reference'),('guide/rust.html','Reference')]
checks=[]
for route,category in routes:
 ab('open','http://127.0.0.1:52877/doc-sync/'+route)
 ab('wait','--fn','!!document.querySelector("nav[aria-label=\\"Main Navigation\\"] a.active")')
 d=ev('({title:document.querySelector("h1")?.textContent,nav:[...document.querySelectorAll("nav[aria-label=\\"Main Navigation\\"] a")].map(a=>a.textContent),active:[...document.querySelectorAll("nav[aria-label=\\"Main Navigation\\"] a.active")].map(a=>a.textContent),sidebar:document.querySelector("#VPSidebarNav h2")?.textContent,overflow:document.documentElement.scrollWidth>innerWidth})')
 assert d['nav']==expected and d['active']==[category],(route,d)
 assert not d['overflow'],(route,d)
 assert d['sidebar']==category,(route,d)
 checks.append({'route':route,**d,'status':'PASS'})
(p/'desktop-routes.json').write_text(json.dumps(checks,indent=2));print(json.dumps({'desktopRoutes':len(checks),'status':'PASS'}))
