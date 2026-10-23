from pathlib import Path
import os, subprocess, json, tempfile, re, time

root = Path.cwd()
base = root / 'output/playwright/screen-next-main-20261023'
env = {**os.environ, 'PATH': '/Users/user/.nvm/versions/node/v22.19.0/bin:' + os.environ['PATH']}
cli = '/Users/user/.codex/skills/playwright/scripts/playwright_cli.sh'
session = 'screen-next-main-20261023'
data = tempfile.mkdtemp(prefix='doc-sync-screen-regression-')
log = (base / 'server.log').open('x')
server = subprocess.Popen(['node', 'apps/demo/server.ts'], env={**env, 'PORT': '0', 'DATA_DIR': data}, stdout=log, stderr=subprocess.STDOUT)
result = {'passed': False, 'data': data, 'serverPid': server.pid, 'checks': []}

def run(label, *args):
    p = subprocess.run([cli, '--session', session, *args], cwd=root, env=env, text=True, capture_output=True)
    (base / (label + '.log')).write_text(p.stdout + p.stderr)
    if p.returncode or '### Error' in p.stdout:
        raise RuntimeError(label + ': ' + p.stdout[-1600:] + p.stderr[-500:])
    if '### Result\n' in p.stdout:
        value = json.JSONDecoder().raw_decode(p.stdout.split('### Result\n', 1)[1])[0]
        (base / (label + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        return value

try:
    for _ in range(200):
        found = re.search(r'http://localhost:(\d+)', (base / 'server.log').read_text())
        if found:
            break
        if server.poll() is not None:
            raise RuntimeError('server exited')
        time.sleep(.05)
    assert found
    origin = found[0]
    result['origin'] = origin
    run('open', 'open', origin + '/pm?doc=screen-regression-start', '--browser', 'chrome', '--headed')
    for name, expected in [('render', 7), ('nested', 9), ('presence', 6), ('presence-edits', 2), ('presence-disconnect', 1), ('presence-advanced', 5)]:
        text = (base / 'checks' / (name + '.js')).read_text().replace('ORIGIN', json.dumps(origin)).replace('__SCREEN_' + json.dumps(origin) + '__', origin)
        # Replace the fixed local origin independently of the render-script placeholder.
        text = (base / 'checks' / (name + '.js')).read_text().replace('__SCREEN_ORIGIN__', origin).replace('= ORIGIN;', '= ' + json.dumps(origin) + ';')
        path = base / (name + '.js')
        path.write_text(text)
        value = run(name, 'run-code', '--filename', str(path))
        count = len(value.get('checks', value.get('results', [])))
        assert count == expected, (name, count, expected)
        result['checks'].append({'name': name, 'passed': count})
        print(json.dumps(result['checks'][-1]), flush=True)
    result['passed'] = True
    result['total'] = sum(c['passed'] for c in result['checks'])
finally:
    try:
        run('close', 'close')
        result['browserClosed'] = True
    finally:
        server.terminate()
        server.wait(timeout=10)
        log.close()
        result['serverStopped'] = server.poll() is not None
        (base / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
