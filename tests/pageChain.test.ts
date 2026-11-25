import {describe,it,expect} from 'vitest'
import {makeChain,sampleChain,rollPoint,curlTarget} from '../src/core/pageChain'
import {PRESS_REFERENCE as R} from '../src/core/pressReference'
describe('参考纸张链',()=>{
 it('33 节点，根部固定，两端平坦',()=>{for(const p of [0,.2,.5,.8,1]){const c=makeChain(2,p,1);expect(c.positions.length).toBe(66);expect(sampleChain(c,0).x).toBe(0);expect(sampleChain(c,0).z).toBe(0);const end=sampleChain(c,1);expect(Math.hypot(end.tx,end.tz)).toBeCloseTo(1);if(p===0||p===1){expect(end.x).toBeCloseTo(p===0?2:-2);expect(end.z).toBeCloseTo(0)}}})
 it('卷曲为零时保持基础链，装订边不移动',()=>{const c=makeChain(2,.2,1);expect(rollPoint(c,0,.5,3,7,1)).toEqual([0,1.5,0]);const s=sampleChain(c,.8);expect(rollPoint(c,.8,0,3,0,0)).toEqual([s.x,0,s.z])})
 it('局部卷曲参数来自参考配置，正反侧向外且有限',()=>{for(const p of [0,.2,.5,.8,1]){const c=makeChain(2,p,.7);for(const u of [0,.25,.74,.9,1])for(const v of [-.5,0,.5])expect(rollPoint(c,u,v,3,7,1,.9,p).every(Number.isFinite)).toBe(true)}expect(R.curl.span/R.sourcePageWidth).toBeCloseTo(2.076923);expect(curlTarget('drag',.5,1,1)).toBeCloseTo(0)})
})

it('中点附近残余卷曲连续衰减，不突然翻到相反法线',()=>{const c=makeChain(2,.5,1),a=rollPoint(c,1,.5,3,6,1,1,.49999),b=rollPoint(c,1,.5,3,6,1,1,.50001),base=rollPoint(c,1,.5,3,0,1);expect(Math.hypot(...a.map((v,i)=>v-b[i]))).toBeLessThan(.00001);expect(rollPoint(c,1,.5,3,6,1,1,.5)).toEqual(base)})

it('材料模式斜卷曲折线不穿过装订边，窄幅高书根部邻域连续',()=>{
 const c=makeChain(.86,.02,.72),height=3.12
 for(const grip of [-1,1])for(const v of [-.5,.5]){
  const root=rollPoint(c,0,v,height,2.4,grip,1,.02,true),near=rollPoint(c,1e-6,v,height,2.4,grip,1,.02,true)
  expect(Math.hypot(...near.map((x,i)=>x-root[i]))).toBeLessThan(2e-6)
 }
})
