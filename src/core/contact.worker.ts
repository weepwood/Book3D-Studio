import * as T from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {containmentProbe,selfContactProbe} from './solidContacts'
import type {ContactRequest,ContactReply,ContactReport} from './contactWorkerProtocol'
const scope=self as unknown as {onmessage:((e:MessageEvent<ContactRequest>)=>void)|null;postMessage:(reply:ContactReply)=>void}
scope.onmessage=({data})=>{
 const started=performance.now(),geometries:T.BufferGeometry[]=[]
 try{
  const meshes=data.meshes.map(m=>{const geometry=new T.BufferGeometry();geometries.push(geometry);geometry.setAttribute('position',new T.BufferAttribute(m.positions,3));geometry.setIndex(new T.BufferAttribute(m.indices,1));for(const g of m.groups)geometry.addGroup(g.start,g.count,g.materialIndex);geometry.computeBoundingBox();return {...m,geometry,tree:new MeshBVH(geometry,{indirect:true}) as MeshBVH & {resolveTriangleIndex(i:number):number}}})
  const self=meshes.filter(m=>m.active).map(m=>({name:m.name,...selfContactProbe(m.geometry,m.tree,65536)})),containment:ContactReport['containment']=[]
  for(const a of meshes.filter(m=>/cover|page block|chunk/i.test(m.name)))for(const b of meshes.filter(m=>m.active||/cover|page block/i.test(m.name))){
   if(a===b||!a.geometry.boundingBox!.intersectsBox(b.geometry.boundingBox!))continue
   containment.push({outer:a.name,inner:b.name,...containmentProbe(a.geometry,a.tree,b.geometry,256)})
  }
  scope.postMessage({id:data.id,report:{opening:data.opening,index:data.index,self,containment,elapsedMs:performance.now()-started}})
 }catch(error){scope.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)})}
 finally{for(const g of geometries)g.dispose()}
}
