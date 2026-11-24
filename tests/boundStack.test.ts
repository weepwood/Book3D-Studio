import {describe,it,expect} from 'vitest'
import {boundLayer,boundLayers,bindingCompression,bindingHeight,createStackGeometry} from '../src/core/stackGeometry'
import {sampleChain} from '../src/core/pageChain'
describe('装订收拢与外缘厚度守恒',()=>{
 it('闭合无压缩，展开时装订侧降低且外缘恢复厚度',()=>{
  const d=.135,w=1.47,c=bindingCompression(1,.45),layers=boundLayers(w,d,c)
  expect(bindingCompression(0,1)).toBe(0);expect(bindingHeight(d,c)).toBeLessThan(d*.4)
  expect(sampleChain(layers[0],1).z).toBeCloseTo(0,5)
  expect(sampleChain(layers[2],1).z+bindingHeight(d,c)).toBeCloseTo(d,3)
  const g=createStackGeometry(w,2);g.pose(layers,d,1,c);expect(g.g.boundingBox!.max.z).toBeCloseTo(d/2,3);g.g.dispose()
 })
 it('左侧镜像、装订根节点和弧长保持',()=>{
  for(const d of [0,.05,.15,.27,.6]){
   const a=boundLayer(1.47,d,.7),b=boundLayer(1.47,d,.7,-1)
   expect(a.positions[0]).toBeCloseTo(0);expect(a.positions[1]).toBeCloseTo(0)
   let len=0;for(let i=1;i<33;i++){expect(a.positions[i*2]).toBeCloseTo(b.positions[i*2]);expect(a.positions[i*2+1]).toBeCloseTo(-b.positions[i*2+1]);len+=Math.hypot(a.positions[i*2]-a.positions[(i-1)*2],a.positions[i*2+1]-a.positions[(i-1)*2+1])}expect(len).toBeCloseTo(1.47,2)
  }
 })
})
