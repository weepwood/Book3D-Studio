import type {BufferGeometry} from 'three'
export type SurfaceMetrics={triangles:number;invalid:number;areaRatio:number;maxAreaError:number;maxStretch:number;maxCompression:number;minStretch:number}
// Measure the first fundamental form of each piecewise-linear triangle.
// x/y reference coordinates are in the paper's material frame, not world XY.
export function measureSurface(g:BufferGeometry,width:number,height:number,face?:number):SurfaceMetrics{
 const p=g.getAttribute('position'),uv=g.getAttribute('uv'),idx=g.index
 const group=face===undefined?{start:0,count:idx?.count??p.count}:g.groups.find(g=>g.materialIndex===face)
 let triangles=0,invalid=0,area=0,restArea=0,maxAreaError=0,maxStretch=0,maxCompression=0,minStretch=Infinity
 if(!group||!uv)return {triangles,invalid:1,areaRatio:0,maxAreaError,maxStretch,maxCompression,minStretch:0}
 for(let i=group.start;i+2<group.start+group.count;i+=3){
  const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2
  const u=(uv.getX(b)-uv.getX(a))*width,v=(uv.getY(b)-uv.getY(a))*height,s=(uv.getX(c)-uv.getX(a))*width,t=(uv.getY(c)-uv.getY(a))*height,det=u*t-v*s
  if(Math.abs(det)<1e-14){invalid++;continue}
  const bx=p.getX(b)-p.getX(a),by=p.getY(b)-p.getY(a),bz=p.getZ(b)-p.getZ(a),cx=p.getX(c)-p.getX(a),cy=p.getY(c)-p.getY(a),cz=p.getZ(c)-p.getZ(a)
  const x=(bx*t-cx*v)/det,y=(by*t-cy*v)/det,z=(bz*t-cz*v)/det
  const X=(cx*u-bx*s)/det,Y=(cy*u-by*s)/det,Z=(cz*u-bz*s)/det
  const aa=x*x+y*y+z*z,bb=X*X+Y*Y+Z*Z,ab=x*X+y*Y+z*Z
  const disc=Math.hypot(aa-bb,2*ab),hi=Math.sqrt(Math.max(0,(aa+bb+disc)/2)),lo=Math.sqrt(Math.max(0,(aa+bb-disc)/2)),ratio=hi*lo
  if(!Number.isFinite(ratio)){invalid++;continue}
  const r=Math.abs(det)*.5;restArea+=r;area+=r*ratio;triangles++;maxAreaError=Math.max(maxAreaError,Math.abs(ratio-1));maxStretch=Math.max(maxStretch,hi-1);maxCompression=Math.max(maxCompression,1-lo);minStretch=Math.min(minStretch,lo)
 }
 return {triangles,invalid,areaRatio:restArea?area/restArea:0,maxAreaError,maxStretch,maxCompression,minStretch:Number.isFinite(minStretch)?minStretch:0}
}
export function surfaceSummary(){return {samples:0,triangles:0,invalid:0,maxAreaError:0,maxStretch:0,maxCompression:0,maxTotalAreaError:0}}
export function accumulateSurface(summary:ReturnType<typeof surfaceSummary>,m:SurfaceMetrics){
 summary.samples++;summary.triangles+=m.triangles;summary.invalid+=m.invalid;summary.maxAreaError=Math.max(summary.maxAreaError,m.maxAreaError);summary.maxStretch=Math.max(summary.maxStretch,m.maxStretch);summary.maxCompression=Math.max(summary.maxCompression,m.maxCompression);summary.maxTotalAreaError=Math.max(summary.maxTotalAreaError,Math.abs(m.areaRatio-1))
}
