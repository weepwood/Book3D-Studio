import {describe,it,expect} from 'vitest'
import {chunkAutoProgress,chunkDuration,chunkRelease,groupCount} from '../src/core/referenceScene'
import {activeSpan,batchLayout,chunkDepths} from '../src/core/pageWindow'
import {createChunkGeometry,surfaceChain} from '../src/core/stackGeometry'
describe('整块书芯翻动',()=>{
 it('不受六活动叶窗口限制、厚度守恒',()=>{expect(groupCount(20,1)).toBe(20);for(const d of [-1,1] as const){const l=batchLayout(10,20,.4,d,9,true);expect(l.active).toBe(9);expect(l.left+l.right+l.moving).toBeCloseTo(.4);const a=chunkDepths(l);expect(a.left+a.right).toBeCloseTo(.4)}expect(activeSpan([{direction:1,progress:.5,span:12}])).toBe(12)})
 it('整块网格正反厚度、自动翻动与取消',()=>{const g=createChunkGeometry(2,3);g.pose(surfaceChain(2,0),.2);expect(g.g.boundingBox!.min.z).toBeCloseTo(-.1);expect(g.g.boundingBox!.max.z).toBeCloseTo(.1);g.g.dispose();expect(chunkAutoProgress(0,8)).toBe(0);expect(chunkAutoProgress(120+chunkDuration(8),8)).toBe(1);let p=.5;for(let i=0;i<100;i++)p=chunkRelease(p,0,1/60);expect(p).toBe(0)})
})

it('厚块及独立交接叶共用展开封面间距约束',()=>{const g=createChunkGeometry(2,3);g.pose(surfaceChain(2,0),.2,undefined,undefined,0,{direction:1,progress:.1,curl:1,grip:1,grabU:1},.02);for(const mesh of [g.g,g.handoff]){const p=mesh.getAttribute('position');expect(Array.from({length:p.count},(_,i)=>p.getZ(i)).every(z=>z>=.02-1e-6)).toBe(true);mesh.dispose()}})
