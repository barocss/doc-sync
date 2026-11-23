import {applyEdits} from '../../packages/doc-sync/dist/crdt/model.js';

const at=(model,path)=>path.reduce((node,index)=>node?.children?.[index],model);

/** Independent model rule from docs/edit-api.md: a single-cell insert authors
 * a full rectangular column; stable merge endpoints include newly inserted
 * axes strictly inside the prior inclusive range. No actual state/normalize
 * output is read here. */
export function insertionOracle(schema,before,request){
 const requestOnly=applyEdits(schema,before,[request]);
 const first=Array.isArray(request.content)?request.content[0]:null;
 const shape=first?.type&&schema.nodes[first.type]?.shape;
 const axis=shape==='row'?'rows':shape==='cell'?'cols':null;
 if(!axis)return{method:'applyEdits(schema,preCanonicalModel,sameLogicalInsert)',expected:requestOnly,requestOnly,independentEdits:[request],constraintRules:[]};
 const gridPath=axis==='rows'?request.at.slice(0,-1):request.at.slice(0,-2),grid=at(before,gridPath);
 if(schema.nodes[grid?.type]?.shape!=='grid')return{method:'applyEdits(schema,preCanonicalModel,sameLogicalInsert)',expected:requestOnly,requestOnly,independentEdits:[request],constraintRules:[]};
 const index=request.at.at(-1),count=request.content.length,edits=[],rules=[];
 const rowType=schema.nodes[grid.type].children[0],cellType=schema.nodes[rowType].children[0],bodyType=schema.nodes[cellType].children[0];
 const emptyCell=()=>({type:cellType,children:[{type:bodyType,children:[]}]});
 if(axis==='rows'){
  const width=Math.max(0,...grid.children.map(row=>(row.children??[]).length));
  const content=request.content.map(row=>({...row,children:Array.from({length:width},(_,col)=>structuredClone(row.children?.[col]??emptyCell()))}));
  edits.push({...request,content});
  rules.push({rule:'existing-grid row insertion keeps current column count',fixedWidth:width,inputCellCounts:request.content.map(row=>(row.children??[]).length),droppedCellCounts:request.content.map(row=>Math.max(0,(row.children??[]).length-width)),newGridConstructionUnaffected:true});
 }else edits.push(request);
 if(axis==='cols'){
  const selected=request.at.at(-2);
  for(let row=0;row<grid.children.length;row++)if(row!==selected)edits.push({op:'insert',at:[...gridPath,row,index],content:Array.from({length:count},()=>({type:cellType,children:[{type:bodyType,children:[]}]}))});
  rules.push({rule:'whole-column rectangular insertion',selectedRow:selected,index,count,otherRowsReceiveEmptyCells:true});
 }
 for(let row=0;row<(grid.children??[]).length;row++)for(let col=0;col<(grid.children[row].children??[]).length;col++){
  const cell=grid.children[row].children[col],start=axis==='rows'?row:col,key=axis==='rows'?'rowspan':'colspan',span=cell.attrs?.[key]??1,end=start+span-1;
  if(start<index&&index<=end){
   const targetRow=axis==='rows'&&row>=index?row+count:row,targetCol=axis==='cols'&&col>=index?col+count:col;
   edits.push({op:'update',at:[...gridPath,targetRow,targetCol],attrs:{[key]:span+count}});
   rules.push({rule:'stable inclusive merge endpoint',axis,start,end,index,count,cellBefore:[row,col],cellAfter:[targetRow,targetCol],attribute:key,expectedExtent:span+count});
  }
 }
 return{method:'independent documented axis/merge constraint model + applyEdits',expected:applyEdits(schema,before,edits),requestOnly,independentEdits:edits,constraintRules:rules};
}
