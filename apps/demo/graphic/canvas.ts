import {Application, Container, Graphics, Text, Rectangle, Ellipse} from 'pixi.js';

export interface CanvasObject {
  id:string; type:string; parentId:string|null;
  transform:{x:number;y:number;rotation:number;scale:number};
  size?:{width:number;height:number}; name?:string; fill?:string; stroke?:string;
  opacity?:number; locked?:boolean; clipContent?:boolean; text?:string;
}
interface NodeView {root:Container; body:Graphics; children:Container; mask:Graphics; label:Text|null; outline:Graphics; signature:string}
export interface CanvasCallbacks {select(id:string|null):void; move(id:string,x:number,y:number):void; pointer(point:{x:number;y:number}|null):void; error(error:unknown):void}
/** Pixi owns display objects only. The session owns the document and history. */
export class GraphicCanvas {
  readonly app = new Application();
  readonly nodes = new Map<string,NodeView>();
  readonly scene = new Container();
  readonly peerOverlay = new Container();
  readonly errors:string[]=[];
  readonly metrics={updates:0,created:0,destroyed:0,renderUpdateMs:0,nextFrameMs:0};
  private objects = new Map<string,CanvasObject>();
  private selected:string[]=[];
  private peers:any[]=[];
  private observer:ResizeObserver|null=null;
  private drag:{id:string;startX:number;startY:number;worldX:number;worldY:number;dx:number;dy:number}|null=null;
  private disposed=false;
  private lastObjects:CanvasObject[]=[];
  private selectionStamp="";
  private pointerSentAt=0;
  private fitWidth=850;
  private fitHeight=610;
  private fitCount=-1;
  private ready=false;
  private grid = new Graphics();
  readonly host:HTMLElement;
  readonly callbacks:CanvasCallbacks;
  constructor(host:HTMLElement,callbacks:CanvasCallbacks){this.host=host;this.callbacks=callbacks;}
  async init(){
    await this.app.init({background:0xf6f7f9,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl'});
    if(this.disposed){this.app.destroy(true,{children:true});return;}
    this.host.append(this.app.canvas); this.app.stage.addChild(this.grid,this.scene,this.peerOverlay);
    this.app.stage.eventMode='static';
    this.app.stage.on('pointerdown',event=>{if(event.target===this.app.stage)this.callbacks.select(null);});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.host);this.resize();
    this.app.canvas.addEventListener('pointermove',this.onMove);
    this.app.canvas.addEventListener('pointerleave',this.onLeave);
    window.addEventListener('pointerup',this.onUp);window.addEventListener('pointercancel',this.onCancel);
    this.ready=true;
  }
  private resize(){
    const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);
    this.app.renderer.resize(width,height);this.app.stage.hitArea=new Rectangle(0,0,width,height);
    const scale=Math.min(1,(width-48)/this.fitWidth,(height-60)/this.fitHeight);this.scene.position.set(24,38);this.scene.scale.set(scale);
    this.grid.clear();for(let x=24;x<width;x+=24)for(let y=38;y<height;y+=24)this.grid.circle(x,y,.65).fill(0xd9dde4);
  }
  update(objects:CanvasObject[],selected:string[]=[],peers:any[]=[]){
    if(!this.ready)return;
    this.peers=peers;
    const stamp=selected.join('|');
    if(stamp===this.selectionStamp&&objects.length===this.lastObjects.length&&objects.every((object,index)=>object===this.lastObjects[index])){this.drawPeers(peers);return;}
    this.lastObjects=objects;this.selectionStamp=stamp;
    const start=performance.now();this.objects=new Map(objects.map(object=>[object.id,object]));this.selected=selected;
    for(const [id,view]of this.nodes)if(!this.objects.has(id)){view.root.destroy({children:true});this.nodes.delete(id);this.metrics.destroyed++;}
    for(const object of objects){
      let view=this.nodes.get(object.id);
      if(!view){
        const root=new Container(),body=new Graphics(),children=new Container(),mask=new Graphics(),outline=new Graphics();
        root.addChild(body,children,mask,outline);view={root,body,children,mask,outline,label:null,signature:''};this.nodes.set(object.id,view);this.metrics.created++;
        body.eventMode='static';body.cursor='move';body.on('pointerdown',event=>{
          event.stopPropagation();this.callbacks.select(object.id);
          const current=this.objects.get(object.id);if(!current||current.locked)return;
          const point=this.toWorld(event.global.x,event.global.y),origin=view!.root.getGlobalPosition();
          const world=this.toWorld(origin.x,origin.y);this.drag={id:object.id,startX:point.x,startY:point.y,worldX:world.x,worldY:world.y,dx:0,dy:0};
          this.app.canvas.setPointerCapture?.(event.pointerId);
        });
      }
      const parent=object.parentId?this.nodes.get(object.parentId)?.children:this.scene;
      if(parent&&view.root.parent!==parent)parent.addChild(view.root);
      // A pending drag remains local. Incoming model changes still update its parent.
      const t=object.transform;view.root.position.set(t.x,t.y);view.root.rotation=t.rotation*Math.PI/180;view.root.scale.set(t.scale);
      view.root.alpha=object.opacity??1;
      const signature=JSON.stringify([object.type,object.size,object.fill,object.stroke,object.text,object.clipContent,selected.includes(object.id)]);
      if(view.signature!==signature){this.paint(view,object,selected.includes(object.id));view.signature=signature;}
    }
    // Child order follows the document projection, never a label or array index identity.
    const order=new Map<Container,number>();for(const object of objects){const view=this.nodes.get(object.id)!;const parent=view.root.parent;if(parent){const at=order.get(parent)??0;if(parent.children[at]!==view.root)parent.setChildIndex(view.root,Math.min(at,parent.children.length-1));order.set(parent,at+1);}}
    if(objects.length!==this.fitCount){this.fitCount=objects.length;const bounds=this.scene.getLocalBounds();this.fitWidth=Math.max(850,bounds.right+25);this.fitHeight=Math.max(610,bounds.bottom+25);this.resize();}
    if(this.drag)this.preview();this.drawPeers(peers);
    this.metrics.updates++;this.metrics.renderUpdateMs=performance.now()-start;
    const frameStart=performance.now();requestAnimationFrame(()=>{this.metrics.nextFrameMs=performance.now()-frameStart;});
  }
  private paint(view:NodeView,object:CanvasObject,selected:boolean){
    const w=object.size?.width??160,h=object.size?.height??70,isContainer=object.type==='frame'||object.type==='object-group';
    view.body.clear();view.mask.clear();view.outline.clear();
    if(object.type==='ellipse')view.body.ellipse(w/2,h/2,w/2,h/2);else view.body.rect(0,0,w,h);
    view.body.fill({color:object.fill??(isContainer?'#ffffff':'#dbe7ff'),alpha:object.type==='object-group'?.08:object.type==='label'?0:1});
    if(isContainer||object.stroke)view.body.stroke({color:object.stroke??'#c8ced8',width:1,alpha:1});
    // Transparent group guides also provide an explicit empty-container hit target.
    view.body.hitArea=object.type==='ellipse'?new Ellipse(w/2,h/2,w/2,h/2):new Rectangle(0,0,w,h);
    if(object.type==='label'){
      if(!view.label){view.label=new Text({text:'',style:{fontFamily:'system-ui, sans-serif',fontSize:20,fill:'#263449',wordWrap:true,wordWrapWidth:w}});view.root.addChild(view.label);view.label.eventMode='none';}
      view.label.text=object.text??'';view.label.style.fill=object.fill??'#263449';view.label.style.wordWrapWidth=w;view.label.position.set(0,0);
    }else if(view.label){view.label.destroy();view.label=null;}
    if(object.type==='frame'&&object.clipContent!==false){view.mask.rect(0,0,w,h).fill(0xffffff);view.children.mask=view.mask;}else view.children.mask=null;
    if(selected){view.outline.rect(-2,-2,w+4,h+4).stroke({color:0x2463eb,width:2});for(const [x,y]of[[0,0],[w,0],[0,h],[w,h]])view.outline.rect(x-3,y-3,6,6).fill(0xffffff).stroke({color:0x2463eb,width:1});}
    view.outline.eventMode='none';
  }
  private drawPeers(peers:any[]){
    this.peerOverlay.removeChildren().forEach(child=>child.destroy());
    for(const peer of peers){const color=peer.profile?.color??peer.color??'#cf6a39';const ids=peer.metadata?.graphic?.selectedIds??peer.selectedIds??peer.selection?.objectIds??peer.range?.objectIds??[];
      for(const id of ids){const view=this.nodes.get(id);if(!view)continue;const b=view.root.getBounds();const line=new Graphics().rect(b.x-2,b.y-2,b.width+4,b.height+4).stroke({color,width:2});this.peerOverlay.addChild(line);}
      const point=peer.metadata?.graphic?.cursor??peer.pointer??peer.data?.pointer;if(point&&typeof point.x==='number'){const p=this.scene.toGlobal(point);const marker=new Graphics().moveTo(p.x,p.y).lineTo(p.x+4,p.y+15).lineTo(p.x+8,p.y+9).lineTo(p.x+15,p.y+7).closePath().fill(color);this.peerOverlay.addChild(marker);}
    }
  }
  private toWorld(x:number,y:number){return this.scene.toLocal({x,y});}
  private onMove=(event:PointerEvent)=>{const rect=this.app.canvas.getBoundingClientRect();const point=this.toWorld(event.clientX-rect.left,event.clientY-rect.top);if(this.drag){this.drag.dx=point.x-this.drag.startX;this.drag.dy=point.y-this.drag.startY;this.preview();}if(performance.now()-this.pointerSentAt>45){this.pointerSentAt=performance.now();this.callbacks.pointer({x:point.x,y:point.y});}};
  private preview(){if(!this.drag)return;const view=this.nodes.get(this.drag.id);if(!view?.root.parent)return;const world=this.scene.toGlobal({x:this.drag.worldX+this.drag.dx,y:this.drag.worldY+this.drag.dy});const local=view.root.parent.toLocal(world);view.root.position.copyFrom(local);}
  private onUp=()=>{const drag=this.drag;this.drag=null;try{if(drag&&(Math.abs(drag.dx)+Math.abs(drag.dy)>.5))this.callbacks.move(drag.id,drag.worldX+drag.dx,drag.worldY+drag.dy);}catch(error){this.callbacks.error(error);}finally{this.lastObjects=[];this.update([...this.objects.values()],this.selected,this.peers);}};
  private onCancel=()=>{this.drag=null;this.lastObjects=[];this.update([...this.objects.values()],this.selected,this.peers);};
  private onLeave=()=>{if(!this.drag)this.callbacks.pointer(null);};
  screenPoint(id:string){const view=this.nodes.get(id);if(!view)return null;const b=view.body.getBounds(),rect=this.app.canvas.getBoundingClientRect();return{x:rect.left+b.x+b.width/2,y:rect.top+b.y+b.height/2,width:b.width,height:b.height};}
  snapshot(){const renderer=this.app.renderer as any;const gl=renderer?.gl,extension=gl?.getExtension?.('WEBGL_debug_renderer_info');return{...this.metrics,nodeCount:this.nodes.size,peerOverlayCount:this.peerOverlay.children.length,gpuRenderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):null,webglVersion:gl?.getParameter?.(gl.VERSION)??null,renderer:renderer?.type??null,rendererName:renderer?.constructor?.name,objects:[...this.objects.values()].map(o=>{const view=this.nodes.get(o.id);return{id:o.id,transform:o.transform,size:o.size,fill:o.fill,text:o.text,displayTextFill:view?.label?.style.fill??null,displayTransform:view?{x:view.root.x,y:view.root.y,rotation:view.root.rotation*180/Math.PI,scale:view.root.scale.x}:null};}),errors:this.errors};}
  dispose(){this.disposed=true;this.observer?.disconnect();window.removeEventListener('pointerup',this.onUp);window.removeEventListener('pointercancel',this.onCancel);if(this.ready){this.app.canvas.removeEventListener('pointermove',this.onMove);this.app.canvas.removeEventListener('pointerleave',this.onLeave);this.app.destroy(true,{children:true});}this.nodes.clear();}
}
