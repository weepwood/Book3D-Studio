import * as T from 'three'

// Separate outer spine and inner lining, as observed in the source model.
// This parametric cross-section is an independent adapter for our XY book,
// not the original glTF skin weights or proprietary mesh.
export type BindingPose={hingeX:number;rearZ:number;frontZ:number;angle:number;board:number;inset:number;rounded:boolean}
type Point={x:number;z:number}
export function bindingSection(p:BindingPose,u:number,inner=false):Point{
 const q=T.MathUtils.clamp(u,0,1),ca=Math.cos(p.angle),sa=Math.sin(p.angle)
 const fold=T.MathUtils.clamp(Math.abs(p.angle)/Math.PI,0,1),face=(inner?-1:1)*p.board/2
 // Closed spine joins the outside board edges, not coplanar board faces.
 // Inner lining has its own interior-normal clearance; the two curves
 // cannot share the closed spine midpoint as in the previous construction.
 const lip=Math.min(p.inset*.65,p.board*1.2)*Math.min(1,fold*4)
 const a={x:p.hingeX+lip,z:p.rearZ-face}
 const d={x:p.hingeX+lip*ca+face*sa,z:p.frontZ-lip*sa+face*ca}
 const handle=lip*.65+Math.abs(p.frontZ-p.rearZ)*.20*(1-fold)
 const inset=inner?p.board*.85*(1-fold):0
 const c1={x:a.x-handle+inset,z:a.z},c2={x:d.x-handle*ca+inset*ca,z:d.z+handle*sa-inset*sa}
 let point:Point
 if(!p.rounded){
   const points=[a,c1,c2,d],k=Math.min(2,Math.floor(q*3)),t=q*3-k
   point={x:T.MathUtils.lerp(points[k].x,points[k+1].x,t),z:T.MathUtils.lerp(points[k].z,points[k+1].z,t)}
 }else{
   const v=1-q
   point={x:v*v*v*a.x+3*v*v*q*c1.x+3*v*q*q*c2.x+q*q*q*d.x,z:v*v*v*a.z+3*v*v*q*c1.z+3*v*q*q*c2.z+q*q*q*d.z}
 }
 // Interior offset is zero at the sewn joints and strongest at the middle.
 // At full opening the existing separated cover planes supply clearance.
 if(inner){const separation=p.board*.5*Math.sin(Math.PI*q)*(1-fold);point.x+=separation*Math.cos(-p.angle/2);point.z+=separation*Math.sin(-p.angle/2)}
 return point
}
export function createBindingGeometry(height:number,inner=false){
 const g=new T.PlaneGeometry(1,height,48,1),pos=g.getAttribute('position'),uv=g.getAttribute('uv')
 return {g,pose(p:BindingPose){
   for(let i=0;i<pos.count;i++){const v=bindingSection(p,uv.getX(i),inner);pos.setXYZ(i,v.x,pos.getY(i),v.z)}
   pos.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere()
 }}
}
