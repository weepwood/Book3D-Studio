import {expect,it} from 'vitest'
import {solveSectionClearance,sectionScore,type SectionEdge} from '../src/core/sectionSolver'
it('projected section solver reduces discrete strain without breaking floor or anchor',()=>{
 const lifts=new Float64Array([0,.3,.4,.2]),minimum=new Float64Array([0,.1,.15,.1]),edges:SectionEdge[]=Array.from({length:3},(_,i)=>({a:i,b:i+1,dx:.1,dy:0,dz:0,rest:.1}))
 const initial=lifts.slice(),r=solveSectionClearance(lifts,minimum,edges,4,1,20)
 expect(r.accepted).toBeGreaterThan(0);expect(r.final.energy).toBeLessThan(r.initial.energy);expect(r.final.maxError).toBeLessThanOrEqual(r.initial.maxError)
 expect(lifts[0]).toBe(initial[0]);for(let i=0;i<4;i++)expect(lifts[i]).toBeGreaterThanOrEqual(minimum[i])
 expect(sectionScore(lifts,edges)).toEqual(r.final)
 const end=lifts.slice();solveSectionClearance(lifts,minimum,edges,4,0);expect(lifts).toEqual(end)
})
