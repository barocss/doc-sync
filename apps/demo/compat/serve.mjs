import {spawn} from 'node:child_process';
import {createServer, request} from 'node:http';
import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), 'doc-sync-editor-compat-'));
const child = spawn(process.execPath, [`${root}apps/demo/server.ts`], {
  env: {...process.env, PORT: '0', DATA_DIR: dataDir}, stdio: ['ignore', 'pipe', 'inherit'],
});
let output = '';
const backend = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => reject(new Error(`backend exited: ${code}`)));
  child.stdout.on('data', chunk => {
    output += chunk;
    const match = output.match(/http:\/\/localhost:(\d+)/);
    if (match) resolve(match[0]);
  });
});
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/' || path === '/bundle.js' || path === '/bundle.js.map') {
    const file = path === '/' ? `${root}apps/demo/compat/index.html` : `${root}output/playwright/editor-compatibility${path}`;
    res.writeHead(200, {'content-type': path === '/' ? 'text/html; charset=utf-8' : 'text/javascript', 'cache-control': 'no-store'});
    res.end(readFileSync(file));
    return;
  }
  if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const proxy = request(`${backend}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(backend).host}}, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on('error', error => { if (!res.headersSent) res.writeHead(502); res.end(error.message); });
  res.on('close', () => proxy.destroy());
  req.pipe(proxy);
});
server.listen(Number(process.env.COMPAT_PORT ?? 5412), '127.0.0.1', () => {
  console.log(JSON.stringify({url: `http://127.0.0.1:${server.address().port}`, backend, dataDir}));
});
const stop = () => { child.kill(); server.closeAllConnections(); server.close(() => process.exit()); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', () => { server.closeAllConnections(); server.close(); });
