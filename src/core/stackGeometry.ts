import * as T from 'three'
import {stackBend,stackSweep,offsetStackProfile,PRESS_STACK_PROFILE} from './stackProfile'
import {sampleChain,type Chain,makeChain} from './pageChain'
import {clamp} from './pagePhysics'
// The reference's page model is much larger. Fit its angular profile to our
// independent cover clearance before sampling; this is explicitly an adapter.
export function stackAngle(width:number,clearance:number,drop:number,open:number,coupling:number){
 const q=clamp(drop)*clamp(open),strength=q*q*(3-2*q)*clamp(coupling)
 return Math.min(stackSweep(.9)*strength,Math.atan2(Math.max(0,clearance),width))
}
export function surfaceChain(width:number,angle:number,offset=0):Chain{
 const n=33,fn=(u:number)=>angle*stackBend(u,PRESS_STACK_PROFILE.stackCurlFrontPower)
 const positions=offsetStackProfile(width,fn,offset,n),tangents=new Float64Array(n*2)
 // Rebase every layer at its own spine root, so the thickness coordinate
 // is shared exactly by the block, surface and active page.
 const x=positions[0],z=positions[1]
 for(let i=0;i<n;i++){positions[i*2]-=x;positions[i*2+1]-=z}
 for(let i=0;i<n;i++){const lo=Math.max(0,i-1),hi=Math.min(n-1,i+1),dx=positions[hi*2]-positions[lo*2],dz=positions[hi*2+1]-positions[lo*2+1],d=Math.hypot(dx,dz)||1;tangents[i*2]=dx/d;tangents[i*2+1]=dz/d}
 return {positions,tangents,width}
}
export function turningChain(width:number,p:number,flex:number,right:Chain,left:Chain):Chain{
 const t=clamp(p),base=makeChain(width,t,flex),edge=Math.min(t,1-t)*2,m=edge*edge*(3-2*edge),s=t*t*(3-2*t)
 // Endpoint continuity is exact. Between endpoints the reference-inspired
 // moving chain is blended with the two settled profiles.
 const angle=t*Math.PI,ca=Math.cos(angle),sa=Math.sin(angle)
 for(let i=0;i<33;i++){const j=i*2,x=right.positions[j]*(1-s)+left.positions[j]*s,z=right.positions[j+1]*(1-s)+left.positions[j+1]*s;const dx=right.tangents[j]*(1-s)+left.tangents[j]*s,dz=right.tangents[j+1]*(1-s)+left.tangents[j+1]*s
 // left is supplied in its cover-local, positive-X basis; rotate with the leaf.
 base.positions[j]=base.positions[j]*m+(x*ca-z*sa)*(1-m);base.positions[j+1]=base.positions[j+1]*m+(x*sa+z*ca)*(1-m)
 const tx=base.tangents[j]*m+(dx*ca-dz*sa)*(1-m),tz=base.tangents[j+1]*m+(dx*sa+dz*ca)*(1-m),d=Math.hypot(tx,tz)||1;base.tangents[j]=tx/d;base.tangents[j+1]=tz/d}
 return base
}
export function createStackGeometry(w:number,h:number){
 const g=new T.BoxGeometry(w,h,1,48,1,2),p=g.getAttribute('position'),original=Float32Array.from(p.array)
 return {g,pose(layers:Chain[],depth:number,sign:1|-1,compression=0){for(let i=0;i<p.count;i++){const x=original[i*3],y=original[i*3+1],z=original[i*3+2],level=Math.round((z+.5)*2),s=sampleChain(layers[sign===1?level:2-level],x/w+.5);p.setXYZ(i,s.x-w/2,y,z*depth+sign*(s.z-depth*clamp(compression)*(sign===1?level:2-level)/2))}p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()}}
}
export function poseSurface(g:T.BufferGeometry,chain:Chain,flip:boolean){
 const uv=g.getAttribute('uv'),p=g.getAttribute('position')
 for(let i=0;i<p.count;i++){const s=sampleChain(chain,flip?1-uv.getX(i):uv.getX(i));p.setXYZ(i,flip?chain.width/2-s.x:s.x-chain.width/2,p.getY(i),s.z)}
 p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()
}

