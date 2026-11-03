import {createHash, randomUUID} from 'node:crypto';
import {link, mkdir, open, readFile, readdir, rm, realpath} from 'node:fs/promises';
import {openWriterLock} from '../../mcp/src/kernel-lock.ts';
import {join, resolve} from 'node:path';
import type {BotCharacter} from '@barocss/doc-sync/sync';
import type {Personality, Role} from './runner.ts';

const BOT_CHARACTERS = Object.freeze(['cat','fox','owl','robot']);
const BOT_PERSONALITIES = Object.freeze(['curious','careful','creative','concise']);
const BOT_ROLES = Object.freeze(['writer','reviewer','organizer']);
const SERVER_URL_PROTOCOLS = Object.freeze(['http:','https:']);


export type ProfileInput = {id:string; name:string; character:BotCharacter; personality:Personality; role:Role; color:string};
export type BotProfile = ProfileInput & {version:1; identity:string};
const validId=(id:string)=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
function validate(profile: BotProfile): void {
 if (!validId(profile.id)) throw Error('Invalid profile ID');
 if (profile.version!==1 || typeof profile.identity!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profile.identity) ||
     typeof profile.name!=='string' || !profile.name.trim() || profile.name.length>80 || !BOT_CHARACTERS.includes(profile.character) ||
     !BOT_PERSONALITIES.includes(profile.personality) || !BOT_ROLES.includes(profile.role) ||
     typeof profile.color!=='string' || !/^#[0-9a-f]{6}$/i.test(profile.color)) throw Error('Invalid bot profile');
}
/** Normalize the endpoint once for both the stable actor and journal key. */
export function profileUrl(url: string): string {
 const parsed=new URL(url);
 if(!SERVER_URL_PROTOCOLS.includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Invalid profile server URL');
 return parsed.origin+parsed.pathname.replace(/\/+$/,'');
}
export function profileActor(profile: BotProfile,url:string,document:string):string {
 validate(profile);if(!validId(document))throw Error('Invalid document ID');
 return 'bot-'+createHash('sha256').update(JSON.stringify([profile.identity,profileUrl(url),document])).digest('hex').slice(0,32);
}
/** Keep a kernel-owned claim across the entire task, including MCP startup and shutdown. */
export async function claimProfile(stateDir:string,actor:string):Promise<() => Promise<void>> {
 if(process.platform!=='darwin'&&process.platform!=='linux')throw Error('Profile claims require a supported kernel file lock');
 if(!/^bot-[0-9a-f]{32}$/.test(actor))throw Error('Invalid profile actor');
 const directory=join(resolve(stateDir),'claims');await mkdir(directory,{recursive:true,mode:0o700});
 const lock=await openWriterLock(join(await realpath(directory),`${actor}.lock`));
 return async()=>{await lock.close();};
}
/** Create once using a private, fsynced temporary file and an exclusive link. */
export async function createProfile(stateDir:string,input:ProfileInput):Promise<BotProfile>{
 const profile:BotProfile={id:input.id,name:input.name,character:input.character,personality:input.personality,role:input.role,color:input.color,version:1,identity:randomUUID()};
 validate(profile);
 const directory=join(resolve(stateDir),'profiles');await mkdir(directory,{recursive:true,mode:0o700});
 const destination=join(directory,`${profile.id}.json`),temporary=join(directory,`.${randomUUID()}.tmp`);
 try{
  const file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(profile,null,2)+'\n');await file.sync();}finally{await file.close();}
  await link(temporary,destination);
  const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
 }finally{await rm(temporary,{force:true});}
 return profile;
}
export async function loadProfile(stateDir:string,id:string):Promise<BotProfile>{
 if(!validId(id))throw Error('Invalid profile ID');
 const profile=JSON.parse(await readFile(join(resolve(stateDir),'profiles',`${id}.json`),'utf8')) as BotProfile;
 validate(profile);if(profile.id!==id)throw Error('Profile ID does not match its file');return profile;
}
export async function listProfiles(stateDir:string):Promise<BotProfile[]>{
 let entries:string[];try{entries=await readdir(join(resolve(stateDir),'profiles'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
 return Promise.all(entries.filter(name=>/^[a-zA-Z0-9_-]{1,80}\.json$/.test(name)).sort().map(name=>loadProfile(stateDir,name.slice(0,-5))));
}
