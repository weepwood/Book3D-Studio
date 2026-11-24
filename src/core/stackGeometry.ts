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
 return {g,pose(layers:Chain[],depth:number,sign:1|-1){for(let i=0;i<p.count;i++){const x=original[i*3],y=original[i*3+1],z=original[i*3+2],level=Math.round((z+.5)*2),s=sampleChain(layers[sign===1?level:2-level],x/w+.5);p.setXYZ(i,s.x-w/2,y,z*depth+sign*s.z)}p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()}}
}
export function poseSurface(g:T.BufferGeometry,chain:Chain,flip:boolean){
 const uv=g.getAttribute('uv'),p=g.getAttribute('position')
 for(let i=0;i<p.count;i++){const s=sampleChain(chain,flip?1-uv.getX(i):uv.getX(i));p.setXYZ(i,flip?chain.width/2-s.x:s.x-chain.width/2,p.getY(i),s.z)}
 p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()
}

// Thick moving block: same curve as the visible active leaf, offset along
// its tangent normal at three depth layers. No per-leaf meshes are allocated.
export function createChunkGeometry(w:number,h:number){
 const g=new T.BoxGeometry(w,h,1,48,1,2),p=g.getAttribute('position'),original=Float32Array.from(p.array)
 return {g,pose(chain:Chain,depth:number){for(let i=0;i<p.count;i++){const a=sampleChain(chain,original[i*3]/w+.5),off=original[i*3+2]*depth;p.setXYZ(i,a.x-a.tz*off,original[i*3+1],a.z+a.tx*off)}p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()}}
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
