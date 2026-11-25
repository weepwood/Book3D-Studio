import {sampleChain,type Chain} from './pageChain'
// Discrete curve quality diagnostics. The polyline approximates the Hermite
// curve; energy is an estimate per unit width, not a nonlinear FEM solution.
export function curveMetrics(chain:Chain,rigidity=1,segments=128){
 const n=Math.max(2,Math.min(1024,Math.floor(segments))),ds=chain.width/n,dsMeters=ds*.1
 let last=sampleChain(chain,0),angle=Math.atan2(last.tz,last.tx),length=0,bendingEnergy=0,maxCurvature=0
 for(let i=1;i<=n;i++){
  const p=sampleChain(chain,i/n),a=Math.atan2(p.tz,p.tx),delta=Math.atan2(Math.sin(a-angle),Math.cos(a-angle)),curvature=delta/dsMeters
  length+=Math.hypot(p.x-last.x,p.z-last.z);bendingEnergy+=.5*rigidity*curvature*curvature*dsMeters;maxCurvature=Math.max(maxCurvature,Math.abs(curvature));last=p;angle=a
 }
 const root=sampleChain(chain,0)
 return {length,relativeLengthError:Math.abs(length-chain.width)/chain.width,bendingEnergy,maxCurvature,rootError:Math.hypot(root.x,root.z)}
}
