export const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,x))
export type TurnState={direction:1|-1;progress:number;velocity:number;grip:number;preview:boolean}
export function newTurn(direction:1|-1,grip=0,preview=false):TurnState{return {direction,progress:0,velocity:0,grip:clamp(grip,-1,1),preview}}
export function stepTurn(progress:number,velocity:number,target:number,dt:number,duration:number){
  const omega=8/Math.max(.3,duration),t=clamp(dt,0,.1),x=progress-target,b=velocity+omega*x,e=Math.exp(-omega*t)
  let p=target+(x+b*t)*e,v=(velocity-omega*b*t)*e
  if(p<=0||p>=1){p=clamp(p);v=0}
  if(Math.abs(p-target)<.002&&Math.abs(v)<.025)return {progress:target,velocity:0,settled:true}
  return {progress:p,velocity:v,settled:false}
}
export function releaseCommit(progress:number,velocity:number){return progress>=.8||clamp(progress+clamp(velocity,-3,3)*.14)>=.42}
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
