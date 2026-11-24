import {describe,it,expect} from 'vitest'
import {makeChain,sampleChain,rollPoint,curlTarget} from '../src/core/pageChain'
import {PRESS_REFERENCE as R} from '../src/core/pressReference'
describe('参考纸张链',()=>{
 it('33 节点，根部固定，两端平坦',()=>{for(const p of [0,.2,.5,.8,1]){const c=makeChain(2,p,1);expect(c.positions.length).toBe(66);expect(sampleChain(c,0).x).toBe(0);expect(sampleChain(c,0).z).toBe(0);const end=sampleChain(c,1);expect(Math.hypot(end.tx,end.tz)).toBeCloseTo(1);if(p===0||p===1){expect(end.x).toBeCloseTo(p===0?2:-2);expect(end.z).toBeCloseTo(0)}}})
 it('卷曲为零时保持基础链，装订边不移动',()=>{const c=makeChain(2,.2,1);expect(rollPoint(c,0,.5,3,7,1)).toEqual([0,1.5,0]);const s=sampleChain(c,.8);expect(rollPoint(c,.8,0,3,0,0)).toEqual([s.x,0,s.z])})
 it('局部卷曲参数来自参考配置，正反侧向外且有限',()=>{for(const p of [0,.2,.5,.8,1]){const c=makeChain(2,p,.7);for(const u of [0,.25,.74,.9,1])for(const v of [-.5,0,.5])expect(rollPoint(c,u,v,3,7,1,.9,p).every(Number.isFinite)).toBe(true)}expect(R.curl.span/R.sourcePageWidth).toBeCloseTo(2.076923);expect(curlTarget('drag',.5,1,1)).toBeCloseTo(0)})
})
