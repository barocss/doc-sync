import {fileURLToPath} from 'node:url';

// esbuild package aliases also cover subpaths such as react/jsx-runtime and react-dom/client.
// Use one installed pair across demos and dependencies from compat/node_modules.
export const reactRuntimeAliases = {
    react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)),
    'react-dom': fileURLToPath(new URL('../../node_modules/react-dom', import.meta.url)),
};
