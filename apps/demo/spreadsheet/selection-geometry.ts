export type CellRange={row:number;column:number;endRow:number;endColumn:number};
export type CellWindow={row:number;column:number;rows:number;columns:number};
export type CellRect={left:number;top:number;right:number;bottom:number};

/** Only original range edges are drawn. Window clipping must not create edges. */
export function selectionOutline(range:CellRange,window:CellWindow,rect:(col:number,row:number)=>CellRect,inset=1):string|null {
 const top=Math.min(range.row,range.endRow),bottom=Math.max(range.row,range.endRow);
 const left=Math.min(range.column,range.endColumn),right=Math.max(range.column,range.endColumn);
 if(![top,bottom,left,right].every(Number.isInteger)||top<0||left<0||window.rows<1||window.columns<1)return null;
 const r0=Math.max(top,window.row),r1=Math.min(bottom,window.row+window.rows-1);
 const c0=Math.max(left,window.column),c1=Math.min(right,window.column+window.columns-1);
 if(r0>r1||c0>c1)return null;
 // VTable includes the row-number column and column-header row.
 const first=rect(c0-window.column+1,r0-window.row+1),last=rect(c1-window.column+1,r1-window.row+1);
 // Draw inside cell borders so adjacent native and remote outlines stay separate.
 const x0=first.left+inset,x1=last.right-inset,y0=first.top+inset,y1=last.bottom-inset;
 if(![x0,x1,y0,y1,inset].every(Number.isFinite)||inset<0||x0>=x1||y0>=y1)return null;
 return [top===r0?`M${x0},${y0}H${x1}`:'',right===c1?`M${x1},${y0}V${y1}`:'',bottom===r1?`M${x1},${y1}H${x0}`:'',left===c0?`M${x0},${y1}V${y0}`:''].filter(Boolean).join(' ')||null;
}

export type OutlineRange={actor:string;range:CellRange};
export type OutlineLane={rangeKey:string;index:number;inset:number;dashArray?:string;dashOffset?:number};
/** Lanes depend only on actors at the same normalized logical rectangle. */
export function selectionLanes(entries:OutlineRange[]):OutlineLane[]{
 const keys=entries.map(({range})=>[Math.min(range.row,range.endRow),Math.min(range.column,range.endColumn),Math.max(range.row,range.endRow),Math.max(range.column,range.endColumn)].join(':'));
 const groups=new Map<string,number[]>();
 keys.forEach((key,index)=>{const group=groups.get(key)??[];group.push(index);groups.set(key,group);});
 const result:OutlineLane[]=[];
 for(const [rangeKey,group] of groups){
  group.sort((a,b)=>entries[a]!.actor<entries[b]!.actor?-1:entries[a]!.actor>entries[b]!.actor?1:a-b);
  group.forEach((entry,index)=>{const lane:OutlineLane={rangeKey,index,inset:1+2*Math.min(index,2)};
   if(group.length>3&&index>=2){lane.dashArray=`2 ${2*(group.length-3)}`;lane.dashOffset=-2*(index-2);}
   result[entry]=lane;
  });
 }
 return result;
}
