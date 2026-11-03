import {execFileSync} from 'node:child_process';
import {rmSync} from 'node:fs';
rmSync(new URL('./dist', import.meta.url), {recursive:true, force:true});
execFileSync(process.execPath, [new URL('../../node_modules/typescript/bin/tsc',import.meta.url).pathname, '-p', new URL('./tsconfig.build.json',import.meta.url).pathname], {stdio:'inherit'});
