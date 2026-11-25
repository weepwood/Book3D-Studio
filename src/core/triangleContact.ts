import { Box3, Triangle, Vector3 } from 'three'
export type ContactKind = 'none' | 'touch' | 'penetration' | 'coplanar'
// Classify surface intersections in world units. Degenerate faces are ignored.
export function triangleContact(a: Triangle, b: Triangle, eps = 1e-7): ContactKind {
  if (!new Box3().setFromPoints([a.a,a.b,a.c]).expandByScalar(eps).intersectsBox(new Box3().setFromPoints([b.a,b.b,b.c]))) return 'none'
  const na=a.getNormal(new Vector3()), nb=b.getNormal(new Vector3())
  if (!na.lengthSq() || !nb.lengthSq()) return 'none'
  const av=[a.a,a.b,a.c], bv=[b.a,b.b,b.c]
  const da=av.map(p=>nb.dot(p.clone().sub(b.a))), db=bv.map(p=>na.dot(p.clone().sub(a.a)))
  const separated=(d:number[])=>d.every(x=>x>eps)||d.every(x=>x< -eps)
  if(separated(da)||separated(db)) return 'none'
  const axis=na.clone().cross(nb)
  if(axis.lengthSq()<1e-16){
    if(da.some(d=>Math.abs(d)>eps)||db.some(d=>Math.abs(d)>eps))return 'none'
    // Clip A against the three inward half planes of B; measure overlap area.
    let poly=av.map(p=>p.clone())
    for(let i=0;i<3;i++){
      const p=bv[i], inward=nb.clone().cross(bv[(i+1)%3].clone().sub(p)).normalize()
      const next:Vector3[]=[]
      for(let j=0;j<poly.length;j++){
        const x=poly[j],y=poly[(j+1)%poly.length],dx=inward.dot(x.clone().sub(p)),dy=inward.dot(y.clone().sub(p))
        if(dx>=-eps)next.push(x)
        if((dx>=-eps)!==(dy>=-eps))next.push(x.clone().lerp(y,Math.max(0,Math.min(1,dx/(dx-dy)))))
      }poly=next
    }
    if(!poly.length)return 'none'
    let area=0;for(let i=1;i+1<poly.length;i++)area+=poly[i].clone().sub(poly[0]).cross(poly[i+1].clone().sub(poly[0])).length()/2
    return area>eps*eps?'coplanar':'touch'
  }
  axis.normalize()
  const interval=(v:Vector3[],d:number[])=>{const points:number[]=[];for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(d[i])<=eps)points.push(axis.dot(v[i]));if(d[i]*d[j]<0)points.push(axis.dot(v[i].clone().lerp(v[j],d[i]/(d[i]-d[j]))))}return [Math.min(...points),Math.max(...points)]}
  const [al,ah]=interval(av,da),[bl,bh]=interval(bv,db),overlap=Math.min(ah,bh)-Math.max(al,bl)
  if(overlap< -eps)return 'none'
  const straddles=(d:number[])=>d.some(x=>x>eps)&&d.some(x=>x< -eps)
  return overlap>eps&&straddles(da)&&straddles(db)?'penetration':'touch'
}
