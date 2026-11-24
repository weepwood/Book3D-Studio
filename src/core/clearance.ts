// Conservative 2D cross-section of a rotated slab. Clip to the opposite
// paper block's horizontal footprint before measuring vertical clearance.
type Point={x:number;z:number}
function clip(points:Point[],edge:number,sign:1|-1){const out:Point[]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],inside=(a.x-edge)*sign>=0,next=(b.x-edge)*sign>=0;if(inside)out.push(a);if(inside!==next){const t=(edge-a.x)/(b.x-a.x);out.push({x:edge,z:a.z+(b.z-a.z)*t})}}return out}
export function overlappingSlabFloor(angle:number,x0:number,x1:number,z0:number,z1:number,lo:number,hi:number){
 const ca=Math.cos(angle),sa=Math.sin(angle),points=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>({x:x*ca+z*sa,z:-x*sa+z*ca}));const overlap=clip(clip(points,lo,1),hi,-1)
 return overlap.length?Math.min(...overlap.map(p=>p.z)):Infinity
}
export function safeHingeZ(nominal:number,base:number,rightDepth:number,leftDepth:number,width:number,paperWidth:number,gutter:number,board:number,coverAngle:number,pageAngle:number){
 const top=base+rightDepth,lo=gutter,hi=gutter+paperWidth
 const cover=overlappingSlabFloor(coverAngle,0,width,-board/2,board/2,lo,hi)
 const paper=leftDepth>0?overlappingSlabFloor(pageAngle,gutter,hi,-board/2-leftDepth,-board/2,lo,hi):Infinity
 const correction=Math.max(0,top-nominal-Math.min(cover,paper))
 return nominal+correction
}
