import {expect,it} from 'vitest'
import {PlaneGeometry,BoxGeometry} from 'three'
import {measureSurface} from '../src/core/surfaceMetrics'
it('surface metric is invariant under rigid motion and detects anisotropic strain',()=>{
 const g=new PlaneGeometry(2,3,4,4);g.rotateX(.72);g.translate(2,3,4)
 expect(measureSurface(g,2,3).areaRatio).toBeCloseTo(1,6)
 g.dispose()
 const p=new PlaneGeometry(2,3,4,4);p.scale(1.2,.8,1);const m=measureSurface(p,2,3)
 expect(m.areaRatio).toBeCloseTo(.96,6);expect(m.maxStretch).toBeCloseTo(.2,6);expect(m.maxCompression).toBeCloseTo(.2,6);p.dispose()
})
it('measures independent material surfaces of a thick block, not sidewall area',()=>{
 const g=new BoxGeometry(2,3,.4,4,4,2);for(const f of [4,5]){const m=measureSurface(g,2,3,f);expect(m.triangles).toBe(32);expect(m.areaRatio).toBeCloseTo(1,6)}g.dispose()
})

import {createChunkGeometry,turningChain,boundLayer} from '../src/core/stackGeometry'
import {materialCurlAmount} from '../src/core/paperMaterial'
it('sliding thick layers reduce outer fiber strain without changing the physical pitch',()=>{
 const w=1.47,h=2.15,d=.5,chain=turningChain(w,.3,.72,boundLayer(w,.1,.5),boundLayer(w,.2,.5,-1))
 const shape=createChunkGeometry(w,h)
 shape.pose(chain,d);const before=Math.max(...[4,5].map(f=>measureSurface(shape.g,w,h,f).maxAreaError))
 shape.pose(chain,d,undefined,undefined,0,undefined,-Infinity,undefined,undefined,true)
 const after=Math.max(...[4,5].map(f=>measureSurface(shape.g,w,h,f).maxAreaError))
 expect(after).toBeLessThan(before);expect(after).toBeLessThan(.005)
 shape.g.dispose();shape.handoff.dispose()
})
it('material corner curl is smoothly bounded; legacy is unchanged',()=>{
 expect(materialCurlAmount(12,1,true)).toBeLessThan(2.4)
 expect(materialCurlAmount(12,1,false)).toBe(12)
 expect(materialCurlAmount(0,1,true)).toBe(0)
})

import {spreadClearance} from '../src/core/stackGeometry'
it('clearance envelope never lowers clearance, never moves the sewn column, and fades at endpoints',()=>{
 const values=new Float64Array([0,0,0,.5,0,0,0,.25]),before=values.slice()
 spreadClearance(values,4,2,.1,.1,1)
 for(let i=0;i<values.length;i++)expect(values[i]).toBeGreaterThanOrEqual(before[i])
 expect(values[0]).toBe(before[0]);expect(values[4]).toBe(before[4]);expect(values[2]).toBeGreaterThan(0)
 const end=before.slice();spreadClearance(end,4,2,.1,.1,0);expect(end).toEqual(before)
})

import {createGpuPage} from '../src/core/pageGpu'
it('窄幅高书斜卷曲根部约束降低完整纸面应变，零卷曲姿态保持原样',()=>{
 const w=.86,h=3.12,d=.5,c=turningChain(w,.02,.72,boundLayer(w,d,.5),boundLayer(w,d,.5,-1)),page=createGpuPage(w,h)
 page.update(.02,.72,2.4,1,1,c,-.08,false)
 const legacy=measureSurface(page.pickMesh().geometry,w,h)
 page.update(.02,.72,2.4,1,1,c,-.08,true)
 const constrained=measureSurface(page.pickMesh().geometry,w,h)
 expect(constrained.invalid).toBe(0)
 expect(constrained.maxAreaError).toBeLessThan(legacy.maxAreaError)
 expect(constrained.maxAreaError).toBeLessThan(.15)
 page.update(.02,.72,0,1,1,c,-.08,false);const before=Array.from(page.pickMesh().geometry.getAttribute('position').array)
 page.update(.02,.72,0,1,1,c,-.08,true);expect(Array.from(page.pickMesh().geometry.getAttribute('position').array)).toEqual(before)
 page.dispose()
})

import {contactClearanceEnvelope,chunkEndpointWeight,stackHeightSampler,bindingCompression,liftChunkChain} from '../src/core/stackGeometry'
it('接触包络保持根部及原始最低清距，抑制前口清距突变',()=>{
 const original=new Float64Array([0,0,0,.12,.12,0,0,0]),lifts=original.slice()
 contactClearanceEnvelope(lifts,8,1,.02,.1,1)
 expect(lifts[0]).toBe(0)
 for(let i=0;i<lifts.length;i++)expect(lifts[i]).toBeGreaterThanOrEqual(original[i])
 expect(lifts[5]).toBeGreaterThan(0)
 const end=original.slice();contactClearanceEnvelope(end,8,1,.02,.1,0);expect(end).toEqual(original)
})
it('窄幅厚块前口固定姿态的接触应变显著下降',()=>{
 const w=.86,h=3.12,d=.65,p=.025,c=bindingCompression(1,.7,w,d*2),r=boundLayer(w,d,c),l=boundLayer(w,d,c,-1)
 const g=createChunkGeometry(w,h),chain=liftChunkChain(turningChain(w,p,.72,r,l),.02,p,true),weight=chunkEndpointWeight(p)
 const layers=[0,.5,1].map(q=>({chain:turningChain(w,p,.72,boundLayer(w,d*q,c),boundLayer(w,d*(1-q),c,-1)),x:0,z:(q-.5)*d}))
 const sampler=stackHeightSampler(r,0,-.08,1)
 g.pose(chain,d,undefined,layers,weight,undefined,-.08,sampler,.001,true)
 const before=Math.max(...[4,5].map(f=>measureSurface(g.g,w,h,f).maxAreaError))
 g.pose(chain,d,undefined,layers,weight,undefined,-.08,sampler,.001,true,false,false,true)
 const after=Math.max(...[4,5].map(f=>measureSurface(g.g,w,h,f).maxAreaError))
 expect(after).toBeLessThan(before);expect(after).toBeLessThan(.5)
 const pos=g.g.getAttribute('position')
 for(let i=0;i<pos.count;i++)expect(pos.getZ(i)+1e-7).toBeGreaterThanOrEqual(Math.max(-.08,sampler(pos.getX(i))))
 for(const p of [0,1]){
  const a=turningChain(w,p,.72,r,l)
  g.pose(a,d,undefined,layers,1,undefined,-.08,sampler,.001,true);const exact=Array.from(pos.array)
  g.pose(a,d,undefined,layers,1,undefined,-.08,sampler,.001,true,false,false,true);expect(Array.from(pos.array)).toEqual(exact)
 }
 g.g.dispose();g.handoff.dispose()
})

import {contactEnvelopeStrength} from '../src/core/stackGeometry'
it('接触包络在精确交接处连续衰减且快速达到完整强度',()=>{
 expect(contactEnvelopeStrength(1)).toBe(0)
 expect(contactEnvelopeStrength(1-1e-6)).toBeLessThan(1e-8)
 expect(contactEnvelopeStrength(chunkEndpointWeight(.025))).toBe(1)
 for(let i=0;i<100;i++)expect(contactEnvelopeStrength(i/100)).toBeGreaterThanOrEqual(contactEnvelopeStrength((i+1)/100))
})
