import type {AxisId} from '@barocss/doc-sync';
/** Ephemeral identity and draft limits. These values never enter the sheet journal. */
export const MAX_PREVIEW_TEXT=8192;
export function presenceIdentity(actor:string){
 const palette=['#3975c5','#d64b55','#27845b','#8d56b0','#b56b26','#287f91'];
 let hash=0;for(const char of actor)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
 return {name:/^alice(?:-|$)/i.test(actor)?'Alice':/^bob(?:-|$)/i.test(actor)?'Bob':actor.slice(0,80),color:/^alice(?:-|$)/i.test(actor)?palette[0]:/^bob(?:-|$)/i.test(actor)?palette[1]:palette[hash%palette.length]};
}
export type PresenceTarget={row:number|AxisId;column:number|AxisId};
/** Offsets use UTF-16 code units, as DOM selectionStart and selectionEnd do. */
export type PresenceTextSelection={start:number;end:number;direction:'forward'|'backward'|'none'};
export type PresenceEditing={target:PresenceTarget;field:string;text:string;composing:boolean;selection?:PresenceTextSelection};
function splitsSurrogate(text:string,offset:number){return offset>0&&offset<text.length&&text.charCodeAt(offset-1)>=0xd800&&text.charCodeAt(offset-1)<=0xdbff&&text.charCodeAt(offset)>=0xdc00&&text.charCodeAt(offset)<=0xdfff;}
export function validTextSelection(text:string,selection:unknown):selection is PresenceTextSelection {
 if(!selection||typeof selection!=='object'||Array.isArray(selection))return false;
 const value=selection as PresenceTextSelection;
 return Object.keys(selection).length===3&&Object.keys(selection).every(k=>['start','end','direction'].includes(k))&&Number.isSafeInteger(value.start)&&Number.isSafeInteger(value.end)&&value.start>=0&&value.start<=value.end&&value.end<=text.length&&['forward','backward','none'].includes(value.direction)&&!splitsSurrogate(text,value.start)&&!splitsSurrogate(text,value.end);
}
/** Truncate without splitting an astral character. Keep legal ZWJ/combining offsets.
 * Local invalid offsets clamp down to code point boundaries; collapsed carets stay collapsed. */
export function normalizePreview(text:string,selection?:PresenceTextSelection):{text:string;selection?:PresenceTextSelection} {
 let limit=Math.min(text.length,MAX_PREVIEW_TEXT);if(splitsSurrogate(text,limit))limit--;
 const preview=text.slice(0,limit);if(!selection)return {text:preview};
 const offset=(value:number)=>{let n=Number.isFinite(value)?Math.max(0,Math.min(limit,Math.trunc(value))):0;if(splitsSurrogate(preview,n))n--;return n;};
 const start=offset(selection.start),end=offset(selection.end);
 return {text:preview,selection:{start:Math.min(start,end),end:Math.max(start,end),direction:['forward','backward','none'].includes(selection.direction)?selection.direction:'none'}};
}
