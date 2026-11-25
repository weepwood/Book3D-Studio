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
