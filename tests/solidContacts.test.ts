import {expect,it} from 'vitest'
import {BoxGeometry,PlaneGeometry,BufferGeometry,Float32BufferAttribute} from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {weldedTopology,containmentProbe,selfContactProbe} from '../src/core/solidContacts'
const tree=(g:BufferGeometry)=>new MeshBVH(g,{indirect:true}) as MeshBVH & {resolveTriangleIndex(i:number):number}
it('recognizes closed welded boxes and rejects open sheets',()=>{
 const outer=new BoxGeometry(4,4,4),inner=new BoxGeometry(1,1,1),bvh=tree(outer)
 expect(weldedTopology(outer).closed).toBe(true)
 expect(containmentProbe(outer,bvh,inner)).toMatchObject({status:'inside',complete:true})
 inner.translate(8,0,0);expect(containmentProbe(outer,bvh,inner).status).toBe('outside')
 expect(containmentProbe(new PlaneGeometry(),tree(new PlaneGeometry()),inner).status).toBe('open')
})
it('detects nonadjacent self crossing without counting shared seams',()=>{
 const g=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,2,0,0,0,2,0,.5,.5,-1,.5,.5,1,.5,1,0],3))
 expect(selfContactProbe(g,tree(g))).toMatchObject({penetration:1,complete:true})
 const box=new BoxGeometry();expect(selfContactProbe(box,tree(box))).toMatchObject({penetration:0,coplanar:0})
})
