import {describe,it,expect} from 'vitest'
import {PRESS_STACK_PROFILE as R,stackBend,stackSweep,sampleStackProfile} from '../src/core/stackProfile'
describe('原版书芯曲线预备',()=>{
 it('原版曲线端点与卷曲限制',()=>{expect(stackBend(0)).toBe(0);expect(stackBend(1)).toBeCloseTo(1-R.curlEndReverse);expect(stackSweep(100)).toBeCloseTo(R.curlSweepMaxDeg*Math.PI/180)})
 it('33 节采样弧长不变、零卷曲平直',()=>{for(const curl of [-.5,0,.5]){const p=sampleStackProfile(2,.9,curl);expect(p.length).toBe(66);let len=0;for(let i=1;i<33;i++)len+=Math.hypot(p[i*2]-p[(i-1)*2],p[i*2+1]-p[(i-1)*2+1]);expect(len).toBeCloseTo(2);if(curl===0)expect(p[64]).toBeCloseTo(2)}})
})
