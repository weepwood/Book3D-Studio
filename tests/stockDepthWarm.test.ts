import {it,expect,vi} from 'vitest'
import * as T from 'three'
import {StockDepthWarm} from '../src/core/stockDepthWarm'

it('compiles unique opaque caster variants without mutating meshes, and releases owned materials',()=>{
 const geometry=new T.PlaneGeometry(1,1),texture=new T.Texture(),source=new T.MeshStandardMaterial({map:texture})
 const root=new T.Group(),scene=new T.Scene(),light=new T.DirectionalLight(),shadow=light.shadow
 shadow.map=new T.WebGLRenderTarget(64,64)
 const one=new T.Mesh(geometry,source),two=new T.Mesh(geometry,source),skin=new T.SkinnedMesh(geometry,source)
 for(const o of [one,two,skin]){o.castShadow=true;root.add(o)}
 const hidden=new T.Mesh(geometry,new T.MeshStandardMaterial({side:T.DoubleSide}));hidden.castShadow=true;hidden.visible=false;root.add(hidden)
 const alpha=new T.Mesh(geometry,new T.MeshStandardMaterial({alphaTest:.1}));alpha.castShadow=true;root.add(alpha)
 const materials:T.MeshDepthMaterial[]=[],disposed=vi.fn(),setTarget=vi.fn()
 const compile=vi.fn((o:T.Mesh)=>{const m=o.material as T.MeshDepthMaterial;expect(m.map).toBe(texture);expect(m.side).toBe(T.BackSide);expect(o.geometry).toBe(geometry);m.addEventListener('dispose',disposed);materials.push(m)})
 const renderer={shadowMap:{type:T.PCFShadowMap},localClippingEnabled:false,getRenderTarget:()=>null,setRenderTarget:setTarget,compile} as unknown as T.WebGLRenderer
 const warm=new StockDepthWarm()
 try{
  expect(warm.prepare(renderer,root,scene,shadow)).toBe(2);expect(compile).toHaveBeenCalledTimes(2)
  expect(source.map).toBe(texture);expect(source.side).toBe(T.FrontSide);expect(one.material).toBe(source)
  expect(materials.every(m=>m.map===null)).toBe(true)
  expect(setTarget.mock.calls).toEqual([[shadow.map],[null]])
  warm.dispose();warm.dispose();expect(disposed).toHaveBeenCalledTimes(2)
 }finally{warm.dispose();shadow.dispose();geometry.dispose();texture.dispose();source.dispose();hidden.material.dispose();alpha.material.dispose()}
})
it('does not compile without an allocated directional shadow target',()=>{
 const renderer={shadowMap:{type:T.PCFShadowMap},compile:vi.fn()} as unknown as T.WebGLRenderer
 expect(new StockDepthWarm().prepare(renderer,new T.Group(),new T.Scene(),new T.DirectionalLight().shadow)).toBe(0)
 expect(renderer.compile).not.toHaveBeenCalled()
})
