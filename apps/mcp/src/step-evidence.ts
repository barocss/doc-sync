import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {link,mkdir,open,realpath,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {JournalRecord} from './journal.ts';

/** Persist the exact conditional request before it can be sent. */
export async function saveStepEvidence(directory:string,step:string,record:JournalRecord):Promise<void>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(step))throw Error('Invalid mission step ID');
 await mkdir(resolve(directory),{recursive:true,mode:0o700});
 const dir=await realpath(directory),destination=join(dir,`${step}.json`),temp=join(dir,`.${randomUUID()}.tmp`),data=JSON.stringify(record)+'\n';
 try {
  const file=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {await file.writeFile(data);await file.sync();} finally {await file.close();}
  try {await link(temp,destination);} catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   const existing=await open(destination,constants.O_RDONLY|constants.O_NOFOLLOW);
   try {const stat=await existing.stat();if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size>16*1024*1024||await existing.readFile('utf8')!==data)throw Error('Mission step evidence differs');await existing.sync();}finally{await existing.close();}
  }
  await unlink(temp);
  const folder=await open(dir,'r');try{await folder.sync();}finally{await folder.close();}
 } finally {await unlink(temp).catch(()=>{});}
}
