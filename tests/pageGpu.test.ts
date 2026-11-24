import {describe,it,expect} from 'vitest'
import {makeChain} from '../src/core/pageChain'
import {packChain,createGpuPage} from '../src/core/pageGpu'
import {batchLayout,leafDepths,orderedProgress,desiredBatch,gravityDrop} from '../src/core/pageWindow'
describe('GPU 链纹理及活动页窗口',()=>{
 it('33×2 RGBA 正确存储位置和切线',()=>{const c=makeChain(2,.5,1),d=packChain(c);expect(d.length).toBe(264);for(let i=0;i<33;i++){expect(d[i*4]).toBeCloseTo(c.positions[i*2]);expect(d[(33+i)*4+1]).toBeCloseTo(c.tangents[i*2+1])}const g=createGpuPage(2,3);g.update(.5,.7,2,1,.8);expect(g.texture.image.width).toBe(33);expect(g.texture.image.height).toBe(2);g.dispose()})
 it('活动纸张不超过六张且厚度守恒',()=>{for(let n=1;n<=20;n++)for(let i=0;i<=n;i++)for(const d of [-1,1] as const){const l=batchLayout(i,n,.3,d,8);expect(l.active).toBeLessThanOrEqual(6);expect(l.left+l.right+l.moving).toBeCloseTo(.3);expect(l.left).toBeGreaterThanOrEqual(0);expect(l.right).toBeGreaterThanOrEqual(0)}})
 it('先行页落地后后续页的起止厚度不跳变',()=>{for(const d of [-1,1] as const){const before=batchLayout(5,10,1,d,3),after=batchLayout(5+d,10,1,d,2);const a=leafDepths(before,d,1),b=leafDepths(after,d,0);expect(a.left).toBeCloseTo(b.left);expect(a.right).toBeCloseTo(b.right)}})
 it('邻页角度顺序、目标窗口和落页时间',()=>{expect(orderedProgress(.4,.6)).toBeLessThan(.4);expect(orderedProgress(1,1)).toBe(1);expect(desiredBatch(0,20,20,1)).toBe(6);expect(desiredBatch(3,0,10,-1)).toBe(3);expect(gravityDrop(0,0,6)).toBe(0);expect(gravityDrop(700,0,6)).toBe(1)})
})

it('实际拾取代理按姿态刷新且复用网格与材质',()=>{const g=createGpuPage(1.5,2);const a=g.pickMesh();const before=a.geometry.getAttribute('position').getZ(48);g.update(.3,.7,1,.2,1);const b=g.pickMesh();expect(b).toBe(a);expect(b.geometry.getAttribute('position').getZ(48)).not.toBe(before);expect(g.pickMesh()).toBe(a);g.dispose()})
