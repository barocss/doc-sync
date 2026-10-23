import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
await build({
  entryPoints: [fileURLToPath(new URL('main.jsx', import.meta.url))],
  outfile: `${root}output/playwright/editor-compatibility/bundle.js`,
  bundle: true, format: 'esm', platform: 'browser', sourcemap: true,
  alias: {slate: `${root}node_modules/slate`, lexical: `${root}node_modules/lexical`, '@lexical/rich-text': `${root}node_modules/@lexical/rich-text`, '@lexical/table': `${root}node_modules/@lexical/table`},
  jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'},
});
