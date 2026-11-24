import {describe,it,expect} from 'vitest'
import {offsetStackProfile,layeredStackProfile} from '../src/core/stackProfile'
describe('原版书芯三层偏移曲线',()=>{
 it('闭合时三层平行且保持厚度',()=>{const layers=layeredStackProfile(2,.9,1,0,.2);expect(layers).toHaveLength(3);for(let i=0;i<49;i++){expect(layers[0][i*2]).toBeCloseTo(i/48*2);expect(layers[2][i*2+1]-layers[0][i*2+1]).toBeCloseTo(.2)}})
 it('曲率限制后采样有限且保持弧长',()=>{for(const offset of [-.1,0,.1,1]){const p=offsetStackProfile(2,u=>u*2,offset);expect(Array.from(p).every(Number.isFinite)).toBe(true);let len=0;for(let i=1;i<49;i++)len+=Math.hypot(p[i*2]-p[(i-1)*2],p[i*2+1]-p[(i-1)*2+1]);expect(len).toBeCloseTo(2,2)}})
})
