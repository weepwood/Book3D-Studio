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

import {createSectionWorkspace} from '../src/core/sectionSolver'
it('reused solver workspace produces independent identical results',()=>{
 const edges:SectionEdge[]=[{a:0,b:1,dx:.1,dy:0,dz:0,rest:.1}],minimum=new Float64Array([0,.05]),a=new Float64Array([0,.3]),b=a.slice(),workspace=createSectionWorkspace(2)
 const expected=solveSectionClearance(a,minimum,edges,2,1)
 solveSectionClearance(new Float64Array([0,.9]),minimum,edges,2,.5,6,workspace)
 const actual=solveSectionClearance(b,minimum,edges,2,1,6,workspace)
 expect(b).toEqual(a);expect(actual).toEqual(expected)
})
