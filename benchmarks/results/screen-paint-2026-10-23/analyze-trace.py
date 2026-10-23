from pathlib import Path
import json, statistics, sys

folder = Path(sys.argv[1])

def union(intervals):
    end = None
    total = 0
    for start, stop in sorted(intervals):
        if end is None or start > end:
            total += stop - start
        elif stop > end:
            total += stop - end
        end = stop if end is None else max(end, stop)
    return total / 1000

rows = []
for direction in ['demo-to-pm', 'pm-to-demo']:
    events = json.loads((folder / (direction + '.trace.json')).read_text())['traceEvents']
    samples = []
    for i in range(3):
        name = f'latency:{direction}:profile:{i}:'
        start = next(e for e in events if e['name'] == name + 'input')
        stop = next(e for e in events if e['name'] == name + 'render-opportunity')
        spans = [e for e in events if e.get('ph') == 'X' and e['pid'] == start['pid'] and e['tid'] == start['tid']]
        cost = {}
        for category in ['Paint', 'PrePaint', 'Layout', 'UpdateLayoutTree', 'FunctionCall']:
            clipped = [(max(e['ts'], start['ts']), min(e['ts'] + e.get('dur', 0), stop['ts'])) for e in spans
                       if e['name'] == category and e['ts'] < stop['ts'] and e['ts'] + e.get('dur', 0) > start['ts']]
            cost[category] = union(clipped)
        samples.append({'index': i, 'inputToFrameMs': (stop['ts'] - start['ts']) / 1000, 'mainThreadUnionMs': cost})
    rows.append({'direction': direction, 'samples': samples,
                 'medianUnionMs': {k: statistics.median(s['mainThreadUnionMs'][k] for s in samples)
                                   for k in samples[0]['mainThreadUnionMs']}})
result = {'scope': 'Three diagnostic inputs per direction. Main-thread intervals clipped to input through second rAF; nested spans unioned per category. Different categories may still overlap.',
          'excludes': ['physical display scanout', 'pure network latency', 'proof that every document character was repainted'], 'directions': rows}
(folder / 'trace-summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(rows))
