import {it,expect} from 'vitest'
import {defaults,parseConfig} from '../src/core/schema'
import {physicalBook} from '../src/core/physicalBook'
import {batchLayout} from '../src/core/pageWindow'
import {MotionClock,stepTurn,trackDrag} from '../src/core/pagePhysics'
import {chunkAutoProgress,chunkDuration} from '../src/core/referenceScene'
import {paperEdgeRepeat,boundLayer,turningChain} from '../src/core/stackGeometry'
import {sampleChain} from '../src/core/pageChain'
it('旧版固定厚度无损迁移；新物理规格、奇数页、素材与页数独立',()=>{
 const old=parseConfig({version:1,thickness:32,pageCount:12});expect(old.thicknessMode).toBe('manual');expect(physicalBook(old)).toEqual({leaves:6,core:27,thickness:32,paperThickness:4.5})
 for(const count of [2,3,12,100,320,800,2000]){
  const c=parseConfig({...defaults,thicknessMode:'automatic',paperThickness:.1,pageCount:count,pageIndex:1000})
  const p=physicalBook(c);expect(p.leaves).toBe(Math.ceil(count/2));expect(p.thickness).toBeCloseTo(p.leaves*.1+5);expect(c.pageIndex).toBe(p.leaves)
  expect(parseConfig(JSON.parse(JSON.stringify(c)))).toEqual(c)
  for(const dir of [-1,1] as const)for(const index of [0,Math.floor(p.leaves/2),p.leaves]){
   const l=batchLayout(index,p.leaves,p.core/100,dir,100,true)
   expect(l.left+l.right+l.moving).toBeCloseTo(p.core/100,10)
   expect(paperEdgeRepeat(1.5,l.left,l.unit)).toBeCloseTo(l.left/l.unit/2)
  }
 }
 expect(()=>parseConfig({...defaults,pageCount:2001})).toThrow()
 expect(()=>parseConfig({...defaults,paperThickness:0})).toThrow()
})
it('时间步积累有界；连续输入不清零速度或突然切换到固定速度',()=>{
 const clock=new MotionClock();expect(clock.advance(.004)).toBe(0);expect(clock.advance(.005)).toBeCloseTo(1/120);expect(clock.advance(.5)).toBeCloseTo(.05)
 const drag=trackDrag(.3,1.2,.8,0);expect(drag.progress).toBeCloseTo(.3);expect(drag.velocity).toBeCloseTo(1.2)
 const a=stepTurn(.35,.2,1,1/120,.85,true);expect(a.velocity).toBeGreaterThan(.2);expect(a.velocity).toBeLessThan(2)
})
it('厚块起止速度连续，端点精确匹配纸芯曲线',()=>{
 const end=120+chunkDuration(30);expect(chunkAutoProgress(120,30)).toBe(0);expect(chunkAutoProgress(end,30)).toBe(1)
 expect(chunkAutoProgress(121,30)).toBeLessThan(.0001);expect(1-chunkAutoProgress(end-1,30)).toBeLessThan(.0001)
 for(const depth of [.0004,.16,.4]){
  const a=boundLayer(1.5,depth,.6),b=boundLayer(1.5,depth,.6,-1)
  for(const u of [0,.5,1]){
   const start=sampleChain(turningChain(1.5,0,.7,a,b),u),finish=sampleChain(turningChain(1.5,1,.7,a,b),u)
   expect(start.x).toBeCloseTo(sampleChain(a,u).x);expect(finish.z).toBeCloseTo(-sampleChain(b,u).z)
  }
 }
})