// Thick moving block: same curve as the visible active leaf, offset along
// its tangent normal at three depth layers. No per-leaf meshes are allocated.
export const CHUNK_HEIGHT_SEGMENTS=12
// The reference's gesture block uses a height-dependent angle with a .42rad
// maximum lag that fades between progress .04 and .50. Our positive-X leaf
// basis maps the gesture side into the corresponding absolute page angle.
export function chunkRowProgress(progress:number,heightFraction:number,direction:1|-1,grip=0){
 const p=clamp(progress),u=clamp(heightFraction),row=grip<0?1-u:u,n=clamp((p-.04)/.46),smooth=n*n*(3-2*n),fall=row*row*(3-2*row)
 const lag=Math.min(p*Math.PI*(1-smooth)*fall,.42*fall),q=clamp(p-lag/Math.PI)
 return direction===1?q:1-q
}
export function createChunkGeometry(w:number,h:number){
 const g=new T.BoxGeometry(w,h,1,48,CHUNK_HEIGHT_SEGMENTS,2),p=g.getAttribute('position'),original=Float32Array.from(p.array)
 return {g,pose(chain:Chain,depth:number,rowChain?:(heightFraction:number)=>Chain){
   const rows=rowChain?Array.from({length:CHUNK_HEIGHT_SEGMENTS+1},(_,i)=>rowChain(i/CHUNK_HEIGHT_SEGMENTS)):null
   for(let i=0;i<p.count;i++){const y=original[i*3+1],row=Math.round(clamp(y/h+.5)*CHUNK_HEIGHT_SEGMENTS),a=sampleChain(rows?.[row]??chain,original[i*3]/w+.5),off=original[i*3+2]*depth;p.setXYZ(i,a.x-a.tz*off,y,a.z+a.tx*off)}p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()
 }}
}

// True triangle interior points, rather than analytic midpoints which can
// land on a shared triangle boundary or a hidden top face after deformation.
export function edgeTriangleCenters(g:T.BufferGeometry){
 const p=g.getAttribute('position'),idx=g.index,out:T.Vector3[]=[]
 if(!idx)return out
 for(const group of g.groups){if(![0,2,3].includes(group.materialIndex??-1))continue
   for(let i=group.start;i+2<group.start+group.count;i+=3){
     const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2)
     const v=new T.Vector3((p.getX(a)+p.getX(b)+p.getX(c))/3,(p.getY(a)+p.getY(b)+p.getY(c))/3,(p.getZ(a)+p.getZ(b)+p.getZ(c))/3)
     if(Math.abs(v.y)<1e-6||Math.abs(v.x)<1e-6||i%9===0)out.push(v)
   }
 }
 return out
}

// Independent model adaptation: bound spine compression and solve the root
// tangent from physical layer height; preserve arc length and outer clearance.
const ROOT_LIMIT=Math.PI*.47
const BINDING_STEPS=192
const bindingShape=(u:number)=>Math.max(0,1-stackBend(u,PRESS_STACK_PROFILE.stackCurlFrontPower))
const bindingMidpoints=Array.from({length:BINDING_STEPS},(_,i)=>bindingShape((i+.5)/BINDING_STEPS))
function riseFraction(angle:number){let sum=0;for(const u of bindingMidpoints)sum+=Math.sin(angle*u);return sum/BINDING_STEPS}
const maxRiseFraction=riseFraction(ROOT_LIMIT)
// Limit compression using the entire book depth (not the current split).
// This keeps root heights and moving/static leaf endpoints on the same scale.
export function bindingCompression(open:number,coupling:number,width=Infinity,totalDepth=0){
 const desired=clamp(open)*(.55+.35*clamp(coupling))
 return totalDepth>0?Math.min(desired,Math.max(0,width)*maxRiseFraction*.98/totalDepth):desired
}
export function boundLayer(width:number,depth:number,compression:number,sign:1|-1=1):Chain{
 const rise=Math.max(0,depth)*clamp(compression),n=33
 let lo=0,hi=ROOT_LIMIT
 if(rise>0)for(let i=0;i<22;i++){const m=(lo+hi)/2;if(width*riseFraction(m)<rise)lo=m;else hi=m}
 const a=rise>0?(lo+hi)/2:0,fn=(u:number)=>sign*a*bindingShape(u)
 const positions=offsetStackProfile(width,fn,0,n),tangents=new Float64Array(n*2)
 for(let i=0;i<n;i++){const t=fn(i/(n-1));tangents[i*2]=Math.cos(t);tangents[i*2+1]=Math.sin(t)}
 return {width,positions,tangents}
}
export function boundLayers(width:number,depth:number,compression:number){
 return [0,.5,1].map(f=>boundLayer(width,depth*f,compression))
}
export function bindingHeight(depth:number,compression:number){return depth*(1-clamp(compression))}
