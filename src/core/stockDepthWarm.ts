import * as T from 'three'

// Narrowly scoped to our opaque PCF caster materials, pinned Three r174.
// No actual object/material is modified; no render, geometry allocation or
// synchronous GPU wait. Keep the program reference until actual shadow draws.
export class StockDepthWarm {
 private materials:T.MeshDepthMaterial[]=[]
 prepare(renderer:T.WebGLRenderer,root:T.Object3D,scene:T.Scene,shadow:T.DirectionalLightShadow){
  this.dispose()
  if(renderer.shadowMap.type!==T.PCFShadowMap||!shadow.map||renderer.localClippingEnabled)return 0
  const variants=new Map<string,{mesh:T.Mesh;source:T.MeshStandardMaterial;side:T.Side}>()
  root.traverseVisible(o=>{
   if(!(o instanceof T.Mesh)||!o.castShadow||o.customDepthMaterial)return
   if((o as T.InstancedMesh).isInstancedMesh||(o as T.BatchedMesh).isBatchedMesh||Object.keys(o.geometry.morphAttributes).length)return
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    const source=m as T.MeshStandardMaterial
    if(!source.visible||source.alphaTest>0||source.alphaHash||source.alphaMap||source.displacementMap||source.wireframe||source.clipShadows||source.transparent)continue
    const side=source.shadowSide??(source.side===T.FrontSide?T.BackSide:source.side===T.BackSide?T.FrontSide:T.DoubleSide)
    const key=[!!(o as T.SkinnedMesh).isSkinnedMesh,side,source.map?.channel??'none'].join(':')
    if(!variants.has(key))variants.set(key,{mesh:o,source,side})
   }
  })
  const previous=renderer.getRenderTarget()
  try{
   renderer.setRenderTarget(shadow.map)
   for(const {mesh,source,side} of [...variants.values()].slice(0,8)){
    const material=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side,map:source.map??null})
    this.materials.push(material)
    const proxy=(mesh as T.SkinnedMesh).isSkinnedMesh?new T.SkinnedMesh(mesh.geometry,material):new T.Mesh(mesh.geometry,material)
    renderer.compile(proxy,shadow.camera,scene)
    material.map=null
   }
  }catch(e){this.dispose();throw e}
  finally{renderer.setRenderTarget(previous)}
  return this.materials.length
 }
 dispose(){for(const m of this.materials)m.dispose();this.materials=[]}
}
