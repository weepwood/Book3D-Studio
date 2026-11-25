import {expect,it} from 'vitest'
import {contactCorrection,acceptCorrection} from '../src/core/contactCorrection'
it('ignores sewing root and coplanar contact; bounds distal correction',()=>{
 const hit={a:'leaf-0',b:'Front cover',kind:'penetration',point:[1,0,0]};expect(contactCorrection([hit],0,2,.02)).toBeCloseTo(.01);expect(contactCorrection([{...hit,point:[0,0,0]}],0,2,.02)).toBe(0);expect(contactCorrection([{...hit,kind:'coplanar'}],0,2,.02)).toBe(0);expect(acceptCorrection(5,4)).toBe(true);expect(acceptCorrection(5,5)).toBe(false)
})
import {improvesContacts,isBindingContact} from '../src/core/contactCorrection'
it('cannot trade new coplanar defects for fewer penetrations',()=>{expect(improvesContacts({penetration:8,coplanar:0},{penetration:1,coplanar:2})).toBe(false);expect(improvesContacts({penetration:8,coplanar:2},{penetration:2,coplanar:2})).toBe(true);expect(isBindingContact('leaf-0','Spine',[.001,0,0],0,.01)).toBe(true);expect(isBindingContact('leaf-0','Spine',[.5,0,0],0,.01)).toBe(false)})
import {turnCorrectionEnvelope,correctionCandidates,nonWorseningContacts} from '../src/core/contactCorrection'
it('retains bounded correction proposals and fades at page handoff endpoints',()=>{
 expect(turnCorrectionEnvelope(0)).toBe(0);expect(turnCorrectionEnvelope(1)).toBeCloseTo(0);expect(turnCorrectionEnvelope(.5)).toBeCloseTo(1)
 expect(correctionCandidates(.004,.012,.012)).toEqual([.004,.008,.012])
 expect(correctionCandidates(.008,0,.012)).toEqual([.004])
 expect(nonWorseningContacts({penetration:0,coplanar:0},{penetration:0,coplanar:1})).toBe(false)
})
