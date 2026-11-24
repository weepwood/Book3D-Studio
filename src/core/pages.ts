import * as T from 'three'
import type {BookConfig} from './schema'
import {clamp} from './pagePhysics'
import {makeChain,rollPoint} from './pageChain'
import {createGpuPage} from './pageGpu'
import type {ActiveLeaf} from './pageWindow'
export const READ_ANGLE=175
export const clamp01=(n:number)=>Math.min(1,Math.max(0,n))
export const leafCount=(c:Pick<BookConfig,'pageCount'|'pageImages'>)=>Math.ceil(Math.max(2,c.pageCount,c.pageImages.length)/2)
export function pageFaces(index:number,count:number){return {left:index>0?index*2-1:-1,right:index<count?index*2:-1}}
export function turnFaces(index:number,direction:1|-1){const leaf=direction===1?index:index-1;return {front:leaf*2,back:leaf*2+1}}
export function nextLeaf(index:number,delta:number,count:number){return Math.max(0,Math.min(count,Math.round(index+delta)))}
export function easeTurn(t:number){t=clamp01(t);return t*t*(3-2*t)}
// Integrate the tangent of an inextensible curved sheet. At both endpoints the
// sheet is flat; in flight its leading edge curves and catches the light.
export function curlPoint(u:number,v:number,p:number,width:number,height:number,curl:number,grip=0,corner=0,velocity=0){
  u=clamp01(u);p=clamp01(p)
  const envelope=Math.sin(Math.PI*p)
  const localGrip=clamp(1-Math.abs(v*2-grip)/1.4)
  const angle=Math.PI*p, bend=Math.min(angle,Math.PI-angle)*clamp01(curl)*clamp(.78+corner*.06*localGrip+Math.abs(velocity)*.055,0,.97)
  const a=angle-bend, k=2*bend, end=a+k*u
  const x=Math.abs(k)<1e-6?width*u*Math.cos(angle):width*(Math.sin(end)-Math.sin(a))/k
  const z=Math.abs(k)<1e-6?width*u*Math.sin(angle):width*(Math.cos(a)-Math.cos(end))/k
  const lift=envelope*clamp01(curl)*width*u*u*(.025*v*v+corner*.075*localGrip*localGrip)
  const twist=envelope*corner*grip*v*u*u*width*.018
  return [x,v*height+twist,z+lift] as const
}
export function createCurlGeometry(w:number,h:number){
  const g=new T.PlaneGeometry(w,h,48,18)
  return g
}
export function deformPage(g:T.BufferGeometry,w:number,h:number,p:number,curl:number,grip=0,_corner=0,_velocity=0,amount=0,grabU=1){
  const chain=makeChain(w,p,curl),uv=g.getAttribute('uv'),pos=g.getAttribute('position')
  for(let i=0;i<pos.count;i++){const [x,y,z]=rollPoint(chain,uv.getX(i),uv.getY(i)-.5,h,amount,grip,grabU,p);pos.setXYZ(i,x,y,z)}
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
    for(let paragraph=0;paragraph<2;paragraph++){let line='';for(const word of text.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w-96){if(y>h-90)break;ctx.fillText(line,48,y);y+=34;line=word}else line=next}if(line&&y<=h-90){ctx.fillText(line,48,y);y+=34}y+=24;if(y>h*.77)break}
    ctx.font='18px serif';ctx.textAlign='center';ctx.fillText(String(index+1),w/2,h-42)
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4
  if(flip){texture.repeat.x=-1;texture.offset.x=1}
  const own=canvas.cloneNode() as HTMLCanvasElement;own.getContext('2d')!.drawImage(canvas,0,0)
  let reverse:HTMLCanvasElement|null=null
  const redraw=()=>{if(texture.userData.disposed)return;ctx.clearRect(0,0,w,h);ctx.drawImage(own,0,0);if(reverse&&c.pageBleed>0){ctx.save();ctx.globalAlpha=c.pageBleed;ctx.globalCompositeOperation='multiply';ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(reverse,0,0);ctx.restore()}texture.needsUpdate=true;invalidate()}
  const load=(url:string,done:(im:HTMLImageElement)=>void)=>{const im=new Image();im.onload=()=>{if(!texture.userData.disposed)done(im)};im.src=url}
  const paint=(target:HTMLCanvasElement,im:HTMLImageElement,bg:string)=>{const g=target.getContext('2d')!;g.fillStyle=bg;g.fillRect(0,0,w,h);const q=Math.min(w/im.width,h/im.height);g.drawImage(im,(w-im.width*q)/2,(h-im.height*q)/2,im.width*q,im.height*q)}
  if(c.pageImages[index])load(c.pageImages[index],im=>{paint(own,im,c.paperColor);redraw()})
  const opposite=index%2===0?index+1:index-1
  if(index>=0&&index<c.pageCount&&opposite>=0&&opposite<c.pageCount&&c.pageBleed>0){
    reverse=canvas.cloneNode() as HTMLCanvasElement;const g=reverse.getContext('2d')!;g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.fillStyle='#302e28';g.font='24px Georgia';const text=passages[Math.floor(opposite/2)%passages.length][2];let line='',y=h*.34;for(const word of (text+' '+text).split(' ')){const next=line?line+' '+word:word;if(g.measureText(next).width>w-96){if(y>h-90)break;g.fillText(line,48,y);y+=34;line=word}else line=next}if(line&&y<=h-90)g.fillText(line,48,y);redraw();if(c.pageImages[opposite])load(c.pageImages[opposite],im=>{if(reverse){paint(reverse,im,'#ffffff');redraw()}})
  }
  return texture
}
export function createPageLayer(w:number,h:number,c:BookConfig,invalidate:()=>void){
  let config=c
  const root=new T.Group(),left=new T.Mesh(new T.PlaneGeometry(w,h,48,1),new T.MeshStandardMaterial({roughness:.94})),right=new T.Mesh(new T.PlaneGeometry(w,h,48,1),new T.MeshStandardMaterial({roughness:.94}))
  const slots:Array<{leaf:T.Group;front:T.MeshStandardMaterial;back:T.MeshStandardMaterial;gpu:ReturnType<typeof createGpuPage>}>=[]
  left.name='Reading page left';right.name='Reading page right'
  for(const mesh of [left,right]){mesh.castShadow=true;mesh.receiveShadow=true}
  function slot(i:number){
    if(slots[i])return slots[i]
    const geometry=createCurlGeometry(w,h),gpu=createGpuPage(w,h)
    const front=new T.MeshStandardMaterial({roughness:.94,side:T.FrontSide}),back=new T.MeshStandardMaterial({roughness:.94,side:T.BackSide})
    gpu.attach(front);gpu.attach(back)
    const leaf=new T.Group(),fm=new T.Mesh(geometry,front),bm=new T.Mesh(geometry,back)
    fm.name=bm.name='Turning page';fm.castShadow=true;fm.receiveShadow=bm.receiveShadow=true
    fm.customDepthMaterial=gpu.depth;fm.frustumCulled=bm.frustumCulled=false
    leaf.add(fm,bm);root.add(leaf);leaf.visible=false
    const value={leaf,front,back,gpu};slots.push(value);return value
  }
  const keys=new Map<T.MeshStandardMaterial,string>()
  function assign(mat:T.MeshStandardMaterial,index:number,flip=false){
    const key=index+':'+flip
    if(keys.get(mat)===key)return
    if(mat.map){mat.map.userData.disposed=true;mat.map.dispose()}
    mat.map=pageTexture(config,index,flip,invalidate);mat.needsUpdate=true;keys.set(mat,key)
  }
  function update(next:BookConfig){
    if(next.pageImages!==config.pageImages||next.pageCount!==config.pageCount||next.paperColor!==config.paperColor||next.title!==config.title||next.pageBleed!==config.pageBleed)keys.clear()
    config=next
  }
  function pose(index:number,count:number,active:ActiveLeaf[],curl:number){
    const direction=active[0]?.direction??1,faces=pageFaces(index,count),next=pageFaces(index+direction*active.length,count)
    assign(left.material,direction===-1?next.left:faces.left)
    assign(right.material,direction===1?next.right:faces.right)
    active.forEach((a,i)=>{
      const s=slot(i),moving=turnFaces(index+direction*i,direction)
      assign(s.front,moving.front);assign(s.back,moving.back,true)
      s.gpu.update(direction===1?a.progress:1-a.progress,curl,a.curlAmount??0,a.grip??0,a.grabU??1)
      s.leaf.visible=true
    })
    for(let i=active.length;i<slots.length;i++)slots[i].leaf.visible=false
  }
  return {root,left,right,slots,update,pose,dispose:()=>slots.forEach(s=>s.gpu.dispose())}
}
