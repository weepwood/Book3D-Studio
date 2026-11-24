import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { BookConfig } from './schema'
import { bookDimensions, openingPose, skinnedBoard, boardGeometry } from './geometry'
import {createPageLayer,leafCount,clamp01,easeTurn} from './pages'
import {anchorBetween} from './pagePhysics'
import {batchLayout,leafDepths,gravityDrop,activeSpan,chunkDepths,type ActiveLeaf} from './pageWindow'
import {createStackGeometry,stackAngle,surfaceChain,turningChain,poseSurface} from './stackGeometry'
import {groupCount} from './referenceScene'
import {sampleChain,type Chain} from './pageChain'
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
function cover(c:BookConfig,face:'cover'|'back'|'spine'='cover') {
  const width=face==='spine'?Math.max(64,Math.round(1024*c.thickness/c.height)):768
  const {el,ctx}=canvas(width,face==='spine'?1024:Math.round(768*c.height/c.width))
  ctx.fillStyle=c.coverColor;ctx.fillRect(0,0,el.width,el.height)
  if(c.finish==='cloth'){
    for(let x=0;x<el.width;x+=3){ctx.fillStyle=x%2?'#ffffff0c':'#00000010';ctx.fillRect(x,0,1,el.height)}
    for(let y=0;y<el.height;y+=3){ctx.fillStyle='#ffffff08';ctx.fillRect(0,y,el.width,1)}
  }
  if(face==='cover'){
  ctx.strokeStyle=c.inkColor;ctx.lineWidth=2;ctx.strokeRect(42,42,el.width-84,el.height-84)
  ctx.fillStyle=c.inkColor;ctx.textAlign='center'
  ctx.font='21px sans-serif';ctx.fillText(c.subtitle,el.width/2,el.height*.18,el.width-130)
  ctx.font='bold 78px Georgia, serif'
  const words=c.title.split(/\s+/);let lines:string[]=[],line=''
  for(const word of words){const next=line?line+' '+word:word;if(line && ctx.measureText(next).width>el.width-140){lines.push(line);line=word}else line=next}
  if(line)lines.push(line);lines=lines.slice(0,6)
  lines.forEach((s,i)=>ctx.fillText(s,el.width/2,el.height*.46+(i-(lines.length-1)/2)*85,el.width-140))
  ctx.font='20px sans-serif';ctx.fillText(c.author,el.width/2,el.height*.84,el.width-130)
  }else{ctx.fillStyle=c.inkColor;ctx.textAlign='center';ctx.textBaseline='middle';if(face==='spine'){ctx.translate(el.width/2,el.height/2);ctx.rotate(-Math.PI/2);ctx.font='bold '+Math.min(42,el.width*.62)+'px Georgia';ctx.fillText(c.spineText||c.title,0,0,el.height*.85);ctx.setTransform(1,0,0,1,0,0)}else{ctx.font='28px Georgia';ctx.fillText(c.backText,el.width/2,el.height*.5,el.width*.86)}}
  const map=texture(el)
  const image=c[face+'Image' as 'coverImage'|'backImage'|'spineImage']
  const zoom=c[face+'Zoom' as 'coverZoom'|'backZoom'|'spineZoom'],x=c[face+'X' as 'coverX'|'backX'|'spineX'],y=c[face+'Y' as 'coverY'|'backY'|'spineY']
  if(image){
    const img=new Image();img.onload=()=>{if(map.userData.disposed)return;const ratio=Math.max(el.width/img.width,el.height/img.height)*zoom;const w=img.width*ratio,h=img.height*ratio;ctx.drawImage(img,(el.width-w)*(1+x)/2,(el.height-h)*(1+y)/2,w,h);map.needsUpdate=true;map.userData.invalidate?.()};img.src=image
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
  const {w,h,d,t,inset,pageWidth,pageHeight,pageDepth,coverZ}=bookDimensions(c.width,c.height,c.thickness,c.boardThickness,c.pageInset)
  const radius=c.cornerRadius/100
  const coverMap=cover(c);coverMap.userData.invalidate=invalidate
  const cloth=c.finish==='cloth'?bump():null
  const board=new T.MeshPhysicalMaterial({color:c.coverColor,roughness:c.roughness,bumpMap:cloth,bumpScale:cloth ? .006 : 0,clearcoat:c.finish==='gloss'?.85:0,clearcoatRoughness:.18})
  const front=board.clone();front.color.set('#ffffff');front.map=coverMap
  const rear=board.clone(),spineFace=board.clone();rear.color.set('#ffffff');spineFace.color.set('#ffffff');rear.map=cover(c,'back');spineFace.map=cover(c,'spine');rear.map.userData.invalidate=invalidate;spineFace.map.userData.invalidate=invalidate
  const inside=new T.MeshStandardMaterial({color:c.paperColor,roughness:.95})
  const edgeV=new T.MeshStandardMaterial({map:paper(c.paperColor,true),roughness:.95})
  const edgeH=new T.MeshStandardMaterial({map:paper(c.paperColor,false),roughness:.95})
  function mesh(g:T.BufferGeometry,m:T.Material|T.Material[],parent:T.Object3D,x:number,y:number,z:number){
    const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o
  }
  const back=mesh(boardGeometry(w,h,t,radius),[board,board,board,board,inside,rear],root,-w/2,0,-coverZ)
  back.name='Back cover'
  const pageMaterials=[edgeV,edgeV,edgeH,edgeH,inside,inside]
  const lowerShape=createStackGeometry(pageWidth,pageHeight),upperShape=createStackGeometry(pageWidth,pageHeight)
  const lower=mesh(lowerShape.g,pageMaterials,root,0,0,0)
  lower.name='Unread page block'
  const pagePivot=new T.Group();root.add(pagePivot)
  const upper=mesh(upperShape.g,pageMaterials,pagePivot,inset+pageWidth/2,0,0)
  upper.name='Read page block'
  const pages=createPageLayer(pageWidth,pageHeight,c,invalidate)
  root.add(pages.root,pages.right);pagePivot.add(pages.left)
  pages.right.position.set(0,0,0)
  pages.left.rotation.y=Math.PI;pages.left.position.x=inset+pageWidth/2
  const spineWidth=Math.min(.075,Math.max(.027,inset*1.4))
  const spine=mesh(new RoundedBoxGeometry(spineWidth,h,d,4,c.spineStyle==='rounded'?Math.min(spineWidth*.49,d*.24):.002),[board,spineFace,board,board,board,board],root,-w/2+spineWidth*.42,0,0)
  spine.name='Spine'
  const hinge=new T.Group();hinge.position.set(-w/2,0,coverZ);root.add(hinge)
  const rig=skinnedBoard(w,h,t,radius,[board,board,board,board,front,inside])
  rig.mesh.name='Front cover';rig.mesh.castShadow=true;rig.mesh.receiveShadow=true;hinge.add(rig.mesh)
  let last=-1
  let current=c
  let readingIndex=Math.min(c.pageIndex,leafCount(c)),activeTurns:ActiveLeaf[]=[],dropMs=2000,stackKey=''
  let leftLayers:Chain[]=[],rightLayers:Chain[]=[],leftAngle=0,rightAngle=0,leftDepthNow=0,rightDepthNow=0,leftCount=0,rightCount=0
  const refreshPages=()=>{
    const count=leafCount(current),direction=activeTurns[0]?.direction??1
    const block=(activeTurns[0]?.span??1)>1,layout=batchLayout(readingIndex,count,pageDepth,direction,activeSpan(activeTurns),block),leftDepth=layout.left,rightDepth=layout.right
    const base=-coverZ+t/2
    lower.visible=rightDepth>.0001;lower.position.z=base+rightDepth/2
    upper.visible=leftDepth>.0001;upper.position.z=-t/2-leftDepth/2
    leftDepthNow=leftDepth;rightDepthNow=rightDepth;leftCount=Math.round(leftDepth/layout.unit);rightCount=Math.round(rightDepth/layout.unit)
    const open=easeTurn(clamp01((last-90)/90)),leftDrop=gravityDrop(dropMs,0,Math.max(1,Math.min(6,leftCount))),rightDrop=gravityDrop(dropMs,0,Math.max(1,Math.min(6,rightCount)))
    const reading=clamp01((readingIndex+activeTurns.reduce((sum,a)=>sum+(a.opening?0:a.direction*a.progress*(a.span??1)),0))/count)
    leftAngle=stackAngle(pageWidth,Math.min(pageDepth,pageWidth*.22),leftDrop,open,current.pageCoupling)*(1-reading)
    rightAngle=stackAngle(pageWidth,Math.min(pageDepth,pageWidth*.22),rightDrop,open,current.pageCoupling)*reading
    // Empty side is the inside cover; it must remain flat.
    if(leftCount===0)leftAngle=0;if(rightCount===0)rightAngle=0
    const key=[leftDepth,rightDepth,leftAngle,rightAngle].join(':')
    if(key!==stackKey){stackKey=key;leftLayers=[-leftDepth/2,0,leftDepth/2].map(z=>surfaceChain(pageWidth,leftAngle,z));rightLayers=[-rightDepth/2,0,rightDepth/2].map(z=>surfaceChain(pageWidth,rightAngle,z));lowerShape.pose(rightLayers,rightDepth,1);upperShape.pose(leftLayers,leftDepth,-1);poseSurface(pages.right.geometry,rightLayers[2],false);poseSurface(pages.left.geometry,leftLayers[2],true)}
    pages.right.position.z=base+rightDepth+.002
    pages.left.position.z=-t/2-leftDepth-.002
    const active=activeTurns.slice(0,layout.active)
    pages.pose(readingIndex,count,active,current.pageCurl)
    active.forEach((turn,i)=>{
      const turnP=direction===1?turn.progress:1-turn.progress,depths=block?chunkDepths(layout):leafDepths(layout,direction,i)
      const from={x:-w/2+inset,z:base+depths.right+.002}
      const lx=inset,lz=-t/2-depths.left-.002,a=pagePivot.rotation.y
      const to={x:pagePivot.position.x+lx*Math.cos(a)+lz*Math.sin(a),z:pagePivot.position.z-lx*Math.sin(a)+lz*Math.cos(a)}
      const anchor=anchorBetween(from,to,turnP),slot=pages.slots[i],leaf=slot.leaf
      const right=surfaceChain(pageWidth,rightAngle,depths.right/2),left=surfaceChain(pageWidth,-leftAngle,-depths.left/2)
      const chain=turningChain(pageWidth,turnP,current.pageCurl,right,left)
      slot.gpu.update(turnP,current.pageCurl,turn.curlAmount??0,turn.grip??0,turn.grabU??1,chain)
      if(block){pages.chunkShape.pose(chain,layout.moving);pages.chunk.position.set(anchor.x,0,anchor.z);pages.chunk.rotation.y=turnP*(pagePivot.rotation.y+Math.PI)}
      leaf.position.set(anchor.x,0,anchor.z);leaf.rotation.y=turnP*(pagePivot.rotation.y+Math.PI)
    })
  }
  const setReading=(index:number,turns:ActiveLeaf[])=>{readingIndex=Math.min(leafCount(current),Math.max(0,index));activeTurns=turns;refreshPages()}
  const setDrop=(elapsed:number)=>{if(dropMs!==elapsed){dropMs=elapsed;refreshPages()}}
  const setOpening=(deg:number)=>{
    if(deg===last)return
    last=deg
    const pose=openingPose(deg,current.coverFlex,current.pageCoupling)
    hinge.rotation.y=pose.hinge
    const flatten=easeTurn(clamp01((deg-85)/95));hinge.position.z=coverZ*(1-2*flatten)
    pagePivot.position.copy(hinge.position);pagePivot.rotation.y=pose.hinge*(.65+.35*flatten)+pose.page*(1-flatten)*.15
    spine.scale.z=1-(1-t/d)*flatten;spine.position.z=-coverZ*flatten
    rig.bones.forEach((bone,i)=>{bone.rotation.y=i===0?0:pose.bone})
    refreshPages();root.updateMatrixWorld(true);rig.mesh.computeBoundingSphere();rig.mesh.computeBoundingBox()
  }
  setOpening(0);refreshPages()
  const updateAppearance=(next:BookConfig)=>{
    const previous=current;current=next;pages.update(next)
    if(previous.coverFlex!==next.coverFlex||previous.pageCoupling!==next.pageCoupling){const angle=last;last=-1;setOpening(angle)}
    const keys=['coverColor','inkColor','title','subtitle','author','finish'] as const
    const common=keys.some(k=>previous[k]!==next[k])
    for(const [face,mat] of [['cover',front],['back',rear],['spine',spineFace]] as const){
      const fields=([face+'Image',face+'Zoom',face+'X',face+'Y',face+'Text'] as (keyof BookConfig)[])
      if(common||fields.some(k=>previous[k]!==next[k])){if(mat.map){mat.map.userData.disposed=true;mat.map.dispose()}mat.map=cover(next,face);mat.map.userData.invalidate=invalidate;mat.needsUpdate=true}
    }
    if(previous.finish!==next.finish){const old=board.bumpMap;const nextBump=next.finish==='cloth'?bump():null;for(const m of [board,front,rear,spineFace]){m.bumpMap=nextBump;m.bumpScale=nextBump ? .006:0;m.clearcoat=next.finish==='gloss'?.85:0;m.needsUpdate=true}old?.dispose()}
    board.color.set(next.coverColor);for(const m of [board,front,rear,spineFace])m.roughness=next.roughness
    if(previous.paperColor!==next.paperColor){inside.color.set(next.paperColor);for(const [mat,vertical] of [[edgeV,true],[edgeH,false]] as const){mat.map?.dispose();mat.map=paper(next.paperColor,vertical);mat.needsUpdate=true}}
  }
  function activePickPoint(){const slot=pages.slots[0];if(!slot?.leaf.visible||!activeTurns[0]||activeTurns[0].progress<.12||activeTurns[0].progress>.88)return null;return slot.leaf.localToWorld(slot.gpu.pickPoint(.75,0))}
  function readingPickPoint(){const chain=rightLayers[2];if(!chain)return null;const s=sampleChain(chain,.85);return pages.right.localToWorld(new T.Vector3(s.x-pageWidth/2,0,s.z))}
  function groupPickPoint(direction:1|-1){const right=direction===1,mesh=right?lower:upper,layers=right?rightLayers:leftLayers,depth=right?rightDepthNow:leftDepthNow,count=right?rightCount:leftCount;if(count<2||!layers.length||!mesh.visible)return null;const chain=layers[1];return mesh.localToWorld(new T.Vector3(chain.positions[64]-pageWidth/2,0,(right?1:-1)*chain.positions[65]))}
  function pickActive(ray:T.Raycaster){
    let best:{distance:number;direction:1|-1;grip:number;edge:number;progress:number;group:number;slot:number}|null=null
    const span=activeTurns[0]?.span??1
    if(span>1&&pages.chunk.visible){const hit=ray.intersectObject(pages.chunk,false)[0];if(hit?.uv)return {direction:activeTurns[0].direction,grip:hit.uv.y*2-1,edge:hit.uv.x,progress:activeTurns[0].progress,group:span,slot:0}}
    for(let i=0;i<activeTurns.length;i++){
      const a=activeTurns[i],slot=pages.slots[i]
      if(!slot?.leaf.visible||a.opening||a.progress<.025||a.progress>.975)continue
      const g=slot.gpu.pickGeometry(),mat=new T.MeshBasicMaterial({side:T.DoubleSide}),proxy=new T.Mesh(g,mat);proxy.matrixWorld.copy(slot.leaf.matrixWorld)
      const hit=ray.intersectObject(proxy,false)[0];g.dispose();mat.dispose()
      if(hit?.uv&&(!best||hit.distance<best.distance))best={distance:hit.distance,direction:a.direction,grip:hit.uv.y*2-1,edge:hit.uv.x,progress:activeTurns[0].progress,group:activeSpan(activeTurns),slot:i}
    }
    return best
  }
  function pickGroup(ray:T.Raycaster){const hit=ray.intersectObjects([lower,upper].filter(m=>m.visible),false)[0];if(!hit||hit.face?.materialIndex!==0)return null;const topHit=ray.intersectObjects([pages.left,pages.right],false)[0];if(topHit&&topHit.distance<hit.distance-.001)return null;const right=hit.object===lower,mesh=right?lower:upper,layers=right?rightLayers:leftLayers,count=right?rightCount:leftCount,depth=right?rightDepthNow:leftDepthNow;if(count<2||depth<=0)return null;const point=mesh.worldToLocal(hit.point.clone()),top=(right?1:-1)*(depth/2+sampleChainForPick(layers[2])),bottom=(right?1:-1)*(-depth/2+sampleChainForPick(layers[0]));const countPicked=groupCount(count,Math.abs((top-point.z)/(top-bottom)));return countPicked>=2?{direction:right?1 as const:-1 as const,grip:point.y/pageHeight*2,edge:1,progress:0,group:countPicked}:null}
  function sampleChainForPick(chain:Chain){return chain.positions[chain.positions.length-1]}
  return {root,hinge,pickActive,pickGroup,activePickPoint,groupPickPoint,readingPickPoint,setDrop,readingSurfaces:[pages.left,pages.right] as const,setOpening,setReading,updateAppearance,dispose:()=>{pages.dispose();rig.skeleton.dispose();disposeTree(root)}}
}
export function disposeTree(root:T.Object3D){
  const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>(),maps=new Set<T.Texture>()
  root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}})
  for(const m of materials){for(const val of Object.values(m))if(val instanceof T.Texture)maps.add(val);m.dispose()}
  for(const t of maps){t.userData.disposed=true;t.dispose()}
  for(const g of geometries)g.dispose()
}
