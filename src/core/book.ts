import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { BookConfig } from './schema'
const texture = (canvas: HTMLCanvasElement) => {
  const t = new T.CanvasTexture(canvas)
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4
  return t
}
function canvas(w:number,h:number) {
  const el=document.createElement('canvas'); el.width=w;el.height=h
  const ctx=el.getContext('2d'); if(!ctx) throw new Error('Canvas unavailable')
  return {el,ctx}
}
function cover(c:BookConfig) {
  const {el,ctx}=canvas(768,Math.round(768*c.height/c.width))
  ctx.fillStyle=c.coverColor;ctx.fillRect(0,0,el.width,el.height)
  if(c.finish==='cloth'){
    for(let x=0;x<el.width;x+=3){ctx.fillStyle=x%2?'#ffffff0c':'#00000010';ctx.fillRect(x,0,1,el.height)}
    for(let y=0;y<el.height;y+=3){ctx.fillStyle='#ffffff08';ctx.fillRect(0,y,el.width,1)}
  }
  ctx.strokeStyle=c.inkColor;ctx.lineWidth=2;ctx.strokeRect(42,42,el.width-84,el.height-84)
  ctx.fillStyle=c.inkColor;ctx.textAlign='center'
  ctx.font='21px sans-serif';ctx.fillText(c.subtitle,el.width/2,el.height*.18,el.width-130)
  ctx.font='bold 78px Georgia, serif'
  const words=c.title.split(/\s+/);let lines:string[]=[],line=''
  for(const word of words){const next=line?line+' '+word:word;if(line && ctx.measureText(next).width>el.width-140){lines.push(line);line=word}else line=next}
  if(line)lines.push(line);lines=lines.slice(0,6)
  lines.forEach((s,i)=>ctx.fillText(s,el.width/2,el.height*.46+(i-(lines.length-1)/2)*85,el.width-140))
  ctx.font='20px sans-serif';ctx.fillText(c.author,el.width/2,el.height*.84,el.width-130)
  const map=texture(el)
  if(c.coverImage){
    const img=new Image();img.onload=()=>{if(map.userData.disposed)return;const ratio=Math.max(el.width/img.width,el.height/img.height);const w=img.width*ratio,h=img.height*ratio;ctx.drawImage(img,(el.width-w)/2,(el.height-h)/2,w,h);map.needsUpdate=true;map.userData.invalidate?.()};img.src=c.coverImage
  }
  return map
}
function paper(color:string, vertical:boolean){
  const {el,ctx}=canvas(256,256);ctx.fillStyle=color;ctx.fillRect(0,0,256,256)
  for(let i=0;i<256;i+=3){ctx.fillStyle=i%2?'#342e2423':'#ffffff65';ctx.fillRect(vertical?i:0,vertical?0:i,vertical?1:256,vertical?256:1)}
  return texture(el)
}
function bump(){
  const {el,ctx}=canvas(128,128);ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128)
  for(let i=0;i<128;i+=4){ctx.fillStyle='#a0a0a0';ctx.fillRect(i,0,1,128);ctx.fillStyle='#606060';ctx.fillRect(0,i,128,1)}
  const map=new T.CanvasTexture(el);map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(6,9);return map
}
export function createBook(c:BookConfig, invalidate:()=>void){
  const root=new T.Group()
  const w=c.width/100,h=c.height/100,d=c.thickness/100,t=.028
  const coverMap=cover(c);coverMap.userData.invalidate=invalidate
  const cloth=c.finish==='cloth'?bump():null
  const board=new T.MeshPhysicalMaterial({color:c.coverColor,roughness:c.roughness,bumpMap:cloth,bumpScale:cloth ? .006 : 0,clearcoat:c.finish==='gloss'?.85:0,clearcoatRoughness:.18})
  const front=board.clone();front.color.set('#ffffff');front.map=coverMap
  const inside=new T.MeshStandardMaterial({color:c.paperColor,roughness:.95})
  const edgeV=new T.MeshStandardMaterial({map:paper(c.paperColor,true),roughness:.95})
  const edgeH=new T.MeshStandardMaterial({map:paper(c.paperColor,false),roughness:.95})
  function mesh(g:T.BufferGeometry,m:T.Material|T.Material[],parent:T.Object3D,x:number,y:number,z:number){
    const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o
  }
  const back=mesh(new RoundedBoxGeometry(w,h,t,3,.009),board,root,0,0,-d/2)
  back.name='Back cover'
  const block=mesh(new T.BoxGeometry(w-.055,h-.06,d-t),[edgeV,edgeV,edgeH,edgeH,inside,inside],root,.012,0,0)
  block.name='Page block'
  const spine=mesh(new RoundedBoxGeometry(.065,h,d+t,4,.024),board,root,-w/2+.015,0,0)
  spine.name='Spine'
  const hinge=new T.Group();hinge.position.set(-w/2,0,d/2);root.add(hinge)
  const flap=mesh(new T.BoxGeometry(w,h,t),[board,board,board,board,front,inside],hinge,w/2,0,0)
  flap.name='Front cover'
  return {root,hinge,setOpening:(deg:number)=>{hinge.rotation.y=-T.MathUtils.degToRad(deg)},dispose:()=>disposeTree(root)}
}
export function disposeTree(root:T.Object3D){
  const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>(),maps=new Set<T.Texture>()
  root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}})
  for(const m of materials){for(const val of Object.values(m))if(val instanceof T.Texture)maps.add(val);m.dispose()}
  for(const t of maps){t.userData.disposed=true;t.dispose()}
  for(const g of geometries)g.dispose()
}
