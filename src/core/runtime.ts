import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBook } from './book'
import {createTextureWarmer} from './textureWarm'
import { bookDimensions } from './geometry'
import {initialReadingView,clampReadingView,zoomAround,springReading,panLimits,rubber,touchPageAllowed,snapReadingView,pinchReading,fitReadingBounds,type ReadingView,type ReadingBounds} from './readingCamera'
import type {BookConfig} from './schema'
import {READ_ANGLE,leafCount,easeTurn,clamp01,nextLeaf} from './pages'
import {newChunkMotion,stepChunk,chunkCanCommit} from './chunkMotion'
import {newTurn,stepTurn,releaseCommit,followDrag,followRender,type TurnState} from './pagePhysics'
import {curlTarget} from './pageChain'
import {referenceDragProgress} from './pressReference'
import {desiredBatch,orderedProgress,openingLeaves,activeSpan} from './pageWindow'
import {PRESS_SCENE,coverProgress,brakeRetention,isBrakeable,READING_POSE_ADAPTER} from './referenceScene'
export class BookRuntime {
  private renderer:T.WebGLRenderer
  private warmedTextures=0
  private warmTexture=createTextureWarmer<T.Texture>(texture=>{this.renderer.initTexture(texture);this.warmedTextures++})
  private scene=new T.Scene()
  private camera=new T.PerspectiveCamera(35,1,.1,100)
  private controls:OrbitControls
  private book:ReturnType<typeof createBook>
  private floor:T.Mesh<T.PlaneGeometry,T.ShadowMaterial>
  private light=new T.DirectionalLight()
  private fill=new T.DirectionalLight()
  private ambient=new T.AmbientLight()
  private coverMotion:{from:number;to:number;elapsed:number}|null=null
  private dropElapsed=2000
  private openingActive=false
  private groupDrag=1
  private regrab=false
  private brakeElapsed=0
  private readLight=-1
  private readPose=0
  private readingView=initialReadingView()
  private readingTarget=initialReadingView()
  private readingVelocity:ReadingView={zoom:0,x:0,y:0}
  private readingBounds:ReadingBounds|null=null
  private readBase={zoom:1,x:0,y:0}
  private readAutoFit=true
  private readFrameRevision=0
  private cameraMoving=false
  private touchPoints=new Map<number,{x:number;y:number}>()
  private touchMode:'idle'|'pending'|'page'|'pan'|'pinch'|'hold'='idle'
  private touchStart:{x:number;y:number;time:number;view:ReadingView;lastX:number;velocityX:number;direction?:1|-1;progress?:number;distance?:number}|null=null
  private touchPinch:{x:number;y:number;distance:number;view:ReadingView}|null=null
  private cameraPan:{id:number;x:number;y:number;start:ReadingView}|null=null
  private groupProbeKey=''
  private groupProbe:string=''
    private peakChunk=0
  private environment:T.WebGLRenderTarget
  private resize:ResizeObserver
  private frame=0
  private drawing=false
  private followers:TurnState[]=[]
  private hovered=false
  private peakActive=0
  private last=0
  private open=0
  private index=0
  private turn:TurnState|null=null
  private releaseGoal:number|null=null
  private dragging=false
  private settledIndex=-1
  private config:BookConfig
  private disposed=false
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  constructor(private host:HTMLElement,c:BookConfig){
    this.config={...c};this.open=c.opening>=READ_ANGLE?180:c.opening;this.index=nextLeaf(0,c.pageIndex,leafCount(c))
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:true})
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.outputColorSpace=T.SRGBColorSpace
    this.renderer.domElement.setAttribute('aria-label','三维书籍预览')
    host.appendChild(this.renderer.domElement)
    const pmrem=new T.PMREMGenerator(this.renderer), room=new RoomEnvironment()
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture
    room.dispose();pmrem.dispose()
    this.camera.position.set(3,2,5)
    this.controls=new OrbitControls(this.camera,this.renderer.domElement)
    this.controls.enablePan=false;this.controls.minDistance=2;this.controls.maxDistance=15;this.controls.enableDamping=false
    this.controls.addEventListener('change',this.invalidate)
    this.light.position.set(-3,5,5);this.light.castShadow=true
    const size=host.clientWidth<640?PRESS_SCENE.mobileShadowMap:PRESS_SCENE.shadowMap;this.light.shadow.mapSize.set(size,size)
    Object.assign(this.light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,far:20})
    this.scene.add(this.light,this.fill,this.ambient)
    this.floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({opacity:.20}))
    this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor)
    this.book=createBook(c,this.invalidate,this.warmTexture);this.book.setReading(this.index,[]);this.scene.add(this.book.root)
    this.resize=new ResizeObserver(this.onResize);this.resize.observe(host)
    this.renderer.domElement.addEventListener('pointermove',this.hover)
    this.renderer.domElement.addEventListener('pointerleave',this.leave)
    this.host.addEventListener('wheel',this.readWheel,{passive:false})
    this.host.addEventListener('pointerdown',this.readPanStart,true)
    this.host.addEventListener('pointermove',this.readPanMove,true)
    this.host.addEventListener('pointerup',this.readPanEnd,true)
    this.host.addEventListener('pointercancel',this.readPanEnd,true)
    this.host.addEventListener('lostpointercapture',this.readPanEnd,true)
    this.apply(c);this.onResize();this.fit()
  }
  private onResize=()=>{const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.readingBounds=null;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.invalidate()}
  private hover=(e:PointerEvent)=>{if(this.config.opening>=READ_ANGLE||this.config.interaction!=='hover'||this.reduced.matches||e.pointerType==='touch')return;const b=this.host.getBoundingClientRect();this.book.root.rotation.y=T.MathUtils.degToRad(this.config.yaw)+(e.clientX-b.left-b.width/2)/b.width*.65;this.book.root.rotation.x=T.MathUtils.degToRad(this.config.pitch)+(e.clientY-b.top-b.height/2)/b.height*.4;this.invalidate()}
  private leave=()=>{this.clearPageHover();if(this.config.opening>=READ_ANGLE)return;this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch),T.MathUtils.degToRad(this.config.yaw),0);this.invalidate()}
  invalidate=()=>{if(!this.disposed&&!this.frame&&!this.drawing){this.last=performance.now();this.frame=requestAnimationFrame(this.draw)}}
  private draw=(now:number)=>{
    this.frame=0;if(this.disposed)return;this.drawing=true
    const openingTarget=this.config.opening>=READ_ANGLE?180:this.config.opening
    const dt=Math.min(.25,Math.max(0,(now-this.last)/1000));this.last=now
    if(this.coverMotion?.to!==openingTarget&&Math.abs(this.open-openingTarget)>.0001){this.coverMotion={from:this.open,to:openingTarget,elapsed:0};if(openingTarget===180){this.dropElapsed=0;this.openingActive=true}}
    if(this.reduced.matches){this.open=openingTarget;this.coverMotion=null;this.dropElapsed=2000;this.openingActive=false}else if(this.coverMotion){this.coverMotion.elapsed+=dt*1000;const a=coverProgress(this.coverMotion.from,this.coverMotion.to,this.coverMotion.elapsed);this.open=a.angle;if(a.done)this.coverMotion=null}
    if(openingTarget===180)this.dropElapsed=Math.min(2000,this.dropElapsed+dt*1000);else {this.dropElapsed=2000;this.openingActive=false}
    this.book.setOpening(this.open>=179.5&&openingTarget===180?180:this.open);this.book.setDrop(Math.max(0,this.dropElapsed-PRESS_SCENE.openDelayMs));this.applyLight(this.open/180)
    const target=nextLeaf(0,this.config.pageIndex,leafCount(this.config))
    const drop=this.openingActive&&this.open>=90?openingLeaves(this.index,leafCount(this.config),Math.max(0,this.dropElapsed-PRESS_SCENE.openDelayMs)):[]
    if(this.openingActive&&this.dropElapsed>=PRESS_SCENE.openDelayMs+6*50+400)this.openingActive=false
    const ready=this.open>=179.5&&!this.openingActive
    if(this.config.opening<READ_ANGLE||this.reduced.matches){this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=target}
    else if(ready){
      if(this.turn?.preview&&this.index!==target){const d=target>this.index?1:-1;if(this.turn.direction===d)this.turn.preview=false;else this.turn=null;this.hovered=false}
      if(!this.turn&&this.index!==target){this.turn=newTurn(target>this.index?1:-1);const n=Math.abs(target-this.index);if(n>6){this.turn.span=n;this.turn.chunkMotion=newChunkMotion(false)}}
      if(this.turn){
        const t=this.turn,commit=target!==this.index&&Math.sign(target-this.index)===t.direction
        if(t.preview){
          const aim=this.hovered?curlTarget('hover',0,t.grabU,this.config.pageCorner*this.config.pageHover):0
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(this.hovered?.94:.95,dt*60))
          if(Math.abs(t.curlAmount-aim)<.01){t.curlAmount=aim;if(!this.hovered)this.turn=null}
        }else if(t.span&&t.span>1){
          const m=t.chunkMotion??(t.chunkMotion=newChunkMotion(!!t.chunkGesture,t.progress))
          const goal=(this.releaseGoal??(commit?1:0)) as 0|1
          stepChunk(m,t.span,dt,this.book.prepareChunk(this.index,t.direction,t.span),this.dragging,t.dragTarget,goal)
          t.progress=m.progress;t.renderProgress=m.progress
          if(chunkCanCommit(m,t.renderProgress)){if(m.goal===1)this.index=nextLeaf(this.index,t.direction*t.span,leafCount(this.config));this.turn=null;this.followers=[];this.releaseGoal=null;this.dragging=false;this.regrab=false}
        }else if(this.dragging){
          const prev=t.progress;if(this.regrab&&this.brakeElapsed<PRESS_SCENE.brakeMs){this.brakeElapsed+=dt*1000;const k=brakeRetention(this.brakeElapsed);t.velocity*=Math.pow(1-k.damping,dt*60);const drift=clamp01(prev+t.velocity*dt*k.drive);t.progress=this.brakeElapsed<PRESS_SCENE.brakeLockMs&&Math.abs(t.dragTarget-(t.dragOrigin??0))<.01?drift:followDrag(drift,t.dragTarget,dt*(1-k.drive))}else{t.progress=t.span&&t.span>1?prev+(t.dragTarget-prev)*(1-Math.exp(-14*dt)):followDrag(prev,t.dragTarget,dt);t.velocity=dt>0?(t.progress-prev)/dt:0}
          t.renderProgress=followRender(t.renderProgress,t.progress,dt)
          const aim=curlTarget('drag',t.progress,t.grabU,this.config.pageCorner)
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(.96,dt*60))
          for(let i=0;i<this.followers.length;i++){const a=this.followers[i],lead=i?this.followers[i-1]:t,goal=this.regrab?clamp01((a.dragOrigin??a.progress)+t.dragTarget-(t.dragOrigin??0)):t.dragTarget;a.velocity*=Math.pow(1-(this.regrab?brakeRetention(this.brakeElapsed).damping:0),dt*60);a.progress=orderedProgress(lead.progress,followDrag(a.progress,goal,dt));a.renderProgress=orderedProgress(lead.renderProgress,followRender(a.renderProgress,a.progress,dt))}
        }else{
          const goal=this.releaseGoal??(this.followers.length?1:commit?1:0)
          const desired=goal===1&&!(t.span&&t.span>1)?desiredBatch(this.index,target,leafCount(this.config),t.direction):0
          while(this.followers.length+1<desired)this.followers.push(newTurn(t.direction))
          const all=[t,...this.followers],multi=all.length>1
          for(let i=0;i<all.length;i++){
            const a=all[i];let step=stepTurn(a.progress,a.velocity,goal,dt,this.config.pageDuration,multi)
            a.progress=i?orderedProgress(all[i-1].progress,step.progress):step.progress
            a.velocity=a.progress===step.progress?step.velocity:Math.min(step.velocity,all[i-1].velocity)
            a.renderProgress=followRender(a.renderProgress,a.progress,dt)
            if(i)a.renderProgress=orderedProgress(all[i-1].renderProgress,a.renderProgress)
            const aim=curlTarget('settle',a.progress,a.grabU,this.config.pageCorner)
            a.curlAmount+=(aim-a.curlAmount)*(1-Math.pow(.9,dt*60))
            // Keep the active leaf until its render angle has caught up.
            if(step.settled&&Math.abs(a.renderProgress-a.progress)<.002&&a.progress===step.progress){a.renderProgress=i?orderedProgress(all[i-1].renderProgress,a.progress):a.progress;if(a.renderProgress===a.progress)a.curlAmount=0}
          }
          if(Math.abs(t.progress-goal)<1e-8&&Math.abs(t.renderProgress-goal)<1e-8){
            if(goal===1){this.index=nextLeaf(this.index,t.direction*(t.span??1),leafCount(this.config));this.turn=this.followers.shift()??null;this.releaseGoal=null}else if(all.every(a=>a.progress<.002&&a.renderProgress<.002)){this.turn=null;this.followers=[];this.releaseGoal=null}
          }
        }
      }
    }
    const active=this.turn?[this.turn,...this.followers]:[]
    const display=drop.length?drop:active.filter(t=>!t.chunkMotion||t.chunkMotion.visible).map(t=>({direction:t.direction,progress:t.renderProgress,grip:t.grip,velocity:t.velocity,curlAmount:t.curlAmount,grabU:t.grabU,span:t.span,chunkGesture:t.chunkGesture,chunkLift:t.chunkMotion?.lift}))
    if(display.length||this.settledIndex!==this.index){this.book.setReading(this.index,display);this.settledIndex=display.length?-1:this.index}
    this.peakActive=Math.max(this.peakActive,active.filter(a=>!a.preview).length)
    this.peakChunk=Math.max(this.peakChunk,this.turn?.span??0);this.host.dataset.peakChunkLeaves=String(this.peakChunk);this.host.dataset.chunkLeaves=String(this.turn?.span??0);this.host.dataset.chunkPhase=this.turn?.chunkMotion?.phase??'idle';this.host.dataset.chunkLift=String(this.turn?.chunkMotion?.lift??0);this.host.dataset.textureWarmCount=String(this.warmedTextures);this.host.dataset.chunkLandedFrames=String(this.turn?.chunkMotion?.landedFrames??0);this.host.dataset.openingLeaves=String(drop.length);this.host.dataset.stackGeometry='layered';this.host.dataset.groupDrag=String(this.groupDrag);this.host.dataset.regrab=String(this.regrab);this.host.dataset.pageGpu='chain-texture';this.host.dataset.activeLeaves=String(active.length);this.host.dataset.peakActiveLeaves=String(this.peakActive)
    this.host.dataset.hoverCurl=String(this.turn?.preview?this.turn.curlAmount:0)
    this.host.dataset.pageProgress=String(this.turn?.progress??0);this.host.dataset.pageTarget=String(target);this.host.dataset.pageIndex=String(this.index);this.host.dataset.pageTurn=this.turn?(this.turn.preview?'preview':'active'):'idle';this.host.dataset.pageReady=String(ready)

    const previousPose=this.readPose;this.readPose=easeTurn(clamp01(this.open/180));if(this.readPose>0||previousPose>0)this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch+READING_POSE_ADAPTER.pitchOffset*this.readPose),T.MathUtils.degToRad(this.config.yaw+READING_POSE_ADAPTER.yawOffset*this.readPose),0)
    this.book.root.position.set(this.config.width/200*this.readPose,0,0).applyEuler(this.book.root.rotation)
    this.floor.visible=this.readPose<.5;this.scene.environmentIntensity=1-.8*this.readPose
    this.updateReadingCamera(dt,ready)
    this.renderer.render(this.scene,this.camera);this.drawing=false
    if(ready){const rect=this.renderer.domElement.getBoundingClientRect(),project=(v:T.Vector3|null)=>{if(!v)return '';const p=v.project(this.camera);return JSON.stringify([rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2])};this.host.dataset.rightPick=project(this.book.readingPickPoint());this.host.dataset.activePick=this.turn&&!this.turn.preview?project(this.book.activePickPoint()):'';if(!this.turn){const key=[this.index,rect.width,rect.height,this.config.pitch,this.config.yaw,this.camera.position.toArray().join(','),this.camera.quaternion.toArray().join(','),this.readingView.zoom,this.readingView.x,this.readingView.y,this.config.pageCount,this.open,this.dropElapsed].join(':');if(key!==this.groupProbeKey){this.groupProbeKey=key;this.groupProbe='';for(const point of this.book.groupPickCandidates(1)){const json=project(point),[x,y]=JSON.parse(json) as [number,number];if(this.findGroup(x,y)){this.groupProbe=json;break}}}this.host.dataset.groupPick=this.groupProbe}}
    if(this.cameraMoving||this.coverMotion||openingTarget===180&&this.dropElapsed<2000||this.index!==target||!!this.turn&&(!this.turn.preview||!this.hovered||Math.abs(this.turn.curlAmount-curlTarget('hover',0,this.turn.grabU,this.config.pageCorner*this.config.pageHover))>.01))this.frame=requestAnimationFrame(this.draw)
  }
  private apply(c:BookConfig){
    this.scene.background=new T.Color(c.background);this.readLight=-1;this.applyLight(this.open/180)
    this.book.root.rotation.set(T.MathUtils.degToRad(c.pitch),T.MathUtils.degToRad(c.yaw),0)
    this.floor.position.y=-c.height/200-.22;this.controls.enabled=c.interaction!=='hover'&&c.opening<READ_ANGLE
    this.invalidate()
  }
  update(c:BookConfig){
    const keys=['width','height','thickness','boardThickness','cornerRadius','pageInset','spineStyle'] as const
    const rebuild=keys.some(k=>this.config[k]!==c[k]);const frameChanged=rebuild||c.pitch!==this.config.pitch||c.yaw!==this.config.yaw||c.opening!==this.config.opening||c.coverFlex!==this.config.coverFlex||c.pageCoupling!==this.config.pageCoupling||c.pageCount!==this.config.pageCount;this.config={...c};if(frameChanged)this.readingBounds=null
    if(rebuild){this.groupProbeKey='';this.openingActive=false;this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=nextLeaf(0,c.pageIndex,leafCount(c));this.scene.remove(this.book.root);this.book.dispose();this.book=createBook(c,this.invalidate,this.warmTexture);this.book.setOpening(this.open);this.scene.add(this.book.root)}else this.book.updateAppearance(c)
    if(this.index>leafCount(c)||this.turn&&(this.turn.direction===1?leafCount(c)-this.index:this.index)<(this.turn.span??1)+this.followers.length){this.index=Math.min(this.index,leafCount(c));this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null}
    if(c.pageHover<=0)this.hovered=false;this.groupProbeKey='';this.settledIndex=-1;this.apply(c)
  }
  beginPageDrag(direction:1|-1,grip=0,grabU=1,group=1,regrab=false){
    if(this.config.opening<READ_ANGLE||this.open<179.5||this.openingActive||this.reduced.matches||nextLeaf(this.index,direction,leafCount(this.config))===this.index)return false
    if(regrab){if(!this.turn||this.turn.preview||this.turn.direction!==direction)return false}
    else if(this.turn&&!this.turn.preview||this.index!==this.config.pageIndex)return false
    const t=this.turn?.direction===direction?this.turn:newTurn(direction,grip);t.preview=false;this.hovered=false;t.grip=grip;t.dragTarget=t.progress;t.grabU=grabU;this.turn=t;this.dragging=true;this.releaseGoal=null
    this.regrab=regrab;this.host.dataset.dragAccepted=regrab?'regrab':'new';this.brakeElapsed=0;const available=direction===1?leafCount(this.config)-this.index:this.index;this.groupDrag=regrab?(t.span??1)+this.followers.length:Math.max(1,Math.min(group,available));t.chunkElapsed=undefined;t.chunkGesture=true;t.dragOrigin=t.progress;if(regrab){for(const a of this.followers)a.dragOrigin=a.progress}else if(this.groupDrag>6){t.span=this.groupDrag;this.followers=[]}else{t.span=undefined;this.followers=Array.from({length:this.groupDrag-1},()=>newTurn(direction))}if((t.span??1)>1)t.chunkMotion=newChunkMotion(true,t.progress,t.chunkMotion?.lift??0);this.invalidate();return true
  }
  dragPage(progress:number,_velocity=0,grip?:number,grabU?:number){if(this.dragging&&this.turn){this.turn.dragTarget=clamp01(progress);if(grip!==undefined)this.turn.grip=grip;if(grabU!==undefined)this.turn.grabU=grabU;this.invalidate()}}
  endPageDrag(commit:boolean|null=null,displacementPx=0){if(!this.dragging||!this.turn)return null;const t=this.turn,accepted=commit??(this.regrab?displacementPx>=5||displacementPx>-5&&t.progress>.5:releaseCommit(displacementPx));const index=accepted?nextLeaf(this.index,t.direction*this.groupDrag,leafCount(this.config)):this.index;this.dragging=false;this.regrab=false;t.velocity=0;this.releaseGoal=accepted?1:0;this.groupDrag=1;this.invalidate();return index}
  private applyLight(open:number){
    const p=easeTurn(clamp01(open));if(Math.abs(p-this.readLight)<.002)return;this.readLight=p
    const a=PRESS_SCENE.browse,b=PRESS_SCENE.read,mix=(x:number,y:number)=>x+(y-x)*p,scale=this.config.width/100/PRESS_SCENE.sourceWidth
    const color=(x:number,y:number)=>new T.Color(x).lerp(new T.Color(y),p)
    this.light.color.copy(color(a.keyColor,b.keyColor));this.light.intensity=mix(a.keyIntensity,b.keyIntensity)*this.config.light/3
    this.fill.color.copy(color(a.sunColor,b.sunColor));this.fill.intensity=mix(a.sunIntensity,b.sunIntensity)
    this.ambient.color.copy(color(a.ambientColor,b.ambientColor));this.ambient.intensity=mix(a.ambientIntensity,b.ambientIntensity)
    this.light.position.set(...a.key.map((v,i)=>mix(v,b.key[i])*scale) as [number,number,number])
    this.fill.position.set(...a.sun.map((v,i)=>mix(v,b.sun[i])*scale) as [number,number,number])
    const h=mix(a.shadowHalf,b.shadowHalf)*scale
    Object.assign(this.light.shadow.camera,{left:-h,right:h,top:h,bottom:-h,near:Math.max(.001,mix(a.near,b.near)*scale),far:mix(a.far,b.far)*scale});this.light.shadow.camera.updateProjectionMatrix()
    this.light.shadow.bias=mix(a.bias,b.bias);this.light.shadow.normalBias=mix(a.normalBias,b.normalBias)*scale;this.light.shadow.radius=mix(a.radius,b.radius)*mix(1,PRESS_SCENE.paper.shadowBlurMul)
  }
  // Hover only changes local curl, leaving the spine angle at its endpoint.
  previewPage(x:number,y:number){
    if(this.config.opening<READ_ANGLE||this.open<179.5||this.openingActive||this.reduced.matches||this.cameraMoving||this.cameraPan||this.touchMode!=='idle'||this.dragging||this.index!==this.config.pageIndex||this.config.pageHover<=0||this.turn&&!this.turn.preview){this.clearPageHover();return}
    const edgeRay=this.makeRay(x,y);if(edgeRay&&this.findGroup(x,y)){this.clearPageHover();return}
    const hit=this.pageHit(x,y)
    if(!hit||nextLeaf(this.index,hit.direction,leafCount(this.config))===this.index){this.clearPageHover();return}
    if(!this.turn||this.turn.direction!==hit.direction)this.turn=newTurn(hit.direction,hit.grip,true)
    this.hovered=true;this.turn.grip=hit.grip;this.turn.grabU=hit.edge;this.invalidate()
  }
  clearPageHover(){if(this.turn?.preview){this.hovered=false;this.invalidate()}}
  fit(){this.readAutoFit=true;this.resetReadingCamera();const radius=Math.hypot(this.config.width/100,this.config.height/200,this.config.thickness/100);const half=T.MathUtils.degToRad(this.camera.fov/2);const limiting=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect));const distance=radius/Math.sin(Math.max(.06,limiting))*PRESS_SCENE.spreadSlack/PRESS_SCENE.fitFraction;this.controls.maxDistance=Math.max(15,distance*2);this.camera.position.set(0,distance*.04,distance);this.controls.target.set(0,0,0);this.controls.update();this.invalidate()}
  setView(view:'front'|'back'|'side'|'spine'|'top'|'perspective'){this.fit();if(view==='perspective')return;this.readAutoFit=false;const d=this.camera.position.length();const dir=new T.Vector3(view==='side'?1:view==='spine'?-1:0,view==='top'?1:0,view==='front'?1:view==='back'?-1:.0001);dir.applyEuler(this.book.root.rotation).normalize();this.camera.position.copy(dir.multiplyScalar(d));this.controls.update();this.invalidate()}
  private resetReadingCamera(){
    this.readingView=initialReadingView();this.readingTarget=initialReadingView();this.readingVelocity={zoom:0,x:0,y:0};this.readingBounds=null;this.cameraMoving=false;this.touchPoints.clear();this.touchMode='idle';this.touchStart=null;this.touchPinch=null
    this.readBase={zoom:1,x:0,y:0};this.camera.zoom=1;this.camera.clearViewOffset();this.camera.updateProjectionMatrix()
  }
  private updateReadingCamera(dt:number,ready:boolean){
    if(!ready){if(this.config.opening<READ_ANGLE&&(this.readBase.zoom!==1||this.readBase.x||this.readBase.y||this.readingView.zoom!==1||this.readingView.x||this.readingView.y))this.resetReadingCamera();return}
    const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return
    if(!this.readingBounds){
      this.camera.zoom=1;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);this.book.root.updateMatrixWorld(true)
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,pageWidth=0
      // Fit stable covers and blocks as well as paper. Ignore active meshes
      // so a turning page cannot pump the camera.
      for(const m of this.book.readingFrameMeshes){
        if(!m.visible)continue
        const box=m instanceof T.SkinnedMesh?(m.boundingBox??(m.computeBoundingBox(),m.boundingBox!)):(m.geometry.boundingBox??(m.geometry.computeBoundingBox(),m.geometry.boundingBox!))
        let lo=Infinity,hi=-Infinity
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const p=m.localToWorld(new T.Vector3(x,y,z)).project(this.camera);lo=Math.min(lo,p.x*w/2);hi=Math.max(hi,p.x*w/2);top=Math.min(top,-p.y*h/2);bottom=Math.max(bottom,-p.y*h/2)
        }
        left=Math.min(left,lo);right=Math.max(right,hi)
        if(m===this.book.readingSurfaces[0]||m===this.book.readingSurfaces[1])pageWidth=Math.max(pageWidth,hi-lo)
      }
      if(!Number.isFinite(left)||!Number.isFinite(top))return
      const raw={width:w,height:h,left,right,top,bottom,pageWidth}
      const frame=this.readAutoFit?fitReadingBounds(raw):{zoom:1,x:0,y:0,bounds:raw}
      this.readBase={zoom:frame.zoom,x:frame.x,y:frame.y};this.readingBounds=frame.bounds;this.readingTarget=clampReadingView(this.readingTarget,this.readingBounds)
      this.host.dataset.readFrame=JSON.stringify({revision:++this.readFrameRevision,zoom:frame.zoom,widthRatio:(frame.bounds.right-frame.bounds.left)/w,heightRatio:(frame.bounds.bottom-frame.bounds.top)/h,viewport:[w,h]})
    }
    if(!this.cameraPan&&this.touchMode!=='pinch'&&this.touchMode!=='pan'&&this.touchMode!=='hold'){if(this.reduced.matches){this.readingView={...this.readingTarget};this.cameraMoving=false}else this.cameraMoving=!springReading(this.readingView,this.readingVelocity,this.readingTarget,dt)}
    this.camera.zoom=this.readBase.zoom*this.readingView.zoom
    const x=this.readBase.x*this.readingView.zoom+this.readingView.x,y=this.readBase.y*this.readingView.zoom+this.readingView.y
    if(x||y)this.camera.setViewOffset(w,h,-x,-y,w,h)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    this.host.dataset.stackMetrics=JSON.stringify(this.book.stackMetrics());this.host.dataset.touchMode=this.touchMode;this.host.dataset.readZoom=this.readingView.zoom.toFixed(4);this.host.dataset.readPan=JSON.stringify([this.readingView.x,this.readingView.y]);this.host.dataset.readCameraMoving=String(this.cameraMoving)
  }
  private readWheel=(e:WheelEvent)=>{
    if(this.config.opening<READ_ANGLE||this.openingActive||!this.readingBounds||this.dragging)return
    e.preventDefault();this.clearPageHover()
    const b=this.host.getBoundingClientRect(),scale=e.deltaMode===1?16:e.deltaMode===2?b.height:1
    if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)){
      this.readingTarget=clampReadingView({...this.readingTarget,x:this.readingTarget.x-(e.deltaX||e.deltaY)*scale,y:this.readingTarget.y-(e.deltaX?e.deltaY:0)*scale},this.readingBounds)
    }else this.readingTarget=zoomAround(this.readingTarget,this.readingTarget.zoom*Math.exp(-e.deltaY*scale*.0015),e.clientX-b.left-b.width/2,e.clientY-b.top-b.height/2,this.readingBounds)
    this.invalidate()
  }
  private readPanStart=(e:PointerEvent)=>{
    if(this.config.opening<READ_ANGLE||!this.readingBounds||this.dragging||!(e.button===1||e.button===0&&e.altKey))return
    e.preventDefault();e.stopPropagation();this.clearPageHover()
    this.cameraPan={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...this.readingView}};this.readingTarget={...this.readingView};this.readingVelocity={zoom:0,x:0,y:0};this.host.setPointerCapture(e.pointerId)
  }
  private readPanMove=(e:PointerEvent)=>{
    const p=this.cameraPan,b=this.readingBounds;if(!p||p.id!==e.pointerId||!b)return
    e.preventDefault();e.stopPropagation();const lim=panLimits(b,p.start.zoom)
    this.readingView={zoom:p.start.zoom,x:rubber(p.start.x+e.clientX-p.x,lim.minX,lim.maxX,b.width,PRESS_SCENE.panRubber),y:rubber(p.start.y+e.clientY-p.y,lim.minY,lim.maxY,b.height,PRESS_SCENE.panRubber)};this.invalidate()
  }
  private readPanEnd=(e:PointerEvent)=>{
    const p=this.cameraPan;if(!p||p.id!==e.pointerId)return
    e.stopPropagation();this.cameraPan=null;if(this.readingBounds)this.readingTarget=clampReadingView(this.readingView,this.readingBounds);this.invalidate()
  }
  // Touch gestures own the entire sequence. React's mouse drag state is
  // never populated for reading touch pointers.
  private beginPinch(){
    const [a,b]=this.touchPoints.values();if(!a||!b)return
    const rect=this.host.getBoundingClientRect()
    this.touchPinch={x:(a.x+b.x)/2-rect.left-rect.width/2,y:(a.y+b.y)/2-rect.top-rect.height/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),view:{...this.readingView}}
    this.touchMode='pinch';this.cameraMoving=false;this.readingVelocity={zoom:0,x:0,y:0};this.readingTarget={...this.readingView}
  }
  readTouchDown(id:number,x:number,y:number,time:number){
    if(this.config.opening<READ_ANGLE||!this.readingBounds||this.openingActive)return null
    this.touchPoints.set(id,{x,y});this.clearPageHover()
    let index:number|null=null
    if(this.touchPoints.size>=2){
      if(this.touchMode==='page')index=this.endPageDrag(false)
      this.touchStart=null;this.beginPinch()
    }else{this.touchMode='pending';this.touchStart={x,y,time,view:{...this.readingView},lastX:x,velocityX:0}}
    this.invalidate();return index
  }
  readTouchMove(id:number,x:number,y:number,time:number){
    if(!this.touchPoints.has(id))return
    this.touchPoints.set(id,{x,y});const bounds=this.readingBounds;if(!bounds)return
    if(this.touchMode==='pinch'){
      const p=this.touchPinch,[a,b]=this.touchPoints.values();if(!p||!a||!b)return
      const rect=this.host.getBoundingClientRect(),center={x:(a.x+b.x)/2-rect.left-rect.width/2,y:(a.y+b.y)/2-rect.top-rect.height/2}
      this.readingView=pinchReading(p.view,Math.hypot(a.x-b.x,a.y-b.y)/p.distance,p,center,bounds);this.invalidate();return
    }
    const p=this.touchStart;if(!p||this.touchMode==='hold')return
    const dx=x-p.x,dy=y-p.y
    if(this.touchMode==='pending'){
      if(Math.hypot(dx,dy)<PRESS_SCENE.readDragSlopPx)return
      const direction:1|-1=dx<0?1:-1
      const hit=Math.abs(dx)>=Math.abs(dy)&&touchPageAllowed(bounds,this.readingView,direction)?this.pageHit(p.x,p.y,true):null
      if(hit&&hit.direction===direction&&this.beginPageDrag(hit.direction,hit.grip,hit.edge,hit.group,hit.regrab)){
        this.touchMode='page';p.direction=hit.direction;p.progress=hit.progress
      }else{this.touchMode='pan';p.view={...this.readingView};this.readingTarget={...this.readingView};this.cameraMoving=false;this.readingVelocity={zoom:0,x:0,y:0}}
    }
    if(this.touchMode==='page'&&p.direction){
      p.distance=-dx*p.direction;this.dragPage(clamp01((p.progress??0)+referenceDragProgress(p.distance,bounds.width,true)))
    }else if(this.touchMode==='pan'){
      const lim=panLimits(bounds,p.view.zoom)
      this.readingView={zoom:p.view.zoom,x:rubber(p.view.x+dx,lim.minX,lim.maxX,bounds.width,PRESS_SCENE.panRubber),y:rubber(p.view.y+dy,lim.minY,lim.maxY,bounds.height,PRESS_SCENE.panRubber)}
      p.velocityX=.65*p.velocityX+.35*(x-p.lastX)/Math.max(.008,(time-p.time)/1000);p.lastX=x;p.time=time
    }
    this.invalidate()
  }
  readTouchEnd(id:number,time:number,cancel=false){
    if(!this.touchPoints.delete(id))return null
    let index:number|null=null
    const mode=this.touchMode,p=this.touchStart,b=this.readingBounds
    if(mode==='pinch'||mode==='hold'){
      if(this.touchPoints.size>=2)this.beginPinch()
      else if(this.touchPoints.size===1){this.touchMode='hold';this.touchPinch=null}
      else {this.touchMode='idle';this.touchPinch=null;if(b)this.readingTarget=cancel?clampReadingView(this.readingView,b):snapReadingView(this.readingView,b)}
    }else{
      if(mode==='page')index=this.endPageDrag(cancel?false:null,p?.distance??0)
      else if(mode==='pending'&&!cancel&&p){const hit=this.pageHit(p.x,p.y);if(hit)index=nextLeaf(this.config.pageIndex,hit.direction,leafCount(this.config))}
      else if(mode==='pan'&&b)this.readingTarget=cancel?clampReadingView(this.readingView,b):snapReadingView(this.readingView,b,p&&time-p.time<120?p.velocityX:0)
      this.touchMode='idle';this.touchStart=null
    }
    this.invalidate();return index
  }
  private makeRay(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height||x<b.left||x>b.right||y<b.top||y>b.bottom)return null;const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray}
  private findGroup(x:number,y:number){for(const [dx,dy] of [[0,0],[-3,0],[3,0],[0,-3],[0,3],[-6,0],[6,0],[0,-6],[0,6]]){const ray=this.makeRay(x+dx,y+dy);const hit=ray&&this.book.pickGroup(ray);if(hit)return hit}return null}
  pageHit(x:number,y:number,physical=false){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height||this.open<179.5||this.openingActive)return null;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);if(physical){
      this.host.dataset.pointerPick='miss'
      let active=this.book.pickActive(ray)
      if(!active&&this.turn&&!this.turn.preview){
        for(const [dx,dy] of [[-6,0],[6,0],[0,-6],[0,6]]){const near=this.makeRay(x+dx,y+dy);if(near){active=this.book.pickActive(near);if(active)break}}
        // Original controller 30239: first resolve the reading area, then
        // brake ALL moving leaves in (.25, PI-.25), before edge gathering.
        if(!active&&[this.turn,...this.followers].some(a=>isBrakeable(a.progress))){
          const area=ray.intersectObjects([...this.book.readingSurfaces],false)[0]
          if(area?.uv)active={direction:this.turn.direction,progress:this.turn.progress,group:(this.turn.span??1)+this.followers.length,grip:area.uv.y*2-1,edge:area.object===this.book.readingSurfaces[0]?1-area.uv.x:area.uv.x,slot:0}
        }
      }
      if(active){this.host.dataset.pointerPick='active';return {...active,progress:this.turn?.progress??active.progress,travelX:-active.direction*b.width*.5,travelY:0,regrab:true}}
      if(!this.turn||this.turn.preview){const group=this.findGroup(x,y);if(group){this.host.dataset.pointerPick='group';return {...group,travelX:-group.direction*b.width*.5,travelY:0,regrab:false}}}
    }const hit=ray.intersectObjects([...this.book.readingSurfaces],false)[0];if(!hit?.uv)return null;if(physical)this.host.dataset.pointerPick='page';const direction=hit.object===this.book.readingSurfaces[0]?-1 as const:1 as const;const mesh=hit.object;const width=bookDimensions(this.config.width,this.config.height,this.config.thickness,this.config.boardThickness,this.config.pageInset).pageWidth;const outer=mesh.localToWorld(new T.Vector3(direction===1?width/2:-width/2,0,0)).project(this.camera);const inner=mesh.localToWorld(new T.Vector3(direction===1?-width/2:width/2,0,0)).project(this.camera);return {direction,progress:0,group:1,regrab:false,grip:hit.uv.y*2-1,edge:direction===1?hit.uv.x:1-hit.uv.x,travelX:(inner.x-outer.x)*b.width/2,travelY:-(inner.y-outer.y)*b.height/2}}
  pageSide(x:number,y:number){return this.pageHit(x,y)?.direction??null}
  hitTest(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return false;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray.intersectObject(this.book.root,true).length>0}
  capture(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png')}
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.host.removeEventListener('wheel',this.readWheel);this.host.removeEventListener('pointerdown',this.readPanStart,true);this.host.removeEventListener('pointermove',this.readPanMove,true);this.host.removeEventListener('pointerup',this.readPanEnd,true);this.host.removeEventListener('pointercancel',this.readPanEnd,true);this.host.removeEventListener('lostpointercapture',this.readPanEnd,true);this.controls.dispose();this.renderer.domElement.removeEventListener('pointermove',this.hover);this.renderer.domElement.removeEventListener('pointerleave',this.leave);this.book.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.light.shadow.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
