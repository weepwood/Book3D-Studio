import {expect,it} from 'vitest'
import {TurnInput,releaseGesture,gestureIntent} from '../src/core/turnInput'
import {MotionClock} from '../src/core/pagePhysics'
it('paced input adapts to cadence and backlog, then resets on reversal or pause',()=>{
 const i=new TurnInput();i.push(1,0);const one=i.timing(1)
 for(let j=1;j<8;j++)i.push(1,j*90)
 const burst=i.timing(8);expect(burst.interval).toBeLessThan(one.interval);expect(burst.durationScale).toBeLessThan(one.durationScale)
 expect(burst.gap).toBeGreaterThanOrEqual(.14)
 i.push(-1,740);expect(i.timing(1)).toEqual(one)
 i.push(-1,2000);expect(i.timing(1)).toEqual(one);i.reset();expect(i.active).toBe(false)
})
it('release uses latest intended progress, bounded velocity and explicit reversal',()=>{
 expect(releaseGesture(.75,0,120,false,1)).toBe(true)
 expect(releaseGesture(.25,2,50,false,1)).toBe(true)
 expect(releaseGesture(.25,0,50,false,1)).toBe(false)
 expect(releaseGesture(.08,4,12,false,1)).toBe(false)
 expect(releaseGesture(.35,-2,-24,true,1)).toBe(false)
 expect(releaseGesture(.66,0,0,true,1)).toBe(true)
 expect(releaseGesture(.12,0,90,false,30)).toBe(true)
 expect(releaseGesture(.3,0,-10,true,30)).toBe(false)
 expect(gestureIntent(false,.53)).toBe(true);expect(gestureIntent(true,.39)).toBe(true);expect(gestureIntent(true,.27)).toBe(false)
 expect(releaseGesture(.39,-.6,45,false,1,true)).toBe(true);expect(releaseGesture(.25,-.6,45,false,1,true)).toBe(false)
})
it('bounded interactive clock recovers small stalls without consuming full background time',()=>{
 const clock=new MotionClock()
 expect(clock.advanceInteractive(.5)).toBeCloseTo(.075)
 for(let i=0;i<3;i++)expect(clock.advanceInteractive(1/60)).toBeLessThanOrEqual(.05)
 expect(clock.advanceInteractive(1/60)).toBeCloseTo(1/60)
 clock.reset();expect(clock.advanceInteractive(.004)).toBe(0)
})
