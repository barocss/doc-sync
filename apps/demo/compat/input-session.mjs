import {Doc, anchorAt, pathAt} from '@barocss/doc-sync';

/** A composition edits its own CRDT view. Remote ops keep reaching the live client.
 * Local ops retain their token origins when sent to the live document, so a stale
 * native view never turns remote text into a deletion in a model diff.
 */
export class InputSession {
  constructor(client){this.client=client;this.fork=null;this.pending=[];}
  get active(){return this.fork!==null;}
  get doc(){
    this.reserveClock();
    return this.fork??this.client.doc;
  }
  reserveClock(){
    if(!this.fork)return;
    const lamport=Math.max(this.fork.clock.lamport,this.client.doc.clock.lamport);
    this.fork.clock.lamport=lamport;this.client.doc.clock.lamport=lamport;
  }
  begin(){if(!this.fork){this.fork=Doc.fromSnapshot(this.client.actor,this.client.doc.snapshot(),this.client.schema);this.pending=[];}}
  end(){
    if(!this.fork)return [];
    const ops=this.pending.flatMap(change=>change.ops);
    const first=this.pending[0]?.record,last=this.pending.at(-1)?.record;
    this.client.doc.emit(ops);
    // One composition is one undo group. Remote changes stay outside that entry.
    this.client.commit(ops,{caretBefore:first?.caretBefore??'',caretAfter:last?.caretAfter??'',typing:false});
    this.cancel();return ops;
  }
  cancel(){this.fork=null;this.pending=[];}
  commit(ops,record){
    if(this.fork){
      // Reserve the draft's actor tickets before undo/redo or another live action.
      this.reserveClock();
      if(ops.length)this.pending.push({ops,record});
      return;
    }
    if(record===undefined)this.client.commit(ops);else this.client.commit(ops,record);
  }
  capture(range){
    if(!range)return null;
    const anchor=anchorAt(this.doc,range.anchor),focus=anchorAt(this.doc,range.focus);
    return anchor&&focus?{anchor,focus}:null;
  }
  resolve(range){
    if(!range)return null;
    const anchor=pathAt(this.client.doc,range.anchor),focus=pathAt(this.client.doc,range.focus);
    return anchor&&focus?{anchor,focus}:null;
  }
  /** PmBinding uses this narrow client interface. Sync/acks remain on the real client. */
  bindingClient(){
    const session=this,client=this.client;
    return {
      get doc(){return session.doc;},get schema(){return client.schema;},
      get online(){return client.online;},get others(){return client.others;},
      set onModelEvents(fn){client.onModelEvents=fn;},get onModelEvents(){return client.onModelEvents;},
      commit:(ops,record)=>session.commit(ops,record),undo:()=>client.undo(),redo:()=>client.redo(),
    };
  }
}

export function slateModelPoint(children,point){
  if(!point)return null;
  let node={children};
  for(const index of point.path.slice(0,-1))node=node?.children?.[index];
  if(!node?.children?.every(n=>typeof n.text==='string'))return null;
  return [...point.path.slice(0,-1),node.children.slice(0,point.path.at(-1)).reduce((sum,n)=>sum+n.text.length,0)+point.offset];
}
export function slateNativePoint(children,path){
  if(!path)return null;
  let node={children};
  for(const index of path.slice(0,-1))node=node?.children?.[index];
  if(!node?.children?.every(n=>typeof n.text==='string'))return null;
  let offset=path.at(-1);
  for(let i=0;i<node.children.length;i++){
    const length=node.children[i].text.length;
    if(offset<=length||i===node.children.length-1)return{path:[...path.slice(0,-1),i],offset:Math.min(offset,length)};
    offset-=length;
  }
  return null;
}

/** Lexical has no cell-body node; common paths insert that virtual level. */
export function lexicalBlocks(root){
  const blocks=[];
  const visit=(node,path)=>{
    const type=node.getType();
    if(['paragraph','heading','quote'].includes(type)){blocks.push({node,path});return;}
    const prefix=type==='tablecell'?[...path,0]:path;
    node.getChildren?.().forEach((child,i)=>visit(child,[...prefix,i]));
  };
  root.getChildren().forEach((node,i)=>visit(node,[i]));return blocks;
}
export function lexicalModelPoint(blocks,point){
  if(!point)return null;
  for(const {node,path}of blocks){
    if(point.key===node.getKey())return[...path,node.getChildren().slice(0,point.offset).reduce((s,n)=>s+n.getTextContentSize(),0)];
    let offset=0;
    for(const child of node.getChildren()){
      if(child.getKey()===point.key)return[...path,offset+point.offset];
      offset+=child.getTextContentSize();
    }
  }
  return null;
}
export function lexicalNativePoint(blocks,path){
  const block=blocks.find(b=>JSON.stringify(b.path)===JSON.stringify(path?.slice(0,-1)));
  if(!block)return null;
  let offset=path.at(-1);const children=block.node.getChildren();
  if(!children.length)return{key:block.node.getKey(),offset:0,type:'element'};
  for(let i=0;i<children.length;i++){
    const length=children[i].getTextContentSize();
    if(offset<=length||i===children.length-1)return{key:children[i].getKey(),offset:Math.min(offset,length),type:'text'};
    offset-=length;
  }
  return null;
}
