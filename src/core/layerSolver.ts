import {createSectionWorkspace,solveSectionClearance,type SectionEdge} from './sectionSolver'
// Three independently adjustable representative material layers, not one
// degree of freedom for every physical sheet. Internal nodes are virtual;
// all rendered seam copies must share their material key.
export function createLayerSolver(cols:number,rows:number,width:number,height:number){
 const n=cols*rows,size=3*n,dx=width/(cols-1),dy=height/(rows-1)
 const offsets=new Float64Array(size),minimum=new Float64Array(size),limits=new Float64Array(2*n),x=new Float64Array(size),y=new Float64Array(size),z=new Float64Array(size),seen=new Uint8Array(size)
 const edges:SectionEdge[]=[],workspace=createSectionWorkspace(size)
 const edge=(a:number,b:number,rest:number)=>edges.push({a,b,rest,dx:0,dy:0,dz:0})
 for(let layer=0;layer<3;layer++)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const a=layer*n+r*cols+c
  if(c+1<cols)edge(a,a+1,dx)
  if(r+1<rows)edge(a,a+cols,dy)
  if(c+1<cols&&r+1<rows)edge(a,a+cols+1,Math.hypot(dx,dy))
 }
 function begin(){seen.fill(0);offsets.fill(0)}
 function set(k:number,a:number,b:number,c:number){seen[k]=1;x[k]=a;y[k]=b;z[k]=c}
 function solve(strength:number,depth:number,floor:number,clearance?:(x:number)=>number){
  const cap=Math.min(width*.05,depth*.15)*strength
  for(let i=0;i<n;i++){
   if(!seen[i]||!seen[2*n+i])return null
   if(!seen[n+i])set(n+i,(x[i]+x[2*n+i])*.5,(y[i]+y[2*n+i])*.5,(z[i]+z[2*n+i])*.5)
  }
  for(let k=0;k<size;k++)minimum[k]=Math.max(-cap,Math.min(0,Math.max(floor,clearance?.(x[k])??-Infinity)-z[k]))
  for(let k=0;k<2*n;k++)limits[k]=.05*Math.hypot(x[k+n]-x[k],y[k+n]-y[k],z[k+n]-z[k])*strength
  for(const e of edges){e.dx=x[e.b]-x[e.a];e.dy=y[e.b]-y[e.a];e.dz=z[e.b]-z[e.a]}
  return solveSectionClearance(offsets,minimum,edges,cols,strength,6,workspace,candidate=>{
   for(let k=0;k<size;k++)candidate[k]=Math.min(cap,candidate[k])
   // Raise the lower offset, never break a clearance lower bound. Two
   // directional passes enforce both adjacent layer difference limits.
   for(let i=0;i<n;i++)if(i%cols!==0){
    candidate[n+i]=Math.max(candidate[n+i],candidate[i]-limits[i])
    candidate[2*n+i]=Math.max(candidate[2*n+i],candidate[n+i]-limits[n+i])
    candidate[n+i]=Math.max(candidate[n+i],candidate[2*n+i]-limits[n+i])
    candidate[i]=Math.max(candidate[i],candidate[n+i]-limits[i])
   }
  })
 }
 return {begin,set,solve,offsets}
}
