import {loadProfile,profileActor} from '../src/profiles.ts';
import {resumeMission,runMission} from '../src/runner.ts';

const [url,stateDir,resumeId]=process.argv.slice(2),document='proposal-team';
const profile=await loadProfile(stateDir,'writer'),actor=profileActor(profile,url,document);
if(resumeId){
 const result=await resumeMission(stateDir,resumeId,async input=>{
  const model=JSON.stringify(input.document);if(!model.includes('[USER]')||!model.includes('"Pilot"'))throw Error('User edit or organizer table is missing');
  if(model.includes('Pilot in four weeks.'))return {action:'finish',at:[],text:'',count:0,message:'Proposal drafted'};
  const section=(input.document as {children:Array<{children?:unknown[]}>}).children[1];return {action:'edit',at:[],text:'',count:0,message:'Add milestones',editsJson:JSON.stringify([{op:'insert',at:[1,section.children!.length-2],content:[{type:'heading2',runs:[{text:'Milestones'}]},{type:'paragraph',runs:[{text:'Pilot in four weeks.'}]}]}])};
 });
 console.log(JSON.stringify(result));
}else await runMission({url,document,actor,stateDir,profileId:profile.id,mission:'Write the goals and milestones for the proposal',name:profile.name,color:profile.color,character:profile.character,personality:profile.personality,role:profile.role,maxSteps:5},async()=>({
 action:'edit',at:[],text:'',count:0,message:'Add proposal goals',editsJson:JSON.stringify([{op:'insert',at:[1,1],content:[{type:'heading2',runs:[{text:'Goals'}]},{type:'paragraph',runs:[{text:'Deliver a shared workspace.'}]}]}])
}));
