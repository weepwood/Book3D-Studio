import * as T from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {triangleContact} from './triangleContact'
import {isBindingContact} from './contactCorrection'
// Snapshot actual CPU vertices (including skinning) into a common book-local frame.
export function snapshotMesh(mesh:T.Mesh,worldToBook:T.Matrix4){
 const source=mesh.geometry,position=source.getAttribute('position'),data=new Float32Array(position.count*3),v=new T.Vector3(),matrix=worldToBook.clone().multiply(mesh.matrixWorld)
 for(let i=0;i<position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(matrix);v.toArray(data,i*3)}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(data,3));if(source.index)geometry.setIndex(source.index.clone());for(const group of source.groups)geometry.addGroup(group.start,group.count,group.materialIndex);geometry.computeBoundingBox();return geometry
}
// Only opposed, explicitly paired board interior / block underside faces can
// represent a designed supporting contact. Other coplanar overlaps remain defects.
export function isSupportPair(a:string,fa:number|undefined,b:string,fb:number|undefined){
 if(/page block/.test(a)&&/cover/.test(b))return isSupportPair(b,fb,a,fa)
 return a==='Back cover'&&fa===4&&b==='Unread page block'&&fb===5||a==='Front cover'&&fa===5&&b==='Read page block'&&fb===4
}
export function scanMeshContacts(meshes:{name:string;geometry:T.BufferGeometry;active:boolean}[],rootX=0,bindingWidth=0){
 const trees=meshes.map(m=>({...m,tree:new MeshBVH(m.geometry,{indirect:true})})),identity=new T.Matrix4(),counts={touch:0,penetration:0,coplanar:0,binding:0,support:0},pairs=[] as {a:string;b:string;counts:typeof counts}[],examples=[] as {a:string;b:string;kind:string;point:number[]}[];let tested=0
 for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++){
 const a=trees[i],b=trees[j];if(!a.active&&!b.active&&!(/cover/i.test(a.name)&&/page block/i.test(b.name)||/cover/i.test(b.name)&&/page block/i.test(a.name)))continue;if(!a.geometry.boundingBox!.intersectsBox(b.geometry.boundingBox!))continue
 const local={touch:0,penetration:0,coplanar:0,binding:0,support:0};a.tree.bvhcast(b.tree,identity,{intersectsTriangles(t,u,i,j){tested++;const kind=triangleContact(t,u,1e-6);if(kind!=='none'){
 const line=new T.Line3();const hit=kind!=='coplanar'&&t.intersectsTriangle(u,line);const point=hit?line.getCenter(new T.Vector3()).toArray():null
 const face=(m:typeof a,id:number)=>m.geometry.groups.find(g=>id*3>=g.start&&id*3<g.start+g.count)?.materialIndex
 const support=kind==='coplanar'&&isSupportPair(a.name,face(a,(a.tree as MeshBVH & {resolveTriangleIndex(i:number):number}).resolveTriangleIndex(i)),b.name,face(b,(b.tree as MeshBVH & {resolveTriangleIndex(i:number):number}).resolveTriangleIndex(j)))&&t.getNormal(new T.Vector3()).dot(u.getNormal(new T.Vector3()))<-.999
 const category=support?'support':kind==='touch'&&point&&isBindingContact(a.name,b.name,point,rootX,bindingWidth)?'binding':kind
 counts[category]++;local[category]++;if(category==='penetration'&&point&&examples.length<64)examples.push({a:a.name,b:b.name,kind,point})
 }return false}});pairs.push({a:a.name,b:b.name,counts:local})
 }return {counts,tested,pairs,examples}
}
