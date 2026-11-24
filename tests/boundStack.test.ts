import {describe,it,expect} from 'vitest'
import {boundLayer,boundLayers,bindingCompression,bindingHeight,createStackGeometry} from '../src/core/stackGeometry'
import {sampleChain} from '../src/core/pageChain'
import {bookDimensions} from '../src/core/geometry'
describe('装订收拢与外缘厚度守恒',()=>{
 it('合法尺寸极值、左右分配与活动叶均保持外缘高度',()=>{
  for(const w of [90,150,250])for(const thick of [8,32,80])for(const board of [.8,3])for(const inset of [1,4]){
   const d=bookDimensions(w,120,thick,board,inset),c=bindingCompression(1,1,d.pageWidth,d.pageDepth)
   expect(c).toBeGreaterThan(0);expect(c).toBeLessThanOrEqual(.9+1e-10)
   for(const ratio of [0,.25,.5,.75,1]){const h=d.pageDepth*ratio,a=boundLayer(d.pageWidth,h,c),z=bindingHeight(h,c);expect(sampleChain(a,1).z+z).toBeCloseTo(h,4);expect(sampleChain(a,0).z+z).toBeCloseTo(z,8);expect(Array.from(a.positions).every(Number.isFinite)).toBe(true)}
   const layers=boundLayers(d.pageWidth,d.pageDepth,c);for(let i=0;i<=32;i++){const u=i/32,mid=bindingHeight(d.pageDepth*.5,c)+sampleChain(layers[1],u).z,top=bindingHeight(d.pageDepth,c)+sampleChain(layers[2],u).z;expect(mid).toBeGreaterThanOrEqual(-1e-8);expect(top).toBeGreaterThanOrEqual(mid-1e-8)}
  }
 })
 it('最厚最窄书籍使用可达压缩率而不是错误缩短外缘',()=>{const d=bookDimensions(90,120,80,.8,4),c=bindingCompression(1,1,d.pageWidth,d.pageDepth);expect(c).toBeLessThan(.9);expect(bindingHeight(d.pageDepth,c)+sampleChain(boundLayer(d.pageWidth,d.pageDepth,c),1).z).toBeCloseTo(d.pageDepth,4)})
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

it('展开纸层的外缘切线平顺落地，弧长和厚度仍守恒',()=>{for(const depth of [.02,.14,.28,.55]){const width=1.53,c=bindingCompression(1,.7,width,depth),chain=boundLayer(width,depth,c);expect(chain.tangents[65]).toBeCloseTo(0,8);expect(chain.tangents[64]).toBeCloseTo(1,8);expect(bindingHeight(depth,c)+sampleChain(chain,1).z).toBeCloseTo(depth,4)}})
