import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const defaultOutdir = fileURLToPath(new URL('../../../output/presence-components-demo/', import.meta.url));
export async function bundlePresenceDemo({write=false, outdir=defaultOutdir}={}) {
  const result = await build({entryPoints:[fileURLToPath(new URL('./main.js', import.meta.url))], outfile:resolve(outdir,'bundle.js'), bundle:true, write:false, metafile:true, format:'esm', platform:'browser', conditions:['browser'], sourcemap:true, define:{'process.env.NODE_ENV':'"development"','__VUE_OPTIONS_API__':'true','__VUE_PROD_DEVTOOLS__':'false','__VUE_PROD_HYDRATION_MISMATCH_DETAILS__':'false'}});
  if(write) { await mkdir(outdir,{recursive:true}); for(const output of result.outputFiles) await writeFile(output.path,output.contents); await writeFile(resolve(outdir,'metafile.json'),JSON.stringify(result.metafile,null,2)); }
  return result;
}
