import {clamp,stepTurn,trackDrag} from './pagePhysics'
import {chunkAutoProgress} from './referenceScene'
export type ChunkPhase='prepare'|'gather'|'turn'|'release'|'landed'
export type ChunkMotion={phase:ChunkPhase;gesture:boolean;visible:boolean;progress:number;velocity:number;acceleration:number;lift:number;waitMs:number;elapsedMs:number;landedFrames:number;goal:0|1|null;handoff:boolean;handoffCurl:number;handoffFrames:number}
export const CHUNK_TEXTURE_TIMEOUT=1200
export const CHUNK_LANDED_FRAMES=4
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)}
export const newChunkMotion=(gesture:boolean,progress=0,lift=0,cornerCurl=0):ChunkMotion=>({phase:progress>0?(gesture?'gather':'turn'):'prepare',gesture,visible:progress>0,progress,velocity:0,acceleration:0,lift,waitMs:0,elapsedMs:0,landedFrames:0,goal:null,handoff:gesture&&progress<.02,handoffCurl:gesture&&progress<.02?Math.max(0,cornerCurl):0,handoffFrames:0})
// Regrabbing a rendered block must not restart texture preparation or
// recreate an already-decayed handoff leaf. Keep the actual visible pose.
export function regrabChunkMotion(previous:ChunkMotion):ChunkMotion{
 return {...previous,gesture:true,phase:previous.visible?'gather':'prepare',goal:null,landedFrames:0,elapsedMs:0}
}
export function stepChunk(m:ChunkMotion,count:number,dt:number,ready:boolean,dragging:boolean,target:number,goal:0|1,response=1,damping=1,material=false){
 dt=clamp(dt,0,.25)
 const approach=(v:number,t:number,k:number)=>v+(t-v)*(1-Math.exp(-k*dt))
 if(m.phase==='prepare'){
   if(!dragging&&goal===0){m.phase='landed';m.goal=0;m.lift=0;m.handoff=false;m.handoffCurl=0;return}
   m.waitMs+=dt*1000
   if(!ready&&m.waitMs<CHUNK_TEXTURE_TIMEOUT)return
   m.phase=m.gesture?(dragging?'gather':'release'):'turn';m.visible=true
 }
 if(m.phase==='landed'){
   if(m.visible&&m.goal!==goal){m.phase='release';m.goal=goal;m.landedFrames=0}
   else {m.handoff=false;m.handoffCurl=0;m.landedFrames++;return}
 }
 if(m.phase==='gather'&&!dragging||m.phase==='turn'&&goal===0){m.phase='release';m.goal=goal}
 if(m.phase==='gather'){
   m.lift=approach(m.lift,1,12);const previous=m.velocity,tracked=trackDrag(m.progress,m.velocity,target,dt,35/response/damping);m.progress=tracked.progress;m.velocity=tracked.velocity;if(dt>0)m.acceleration=(m.velocity-previous)/dt
 }else if(m.phase==='turn'){
   m.elapsedMs+=dt*1000/response;const previous=m.progress,v=m.velocity;m.progress=chunkAutoProgress(m.elapsedMs,count);if(dt>0){m.velocity=(m.progress-previous)/dt;m.acceleration=(m.velocity-v)/dt}m.lift=smooth(0,150,m.elapsedMs)*(1-smooth(.65,1,m.progress))
   if(m.progress===1){m.lift=0;m.velocity=0;m.acceleration=0;m.goal=1;m.phase='landed'}
 }else if(m.phase==='release'){
   m.goal=goal;const released=stepTurn(m.progress,m.velocity,goal,dt,.55*response*damping,false,material?m.acceleration:undefined);m.progress=released.progress;m.velocity=released.velocity;m.acceleration=released.acceleration
   m.lift=approach(m.lift,goal===1?1-smooth(.55,.95,m.progress):0,10)
   if(m.progress===goal&&m.lift<.01){m.lift=0;m.phase='landed'}
 }
 // Source handoff: retain the gesture leaf only while gathering at the
 // origin or its visible curl has not decayed below .02. No automatic leaf.
 if(m.handoff){
   if(m.phase==='landed'){m.handoff=false;m.handoffCurl=0}
   else if(m.visible){
     // The first visible pose must actually contain the independent leaf.
     // A large dt on SwiftShader must not decay it before its first render.
     if(m.handoffFrames>0&&!(m.phase==='gather'&&m.progress<.02)){
       m.handoffCurl*=Math.pow(.82,dt*60)
       if(m.handoffCurl<.02){m.handoff=false;m.handoffCurl=0}
     }
     if(m.handoff)m.handoffFrames++
   }
 }
}
export function chunkCanCommit(m:ChunkMotion,renderProgress:number){return m.phase==='landed'&&m.landedFrames>=CHUNK_LANDED_FRAMES&&Math.abs(renderProgress-m.progress)<.002}
