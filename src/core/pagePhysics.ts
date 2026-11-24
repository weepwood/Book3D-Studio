import {PRESS_REFERENCE as R} from './pressReference'
import type {ChunkMotion} from './chunkMotion'
export const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,x))
export type TurnState={direction:1|-1;progress:number;renderProgress:number;velocity:number;grip:number;preview:boolean;dragTarget:number;curlAmount:number;grabU:number;span?:number;chunkElapsed?:number;chunkGesture?:boolean;chunkMotion?:ChunkMotion;dragOrigin?:number}
export function newTurn(direction:1|-1,grip=0,preview=false):TurnState{return {direction,progress:0,renderProgress:0,velocity:0,grip:clamp(grip,-1,1),preview,dragTarget:0,curlAmount:0,grabU:1}}
// Angular snap behavior observed in the reference. The editor duration remains an optional time scale.
export function stepTurn(progress:number,velocity:number,target:number,dt:number,duration:number,queued=false){
  const frames=clamp(dt,0,.25)*R.fps*.85/Math.max(.3,duration)
  let angle=progress*Math.PI,speed=velocity*Math.PI/R.fps
  const goal=clamp(target)*Math.PI
  let remaining=frames
  while(remaining>1e-8){
    const f=Math.min(1,remaining);remaining-=f
    const delta=goal-angle,distance=Math.abs(delta),sign=Math.sign(delta)
    if(queued){const step=R.multiPageStep*f;if(distance<=step){angle=goal;speed=0}else{angle+=sign*step;speed=sign*R.multiPageStep}}
    else{
      const near=1-Math.min(distance/R.nearRange,1)
      speed+=R.snapAcceleration*sign*Math.sin(Math.min(distance,Math.PI/2))*f
      speed*=Math.pow(1-Math.min(.98,.4*R.damping+near*near*R.nearDamping),f)
      // Local convergence guard: the reference damping/acceleration pair can
      // crawl exponentially at the final few degrees, especially at a 2s
      // editor duration on a software-rendered browser. Keep braking motion
      // intact when moving away, then bound the approach time continuously.
      const terminalSpeed=distance*.04*near*near
      if(sign!==0&&speed*sign>=0&&Math.abs(speed)<terminalSpeed)speed=sign*terminalSpeed
      angle=clamp(angle+speed*f,0,Math.PI)
      if(angle===0||angle===Math.PI)speed=0
    }
    if(Math.abs(goal-angle)<R.settleAngle&&Math.abs(speed)<R.settleVelocity)return {progress:target,velocity:0,settled:true}
  }
  return {progress:angle/Math.PI,velocity:speed*R.fps/Math.PI,settled:false}
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
