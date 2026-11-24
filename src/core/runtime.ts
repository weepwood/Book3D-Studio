import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBook } from './book'
import { springStep, type BookConfig } from './schema'
import {READ_ANGLE,leafCount,easeTurn,clamp01,nextLeaf} from './pages'
import {newTurn,stepTurn,releaseCommit,followDrag,followRender,type TurnState} from './pagePhysics'
import {curlTarget} from './pageChain'
import {desiredBatch,orderedProgress} from './pageWindow'
export class BookRuntime {
  private renderer:T.WebGLRenderer
  private scene=new T.Scene()
  private camera=new T.PerspectiveCamera(35,1,.1,100)
  private controls:OrbitControls
  private book:ReturnType<typeof createBook>
  private floor:T.Mesh<T.PlaneGeometry,T.ShadowMaterial>
  private light=new T.DirectionalLight(0xfff3dd,3)
  private environment:T.WebGLRenderTarget
  private resize:ResizeObserver
  private frame=0
  private drawing=false
  private followers:TurnState[]=[]
  private hovered=false
  private peakActive=0
  private last=0
  private open=0
  private velocity=0
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
    this.light.shadow.mapSize.set(1024,1024);this.light.shadow.normalBias=.025
    Object.assign(this.light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,far:20})
    this.scene.add(this.light,new T.HemisphereLight(0xffffff,0xb1a58b,1.6))
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
    const [x,v]=springStep(this.open,this.velocity,openingTarget,(now-this.last)/1000)
    const dt=Math.min(.25,Math.max(0,(now-this.last)/1000))
    this.last=now;this.open=this.reduced.matches?openingTarget:x;this.velocity=this.reduced.matches?0:v
    this.book.setOpening(this.open>=179.5&&openingTarget===180?180:this.open)
    const target=nextLeaf(0,this.config.pageIndex,leafCount(this.config))
    if(this.config.opening<READ_ANGLE||this.reduced.matches){this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=target}
    else if(this.open>=179.5){
      if(this.turn?.preview&&this.index!==target){const d=target>this.index?1:-1;if(this.turn.direction===d)this.turn.preview=false;else this.turn=null;this.hovered=false}
      if(!this.turn&&this.index!==target)this.turn=newTurn(target>this.index?1:-1)
      if(this.turn){
        const t=this.turn,commit=target!==this.index&&Math.sign(target-this.index)===t.direction
        if(t.preview){
          const aim=this.hovered?curlTarget('hover',0,t.grabU,this.config.pageCorner*this.config.pageHover):0
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(this.hovered?.94:.95,dt*60))
          if(Math.abs(t.curlAmount-aim)<.01){t.curlAmount=aim;if(!this.hovered)this.turn=null}
        }else if(this.dragging){
          const prev=t.progress;t.progress=followDrag(prev,t.dragTarget,dt);t.velocity=dt>0?(t.progress-prev)/dt:0
          t.renderProgress=followRender(t.renderProgress,t.progress,dt)
          const aim=curlTarget('drag',t.progress,t.grabU,this.config.pageCorner)
          t.curlAmount+=(aim-t.curlAmount)*(1-Math.pow(.96,dt*60))
        }else{
          const goal=this.followers.length?1:this.releaseGoal??(commit?1:0)
          const desired=goal===1?desiredBatch(this.index,target,leafCount(this.config),t.direction):0
          while(this.followers.length+1<desired)this.followers.push(newTurn(t.direction))
          const all=[t,...this.followers],multi=all.length>1
          for(let i=0;i<all.length;i++){
            const a=all[i],step=stepTurn(a.progress,a.velocity,i===0?goal:1,dt,this.config.pageDuration,multi)
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
            if(goal===1)this.index=nextLeaf(this.index,t.direction,leafCount(this.config))
            this.turn=this.followers.shift()??null;this.releaseGoal=null
          }
        }
      }
    }
    const active=this.turn?[this.turn,...this.followers]:[]
    if(active.length||this.settledIndex!==this.index){this.book.setReading(this.index,active.map(t=>({direction:t.direction,progress:t.renderProgress,grip:t.grip,velocity:t.velocity,curlAmount:t.curlAmount,grabU:t.grabU})));this.settledIndex=active.length?-1:this.index}
    this.peakActive=Math.max(this.peakActive,active.filter(a=>!a.preview).length)
    this.host.dataset.pageGpu='chain-texture';this.host.dataset.activeLeaves=String(active.length);this.host.dataset.peakActiveLeaves=String(this.peakActive)
    this.host.dataset.hoverCurl=String(this.turn?.preview?this.turn.curlAmount:0)
    this.host.dataset.pageProgress=String(this.turn?.progress??0);this.host.dataset.pageTarget=String(target);this.host.dataset.pageIndex=String(this.index);this.host.dataset.pageTurn=this.turn?(this.turn.preview?'preview':'active'):'idle';this.host.dataset.pageReady=String(this.open>=179.5)

    this.book.root.position.set(this.config.width/200*easeTurn(clamp01(this.open/180)),0,0).applyEuler(this.book.root.rotation)
    this.renderer.render(this.scene,this.camera);this.drawing=false
    if(this.open>=179.5){const rect=this.renderer.domElement.getBoundingClientRect();const mesh=this.book.readingSurfaces[1];const pos=mesh.localToWorld(new T.Vector3((this.config.width-2*this.config.pageInset)/100*.35,0,0)).project(this.camera);this.host.dataset.rightPick=JSON.stringify([rect.left+(pos.x+1)*rect.width/2,rect.top+(1-pos.y)*rect.height/2])}
    if(Math.abs(this.open-openingTarget)>0.0001||Math.abs(this.velocity)>0.0001||this.index!==target||!!this.turn&&(!this.turn.preview||!this.hovered||Math.abs(this.turn.curlAmount-curlTarget('hover',0,this.turn.grabU,this.config.pageCorner*this.config.pageHover))>.01))this.frame=requestAnimationFrame(this.draw)
  }
  private apply(c:BookConfig){
    this.scene.background=new T.Color(c.background);this.light.intensity=c.light
    this.book.root.rotation.set(T.MathUtils.degToRad(c.pitch),T.MathUtils.degToRad(c.yaw),0)
    this.floor.position.y=-c.height/200-.22;this.controls.enabled=c.interaction!=='hover'&&c.opening<READ_ANGLE
    this.invalidate()
  }
  update(c:BookConfig){
    const keys=['width','height','thickness','boardThickness','cornerRadius','pageInset','spineStyle'] as const
    const rebuild=keys.some(k=>this.config[k]!==c[k]);this.config={...c}
    if(rebuild){this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null;this.index=nextLeaf(0,c.pageIndex,leafCount(c));this.scene.remove(this.book.root);this.book.dispose();this.book=createBook(c,this.invalidate);this.book.setOpening(this.open);this.scene.add(this.book.root)}else this.book.updateAppearance(c)
    if(this.index>leafCount(c)||this.turn&&desiredBatch(this.index,this.index+this.turn.direction*(1+this.followers.length),leafCount(c),this.turn.direction)<1+this.followers.length){this.index=Math.min(this.index,leafCount(c));this.turn=null;this.followers=[];this.dragging=false;this.releaseGoal=null}
    if(c.pageHover<=0)this.hovered=false;this.settledIndex=-1;this.apply(c)
  }
  beginPageDrag(direction:1|-1,grip=0,grabU=1){if(this.config.opening<READ_ANGLE||this.open<179.5||(this.turn&&!this.turn.preview)||this.index!==this.config.pageIndex||nextLeaf(this.index,direction,leafCount(this.config))===this.index||this.reduced.matches)return false;const t=this.turn?.direction===direction?this.turn:newTurn(direction,grip);t.preview=false;this.hovered=false;t.grip=grip;t.velocity=0;this.turn=t;t.grabU=grabU;this.dragging=true;this.releaseGoal=null;this.invalidate();return true}
  dragPage(progress:number,_velocity=0,grip?:number,grabU?:number){if(this.dragging&&this.turn){this.turn.dragTarget=clamp01(progress);if(grip!==undefined)this.turn.grip=grip;if(grabU!==undefined)this.turn.grabU=grabU;this.invalidate()}}
  endPageDrag(commit:boolean|null=null,displacementPx=0){if(!this.dragging||!this.turn)return null;const t=this.turn,accepted=commit??releaseCommit(displacementPx);const index=accepted?nextLeaf(this.index,t.direction,leafCount(this.config)):this.index;this.dragging=false;t.velocity=0;this.releaseGoal=accepted?1:0;this.invalidate();return index}
  // Hover only changes local curl, leaving the spine angle at its endpoint.
  previewPage(x:number,y:number){
    if(this.config.opening<READ_ANGLE||this.open<179.5||this.reduced.matches||this.dragging||this.index!==this.config.pageIndex||this.config.pageHover<=0||this.turn&&!this.turn.preview){this.clearPageHover();return}
    const hit=this.pageHit(x,y)
    if(!hit||nextLeaf(this.index,hit.direction,leafCount(this.config))===this.index){this.clearPageHover();return}
    if(!this.turn||this.turn.direction!==hit.direction)this.turn=newTurn(hit.direction,hit.grip,true)
    this.hovered=true;this.turn.grip=hit.grip;this.turn.grabU=hit.edge;this.invalidate()
  }
  clearPageHover(){if(this.turn?.preview){this.hovered=false;this.invalidate()}}
  fit(){const radius=Math.hypot(this.config.width/100,this.config.height/200,this.config.thickness/100);const half=T.MathUtils.degToRad(this.camera.fov/2);const limiting=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect));const distance=radius/Math.sin(Math.max(.06,limiting))*1.08;this.controls.maxDistance=Math.max(15,distance*2);this.camera.position.set(0,distance*.15,distance);this.controls.target.set(0,0,0);this.controls.update();this.invalidate()}
  setView(view:'front'|'back'|'side'|'spine'|'top'|'perspective'){this.fit();if(view==='perspective')return;const d=this.camera.position.length();const dir=new T.Vector3(view==='side'?1:view==='spine'?-1:0,view==='top'?1:0,view==='front'?1:view==='back'?-1:.0001);dir.applyEuler(this.book.root.rotation).normalize();this.camera.position.copy(dir.multiplyScalar(d));this.controls.update();this.invalidate()}
  pageHit(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height||this.open<179.5)return null;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);const hit=ray.intersectObjects([...this.book.readingSurfaces],false)[0];if(!hit?.uv)return null;const direction=hit.object===this.book.readingSurfaces[0]?-1 as const:1 as const;const mesh=hit.object;const width=(this.config.width-2*this.config.pageInset)/100;const outer=mesh.localToWorld(new T.Vector3(direction===1?width/2:-width/2,0,0)).project(this.camera);const inner=mesh.localToWorld(new T.Vector3(direction===1?-width/2:width/2,0,0)).project(this.camera);return {direction,grip:hit.uv.y*2-1,edge:direction===1?hit.uv.x:1-hit.uv.x,travelX:(inner.x-outer.x)*b.width/2,travelY:-(inner.y-outer.y)*b.height/2}}
  pageSide(x:number,y:number){return this.pageHit(x,y)?.direction??null}
  hitTest(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return false;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray.intersectObject(this.book.root,true).length>0}
  capture(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png')}
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('pointermove',this.hover);this.renderer.domElement.removeEventListener('pointerleave',this.leave);this.book.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.light.shadow.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
