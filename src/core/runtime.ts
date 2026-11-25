import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBook } from './book'
import {ContactWorkerClient} from './contactWorkerClient'
import {createTextureWarmer} from './textureWarm'
import { bookDimensions } from './geometry'
import {initialReadingView,clampReadingView,zoomAround,springReading,panLimits,rubber,touchPageAllowed,snapReadingView,pinchReading,fitReadingMotion,type ReadingView,type ReadingBounds} from './readingCamera'
import type {BookConfig} from './schema'
import {READ_ANGLE,leafCount,easeTurn,clamp01,nextLeaf} from './pages'
import {newChunkMotion,regrabChunkMotion,stepChunk,chunkCanCommit} from './chunkMotion'
import {newTurn,stepTurn,followDrag,followRender,MotionClock,trackDrag,type TurnState} from './pagePhysics'
import {physicalBook} from './physicalBook'
import {paperMaterial} from './paperMaterial'
import {curlTarget} from './pageChain'
import {referenceDragProgress} from './pressReference'
import {TurnInput,releaseGesture,gestureIntent} from './turnInput'
import {desiredBatch,orderedProgress,openingLeaves,OPENING_DROP_MS,STACK_SETTLE_MS,activeSpan} from './pageWindow'
import {RenderProbe} from './renderProbe'
import {RenderBudget,renderProfileLevel} from './renderBudget'
import {observePrograms} from './programWarm'
import {PRESS_SCENE,coverProgress,presentationStep,brakeRetention,isBrakeable,READING_POSE_ADAPTER} from './referenceScene'
const SETTLED_DROP=PRESS_SCENE.openDelayMs+STACK_SETTLE_MS
export class BookRuntime {
  private renderer:T.WebGLRenderer
  private warmedTextures=0
  private motionClock=new MotionClock()
  private geometryRevision=1
  // Opt-in experiment until device measurements establish a safe default.
  private shaderWarmEnabled=new URLSearchParams(location.search).get('prewarm')==='1'
  private renderBudget=new RenderBudget()
  private fixedProfile=renderProfileLevel(new URLSearchParams(location.search).get('renderProfile'))
  private adaptiveRendering=this.fixedProfile===0&&new URLSearchParams(location.search).get('renderBudget')==='1'
  private inputPriority=new URLSearchParams(location.search).get('inputPriority')!=='0'
  private backgroundDeferred=false
  private warmDrawEnabled=new URLSearchParams(location.search).get('warmDraw')==='1'
  private shadowCacheEnabled=new URLSearchParams(location.search).get('shadowCache')!=='0'
  private shadowDirty=true
  private shadowRevision=-1
  private shadowPasses=0
  private shadowReuses=0
  private appliedBudget=0
  private fullShadowSize=2048
  private warmDrawTarget:T.WebGLRenderTarget|null=null
  private cancelProgramProbe:(()=>void)|null=null
  private readingWarmDone=false
  private readingWarmHandle:number|null=null
  private shaderWarmHandle:number|null=null
  private cancelShaderWarm(){this.cancelProgramProbe?.();this.cancelProgramProbe=null;if(this.readingWarmHandle!==null){window.cancelIdleCallback(this.readingWarmHandle);this.readingWarmHandle=null}if(this.shaderWarmHandle!==null){window.cancelIdleCallback(this.shaderWarmHandle);this.shaderWarmHandle=null}}
  private scheduleShaderWarm(){
    if(!this.shaderWarmEnabled||typeof window.requestIdleCallback!=='function'||this.disposed||this.contextLost)return
    this.cancelShaderWarm()
    const book=this.book
    this.host.dataset.shaderWarm='pending'
    this.shaderWarmHandle=window.requestIdleCallback(deadline=>{
      this.shaderWarmHandle=null
      if(this.disposed||this.contextLost||this.book!==book||this.turn||this.coverMotion||this.config.opening>=READ_ANGLE){this.host.dataset.shaderWarm='skipped';return}
      if(deadline.timeRemaining()<8){this.scheduleShaderWarm();return}
      const start=performance.now()
      try{book.prepareShaders();this.renderer.compile(this.scene,this.camera);this.host.dataset.shaderWarm='submitted';this.host.dataset.shaderWarmMs=String(performance.now()-start)}catch{this.host.dataset.shaderWarm='failed'}
    })
  }
  private scheduleReadingWarm(){
    if(this.readingWarmDone||this.readingWarmHandle!==null||this.disposed||this.contextLost||typeof window.requestIdleCallback!=='function')return
    const book=this.book
    this.readingWarmHandle=window.requestIdleCallback(deadline=>{
      this.readingWarmHandle=null
      if(this.disposed||this.contextLost||this.book!==book||this.turn||this.coverMotion||this.config.opening<READ_ANGLE||this.openingActive)return
      if(deadline.timeRemaining()<8){this.scheduleReadingWarm();return}
      const start=performance.now()
      try{
        const representative=book.prepareShaders()
        this.renderer.compile(representative.leaf,this.camera,this.scene)
        // Borrow geometry/material, not a second visible object. The actual
        // shadow draw may still instantiate a driver-specific variant.
        this.renderer.compile(new T.Mesh(representative.fm.geometry,representative.gpu.depth),this.camera,this.scene)
        this.readingWarmDone=true;this.host.dataset.readingWarm='submitted';this.host.dataset.readingWarmMs=String(performance.now()-start)
        if(this.warmDrawEnabled){
          // Actual shadow/material draw, but an offscreen target has its own
          // output-color/tone-mapping variant. Never claim full screen readiness.
          const target=this.warmDrawTarget??=new T.WebGLRenderTarget(64,64)
          const oldTarget=this.renderer.getRenderTarget(),visible=representative.leaf.visible
          const oldCast=representative.fm.castShadow
          try{
            representative.leaf.visible=true;representative.fm.castShadow=true
            this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera)
            this.host.dataset.readingWarm='offscreen-drawn'
            this.host.dataset.readingWarmDrawMs=String(performance.now()-start)
          }finally{representative.leaf.visible=visible;representative.fm.castShadow=oldCast;this.renderer.setRenderTarget(oldTarget);this.light.shadow.needsUpdate=true;this.shadowDirty=true;target.dispose();this.warmDrawTarget=null}
        }
        if(this.perf){
          this.cancelProgramProbe?.()
          const programs=(this.renderer.info.programs??[]).map(p=>(p as unknown as {program:WebGLProgram}).program).filter(Boolean)
          this.cancelProgramProbe=observePrograms(this.renderer.getContext() as WebGL2RenderingContext,programs,state=>{this.host.dataset.programWarm=state})
        }
      }catch{this.readingWarmDone=true;this.host.dataset.readingWarm='failed'}
    })
  }
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
  private orbitReading=false
  private savedReading:{position:T.Vector3;target:T.Vector3;view:ReadingView;bounds:ReadingBounds|null;base:{zoom:number;x:number;y:number}}|null=null
  private modeTransition:{from:T.PerspectiveCamera;target:T.Vector3;elapsed:number}|null=null
  private visualCamera=new T.PerspectiveCamera()
  private cancelModeTransition=()=>{if(this.modeTransition){this.modeTransition=null;this.host.dataset.modeTransition='idle';this.invalidate()}}
  private transitionCamera(dt:number){
    const a=this.modeTransition;if(!a)return this.camera
    a.elapsed+=dt;const t=Math.min(1,a.elapsed/.24);if(t===1){this.cancelModeTransition();return this.camera}
    const e=t*t*(3-2*t),from=a.from.position.clone().sub(a.target),to=this.camera.position.clone().sub(this.controls.target),v=this.visualCamera
    const q=new T.Quaternion().setFromUnitVectors(from.clone().normalize(),to.clone().normalize()),dir=from.clone().normalize().applyQuaternion(new T.Quaternion().slerp(q,e))
    v.copy(this.camera);v.position.copy(a.target).lerp(this.controls.target,e).addScaledVector(dir,T.MathUtils.lerp(from.length(),to.length(),e));v.quaternion.copy(a.from.quaternion).slerp(this.camera.quaternion,e)
    const p=v.projectionMatrix.elements;for(let i=0;i<16;i++)p[i]=T.MathUtils.lerp(a.from.projectionMatrix.elements[i],this.camera.projectionMatrix.elements[i],e)
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert();v.updateMatrixWorld(true);return v
  }
  private orbitTransition:{from:T.Vector3;to:T.Vector3;elapsed:number}|null=null
  private cancelOrbitTransition=()=>{this.orbitTransition=null;this.host.dataset.orbitTransition='idle'}
  private reportedIndex=-1
  private orbitMoving=false
  private contextLost=false
  private perf:RenderProbe|null=null
  private startupProbe:{started:number;rendererMs:number;environmentMs:number;modelMs:number;setupMs:number}|null=null
  private meshProbeMode=new URLSearchParams(location.search).get('meshCollision')
  private meshProbeEnabled=this.meshProbeMode==='1'||this.meshProbeMode==='2'
  private meshProbeAt=-Infinity
  private solidProbeKey=''
  private contactWorker:ContactWorkerClient|null=null
  private meshProbeTotal={frames:0,segments:0,hits:0,byMesh:{} as Record<string,number>,byPhase:{} as Record<string,number>,examples:[] as unknown[]}
  private frameProbeEnabled=new URLSearchParams(location.search).get('frame')==='1'
  private curveProbeEnabled=new URLSearchParams(location.search).get('curve')==='1'
  private surfaceProbeEnabled=new URLSearchParams(location.search).get('surface')==='1'
  private frameOverflow=0
  private frameSamples=0
  private collisionEnabled=new URLSearchParams(location.search).get('collision')==='1'
  private collisionPeak=0
  private collisionSamples=0
  private openingPeak=0
  private collisionPairs=0
  private hoverFrame=0
  private hoverPoint:{x:number;y:number}|null=null
  private probePasses=0
  private readFrameRevision=0
  private cameraMoving=false
  private touchPoints=new Map<number,{x:number;y:number}>()
  private touchMode:'idle'|'pending'|'page'|'pan'|'pinch'|'hold'='idle'
  private touchStart:{x:number;y:number;time:number;view:ReadingView;lastX:number;velocityX:number;direction?:1|-1;progress?:number;distance?:number}|null=null
  private touchPinch:{x:number;y:number;distance:number;view:ReadingView}|null=null
  private cameraPan:{id:number;x:number;y:number;start:ReadingView}|null=null
  private handoffProbeEnabled=new URLSearchParams(location.search).get('handoff')==='1'
  private handoffPrevious:{index:number;direction:1|-1;points:T.Vector3[]}|null=null
  private chunkHandoffPrevious:{index:number;direction:1|-1;span:number;goal:0|1;points:T.Vector3[]}|null=null
  private chunkHandoffStats={commits:0,cancels:0,maxMm:0,lastMm:0,invalid:0}
  private handoffStats={samples:0,maxMm:0,lastMm:0}
  private groupProbeEnabled=import.meta.env.DEV&&new URLSearchParams(location.search).get('pick')==='1'
  private groupProbeKey=''
  private groupProbe:string=''
  private largeGroupProbe:string=''
    private peakChunk=0
  private environment:T.WebGLRenderTarget
  private resize:ResizeObserver
  private frame=0
  private drawing=false
  private input=new TurnInput()
  private admissionAt=-Infinity
  private firstCommandAt:number|null=null
  private firstMotionSamples:number[]=[]
  private firstCommandContext:Record<string,unknown>|null=null
  private firstMotionTrace:unknown[]=[]
  private dragIntent=false
  private dragVelocity=0
  private grabTarget=0
  private followers:TurnState[]=[]
  private hovered=false
  private peakActive=0
  private renderedHandoffFrames=0
  private last=0
  private open=0
  private index=0
  private turn:TurnState|null=null
  private releaseGoal:number|null=null
  private releaseIndex:number|null=null
  private dragging=false
  private settledIndex=-1
  private config:BookConfig
  private disposed=false
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  constructor(private host:HTMLElement,c:BookConfig,private onPageIndex?:(index:number)=>void,private onContextStatus?:(status:'lost'|'restored')=>void){
    const startup=performance.now();let phase=startup
    this.config={...c};this.resetHandoffProbes(true);delete this.host.dataset.surfaceQuality;this.open=c.opening>=READ_ANGLE?180:c.opening;this.index=nextLeaf(0,c.pageIndex,leafCount(c))
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:true})
    const rendererMs=performance.now()-phase;phase=performance.now()
    if(new URLSearchParams(location.search).get('perf')==='1')this.perf=new RenderProbe(this.renderer.getContext() as WebGL2RenderingContext,host)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.outputColorSpace=T.SRGBColorSpace
    this.renderer.domElement.setAttribute('aria-label','三维书籍预览')
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLostHandler)
    this.renderer.domElement.addEventListener('webglcontextrestored',this.contextRestoredHandler)
    const pmrem=new T.PMREMGenerator(this.renderer), room=new RoomEnvironment()
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture
    room.dispose();pmrem.dispose()
    const environmentMs=performance.now()-phase
    this.camera.position.set(3,2,5)
    this.controls=new OrbitControls(this.camera,this.renderer.domElement)
    this.controls.enablePan=true;this.controls.minDistance=2;this.controls.maxDistance=15;this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.rotateSpeed=.65;this.controls.zoomSpeed=.8;this.controls.zoomToCursor=true
    this.controls.addEventListener('change',this.invalidate);this.controls.addEventListener('start',this.cancelOrbitTransition);this.controls.addEventListener('start',this.cancelModeTransition)
    this.light.position.set(-3,5,5);this.light.castShadow=true
    const size=host.clientWidth<640?PRESS_SCENE.mobileShadowMap:PRESS_SCENE.shadowMap;this.fullShadowSize=size;this.light.shadow.mapSize.set(size,size);this.applyRenderBudget(this.fixedProfile)
    Object.assign(this.light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,far:20})
    this.scene.add(this.light,this.fill,this.ambient)
    this.floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({opacity:.20}))
    this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor)
    phase=performance.now();this.book=createBook(c,this.invalidate,this.warmTexture);this.book.setReading(this.index,[]);this.scene.add(this.book.root)
    const modelMs=performance.now()-phase
    this.resize=new ResizeObserver(this.onResize);this.resize.observe(host)
    this.renderer.domElement.addEventListener('pointermove',this.hover)
    this.renderer.domElement.addEventListener('pointerleave',this.leave)
    this.host.addEventListener('wheel',this.readWheel,{passive:false})
    this.host.addEventListener('pointerdown',this.readPanStart,true)
    this.host.addEventListener('pointermove',this.readPanMove,true)
    this.host.addEventListener('pointerup',this.readPanEnd,true)
    this.host.addEventListener('pointercancel',this.readPanEnd,true)
    this.host.addEventListener('lostpointercapture',this.readPanEnd,true)
    this.apply(c);this.onResize();this.fit();this.scheduleShaderWarm()
    if(this.perf)this.startupProbe={started:startup,rendererMs,environmentMs,modelMs,setupMs:performance.now()-startup}
  }
  cancelInteraction(){
    this.cancelModeTransition();
    const index=this.endPageDrag(false);this.clearPageHover();this.cameraPan=null;this.touchPoints.clear();this.touchMode='idle';this.touchStart=null;this.touchPinch=null
    if(this.readingBounds)this.readingTarget=clampReadingView(this.readingView,this.readingBounds);this.invalidate();return index
  }
  private resetHandoffProbes(clearStats=false){
    this.handoffPrevious=null;this.chunkHandoffPrevious=null
    if(clearStats){this.handoffStats={samples:0,maxMm:0,lastMm:0};this.chunkHandoffStats={commits:0,cancels:0,maxMm:0,lastMm:0,invalid:0};delete this.host.dataset.handoff;delete this.host.dataset.chunkHandoffQuality}
  }
  private contextLostHandler=(e:Event)=>{e.preventDefault();if(this.disposed)return;this.contextLost=true;this.backgroundDeferred=false;this.firstCommandAt=null;this.firstCommandContext=null;this.resetHandoffProbes(true);this.book.resetSurfaceQuality();delete this.host.dataset.surfaceQuality;this.cancelShaderWarm();this.book.suspendTextureWork();this.contactWorker?.reset();this.perf?.dispose();this.perf=null;cancelAnimationFrame(this.frame);this.frame=0;this.clearPageHover();this.host.dataset.contextStatus='lost';this.onContextStatus?.('lost')}
  private contextRestoredHandler=()=>{if(this.disposed)return;this.host.dataset.contextStatus='restored';this.onContextStatus?.('restored')}
  private applyRenderBudget(level:number){
    if(this.appliedBudget===level)return
    this.appliedBudget=level;this.shadowDirty=true
    const ratio=Math.min(window.devicePixelRatio,2)*[1,.75,.5][level],size=Math.min(this.fullShadowSize,[this.fullShadowSize,1024,512][level])
    this.renderer.setPixelRatio(ratio)
    this.light.shadow.mapSize.set(size,size);this.light.shadow.map?.setSize(size,size);this.light.shadow.needsUpdate=true
    this.host.dataset.renderBudget=JSON.stringify({level,ratio,shadowSize:size})
  }
  private onResize=()=>{this.cancelModeTransition();const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.readingBounds=null;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.invalidate()}
  private hover=(e:PointerEvent)=>{if(this.config.opening>=READ_ANGLE||this.config.interaction!=='hover'||this.reduced.matches||e.pointerType==='touch')return;const b=this.host.getBoundingClientRect();this.book.root.rotation.y=T.MathUtils.degToRad(this.config.yaw)+(e.clientX-b.left-b.width/2)/b.width*.65;this.book.root.rotation.x=T.MathUtils.degToRad(this.config.pitch)+(e.clientY-b.top-b.height/2)/b.height*.4;this.invalidate()}
  private leave=()=>{this.clearPageHover();if(this.config.opening>=READ_ANGLE)return;this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch),T.MathUtils.degToRad(this.config.yaw),0);this.invalidate()}
  invalidate=()=>{if(!this.disposed&&!this.contextLost&&!this.frame&&!this.drawing){this.last=performance.now();this.motionClock.reset();this.frame=requestAnimationFrame(this.draw)}}
  private draw=(now:number)=>{
    this.frame=0;if(this.disposed||this.contextLost)return;this.drawing=true
    this.perf?.start(now);this.perf?.phase('start')
    const openingTarget=this.config.opening>=READ_ANGLE?180:this.config.opening
    this.orbitMoving=this.controls.enabled&&this.controls.update()
    const elapsed=Math.max(0,(now-this.last)/1000),dt=Math.min(.05,elapsed),cameraDt=presentationStep(elapsed);this.last=now
    const motionDt=this.input.active&&!this.dragging&&this.turn&&!this.turn.chunkMotion?this.motionClock.advanceInteractive(elapsed):this.motionClock.advance(dt)
    if(this.orbitTransition){const a=this.orbitTransition;a.elapsed+=dt;const t=Math.min(1,a.elapsed/.28),e=t*t*(3-2*t),q=new T.Quaternion().setFromUnitVectors(a.from.clone().normalize(),a.to.clone().normalize());const dir=a.from.clone().normalize().applyQuaternion(new T.Quaternion().slerp(q,e));this.camera.position.copy(this.controls.target).addScaledVector(dir,T.MathUtils.lerp(a.from.length(),a.to.length(),e));this.controls.update();if(t===1)this.cancelOrbitTransition()}
    if(this.coverMotion&&this.coverMotion.to!==openingTarget&&Math.abs(this.open-openingTarget)<=.0001)this.coverMotion=null
    if(this.coverMotion?.to!==openingTarget&&Math.abs(this.open-openingTarget)>.0001){this.coverMotion={from:this.open,to:openingTarget,elapsed:0};if(openingTarget===180){this.dropElapsed=0;this.openingActive=true}}
    if(this.reduced.matches){this.open=openingTarget;this.coverMotion=null;this.dropElapsed=2000;this.openingActive=false}else if(this.coverMotion){this.coverMotion.elapsed+=cameraDt*1000;const a=coverProgress(this.coverMotion.from,this.coverMotion.to,this.coverMotion.elapsed);this.open=a.angle;if(a.done)this.coverMotion=null}
    if(openingTarget===180){if(this.open>=179.5)this.dropElapsed=Math.min(SETTLED_DROP,this.dropElapsed+cameraDt*1000)}else {this.dropElapsed=2000;this.openingActive=false}
    this.book.setOpening(this.open>=179.5&&openingTarget===180?180:this.open);this.book.setDrop(Math.max(0,this.dropElapsed-PRESS_SCENE.openDelayMs));this.applyLight(this.open/180)
    this.perf?.phase('opening');const target=nextLeaf(0,this.config.pageIndex,leafCount(this.config))
    const drop=this.openingActive&&this.open>=179.5?openingLeaves(this.index,leafCount(this.config),Math.max(0,this.dropElapsed-PRESS_SCENE.openDelayMs)):[]
    if(this.openingActive&&this.dropElapsed>=PRESS_SCENE.openDelayMs+OPENING_DROP_MS)this.openingActive=false
    const ready=this.open>=179.5&&!this.openingActive
    if(this.config.opening<READ_ANGLE||this.reduced.matches){this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=target}
    else if(ready){
      if(this.turn?.preview&&this.index!==target){const d=target>this.index?1:-1;if(this.turn.direction===d){this.turn.preview=false;this.admissionAt=now;}else this.turn=null;this.hovered=false}
      if(!this.turn&&this.index!==target){this.turn=newTurn(target>this.index?1:-1);const n=Math.abs(target-this.index);if(n>6&&!this.input.active){this.turn.span=n;this.turn.chunkMotion=newChunkMotion(false)}this.admissionAt=now}
      if(this.turn){
        const t=this.turn,material=paperMaterial(this.config),commit=target!==this.index&&Math.sign(target-this.index)===t.direction
        if(t.preview){
          const aim=this.hovered?curlTarget('hover',0,t.grabU,this.config.pageCorner*this.config.pageHover):0
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(this.hovered?.94:.95,dt*60))
          if(Math.abs(t.curlAmount-aim)<.01){t.curlAmount=aim;if(!this.hovered)this.turn=null}
        }else if(t.span&&t.span>1){
          const m=t.chunkMotion??(t.chunkMotion=newChunkMotion(!!t.chunkGesture,t.progress))
          const goal=(this.releaseGoal??(commit&&Math.abs(target-this.index)>=(t.span??1)?1:0)) as 0|1
          stepChunk(m,t.span,motionDt,this.book.prepareChunk(this.index,t.direction,t.span),this.dragging,t.dragTarget,goal,material.response,material.damping,this.config.paperPhysics==='material')
          t.progress=m.progress;t.renderProgress=m.progress
          if(chunkCanCommit(m,t.renderProgress)){if(m.goal===1)this.index=nextLeaf(this.index,t.direction*t.span,leafCount(this.config));this.turn=null;this.followers=[];this.releaseGoal=null;this.dragging=false;this.regrab=false}
        }else if(this.dragging){
          const prev=t.progress,previousVelocity=t.velocity;if(this.regrab&&this.brakeElapsed<PRESS_SCENE.brakeMs){this.brakeElapsed+=dt*1000;const k=brakeRetention(this.brakeElapsed);t.velocity*=Math.pow(1-k.damping,dt*60);const drift=clamp01(prev+t.velocity*dt*k.drive);t.progress=this.brakeElapsed<PRESS_SCENE.brakeLockMs&&Math.abs(t.dragTarget-(t.dragOrigin??0))<.01?drift:followDrag(drift,t.dragTarget,dt*(1-k.drive))}else{const next=trackDrag(prev,t.velocity,t.dragTarget,motionDt,60/material.response/material.damping);t.progress=next.progress;t.velocity=next.velocity}
          if(motionDt>0)t.acceleration=(t.velocity-previousVelocity)/motionDt;t.renderProgress=t.progress
          const aim=curlTarget('drag',t.progress,t.grabU,this.config.pageCorner)
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(.96,dt*60))
          for(let i=0;i<this.followers.length;i++){const a=this.followers[i],lead=i?this.followers[i-1]:t,goal=this.regrab?clamp01((a.dragOrigin??a.progress)+t.dragTarget-(t.dragOrigin??0)):t.dragTarget;if(this.config.paperPhysics==='material'){
              const previous=a.velocity,tracked=trackDrag(a.progress,a.velocity,goal,motionDt,60/material.response/material.damping)
              a.progress=orderedProgress(lead.progress,tracked.progress);a.velocity=a.progress===tracked.progress?tracked.velocity:Math.min(tracked.velocity,lead.velocity);if(motionDt>0)a.acceleration=(a.velocity-previous)/motionDt
            }else{a.velocity*=Math.pow(1-(this.regrab?brakeRetention(this.brakeElapsed).damping:0),dt*60);a.progress=orderedProgress(lead.progress,followDrag(a.progress,goal,dt))}
            a.renderProgress=orderedProgress(lead.renderProgress,followRender(a.renderProgress,a.progress,dt))}
        }else{
          const paced=this.input.active&&!t.chunkGesture,timing=this.input.timing(Math.abs(target-this.index))
          const goal=this.releaseGoal??(commit&&(paced||Math.abs(target-this.index)>=this.followers.length+1)?1:0)
          const endpointRendered=t.progress===goal&&t.renderProgress===goal&&t.curlAmount===0
          const desired=goal===1&&!(t.span&&t.span>1)?desiredBatch(this.index,target,leafCount(this.config),t.direction):0
          if(paced){
            const tail=this.followers.at(-1)??t
            if(this.followers.length+1<desired&&tail.progress>=timing.gap&&now-this.admissionAt>=timing.interval*1000){this.followers.push(newTurn(t.direction));this.admissionAt=now}
          }else while(this.followers.length+1<desired)this.followers.push(newTurn(t.direction))
          if(paced)while(this.followers.length+1>Math.max(1,desired)){
            const tail=this.followers.at(-1)!;if(tail.progress!==0||tail.renderProgress!==0||tail.curlAmount!==0)break
            this.followers.pop()
          }
          const all=[t,...this.followers],multi=all.length>1
          for(let i=0;i<all.length;i++){
            const a=all[i];const response=paced?this.config.pageDuration*timing.durationScale:t.chunkGesture&&!multi?this.config.pageDuration*.65:this.config.pageDuration;const leafGoal=paced&&i>=desired?0:goal;const step=stepTurn(a.progress,a.velocity,leafGoal,motionDt,response*material.response*material.damping,multi&&!paced,this.config.paperPhysics==='material'?a.acceleration??0:undefined,paced?timing.terminalGain:undefined)
            a.progress=i?Math.min(orderedProgress(all[i-1].progress,step.progress),paced&&goal===1?Math.max(0,all[i-1].progress-.12):1):step.progress
            a.velocity=a.progress===step.progress?step.velocity:Math.min(step.velocity,all[i-1].velocity);a.acceleration=a.progress===step.progress?step.acceleration:0
            a.renderProgress=followRender(a.renderProgress,a.progress,dt)
            if(i)a.renderProgress=orderedProgress(all[i-1].renderProgress,a.renderProgress)
            const aim=curlTarget('settle',a.progress,a.grabU,this.config.pageCorner)
            a.curlAmount+=(aim-a.curlAmount)*(1-Math.pow(.9,dt*60))
            // Keep the active leaf until its render angle has caught up.
            if(step.settled&&Math.abs(a.renderProgress-a.progress)<.002&&a.progress===step.progress){a.renderProgress=i?orderedProgress(all[i-1].renderProgress,a.progress):a.progress;if(a.renderProgress===a.progress)a.curlAmount=0}
          }
          if(endpointRendered&&t.progress===goal&&t.renderProgress===goal){
            if(goal===1){this.index=nextLeaf(this.index,t.direction*(t.span??1),leafCount(this.config));this.turn=this.followers.shift()??null;this.releaseGoal=null}else if(all.every(a=>a.progress<.002&&a.renderProgress<.002)){this.turn=null;this.followers=[];this.releaseGoal=null}
          }
        }
      }
    }
    this.perf?.phase('motion');const active=this.turn?[this.turn,...this.followers]:[]
    const display=drop.length?drop:active.filter(t=>!t.chunkMotion||t.chunkMotion.visible).map(t=>({direction:t.direction,progress:t.renderProgress,grip:t.grip,velocity:t.velocity,curlAmount:t.curlAmount,grabU:t.grabU,span:t.span,chunkGesture:t.chunkGesture,chunkLift:t.chunkMotion?.lift,handoffCurl:t.chunkMotion?.handoff?t.chunkMotion.handoffCurl:undefined}))
    if(display.length||this.settledIndex!==this.index){this.book.setReading(this.index,display);this.settledIndex=display.length?-1:this.index}
    this.perf?.phase('geometry');this.peakActive=Math.max(this.peakActive,active.filter(a=>!a.preview).length)
    this.peakChunk=Math.max(this.peakChunk,this.turn?.span??0);this.host.dataset.peakChunkLeaves=String(this.peakChunk);this.host.dataset.chunkLeaves=String(this.turn?.span??0);this.host.dataset.chunkPhase=this.turn?.chunkMotion?.phase??'idle';this.host.dataset.chunkHandoff=String(!!this.turn?.chunkMotion?.handoff&&!!this.turn?.chunkMotion?.visible);this.host.dataset.chunkLift=String(this.turn?.chunkMotion?.lift??0);this.host.dataset.textureWarmCount=String(this.warmedTextures);this.host.dataset.chunkLandedFrames=String(this.turn?.chunkMotion?.landedFrames??0);this.host.dataset.openingLeaves=String(drop.length);this.host.dataset.stackGeometry='layered';this.host.dataset.groupDrag=String(this.groupDrag);this.host.dataset.regrab=String(this.regrab);this.host.dataset.pageGpu='chain-texture';this.host.dataset.activeLeaves=String(active.length);this.host.dataset.peakActiveLeaves=String(this.peakActive)
    this.host.dataset.hoverCurl=String(this.turn?.preview?this.turn.curlAmount:0)
    this.host.dataset.pageProgress=String(this.turn?.progress??0);if(this.perf)this.host.dataset.pageRenderProgress=String(this.turn?.renderProgress??0);this.host.dataset.pageTarget=String(target);this.host.dataset.pageIndex=String(this.index);if(this.reportedIndex!==this.index){this.reportedIndex=this.index;this.onPageIndex?.(this.index)}this.host.dataset.pageTurn=this.turn?(this.turn.preview?'preview':'active'):'idle';this.host.dataset.pageReady=String(ready)

    const previousPose=this.readPose;this.readPose=easeTurn(clamp01(this.open/180));if(this.readPose>0||previousPose>0)this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch+READING_POSE_ADAPTER.pitchOffset*this.readPose),T.MathUtils.degToRad(this.config.yaw+READING_POSE_ADAPTER.yawOffset*this.readPose),0)
    this.book.root.position.set(this.config.width/200*this.readPose,0,0).applyEuler(this.book.root.rotation)
    this.floor.visible=this.readPose<.5;this.scene.environmentIntensity=1-.8*this.readPose
    if(this.meshProbeMode==='4'&&(display.length||this.coverMotion)&&now-this.meshProbeAt>=500){this.meshProbeAt=now;this.host.dataset.triangleCorrection=JSON.stringify(this.book.resolveTriangleContacts())}
    this.updateReadingCamera(cameraDt,ready)
    const shown=this.transitionCamera(dt)
    const moving=!!this.turn&&!this.turn.preview||!!this.coverMotion||drop.length>0
    if(this.adaptiveRendering)this.applyRenderBudget(moving?this.renderBudget.level:0)
    this.perf?.phase('camera')
    // The settled book's world-space shadow is independent of camera zoom/pan.
    // Refresh on every moving pose, geometry revision, light/appearance edit,
    // final landing frame, or warm/export pass. Never reuse for a moving leaf.
    const shadowRevision=this.book.geometryMetrics().refreshCount
    const shadowReuse=this.shadowCacheEnabled&&ready&&!this.turn&&!display.length&&!this.coverMotion&&this.dropElapsed>=SETTLED_DROP&&!this.shadowDirty&&shadowRevision===this.shadowRevision&&!!this.light.shadow.map
    this.renderer.shadowMap.autoUpdate=!shadowReuse
    this.perf?.beginGpu();const renderStart=performance.now(),firstRender=this.startupProbe?renderStart:0
    try{this.renderer.render(this.scene,shown)}finally{this.renderer.shadowMap.autoUpdate=true}
    this.perf?.endGpu()
    if(this.backgroundDeferred){this.backgroundDeferred=false;this.book.resumeBackground()}
    if(shadowReuse)this.shadowReuses++;else this.shadowPasses++
    this.shadowRevision=shadowRevision;this.shadowDirty=false
    if(this.perf)this.host.dataset.shadowCache=JSON.stringify({passes:this.shadowPasses,reuses:this.shadowReuses,reused:shadowReuse,revision:shadowRevision})
    if(this.adaptiveRendering){this.renderBudget.observe(performance.now()-renderStart,elapsed*1000,moving);this.host.dataset.renderBudget=JSON.stringify({level:this.appliedBudget,ratio:this.renderer.getPixelRatio(),shadowSize:this.light.shadow.mapSize.x})}
    if(drop.length){this.readingWarmDone=true;this.host.dataset.readingWarm='opening-draw'}else if(ready&&!this.turn&&this.index===target)this.scheduleReadingWarm();
    this.perf?.phase('render')
    if(this.firstCommandAt!==null&&!drop.length&&display.some(t=>t.progress>.002)){
      const submitted=performance.now(),latency=submitted-this.firstCommandAt
      this.firstMotionSamples.push(latency);if(this.firstMotionSamples.length>64)this.firstMotionSamples.shift()
      if(this.perf){
        const frame=this.perf.frameSnapshot(),textures=this.book.textureMetrics()
        this.firstMotionTrace.push({latencyMs:latency,request:this.firstCommandContext,firstMotionFrame:{...frame,fromRequestMs:frame.startedAt-this.firstCommandAt},submit:{index:this.index,target,pendingTextures:textures.pendingTextures,misses:textures.misses,slots:textures.slots,decodeActive:textures.decode.active,decodeQueued:textures.decode.queued,renderProgress:display[0].progress}})
        if(this.firstMotionTrace.length>16)this.firstMotionTrace.shift()
        this.host.dataset.firstMotionTrace=JSON.stringify(this.firstMotionTrace)
      }
      this.firstCommandAt=null;this.firstCommandContext=null;this.host.dataset.firstMotion=JSON.stringify(this.firstMotionSamples)
    }else if(!this.turn&&this.index===target){this.firstCommandAt=null;this.firstCommandContext=null}
    if(this.startupProbe){const {started,...phases}=this.startupProbe;this.host.dataset.startup=JSON.stringify({...phases,firstRenderMs:performance.now()-firstRender,firstSubmitMs:performance.now()-started});this.startupProbe=null}if(this.handoffProbeEnabled){
      const chunkPrevious=this.chunkHandoffPrevious;this.chunkHandoffPrevious=null
      if(chunkPrevious&&!display.length&&this.index===chunkPrevious.index+chunkPrevious.direction*chunkPrevious.span*chunkPrevious.goal){
        const destination=chunkPrevious.goal===1?chunkPrevious.direction:-chunkPrevious.direction as 1|-1
        const points=this.book.stationaryChunkHandoffPoints(destination),stats=this.chunkHandoffStats
        const mm=points.length===15&&chunkPrevious.points.length===15?Math.max(...points.map((p,i)=>p.distanceTo(chunkPrevious.points[i])*100)):NaN
        if(Number.isFinite(mm)){stats.commits+=chunkPrevious.goal;stats.cancels+=1-chunkPrevious.goal;stats.maxMm=Math.max(stats.maxMm,mm);stats.lastMm=mm}else stats.invalid++
        this.host.dataset.chunkHandoffQuality=JSON.stringify(stats)
      }
      if(display.length===1&&(display[0].span??1)>1&&(display[0].progress===0||display[0].progress===1)&&(display[0].chunkLift??0)===0&&this.turn?.chunkMotion?.phase==='landed'){
        const a=display[0],goal=a.progress as 0|1,points=this.book.activeChunkHandoffPoints(goal===1?a.direction:-a.direction as 1|-1)
        if(points.length===15)this.chunkHandoffPrevious={index:this.index,direction:a.direction,span:a.span!,goal,points}
        else {this.chunkHandoffStats.invalid++;this.host.dataset.chunkHandoffQuality=JSON.stringify(this.chunkHandoffStats)}
      }
      const previous=this.handoffPrevious;this.handoffPrevious=null
      if(previous&&this.index===previous.index+previous.direction&&!display.length){const points=this.book.stationaryHandoffPoints(previous.direction),mm=Math.max(...points.map((p,i)=>p.distanceTo(previous.points[i])*100));this.handoffStats={samples:this.handoffStats.samples+1,maxMm:Math.max(this.handoffStats.maxMm,mm),lastMm:mm};this.host.dataset.handoff=JSON.stringify(this.handoffStats)}
      if(display.length===1&&!drop.length&&(display[0].span??1)===1&&display[0].progress===1&&(display[0].curlAmount??0)===0){const points=this.book.activeHandoffPoints();if(points.length)this.handoffPrevious={index:this.index,direction:display[0].direction,points}}
    }if(this.book.handoffVisible())this.renderedHandoffFrames++;this.host.dataset.renderedHandoffFrames=String(this.renderedHandoffFrames);this.drawing=false
    if(ready){const rect=this.renderer.domElement.getBoundingClientRect(),project=(v:T.Vector3|null)=>{if(!v)return '';const p=v.project(this.camera);return JSON.stringify([rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2])};this.host.dataset.rightPick=project(this.book.readingPickPoint());this.host.dataset.activePick=this.turn&&!this.turn.preview?project(this.book.activePickPoint()):'';if(this.groupProbeEnabled&&!this.turn&&!this.orbitReading&&!this.orbitMoving&&!this.cameraMoving&&!this.cameraPan&&this.touchMode==='idle'&&this.dropElapsed>=SETTLED_DROP){const key=[this.index,rect.width,rect.height,this.config.pitch,this.config.yaw,this.camera.position.toArray().join(','),this.camera.quaternion.toArray().join(','),this.readingView.zoom,this.readingView.x,this.readingView.y,this.config.pageCount,this.open,this.dropElapsed].join(':');if(key!==this.groupProbeKey){this.host.dataset.groupProbePasses=String(++this.probePasses);this.groupProbeKey=key;this.groupProbe='';this.largeGroupProbe='';const canLarge=leafCount(this.config)-this.index>6;for(const point of this.book.groupPickCandidates(1)){const json=project(point),[x,y]=JSON.parse(json) as [number,number];const group=this.findGroup(x,y);if(group){if(!this.groupProbe)this.groupProbe=json;if(group.group>6)this.largeGroupProbe=json;if(!canLarge||this.largeGroupProbe)break}}}this.host.dataset.groupPick=this.groupProbe;this.host.dataset.largeGroupPick=this.largeGroupProbe}}
    this.perf?.phase('picking');if(this.collisionEnabled&&display.length){this.openingPeak=Math.max(this.openingPeak,drop.length);const sample=this.book.collisionSample();this.collisionPeak=Math.max(this.collisionPeak,sample.crossings);this.collisionPairs+=sample.pairs;this.host.dataset.collision=JSON.stringify({...sample,peak:this.collisionPeak,openingPeak:this.openingPeak,pairsTotal:this.collisionPairs,frames:++this.collisionSamples})}
    if(this.meshProbeEnabled&&display.length&&now-this.meshProbeAt>=120){this.meshProbeAt=now;const m=this.book.meshCollisionSample(this.meshProbeMode==='2');this.meshProbeTotal.frames++;this.meshProbeTotal.segments+=m.segments;this.meshProbeTotal.hits+=m.hits;const phase=drop.length?'opening':this.turn?.span&&this.turn.span>1?'chunk':'leaf';this.meshProbeTotal.byPhase[phase]=(this.meshProbeTotal.byPhase[phase]??0)+m.hits;for(const [name,n] of Object.entries(m.byMesh))this.meshProbeTotal.byMesh[name]=(this.meshProbeTotal.byMesh[name]??0)+n;if(m.examples.length&&this.meshProbeTotal.examples.length<40)this.meshProbeTotal.examples.push(...m.examples.slice(0,40-this.meshProbeTotal.examples.length));this.host.dataset.meshCollision=JSON.stringify({...this.meshProbeTotal,last:m})}
    if(this.meshProbeMode==='3'&&(display.length||this.coverMotion)&&now-this.meshProbeAt>=500){this.meshProbeAt=now;this.host.dataset.triangleCollision=JSON.stringify(this.book.triangleCollisionSample())}
    if(this.meshProbeMode==='5'){if(!display.length&&!this.coverMotion)this.book.resetSweptContacts();else if(now-this.meshProbeAt>=120){if(now-this.meshProbeAt>750)this.book.resetSweptContacts();this.meshProbeAt=now;this.host.dataset.sweptCollision=JSON.stringify(this.book.sweptCollisionSample())}}
    if(this.meshProbeMode==='6'){const key=[this.open,this.index,display.length].join(':');if((display.length||this.coverMotion||key!==this.solidProbeKey)&&(now-this.meshProbeAt>=500||!display.length&&!this.coverMotion)){this.meshProbeAt=now;this.solidProbeKey=key;this.host.dataset.solidCollision=JSON.stringify(this.book.solidCollisionSample())}}
    if(this.meshProbeMode==='7'&&(display.length||this.coverMotion)&&now-this.meshProbeAt>=250){
      this.meshProbeAt=now
      this.contactWorker??=new ContactWorkerClient(reply=>{if(!this.disposed&&!this.contextLost)this.host.dataset.workerCollision=JSON.stringify({...reply,dropped:this.contactWorker?.dropped??0})})
      this.contactWorker.request(()=>this.book.workerContactSnapshot())
    }
    if(this.surfaceProbeEnabled&&display.length)this.host.dataset.surfaceQuality=JSON.stringify(this.book.measureActiveSurfaces());this.perf?.phase('diagnostics');this.host.dataset.geometryRevision=String(this.geometryRevision);if(this.perf){this.host.dataset.geometryMetrics=JSON.stringify(this.book.geometryMetrics());this.host.dataset.renderResources=JSON.stringify({...this.renderer.info.memory,programs:this.renderer.info.programs?.length??0})}if(this.curveProbeEnabled)this.host.dataset.curveQuality=JSON.stringify(this.book.curveQuality());this.host.dataset.textureCache=JSON.stringify(this.book.textureMetrics());this.host.dataset.stackMetrics=JSON.stringify(this.book.stackMetrics());this.perf?.phase('metrics');this.perf?.finish(this.turn&&!this.turn.preview?'active':'idle')
    if(this.modeTransition||this.orbitTransition||this.orbitMoving||this.cameraMoving||this.coverMotion||openingTarget===180&&this.dropElapsed<SETTLED_DROP||this.index!==target||!!this.turn&&(!this.turn.preview||!this.hovered||Math.abs(this.turn.curlAmount-curlTarget('hover',0,this.turn.grabU,this.config.pageCorner*this.config.pageHover))>.01))this.frame=requestAnimationFrame(this.draw)
  }
  private apply(c:BookConfig){
    this.shadowDirty=true;this.scene.background=new T.Color(c.background);this.readLight=-1;this.applyLight(this.open/180)
    this.book.root.rotation.set(T.MathUtils.degToRad(c.pitch),T.MathUtils.degToRad(c.yaw),0)
    this.floor.position.y=-c.height/200-.22;if(c.opening<READ_ANGLE){this.orbitReading=false;this.savedReading=null;this.cancelOrbitTransition()}this.controls.enabled=c.opening>=READ_ANGLE?this.orbitReading:c.interaction!=='hover'
    this.invalidate()
  }
  requestTurn(direction:1|-1,eventTime?:number){
    if(this.disposed||this.contextLost||this.dragging)return this.config.pageIndex
    const index=nextLeaf(this.config.pageIndex,direction,leafCount(this.config))
    if(index===this.config.pageIndex)return index
    if(this.readingWarmHandle!==null){window.cancelIdleCallback(this.readingWarmHandle);this.readingWarmHandle=null}
    if(this.cancelProgramProbe){this.cancelProgramProbe();this.cancelProgramProbe=null;if(this.host.dataset.programWarm==='pending')this.host.dataset.programWarm='interrupted'}
    const now=performance.now()
    if(this.inputPriority&&(!this.turn||this.turn.preview)&&!this.backgroundDeferred){this.book.pauseBackground();this.backgroundDeferred=true}
    if(this.perf&&(!this.turn||this.turn.preview)&&this.firstCommandAt===null){
      const textures=this.book.textureMetrics()
      this.firstCommandAt=now;this.firstCommandContext={direction,index:this.index,target:index,eventDispatchMs:eventTime!==undefined&&Number.isFinite(eventTime)&&eventTime>=0&&eventTime<=now?now-eventTime:null,warm:this.host.dataset.readingWarm??'none',programWarm:this.host.dataset.programWarm??'none',pendingTextures:textures.pendingTextures,misses:textures.misses,slots:textures.slots,decodeActive:textures.decode.active,decodeQueued:textures.decode.queued}
    }
    this.input.push(direction,now);this.perf?.markInput()
    this.releaseGoal=null;this.releaseIndex=null;this.config={...this.config,pageIndex:index}
    this.invalidate();return index
  }
  update(c:BookConfig){
    if(c.pageIndex!==this.config.pageIndex){this.input.reset();this.perf?.markInput()}
    // Page navigation is not a model/material edit. Direct commands already
    // reached the runtime synchronously; this is the persisted React echo.
    if((Object.keys(c) as (keyof BookConfig)[]).every(k=>k==='pageIndex'||c[k]===this.config[k])){
      if(this.releaseGoal!==null&&this.releaseIndex!==null&&c.pageIndex!==this.releaseIndex)this.releaseGoal=null
      this.config={...c};this.invalidate();return
    }
    if(c.opening!==this.config.opening)this.input.reset()
    if(this.releaseGoal!==null&&this.releaseIndex!==null&&c.pageIndex!==this.releaseIndex)this.releaseGoal=null
    const keys=['width','height','boardThickness','cornerRadius','pageInset','spineStyle'] as const
    const rebuild=keys.some(k=>this.config[k]!==c[k]);const shapeChanged=(["paperPhysics","paperThickness","paperGrammage","paperModulus","paperDamping","pageCurl","pageCorner","pageCount","coverFlex","pageCoupling"] as const).some(k=>this.config[k]!==c[k]);const depthChanged=physicalBook(this.config).thickness!==physicalBook(c).thickness;const frameChanged=rebuild||depthChanged||c.pitch!==this.config.pitch||c.yaw!==this.config.yaw||c.opening!==this.config.opening||c.coverFlex!==this.config.coverFlex||c.pageCoupling!==this.config.pageCoupling||c.pageCount!==this.config.pageCount;this.config={...c};if(frameChanged||shapeChanged)this.resetHandoffProbes();if(frameChanged){this.cancelModeTransition();this.savedReading=null;this.cancelOrbitTransition();this.readingBounds=null;this.cameraPan=null;this.touchPoints.clear();this.touchMode='idle';this.touchStart=null;this.touchPinch=null}
    if(rebuild){this.backgroundDeferred=false;this.input.reset();this.firstCommandAt=null;this.firstCommandContext=null;this.cancelShaderWarm();this.readingWarmDone=false;delete this.host.dataset.readingWarm;delete this.host.dataset.programWarm;this.geometryRevision++;this.motionClock.reset();this.contactWorker?.reset();delete this.host.dataset.workerCollision;this.solidProbeKey='';this.groupProbeKey='';this.openingActive=false;this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=nextLeaf(0,c.pageIndex,leafCount(c));this.scene.remove(this.book.root);this.book.dispose();this.book=createBook(c,this.invalidate,this.warmTexture);this.book.setOpening(this.open);this.scene.add(this.book.root);this.scheduleShaderWarm()}else this.book.updateAppearance(c)
    if(rebuild||depthChanged||shapeChanged){this.book.resetSurfaceQuality();delete this.host.dataset.surfaceQuality}
    if((depthChanged||shapeChanged)&&!rebuild){this.contactWorker?.reset();this.book.resetSweptContacts();this.solidProbeKey='';delete this.host.dataset.workerCollision}
    if(this.index>leafCount(c)||this.turn&&(this.turn.direction===1?leafCount(c)-this.index:this.index)<(this.turn.span??1)+this.followers.length){this.index=Math.min(this.index,leafCount(c));this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null}
    if(c.pageHover<=0)this.hovered=false;this.groupProbeKey='';this.settledIndex=-1;this.apply(c);if(rebuild||depthChanged&&!this.turn)this.fit(true)
  }
  switchProject(c:BookConfig){
    // A project change is not a page-turn command. Reset transient state
    // before applying the new model, while retaining the WebGL renderer.
    this.cancelShaderWarm();this.readingWarmDone=false;delete this.host.dataset.readingWarm;delete this.host.dataset.programWarm;this.shadowDirty=true;this.shadowRevision=-1;this.renderBudget.reset();this.applyRenderBudget(this.fixedProfile);this.backgroundDeferred=false;this.book.resumeBackground();this.input.reset();this.firstCommandAt=null;this.firstCommandContext=null;this.firstMotionSamples=[];this.firstMotionTrace=[];delete this.host.dataset.firstMotion;delete this.host.dataset.firstMotionTrace;this.resetHandoffProbes(true);this.book.resetSurfaceQuality();delete this.host.dataset.surfaceQuality;this.contactWorker?.reset();this.book.resetSweptContacts();this.solidProbeKey='';this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.regrab=false;this.hovered=false;this.groupDrag=1;this.brakeElapsed=0
    this.coverMotion=null;this.openingActive=false;this.dropElapsed=2000;this.open=c.opening>=READ_ANGLE?180:c.opening
    this.index=nextLeaf(0,c.pageIndex,leafCount(c));this.settledIndex=-1;this.cameraPan=null;this.groupProbeKey='';this.groupProbe='';this.largeGroupProbe=''
    this.savedReading=null;this.cancelOrbitTransition();this.peakActive=0;this.peakChunk=0;this.renderedHandoffFrames=0;this.orbitReading=false;this.update(c);this.book.setOpening(this.open);this.book.setDrop(2000);this.book.setReading(this.index,[]);this.fit()
    this.invalidate()
  }
  beginPageDrag(direction:1|-1,grip=0,grabU=1,group=1,regrab=false){
    if(this.contextLost||this.orbitReading||this.config.opening<READ_ANGLE||this.open<179.5||this.openingActive||this.reduced.matches||nextLeaf(this.index,direction,leafCount(this.config))===this.index)return false
    if(regrab){if(!this.turn||this.turn.preview||this.turn.direction!==direction)return false}
    else if(this.turn&&!this.turn.preview||this.index!==this.config.pageIndex)return false
    this.grabTarget=this.config.pageIndex;if(!regrab)this.input.reset();this.dragVelocity=0;
    const t=this.turn?.direction===direction?this.turn:newTurn(direction,grip);if(regrab){t.progress=t.renderProgress;for(const a of this.followers)a.progress=a.renderProgress}t.preview=false;this.hovered=false;t.grip=grip;t.dragTarget=t.progress;this.dragIntent=gestureIntent(false,t.progress);t.grabU=grabU;this.turn=t;this.dragging=true;this.releaseGoal=null
    this.renderedHandoffFrames=0;this.host.dataset.renderedHandoffFrames='0';this.regrab=regrab;this.host.dataset.dragAccepted=regrab?'regrab':'new';this.brakeElapsed=0;const available=direction===1?leafCount(this.config)-this.index:this.index;this.groupDrag=regrab?(t.span??1)+this.followers.length:Math.max(1,Math.min(group,available));t.chunkElapsed=undefined;t.chunkGesture=true;t.dragOrigin=t.progress;if(regrab){for(const a of this.followers)a.dragOrigin=a.progress}else if(this.groupDrag>6){t.span=this.groupDrag;this.followers=[]}else{t.span=undefined;this.followers=Array.from({length:this.groupDrag-1},()=>newTurn(direction))}if((t.span??1)>1)t.chunkMotion=regrab&&t.chunkMotion?regrabChunkMotion(t.chunkMotion):newChunkMotion(true,t.progress,t.chunkMotion?.lift??0,t.curlAmount||curlTarget('hover',t.progress,t.grabU,this.config.pageCorner*this.config.pageHover));this.invalidate();return true
  }
  dragPage(progress:number,velocity=0,grip?:number,grabU?:number){if(this.dragging&&this.turn){this.input.reset();this.perf?.markInput();this.turn.dragTarget=clamp01(progress);this.dragIntent=gestureIntent(this.dragIntent,this.turn.dragTarget);this.dragVelocity=T.MathUtils.clamp(velocity,-4,4);if(grip!==undefined)this.turn.grip=grip;if(grabU!==undefined)this.turn.grabU=grabU;this.invalidate()}}
  endPageDrag(commit:boolean|null=null,displacementPx=0){if(!this.dragging||!this.turn)return null;const t=this.turn,accepted=commit??releaseGesture(t.dragTarget,this.dragVelocity,displacementPx,this.regrab,this.groupDrag,this.dragIntent);const index=accepted?nextLeaf(this.index,t.direction*this.groupDrag,leafCount(this.config)):this.index;this.dragging=false;this.regrab=false;this.releaseGoal=accepted?1:0;this.releaseIndex=index;this.config={...this.config,pageIndex:index};if(commit===null&&!t.chunkMotion&&this.dragVelocity*(accepted?1:-1)>0){t.velocity=this.dragVelocity;t.acceleration=0}this.groupDrag=1;this.invalidate();return index}
  // A tap on an active page is another reading command, not a drag cancel.
  tapRegrab(eventTime?:number){
    if(!this.dragging||!this.turn||!this.regrab)return null
    const direction=this.turn.direction
    this.dragging=false;this.regrab=false;this.groupDrag=1;this.releaseGoal=null;this.releaseIndex=null
    this.turn.chunkGesture=false
    this.config={...this.config,pageIndex:this.grabTarget}
    return this.requestTurn(direction,eventTime)
  }
  private applyLight(open:number){
    const p=easeTurn(clamp01(open));if(Math.abs(p-this.readLight)<.002)return;this.readLight=p;this.shadowDirty=true
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
    this.hoverPoint={x,y};if(this.hoverFrame||this.disposed||this.contextLost)return
    this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=0;const point=this.hoverPoint;this.hoverPoint=null;if(point)this.previewPageAt(point.x,point.y)})
  }
  private previewPageAt(x:number,y:number){
    if(this.orbitReading||this.config.opening<READ_ANGLE||this.open<179.5||this.openingActive||this.reduced.matches||this.cameraMoving||this.cameraPan||this.touchMode!=='idle'||this.dragging||this.index!==this.config.pageIndex||this.config.pageHover<=0||this.turn&&!this.turn.preview){this.clearPageHover();return}
    const edgeRay=this.makeRay(x,y);if(edgeRay&&this.book.pickGroup(edgeRay)){this.clearPageHover();return}
    const hit=this.pageHit(x,y)
    if(!hit||nextLeaf(this.index,hit.direction,leafCount(this.config))===this.index){this.clearPageHover();return}
    if(!this.turn||this.turn.direction!==hit.direction)this.turn=newTurn(hit.direction,hit.grip,true)
    this.hovered=true;this.turn.grip=hit.grip;this.turn.grabU=hit.edge;this.invalidate()
  }
  clearPageHover(){this.hoverPoint=null;cancelAnimationFrame(this.hoverFrame);this.hoverFrame=0;if(this.turn?.preview){this.hovered=false;this.invalidate()}}
  setReadingOrbit(enabled:boolean,reset=false){
    const was=this.orbitReading,next=enabled&&this.config.opening>=READ_ANGLE,restored=was&&!next&&!reset&&!!this.savedReading;const previous=(this.modeTransition?this.visualCamera:this.camera).clone(),previousTarget=this.controls.target.clone();this.cancelModeTransition();this.cancelOrbitTransition();this.clearPageHover();this.cameraPan=null
    if(next&&!was){this.savedReading={position:this.camera.position.clone(),target:this.controls.target.clone(),view:{...this.readingTarget},bounds:this.readingBounds?{...this.readingBounds}:null,base:{...this.readBase}};this.orbitReading=true;this.fit(true);this.readAutoFit=false}
    else if(!next){const saved=was&&!reset?this.savedReading:null;this.orbitReading=false;this.fit();if(saved){this.camera.position.copy(saved.position);this.controls.target.copy(saved.target);this.controls.update();this.readingView={...saved.view};this.readingTarget={...saved.view};if(saved.bounds&&saved.bounds.width===this.host.clientWidth&&saved.bounds.height===this.host.clientHeight){this.readingBounds=saved.bounds;this.readBase=saved.base}}this.savedReading=null}
    this.controls.enabled=this.config.opening>=READ_ANGLE?this.orbitReading:this.config.interaction!=='hover';if(was!==next&&!reset&&!this.reduced.matches){this.modeTransition={from:previous,target:previousTarget,elapsed:0};this.host.dataset.modeTransition='active'}this.invalidate();return restored
  }
  fit(preserveDirection=false){this.cancelModeTransition();this.cancelOrbitTransition();const direction=preserveDirection?this.camera.position.clone().sub(this.controls.target).normalize():new T.Vector3(0,.04,1).normalize();const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.readAutoFit=true;this.resetReadingCamera();const radius=Math.hypot(this.config.width/100,this.config.height/200,physicalBook(this.config).thickness/100);const half=T.MathUtils.degToRad(this.camera.fov/2);const limiting=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect));const distance=radius/Math.sin(Math.max(.06,limiting))*PRESS_SCENE.spreadSlack/PRESS_SCENE.fitFraction;this.controls.maxDistance=Math.max(15,distance*2);this.controls.minDistance=Math.max(.3,radius*.85);this.controls.maxTargetRadius=radius*1.5;this.camera.position.copy(direction.multiplyScalar(distance));this.controls.target.set(0,0,0);this.controls.cursor.copy(this.controls.target);this.host.dataset.fitDistance=String(distance);this.controls.update();this.controls.enableDamping=damping;this.invalidate()}
  setView(view:'front'|'back'|'side'|'spine'|'top'|'perspective'){
    const animated=this.orbitReading&&!this.reduced.matches;const previous=this.camera.position.clone().sub(this.controls.target);this.fit();const d=this.camera.position.distanceTo(this.controls.target);const dir=view==='perspective'?new T.Vector3(0,.04,1):new T.Vector3(view==='side'?1:view==='spine'?-1:0,view==='top'?1:0,view==='front'?1:view==='back'?-1:.0001).applyEuler(this.book.root.rotation);dir.normalize();this.readAutoFit=!this.orbitReading
    if(animated&&previous.lengthSq()>1e-8){this.camera.position.copy(this.controls.target).add(previous);this.controls.update();this.orbitTransition={from:previous,to:dir.multiplyScalar(d),elapsed:0};this.host.dataset.orbitTransition='active'}else{this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(d));this.controls.update()}
    this.invalidate()
  }
  private resetReadingCamera(){
    this.readingView=initialReadingView();this.readingTarget=initialReadingView();this.readingVelocity={zoom:0,x:0,y:0};this.readingBounds=null;this.cameraMoving=false;this.touchPoints.clear();this.touchMode='idle';this.touchStart=null;this.touchPinch=null
    this.readBase={zoom:1,x:0,y:0};this.camera.zoom=1;this.camera.clearViewOffset();this.camera.updateProjectionMatrix()
  }
  private updateReadingCamera(dt:number,ready:boolean){
    if(this.orbitReading)return
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
      const viewport=this.host.getBoundingClientRect(),parent=this.host.parentElement
      const topBar=parent?.querySelector('.viewport-top')?.getBoundingClientRect(),bottomBar=parent?.querySelector('.viewport-bottom')?.getBoundingClientRect()
      const chrome={top:topBar?Math.max(0,topBar.bottom-viewport.top+12):48,bottom:bottomBar?Math.max(0,viewport.bottom-bottomBar.top+12):48}
      const motion={left,right,top,bottom}
      for(const point of this.book.motionFramePoints()){const p=point.project(this.camera);motion.left=Math.min(motion.left,p.x*w/2);motion.right=Math.max(motion.right,p.x*w/2);motion.top=Math.min(motion.top,-p.y*h/2);motion.bottom=Math.max(motion.bottom,-p.y*h/2)}
      const frame=this.readAutoFit?fitReadingMotion(raw,motion,chrome):{zoom:1,x:0,y:0,bounds:raw,stableBounds:raw,motionBounds:raw}
      this.readBase={zoom:frame.zoom,x:frame.x,y:frame.y};this.readingBounds=frame.bounds;this.readingTarget=clampReadingView(this.readingTarget,this.readingBounds)
      this.host.dataset.readFrame=JSON.stringify({revision:++this.readFrameRevision,zoom:frame.zoom,widthRatio:(frame.stableBounds.right-frame.stableBounds.left)/w,heightRatio:(frame.stableBounds.bottom-frame.stableBounds.top)/h,viewport:[w,h],bounds:frame.bounds,stableBounds:frame.stableBounds,motionBounds:frame.motionBounds,chrome})
    }
    if(!this.cameraPan&&this.touchMode!=='pinch'&&this.touchMode!=='pan'&&this.touchMode!=='hold'){if(this.reduced.matches){this.readingView={...this.readingTarget};this.cameraMoving=false}else this.cameraMoving=!springReading(this.readingView,this.readingVelocity,this.readingTarget,dt)}
    this.camera.zoom=this.readBase.zoom*this.readingView.zoom
    const x=this.readBase.x*this.readingView.zoom+this.readingView.x,y=this.readBase.y*this.readingView.zoom+this.readingView.y
    if(x||y)this.camera.setViewOffset(w,h,-x,-y,w,h)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    if(this.frameProbeEnabled&&this.turn&&!this.turn.preview){this.book.root.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const points=this.book.activeFramePoints();if(points.length){let overflow=0;for(const p of points){p.project(this.camera);overflow=Math.max(overflow,(Math.abs(p.x)-1)*w/2,(Math.abs(p.y)-1)*h/2)}this.frameOverflow=Math.max(this.frameOverflow,overflow);this.host.dataset.motionFrame=JSON.stringify({samples:++this.frameSamples,overflow,peakOverflow:this.frameOverflow})}}
    this.host.dataset.touchMode=this.touchMode;this.host.dataset.readZoom=this.readingView.zoom.toFixed(4);this.host.dataset.readPan=JSON.stringify([this.readingView.x,this.readingView.y]);this.host.dataset.readCameraMoving=String(this.cameraMoving)
  }
  private readWheel=(e:WheelEvent)=>{
    this.cancelModeTransition();
    if(this.orbitReading||this.config.opening<READ_ANGLE||this.openingActive||!this.readingBounds||this.dragging)return
    e.preventDefault();this.clearPageHover()
    const b=this.host.getBoundingClientRect(),scale=e.deltaMode===1?16:e.deltaMode===2?b.height:1
    if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)){
      this.readingTarget=clampReadingView({...this.readingTarget,x:this.readingTarget.x-(e.deltaX||e.deltaY)*scale,y:this.readingTarget.y-(e.deltaX?e.deltaY:0)*scale},this.readingBounds)
    }else this.readingTarget=zoomAround(this.readingTarget,this.readingTarget.zoom*Math.exp(-e.deltaY*scale*.0015),e.clientX-b.left-b.width/2,e.clientY-b.top-b.height/2,this.readingBounds)
    this.invalidate()
  }
  private readPanStart=(e:PointerEvent)=>{
    this.cancelModeTransition();
    if(this.orbitReading||this.config.opening<READ_ANGLE||!this.readingBounds||this.dragging||!(e.button===1||e.button===2||e.button===0&&e.altKey))return
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
    e.stopPropagation();this.cameraPan=null;if(this.readingBounds){this.readingTarget=clampReadingView(this.readingView,this.readingBounds);this.cameraMoving=true;this.host.dataset.readCameraMoving='true'}this.invalidate()
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
    if(this.orbitReading||this.config.opening<READ_ANGLE||!this.readingBounds||this.openingActive)return null
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
      const next=clamp01((p.progress??0)+referenceDragProgress(-dx*p.direction,bounds.width,true));const before=clamp01((p.progress??0)+referenceDragProgress(p.distance??0,bounds.width,true));p.velocityX=.65*p.velocityX+.35*(next-before)/Math.max(.008,(time-p.time)/1000);p.time=time;p.distance=-dx*p.direction;this.dragPage(next,p.velocityX)
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
      if(mode==='page'){if(p&&time-p.time>120)this.dragVelocity=0;index=this.endPageDrag(cancel?false:null,p?.distance??0)}
      else if(mode==='pending'&&!cancel&&p){const hit=this.pageHit(p.x,p.y);if(hit)index=this.requestTurn(hit.direction,time)}
      else if(mode==='pan'&&b)this.readingTarget=cancel?clampReadingView(this.readingView,b):snapReadingView(this.readingView,b,p&&time-p.time<120?p.velocityX:0)
      this.touchMode='idle';this.touchStart=null
    }
    this.invalidate();return index
  }
  private makeRay(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height||x<b.left||x>b.right||y<b.top||y>b.bottom)return null;const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray}
  private findGroup(x:number,y:number){for(const [dx,dy] of [[0,0],[-3,0],[3,0],[0,-3],[0,3],[-6,0],[6,0],[0,-6],[0,6]]){const ray=this.makeRay(x+dx,y+dy);const hit=ray&&this.book.pickGroup(ray);if(hit)return hit}return null}
  pageHit(x:number,y:number,physical=false){const start=this.perf?performance.now():0;try{return this.pageHitInternal(x,y,physical)}finally{if(this.perf)this.perf.pick(performance.now()-start)}}
  private pageHitInternal(x:number,y:number,physical=false){const b=this.renderer.domElement.getBoundingClientRect();if(this.orbitReading||!b.width||!b.height||this.open<179.5||this.openingActive||x<b.left||x>b.right||y<b.top||y>b.bottom)return null;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);if(physical){
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
  zoomReading(factor:number){if(this.contextLost||this.orbitReading||this.dragging||!this.readingBounds)return;this.clearPageHover();this.readingTarget=zoomAround(this.readingTarget,this.readingTarget.zoom*factor,0,0,this.readingBounds);this.invalidate()}
  capture(scale=1,transparent=false,longEdge?:number){
    this.cancelModeTransition();
    if(this.contextLost)throw Error('图形上下文已丢失，请恢复预览后再导出');const w=this.host.clientWidth,h=this.host.clientHeight
    if(!w||!h)throw Error('预览区域不可用');const previousBudget=this.appliedBudget;this.applyRenderBudget(0);const old=this.renderer.getPixelRatio(),longest=Math.max(w,h),ratio=longEdge!==undefined&&Number.isFinite(longEdge)?Math.max(256,Math.min(4096,Math.round(longEdge)))/longest:Math.min(old*Math.max(1,Math.min(2,scale)),4096/longest);
    const background=this.scene.background,floorVisible=this.floor.visible;
    try{this.shadowDirty=true;this.renderer.shadowMap.autoUpdate=true;if(transparent){this.scene.background=null;this.floor.visible=false}this.renderer.setPixelRatio(ratio);this.renderer.setSize(w,h,false);this.renderer.render(this.scene,this.camera);const png=this.renderer.domElement.toDataURL('image/png');if(!png.startsWith('data:image/png;base64,'))throw Error('PNG 导出失败');return png}finally{this.scene.background=background;this.floor.visible=floorVisible;this.renderer.setPixelRatio(old);this.renderer.setSize(w,h,false);this.applyRenderBudget(previousBudget);this.invalidate()}
  }
  dispose(){this.disposed=true;this.cancelShaderWarm();this.contactWorker?.dispose();this.perf?.dispose();cancelAnimationFrame(this.frame);cancelAnimationFrame(this.hoverFrame);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLostHandler);this.renderer.domElement.removeEventListener('webglcontextrestored',this.contextRestoredHandler);this.resize.disconnect();this.host.removeEventListener('wheel',this.readWheel);this.host.removeEventListener('pointerdown',this.readPanStart,true);this.host.removeEventListener('pointermove',this.readPanMove,true);this.host.removeEventListener('pointerup',this.readPanEnd,true);this.host.removeEventListener('pointercancel',this.readPanEnd,true);this.host.removeEventListener('lostpointercapture',this.readPanEnd,true);this.controls.dispose();this.renderer.domElement.removeEventListener('pointermove',this.hover);this.renderer.domElement.removeEventListener('pointerleave',this.leave);this.book.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.light.shadow.dispose();this.warmDrawTarget?.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
