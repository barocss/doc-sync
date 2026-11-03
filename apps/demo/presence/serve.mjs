import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {bundlePresenceDemo} from './build.mjs';
export async function startPresencePreview({port=0,write=false}={}) {
  const bundle=await bundlePresenceDemo({write});
  const files=new Map([['/',['text/html; charset=utf-8',await readFile(new URL('./index.html',import.meta.url))]],['/style.css',['text/css; charset=utf-8',await readFile(new URL('./style.css',import.meta.url))]]]);
  for(const output of bundle.outputFiles)files.set(output.path.endsWith('.map')?'/bundle.js.map':'/bundle.js',['text/javascript; charset=utf-8',output.contents]);
  const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');const file=files.get(new URL(req.url??'/','http://localhost').pathname);if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file[0]);res.end(file[1]);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,address:`http://127.0.0.1:${server.address().port}`,bundle,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
