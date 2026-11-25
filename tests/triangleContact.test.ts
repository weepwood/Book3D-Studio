import { expect,it } from 'vitest'
import { Triangle,Vector3 } from 'three'
import { triangleContact } from '../src/core/triangleContact'
const tri=(...p:number[][])=>new Triangle(...p.map(v=>new Vector3(...v)) as [Vector3,Vector3,Vector3])
const a=tri([0,0,0],[2,0,0],[0,2,0])
it('distinguishes crossing, coplanar overlap, shared edge and separation',()=>{
 expect(triangleContact(a,tri([.5,.5,-1],[.5,.5,1],[.5,1,0]))).toBe('penetration')
 expect(triangleContact(a,tri([.2,.2,0],[1,.2,0],[.2,1,0]))).toBe('coplanar')
 expect(triangleContact(a,tri([0,0,0],[2,0,0],[0,-2,0]))).toBe('touch')
 expect(triangleContact(a,tri([0,0,1],[2,0,1],[0,2,1]))).toBe('none')
})
import {scanMeshContacts,snapshotMesh} from '../src/core/meshContacts'
import {BufferGeometry,Float32BufferAttribute,Mesh,Matrix4} from 'three'
it('production BVH scans transformed meshes and reports penetration location',()=>{
 const mesh=(t:Triangle)=>new Mesh(new BufferGeometry().setAttribute('position',new Float32BufferAttribute([t.a,t.b,t.c].flatMap(v=>v.toArray()),3)))
 const x=mesh(a),y=mesh(tri([.5,.5,-1],[.5,.5,1],[.5,1,0]));x.updateMatrixWorld();y.updateMatrixWorld();const result=scanMeshContacts([{name:'cover',geometry:snapshotMesh(x,new Matrix4()),active:false},{name:'leaf',geometry:snapshotMesh(y,new Matrix4()),active:true}]);expect(result.counts.penetration).toBe(1);expect(result.examples[0].point[0]).toBeCloseTo(.5)
})
import {isSupportPair} from '../src/core/meshContacts'
it('recognizes only explicitly paired supporting faces',()=>{expect(isSupportPair('Back cover',4,'Unread page block',5)).toBe(true);expect(isSupportPair('Read page block',4,'Front cover',5)).toBe(true);expect(isSupportPair('Back cover',5,'Unread page block',5)).toBe(false);expect(isSupportPair('Read page block',4,'Unread page block',5)).toBe(false)})
it('handles reversed winding, coplanar disjoint faces, and degenerate triangles',()=>{expect(triangleContact(a,tri([.2,.2,0],[.2,1,0],[1,.2,0]))).toBe('coplanar');expect(triangleContact(a,tri([2,2,0],[3,2,0],[2,3,0]))).toBe('none');expect(triangleContact(a,tri([0,0,0],[0,0,0],[0,0,0]))).toBe('none')})
import {ContactCache} from '../src/core/meshContacts'
it('refits cached topology after motion and agrees with freshly built BVH',()=>{
 const make=(t:Triangle)=>new Mesh(new BufferGeometry().setAttribute('position',new Float32BufferAttribute([t.a,t.b,t.c].flatMap(v=>v.toArray()),3)))
 const x=make(a),y=make(tri([.5,.5,-1],[.5,.5,1],[.5,1,0])),cache=new ContactCache(),matrix=new Matrix4()
 const scan=()=>{x.updateMatrixWorld();y.updateMatrixWorld();return scanMeshContacts([{name:'cover',...cache.snapshot(x,matrix),active:false},{name:'leaf',...cache.snapshot(y,matrix),active:true}])}
 expect(scan().counts.penetration).toBe(1);y.position.x=5;expect(scan().counts.penetration).toBe(0);y.position.x=0;expect(scan().counts.penetration).toBe(1);expect(cache.builds).toBe(2);expect(cache.refits).toBe(4);cache.dispose()
})
