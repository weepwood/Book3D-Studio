import {clamp} from './pagePhysics'

// Commands, rather than target distance, distinguish a reading burst from a
// direct seek. The controller only governs admission and speed; the existing
// physical solver still owns each leaf and renders its endpoint before commit.
export class TurnInput {
 private last=-Infinity
 private interval=.32
 private direction:1|-1=1
 private count=0
 active=false
 reset(){this.last=-Infinity;this.interval=.32;this.count=0;this.active=false}
 push(direction:1|-1,now:number){
  const elapsed=(now-this.last)/1000
  if(direction!==this.direction||elapsed>.8||elapsed<0){this.interval=.32;this.count=1}
  else{this.interval=this.count===1?clamp(elapsed,.065,.8):.65*this.interval+.35*clamp(elapsed,.065,.8);this.count++}
  this.direction=direction;this.last=now;this.active=true
 }
 timing(backlog:number){
  const rate=this.count>1?clamp((.36-this.interval)/.29):0
  const urgency=Math.max(rate,clamp((backlog-1)/8))
  return {durationScale:.76-.34*urgency,interval:clamp(this.interval*.85,.075,.25),gap:.14+.10*(1-urgency),terminalGain:10+10*urgency}
 }
}

// Gesture evidence comes from the pointer, not the last rendered frame.
// A deliberate reverse can cancel a regrab; a paused release has no inertia.
export function gestureIntent(previous:boolean,target:number){return target>=.52?true:target<=.28?false:previous}
export function releaseGesture(target:number,velocity:number,distance:number,regrab:boolean,group:number,latched=false){
 const p=clamp(target),v=clamp(velocity,-4,4),predicted=clamp(p+v*.14)
 if(regrab&&distance<-5&&p<.72)return false
 if(group>1)return distance>=5||regrab&&distance>-5&&p>=.5
 if(regrab&&Math.abs(distance)<5)return p>=.5
 if(distance<5&&!regrab)return false
 return p>=.62||latched&&p>=.28&&predicted>=.23||predicted>=.38&&p>=.12
}
