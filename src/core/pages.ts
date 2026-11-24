import * as T from 'three'
import type {BookConfig} from './schema'
export const READ_ANGLE=175
export const clamp01=(n:number)=>Math.min(1,Math.max(0,n))
export const leafCount=(c:Pick<BookConfig,'pageCount'|'pageImages'>)=>Math.ceil(Math.max(2,c.pageCount,c.pageImages.length)/2)
export function pageFaces(index:number,count:number){return {left:index>0?index*2-1:-1,right:index<count?index*2:-1}}
export function turnFaces(index:number,direction:1|-1){const leaf=direction===1?index:index-1;return {front:leaf*2,back:leaf*2+1}}
export function nextLeaf(index:number,delta:number,count:number){return Math.max(0,Math.min(count,Math.round(index+delta)))}
export function easeTurn(t:number){t=clamp01(t);return t*t*(3-2*t)}
// Integrate the tangent of an inextensible curved sheet. At both endpoints the
// sheet is flat; in flight its leading edge curves and catches the light.
export function curlPoint(u:number,v:number,p:number,width:number,height:number,curl:number){
  u=clamp01(u);p=clamp01(p)
  const angle=Math.PI*p, bend=Math.min(angle,Math.PI-angle)*clamp01(curl)*.92
  const a=angle-bend, k=2*bend, end=a+k*u
  const x=Math.abs(k)<1e-6?width*u*Math.cos(angle):width*(Math.sin(end)-Math.sin(a))/k
  const z=Math.abs(k)<1e-6?width*u*Math.sin(angle):width*(Math.cos(a)-Math.cos(end))/k
  const lift=Math.sin(Math.PI*p)*clamp01(curl)*width*.055*u*u*v*v
  return [x,v*height,z+lift] as const
}
export function createCurlGeometry(w:number,h:number){
  const g=new T.PlaneGeometry(w,h,40,12)
  return g
}
export function deformPage(g:T.BufferGeometry,w:number,h:number,p:number,curl:number){
  const uv=g.getAttribute('uv'),pos=g.getAttribute('position')
  for(let i=0;i<pos.count;i++){const [x,y,z]=curlPoint(uv.getX(i),uv.getY(i)-.5,p,w,h,curl);pos.setXYZ(i,x,y,z)}
  pos.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()
}
const passages=[
  ['01','A way of seeing','A book is an invitation to notice the details that usually go unseen. Begin with a question, then make room for an unexpected answer.'],
  ['02','The shape of an idea','An idea becomes tangible through the choices we make: the materials, the scale, the space around it. Design is a practice of paying attention.'],
  ['03','Small experiments','Build a small thing. Observe what happens. Keep what works and change what does not. The next attempt begins with what the last one taught us.'],
  ['04','A slower rhythm','Some things reward patience. A page, a conversation, a careful observation: each makes time for a different kind of understanding.']
]
function pageTexture(c:BookConfig,index:number,flip:boolean,invalidate:()=>void){
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*c.height/c.width)
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=c.paperColor;ctx.fillRect(0,0,canvas.width,canvas.height)
  const w=canvas.width,h=canvas.height
  if(index>=0&&index<c.pageCount){
    const [chapter,title,text]=passages[Math.floor(index/2)%passages.length]
    ctx.fillStyle='#38372e';ctx.font='18px serif';ctx.fillText('FIELD NOTES  /  '+chapter,48,65)
    ctx.strokeStyle='#a6a18e';ctx.beginPath();ctx.moveTo(48,84);ctx.lineTo(w-48,84);ctx.stroke()
    ctx.font='38px Georgia';ctx.fillText(index===0?c.title:title,48,h*.23,w-96)
    ctx.font='24px Georgia';let y=h*.34
    for(let paragraph=0;paragraph<2;paragraph++){let line='';for(const word of text.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w-96){ctx.fillText(line,48,y);y+=34;line=word}else line=next}if(line){ctx.fillText(line,48,y);y+=34}y+=24;if(y>h*.77)break}
    ctx.font='18px serif';ctx.textAlign='center';ctx.fillText(String(index+1),w/2,h-42)
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4
  if(flip){texture.repeat.x=-1;texture.offset.x=1}
  const image=c.pageImages[index]
  if(image){const img=new Image();img.onload=()=>{if(texture.userData.disposed)return;ctx.fillStyle=c.paperColor;ctx.fillRect(0,0,w,h);const ratio=Math.min(w/img.width,h/img.height);ctx.drawImage(img,(w-img.width*ratio)/2,(h-img.height*ratio)/2,img.width*ratio,img.height*ratio);texture.needsUpdate=true;invalidate()};img.src=image}
  return texture
}
export function createPageLayer(w:number,h:number,c:BookConfig,invalidate:()=>void){
  let config=c
  const root=new T.Group(),left=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({roughness:.94})),right=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({roughness:.94}))
  const geometry=createCurlGeometry(w,h)
  const front=new T.MeshStandardMaterial({roughness:.94,side:T.FrontSide}),back=new T.MeshStandardMaterial({roughness:.94,side:T.BackSide})
  const leaf=new T.Group(),frontMesh=new T.Mesh(geometry,front),backMesh=new T.Mesh(geometry,back)
  leaf.add(frontMesh,backMesh);root.add(leaf);leaf.visible=false
  for(const mesh of [left,right,frontMesh,backMesh]){mesh.castShadow=true;mesh.receiveShadow=true}
  const keys=new Map<T.MeshStandardMaterial,string>()
  function assign(mat:T.MeshStandardMaterial,index:number,flip=false){
    const key=index+':'+flip
    if(keys.get(mat)===key)return
    if(mat.map){mat.map.userData.disposed=true;mat.map.dispose()}
    mat.map=pageTexture(config,index,flip,invalidate);mat.needsUpdate=true;keys.set(mat,key)
  }
  function update(next:BookConfig){
    if(next.pageImages!==config.pageImages||next.pageCount!==config.pageCount||next.paperColor!==config.paperColor||next.title!==config.title)keys.clear()
    config=next
  }
  function pose(index:number,count:number,active:{direction:1|-1;progress:number}|null,curl:number){
    const faces=pageFaces(index,count)
    if(active){
      const moving=turnFaces(index,active.direction)
      const next=pageFaces(index+active.direction,count)
      assign(left.material,active.direction===-1?next.left:faces.left)
      assign(right.material,active.direction===1?next.right:faces.right)
      assign(front,moving.front);assign(back,moving.back,true)
      deformPage(geometry,w,h,active.direction===1?active.progress:1-active.progress,curl)
      leaf.visible=true
    }else{assign(left.material,faces.left);assign(right.material,faces.right);leaf.visible=false}
  }
  return {root,left,right,leaf,update,pose}
}
