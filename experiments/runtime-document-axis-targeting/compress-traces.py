"""Compress only this experiment's raw JSON traces; verify each SHA256 round trip."""
import gzip, hashlib, json
from pathlib import Path
base=Path(__file__).resolve().parents[2]/'output/rust-d3-axis-targeting-2026-11-05'
records=[]
for directory in sorted(base.glob('compare*')):
    if not directory.is_dir(): continue
    for path in sorted(directory.rglob('*')):
        if not path.is_file() or path.stat().st_size <= 1_000_000: continue
        if path.suffix not in ('.json','.jsonl') and path.name!='native.stdout': continue
        raw=path.read_bytes(); digest=hashlib.sha256(raw).hexdigest(); target=path.with_name(path.name+'.gz')
        with gzip.GzipFile(filename=str(target),mode='wb',mtime=0) as stream: stream.write(raw)
        restored=gzip.decompress(target.read_bytes()); assert hashlib.sha256(restored).hexdigest()==digest and restored==raw
        records.append({'original':str(path.relative_to(base)),'compressed':str(target.relative_to(base)),'bytes':len(raw),'compressedBytes':target.stat().st_size,'sha256':digest,'roundtrip':'PASS'})
        path.unlink()
output=base/'compare-compression.json'
old=json.loads(output.read_text()) if output.exists() else []
output.write_text(json.dumps(old+records,indent=2)+'\n')
print(json.dumps({'compressed':len(records),'savedBytes':sum(x['bytes']-x['compressedBytes'] for x in records),'receipt':str(output)}))
