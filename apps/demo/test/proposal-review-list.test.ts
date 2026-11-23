import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {reviewQueue} from '../proposal-review/review-list.js';
const id=(n:number)=>n.toString(16).padStart(64,'0');
const statuses=['pending','applying','unconfirmed','needs_attention','applied','rejected','stale','not_applied'];
const rows=()=>statuses.map((status,n)=>({id:id(n),status}));
test('stored queue groups each supported status with consistent counts and owned output',()=>{
 const input=rows(),before=structuredClone(input),all=reviewQueue(input);assert.deepEqual(all.counts,{all:8,pending:1,unresolved:3,closed:4});
 for(const group of ['pending','unresolved','closed'] as const){const result=reviewQueue(input,group);assert.equal(result.rows.length,result.counts[group]);assert(result.rows.every((r:any)=>r.group===group));}
 all.rows[0].status='mutated';assert.deepEqual(input,before);
});
test('local decisions move only pending records into unresolved, without promoting closed versions',()=>{
 const input=rows();input.push({id:id(9),status:'pending'});const result=reviewQueue(input,'unresolved',()=>true);
 assert.deepEqual(result.counts,{all:9,pending:0,unresolved:5,closed:4});assert.equal(result.rows.filter((r:any)=>r.localDecisionPending).length,2);
 assert.deepEqual(reviewQueue(input,'closed',()=>true).rows.map((r:any)=>r.status),['applied','rejected','stale','not_applied']);
});
test('unknown statuses, duplicate identities and oversized lists fail closed',()=>{
 for(const bad of [null,[{id:id(0),status:'approved'}],[{id:'<script>',status:'pending'}],[rows()[0],rows()[0]],Array.from({length:257},(_,n)=>({id:id(n),status:'pending'}))])assert.throws(()=>reviewQueue(bad));
 assert.throws(()=>reviewQueue([],'invalid'));assert.deepEqual(reviewQueue([]).counts,{all:0,pending:0,unresolved:0,closed:0});
});
class Element {
 textContent='';className='';disabled=false;hidden=false;type='';value='all';children:Element[]=[];
 append(...children:Element[]){this.children.push(...children);}replaceChildren(...children:Element[]){this.children=children;}
 addEventListener(){}querySelectorAll(){return this.children.filter(c=>c.type==='button');}
}
async function ui(){
 const elements=new Map<string,Element>();const get=(id:string)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)!;};let sends=0;
 const context=vm.createContext({reviewQueue,document:{getElementById:get,createElement:()=>new Element()},localStorage:{getItem:()=>null},fetch:()=>{sends++;throw Error('Unexpected request');}});
 const source=await readFile(new URL('../proposal-review/review.js',import.meta.url),'utf8');vm.runInContext(source.replace(/^import[^\n]*\n/,'').split('let ownsEditor=false;')[0],context);
 return {run:(code:string)=>vm.runInContext(code,context),get,sends:()=>sends,context};
}
test('filter changes clear selected evidence and confirmation without sending a decision',async()=>{
 const u=await ui();u.context.seed=rows();u.run('items=seed;selected=items[0].id;record={};confirmation="accept";');u.get('filter').value='closed';u.run('changeFilter()');
 assert(u.run('selected===null&&record===null&&confirmation===null'));assert.equal(u.sends(),0);assert.equal(u.get('list').children.length,4);assert.match(u.get('queue-counts').textContent,/4 shown/);
 u.run('busy=true;confirmation="accept";changeFilter()');assert.equal(u.run('confirmation'),'accept');assert.equal(u.sends(),0);
});
test('filter switch ignores an outstanding detail response instead of reopening its approval controls',async()=>{
 const u=await ui();let release!:(value:unknown)=>void;u.context.waiting=new Promise(r=>release=r);u.run('request=()=>waiting');const work=u.run(`inspect('${id(0)}')`);u.get('filter').value='closed';u.run('changeFilter()');release({payload:{id:id(0)}});await work;
 assert(u.run('selected===null&&record===null&&confirmation===null'));assert.equal(u.get('detail').hidden,true);assert.equal(u.sends(),0);
});
test('filter switch ignores an outstanding list refresh and corrupt local evidence is conservatively unresolved',async()=>{
 const u=await ui();u.context.seed=rows();u.run('items=seed;localStorage.getItem=()=>{throw Error("unavailable")};renderList()');assert.match(u.get('queue-counts').textContent,/0 pending · 4 unresolved/);
 let release!:(value:unknown)=>void;u.context.waiting=new Promise(r=>release=r);u.run('request=()=>waiting');const work=u.run('refresh()');u.get('filter').value='unresolved';u.run('changeFilter()');release([]);await work;assert.equal(u.run('items.length'),8);assert.equal(u.sends(),0);
});

test('empty local decision remains unresolved and cannot expose or submit a fresh approval',async()=>{
 const u=await ui();u.context.seed=[{id:id(0),status:'pending'}];u.context.sample={status:'pending',proposalDigest:'a'.repeat(64),payload:{id:id(0),before:'old',after:'new',preview:{removed:'old',inserted:'new',prefix:'',suffix:''},request:{requestId:'creation',change:{kind:'replace_text',path:[0],blockId:'block',start:0,end:3},explanation:'test',assumptions:[],questions:[],checks:[],base:{}}}};
 u.context.navigator={locks:{request:async(_key:unknown,fn:()=>unknown)=>fn()}};u.context.crypto={randomUUID:()=> '00000000-0000-0000-0000-000000000001'};
 u.run('items=seed;selected=items[0].id;record=sample;localStorage.getItem=()=>"";globalThis.saves=0;globalThis.posts=0;localStorage.setItem=()=>{saves++};request=async()=>{posts++;throw Error("Unexpected request")};renderList();render()');
 assert.match(u.get('queue-counts').textContent,/0 pending · 1 unresolved/);
 const labels=(el:Element):string[]=>[el.textContent,...el.children.flatMap(labels)];assert(!labels(u.get('detail')).includes('Approve…'));
 await u.run('submit("accept")');assert.equal(u.run('saves'),0);assert.equal(u.run('posts'),0);assert.equal(u.sends(),0);assert.match(u.get('notice').textContent,/Outcome unconfirmed|JSON/);
});
