import {build} from "/Users/user/github/doc-sync/apps/demo/compat/node_modules/esbuild/lib/main.js";
import {fileURLToPath} from 'node:url';
const root = "/Users/user/github/doc-sync/";
await build({
  entryPoints: ["/Users/user/github/doc-sync/apps/demo/compat/main.jsx"],
  outfile: "/Users/user/github/doc-sync/output/playwright/screen-next-compat-20261023/bundle.js",
  bundle: true, format: 'esm', platform: 'browser', sourcemap: true,
  jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'},
});
