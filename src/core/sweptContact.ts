import {Box3,Triangle,Vector3} from 'three'
import {triangleContact} from './triangleContact'
import {isSupportPair} from './meshContacts'
export type SweptResult='clear'|'hit'|'uncertain'
const at=(a:Triangle,b:Triangle,t:number)=>new Triangle(a.a.clone().lerp(b.a,t),a.b.clone().lerp(b.b,t),a.c.clone().lerp(b.c,t))
const bounds=(a:Triangle,b:Triangle)=>new Box3().setFromPoints([a.a,a.b,a.c,b.a,b.b,b.c])
// Conservative interval subdivision for linear vertex trajectories. A clear
// result is a proof only for this interpolation, not for the nonlinear shader.
// Exhausting the depth budget is explicitly uncertain, never silently clear.
export function sweptTriangleContact(a0:Triangle,a1:Triangle,b0:Triangle,b1:Triangle,depth=8,eps=1e-6):SweptResult{
 const visit=(a:Triangle,c:Triangle,b:Triangle,d:Triangle,n:number):SweptResult=>{
  if(!bounds(a,c).expandByScalar(eps).intersectsBox(bounds(b,d)))return 'clear'
  const mid=at(a,c,.5),other=at(b,d,.5)
  if([triangleContact(a,b,eps),triangleContact(mid,other,eps),triangleContact(c,d,eps)].some(k=>k==='penetration'||k==='coplanar'))return 'hit'
  if(n<=0)return 'uncertain'
  const left=visit(a,mid,b,other,n-1);if(left==='hit')return left
  const right=visit(mid,c,other,d,n-1);return right==='hit'?'hit':left==='clear'&&right==='clear'?'clear':'uncertain'
 }
 return visit(a0,a1,b0,b1,Math.max(0,Math.min(12,Math.floor(depth))))
}

type MovingFace={start:Triangle;end:Triangle;box:Box3;material:number}
type Node={box:Box3;faces?:MovingFace[];children?:[Node,Node]}
function makeTree(faces:MovingFace[]):Node{
 const box=new Box3();for(const face of faces)box.union(face.box)
 if(faces.length<=8)return {box,faces}
 const size=box.getSize(new Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z'
 faces.sort((a,b)=>a.box.min[axis]+a.box.max[axis]-b.box.min[axis]-b.box.max[axis]);const mid=faces.length>>1
 return {box,children:[makeTree(faces.slice(0,mid)),makeTree(faces.slice(mid))]}
}
export type MotionSnapshot={positions:Float32Array;indices:Uint32Array;materials?:Uint8Array}
// Topology must be identical across both captured poses. A mismatched or
// exhausted interval is reported separately and cannot certify clearance.
export function prepareSweptMesh(a:MotionSnapshot,b:MotionSnapshot):Node|null{
 if(a.positions.length!==b.positions.length||a.indices.length!==b.indices.length||!a.indices.every((v,i)=>v===b.indices[i]))return null
 const out:MovingFace[]=[];for(let i=0;i+2<a.indices.length;i+=3){const tri=(s:MotionSnapshot)=>new Triangle(...[0,1,2].map(j=>new Vector3().fromArray(s.positions,s.indices[i+j]*3)) as [Vector3,Vector3,Vector3]);const start=tri(a),end=tri(b);out.push({start,end,box:bounds(start,end),material:a.materials?.[i/3]??255})}return makeTree(out)
}
// A proven stationary relative configuration can be classified once. Do not
// exempt moving support faces merely because their endpoint normals match.
function commonTranslation(a:MovingFace,b:MovingFace,eps=1e-6){
 const delta=a.end.a.clone().sub(a.start.a)
 return [a,b].every(f=>['a','b','c'].every(key=>{const k=key as 'a'|'b'|'c';return f.end[k].clone().sub(f.start[k]).distanceTo(delta)<=eps}))
}
export function scanSweptTrees(a:Node|null,b:Node|null,budget=256,names:[string,string]=['','']){
 const result={tested:0,hits:0,uncertain:0,support:0,touch:0,complete:true,topologyChanged:false}
 if(!a||!b){result.complete=false;result.topologyChanged=true;return result}
 const visit=(a:Node,b:Node)=>{if(!result.complete||!a.box.clone().expandByScalar(1e-6).intersectsBox(b.box))return;if(a.children){for(const c of a.children)visit(c,b);return}if(b.children){for(const c of b.children)visit(a,c);return}for(const f of a.faces??[])for(const g of b.faces??[]){if(!f.box.clone().expandByScalar(1e-6).intersectsBox(g.box))continue;if(result.tested>=budget){result.complete=false;return}result.tested++;if(commonTranslation(f,g)){
 const kind=triangleContact(f.start,g.start,1e-6)
 if(kind==='touch'){result.touch++;continue}
 if(kind==='coplanar'&&isSupportPair(names[0],f.material,names[1],g.material)&&f.start.getNormal(new Vector3()).dot(g.start.getNormal(new Vector3()))<-.999){result.support++;continue}
 if(kind==='penetration'||kind==='coplanar')result.hits++;continue
 }const r=sweptTriangleContact(f.start,f.end,g.start,g.end,3);if(r==='hit')result.hits++;else if(r==='uncertain')result.uncertain++}}
 visit(a,b);return result
}
export function scanSweptMeshes(a0:MotionSnapshot,a1:MotionSnapshot,b0:MotionSnapshot,b1:MotionSnapshot,budget=256){return scanSweptTrees(prepareSweptMesh(a0,a1),prepareSweptMesh(b0,b1),budget)}
