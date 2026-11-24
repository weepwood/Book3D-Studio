import {PRESS_SCENE as R} from './referenceScene'
import {clamp} from './pagePhysics'
export type ReadingView={zoom:number;x:number;y:number}
export type ReadingBounds={width:number;height:number;left:number;right:number;top:number;bottom:number;pageWidth?:number;safeTop?:number;safeBottom?:number;restCenterY?:number}
export const initialReadingView=():ReadingView=>({zoom:1,x:0,y:0})
export function panLimits(b:ReadingBounds,z:number){
 const left=b.left*z,right=b.right*z,top=b.top*z,bottom=b.bottom*z
 // If the spread fits, retain its baseline center. Otherwise constrain
 // its two edges to the viewport. Coordinates are relative to viewport center.
 const x=b.width/2,y=b.height/2
 const topLimit=-y+(b.safeTop??0),bottomLimit=y-(b.safeBottom??0),fits=bottom-top<=bottomLimit-topLimit
 const offset=b.safeTop!==undefined?(topLimit+bottomLimit-top-bottom)/2+(b.restCenterY??0)*z:0
 // Fit math may leave a subpixel floating-point remainder at the reset pose.
 const center=Math.abs(offset)<1e-9?0:fits?clamp(offset,topLimit-top,bottomLimit-bottom):offset
 return {minX:right-left<=b.width?0:x-right,maxX:right-left<=b.width?0:-x-left,minY:fits?center:bottomLimit-bottom,maxY:fits?center:topLimit-top}
}
export function clampReadingView(v:ReadingView,b:ReadingBounds):ReadingView{
 const zoom=clamp(v.zoom,R.zoomMin,R.zoomMax),p=panLimits(b,zoom)
 return {zoom,x:clamp(v.x,p.minX,p.maxX),y:clamp(v.y,p.minY,p.maxY)}
}
export function zoomAround(v:ReadingView,zoom:number,x:number,y:number,b:ReadingBounds){
 zoom=clamp(zoom,R.zoomMin,R.zoomMax);const scale=zoom/v.zoom
 return clampReadingView({zoom,x:x-(x-v.x)*scale,y:y-(y-v.y)*scale},b)
}
export function rubber(value:number,min:number,max:number,scale:number,strength:number=R.zoomRubber){
 const edge=clamp(value,min,max),excess=value-edge;return edge+excess*strength/(1+Math.abs(excess)/Math.max(1,scale))
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

// The public reader switches from pending to page/pan after 8px and
// permits page turns at the respective horizontal pan boundary.
export function touchPageAllowed(b:ReadingBounds,v:ReadingView,direction:1|-1){
 const p=panLimits(b,v.zoom);return direction===1?v.x<=p.minX+R.edgeTolerancePx:v.x>=p.maxX-R.edgeTolerancePx
}
export function snapReadingView(v:ReadingView,b:ReadingBounds,velocityX=0):ReadingView{
 const target=clampReadingView(v,b),p=panLimits(b,target.zoom)
 const width=(b.right-b.left)*target.zoom,single=(b.pageWidth??(b.right-b.left)/2)*target.zoom
 if(width>b.width*R.spreadSlack&&single<=b.width&&p.maxX-p.minX>=1){
   target.x=v.x+velocityX*R.snapLookahead>(p.minX+p.maxX)/2?p.maxX:p.minX
 }
 return target
}
export function pinchReading(v:ReadingView,ratio:number,origin:{x:number;y:number},center:{x:number;y:number},b:ReadingBounds){
 const zoom=rubber(v.zoom*Math.max(.01,ratio),R.zoomMin,R.zoomMax,1),scale=zoom/v.zoom
 const p=panLimits(b,zoom)
 return {zoom,x:rubber(center.x-(origin.x-v.x)*scale,p.minX,p.maxX,b.width,R.panRubber),y:rubber(center.y-(origin.y-v.y)*scale,p.minY,p.maxY,b.height,R.panRubber)}
}

// Local editor projection adapter: source fit fraction .96, reserve the
// actual viewport controls instead of the source site's 88/24px chrome.
export function fitReadingBounds(b:ReadingBounds,padding=12,verticalPadding=48,chrome?:{top:number;bottom:number}){
 const w=Math.max(1,b.right-b.left),h=Math.max(1,b.bottom-b.top),safeW=Math.max(1,b.width-2*Math.min(padding,b.width*.1))
 const top=chrome?Math.min(Math.max(0,chrome.top),b.height*.36):Math.min(verticalPadding,b.height*.15),bottom=chrome?Math.min(Math.max(0,chrome.bottom),b.height*.42):top
 const safeH=Math.max(1,b.height-top-bottom)
 const zoom=R.fitFraction*Math.min(safeW/w,safeH/h)
 const x=-(b.left+b.right)*zoom/2,y=-(b.top+b.bottom)*zoom/2+(top-bottom)/2
 return {zoom,x,y,bounds:{...b,...(chrome?{safeTop:top,safeBottom:bottom}:{}),left:b.left*zoom+x,right:b.right*zoom+x,top:b.top*zoom+y,bottom:b.bottom*zoom+y,pageWidth:b.pageWidth===undefined?undefined:b.pageWidth*zoom}}
}

// The static spread avoids the chrome, while the moving leaf may use the
// free central headroom of the canvas. Solve both constraints once.
export function fitReadingMotion(stable:ReadingBounds,motion:Pick<ReadingBounds,'left'|'right'|'top'|'bottom'>,chrome:{top:number;bottom:number}){
 const f=fitReadingBounds(stable,12,48,chrome),w=stable.width/2,h=stable.height/2
 const safeTop=f.bounds.safeTop!,safeBottom=f.bounds.safeBottom!,pad=Math.min(12,w*.2),motionPad=8
 type Range={min:number;max:number;lo:number;hi:number}
 const xs:Range[]=[{min:stable.left,max:stable.right,lo:-w+pad,hi:w-pad},{min:motion.left,max:motion.right,lo:-w+motionPad,hi:w-motionPad}]
 const ys:Range[]=[{min:stable.top,max:stable.bottom,lo:-h+safeTop,hi:h-safeBottom},{min:motion.top,max:motion.bottom,lo:-h+motionPad,hi:h-motionPad}]
 let zoom=f.zoom
 for(const axis of [xs,ys])for(const lower of axis)for(const upper of axis){const extent=upper.max-lower.min;if(extent>0)zoom=Math.min(zoom,(upper.hi-lower.lo)/extent*.98)}
 zoom=Math.max(.001,zoom)
 const offset=(axis:Range[],preferred:number)=>clamp(preferred,Math.max(...axis.map(r=>r.lo-r.min*zoom)),Math.min(...axis.map(r=>r.hi-r.max*zoom)))
 const x=offset(xs,-(stable.left+stable.right)*zoom/2),y=offset(ys,-(stable.top+stable.bottom)*zoom/2+(safeTop-safeBottom)/2)
 const project=(b:typeof motion)=>({left:b.left*zoom+x,right:b.right*zoom+x,top:b.top*zoom+y,bottom:b.bottom*zoom+y})
 const stableBounds=project(stable),motionBounds=project(motion),restCenterY=(stableBounds.top+stableBounds.bottom-safeTop+safeBottom)/2
 return {zoom,x,y,bounds:{...stable,...stableBounds,safeTop,safeBottom,restCenterY,pageWidth:stable.pageWidth===undefined?undefined:stable.pageWidth*zoom},stableBounds,motionBounds}
}
