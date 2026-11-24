import * as T from 'three'

// Separate outer spine and inner lining, as observed in the source model.
// This parametric cross-section is an independent adapter for our XY book,
// not the original glTF skin weights or proprietary mesh.
export type BindingPose={hingeX:number;rearZ:number;frontZ:number;angle:number;board:number;inset:number;rounded:boolean}
type Point={x:number;z:number}
export function bindingSection(p:BindingPose,u:number,inner=false):Point{
 const q=T.MathUtils.clamp(u,0,1),ca=Math.cos(p.angle),sa=Math.sin(p.angle)
 const lip=Math.min(p.inset*.65,p.board*1.2),face=(inner?-1:1)*p.board/2
 const a={x:p.hingeX+lip,z:p.rearZ-face}
 const d={x:p.hingeX+lip*ca+face*sa,z:p.frontZ-lip*sa+face*ca}
 // Both ends remain on their respective cover surfaces. A cubic path
 // follows the hinge tangent; the square variant uses straight runs.
 const fold=T.MathUtils.clamp(Math.abs(p.angle)/Math.PI,0,1)
 const handle=lip*.65+Math.abs(p.frontZ-p.rearZ)*.35*(1-fold)
 const c1={x:a.x-handle,z:a.z},c2={x:d.x-handle*ca,z:d.z+handle*sa}
 if(!p.rounded){
   const points=[a,c1,c2,d],k=Math.min(2,Math.floor(q*3)),t=q*3-k
   return {x:T.MathUtils.lerp(points[k].x,points[k+1].x,t),z:T.MathUtils.lerp(points[k].z,points[k+1].z,t)}
 }
 const v=1-q
 return {x:v*v*v*a.x+3*v*v*q*c1.x+3*v*q*q*c2.x+q*q*q*d.x,z:v*v*v*a.z+3*v*v*q*c1.z+3*v*q*q*c2.z+q*q*q*d.z}
}
export function createBindingGeometry(height:number,inner=false){
 const g=new T.PlaneGeometry(1,height,48,1),pos=g.getAttribute('position'),uv=g.getAttribute('uv')
 return {g,pose(p:BindingPose){
   for(let i=0;i<pos.count;i++){const v=bindingSection(p,uv.getX(i),inner);pos.setXYZ(i,v.x,pos.getY(i),v.z)}
   pos.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere()
 }}
}
