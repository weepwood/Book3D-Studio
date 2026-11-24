import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBook } from './book'
import { springStep, type BookConfig } from './schema'
import {READ_ANGLE,leafCount,easeTurn,clamp01,nextLeaf} from './pages'
import {newTurn,stepTurn,releaseCommit,type TurnState} from './pagePhysics'
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
  private last=0
  private open=0
  private velocity=0
  private index=0
  private turn:TurnState|null=null
  private hoverGoal=0
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
    this.book=createBook(c,this.invalidate);this.book.setReading(this.index,null);this.scene.add(this.book.root)
    this.resize=new ResizeObserver(this.onResize);this.resize.observe(host)
    this.renderer.domElement.addEventListener('pointermove',this.hover)
    this.renderer.domElement.addEventListener('pointerleave',this.leave)
    this.apply(c);this.onResize();this.fit()
  }
  private onResize=()=>{const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.invalidate()}
  private hover=(e:PointerEvent)=>{if(this.config.opening>=READ_ANGLE||this.config.interaction!=='hover'||this.reduced.matches||e.pointerType==='touch')return;const b=this.host.getBoundingClientRect();this.book.root.rotation.y=T.MathUtils.degToRad(this.config.yaw)+(e.clientX-b.left-b.width/2)/b.width*.65;this.book.root.rotation.x=T.MathUtils.degToRad(this.config.pitch)+(e.clientY-b.top-b.height/2)/b.height*.4;this.invalidate()}
  private leave=()=>{this.clearPageHover();this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch),T.MathUtils.degToRad(this.config.yaw),0);this.invalidate()}
  invalidate=()=>{if(!this.disposed&&!this.frame){this.last=performance.now();this.frame=requestAnimationFrame(this.draw)}}
  private draw=(now:number)=>{
    this.frame=0;if(this.disposed)return
    const openingTarget=this.config.opening>=READ_ANGLE?180:this.config.opening
    const [x,v]=springStep(this.open,this.velocity,openingTarget,(now-this.last)/1000)
    const dt=Math.min(.05,Math.max(0,(now-this.last)/1000))
    this.last=now;this.open=this.reduced.matches?openingTarget:x;this.velocity=this.reduced.matches?0:v
    this.book.setOpening(this.open)
    const target=nextLeaf(0,this.config.pageIndex,leafCount(this.config))
    if(this.config.opening<READ_ANGLE||this.reduced.matches){this.turn=null;this.dragging=false;this.releaseGoal=null;this.index=target}
    else if(this.open>=179.5){
      if(!this.turn&&this.index!==target)this.turn=newTurn(target>this.index?1:-1)
      if(this.turn&&!this.dragging){
        const t=this.turn,commit=target!==this.index&&Math.sign(target-this.index)===t.direction
        if(commit)t.preview=false
        const goal=this.releaseGoal??(commit?1:t.preview&&target===this.index?this.hoverGoal:0)
        const step=stepTurn(t.progress,t.velocity,goal,dt,t.preview ? .38 : this.config.pageDuration)
        t.progress=step.progress;t.velocity=step.velocity
        if(step.settled){if(goal===1){this.index=nextLeaf(this.index,t.direction,leafCount(this.config));this.turn=null;this.releaseGoal=null}else if(goal===0){this.turn=null;this.releaseGoal=null}}
      }
    }
    if(this.turn||this.settledIndex!==this.index){this.book.setReading(this.index,this.turn?{direction:this.turn.direction,progress:this.turn.progress,grip:this.turn.grip,velocity:this.turn.velocity}:null);this.settledIndex=this.turn?-1:this.index}
    this.host.dataset.pageIndex=String(this.index);this.host.dataset.pageTurn=this.turn?'active':'idle';this.host.dataset.pageReady=String(this.open>=179.5)

    this.book.root.position.set(this.config.width/200*easeTurn(clamp01(this.open/180)),0,0).applyEuler(this.book.root.rotation)
    this.renderer.render(this.scene,this.camera)
    if(Math.abs(this.open-openingTarget)>0.0001||Math.abs(this.velocity)>0.0001||(!this.dragging&&(this.index!==target||!!this.turn&&(!this.turn.preview||Math.abs(this.turn.progress-this.hoverGoal)>.002||Math.abs(this.turn.velocity)>.025))))this.frame=requestAnimationFrame(this.draw)
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
    if(rebuild){this.turn=null;this.dragging=false;this.releaseGoal=null;this.index=nextLeaf(0,c.pageIndex,leafCount(c));this.scene.remove(this.book.root);this.book.dispose();this.book=createBook(c,this.invalidate);this.book.setOpening(this.open);this.scene.add(this.book.root)}else this.book.updateAppearance(c)
    if(this.index>leafCount(c)||this.turn&&nextLeaf(this.index,this.turn.direction,leafCount(c))===this.index){this.index=Math.min(this.index,leafCount(c));this.turn=null;this.dragging=false;this.releaseGoal=null}
    this.settledIndex=-1;this.apply(c)
  }
  beginPageDrag(direction:1|-1,grip=0){if(this.open<179.5||(this.turn&&!this.turn.preview)||this.index!==this.config.pageIndex||nextLeaf(this.index,direction,leafCount(this.config))===this.index||this.reduced.matches)return false;const t=this.turn?.direction===direction?this.turn:newTurn(direction,grip);t.preview=false;t.grip=grip;t.velocity=0;this.turn=t;this.dragging=true;this.releaseGoal=null;this.invalidate();return true}
  dragPage(progress:number,velocity=0){if(this.dragging&&this.turn){this.turn.progress=clamp01(progress);this.turn.velocity=Math.max(-4,Math.min(4,velocity));this.invalidate()}}
  endPageDrag(commit:boolean|null=null){if(!this.dragging||!this.turn)return null;const t=this.turn,accepted=commit??releaseCommit(t.progress,t.velocity);const index=accepted?nextLeaf(this.index,t.direction,leafCount(this.config)):this.index;this.dragging=false;this.releaseGoal=accepted?1:0;this.invalidate();return index}
  previewPage(x:number,y:number){if(this.open<179.5||this.reduced.matches||this.dragging||this.index!==this.config.pageIndex||this.config.pageHover<=0||this.turn&&!this.turn.preview){this.clearPageHover();return}
    const hit=this.pageHit(x,y);if(!hit||hit.edge<.72||nextLeaf(this.index,hit.direction,leafCount(this.config))===this.index){this.clearPageHover();return}
    if(!this.turn||this.turn.direction!==hit.direction)this.turn=newTurn(hit.direction,hit.grip,true)
    this.turn.grip=hit.grip;this.hoverGoal=.06*this.config.pageHover*(hit.edge-.72)/.28;this.invalidate()
  }
  clearPageHover(){if(this.turn?.preview){this.hoverGoal=0;this.turn.preview=false;this.invalidate()}}
  fit(){const radius=Math.hypot(this.config.width/100,this.config.height/200,this.config.thickness/100);const half=T.MathUtils.degToRad(this.camera.fov/2);const limiting=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect));const distance=radius/Math.sin(Math.max(.06,limiting))*1.08;this.controls.maxDistance=Math.max(15,distance*2);this.camera.position.set(0,distance*.15,distance);this.controls.target.set(0,0,0);this.controls.update();this.invalidate()}
  setView(view:'front'|'back'|'side'|'spine'|'top'|'perspective'){this.fit();if(view==='perspective')return;const d=this.camera.position.length();const dir=new T.Vector3(view==='side'?1:view==='spine'?-1:0,view==='top'?1:0,view==='front'?1:view==='back'?-1:.0001);dir.applyEuler(this.book.root.rotation).normalize();this.camera.position.copy(dir.multiplyScalar(d));this.controls.update();this.invalidate()}
  pageHit(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height||this.open<179.5)return null;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);const hit=ray.intersectObjects([...this.book.readingSurfaces],false)[0];if(!hit?.uv)return null;const direction=hit.object===this.book.readingSurfaces[0]?-1 as const:1 as const;return {direction,grip:hit.uv.y*2-1,edge:direction===1?hit.uv.x:1-hit.uv.x}}
  pageSide(x:number,y:number){return this.pageHit(x,y)?.direction??null}
  hitTest(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return false;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray.intersectObject(this.book.root,true).length>0}
  capture(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png')}
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('pointermove',this.hover);this.renderer.domElement.removeEventListener('pointerleave',this.leave);this.book.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.light.shadow.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
