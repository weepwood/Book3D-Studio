import {expect,it} from 'vitest'
import {defaults,parseConfig} from '../src/core/schema'
import {paperMaterial,paperPresets,applyPaperPreset} from '../src/core/paperMaterial'
import {stepTurn} from '../src/core/pagePhysics'
import {chunkAutoProgress,chunkDuration} from '../src/core/referenceScene'
import {createGpuPage} from '../src/core/pageGpu'
import {makeChain} from '../src/core/pageChain'
import {prepareSweptMesh} from '../src/core/sweptContact'
it('旧版动力学参数中性，纸厚、克重、刚度独立且预设保留兼容结构',()=>{
 const legacy=parseConfig({version:1});expect(paperMaterial(legacy)).toMatchObject({flex:1,response:1,damping:1})
 const a=applyPaperPreset(defaults,'standard'),b={...a,paperThickness:.2}
 expect(paperMaterial(b).rigidity/paperMaterial(a).rigidity).toBeCloseTo(8)
 expect(paperMaterial({...a,paperGrammage:160}).rigidity).toBe(paperMaterial(a).rigidity)
 for(const key of Object.keys(paperPresets) as (keyof typeof paperPresets)[]){const c=applyPaperPreset(defaults,key);expect(parseConfig(c)).toEqual(c);expect(paperMaterial(c).estimatedPaperMass).toBeGreaterThan(0)}
 expect(()=>parseConfig({...a,paperModulus:0})).toThrow()
})
it('材料运动继承加速度，重定向不超过 jerk 预算且最终收敛',()=>{
 let p=.3,v=.5,a=8
 const n=stepTurn(p,v,0,1/120,.85,false,a)
 expect(Math.abs(n.acceleration-a)).toBeLessThanOrEqual(25*45/120+1e-9)
 for(const target of [1,0,1,0]){let settled=false;for(let i=0;i<1800;i++){const s=stepTurn(p,v,target,1/120,1,false,a);p=s.progress;v=s.velocity;a=s.acceleration;expect(p).toBeGreaterThanOrEqual(0);expect(p).toBeLessThanOrEqual(1);if(s.settled){settled=true;break}}expect(settled).toBe(true);expect(p).toBe(target)}
})
it('厚块自动轨迹起止二阶平滑且单调有界',()=>{
 const end=120+chunkDuration(20);let prev=0
 for(let t=120;t<=end;t+=1){const p=chunkAutoProgress(t,20);expect(p).toBeGreaterThanOrEqual(prev-1e-12);expect(p).toBeLessThanOrEqual(1);prev=p}
 expect(chunkAutoProgress(121,20)).toBeLessThan(1e-7);expect(1-chunkAutoProgress(end-1,20)).toBeLessThan(1e-7);expect(chunkAutoProgress(end,20)).toBe(1)
})
it('GPU 链缓存避免相同姿态重新上传，真实变化仍更新',()=>{
 const gpu=createGpuPage(1.5,2),chain=makeChain(1.5,.3,.7)
 gpu.update(.3,.7,0,0,1,chain);const version=gpu.texture.version
 gpu.update(.3,.7,.2,0,1,makeChain(1.5,.3,.7));expect(gpu.texture.version).toBe(version)
 gpu.update(.4,.7,0,0,1);expect(gpu.texture.version).toBeGreaterThan(version);gpu.dispose()
})
it('扫掠拓扑与材料变更、非有限坐标不误报清除',()=>{
 const a={positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),materials:new Uint8Array([4])}
 expect(prepareSweptMesh(a,{...a,materials:new Uint8Array([5])})).toBeNull()
 expect(prepareSweptMesh(a,{...a,positions:new Float32Array([NaN,0,0,1,0,0,0,1,0])})).toBeNull()
})

import {curveMetrics} from '../src/core/curveMetrics'
import {boundLayer,bindingCompression,turningChain} from '../src/core/stackGeometry'
it('纸面弧长、根部及弯曲能量在多规格全过程保持有限',()=>{
 for(const w of [.86,1.47,2.45])for(const d of [.0004,.27,2.5]){
  const c=bindingCompression(1,.7,w,d),r=boundLayer(w,d,c),l=boundLayer(w,d,c,-1)
  for(let i=0;i<=40;i++){const m=curveMetrics(turningChain(w,i/40,.72,r,l),.0003)
   expect(m.relativeLengthError).toBeLessThan(.005);expect(m.rootError).toBeLessThan(1e-8);expect(Number.isFinite(m.bendingEnergy)).toBe(true);expect(m.bendingEnergy).toBeGreaterThanOrEqual(0)}
 }
})

it('材料模式在不同响应时间与快速反向输入下仍有界并最终收敛',()=>{
 for(const duration of [.3,.85,2,3.4])for(const queued of [false,true]){
  let p=0,v=0,a=0,settled=false
  for(let i=0;i<2400;i++){
   const goal=i<18?1:i<36?0:1,s=stepTurn(p,v,goal,1/120,duration,queued,a)
   p=s.progress;v=s.velocity;a=s.acceleration;expect(Number.isFinite(p+v+a)).toBe(true);expect(p).toBeGreaterThanOrEqual(0);expect(p).toBeLessThanOrEqual(1)
   if(i>=36&&s.settled){settled=true;break}
  }
  expect(settled).toBe(true);expect(p).toBe(1)
 }
})

import {liftChunkChain} from '../src/core/stackGeometry'
it('材料抬升后的弧长投影不移动装订根部，且消除明显拉伸',()=>{
 for(const width of [.86,1.47,2.45])for(const p of [.05,.2,.45,.7,.95]){
  const r=boundLayer(width,.2,.6),l=boundLayer(width,.2,.6,-1),base=turningChain(width,p,.7,r,l)
  const projected=liftChunkChain(base,width*.075,p,true),metrics=curveMetrics(projected)
  expect(metrics.rootError).toBeLessThan(1e-9)
  expect(metrics.relativeLengthError).toBeLessThan(.005)
  expect(liftChunkChain(base,0,p,true)).toBe(base)
 }
})
