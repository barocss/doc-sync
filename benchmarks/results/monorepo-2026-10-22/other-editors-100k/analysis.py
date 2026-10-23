from pathlib import Path
import json,math,hashlib,collections,datetime
root=Path('/Users/user/github/doc-sync');base=root/'benchmarks/results/monorepo-2026-10-22/other-editors-100k'
manifest=json.loads((base/'source-manifest.json').read_text());run=json.loads((base/'run.json').read_text());assert run['status']=='complete' and run['sourceUnchanged']
def stats(values):
 values=sorted(values);assert values
 return {'n':len(values),'p50':values[len(values)//2],'p95':values[min(len(values)-1,math.floor(len(values)*.95))],'max':values[-1],'min':values[0],'mean':sum(values)/len(values)}
server=[json.loads(l) for l in (base/'server-events.jsonl').read_text().splitlines()];server_by_change={(r['actor'],r['seq']):r for r in server}
rows=[];diagnostics=[];correctness=[]
for pair in run['pairs']:
 name='-'.join(pair);raw=json.loads((base/name/'browser-raw.json').read_text());peers=raw['snapshot']['peers'];model=raw['server']['model'];assert not raw['snapshot']['failures'];assert len(peers)==2
 assert all(p['model']==model and p['nativeModel']==model and p['pending']==0 and p['fallbacks']==0 for p in peers)
 chars=sum(len(r.get('text','')) for p in model['children'] for r in p.get('runs',[]));assert chars==100072 and len(model['children'])==625 and len(raw['samples'])==72
 correctness.append({'pair':name,'allNativeAndClientModelsEqualServer':True,'pending':[p['pending'] for p in peers],'fallbacks':[p['fallbacks'] for p in peers],'finalChars':chars,'finalParagraphs':len(model['children']),'totalSamples':len(raw['samples'])})
 for source,target in [pair,list(reversed(pair))]:
  direction=source+'-to-'+target;samples=[s for s in raw['samples'] if s['direction']==direction and s['phase']=='measured'];assert len(samples)==30
  ds=[]
  for s in samples:
   assert s['correct'] and s['sourceCorrect'] and s['inputEvents'] and all(e['trusted'] for e in s['inputEvents'])
   assert s['inputStart']<=s['remoteReceive']<=s['remoteDom']<=s['firstRafAfterDom']<=s['renderOpportunity']
   assert len([r for r in s['receives'] if r['actor']==s['targetActor']])==1
   change=next(r for r in s['sends'] if r['kind']=='change');sr=server_by_change[(change['actor'],change['seq'])]
   inclusive=collections.defaultdict(float);own=collections.defaultdict(float);calls=collections.Counter()
   for span in s['spans']:
    inclusive[span['name']]+=span['ms'];own[span['name']]+=max(0,span['ms']-sum(c['ms'] for c in s['spans'] if c['parent']==span['id']));calls[span['name']]+=1
   ds.append({'id':s['id'],'inputEventToRenderOpportunityMs':s['queuedInputToRenderOpportunityMs'],'inputEventToRemoteDomMs':s['remoteDom']-s['inputEventTime'],'inputQueueMs':s['inputStart']-s['inputEventTime'],'inputCaptureToSendMs':change['start']-s['inputStart'],'sendToRemoteReceiveMs':s['remoteReceive']-change['start'],'remoteReceiveToDomMs':s['remoteDom']-s['remoteReceive'],'domToRenderOpportunityMs':s['renderOpportunity']-s['remoteDom'],'serverSubmitMs':sr['submitMs'],'domNodesAdded':s['domMutations']['added'],'domNodesRemoved':s['domMutations']['removed'],'targetFirstParagraphPreserved':s['targetFirstParagraphPreserved'],'targetLastParagraphPreserved':s['targetLastParagraphPreserved'],'methodInclusiveMs':dict(inclusive),'methodSelfMs':dict(own),'methodCalls':dict(calls)})
  methods=sorted(set(k for d in ds for k in d['methodSelfMs']))
  keys=[k for k,v in ds[0].items() if isinstance(v,(int,float)) and not isinstance(v,bool)]
  rows.append({'direction':direction,'source':source,'target':target,'allCorrect':True,'allInputTrusted':True,'metrics':{k:stats([d[k] for d in ds]) for k in keys},'domIdentity':{'firstParagraphPreservedCount':sum(d['targetFirstParagraphPreserved'] for d in ds),'lastParagraphPreservedCount':sum(d['targetLastParagraphPreserved'] for d in ds)},'methods':{method:{'inclusiveMs':stats([d['methodInclusiveMs'].get(method,0) for d in ds]),'selfMs':stats([d['methodSelfMs'].get(method,0) for d in ds]),'calls':stats([d['methodCalls'].get(method,0) for d in ds])} for method in methods},'derivedSamples':ds})
  trace=json.loads((base/name/(direction+'.trace.json')).read_text())['traceEvents'];sample=next(s for s in raw['samples'] if s['direction']==direction and s['phase']=='diagnostic')
  marks={key:next(e for e in trace if e.get('name')=='latency:'+sample['id']+':'+key and e.get('ph') in ['I','R','i']) for key in ['input','remote-dom','raf1','render-opportunity']}
  start=marks['input']['ts'];end=marks['render-opportunity']['ts']
  paints=[{'tsUs':e['ts'],'durationUs':e.get('dur',0),'pid':e['pid'],'tid':e['tid']} for e in trace if e.get('name')=='Paint' and marks['remote-dom']['ts']<=e.get('ts',0) and e.get('ts',0)+e.get('dur',0)<=end]
  assert paints,'No diagnostic Paint after remote DOM for '+direction
  profile=json.loads((base/name/(direction+'.cpuprofile')).read_text());nodes={n['id']:n for n in profile['nodes']};buckets=collections.defaultdict(float);elapsed=profile['startTime'];total=0
  for node,delta in zip(profile['samples'],profile['timeDeltas']):
   elapsed+=delta
   if start<=elapsed<=end:
    cf=nodes[node]['callFrame'];buckets[(cf['functionName'],cf['url'],cf['lineNumber']+1)]+=delta/1000;total+=delta/1000
  top=[{'function':k[0],'url':k[1],'line':k[2],'selfSampleMs':v,'share':v/total if total else None} for k,v in sorted(buckets.items(),key=lambda x:x[1],reverse=True)[:25]]
  diagnostics.append({'direction':direction,'sampleId':sample['id'],'markers':{k:v['ts'] for k,v in marks.items()},'paintsAfterRemoteDom':paints,'cpuSampleTotalMs':total,'topCpuSelfSamples':top})
source_after=[{'path':r['path'],'equal':hashlib.sha256((root/r['path']).read_bytes()).hexdigest()==r['sha256']} for r in manifest['files']];assert all(r['equal'] for r in source_after)
summary={'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'conditions':{'initialChars':100000,'paragraphs':625,'charsPerParagraph':160,'participantsPerPage':2,'browserPagesPerPair':1,'sharedRenderer':True,'viewport':{'width':1440,'height':1000},'editorScrollViewportHeight':460,'devicePixelRatio':raw['devicePixelRatio'],'userAgent':raw['userAgent'],'visibility':raw['visibility'],'warmupsPerDirection':5,'measuredPerDirection':30,'diagnosticPerDirection':1,'measuredTotal':180,'input':'Trusted ASCII keyboard.press in first paragraph, initial offset 50 per direction','transport':'Local HTTP POST, SSE, original JSONL persistence server','build':'Development, current compatibility adapters; trace=1 off; 300ms status polling on','endpoint':'Remote paragraph exact expected text via MutationObserver, then second native requestAnimationFrame; rendering-opportunity proxy'},'rows':rows,'correctness':correctness,'diagnostics':diagnostics,'sourceAfter':source_after,'limits':['Sequential ASCII single-character edits only. No OS IME, concurrent typing, tables, paste or selection-range latency.','Two peers share one browser renderer. No independent-computer or WAN proof.','Development build, wrappers and status polling are included. Not a vendor intrinsic-performance comparison.','Prior demo/PM used different binding wrapper and viewport. Do not calculate an optimization improvement against those results.','Two rAF callbacks are a rendering-opportunity proxy. Diagnostic browser Paint events are confirmed, not physical display scanout.','External apps continue to run; run.json captures load. Three pairs ran sequentially in fixed order.','Method inclusive timings overlap; do not add method p50/p95 values or subtract percentile columns as if paired.']}
(base/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'rows':[{'direction':r['direction'],'p50':r['metrics']['inputEventToRenderOpportunityMs']['p50'],'p95':r['metrics']['inputEventToRenderOpportunityMs']['p95'],'max':r['metrics']['inputEventToRenderOpportunityMs']['max'],'remoteDomP50':r['metrics']['remoteReceiveToDomMs']['p50'],'firstPreserved':r['domIdentity']['firstParagraphPreservedCount'],'lastPreserved':r['domIdentity']['lastParagraphPreservedCount'],'topSelfMethods':sorted([(k,v['selfMs']['mean']) for k,v in r['methods'].items()],key=lambda x:x[1],reverse=True)[:8]} for r in rows],'correctness':correctness,'diagnosticsPaint':[{ 'direction':d['direction'],'paintCount':len(d['paintsAfterRemoteDom'])} for d in diagnostics]},ensure_ascii=False,indent=2))
