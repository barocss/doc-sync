import {createSpreadsheetSchema,spreadsheetSchemaVersion} from '@barocss/doc-sync';
import type {SpreadsheetSchema,SpreadsheetFieldSpec,SparseCellPatch} from '@barocss/doc-sync';
import {TASK_SHEET_SCHEMA,SENSOR_SHEET_SCHEMA} from '../../../experiments/sparse-sheet/custom-schema-fixture.ts';
export const DEFAULT_META={protocol:'sparse-sheet-demo-v1',policy:'field-lww-fixed-axis-v1',sheetId:'sheet',rows:1048576,columns:16384};
export const STABLE_META={...DEFAULT_META,protocol:'sparse-sheet-demo-s2-v1',policy:'stable-axis-lww-v1'};
export type SheetMeta=typeof DEFAULT_META & {schemaVersion?:string};
export interface SheetProfile {id:string;schema?:SpreadsheetSchema;meta:SheetMeta;fields:Record<string,SpreadsheetFieldSpec>;primary:string}
const defaultFields:Record<string,SpreadsheetFieldSpec>={value:{type:'scalar',default:''},formula:{type:'string',default:''},fill:{type:'string',default:'#ffffff'},bold:{type:'boolean',default:false}};
/** The view chooses field order and the native cell's primary field. It is not replicated. */
export function sheetProfile(id:string|null,axes:string|null=null):SheetProfile {
 const schema=id==='tasks'?TASK_SHEET_SCHEMA:id==='sensors'?SENSOR_SHEET_SCHEMA:undefined;
 if(!schema)return {id:'default',meta:axes==='stable'?STABLE_META:DEFAULT_META,fields:defaultFields,primary:'value'};
 const descriptor=createSpreadsheetSchema(schema);
 return {id:id!,schema:descriptor,meta:{...(axes==='stable'?STABLE_META:{...DEFAULT_META,protocol:'sparse-sheet-demo-v2'}),schemaVersion:spreadsheetSchemaVersion(descriptor)},fields:descriptor.fields,primary:id==='tasks'?'title':'reading'};
}
export function parseFieldInput(spec:SpreadsheetFieldSpec,value:string|boolean):SparseCellPatch[string] {
 if(spec.type==='boolean'){if(typeof value==='boolean')return value;if(value==='true')return true;if(value==='false')return false;throw Error('Use true or false');}
 if(spec.type==='number'){if(typeof value!=='string'||!value.trim())throw Error('A number is required');const number=Number(value);if(!Number.isFinite(number))throw Error('A finite number is required');return number;}
 return String(value);
}
