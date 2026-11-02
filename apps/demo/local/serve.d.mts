import type {Server} from 'node:http';
import type {LocalBundle} from './build.mjs';
export function startLocalPreview(options?: {port?: number; write?: boolean}): Promise<{server: Server; address: string; bundle: LocalBundle; close(): Promise<void>}>;
