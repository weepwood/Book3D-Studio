import {describe,it,expect} from 'vitest'
import {stackAngle,surfaceChain,turningChain,createStackGeometry,poseSurface} from '../src/core/stackGeometry'
import {coverProgress,brakeRetention,groupCount,PRESS_SCENE} from '../src/core/referenceScene'
import {sampleChain} from '../src/core/pageChain'
import * as T from 'three'
import {openingLeaves} from '../src/core/pageWindow'
describe('原版整体适配',()=>{
 it('打开时独立逐页下落且不改变页码',()=>{const initial=openingLeaves(0,10,0),mid=openingLeaves(0,10,250);expect(initial).toHaveLength(6);expect(initial.every(x=>x.progress===.5)).toBe(true);expect(mid[0].progress).toBeGreaterThan(mid[5].progress);expect(openingLeaves(0,10,700)).toEqual([]);expect(openingLeaves(10,10,0)[0].direction).toBe(-1);expect(openingLeaves(0,1,0)).toHaveLength(1)})
 it('三层书芯共用曲线，活动页端点连续',()=>{const a=stackAngle(1.5,.2,1,1,1),r=surfaceChain(1.5,a,.05),l=surfaceChain(1.5,-a,-.05);expect(a).toBeGreaterThan(0);expect(sampleChain(r,1).z).toBeGreaterThan(0);for(const p of [0,1]){const c=turningChain(1.5,p,.7,r,l),base=p?l:r;for(let i=0;i<66;i++)expect(c.positions[i]).toBeCloseTo(base.positions[i]*(p?-1:1))}const s=createStackGeometry(1.5,2);s.pose([surfaceChain(1.5,a,-.05),r,surfaceChain(1.5,a,.05)],.1,1);expect(s.g.boundingBox!.max.z).toBeGreaterThan(.05);s.g.dispose();const g=new T.PlaneGeometry(1.5,2,48,1);poseSurface(g,r,false);expect(g.boundingBox!.max.z).toBeGreaterThan(0);g.dispose()})
 it('封面时序、制动和成组数量边界',()=>{expect(coverProgress(0,180,0).angle).toBe(0);expect(coverProgress(0,180,PRESS_SCENE.coverMs).angle).toBe(180);expect(coverProgress(180,0,PRESS_SCENE.closeMs).angle).toBe(0);expect(brakeRetention(400).drive).toBe(0);expect(groupCount(20,1)).toBe(6);expect(groupCount(2,1)).toBe(2);expect(groupCount(10,0)).toBe(1)})
})
