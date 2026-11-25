import {Box3,Triangle,Vector3} from 'three'
import {triangleContact} from './triangleContact'
import {isSupportPair} from './meshContacts'
export type SweptResult='clear'|'hit'|'uncertain'
const at=(a:Triangle,b:Triangle,t:number)=>new Triangle(a.a.clone().lerp(b.a,t),a.b.clone().lerp(b.b,t),a.c.clone().lerp(b.c,t))
const bounds=(a:Triangle,b:Triangle)=>new Box3().setFromPoints([a.a,a.b,a.c,b.a,b.b,b.c])
// Same inclusive test as expanded Box3.intersectsBox, without allocating
// a temporary box for every BVH node and candidate triangle pair.
function overlaps(a:Box3,b:Box3,eps:number){return a.max.x+eps>=b.min.x&&a.min.x-eps<=b.max.x&&a.max.y+eps>=b.min.y&&a.min.y-eps<=b.max.y&&a.max.z+eps>=b.min.z&&a.min.z-eps<=b.max.z}
// A fixed separating axis is valid for the entire linear interval when
// every endpoint projection is disjoint. Unlike a midpoint SAT result,
// this cannot miss an interior collision on the assumed trajectory.
function intervalSeparated(a:Triangle,c:Triangle,b:Triangle,d:Triangle,mid:Triangle,other:Triangle,eps:number){
 const av=[a.a,a.b,a.c,c.a,c.b,c.c],bv=[b.a,b.b,b.c,d.a,d.b,d.c]
 const axis=new Vector3()
 const separates=(v:Vector3)=>{
  const length=v.length();if(!Number.isFinite(length)||length<1e-12)return false
  let al=Infinity,ah=-Infinity,bl=Infinity,bh=-Infinity
  for(const p of av){const q=p.dot(v);al=Math.min(al,q);ah=Math.max(ah,q)}
  for(const p of bv){const q=p.dot(v);bl=Math.min(bl,q);bh=Math.max(bh,q)}
  // Include a scale-aware floating point margin in unnormalized units.
  const margin=eps*length+16*Number.EPSILON*Math.max(1,Math.abs(al),Math.abs(ah),Math.abs(bl),Math.abs(bh))
  return bl-ah>margin||al-bh>margin
 }
 const normalA=mid.getNormal(new Vector3()),normalB=other.getNormal(new Vector3())
 if(separates(normalA)||separates(normalB))return true
 const edges=(t:Triangle)=>[t.b.clone().sub(t.a),t.c.clone().sub(t.b),t.a.clone().sub(t.c)]
 const ae=edges(mid),be=edges(other)
 for(const e of ae)if(separates(axis.crossVectors(normalA,e)))return true
 for(const e of be)if(separates(axis.crossVectors(normalB,e)))return true
 for(const e of ae)for(const f of be)if(separates(axis.crossVectors(e,f)))return true
 return false
}
// Conservative interval subdivision for linear vertex trajectories. A clear
// result is a proof only for this interpolation, not for the nonlinear shader.
// Exhausting the depth budget is explicitly uncertain, never silently clear.
export function sweptTriangleContact(a0:Triangle,a1:Triangle,b0:Triangle,b1:Triangle,depth=8,eps=1e-6,projection=true):SweptResult{
 const visit=(a:Triangle,c:Triangle,b:Triangle,d:Triangle,n:number):SweptResult=>{
  if(!overlaps(bounds(a,c),bounds(b,d),eps))return 'clear'
  const mid=at(a,c,.5),other=at(b,d,.5)
  if([triangleContact(a,b,eps),triangleContact(mid,other,eps),triangleContact(c,d,eps)].some(k=>k==='penetration'||k==='coplanar'))return 'hit'
  if(projection&&intervalSeparated(a,c,b,d,mid,other,eps))return 'clear'
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
 if(a.positions.length!==b.positions.length||a.positions.length%3!==0||a.indices.length!==b.indices.length||a.indices.length%3!==0||!a.indices.length||!a.indices.every((v,i)=>v===b.indices[i]&&v<a.positions.length/3)||!a.positions.every(Number.isFinite)||!b.positions.every(Number.isFinite))return null
 if(!!a.materials!==!!b.materials||a.materials&&(a.materials.length!==a.indices.length/3||a.materials.length!==b.materials!.length||!a.materials.every((v,i)=>v===b.materials![i])))return null
 const out:MovingFace[]=[];for(let i=0;i+2<a.indices.length;i+=3){const tri=(s:MotionSnapshot)=>new Triangle(...[0,1,2].map(j=>new Vector3().fromArray(s.positions,s.indices[i+j]*3)) as [Vector3,Vector3,Vector3]);const start=tri(a),end=tri(b);out.push({start,end,box:bounds(start,end),material:a.materials?.[i/3]??255})}return makeTree(out)
}
// A proven stationary relative configuration can be classified once. Do not
// exempt moving support faces merely because their endpoint normals match.
function commonTranslation(a:MovingFace,b:MovingFace,eps=1e-10){
 const delta=a.end.a.clone().sub(a.start.a)
 return [a,b].every(f=>['a','b','c'].every(key=>{const k=key as 'a'|'b'|'c';return f.end[k].clone().sub(f.start[k]).distanceTo(delta)<=eps}))
}
export function scanSweptTrees(a:Node|null,b:Node|null,budget=256,names:[string,string]=['',''],projection=true,refinementBudget=0){
 const result={tested:0,hits:0,uncertain:0,support:0,touch:0,clear:0,complete:true,topologyChanged:false,refined:0,refinementClear:0,refinementHit:0}
 if(!a||!b){result.complete=false;result.topologyChanged=true;return result}
 const visit=(a:Node,b:Node)=>{if(!result.complete||!overlaps(a.box,b.box,1e-6))return;if(a.children){for(const c of a.children)visit(c,b);return}if(b.children){for(const c of b.children)visit(a,c);return}for(const f of a.faces??[])for(const g of b.faces??[]){if(!overlaps(f.box,g.box,1e-6))continue;if(result.tested>=budget){result.complete=false;return}result.tested++;if(commonTranslation(f,g)){
 const kind=triangleContact(f.start,g.start,1e-6)
 if(kind==='touch'){result.touch++;continue}
 if(kind==='coplanar'&&isSupportPair(names[0],f.material,names[1],g.material)&&f.start.getNormal(new Vector3()).dot(g.start.getNormal(new Vector3()))<-.999){result.support++;continue}
 if(kind==='penetration'||kind==='coplanar')result.hits++;else result.clear++;continue
 }let r=sweptTriangleContact(f.start,f.end,g.start,g.end,3,1e-6,projection)
 if(r==='uncertain'&&result.refined<Math.max(0,Math.min(16,Math.floor(refinementBudget)))){
  result.refined++
  r=sweptTriangleContact(f.start,f.end,g.start,g.end,6,1e-6,projection)
  if(r==='clear')result.refinementClear++;else if(r==='hit')result.refinementHit++
 }
 if(r==='hit')result.hits++;else if(r==='uncertain')result.uncertain++;else result.clear++}}
 visit(a,b);return result
}
export function scanSweptMeshes(a0:MotionSnapshot,a1:MotionSnapshot,b0:MotionSnapshot,b1:MotionSnapshot,budget=256){return scanSweptTrees(prepareSweptMesh(a0,a1),prepareSweptMesh(b0,b1),budget)}
