import {JSDOM} from 'jsdom';
import {Editor} from '@tiptap/core';
import {DocSync,createTiptapExtensions} from '../../packages/doc-sync/src/tiptap/index.ts';
import {MemoryNet} from '../../packages/doc-sync/test/harness.ts';
const dom=new JSDOM('<html><body></body></html>',{pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','DOMParser','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,name,{value:(dom.window as any)[name],configurable:true,writable:true});
const net=new MemoryNet(); const client=net.add('probe'); client.connect(); await net.settle();
const editor=new Editor({element:document.body.appendChild(document.createElement('div')),extensions:[...createTiptapExtensions(client.schema),DocSync.configure({client,onSelection:()=>{throw new Error('host selection throw')}})]});
try{editor.commands.insertContent('X')}catch(error){console.log('command error:',(error as Error).message)}
console.log('editor:',JSON.stringify(editor.getJSON())); console.log('client:',JSON.stringify(client.doc.toJSON())); console.log('pending:',client.pending.length);
editor.destroy();client.disconnect();dom.window.close();
