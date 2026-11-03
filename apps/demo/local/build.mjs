import {reactRuntimeAliases} from '../react-runtime-aliases.mjs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
let build;
try { ({build} = createRequire(new URL('../compat/package.json', import.meta.url))('esbuild')); }
catch (error) { throw new Error('Local demo needs the existing compat dependencies. Run npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --ignore-scripts --cache /tmp/doc-sync-compat-npm-cache.', {cause: error}); }
const root = fileURLToPath(new URL('../../../', import.meta.url));
export const defaultOutdir = resolve(root, 'output/local-demo');
export async function bundleLocalDemo({write = false, outdir = defaultOutdir} = {}) {
    const result = await build({entryPoints: [fileURLToPath(new URL('./main.jsx', import.meta.url))],
        outfile: resolve(outdir, 'bundle.js'), bundle: true, write: false, metafile: true,
        nodePaths: [resolve(root, 'apps/demo/compat/node_modules')], format: 'esm', platform: 'browser', sourcemap: true,
        alias: {...reactRuntimeAliases, slate: resolve(root, 'node_modules/slate'), lexical: resolve(root, 'node_modules/lexical'), '@lexical/rich-text': resolve(root, 'node_modules/@lexical/rich-text')},
        jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}});
    const proof = inspectBundle(result.metafile);
    if (proof.forbidden.length) throw Error(`Local demo contains document network runtime: ${proof.forbidden.join(', ')}`);
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
    const forbidden = emittedInputs.filter(({input}) => /packages\/doc-sync\/dist\/(?:server\/|sync\/(?:client|http(?:-transport)?|transport|node-http(?:-transport)?|browser-recovery|live-recovery|recovery|index)\.)/.test(input)).map(({input}) => input);
    return {emittedInputs, forbidden, note: 'Unused barrel references may remain in metafile.inputs. Only emitted bytes are counted.'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await bundleLocalDemo({write: true});
    console.log(`Local demo bundle: ${defaultOutdir} (${result.proof.emittedInputs.length} contributing modules)`);
}
