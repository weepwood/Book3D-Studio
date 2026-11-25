export type ContactEvidence={a:string;b:string;kind:string;point:number[]}
// Conservative trial steps: accept only measured improvement, never move the sewing root.
export function contactCorrection(samples:readonly ContactEvidence[],rootX:number,width:number,maxLift:number){
 const relevant=samples.filter(s=>s.kind==='penetration'&&s.point.length===3&&s.point.every(Number.isFinite)&&[s.a,s.b].some(n=>n.startsWith('leaf-')||n==='chunk'||n==='handoff')&&[s.a,s.b].some(n=>/cover|page block/i.test(n)))
 const weights=relevant.map(s=>Math.min(1,Math.abs(s.point[0]-rootX)/Math.max(width,1e-6)))
 return Math.min(maxLift,Math.max(0,...weights.map(w=>w*maxLift)))
}
export function acceptCorrection(before:number,after:number){return Number.isFinite(after)&&after<before}

// Only boundary contacts in the explicit sewing band may be classified as binding.
export function isBindingContact(a:string,b:string,point:number[],rootX:number,width:number){return width>0&&Math.abs(point[0]-rootX)<=width&&[a,b].some(n=>/spine|cover|page block/i.test(n))&&a!==b}
export function contactScore(c:{penetration:number;coplanar:number}){return c.penetration+c.coplanar}

export function improvesContacts(before:{penetration:number;coplanar:number},after:{penetration:number;coplanar:number}){
 return after.penetration<=before.penetration&&after.coplanar<=before.coplanar&&acceptCorrection(contactScore(before),contactScore(after))
}
