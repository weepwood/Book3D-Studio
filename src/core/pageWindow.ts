import {PRESS_REFERENCE as R} from './pressReference'
import {clamp} from './pagePhysics'
// Reference keeps six live leaves near the split. Here the same limit bounds
// a contiguous active batch; stationary stack meshes represent the remainder.
export const LIVE_LEAF_LIMIT=6
export type ActiveLeaf={direction:1|-1;progress:number;grip?:number;velocity?:number;curlAmount?:number;grabU?:number}
export function batchLayout(index:number,count:number,depth:number,direction:1|-1,requested:number){
  const unit=depth/Math.max(1,count),i=clamp(index,0,count)
  const active=Math.max(0,Math.min(LIVE_LEAF_LIMIT,Math.floor(requested),direction===1?count-i:i))
  const left=unit*(i-(direction===-1?active:0)),right=unit*(count-i-(direction===1?active:0))
  return {left,right,unit,active,moving:unit*active}
}
export function leafDepths(layout:ReturnType<typeof batchLayout>,direction:1|-1,slot:number){
  const {left,right,unit,active}=layout
  return direction===1?{left:left+unit*(slot+1),right:right+unit*(active-slot)}:{left:left+unit*(active-slot),right:right+unit*(slot+1)}
}
export function orderedProgress(leader:number,follower:number,tipFold=0){
  // Original angular constraint is .02 + .04*tipFold radians, smoothly
  // disappearing at the destination. Express it in normalized progress.
  const x=clamp((1-leader)*Math.PI/.15),gap=(.02+.04*clamp(tipFold))*x*x*(3-2*x)/Math.PI
  return Math.max(0,Math.min(follower,leader-gap))
}
export function desiredBatch(index:number,target:number,count:number,direction:1|-1){
  return Math.max(0,Math.min(LIVE_LEAF_LIMIT,direction*(target-index),direction===1?count-index:index))
}
export function gravityDrop(elapsedMs:number,slot:number,count:number){
  const p=clamp((elapsedMs-R.gravityDelayMs*(count-slot))/R.gravityDropMs);return p*p*(3-2*p)
}
