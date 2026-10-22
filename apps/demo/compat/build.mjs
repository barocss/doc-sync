import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
await build({
  entryPoints: [fileURLToPath(new URL('main.jsx', import.meta.url))],
  outfile: `${root}output/playwright/editor-compatibility/bundle.js`,
  bundle: true, format: 'esm', platform: 'browser', sourcemap: true,
  jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'},
});
