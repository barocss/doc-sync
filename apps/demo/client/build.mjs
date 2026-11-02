import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
let build;
try { ({build} = createRequire(new URL('../compat/package.json', import.meta.url))('esbuild')); }
catch (error) { throw new Error('Client demo needs the existing compat dependencies. Run npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --ignore-scripts --cache /tmp/doc-sync-compat-npm-cache.', {cause: error}); }
const root = fileURLToPath(new URL('../../../', import.meta.url));
export const defaultOutdir = resolve(root, 'output/client-demo');
export async function bundleClientDemo({write = false, outdir = defaultOutdir} = {}) {
    const result = await build({entryPoints: [fileURLToPath(new URL('./main.jsx', import.meta.url))],
        outfile: resolve(outdir, 'bundle.js'), bundle: true, write: false, metafile: true,
        nodePaths: [resolve(root, 'apps/demo/compat/node_modules')], format: 'esm', platform: 'browser', sourcemap: true,
        alias: {slate: resolve(root, 'node_modules/slate'), lexical: resolve(root, 'node_modules/lexical'), '@lexical/rich-text': resolve(root, 'node_modules/@lexical/rich-text')},
        jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}});
    const proof = inspectBundle(result.metafile);
    if (write) {
        await mkdir(outdir, {recursive: true});
        for (const output of result.outputFiles) await writeFile(output.path, output.contents);
        await writeFile(resolve(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n');
        await writeFile(resolve(outdir, 'bundle-proof.json'), JSON.stringify(proof, null, 2) + '\n');
    }
    return {...result, proof};
}
export function inspectBundle(metafile) {
    const emittedInputs = Object.entries(metafile.outputs).flatMap(([output, entry]) => Object.entries(entry.inputs).filter(([, info]) => info.bytesInOutput > 0).map(([input, info]) => ({input, bytes: info.bytesInOutput, output})));
    return {emittedInputs, note: 'This two-mode bundle includes sync runtime. Local runtime behavior is checked separately.'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await bundleClientDemo({write: true});
    console.log(`Client demo bundle: ${defaultOutdir} (${result.proof.emittedInputs.length} contributing modules)`);
}
