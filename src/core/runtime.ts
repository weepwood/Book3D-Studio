import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBook } from './book'
import type {BookConfig} from './schema'
import {READ_ANGLE,leafCount,easeTurn,clamp01,nextLeaf} from './pages'
import {newTurn,stepTurn,releaseCommit,followDrag,followRender,type TurnState} from './pagePhysics'
import {curlTarget} from './pageChain'
import {desiredBatch,orderedProgress,openingLeaves} from './pageWindow'
import {PRESS_SCENE,coverProgress,brakeRetention} from './referenceScene'
export class BookRuntime {
  private renderer:T.WebGLRenderer
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
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap
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
    this.book=createBook(c,this.invalidate);this.book.setReading(this.index,[]);this.scene.add(this.book.root)
    this.resize=new ResizeObserver(this.onResize);this.resize.observe(host)
    this.renderer.domElement.addEventListener('pointermove',this.hover)
    this.renderer.domElement.addEventListener('pointerleave',this.leave)
    this.apply(c);this.onResize();this.fit()
  }
  private onResize=()=>{const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.invalidate()}
  private hover=(e:PointerEvent)=>{if(this.config.opening>=READ_ANGLE||this.config.interaction!=='hover'||this.reduced.matches||e.pointerType==='touch')return;const b=this.host.getBoundingClientRect();this.book.root.rotation.y=T.MathUtils.degToRad(this.config.yaw)+(e.clientX-b.left-b.width/2)/b.width*.65;this.book.root.rotation.x=T.MathUtils.degToRad(this.config.pitch)+(e.clientY-b.top-b.height/2)/b.height*.4;this.invalidate()}
  private leave=()=>{this.clearPageHover();this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch),T.MathUtils.degToRad(this.config.yaw),0);this.invalidate()}
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
      if(!this.turn&&this.index!==target)this.turn=newTurn(target>this.index?1:-1)
      if(this.turn){
        const t=this.turn,commit=target!==this.index&&Math.sign(target-this.index)===t.direction
        if(t.preview){
          const aim=this.hovered?curlTarget('hover',0,t.grabU,this.config.pageCorner*this.config.pageHover):0
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(this.hovered?.94:.95,dt*60))
          if(Math.abs(t.curlAmount-aim)<.01){t.curlAmount=aim;if(!this.hovered)this.turn=null}
        }else if(this.dragging){
          const prev=t.progress;if(this.regrab&&this.brakeElapsed<PRESS_SCENE.brakeMs){this.brakeElapsed+=dt*1000;const k=brakeRetention(this.brakeElapsed);t.velocity*=Math.pow(1-k.damping,dt*60);const drift=clamp01(prev+t.velocity*dt*k.drive);t.progress=followDrag(drift,t.dragTarget,dt*(1-k.drive))}else{t.progress=followDrag(prev,t.dragTarget,dt);t.velocity=dt>0?(t.progress-prev)/dt:0}
          t.renderProgress=followRender(t.renderProgress,t.progress,dt)
          const aim=curlTarget('drag',t.progress,t.grabU,this.config.pageCorner)
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(.96,dt*60))
          for(let i=0;i<this.followers.length;i++){const a=this.followers[i],lead=i?this.followers[i-1]:t;a.progress=orderedProgress(lead.progress,followDrag(a.progress,t.dragTarget,dt));a.renderProgress=orderedProgress(lead.renderProgress,followRender(a.renderProgress,a.progress,dt))}
        }else{
          const goal=this.releaseGoal??(this.followers.length?1:commit?1:0)
          const desired=goal===1?desiredBatch(this.index,target,leafCount(this.config),t.direction):0
          while(this.followers.length+1<desired)this.followers.push(newTurn(t.direction))
          const all=[t,...this.followers],multi=all.length>1
          for(let i=0;i<all.length;i++){
            const a=all[i],step=stepTurn(a.progress,a.velocity,goal,dt,this.config.pageDuration,multi)
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
            if(goal===1){this.index=nextLeaf(this.index,t.direction,leafCount(this.config));this.turn=this.followers.shift()??null;this.releaseGoal=null}else if(all.every(a=>a.progress<.002&&a.renderProgress<.002)){this.turn=null;this.followers=[];this.releaseGoal=null}
          }
        }
      }
    }
    const active=this.turn?[this.turn,...this.followers]:[]
    const display=drop.length?drop:active.map(t=>({direction:t.direction,progress:t.renderProgress,grip:t.grip,velocity:t.velocity,curlAmount:t.curlAmount,grabU:t.grabU}))
    if(display.length||this.settledIndex!==this.index){this.book.setReading(this.index,display);this.settledIndex=display.length?-1:this.index}
    this.peakActive=Math.max(this.peakActive,active.filter(a=>!a.preview).length)
    this.host.dataset.openingLeaves=String(drop.length);this.host.dataset.stackGeometry='layered';this.host.dataset.groupDrag=String(this.groupDrag);this.host.dataset.regrab=String(this.regrab);this.host.dataset.pageGpu='chain-texture';this.host.dataset.activeLeaves=String(active.length);this.host.dataset.peakActiveLeaves=String(this.peakActive)
    this.host.dataset.hoverCurl=String(this.turn?.preview?this.turn.curlAmount:0)
    this.host.dataset.pageProgress=String(this.turn?.progress??0);this.host.dataset.pageTarget=String(target);this.host.dataset.pageIndex=String(this.index);this.host.dataset.pageTurn=this.turn?(this.turn.preview?'preview':'active'):'idle';this.host.dataset.pageReady=String(ready)

    this.book.root.position.set(this.config.width/200*easeTurn(clamp01(this.open/180)),0,0).applyEuler(this.book.root.rotation)
    this.renderer.render(this.scene,this.camera);this.drawing=false
    if(ready){const rect=this.renderer.domElement.getBoundingClientRect(),project=(v:T.Vector3|null)=>{if(!v)return '';const p=v.project(this.camera);return JSON.stringify([rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2])};this.host.dataset.rightPick=project(this.book.readingPickPoint());this.host.dataset.groupPick=project(this.book.groupPickPoint(1));this.host.dataset.activePick=this.turn&&!this.turn.preview&&!this.followers.length?project(this.book.activePickPoint()):''}
    if(this.coverMotion||openingTarget===180&&this.dropElapsed<2000||this.index!==target||!!this.turn&&(!this.turn.preview||!this.hovered||Math.abs(this.turn.curlAmount-curlTarget('hover',0,this.turn.grabU,this.config.pageCorner*this.config.pageHover))>.01))this.frame=requestAnimationFrame(this.draw)
  }
  private apply(c:BookConfig){
    this.scene.background=new T.Color(c.background);this.readLight=-1;this.applyLight(this.open/180)
    this.book.root.rotation.set(T.MathUtils.degToRad(c.pitch),T.MathUtils.degToRad(c.yaw),0)
    this.floor.position.y=-c.height/200-.22;this.controls.enabled=c.interaction!=='hover'&&c.opening<READ_ANGLE
    this.invalidate()
  }
  update(c:BookConfig){
    const keys=['width','height','thickness','boardThickness','cornerRadius','pageInset','spineStyle'] as const
    const rebuild=keys.some(k=>this.config[k]!==c[k]);this.config={...c}
    if(rebuild){this.openingActive=false;this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=nextLeaf(0,c.pageIndex,leafCount(c));this.scene.remove(this.book.root);this.book.dispose();this.book=createBook(c,this.invalidate);this.book.setOpening(this.open);this.scene.add(this.book.root)}else this.book.updateAppearance(c)
    if(this.index>leafCount(c)||this.turn&&desiredBatch(this.index,this.index+this.turn.direction*(1+this.followers.length),leafCount(c),this.turn.direction)<1+this.followers.length){this.index=Math.min(this.index,leafCount(c));this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null}
    if(c.pageHover<=0)this.hovered=false;this.settledIndex=-1;this.apply(c)
  }
  beginPageDrag(direction:1|-1,grip=0,grabU=1,group=1,regrab=false){
    if(this.config.opening<READ_ANGLE||this.open<179.5||this.openingActive||this.reduced.matches||nextLeaf(this.index,direction,leafCount(this.config))===this.index)return false
    if(regrab){if(!this.turn||this.turn.preview||this.followers.length||this.turn.direction!==direction)return false}
    else if(this.turn&&!this.turn.preview||this.index!==this.config.pageIndex)return false
    const t=this.turn?.direction===direction?this.turn:newTurn(direction,grip);t.preview=false;this.hovered=false;t.grip=grip;t.dragTarget=t.progress;t.grabU=grabU;this.turn=t;this.dragging=true;this.releaseGoal=null
    this.regrab=regrab;this.brakeElapsed=0;this.groupDrag=regrab?1:Math.max(1,desiredBatch(this.index,this.index+direction*group,leafCount(this.config),direction));this.followers=Array.from({length:this.groupDrag-1},()=>newTurn(direction));this.invalidate();return true
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
    this.light.shadow.bias=mix(a.bias,b.bias);this.light.shadow.normalBias=mix(a.normalBias,b.normalBias)*scale;this.light.shadow.radius=mix(a.radius,b.radius)
  }
  // Hover only changes local curl, leaving the spine angle at its endpoint.
  previewPage(x:number,y:number){
    if(this.config.opening<READ_ANGLE||this.open<179.5||this.openingActive||this.reduced.matches||this.dragging||this.index!==this.config.pageIndex||this.config.pageHover<=0||this.turn&&!this.turn.preview){this.clearPageHover();return}
    const hit=this.pageHit(x,y)
    if(!hit||nextLeaf(this.index,hit.direction,leafCount(this.config))===this.index){this.clearPageHover();return}
    if(!this.turn||this.turn.direction!==hit.direction)this.turn=newTurn(hit.direction,hit.grip,true)
    this.hovered=true;this.turn.grip=hit.grip;this.turn.grabU=hit.edge;this.invalidate()
  }
  clearPageHover(){if(this.turn?.preview){this.hovered=false;this.invalidate()}}
  fit(){const radius=Math.hypot(this.config.width/100,this.config.height/200,this.config.thickness/100);const half=T.MathUtils.degToRad(this.camera.fov/2);const limiting=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect));const distance=radius/Math.sin(Math.max(.06,limiting))*PRESS_SCENE.spreadSlack/PRESS_SCENE.fitFraction;this.controls.maxDistance=Math.max(15,distance*2);this.camera.position.set(0,distance*.15,distance);this.controls.target.set(0,0,0);this.controls.update();this.invalidate()}
  setView(view:'front'|'back'|'side'|'spine'|'top'|'perspective'){this.fit();if(view==='perspective')return;const d=this.camera.position.length();const dir=new T.Vector3(view==='side'?1:view==='spine'?-1:0,view==='top'?1:0,view==='front'?1:view==='back'?-1:.0001);dir.applyEuler(this.book.root.rotation).normalize();this.camera.position.copy(dir.multiplyScalar(d));this.controls.update();this.invalidate()}
  pageHit(x:number,y:number,physical=false){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height||this.open<179.5||this.openingActive)return null;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);if(physical){const active=this.book.pickActive(ray);if(active)return {...active,travelX:-active.direction*b.width*.5,travelY:0,regrab:true};if(!this.turn||this.turn.preview){const group=this.book.pickGroup(ray);if(group)return {...group,travelX:-group.direction*b.width*.5,travelY:0,regrab:false}}}const hit=ray.intersectObjects([...this.book.readingSurfaces],false)[0];if(!hit?.uv)return null;const direction=hit.object===this.book.readingSurfaces[0]?-1 as const:1 as const;const mesh=hit.object;const width=(this.config.width-2*this.config.pageInset)/100;const outer=mesh.localToWorld(new T.Vector3(direction===1?width/2:-width/2,0,0)).project(this.camera);const inner=mesh.localToWorld(new T.Vector3(direction===1?-width/2:width/2,0,0)).project(this.camera);return {direction,progress:0,group:1,regrab:false,grip:hit.uv.y*2-1,edge:direction===1?hit.uv.x:1-hit.uv.x,travelX:(inner.x-outer.x)*b.width/2,travelY:-(inner.y-outer.y)*b.height/2}}
  pageSide(x:number,y:number){return this.pageHit(x,y)?.direction??null}
  hitTest(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return false;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray.intersectObject(this.book.root,true).length>0}
  capture(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png')}
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('pointermove',this.hover);this.renderer.domElement.removeEventListener('pointerleave',this.leave);this.book.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.light.shadow.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
