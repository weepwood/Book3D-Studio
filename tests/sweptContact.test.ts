import {expect,it} from 'vitest'
import {Triangle,Vector3} from 'three'
import {sweptTriangleContact} from '../src/core/sweptContact'
const t=(x:number,z:number)=>new Triangle(new Vector3(x,0,z),new Vector3(x+2,0,z),new Vector3(x,2,z))
it('detects a thin sheet tunneling between disjoint endpoint samples',()=>{expect(sweptTriangleContact(t(0,-1),t(0,1),t(0,0),t(0,0))).toBe('hit')})
it('proves disjoint swept bounds and retains uncertainty for boundary-only overlap',()=>{expect(sweptTriangleContact(t(0,-1),t(0,1),t(5,0),t(5,0))).toBe('clear');expect(sweptTriangleContact(t(0,0),t(0,0),t(2,0),t(2,0),0)).toBe('uncertain')})
import {scanSweptMeshes,type MotionSnapshot} from '../src/core/sweptContact'
const snap=(x:number,z:number):MotionSnapshot=>({positions:new Float32Array([x,0,z,x+2,0,z,x,2,z]),indices:new Uint32Array([0,1,2])})
it('swept mesh traversal finds intermediate contacts and reports exhausted budgets',()=>{expect(scanSweptMeshes(snap(0,-1),snap(0,1),snap(0,0),snap(0,0))).toMatchObject({tested:1,hits:1,complete:true});expect(scanSweptMeshes(snap(0,-1),snap(0,1),snap(0,0),snap(0,0),0)).toMatchObject({tested:0,complete:false});expect(scanSweptMeshes(snap(0,-1),{...snap(0,1),indices:new Uint32Array([1,0,2])},snap(0,0),snap(0,0))).toMatchObject({topologyChanged:true,complete:false})})
import {prepareSweptMesh,scanSweptTrees} from '../src/core/sweptContact'
it('separates persistent opposing support faces from moving penetration candidates',()=>{
 const a={...snap(0,0),materials:new Uint8Array([4])},b={...snap(0,0),indices:new Uint32Array([0,2,1]),materials:new Uint8Array([5])}
 expect(scanSweptTrees(prepareSweptMesh(a,a),prepareSweptMesh(b,b),64,['Back cover','Unread page block'])).toMatchObject({support:1,hits:0,uncertain:0})
 expect(scanSweptTrees(prepareSweptMesh(a,a),prepareSweptMesh(b,b),64,['other','other'])).toMatchObject({support:0,hits:1})
})
