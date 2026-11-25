import {expect,it} from 'vitest'
import {createLayerSolver} from '../src/core/layerSolver'
it('representative layers independently relax with bounded gap variation and floor',()=>{
 const s=createLayerSolver(4,2,.3,.2),n=8
 s.begin()
 for(let l=0;l<3;l++)for(let r=0;r<2;r++)for(let c=0;c<4;c++)s.set(l*n+r*4+c,c*.1,r*.2,.05*l+(c===2?.03+.01*l:0))
 const q=s.solve(1,.1,0)!
 expect(q.accepted).toBeGreaterThan(0);expect(q.final.energy).toBeLessThan(q.initial.energy)
 let independent=false
 for(let l=0;l<3;l++)for(let r=0;r<2;r++)for(let c=0;c<4;c++){const k=l*n+r*4+c
  if(c===0)expect(s.offsets[k]).toBe(0)
  const z=.05*l+(c===2?.03+.01*l:0);expect(z+s.offsets[k]).toBeGreaterThanOrEqual(-1e-12)
  if(l<2){const diff=s.offsets[k+n]-s.offsets[k];expect(Math.abs(diff)).toBeLessThanOrEqual(.05*(c===2?.06:.05)+1e-10);independent ||= Math.abs(diff)>1e-9}
 }
 expect(independent).toBe(true)
 s.begin();expect(s.solve(1,.1,0)).toBeNull()
})
