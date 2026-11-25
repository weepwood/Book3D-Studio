// Discrete material-edge objective, not a calibrated FEM. Optimize a single
// shared vertical displacement per cross-section, subject to unilateral
// clearance lower bounds. The binding column and exact endpoint are fixed.
export type SectionEdge={a:number;b:number;dx:number;dy:number;dz:number;rest:number}
export type SectionScore={energy:number;maxError:number}
export function sectionScore(lifts:Float64Array,edges:readonly SectionEdge[]):SectionScore{
 let energy=0,maxError=0
 for(const e of edges){const length=Math.hypot(e.dx,e.dy,e.dz+lifts[e.b]-lifts[e.a]),error=length/e.rest-1;energy+=error*error;maxError=Math.max(maxError,Math.abs(error))}
 return {energy:energy/Math.max(1,edges.length),maxError}
}
export function solveSectionClearance(lifts:Float64Array,minimum:Float64Array,edges:readonly SectionEdge[],cols:number,strength:number,iterations=6){
 const initial=sectionScore(lifts,edges),candidate=lifts.slice(),gradient=new Float64Array(lifts.length),weights=new Float64Array(lifts.length)
 let score=initial,accepted=0
 if(strength<=0||!edges.length)return {initial,final:score,accepted}
 for(const e of edges){weights[e.a]+=1/e.rest**2;weights[e.b]+=1/e.rest**2}
 for(let i=0;i<iterations;i++){
  gradient.fill(0)
  for(const e of edges){const z=e.dz+lifts[e.b]-lifts[e.a],length=Math.hypot(e.dx,e.dy,z);if(length<1e-12)continue
   const g=2*(length/e.rest-1)*z/(length*e.rest);gradient[e.a]-=g;gradient[e.b]+=g}
  let changed=false
  for(const rate of [.25,.1,.04]){
   for(let j=0;j<lifts.length;j++)candidate[j]=j%cols===0?lifts[j]:Math.max(minimum[j],lifts[j]-rate*strength*gradient[j]/Math.max(1e-8,weights[j]))
   const next=sectionScore(candidate,edges)
   if(next.energy<score.energy-1e-12&&next.maxError<=score.maxError+1e-10){lifts.set(candidate);score=next;accepted++;changed=true;break}
  }
  if(!changed)break
 }
 return {initial,final:score,accepted}
}
