import * as T from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {triangleContact} from './triangleContact'
type IndexBVH=MeshBVH & {resolveTriangleIndex(i:number):number}
const eps=1e-6
// Weld coincident seam vertices for topology analysis only; never mutate render geometry.
export function weldedTopology(g:T.BufferGeometry){
 const p=g.getAttribute('position'),keys=new Map<string,number>(),ids:number[]=[],edges=new Map<string,{count:number;orientation:number}>()
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x/eps)).join(',');if(!keys.has(key))keys.set(key,keys.size);ids.push(keys.get(key)!)}
 const faces:number[][]=[];let degenerate=0
 for(let i=0;i+2<(g.index?.count??p.count);i+=3){const f=[0,1,2].map(j=>ids[g.index?.getX(i+j)??i+j]);faces.push(f);if(new Set(f).size!==3){degenerate++;continue}for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');const e=edges.get(key)??{count:0,orientation:0};e.count++;e.orientation+=a<b?1:-1;edges.set(key,e)}}
 return {faces,closed:faces.length>0&&degenerate===0&&[...edges.values()].every(e=>e.count===2&&e.orientation===0),degenerate}
}
export function pointInSolid(tree:MeshBVH,point:T.Vector3):'inside'|'outside'|'uncertain'{
 const closest=tree.closestPointToPoint(point)
 if(!closest||closest.distance<=eps)return 'uncertain'
 const directions=[[1,.371,.183],[.217,1,.539],[.431,.293,1]]
 const votes=directions.map(d=>{const hits=tree.raycast(new T.Ray(point,new T.Vector3(...d).normalize()),T.DoubleSide,eps).sort((a,b)=>a.distance-b.distance);let n=0,last=-Infinity;for(const h of hits){if(h.distance-last>eps)n++;last=h.distance}return n%2})
 return votes.every(v=>v===1)?'inside':votes.every(v=>v===0)?'outside':'uncertain'
}
export function containmentProbe(outer:T.BufferGeometry,tree:MeshBVH,inner:T.BufferGeometry,budget=64){
 if(!weldedTopology(outer).closed)return {status:'open' as const,tested:0,inside:0,uncertain:0,complete:false}
 const p=inner.getAttribute('position'),stride=Math.max(1,Math.ceil(p.count/Math.max(1,budget)));let tested=0,inside=0,uncertain=0
 for(let i=0;i<p.count;i+=stride){const state=pointInSolid(tree,new T.Vector3().fromBufferAttribute(p,i));tested++;if(state==='inside')inside++;else if(state==='uncertain')uncertain++}
 return {status:inside?'inside' as const:uncertain?'uncertain' as const:'outside' as const,tested,inside,uncertain,complete:stride===1}
}
// Adjacent faces share welded topological vertices and are excluded from
// this nonadjacent self-intersection probe. Adjacent foldovers remain untested.
export function selfContactProbe(g:T.BufferGeometry,tree:IndexBVH,budget=4096){
 const {faces}=weldedTopology(g);let tested=0,penetration=0,coplanar=0,complete=true
 tree.bvhcast(tree,new T.Matrix4(),{intersectsTriangles(a,b,i,j){
 const x=tree.resolveTriangleIndex(i),y=tree.resolveTriangleIndex(j)
 if(x>=y||faces[x].some(v=>faces[y].includes(v)))return false
 if(tested>=budget){complete=false;return true}
 tested++;const kind=triangleContact(a,b,eps);if(kind==='penetration')penetration++;else if(kind==='coplanar')coplanar++;return false
 }})
 return {tested,penetration,coplanar,complete}
}
