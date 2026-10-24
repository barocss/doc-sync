import {createRequire} from 'node:module';
// Share the comparison harness's isolated dependency installation.
const {build}=createRequire(new URL('../compat/package.json',import.meta.url))('esbuild');
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
await build({entryPoints:[fileURLToPath(new URL('main.jsx',import.meta.url))],outfile:resolve(root,process.env.PRODUCT_BUNDLE??'output/playwright/product-native/bundle.js'),bundle:true,nodePaths:[`${root}apps/demo/compat/node_modules`],format:'esm',platform:'browser',sourcemap:true,
 alias:{slate:`${root}node_modules/slate`,lexical:`${root}node_modules/lexical`,'@lexical/rich-text':`${root}node_modules/@lexical/rich-text`,'@lexical/table':`${root}node_modules/@lexical/table`},jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
