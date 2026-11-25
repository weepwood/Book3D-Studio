import * as T from 'three'
import type { BookConfig } from './schema'
import { bookDimensions, openingPose, coupledPageAngle, supportedCoverFlex, skinnedBoard, coverBoneAngles, BONE_COUNT } from './geometry'
import {createPageLayer,leafCount,clamp01,easeTurn} from './pages'
import {physicalBook} from './physicalBook'
import {paperMaterial,materialCurlAmount} from './paperMaterial'
import {curveMetrics} from './curveMetrics'
import {measureSurface,surfaceSummary,accumulateSurface} from './surfaceMetrics'
import {anchorBetween} from './pagePhysics'
import {batchLayout,leafDepths,gravityDrop,activeSpan,chunkDepths,STACK_SETTLE_MS,type ActiveLeaf} from './pageWindow'
import {createStackGeometry,bindingCompression,bindingHeight,boundLayer,turningChain,poseSurface,edgeTriangleCenters,chunkRowProgress,liftChunkChain,chunkEndpointWeight,stackSection,pickedDepth,stackHeightSampler} from './stackGeometry'
import {groupCount} from './referenceScene'
import {sampleChain,type Chain} from './pageChain'
import {createBindingGeometry} from './bindingGeometry'
import {paperEdgeTexture} from './paperEdge'
import {safeHingeZ} from './clearance'
import {sectionCrossings} from './sheetCollision'
import {ContactCache,scanMeshContacts,snapshotMesh} from './meshContacts'
import {prepareSweptMesh,scanSweptTrees,type MotionSnapshot} from './sweptContact'
import {containmentProbe,selfContactProbe} from './solidContacts'
import type {ContactRequest} from './contactWorkerProtocol'
import {contactCorrection,improvesContacts,turnCorrectionEnvelope,correctionCandidates,nonWorseningContacts} from './contactCorrection'
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
  const width=face==='spine'?Math.max(64,Math.round(1024*physicalBook(c).thickness/c.height)):768
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
function bump(){
  const {el,ctx}=canvas(128,128);ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128)
  for(let i=0;i<128;i+=4){ctx.fillStyle='#a0a0a0';ctx.fillRect(i,0,1,128);ctx.fillStyle='#606060';ctx.fillRect(0,i,128,1)}
  const map=new T.CanvasTexture(el);map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(6,9);return map
}
export function createBook(c:BookConfig, invalidate:()=>void,warm?:(texture:T.Texture)=>boolean){
  const root=new T.Group()
  const {w,h,t,inset,gutterInset,pageWidth,pageCenter,pageHeight}=bookDimensions(c.width,c.height,physicalBook(c).thickness,c.boardThickness,c.pageInset)
  let pageDepth=physicalBook(c).core/100,coverZ=(pageDepth+t)/2
  const radius=c.cornerRadius/100
  const coverMap=cover(c);coverMap.userData.invalidate=invalidate
  const cloth=c.finish==='cloth'?bump():null
  const board=new T.MeshPhysicalMaterial({color:c.coverColor,roughness:c.roughness,bumpMap:cloth,bumpScale:cloth ? .006 : 0,clearcoat:c.finish==='gloss'?.85:0,clearcoatRoughness:.18})
  const front=board.clone();front.color.set('#ffffff');front.map=coverMap
  const rear=board.clone(),spineFace=board.clone();rear.color.set('#ffffff');spineFace.color.set('#ffffff');rear.map=cover(c,'back');spineFace.map=cover(c,'spine');rear.map.userData.invalidate=invalidate;spineFace.map.userData.invalidate=invalidate
  const inside=new T.MeshStandardMaterial({color:c.paperColor,roughness:.95})
  const edgeV=new T.MeshStandardMaterial({map:paperEdgeTexture(c.paperColor,true),roughness:.95})
  const edgeH=new T.MeshStandardMaterial({map:paperEdgeTexture(c.paperColor,false),roughness:.95})
  function mesh(g:T.BufferGeometry,m:T.Material|T.Material[],parent:T.Object3D,x:number,y:number,z:number){
    const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o
  }
  const bindingLip=Math.min(inset*.65,t*1.2)
  const rearRig=skinnedBoard(w,h,t,radius,[board,board,board,board,inside,rear],'backcover',bindingLip)
  const back=rearRig.mesh;back.name='Back cover';back.position.set(-w/2,0,-coverZ);back.castShadow=back.receiveShadow=true;root.add(back)
  const pageMaterials=[edgeV,edgeV,edgeH,edgeH,inside,inside]
  const lowerShape=createStackGeometry(pageWidth,pageHeight,4),upperShape=createStackGeometry(pageWidth,pageHeight,4)
  const lower=mesh(lowerShape.g,pageMaterials,root,pageCenter,0,0)
  lower.name='Unread page block'
  const pagePivot=new T.Group();root.add(pagePivot)
  const upper=mesh(upperShape.g,pageMaterials,pagePivot,gutterInset+pageWidth/2,0,0)
  upper.name='Read page block'
  const pages=createPageLayer(pageWidth,pageHeight,c,invalidate,warm)
  root.add(pages.root,pages.right);pagePivot.add(pages.left)
  pages.right.position.set(pageCenter,0,0)
  pages.left.rotation.y=Math.PI;pages.left.position.x=gutterInset+pageWidth/2
  const outerBinding=createBindingGeometry(h),innerBindingShape=createBindingGeometry(h-2*radius,true)
  spineFace.side=T.DoubleSide
  const lining=new T.MeshStandardMaterial({color:c.paperColor,roughness:.95,side:T.DoubleSide})
  const spine=mesh(outerBinding.g,spineFace,root,0,0,0);spine.name='Spine'
  const innerBinding=mesh(innerBindingShape.g,lining,root,0,0,0);innerBinding.name='Inner spine lining'
  const hinge=new T.Group();hinge.position.set(-w/2,0,coverZ);root.add(hinge)
  const rig=skinnedBoard(w,h,t,radius,[board,board,board,board,front,inside],'frontcover',bindingLip)
  rig.mesh.name='Front cover';rig.mesh.castShadow=true;rig.mesh.receiveShadow=true;hinge.add(rig.mesh)
  let last=-1
  let current=c,material=paperMaterial(c)
  const settledDropMs=STACK_SETTLE_MS
  const measureCurve=new URLSearchParams(location.search).get('curve')==='1'
  const enableSlip=new URLSearchParams(location.search).get('slip')!=='0'
  const elasticSections=new URLSearchParams(location.search).get('elastic')==='1'
  const independentLayers=new URLSearchParams(location.search).get('layers')==='1'
  const contactEnvelope=new URLSearchParams(location.search).get('contactEnvelope')!=='0'
  const limitedTwist=new URLSearchParams(location.search).get('limitedTwist')==='1'
  const curveQuality={samples:0,maxRelativeLengthError:0,maxRootError:0,maxCurvature:0,maxEnergyPerWidth:0}
  const recordCurve=(chain:Chain)=>{if(!measureCurve)return;const m=curveMetrics(chain,material.rigidity);curveQuality.samples++;curveQuality.maxRelativeLengthError=Math.max(curveQuality.maxRelativeLengthError,m.relativeLengthError);curveQuality.maxRootError=Math.max(curveQuality.maxRootError,m.rootError);curveQuality.maxCurvature=Math.max(curveQuality.maxCurvature,m.maxCurvature);curveQuality.maxEnergyPerWidth=Math.max(curveQuality.maxEnergyPerWidth,m.bendingEnergy)}
  let readingIndex=Math.min(c.pageIndex,leafCount(c)),activeTurns:ActiveLeaf[]=[],dropMs=settledDropMs,stackKey='',refreshCount=0,stackPoseCount=0
  // The expensive binding integral depends on stack depth/compression, not
  // on the changing turn angle. Cache within this book, with a hard bound.
  const chainCache=new Map<string,Chain>()
  const cachedLayer=(depth:number,compression:number,sign:1|-1=1)=>{const key=[depth,compression,sign].join(':');const cached=chainCache.get(key);if(cached){chainCache.delete(key);chainCache.set(key,cached);return cached}const chain=boundLayer(pageWidth,depth,compression,sign);if(chainCache.size>=128)chainCache.delete(chainCache.keys().next().value!);chainCache.set(key,chain);return chain}
  let leftLayers:Chain[]=[],rightLayers:Chain[]=[],leftCompression=0,rightCompression=0,leftDepthNow=0,rightDepthNow=0,leftCount=0,rightCount=0
  let trialLift=0,correctionKey=''
  const refreshPages=()=>{
    refreshCount++;const count=leafCount(current),direction=activeTurns[0]?.direction??1
    const block=(activeTurns[0]?.span??1)>1,layout=batchLayout(readingIndex,count,pageDepth,direction,activeSpan(activeTurns),block),leftDepth=layout.left,rightDepth=layout.right
    const base=-coverZ+t/2,offset=Math.min(.002,layout.unit*.15),clearance=Math.min(.001,layout.unit*.1),pitch=current.thicknessMode==='automatic'?layout.unit:undefined
    lower.visible=rightDepth>.0001;lower.position.z=base+rightDepth/2
    upper.visible=leftDepth>.0001;upper.position.z=-t/2-leftDepth/2
    leftDepthNow=leftDepth;rightDepthNow=rightDepth;leftCount=Math.round(leftDepth/layout.unit);rightCount=Math.round(rightDepth/layout.unit)
    const open=easeTurn(clamp01((last-90)/90)),leftDrop=gravityDrop(dropMs,0,Math.max(1,Math.min(6,leftCount))),rightDrop=gravityDrop(dropMs,0,Math.max(1,Math.min(6,rightCount)))
    leftCompression=bindingCompression(open*leftDrop,current.pageCoupling,pageWidth,pageDepth)
    rightCompression=bindingCompression(open*rightDrop,current.pageCoupling,pageWidth,pageDepth)
    const key=[leftDepth,rightDepth,leftCompression,rightCompression,pitch].join(':')
    if(key!==stackKey){
      stackPoseCount++;stackKey=key;leftLayers=[0,.25,.5,.75,1].map(f=>cachedLayer(leftDepth*f,leftCompression));rightLayers=[0,.25,.5,.75,1].map(f=>cachedLayer(rightDepth*f,rightCompression))
      lowerShape.pose(rightLayers,rightDepth,1,rightCompression,pitch);upperShape.pose(leftLayers,leftDepth,-1,leftCompression,pitch)
      poseSurface(pages.right.geometry,rightLayers[rightLayers.length-1],false);poseSurface(pages.left.geometry,leftLayers[leftLayers.length-1],true)
    }
    pages.right.position.z=base+bindingHeight(rightDepth,rightCompression)+offset
    pages.left.position.z=-t/2-bindingHeight(leftDepth,leftCompression)-offset
    // Fully open: both stationary stacks are height fields in root coordinates.
    const rightHeight=block&&last===180&&rightDepth>.0001?stackHeightSampler(rightLayers[rightLayers.length-1],-w/2+gutterInset,base+bindingHeight(rightDepth,rightCompression),1):null
    const leftHeight=block&&last===180&&leftDepth>.0001?stackHeightSampler(leftLayers[leftLayers.length-1],pagePivot.position.x-gutterInset,pagePivot.position.z+t/2+bindingHeight(leftDepth,leftCompression),-1):null
    const active=activeTurns.slice(0,layout.active)
    pages.pose(readingIndex,count,active)
    active.forEach((turn,i)=>{
      const turnP=direction===1?turn.progress:1-turn.progress,depths=block?chunkDepths(layout):leafDepths(layout,direction,i)
      const from={x:-w/2+gutterInset,z:base+bindingHeight(depths.right,rightCompression)+offset}
      const lx=gutterInset,lz=-t/2-bindingHeight(depths.left,leftCompression)-offset,a=pagePivot.rotation.y
      const to={x:pagePivot.position.x+lx*Math.cos(a)+lz*Math.sin(a),z:pagePivot.position.z-lx*Math.sin(a)+lz*Math.cos(a)}
      const anchor=anchorBetween(from,to,turnP)
      const right=cachedLayer(depths.right,rightCompression),left=cachedLayer(depths.left,leftCompression,-1)
      const preserveArc=current.paperPhysics==='material',feedbackLift=trialLift*turnCorrectionEnvelope(turnP),flex=Math.min(1,current.pageCurl*material.flex)
      if(block){
        const lift=(turn.chunkLift??0)*Math.min(pageWidth*.075,layout.moving*.5+pageWidth*.018)+feedbackLift
        const withLift=(p:number)=>liftChunkChain(turningChain(pageWidth,p,flex,right,left,readingIndex/count),lift,p,preserveArc)
        const row=turn.chunkGesture&&turn.progress>0&&turn.progress<.5?(u:number)=>withLift(T.MathUtils.lerp(turnP,chunkRowProgress(turn.progress,u,direction,turn.grip),limitedTwist&&preserveArc ? .5 : 1)):undefined
        const weight=chunkEndpointWeight(turnP)*(1-Math.min(1,turn.chunkLift??0))
        const layers=weight>0?[0,.5,1].map(q=>{
          const dr=layout.right+layout.moving*q,dl=layout.left+layout.moving*(1-q)
          const layerFrom={x:from.x,z:base+bindingHeight(dr,rightCompression)+offset},layerLz=-t/2-bindingHeight(dl,leftCompression)-offset
          const layerTo={x:pagePivot.position.x+lx*Math.cos(a)+layerLz*Math.sin(a),z:pagePivot.position.z-lx*Math.sin(a)+layerLz*Math.cos(a)}
          const at=anchorBetween(layerFrom,layerTo,turnP)
          return {chain:liftChunkChain(turningChain(pageWidth,turnP,flex,cachedLayer(dr,rightCompression),cachedLayer(dl,leftCompression,-1),readingIndex/count),lift,turnP,preserveArc),x:at.x-anchor.x,z:at.z-anchor.z}
        }):undefined
        const center=withLift(turnP);recordCurve(center);pages.chunkShape.pose(center,layout.moving,row,layers,weight,turn.handoffCurl===undefined?undefined:{direction,progress:turnP,curl:materialCurlAmount(turn.handoffCurl,material.flex,preserveArc),grip:turn.grip??0,grabU:turn.grabU??1},last===180?base+clearance-anchor.z:-Infinity,last===180?x=>Math.max(rightHeight?.(x+anchor.x)??-Infinity,leftHeight?.(x+anchor.x)??-Infinity)+clearance-anchor.z:undefined,pitch,preserveArc&&enableSlip,elasticSections,independentLayers,contactEnvelope);pages.chunk.position.set(anchor.x,0,anchor.z);pages.chunk.rotation.y=turnP*(pagePivot.rotation.y+Math.PI)
      }
      else {const slot=pages.slots[i],leaf=slot.leaf;// Fully open boards are coplanar, and the active leaf basis has no Y rotation.
        // Keep the deformed surface above their inner face; shader and CPU picker share this floor.
        const chain=liftChunkChain(turningChain(pageWidth,turnP,flex,right,left,readingIndex/count),feedbackLift,turnP,preserveArc),floor=last===180?base+clearance-anchor.z:-1e6;recordCurve(chain);slot.gpu.update(turnP,flex,materialCurlAmount(turn.curlAmount??0,material.flex,preserveArc),turn.grip??0,turn.grabU??1,chain,floor,preserveArc);leaf.position.set(anchor.x,0,anchor.z);leaf.rotation.y=turnP*(pagePivot.rotation.y+Math.PI)}
    })
  }
  const setReading=(index:number,turns:ActiveLeaf[])=>{const next=Math.min(leafCount(current),Math.max(0,index)),changed=next!==readingIndex;const key=[next,...turns.map(t=>[t.direction,t.span??1].join(':'))].join('|');if(key!==correctionKey||!turns.length)trialLift=0;correctionKey=key;readingIndex=next;activeTurns=turns;if(changed&&last>0&&last<180){const angle=last;last=-1;setOpening(angle)}else refreshPages()}
  const setDrop=(elapsed:number)=>{const next=Math.min(settledDropMs,Math.max(0,elapsed));if(dropMs!==next){dropMs=next;refreshPages()}}
  const setOpening=(deg:number)=>{
    if(deg===last)return
    last=deg
    if(deg!==180)trialLift=0
    const pose=openingPose(deg,current.coverFlex,current.pageCoupling)
    hinge.rotation.y=pose.hinge
    const flatten=easeTurn(clamp01((deg-85)/95));const pageAngle=coupledPageAngle(pose.hinge,pose.hinge*(.65+.35*flatten)+pose.page*(1-flatten)*.15,pageWidth,pageDepth)
    const nominal=coverZ*(1-2*flatten),leftDepth=pageDepth*readingIndex/Math.max(1,leafCount(current))
    hinge.position.z=safeHingeZ(nominal,-coverZ+t/2,pageDepth-leftDepth,leftDepth,w,pageWidth,gutterInset,t,pose.hinge,pageAngle)
    pagePivot.position.copy(hinge.position);pagePivot.rotation.y=pageAngle
    const bindingPose={hingeX:hinge.position.x,rearZ:-coverZ,frontZ:hinge.position.z,angle:hinge.rotation.y,board:t,inset,rounded:current.spineStyle==='rounded'}
    outerBinding.pose(bindingPose);innerBindingShape.pose(bindingPose)
    // The lining is an interior component, not a second exterior spine.
    // At small openings it is enclosed by the covers and paper block.
    innerBinding.visible=deg>=35
    const frontAngles=coverBoneAngles(supportedCoverFlex(pose.bone*(BONE_COUNT-1),pageWidth,leftDepth))
    // Skinning can protrude the inner face near the sewn root even during
    // outward bending. Keep the supported rear board planar, with a smooth
    // transition as the final leaves leave it. Preserve the block thickness.
    const rearAngles=coverBoneAngles(supportedCoverFlex(-pose.bone*(BONE_COUNT-1)*.25,pageWidth,pageDepth-leftDepth)*(1-T.MathUtils.smoothstep(pageDepth-leftDepth,0,.002)))
    rig.bones.forEach((bone,i)=>{bone.rotation.y=frontAngles[i]});rearRig.bones.forEach((bone,i)=>{bone.rotation.y=rearAngles[i]})
    refreshPages();root.updateMatrixWorld(true);for(const cover of [rig.mesh,back]){cover.computeBoundingSphere();cover.computeBoundingBox()}
  }
  setOpening(0)
  const updateAppearance=(next:BookConfig)=>{
    const previous=current;current=next;material=paperMaterial(next);pages.update(next);readingIndex=Math.min(readingIndex,leafCount(next))
    const physicalChanged=physicalBook(previous).thickness!==physicalBook(next).thickness
    if(physicalChanged){pageDepth=physicalBook(next).core/100;coverZ=(pageDepth+t)/2;back.position.z=-coverZ;chainCache.clear();stackKey='';const angle=last;last=-1;setOpening(angle)}
    if(!physicalChanged&&(previous.coverFlex!==next.coverFlex||previous.pageCoupling!==next.pageCoupling||leafCount(previous)!==leafCount(next))){const angle=last;last=-1;setOpening(angle)}
    const keys=['coverColor','inkColor','title','subtitle','author','finish'] as const
    const common=keys.some(k=>previous[k]!==next[k])
    for(const [face,mat] of [['cover',front],['back',rear],['spine',spineFace]] as const){
      const fields=([face+'Image',face+'Zoom',face+'X',face+'Y',face+'Text'] as (keyof BookConfig)[])
      if(common||face==='spine'&&physicalChanged&&Math.max(64,Math.round(1024*physicalBook(previous).thickness/previous.height))!==Math.max(64,Math.round(1024*physicalBook(next).thickness/next.height))||fields.some(k=>previous[k]!==next[k])){if(mat.map){mat.map.userData.disposed=true;mat.map.dispose()}mat.map=cover(next,face);mat.map.userData.invalidate=invalidate;mat.needsUpdate=true}
    }
    if(previous.finish!==next.finish){const old=board.bumpMap;const nextBump=next.finish==='cloth'?bump():null;for(const m of [board,front,rear,spineFace]){m.bumpMap=nextBump;m.bumpScale=nextBump ? .006:0;m.clearcoat=next.finish==='gloss'?.85:0;m.needsUpdate=true}old?.dispose()}
    board.color.set(next.coverColor);for(const m of [board,front,rear,spineFace])m.roughness=next.roughness
    if(previous.paperColor!==next.paperColor){inside.color.set(next.paperColor);lining.color.set(next.paperColor);for(const [mat,vertical] of [[edgeV,true],[edgeH,false]] as const){mat.map?.dispose();mat.map=paperEdgeTexture(next.paperColor,vertical);mat.needsUpdate=true}}
  }
  // A fixed approximate envelope for all fully-open page/chunk poses.
  // Arc length bounds the horizontal/vertical turn radius; allow for the
  // thick block normal offset, lift and local corner roll. No scene mutation.
  function motionFramePoints(){
    const points:T.Vector3[]=[],anchor=-w/2+gutterInset,base=-coverZ+t/2
    const halfH=pageHeight/2+Math.min(pageWidth*.12,pageHeight*.07)
    // The moving block's center cannot sit at the top of the entire stack
    // while also carrying half the stack thickness outside that stack.
    // Couple center depth and moving thickness instead of double-counting.
    for(const depth of [0,pageDepth]){const radius=pageWidth*1.075+depth/2;for(let i=0;i<=32;i++){const a=Math.PI*i/32;for(const z of [base+depth/2,base+pageDepth-depth/2])for(const y of [-halfH,halfH])points.push(root.localToWorld(new T.Vector3(anchor+radius*Math.cos(a),y,z+radius*Math.sin(a))))}}
    return points
  }
  // Diagnostic only: actual deformed active geometry (CPU proxy for GPU
  // leaves, full chunk AABB corners). Not a triangle collision proof.
  const surfaceQuality={leaf:surfaceSummary(),chunk:surfaceSummary(),handoff:surfaceSummary(),handoffSupport:surfaceSummary()}
  function resetSurfaceQuality(){for(const key of Object.keys(surfaceQuality) as (keyof typeof surfaceQuality)[])surfaceQuality[key]=surfaceSummary()}
  function measureActiveSurfaces(){
    for(const [i,turn] of activeTurns.entries()){
      if((turn.span??1)>1){if(!pages.chunk.visible)continue;for(const face of [4,5])accumulateSurface(surfaceQuality.chunk,measureSurface(pages.chunk.geometry,pageWidth,pageHeight,face))
        for(const child of pages.chunk.children)if(child instanceof T.Mesh&&child.visible){accumulateSurface(surfaceQuality.handoff,measureSurface(child.geometry,pageWidth,pageHeight));accumulateSurface(surfaceQuality.handoffSupport,measureSurface(pages.chunk.geometry,pageWidth,pageHeight,turn.direction===1?4:5))}
      }else{const slot=pages.slots[i];if(slot?.leaf.visible)accumulateSurface(surfaceQuality.leaf,measureSurface(slot.gpu.pickMesh().geometry,pageWidth,pageHeight))}
    }
    return surfaceQuality
  }
  function activeFramePoints(){
    const points:T.Vector3[]=[]
    for(const [i,turn] of activeTurns.entries()){
      if((turn.span??1)>1){const mesh=pages.chunk;if(!mesh.visible)continue;for(const m of [mesh,...mesh.children]){if(!(m instanceof T.Mesh)||!m.visible)continue;const box=m.geometry.boundingBox;if(!box)continue;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(m.localToWorld(new T.Vector3(x,y,z)))}
      }else{const slot=pages.slots[i];if(!slot?.leaf.visible)continue;for(let u=0;u<=16;u++)for(const v of [-.5,0,.5])points.push(slot.leaf.localToWorld(slot.gpu.pickPoint(u/16,v)))}
    }return points
  }
  // Optional diagnostic: intersect selected deformed page segments with the
  // actual cover/stack meshes using Three's world-space raycaster. Sample
  // both directions to include back-face hits. Not a complete triangle test.
  function meshCollisionSample(dense=false){
    root.updateMatrixWorld(true);rig.skeleton.update();rearRig.skeleton.update()
    const obstacles=[back,rig.mesh,lower,upper,...(dense?[spine,innerBinding]:[])].filter(m=>m.visible),ray=new T.Raycaster(),epsilon=.0008
    let segments=0,hits=0;const byMesh:Record<string,number>={},examples:{source:string;target:string;progress:number;direction:number;point:number[]}[]=[];let source='leaf',progress=0,direction=1
    const scan=(a:T.Vector3,b:T.Vector3)=>{const dir=b.clone().sub(a),length=dir.length();if(length<=2*epsilon)return;segments++;dir.divideScalar(length);ray.near=epsilon;ray.far=length-epsilon;const found=new Set<string>();for(const [point,sign] of [[a,1],[b,-1]] as const){ray.set(point,dir.clone().multiplyScalar(sign));for(const hit of ray.intersectObjects(obstacles,false)){found.add(hit.object.name);if(dense&&examples.length<12)examples.push({source,target:hit.object.name,progress,direction,point:root.worldToLocal(hit.point.clone()).toArray()})}}for(const name of found){hits++;byMesh[name]=(byMesh[name]??0)+1}}
    for(const [i,turn] of activeTurns.entries()){
      progress=turn.progress;direction=turn.direction;source='leaf';if((turn.span??1)>1){const m=pages.chunk;if(!m.visible)continue;for(const mesh of [m,...(dense?m.children.filter((c):c is T.Mesh=>c instanceof T.Mesh&&c.visible):[])]){source=mesh===m?'chunk':'handoff';const g=mesh.geometry,pos=g.getAttribute('position'),idx=g.index;if(!idx)continue;const groups=g.groups.length?g.groups:[{start:0,count:idx.count,materialIndex:4}];for(const group of groups){if(!dense&&group.materialIndex!==4&&group.materialIndex!==5)continue;for(let k=group.start;k+2<group.start+group.count;k+=dense?24:48){const a=mesh.localToWorld(new T.Vector3().fromBufferAttribute(pos,idx.getX(k))),b=mesh.localToWorld(new T.Vector3().fromBufferAttribute(pos,idx.getX(k+1)));scan(a,b);if(dense){const c=mesh.localToWorld(new T.Vector3().fromBufferAttribute(pos,idx.getX(k+2)));scan(b,c);scan(c,a)}}}}
      }else{const slot=pages.slots[i];if(!slot?.leaf.visible)continue;const rows=dense?9:3,cols=dense?32:16;let previous:T.Vector3[]=[];for(let r=0;r<rows;r++){const v=-.4+.8*r/(rows-1),row:T.Vector3[]=[];for(let j=1;j<=cols;j++){const b=slot.leaf.localToWorld(slot.gpu.pickPoint(j/cols,v));if(row.length)scan(row[row.length-1],b);if(dense&&previous.length){scan(previous[j-1],b);if(j>1)scan(previous[j-2],b)}row.push(b)}previous=row}}
    }return {segments,hits,byMesh,examples}
  }
  const contactCache=new ContactCache()
  function collectContactMeshes(){
    root.updateMatrixWorld(true);rig.skeleton.update();rearRig.skeleton.update()
    const inverse=root.matrixWorld.clone().invert(),meshes:{name:string;mesh:T.Mesh;active:boolean}[]=[]
    const add=(mesh:T.Mesh,name:string,active:boolean)=>{if(mesh.visible)meshes.push({name,mesh,active})}
    for(const mesh of [back,rig.mesh,lower,upper,spine,innerBinding])add(mesh,mesh.name,false)
    for(const [i,turn] of activeTurns.entries()){
      if((turn.span??1)>1){if(pages.chunk.visible){add(pages.chunk,'chunk',true);for(const child of pages.chunk.children)if(child instanceof T.Mesh)add(child,'handoff',true)}}
      else {const slot=pages.slots[i];if(slot?.leaf.visible){const proxy=slot.gpu.pickMesh();proxy.matrixWorld.copy(slot.leaf.matrixWorld);add(proxy,`leaf-${i}`,true)}}
    }
    return {inverse,meshes}
  }
  function captureContactMeshes(){const {inverse,meshes}=collectContactMeshes();return meshes.map(({name,mesh,active})=>({name,active,...contactCache.snapshot(mesh,inverse)}))}
  function triangleCollisionSample(){return {...scanMeshContacts(captureContactMeshes(),-w/2,gutterInset+bindingLip),cache:{builds:contactCache.builds,refits:contactCache.refits}}}
  function workerContactSnapshot():Omit<ContactRequest,'id'>{
    const {inverse,meshes:source}=collectContactMeshes()
    const meshes=source.map(({name,mesh,active})=>{
      const geometry=snapshotMesh(mesh,inverse)
      try{const p=geometry.getAttribute('position');return {name,active,positions:p.array as Float32Array,indices:geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:p.count},(_,i)=>i),groups:geometry.groups.map(g=>({...g}))}}
      finally{geometry.dispose()}
    })
    return {opening:last,index:readingIndex,meshes}
  }
  function solidCollisionSample(){
    const meshes=captureContactMeshes(),self=meshes.filter(m=>m.active&&m.tree).map(m=>({name:m.name,...selfContactProbe(m.geometry,m.tree!,2048)}))
    const containment=[]
    for(const a of meshes.filter(m=>/cover|page block|chunk/i.test(m.name)&&m.tree))for(const b of meshes.filter(m=>m.active||/cover|page block/i.test(m.name))){
      if(a===b||!a.geometry.boundingBox!.intersectsBox(b.geometry.boundingBox!))continue
      containment.push({outer:a.name,inner:b.name,...containmentProbe(a.geometry,a.tree!,b.geometry,64)})
    }
    return {opening:last,index:readingIndex,self,containment}
  }
  const compareSweeps=new URLSearchParams(location.search).get('sweepCompare')==='1',refineSweeps=new URLSearchParams(location.search).get('sweepRefine')==='1'
  let priorMotion:Map<string,MotionSnapshot>|null=null,priorMotionKey=''
  function resetSweptContacts(){priorMotion=null;priorMotionKey=''}
  function sweptCollisionSample(){
    const meshes=captureContactMeshes(),key=[readingIndex,...activeTurns.map(t=>[t.direction,t.span??1].join(':'))].join('|'),current=new Map<string,MotionSnapshot>()
    for(const m of meshes){const p=m.geometry.getAttribute('position');current.set(m.name,{positions:Float32Array.from(p.array),indices:m.geometry.index?Uint32Array.from(m.geometry.index.array):Uint32Array.from({length:p.count},(_,i)=>i),materials:Uint8Array.from({length:Math.floor((m.geometry.index?.count??p.count)/3)},(_,i)=>m.geometry.groups.find(g=>i*3>=g.start&&i*3<g.start+g.count)?.materialIndex??255)})}
    const previous=priorMotion;priorMotion=current;const stable=key===priorMotionKey;priorMotionKey=key
    const pairs:({a:string;b:string}&ReturnType<typeof scanSweptTrees>&{baseline?:ReturnType<typeof scanSweptTrees>;coarse?:ReturnType<typeof scanSweptTrees>})[]=[]
    if(!previous||!stable)return {reset:true,pairs}
    // Each temporal BVH is built at most once for this sample interval.
    // Raw swept hits include legitimate support contacts, not just defects.
    const trees=new Map<string,ReturnType<typeof prepareSweptMesh>>()
    const tree=(name:string)=>{if(!trees.has(name)){const old=previous.get(name);trees.set(name,old?prepareSweptMesh(old,current.get(name)!):null)}return trees.get(name)!}
    for(let i=0;i<meshes.length;i++)for(let j=i+1;j<meshes.length;j++){
      const a=meshes[i],b=meshes[j],support=/cover/i.test(a.name)&&/page block/i.test(b.name)||/cover/i.test(b.name)&&/page block/i.test(a.name)
      if(!a.active&&!b.active&&!support)continue
      const ta=tree(a.name),tb=tree(b.name),names:[string,string]=[a.name,b.name]
      pairs.push({a:a.name,b:b.name,...scanSweptTrees(ta,tb,64,names,true,refineSweeps?8:0),...(compareSweeps?{baseline:scanSweptTrees(ta,tb,64,names,false),...(refineSweeps?{coarse:scanSweptTrees(ta,tb,64,names)}:{})}:{})})
    }
    return {reset:false,pairs}
  }
  // Opt-in bounded geometry trials: compare exactly the same pose before/after.
  // Do not persist a worse candidate or alter the sewn anchor.
  function resolveTriangleContacts(){
    const previousLift=trialLift;trialLift=0;refreshPages();const before=triangleCollisionSample();let best=before,accepted=0
    const limit=Math.min(.012,pageWidth*.02),lift=last===180?contactCorrection(before.examples,-w/2,pageWidth,limit):0
    if(last===180&&(lift>0||previousLift>0)){
      for(const step of correctionCandidates(previousLift,lift,limit)){
        trialLift=step;refreshPages();const candidate=triangleCollisionSample()
        if(improvesContacts(best.counts,candidate.counts)||lift===0&&previousLift>0&&nonWorseningContacts(best.counts,candidate.counts)){best=candidate;accepted=step}
      }
      trialLift=accepted;refreshPages()
    }
    // During cover opening, trial reduced board curvature while leaving hinge and binding fixed.
    let coverAdjusted=false
    if(last>0&&last<180&&best.pairs.some(p=>/cover/i.test(p.a+' '+p.b)&&/page block/i.test(p.a+' '+p.b)&&p.counts.penetration>0)){
      const implicated=new Set(best.pairs.filter(p=>p.counts.penetration>0&&/page block/i.test(p.a+' '+p.b)).flatMap(p=>[p.a,p.b]))
      const bones=[...(implicated.has('Front cover')?rig.bones:[]),...(implicated.has('Back cover')?rearRig.bones:[])],angles=bones.map(b=>b.rotation.y);let factor=1
      for(const f of [.5,0]){bones.forEach((b,i)=>{b.rotation.y=angles[i]*f});const candidate=triangleCollisionSample();if(improvesContacts(best.counts,candidate.counts)){best=candidate;factor=f;coverAdjusted=true}}
      bones.forEach((b,i)=>{b.rotation.y=angles[i]*factor})
      root.updateMatrixWorld(true);for(const cover of [rig.mesh,back]){cover.computeBoundingSphere();cover.computeBoundingBox()}
    }
    return {before:before.counts,after:best.counts,previousLift,acceptedLift:accepted,coverAdjusted,sample:best}
  }
  function collisionSample(){
    // Three fixed height slices, 33 samples along each live leaf. The CPU
    // pickPoint follows the GPU deformation, including local corner roll.
    // Covers and chunks are NOT checked here; sample crossings are evidence,
    // not a proof of mesh-level collision freedom.
    let crossings=0,pairs=0
    root.updateMatrixWorld(true)
    for(const v of [-.4,0,.4]){
      const sections=activeTurns.flatMap((turn,i)=>{const slot=pages.slots[i];return turn.span&&turn.span>1||!slot?.leaf.visible?[]:[Array.from({length:33},(_,j)=>{const p=slot.leaf.localToWorld(slot.gpu.pickPoint(j/32,v));root.worldToLocal(p);return {x:p.x,z:p.z}})]})
      for(let i=0;i<sections.length;i++)for(let j=i+1;j<sections.length;j++){pairs++;crossings+=sectionCrossings(sections[i],sections[j])}
    }
    return {crossings,pairs,rows:3,samplesPerRow:33}
  }
  function activePickPoint(){const turn=activeTurns[0];if(!turn||turn.progress<.12||turn.progress>.88)return null
    if((turn.span??1)>1&&pages.chunk.visible){const mesh=pages.chunk,g=mesh.geometry,group=g.groups.find(x=>x.materialIndex===(turn.direction===1?4:5));if(!group||!g.index)return null;const pos=g.getAttribute('position'),offset=group.start+Math.floor(group.count/12)*6;const point=new T.Vector3();for(let i=0;i<3;i++)point.add(new T.Vector3().fromBufferAttribute(pos,g.index.getX(offset+i)));return mesh.localToWorld(point.multiplyScalar(1/3))}
    const slot=pages.slots[0];return slot?.leaf.visible?slot.leaf.localToWorld(slot.gpu.pickPoint(.75,0)):null
  }
  // Identical material coordinates on the last active leaf and the
  // destination stationary surface; use actual mesh world transforms.
  const handoffUV=[0,.25,.5,.75,1].flatMap(u=>[-.4,0,.4].map(v=>({u,v})))
  function activeHandoffPoints(){const s=pages.slots[0];return s?.leaf.visible?handoffUV.map(({u,v})=>s.leaf.localToWorld(s.gpu.pickPoint(u,v))):[]}
  function stationaryHandoffPoints(direction:1|-1){
    const left=direction===1,mesh=left?pages.left:pages.right,chain=(left?leftLayers:rightLayers).at(-1)!
    return handoffUV.map(({u,v})=>{const p=sampleChain(chain,u);return mesh.localToWorld(new T.Vector3(left?pageWidth/2-p.x:p.x-pageWidth/2,v*pageHeight,p.z))})
  }
  // Compare the visible outer face of a landed thick block against the
  // destination surface at identical material coordinates.
  const chunkUV=[0,.25,.5,.75,1].flatMap(u=>[0,.5,1].map(v=>({u,v})))
  function activeChunkHandoffPoints(direction:1|-1){
    const mesh=pages.chunk,g=mesh.geometry,face=direction===1?5:4,group=g.groups.find(x=>x.materialIndex===face)
    if(!mesh.visible||!group||!g.index)return []
    const uv=g.getAttribute('uv'),pos=g.getAttribute('position'),indices=new Set<number>()
    for(let i=group.start;i<group.start+group.count;i++)indices.add(g.index.getX(i))
    return chunkUV.map(({u,v})=>{
      const target=face===5?1-u:u
      let best=-1,error=Infinity
      for(const i of indices){const e=Math.abs(uv.getX(i)-target)+Math.abs(uv.getY(i)-v);if(e<error){best=i;error=e}}
      return mesh.localToWorld(new T.Vector3().fromBufferAttribute(pos,best))
    })
  }
  function stationaryChunkHandoffPoints(direction:1|-1){
    const left=direction===1,mesh=left?pages.left:pages.right,chain=(left?leftLayers:rightLayers).at(-1)!
    return chunkUV.map(({u,v})=>{const p=sampleChain(chain,u);return mesh.localToWorld(new T.Vector3(left?pageWidth/2-p.x:p.x-pageWidth/2,(v-.5)*pageHeight,p.z))})
  }
  function readingPickPoint(){const chain=rightLayers[rightLayers.length-1];if(!chain)return null;const s=sampleChain(chain,.85);return pages.right.localToWorld(new T.Vector3(s.x-pageWidth/2,0,s.z))}
  function groupPickCandidates(direction:1|-1){const right=direction===1,mesh=right?lower:upper,count=right?rightCount:leftCount;if(count<2||!mesh.visible)return [];return edgeTriangleCenters(mesh.geometry).map(v=>mesh.localToWorld(v))}

  function pickActive(ray:T.Raycaster){
    let best:{distance:number;direction:1|-1;grip:number;edge:number;progress:number;group:number;slot:number}|null=null
    const span=activeTurns[0]?.span??1
    if(span>1&&pages.chunk.visible){const hit=ray.intersectObject(pages.chunk,false)[0];if(hit?.uv)return {direction:activeTurns[0].direction,grip:hit.uv.y*2-1,edge:hit.uv.x,progress:activeTurns[0].progress,group:span,slot:0}}
    for(let i=0;i<activeTurns.length;i++){
      const a=activeTurns[i],slot=pages.slots[i]
      if(!slot?.leaf.visible||a.opening||a.progress<.025||a.progress>.975)continue
      const proxy=slot.gpu.pickMesh();proxy.matrixWorld.copy(slot.leaf.matrixWorld)
      const hit=ray.intersectObject(proxy,false)[0]
      if(hit?.uv&&(!best||hit.distance<best.distance))best={distance:hit.distance,direction:a.direction,grip:hit.uv.y*2-1,edge:hit.uv.x,progress:activeTurns[0].progress,group:activeSpan(activeTurns),slot:i}
    }
    return best
  }
  function pickGroup(ray:T.Raycaster){const hit=ray.intersectObjects([lower,upper,pages.left,pages.right,back,rig.mesh,spine,innerBinding].filter(m=>m.visible),false)[0];if(!hit||hit.object!==lower&&hit.object!==upper||![0,2,3].includes(hit.face?.materialIndex??-1))return null;const right=hit.object===lower,mesh=right?lower:upper,count=right?rightCount:leftCount,depth=right?rightDepthNow:leftDepthNow;if(count<2||depth<=0||!hit.face)return null;const point=mesh.worldToLocal(hit.point.clone()),fraction=pickedDepth(mesh.geometry,hit.face,point,right?1:-1);if(fraction===null)return null;const countPicked=groupCount(count,fraction);return countPicked>=2?{direction:right?1 as const:-1 as const,grip:point.y/pageHeight*2,edge:1,progress:0,group:countPicked}:null}
  return {root,hinge,collisionSample,meshCollisionSample,triangleCollisionSample,sweptCollisionSample,solidCollisionSample,workerContactSnapshot,resetSweptContacts,resolveTriangleContacts,resetSurfaceQuality,measureActiveSurfaces,activeFramePoints,motionFramePoints,readingFrameMeshes:[back,rig.mesh,lower,upper,pages.left,pages.right] as const,stackMetrics:()=>({configuredDepth:pageDepth,leftNominal:leftDepthNow,rightNominal:rightDepthNow,moving:Math.max(0,pageDepth-leftDepthNow-rightDepthNow),leaves:leafCount(current),left:stackSection(leftLayers,leftDepthNow,leftCompression,1).thickness,right:stackSection(rightLayers,rightDepthNow,rightCompression,1).thickness,leftRoot:bindingHeight(leftDepthNow,leftCompression),rightRoot:bindingHeight(rightDepthNow,rightCompression)}),curveQuality:()=>({...curveQuality}),geometryMetrics:()=>({refreshCount,stackPoseCount,chainCacheSize:chainCache.size,dropMs}),prepareChunk:pages.prepareChunk,prepareShaders:pages.prepareShaders,textureMetrics:pages.textureMetrics,cancelPreload:pages.cancelPreload,handoffVisible:()=>pages.chunk.visible&&pages.chunk.children.some(child=>child.name==='Chunk handoff leaf'&&child.visible),pickActive,pickGroup,activePickPoint,activeHandoffPoints,stationaryHandoffPoints,activeChunkHandoffPoints,stationaryChunkHandoffPoints,groupPickCandidates,readingPickPoint,setDrop,readingSurfaces:[pages.left,pages.right] as const,setOpening,setReading,updateAppearance,dispose:()=>{contactCache.dispose();pages.dispose();rig.skeleton.dispose();rearRig.skeleton.dispose();disposeTree(root)}}
}
export function disposeTree(root:T.Object3D){
  const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>(),maps=new Set<T.Texture>()
  root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}})
  for(const m of materials){for(const val of Object.values(m))if(val instanceof T.Texture)maps.add(val);m.dispose()}
  for(const t of maps){t.userData.disposed=true;t.dispose()}
  for(const g of geometries)g.dispose()
}
