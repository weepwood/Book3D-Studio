import {describe,it,expect} from 'vitest'
import * as T from 'three'
import {boardGeometry,bookDimensions,openingPose,skinWeights,skinnedBoard} from '../src/core/geometry'
import {parseConfig,defaults} from '../src/core/schema'

describe('参数化几何',()=>{
  it('最薄规格仍具有正书芯厚度',()=>{
    const d=bookDimensions(90,120,8,3,4)
    expect(d.pageDepth).toBeGreaterThan(0)
    expect(d.coverZ+d.t/2).toBeCloseTo(d.d/2)
    expect(d.pageWidth).toBeGreaterThan(0)
  })
  it('连续蒙皮权重归一化并且索引有效',()=>{
    for(let i=0;i<=200;i++){
      const {indices,weights}=skinWeights(i/200,1)
      expect(weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1)
      expect(indices.every(n=>n>=0&&n<5)).toBe(true)
      expect(weights.every(n=>n>=0&&n<=1)).toBe(true)
    }
    expect(skinWeights(0,1).weights[0]).toBe(1)
    expect(skinWeights(1,1).indices[0]).toBe(4)
  })
  it('关闭时保持无形变，联动不超过封面',()=>{
    expect(openingPose(0,1,1)).toEqual({hinge:-0,bone:-0,page:-0})
    for(let a=1;a<=150;a++){
      const pose=openingPose(a,1,1)
      expect(Math.abs(pose.page)).toBeLessThan(Math.abs(pose.hinge))
      expect(Math.abs(pose.bone)).toBeLessThan(.12)
    }
    expect(openingPose(120,0,0).bone).toBe(-0)
  })
  it('封面圆角保持有限位置、法线和UV',()=>{
    const g=boardGeometry(1.5,2.2,.025,.04)
    for(const n of ['position','normal','uv'])expect(Array.from(g.getAttribute(n).array).every(Number.isFinite)).toBe(true)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.x).toBeCloseTo(0)
    expect(g.boundingBox!.max.x).toBeCloseTo(1.5)
    expect(g.groups.length).toBe(6)
    g.dispose()
  })
  it('真实骨骼变形带动远端顶点',()=>{
    const m=new T.MeshStandardMaterial()
    const rig=skinnedBoard(1.5,2.2,.025,.012,Array(6).fill(m))
    const p=rig.mesh.geometry.getAttribute('position')
    let i=0;while(i<p.count&&p.getX(i)<1.49)i++
    expect(i).toBeLessThan(p.count)
    const before=rig.mesh.getVertexPosition(i,new T.Vector3())
    rig.bones[1].rotation.y=-.1;rig.mesh.updateMatrixWorld(true)
    const after=rig.mesh.getVertexPosition(i,new T.Vector3())
    expect(after.z).toBeGreaterThan(before.z+.05)
    rig.skeleton.dispose();rig.mesh.geometry.dispose();m.dispose()
  })
  it('旧配置兼容新属性并拒绝无效值',()=>{
    const {boardThickness,cornerRadius,pageInset,spineStyle,coverFlex,pageCoupling,...old}=defaults
    expect(parseConfig(old)).toEqual(defaults)
    expect(()=>parseConfig({...defaults,coverFlex:2})).toThrow()
    expect(()=>parseConfig({...defaults,spineStyle:'bad'})).toThrow()
  })
})
