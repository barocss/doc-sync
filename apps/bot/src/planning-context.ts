import type {EditOp,Schema} from "@barocss/doc-sync";

type Revision = {epoch:string;serverSeq:number;schemaVersion:string|null};
export type PlanningBinding = {path:number[];blockId:string;epoch:string;schemaVersion:string|null};
export type BoundedPlanningContext = {view:"bounded_subtree";partial:true;path:number[];blockId:string;node:unknown};
export function parsePlanningPath(value:unknown):number[] {
    if(!Array.isArray(value)||value.length<1||value.length>32||!Array.from(value).every(i=>Number.isSafeInteger(i)&&i>=0)) throw Error("planningPath requires 1–32 canonical child indexes");
    return [...value];
}
export function assertPersistedPlanningState(state:{planningPath?:number[];planningBinding?:PlanningBinding}):void {
    if(state.planningPath===undefined&&state.planningBinding===undefined)return;
    if(state.planningPath===undefined||state.planningBinding===undefined)throw Error("Persisted planning path/binding pair is incomplete; review required");
    const path=parsePlanningPath(state.planningPath),binding=state.planningBinding;
    if(JSON.stringify(path)!==JSON.stringify(binding.path)||typeof binding.blockId!=="string"||!/^\d+@/.test(binding.blockId)||binding.blockId.startsWith("0@")||typeof binding.epoch!=="string"||!binding.epoch||(binding.schemaVersion!==null&&typeof binding.schemaVersion!=="string"))throw Error("Invalid persisted planning binding; review required");
}
const sameRevision=(a:Revision,b:Revision)=>a.epoch===b.epoch&&a.serverSeq===b.serverSeq&&a.schemaVersion===b.schemaVersion;
const prefix=(path:number[],scope:number[])=>path.length>=scope.length&&scope.every((v,i)=>path[i]===v);
/** One complete bounded subtree, never a partially concatenated or silently rebound page. */
export async function readPlanningContext(call:(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>,path:number[],revision:Revision,previous?:PlanningBinding):Promise<{document:BoundedPlanningContext;binding:PlanningBinding}> {
    path=parsePlanningPath(path);
    const slice=await call("read_document_slice",{path:path.slice(0,-1),start:path.at(-1),limit:1,maxNodes:2048,maxTextUnits:32768,maxBytes:131072});
    const actual=slice.revision as Revision|null;
    if(!actual||!sameRevision(actual,revision)||!slice.sessionOnline||slice.pending||slice.conditionalPending||slice.recoveryRequired)throw Error("Planning slice revision changed or session is unsettled; read again");
    const children=slice.children as Array<{path:number[];blockId:string|null;node:unknown}>;
    if(!Array.isArray(children)||children.length!==1||JSON.stringify(children[0].path)!==JSON.stringify(path)||typeof children[0].blockId!=="string"||!/^\d+@/.test(children[0].blockId)||children[0].blockId.startsWith("0@"))throw Error("Planning scope requires one current stored subtree; synthetic or missing targets need review");
    const blockId=children[0].blockId;
    const binding:PlanningBinding={path:[...path],blockId,epoch:revision.epoch,schemaVersion:revision.schemaVersion};
    if(previous&&(JSON.stringify(previous.path)!==JSON.stringify(path)||previous.blockId!==blockId||previous.epoch!==revision.epoch||previous.schemaVersion!==revision.schemaVersion))throw Error("Planning target identity, placement or schema changed; review required");
    return {document:{view:"bounded_subtree",partial:true,path:[...path],blockId,node:children[0].node},binding};
}
export function assertStoredTextTarget(node:unknown,schema:Schema):asserts node is {type:string;runs?:unknown} {
    if(!node||typeof node!=="object"||Array.isArray(node)||!("type" in node)||typeof node.type!=="string"||!Object.hasOwn(schema.nodes,node.type)||schema.nodes[node.type].shape!=="text")throw Error("Bounded planning currently requires a stored text block; structural subtrees need review");
}
export function assertPlanningTarget(node:unknown,schema:Schema):void {
    assertStoredTextTarget(node,schema);
    if (!("runs" in node) || !Array.isArray(node.runs) || !node.runs.every(run =>
        run && typeof run === "object" && !Array.isArray(run) &&
        Object.hasOwn(run,"text") && typeof run.text === "string" &&
        !Object.hasOwn(run,"type") && !Object.hasOwn(run,"children") && !Object.hasOwn(run,"runs"))) {
        throw Error("Bounded planning requires plain text runs; inline objects and span structures need review");
    }
}
/** Restrict all edit paths, not only the planner's advertised selection. */
export function assertPlanningEdits(edits:EditOp[],scope:number[]):void {
    for(const edit of edits){
        if(edit.op==="update"&&(!Number.isSafeInteger(edit.length)||edit.length!<0))throw Error("Bounded planning updates require an explicit nonnegative text length; inline attributes need review");
        if((edit.op==="insert"&&typeof edit.content!=="string")||(edit.op==="update"&&Object.hasOwn(edit.attrs,"type")))throw Error("Bounded planning forbids structural inserts and type-changing updates");
        if(!["insert","delete","update"].includes(edit.op)||!("at" in edit)||!prefix(edit.at,scope)||edit.at.length!==scope.length+1)throw Error("Bounded planning allows only text-position insert/delete/update inside the stored text target; move/split/merge or out-of-scope edits need review");
    }
}
export function assertPlanningSelection(path:number[],scope:number[]):void {
    if(!prefix(path,scope)||path.length!==scope.length+1)throw Error("Selection is outside the bounded planning target");
}
