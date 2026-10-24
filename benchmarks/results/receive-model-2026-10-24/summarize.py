import json,statistics
from pathlib import Path
out=Path('benchmarks/results/receive-model-2026-10-24');rows=[]
workloads=['plain100k','plain1m','actors100k','marked100k','sparse100k','compacted100k']
for w in workloads:
 data={v:[json.loads((out/'raw'/f'{w}-{v}-{r}.json').read_text()) for r in range(1,4)] for v in ['before','after']}
 for field in ['modelHash','snapshotHash','snapshotBytes','items']:
  assert len({d[field] for ds in data.values() for d in ds})==1,(w,field)
 row={'workload':w,'modelHash':data['before'][0]['modelHash'],'snapshotHash':data['before'][0]['snapshotHash'],'snapshotBytes':data['before'][0]['snapshotBytes'],'items':data['before'][0]['items'],'index':data['after'][0]['index']}
 for v,ds in data.items():
  def summary(values):return {'median':statistics.median(values),'min':min(values),'max':max(values),'runs':values}
  row[v]={k:summary([d[k] for d in ds]) for k in ['heapCold','heapWarm','rssCold','rssWarm','createMs','modelMs','snapshotMs','restoreMs','maxRSSKiB']}
  if ds[0]['compactMs'] is not None:row[v]['compactMs']=summary([d['compactMs'] for d in ds])
  for f in ['editMs','receiveModelMs','applyMs','toJSONMs','lookupMs']:
   row[v][f]=None if ds[0][f] is None else {k:summary([d[f][k] for d in ds]) for k in ['p50','p95','max']}
 row['coldReductionPercent']=100*(1-row['after']['heapCold']['median']/row['before']['heapCold']['median'])
 row['warmReductionPercent']=100*(1-row['after']['heapWarm']['median']/row['before']['heapWarm']['median'])
 rows.append(row)
(out/'summary.json').write_text(json.dumps(rows,indent=2)+'\n')
for r in rows:
 print(r['workload'],*[round(r[v]['heapCold']['median']/2**20,2) for v in ['before','after']],round(r['coldReductionPercent'],1),'edit p95',*[None if r[v]['editMs'] is None else round(r[v]['editMs']['p95']['median'],3) for v in ['before','after']],'receive p95',*[None if r[v]['receiveModelMs'] is None else round(r[v]['receiveModelMs']['p95']['median'],3) for v in ['before','after']])
