import {PRESS_SCENE as R} from './referenceScene'
import {clamp} from './pagePhysics'
export type ReadingView={zoom:number;x:number;y:number}
export type ReadingBounds={width:number;height:number;left:number;right:number;top:number;bottom:number}
export const initialReadingView=():ReadingView=>({zoom:1,x:0,y:0})
export function panLimits(b:ReadingBounds,z:number){
 const left=b.left*z,right=b.right*z,top=b.top*z,bottom=b.bottom*z
 // If the spread fits, retain its baseline center. Otherwise constrain
 // its two edges to the viewport. Coordinates are relative to viewport center.
 const x=b.width/2,y=b.height/2
 return {minX:right-left<=b.width?0:x-right,maxX:right-left<=b.width?0:-x-left,minY:bottom-top<=b.height?0:y-bottom,maxY:bottom-top<=b.height?0:-y-top}
}
export function clampReadingView(v:ReadingView,b:ReadingBounds):ReadingView{
 const zoom=clamp(v.zoom,R.zoomMin,R.zoomMax),p=panLimits(b,zoom)
 return {zoom,x:clamp(v.x,p.minX,p.maxX),y:clamp(v.y,p.minY,p.maxY)}
}
export function zoomAround(v:ReadingView,zoom:number,x:number,y:number,b:ReadingBounds){
 zoom=clamp(zoom,R.zoomMin,R.zoomMax);const scale=zoom/v.zoom
 return clampReadingView({zoom,x:x-(x-v.x)*scale,y:y-(y-v.y)*scale},b)
}
export function rubber(value:number,min:number,max:number,scale:number){
 const edge=clamp(value,min,max),excess=value-edge;return edge+excess*R.zoomRubber/(1+Math.abs(excess)/Math.max(1,scale))
}
export function springReading(value:ReadingView,velocity:ReadingView,target:ReadingView,dt:number){
 let remain=clamp(dt,0,.1)
 const k=R.readSpringStiffness,c=2*R.readSpringDamping*Math.sqrt(k)
 let done=true
 for(const key of ['zoom','x','y'] as const){
   let v=value[key],speed=velocity[key],time=remain
   while(time>1e-8){const step=Math.min(time,1/120);time-=step;speed+=(-k*(v-target[key])-c*speed)*step;v+=speed*step}
   const eps=key==='zoom'?.0001:.05
   if(Math.abs(v-target[key])<=eps&&Math.abs(speed)<=eps*10){v=target[key];speed=0}else done=false
   value[key]=v;velocity[key]=speed
 }
 return done
}
