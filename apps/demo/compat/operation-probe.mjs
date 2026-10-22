const records=[];
export const tracingEnabled=new URLSearchParams(globalThis.location?.search??'').get('trace')==='1';
export function recordOperation(record){
  if(!tracingEnabled)return;
  records.push(structuredClone({at:performance.now(),...record}));
  if(records.length>150)records.shift();
}
export const readOperations=()=>structuredClone(records);
export const clearOperations=()=>{records.length=0;};
