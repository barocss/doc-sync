// Render the actual runtime SVGs into a design sheet. No remote assets are used.
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {createBotAvatar} from '../../../packages/doc-sync/dist/sync/character.js';
const oldDocument = globalThis.document;
globalThis.document = {createElement(){return {dataset:{},setAttribute(){},append(child){this.svg=child;}};},createElementNS(){return {setAttribute(){},innerHTML:''};}};
const characters=['fox','owl','cat','robot'];
const expressions=['curious','focused','thinking','editing','happy','concerned','surprised'];
const names=['Mori','Nuri','Bori','Tobi'];
const colors=['#fff1e8','#f2effb','#fceeee','#e9f5f2'];
const body=[];
for(let i=0;i<characters.length;i++){
 const y=112+i*116;
 body.push(`<rect x="20" y="${y}" width="920" height="102" rx="18" fill="${colors[i]}"/>`);
 body.push(`<text x="42" y="${y+42}" class="name">${names[i]}</text><text x="42" y="${y+65}" class="note">${['Curious explorer','Careful reviewer','Creative companion','Concise organizer'][i]}</text>`);
 for(let j=0;j<expressions.length;j++){
  const x=270+j*94;
  const avatar=createBotAvatar(characters[i],expressions[j]);
  body.push(`<svg x="${x}" y="${y+8}" width="68" height="68" viewBox="0 0 40 40">${avatar.svg.innerHTML}</svg>`);
  body.push(`<text x="${x+34}" y="${y+91}" text-anchor="middle" class="label">${expressions[j]}</text>`);
 }
}
globalThis.document=oldDocument;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="590" viewBox="0 0 960 590" role="img" aria-labelledby="title desc"><title id="title">Document bot mascot expression sheet</title><desc id="desc">Four round bot mascots, each shown with seven work-state expressions.</desc><style>text{font-family:system-ui,sans-serif;fill:#27364a}.title{font-size:25px;font-weight:700}.subtitle{font-size:13px;fill:#64748b}.name{font-size:16px;font-weight:700}.note{font-size:12px;fill:#64748b}.label{font-size:11px;fill:#526078}</style><rect width="960" height="590" rx="24" fill="#fbfaf8"/><text x="40" y="46" class="title">A small team with a lot to say.</text><text x="40" y="72" class="subtitle">Expressions reflect reported work states. Names and roles can be changed.</text>${body.join('')}</svg>`;
const destination=fileURLToPath(new URL('../src/public/mascots/expression-sheet.svg',import.meta.url));
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,svg+'\n');
