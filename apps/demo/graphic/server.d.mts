import type {Server} from 'node:http';
import type {DocHub} from '@barocss/doc-sync/server';
export function createGraphicServer(options?: {maxRooms?: number}): {server: Server; rooms: Map<string, DocHub>; close(): Promise<void>};
