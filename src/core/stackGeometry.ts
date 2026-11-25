import * as T from 'three'
import {stackBend,stackSweep,offsetStackProfile,PRESS_STACK_PROFILE} from './stackProfile'
import {sampleChain,rollPoint,projectChainLength,type Chain} from './pageChain'
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
// Source 67291 integrates tangent angle, not interpolated Cartesian points.
// Endpoint profiles are exact; intermediate sheets conserve arc length.
export function turningChain(width:number,p:number,flex:number,right:Chain,left:Chain,split=.5):Chain{
 const t=clamp(p),n=33
 if(t===0)return right
 if(t===1)return {width,positions:Float64Array.from(left.positions,v=>-v),tangents:Float64Array.from(left.tangents,v=>-v)}
 const smooth=(v:number)=>{v=clamp(v);return v*v*(3-2*v)},edge=smooth(Math.min(t,1-t)*2),mix=smooth(t)
 const angle=t*Math.PI,live=(smooth((t-.03)/.87)-clamp(split))*clamp(flex)
 const sweep=stackSweep(.9),flop=-Math.tanh(8*live)*PRESS_STACK_PROFILE.curlFlop*Math.max(0,(Math.sin(angle)-.6)/.4)*clamp(flex)
 const nodeAngles=(chain:Chain)=>Array.from({length:n},(_,i)=>Math.atan2(chain.tangents[2*i+1],chain.tangents[2*i]))
 const ra=nodeAngles(right),la=nodeAngles(left)
 const at=(a:number[],u:number)=>{const k=clamp(u)*(n-1),i=Math.min(n-2,Math.floor(k)),q=k-i;return a[i]*(1-q)+a[i+1]*q}
 const theta=(u:number)=>angle+(1-edge)*(at(ra,u)*(1-mix)+at(la,u)*mix)+edge*(live*sweep*stackBend(u,PRESS_STACK_PROFILE.pageCurlFrontPower)+flop*u*u)
 const positions=offsetStackProfile(width,theta,0,n),tangents=new Float64Array(n*2)
 for(let i=0;i<n;i++){const a=theta(i/(n-1));tangents[i*2]=Math.cos(a);tangents[i*2+1]=Math.sin(a)}
 return {width,positions,tangents}
}
// Physical reference leaf pitch .0234 in page width 15.6; two alternating
// bands per repeated tile. Density stays stable when the split changes.
export function paperEdgeRepeat(width:number,depth:number,leafPitch?:number){return Math.max(0,depth)/(2*Math.max(1e-8,leafPitch??(.0234/15.6*width)))}
export function stackSection(layers:Chain[],depth:number,compression:number,u:number){
 const bottom=sampleChain(layers[0],u).z,top=depth*(1-clamp(compression))+sampleChain(layers[layers.length-1],u).z
 return {bottom,top,thickness:top-bottom}
}
// Every tessellated face repeats the same material column (and often row).
// Keep the exact Float32 source coordinates, not quantized approximations.
function materialColumns(original:Float32Array,width:number){
 const byX=new Map<number,number>(),u:number[]=[],indices=new Uint16Array(original.length/3)
 for(let i=0;i<indices.length;i++){const x=original[i*3];let column=byX.get(x);if(column===undefined){column=u.length;byX.set(x,column);u.push(x/width+.5)}indices[i]=column}
 return {u,indices}
}
export function createStackGeometry(w:number,h:number,depthSegments=2){
 const g=new T.BoxGeometry(w,h,1,48,1,depthSegments),p=g.getAttribute('position'),original=Float32Array.from(p.array),uv=g.getAttribute('uv'),originalUV=Float32Array.from(uv.array),normal=g.getAttribute('normal'),edgeAxis=Array.from({length:p.count},(_,i)=>Math.abs(normal.getX(i))>.5?1:Math.abs(normal.getY(i))>.5?2:0)
 // Original material depth coordinate survives all bending and compression.
 const depthCoord=new T.Float32BufferAttribute(Array.from({length:p.count},(_,i)=>original[i*3+2]+.5),1);g.setAttribute('paperDepth',depthCoord)
 const columns=materialColumns(original,w);let lastRepeat=NaN
 return {g,pose(layers:Chain[],depth:number,sign:1|-1,compression=0,leafPitch?:number){const samples=layers.map(chain=>columns.u.map(u=>sampleChain(chain,u)));for(let i=0;i<p.count;i++){const y=original[i*3+1],z=original[i*3+2],fraction=clamp(sign===1?z+.5:.5-z),layer=fraction*(layers.length-1),lo=Math.min(layers.length-2,Math.floor(layer)),q=layer-lo,col=columns.indices[i],a=samples[lo][col],b=samples[lo+1][col];p.setXYZ(i,T.MathUtils.lerp(a.x,b.x,q)-w/2,y,z*depth+sign*(T.MathUtils.lerp(a.z,b.z,q)-depth*clamp(compression)*fraction))}const repeat=paperEdgeRepeat(w,depth,leafPitch);if(repeat!==lastRepeat){lastRepeat=repeat;for(let i=0;i<p.count;i++){if(edgeAxis[i]===1)uv.setXY(i,originalUV[i*2]*repeat,originalUV[i*2+1]);else if(edgeAxis[i]===2)uv.setXY(i,originalUV[i*2],originalUV[i*2+1]*repeat)}uv.needsUpdate=true}p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()}}
}
// Interpolate the material depth on the actual hit triangle, not world Z.
export function pickedDepth(g:T.BufferGeometry,face:{a:number;b:number;c:number},point:T.Vector3,sign:1|-1){
 const pos=g.getAttribute('position'),depth=g.getAttribute('paperDepth');if(!depth)return null
 const a=new T.Vector3().fromBufferAttribute(pos,face.a),b=new T.Vector3().fromBufferAttribute(pos,face.b),c=new T.Vector3().fromBufferAttribute(pos,face.c),weights=T.Triangle.getBarycoord(point,a,b,c,new T.Vector3())
 if(!weights)return null
 const q=clamp(weights.x*depth.getX(face.a)+weights.y*depth.getX(face.b)+weights.z*depth.getX(face.c));return sign===1?1-q:q
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
export function chunkEndpointWeight(p:number){const t=clamp(Math.min(p,1-p)/.15);return 1-t*t*(3-2*t)}
// Independent world-space lift; zero at the sewing edge, smoothly applied
// across the first .2 of page width. Tangents track the displaced curve.
export function liftChunkChain(chain:Chain,lift:number,progress:number,preserveArc=false):Chain{
 if(lift===0)return chain
 const n=chain.positions.length/2,positions=chain.positions.slice(),tangents=chain.tangents.slice(),p=clamp(progress),sign=1-2*p*p*(3-2*p)
 for(let i=0;i<n;i++){const u=clamp(i/(n-1)/.2),z=lift*u*u*(3-2*u);positions[i*2]-=chain.tangents[i*2+1]*z*sign;positions[i*2+1]+=chain.tangents[i*2]*z*sign}
 for(let i=0;i<n;i++){const a=Math.max(0,i-1)*2,b=Math.min(n-1,i+1)*2,x=positions[b]-positions[a],z=positions[b+1]-positions[a+1],d=Math.hypot(x,z)||1;tangents[i*2]=x/d;tangents[i*2+1]=z/d}
 const lifted={width:chain.width,positions,tangents};return preserveArc?projectChainLength(lifted):lifted
}
// Height of the actual tessellated static block face in the open cover basis.
// Interpolation follows the 48-column mesh, including the shortened curved edge.
export function stackHeightSampler(chain:Chain,anchorX:number,anchorZ:number,sign:1|-1){
 const points=Array.from({length:49},(_,i)=>{const p=sampleChain(chain,i/48);return {x:anchorX+sign*p.x,z:anchorZ+p.z}});if(sign===-1)points.reverse()
 return (x:number)=>{if(x<points[0].x-.001||x>points[48].x+.001)return -Infinity;let lo=0,hi=48;while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].x<x)lo=mid;else hi=mid}const a=points[lo],b=points[hi];return T.MathUtils.lerp(a.z,b.z,clamp((x-a.x)/Math.max(1e-8,b.x-a.x)))}
}
export type ChunkLayer={chain:Chain;x:number;z:number}
export function createChunkGeometry(w:number,h:number){
 const g=new T.BoxGeometry(w,h,1,48,CHUNK_HEIGHT_SEGMENTS,2),p=g.getAttribute('position'),original=Float32Array.from(p.array),uv=g.getAttribute('uv'),baseUV=Float32Array.from(uv.array),normal=g.getAttribute('normal')
 const faceIndices=[4,5].map(face=>{const group=g.groups.find(x=>x.materialIndex===face)!;return Array.from(g.index!.array.slice(group.start,group.start+group.count))})
 const handoff=new T.BufferGeometry();handoff.setAttribute('position',new T.BufferAttribute(original.slice(),3));handoff.setAttribute('uv',new T.BufferAttribute(baseUV.slice(),2));handoff.setIndex(faceIndices[0]);let face=4
 const edgeAxis=Array.from({length:p.count},(_,i)=>Math.abs(normal.getX(i))>.5?1:Math.abs(normal.getY(i))>.5?2:0)
 const lifts=new Float64Array((CHUNK_HEIGHT_SEGMENTS+1)*49),liftKeys=Int32Array.from({length:p.count},(_,i)=>Math.round(clamp(original[i*3+1]/h+.5)*CHUNK_HEIGHT_SEGMENTS)*49+Math.round(clamp(original[i*3]/w+.5)*48));const handoffVertices=faceIndices.map(indices=>[...new Set(indices)]);const columns=materialColumns(original,w),rowIndices=Uint8Array.from({length:p.count},(_,i)=>Math.round(clamp(original[i*3+1]/h+.5)*CHUNK_HEIGHT_SEGMENTS));let lastRepeat=NaN
 return {g,handoff,pose(chain:Chain,depth:number,rowChain?:(heightFraction:number)=>Chain,layers?:ChunkLayer[],weight=0,overlay?:{direction:1|-1;progress:number;curl:number;grip:number;grabU:number},floor=-Infinity,clearance?:(x:number)=>number,leafPitch?:number){
   const rows=rowChain?Array.from({length:CHUNK_HEIGHT_SEGMENTS+1},(_,i)=>rowChain(i/CHUNK_HEIGHT_SEGMENTS)):null
   const samples=(rows??[chain]).map(c=>columns.u.map(u=>sampleChain(c,u))),layerSamples=layers?.map(l=>columns.u.map(u=>sampleChain(l.chain,u)))
   for(let i=0;i<p.count;i++){const y=original[i*3+1],row=rowIndices[i],col=columns.indices[i],a=samples[rows?row:0][col],off=original[i*3+2]*depth;let x=a.x-a.tz*off,z=a.z+a.tx*off;const layerIndex=Math.round((original[i*3+2]+.5)*2),layer=layers?.[layerIndex];if(layer){const p=layerSamples![layerIndex][col];x=T.MathUtils.lerp(x,p.x+layer.x,weight);z=T.MathUtils.lerp(z,p.z+layer.z,weight)}p.setXYZ(i,x,y,z)}
   // Translate complete material cross-sections rather than clipping only
   // the bottom vertices. Preserve local thickness while clearing the stack.
   if(clearance||Number.isFinite(floor)){lifts.fill(0);for(let i=0;i<p.count;i++){const k=liftKeys[i];lifts[k]=Math.max(lifts[k],Math.max(floor,clearance?.(p.getX(i))??-Infinity)-p.getZ(i))}for(let i=0;i<p.count;i++){const lift=lifts[liftKeys[i]];if(lift>0)p.setZ(i,p.getZ(i)+lift)}}
   const repeat=paperEdgeRepeat(w,depth,leafPitch);if(repeat!==lastRepeat){lastRepeat=repeat;for(let i=0;i<p.count;i++){if(edgeAxis[i]===1)uv.setXY(i,baseUV[i*2]*repeat,baseUV[i*2+1]);else if(edgeAxis[i]===2)uv.setXY(i,baseUV[i*2],baseUV[i*2+1]*repeat)}uv.needsUpdate=true}
   p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox()
   if(overlay){
     const side=overlay.direction===1?4:5,sign=overlay.direction
     if(face!==side){face=side;handoff.setIndex(faceIndices[face-4])}
     const hp=handoff.getAttribute('position');hp.array.set(p.array)
     // Overlay uses the same actual block face, including row twist and end
     // blending. Apply only local curl displacement, never extra thickness.
     for(const i of handoffVertices[side-4]){
       const y=original[i*3+1],col=columns.indices[i],u=columns.u[col],row=rowIndices[i],c=rows?.[row]??chain,a=samples[rows?row:0][col]
       const rolled=rollPoint(c,u,y/h,h,overlay.curl,overlay.grip,overlay.grabU,overlay.progress)
       hp.setXYZ(i,p.getX(i)+rolled[0]-a.x-sign*a.tz*.0003,rolled[1],Math.max(floor,clearance?.(p.getX(i)+rolled[0]-a.x-sign*a.tz*.0003)??-Infinity,p.getZ(i)+rolled[2]-a.z+sign*a.tx*.0003))
     }
     hp.needsUpdate=true;handoff.computeVertexNormals();handoff.computeBoundingSphere();handoff.computeBoundingBox()
   }
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
// Retain the reference front-loaded profile and reverse-end component,
// but relax the last part to a horizontal fore-edge contact in our cover basis.
// This is a local boundary adapter, not a measured source angle.
// Broaden the transition from the compressed gutter into the body of
// the stack. The monotone envelope still meets a horizontal fore-edge,
// and the existing integral solves the same physical rise/arc length.
export const bindingShape=(u:number)=>{const x=clamp(u),reference=Math.max(0,1-stackBend(x,PRESS_STACK_PROFILE.stackCurlFrontPower))*(1-x**4);return .72*reference+.28*(1-x)**2}
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
