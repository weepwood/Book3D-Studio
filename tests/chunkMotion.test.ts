import {describe,it,expect} from 'vitest'
import {newChunkMotion,stepChunk,chunkCanCommit,CHUNK_TEXTURE_TIMEOUT,CHUNK_LANDED_FRAMES} from '../src/core/chunkMotion'
import {chunkEndpointWeight,liftChunkChain,createChunkGeometry} from '../src/core/stackGeometry'
import {makeChain,sampleChain} from '../src/core/pageChain'
describe('厚块生命周期',()=>{
 it('纹理等待最长1200ms，自动抬升与四帧落地',()=>{const m=newChunkMotion(false);stepChunk(m,12,.2,false,false,0,1);expect(m.phase).toBe('prepare');for(let i=0;i<10;i++)stepChunk(m,12,.1,false,false,0,1);expect(m.waitMs).toBe(CHUNK_TEXTURE_TIMEOUT);expect(m.phase).toBe('turn');let peak=0;for(let i=0;i<120&&m.phase!=='landed';i++){stepChunk(m,12,1/60,true,false,0,1);peak=Math.max(peak,m.lift)}expect(peak).toBeGreaterThan(.5);expect(m.progress).toBe(1);expect(m.lift).toBe(0);expect(chunkCanCommit(m,1)).toBe(false);for(let i=0;i<CHUNK_LANDED_FRAMES;i++)stepChunk(m,12,1/60,true,false,0,1);expect(chunkCanCommit(m,1)).toBe(true)})
 it('取消准备或聚拢均不会误提交',()=>{const m=newChunkMotion(true);stepChunk(m,8,.1,false,false,0,0);expect(m.goal).toBe(0);expect(m.phase).toBe('landed');expect(m.visible).toBe(false);const a=newChunkMotion(true);for(let i=0;i<20;i++)stepChunk(a,8,1/60,true,true,.5,0);expect(a.phase).toBe('gather');expect(a.lift).toBeGreaterThan(.5);for(let i=0;i<240&&a.phase!=='landed';i++)stepChunk(a,8,1/60,true,false,0,0);expect(a.phase).toBe('landed');expect(a.progress).toBe(0);expect(a.lift).toBe(0)})
 it('抬升保留装订根部且层面端点连续',()=>{const c=makeChain(1.5,.25,.6),a=liftChunkChain(c,.1,.25);expect(sampleChain(a,0).x).toBeCloseTo(0);expect(sampleChain(a,0).z).toBeCloseTo(0);expect(Math.hypot(sampleChain(a,1).x-sampleChain(c,1).x,sampleChain(a,1).z-sampleChain(c,1).z)).toBeCloseTo(.06875);const middle=liftChunkChain(c,.1,.5);expect(sampleChain(middle,1).z).toBeCloseTo(sampleChain(c,1).z);expect(sampleChain(middle,1).x).toBeCloseTo(sampleChain(c,1).x);expect(chunkEndpointWeight(0)).toBe(1);expect(chunkEndpointWeight(.5)).toBe(0);expect(chunkEndpointWeight(1)).toBe(1);const g=createChunkGeometry(1.5,2);g.pose(c,.2,undefined,[{chain:c,x:0,z:-.02},{chain:c,x:0,z:0},{chain:c,x:0,z:.02}],1);const p=g.g.getAttribute('position');expect(Array.from(p.array).every(Number.isFinite)).toBe(true);g.g.dispose()})
})

describe('手动厚块独立交接纸页',()=>{
 it('自动不创建交接叶，手动保留起始卷曲并衰减，取消后回收',()=>{const auto=newChunkMotion(false);expect(auto.handoff).toBe(false);const m=newChunkMotion(true,0,0,.7);stepChunk(m,10,1/60,true,true,0,0);expect(m.handoff).toBe(true);expect(m.handoffCurl).toBe(.7);for(let i=0;i<60;i++)stepChunk(m,10,1/60,true,true,.4,0);expect(m.handoff).toBe(false);expect(m.handoffCurl).toBe(0);for(let i=0;i<240&&m.phase!=='landed';i++)stepChunk(m,10,1/60,true,false,0,0);expect(m.progress).toBe(0);expect(m.handoff).toBe(false)})
 it('双向交接使用实际块面，零卷曲只偏移极小深度',()=>{const g=createChunkGeometry(1.5,2),chain=makeChain(1.5,.2,.7);for(const direction of [1,-1] as const){g.pose(chain,.2,undefined,undefined,0,{direction,progress:direction===1?.2:.8,curl:0,grip:0,grabU:1});const a=g.g.getAttribute('position'),b=g.handoff.getAttribute('position'),indices=g.handoff.index!.array;for(const i of indices){expect(Math.hypot(a.getX(i)-b.getX(i),a.getY(i)-b.getY(i),a.getZ(i)-b.getZ(i))).toBeCloseTo(.0003,5)}expect(Array.from(b.array).every(Number.isFinite)).toBe(true)}g.g.dispose();g.handoff.dispose()})
})

it('慢帧首次可见时仍存在交接叶，后续自然衰减而不是跳过首帧',()=>{
 const m=newChunkMotion(true,0,0,.3);stepChunk(m,9,.25,false,true,.08,0);expect(m.visible).toBe(false);expect(m.handoffFrames).toBe(0)
 stepChunk(m,9,.25,true,true,.08,0);expect(m.visible).toBe(true);expect(m.handoff).toBe(true);expect(m.handoffCurl).toBe(.3);expect(m.handoffFrames).toBe(1)
 stepChunk(m,9,.25,true,true,.4,0);expect(m.handoff).toBe(false);expect(m.handoffCurl).toBe(0)
})
