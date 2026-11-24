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
