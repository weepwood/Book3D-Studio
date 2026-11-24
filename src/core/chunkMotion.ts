import {clamp} from './pagePhysics'
import {chunkAutoProgress,chunkRelease} from './referenceScene'
export type ChunkPhase='prepare'|'gather'|'turn'|'release'|'landed'
export type ChunkMotion={phase:ChunkPhase;gesture:boolean;visible:boolean;progress:number;lift:number;waitMs:number;elapsedMs:number;landedFrames:number;goal:0|1|null}
export const CHUNK_TEXTURE_TIMEOUT=1200
export const CHUNK_LANDED_FRAMES=4
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)}
export const newChunkMotion=(gesture:boolean,progress=0,lift=0):ChunkMotion=>({phase:progress>0?(gesture?'gather':'turn'):'prepare',gesture,visible:progress>0,progress,lift,waitMs:0,elapsedMs:0,landedFrames:0,goal:null})
export function stepChunk(m:ChunkMotion,count:number,dt:number,ready:boolean,dragging:boolean,target:number,goal:0|1){
 dt=clamp(dt,0,.25)
 const approach=(v:number,t:number,k:number)=>v+(t-v)*(1-Math.exp(-k*dt))
 if(m.phase==='prepare'){
   if(!dragging&&goal===0){m.phase='landed';m.goal=0;m.lift=0;return}
   m.waitMs+=dt*1000
   if(!ready&&m.waitMs<CHUNK_TEXTURE_TIMEOUT)return
   m.phase=m.gesture?(dragging?'gather':'release'):'turn';m.visible=true
 }
 if(m.phase==='landed'){m.landedFrames++;return}
 if(m.phase==='gather'&&!dragging||m.phase==='turn'&&goal===0){m.phase='release';m.goal=goal}
 if(m.phase==='gather'){
   m.lift=approach(m.lift,1,12);m.progress=approach(m.progress,clamp(target),14)
 }else if(m.phase==='turn'){
   m.elapsedMs+=dt*1000;m.progress=chunkAutoProgress(m.elapsedMs,count);m.lift=smooth(0,150,m.elapsedMs)*(1-smooth(.65,1,m.progress))
   if(m.progress===1){m.lift=0;m.goal=1;m.phase='landed'}
 }else if(m.phase==='release'){
   m.goal=goal;m.progress=chunkRelease(m.progress,goal,dt)
   m.lift=approach(m.lift,goal===1?1-smooth(.55,.95,m.progress):0,10)
   if(m.progress===goal&&m.lift<.01){m.lift=0;m.phase='landed'}
 }
}
export function chunkCanCommit(m:ChunkMotion,renderProgress:number){return m.phase==='landed'&&m.landedFrames>=CHUNK_LANDED_FRAMES&&Math.abs(renderProgress-m.progress)<.002}
