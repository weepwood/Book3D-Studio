import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBook } from './book'
import { springStep, type BookConfig } from './schema'
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
  private config:BookConfig
  private disposed=false
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  constructor(private host:HTMLElement,c:BookConfig){
    this.config={...c};this.open=c.opening
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
    this.book=createBook(c,this.invalidate);this.scene.add(this.book.root)
    this.resize=new ResizeObserver(this.onResize);this.resize.observe(host)
    this.renderer.domElement.addEventListener('pointermove',this.hover)
    this.renderer.domElement.addEventListener('pointerleave',this.leave)
    this.apply(c);this.onResize();this.fit()
  }
  private onResize=()=>{const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.invalidate()}
  private hover=(e:PointerEvent)=>{if(this.config.interaction!=='hover'||this.reduced.matches||e.pointerType==='touch')return;const b=this.host.getBoundingClientRect();this.book.root.rotation.y=T.MathUtils.degToRad(this.config.yaw)+(e.clientX-b.left-b.width/2)/b.width*.65;this.book.root.rotation.x=T.MathUtils.degToRad(this.config.pitch)+(e.clientY-b.top-b.height/2)/b.height*.4;this.invalidate()}
  private leave=()=>{this.book.root.rotation.set(T.MathUtils.degToRad(this.config.pitch),T.MathUtils.degToRad(this.config.yaw),0);this.invalidate()}
  invalidate=()=>{if(!this.disposed&&!this.frame){this.last=performance.now();this.frame=requestAnimationFrame(this.draw)}}
  private draw=(now:number)=>{
    this.frame=0;if(this.disposed)return
    const [x,v]=springStep(this.open,this.velocity,this.config.opening,(now-this.last)/1000)
    this.last=now;this.open=this.reduced.matches?this.config.opening:x;this.velocity=this.reduced.matches?0:v
    this.book.setOpening(this.open);this.renderer.render(this.scene,this.camera)
    if(Math.abs(this.open-this.config.opening)>0.0001||Math.abs(this.velocity)>0.0001)this.frame=requestAnimationFrame(this.draw)
  }
  private apply(c:BookConfig){
    this.scene.background=new T.Color(c.background);this.light.intensity=c.light
    this.book.root.rotation.set(T.MathUtils.degToRad(c.pitch),T.MathUtils.degToRad(c.yaw),0)
    this.floor.position.y=-c.height/200-.22;this.controls.enabled=c.interaction!=='hover'
    this.invalidate()
  }
  update(c:BookConfig){
    const keys=['width','height','thickness','boardThickness','cornerRadius','pageInset','spineStyle','coverFlex','pageCoupling','title','subtitle','author','coverColor','paperColor','inkColor','finish','roughness','coverImage'] as const
    const rebuild=keys.some(k=>this.config[k]!==c[k]);this.config={...c}
    if(rebuild){this.scene.remove(this.book.root);this.book.dispose();this.book=createBook(c,this.invalidate);this.book.setOpening(this.open);this.scene.add(this.book.root)}
    this.apply(c)
  }
  fit(){const radius=Math.hypot(this.config.width/100,this.config.height/200,this.config.thickness/100);const half=T.MathUtils.degToRad(this.camera.fov/2);const limiting=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect));const distance=radius/Math.sin(Math.max(.06,limiting))*1.08;this.controls.maxDistance=Math.max(15,distance*2);this.camera.position.set(0,distance*.15,distance);this.controls.target.set(0,0,0);this.controls.update();this.invalidate()}
  hitTest(x:number,y:number){const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return false;this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,-(y-b.top)/b.height*2+1),this.camera);return ray.intersectObject(this.book.root,true).length>0}
  capture(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png')}
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('pointermove',this.hover);this.renderer.domElement.removeEventListener('pointerleave',this.leave);this.book.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.light.shadow.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
