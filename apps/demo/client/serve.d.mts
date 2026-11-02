import type {Server} from 'node:http';
import type {ClientBundle} from './build.mjs';
export function startClientPreview(options?: {port?: number; write?: boolean}): Promise<{server: Server; address: string; bundle: ClientBundle; close(): Promise<void>}>;
