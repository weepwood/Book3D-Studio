import {describe,it,expect} from 'vitest'
import {newTurn,stepTurn,releaseCommit,followDrag,followRender,stackLayout,anchorBetween} from '../src/core/pagePhysics'
import {curlPoint} from '../src/core/pages'
import {parseConfig} from '../src/core/schema'
describe('翻页动力学',()=>{
 it('角度阻尼按参考系数收敛，拖动与渲染分离',()=>{expect(followDrag(0,1,1/60)).toBeCloseTo(.6);expect(followRender(0,1,1/60)).toBeCloseTo(.85);let t=newTurn(1);for(let i=0;i<1500;i++){const n=stepTurn(t.progress,t.velocity,1,1/60,.85);t={...t,...n}}expect(t.progress).toBe(1)})
 it('释放依照净位移，取消与连续翻页保持有界',()=>{expect(releaseCommit(5)).toBe(true);expect(releaseCommit(4.9)).toBe(false);expect(releaseCommit(-50)).toBe(false);let p=.45,v=0;for(let i=0;i<1500;i++){const n=stepTurn(p,v,0,1/60,.85);p=n.progress;v=n.velocity;expect(p).toBeGreaterThanOrEqual(0);expect(p).toBeLessThanOrEqual(1)}expect(p).toBe(0);let q=newTurn(1);for(let i=0;i<20;i++)q={...q,...stepTurn(q.progress,q.velocity,1,1/60,.85,true)};expect(q.progress).toBe(1)})
 it('活动页厚度守恒，不重复计入书芯',()=>{for(let n=1;n<=20;n++){for(let i=0;i<=n;i++){for(const d of [-1,1] as const){const l=stackLayout(i,n,.3,{direction:d,progress:.5});expect(l.left+l.right+l.moving).toBeCloseTo(.3);expect(l.left).toBeGreaterThanOrEqual(0);expect(l.right).toBeGreaterThanOrEqual(0)}}}})
 it('装订边固定，页角随抓取位置变化且端点一致',()=>{expect(curlPoint(0,.5,.5,2,3,1,1,1,2)).toEqual([0,1.5,0]);const upper=curlPoint(1,.5,.5,2,3,1,1,1,0),lower=curlPoint(1,-.5,.5,2,3,1,1,1,0);expect(upper[2]).toBeGreaterThan(lower[2]);for(const p of [0,1])expect(curlPoint(1,.5,p,2,3,1,1,1,0)[0]).toBeCloseTo(p===0?2:-2);expect(anchorBetween({x:1,z:2},{x:-1,z:3},0)).toEqual({x:1,z:2});expect(anchorBetween({x:1,z:2},{x:-1,z:3},1).z).toBeCloseTo(3)})
 it('旧版参数兼容及范围校验',()=>{expect(parseConfig({version:1}).pageBleed).toBe(.065);expect(()=>parseConfig({version:1,pageBleed:.5})).toThrow()})
})
