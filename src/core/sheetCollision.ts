// Diagnostic on the actual CPU-deformed paper cross-sections. This detects
// proper crossings, not contact at a shared sewing edge or coplanar overlap.
export type SectionPoint={x:number;z:number}
const cross=(a:SectionPoint,b:SectionPoint,c:SectionPoint)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)
export function sectionCrossings(a:SectionPoint[],b:SectionPoint[],eps=1e-8){let n=0;for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){const p=a[i-1],q=a[i],r=b[j-1],s=b[j];if(Math.max(p.x,q.x)<Math.min(r.x,s.x)||Math.max(r.x,s.x)<Math.min(p.x,q.x)||Math.max(p.z,q.z)<Math.min(r.z,s.z)||Math.max(r.z,s.z)<Math.min(p.z,q.z))continue;const u=cross(p,q,r),v=cross(p,q,s),w=cross(r,s,p),t=cross(r,s,q);if(((u>eps&&v< -eps)||(v>eps&&u< -eps))&&((w>eps&&t< -eps)||(t>eps&&w< -eps)))n++}return n}
