import {PRESS_REFERENCE as R} from './pressReference'
import type {ChunkMotion} from './chunkMotion'
export const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,x))
export type TurnState={direction:1|-1;progress:number;renderProgress:number;velocity:number;grip:number;preview:boolean;dragTarget:number;curlAmount:number;grabU:number;span?:number;chunkElapsed?:number;chunkGesture?:boolean;chunkMotion?:ChunkMotion;dragOrigin?:number}
export function newTurn(direction:1|-1,grip=0,preview=false):TurnState{return {direction,progress:0,renderProgress:0,velocity:0,grip:clamp(grip,-1,1),preview,dragTarget:0,curlAmount:0,grabU:1}}
// Independent bounded-velocity adapter. Single turns, queued turns and
// gesture releases share the same integrator; only speed budgets differ.
// Velocity is always normalized progress per second, including after retarget.
export function stepTurn(progress:number,velocity:number,target:number,dt:number,duration:number,queued=false){
 const goal=clamp(target),scale=.85/Math.max(.3,duration)
 const maxSpeed=(queued?7:2.8)*scale,acceleration=(queued?75:25)*scale*scale,nearGain=(queued?28:10)*scale
 let p=clamp(progress),v=velocity,remaining=clamp(dt,0,.25)
 while(remaining>1e-8){
  const h=Math.min(1/120,remaining);remaining-=h
  const distance=goal-p,abs=Math.abs(distance)
  // Leave braking headroom. A proportional terminal velocity avoids the
  // abrupt endpoint stop of the previous constant-angle batch motion.
  const desired=Math.sign(distance)*Math.min(maxSpeed,.85*Math.sqrt(2*acceleration*abs),nearGain*abs)
  const before=v;v+=clamp(desired-v,-acceleration*h,acceleration*h)
  const raw=p+(before+v)*h/2;p=clamp(raw)
  if(raw!==p)v=0 // Physical endpoints are hard bounds, even on reversal.
  if(Math.abs(goal-p)<.0015&&Math.abs(v)<.01)return {progress:goal,velocity:0,settled:true}
 }
 return {progress:p,velocity:v,settled:false}
}
// One bounded clock for active-page physics. Excess wall time after a stall
// is deliberately dropped rather than teleporting through missing frames.
export class MotionClock {
 private remainder=0
 advance(dt:number){
  const quantum=1/120
  this.remainder+=clamp(dt,0,.05)
  const steps=Math.min(6,Math.floor((this.remainder+1e-10)/quantum))
  this.remainder=Math.max(0,this.remainder-steps*quantum)
  return steps*quantum
 }
 reset(){this.remainder=0}
}
// Exact critically damped tracking; a new target preserves incoming velocity.
export function trackDrag(progress:number,velocity:number,target:number,dt:number,omega=45){
 const t=clamp(dt,0,.05),goal=clamp(target),error=progress-goal,b=velocity+omega*error,e=Math.exp(-omega*t)
 const raw=goal+(error+b*t)*e,p=clamp(raw),v=(velocity-omega*b*t)*e
 return {progress:p,velocity:raw!==p?0:v}
}
export function followDrag(progress:number,target:number,dt:number){
  return progress+(clamp(target)-progress)*(1-Math.pow(R.dragRetention,clamp(dt,0,R.maxDt)*R.fps))
}
export function followRender(render:number,progress:number,dt:number){
  return render+(progress-render)*(1-Math.pow(1-R.renderFollow,clamp(dt,0,R.maxDt)*R.fps))
}
// Reference snap side is selected by final drag direction, not predicted speed.
export function releaseCommit(displacementPx:number){return displacementPx>=R.dragThresholdPx}
export function stackLayout(index:number,count:number,depth:number,turn:{direction:1|-1;progress:number}|null){
  const n=Math.max(1,count),unit=depth/n,read=clamp(index,0,n)
  const active=!!turn&&(turn.direction===1?read<n:read>0)
  const left=unit*(read-(active&&turn!.direction===-1?1:0)),right=unit*(n-read-(active&&turn!.direction===1?1:0))
  return {left,right,moving:active?unit:0}
}
export function anchorBetween(from:{x:number;z:number},to:{x:number;z:number},p:number){
  p=clamp(p)
  return {x:from.x+(to.x-from.x)*p,z:from.z+(to.z-from.z)*p+Math.sin(Math.PI*p)*Math.abs(to.z-from.z)*.55}
}

// Direct manipulation uses the projected page travel, not the whole canvas.
// Keep the original reference curve for touch and automatic paths.
export function projectedDrag(x:number,y:number,dx:number,dy:number,travel:number){return {distance:x*dx+y*dy,progress:clamp((x*dx+y*dy)/Math.max(48,travel),-1,1)}}
export function stepManualRelease(progress:number,target:0|1,dt:number,duration:number){
 const rate=8/Math.max(.3,duration),next=progress+(target-progress)*(1-Math.exp(-rate*clamp(dt,0,.25)))
 return Math.abs(target-next)<.002?{progress:target,velocity:0,settled:true}:{progress:next,velocity:0,settled:false}
}
