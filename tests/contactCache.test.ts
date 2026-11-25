import {expect,it} from 'vitest'
import {BufferGeometry,Float32BufferAttribute,Matrix4,Mesh,MeshBasicMaterial} from 'three'
import {ContactCache} from '../src/core/meshContacts'
it('rebuilds temporal contact topology when a handoff face replaces its index',()=>{
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0, 0,0,1,1,0,1,0,1,1],3))
 g.setIndex([0,1,2]);const mesh=new Mesh(g,new MeshBasicMaterial()),cache=new ContactCache(),identity=new Matrix4()
 const first=cache.snapshot(mesh,identity);expect(Array.from(first.geometry.index!.array)).toEqual([0,1,2])
 expect(cache.snapshot(mesh,identity)).toBe(first)
 g.setIndex([3,4,5]);const second=cache.snapshot(mesh,identity);expect(second).not.toBe(first);expect(Array.from(second.geometry.index!.array)).toEqual([3,4,5])
 g.index!.setX(0,0);g.index!.needsUpdate=true;expect(cache.snapshot(mesh,identity)).not.toBe(second)
 g.addGroup(0,3,4);expect(cache.snapshot(mesh,identity).geometry.groups[0].materialIndex).toBe(4)
 expect(cache.builds).toBe(4);expect(cache.refits).toBe(1);cache.dispose();g.dispose();mesh.material.dispose()
})
