import type {Server} from 'node:http';
export const META:{protocol:string;policy:string;sheetId:string;rows:number;columns:number};
export function createSpreadsheetServer(options?:{maxRooms?:number;maxOps?:number}):{server:Server;rooms:Map<string,any>;close:()=>Promise<void>};
