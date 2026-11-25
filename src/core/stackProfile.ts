import {clamp} from './pagePhysics'
export const PRESS_STACK_PROFILE={curlFrontPower:3.481001,curlEndReverse:.089355,curlReversePower:1.991211,pageCurlFrontPower:4,stackCurlFrontPower:4,curlFlop:.6,tipFlopRad:1.6,tipFlopFromU:.5,tipFlopFalloff:1,tipFlopBand:.28,nestGapMul:2.223722,fanShearGain:.169922,fanPower:1,curlSweepMaxDeg:205.349254,thicknessPct:.69881,bookStackThicknessPct:.632022} as const
// Reference profile (module 67291): normalised fore-edge bend and reverse-end term.
export function stackBend(u:number,front:number=PRESS_STACK_PROFILE.curlFrontPower,reverse:number=PRESS_STACK_PROFILE.curlEndReverse,power:number=PRESS_STACK_PROFILE.curlReversePower){
 const x=clamp(u)
 return 1-Math.pow(1-x,Math.max(.2,front))-Math.max(0,reverse)*Math.pow(x,Math.max(.2,power))
}
export function stackSweep(stiffness:number){return Math.min(PRESS_STACK_PROFILE.curlSweepMaxDeg*Math.PI/180,6*Math.max(0,stiffness))}
// The model's local axis mapping and stack offsets are not yet verified.
// This sampler is evidence-based staging, not a renderer default.
export function sampleStackProfile(width:number,stiffness:number,liveCurl:number,baseAngle=0,nodes=33){
 const n=Math.max(2,Math.floor(nodes)),ds=width/(n-1),sweep=stackSweep(stiffness),positions=new Float64Array(n*2)
 for(let i=1;i<n;i++){const u=(i-.5)/(n-1),theta=baseAngle+liveCurl*sweep*stackBend(u,PRESS_STACK_PROFILE.stackCurlFrontPower)
 positions[2*i]=positions[2*i-2]+ds*Math.cos(theta);positions[2*i+1]=positions[2*i-1]+ds*Math.sin(theta)}
 return positions
}

// Source module 67291: offset curves at bottom/middle/top, with the local
// curvature limiter and arc-length compensation. The renderer's cover basis
// must be verified before enabling these profiles on the live static stacks.
export function offsetStackProfile(width:number,angle:(u:number)=>number,offset:number,nodes=49){
 const integration=192,ds=width/integration
 if(offset===0){
  const result=new Float64Array(nodes*2),x=new Float64Array(integration+1),z=new Float64Array(integration+1)
  for(let i=1;i<=integration;i++){const mid=angle((i-.5)/integration);x[i]=x[i-1]+ds*Math.cos(mid);z[i]=z[i-1]+ds*Math.sin(mid)}
  for(let i=0;i<nodes;i++){const k=i*integration/(nodes-1),lo=Math.min(integration-1,Math.floor(k)),t=k-lo;result[i*2]=x[lo]+(x[lo+1]-x[lo])*t;result[i*2+1]=z[lo]+(z[lo+1]-z[lo])*t}
  return result
 }
 const arc=new Float64Array(integration+1),x=new Float64Array(integration+1),z=new Float64Array(integration+1)
 let previous=angle(0),maxCurvature=0
 for(let i=1;i<=integration;i++){const next=angle(i/integration);maxCurvature=Math.max(maxCurvature,offset*(next-previous)/ds);previous=next}
 const safe=maxCurvature>.9?offset*.9/maxCurvature:offset,start=angle(0)
 x[0]=-Math.sin(start)*safe;z[0]=Math.cos(start)*safe
 let cx=0,cz=0
 for(let i=1;i<=integration;i++){const mid=angle((i-.5)/integration),end=angle(i/integration);cx+=ds*Math.cos(mid);cz+=ds*Math.sin(mid);x[i]=cx-Math.sin(end)*safe;z[i]=cz+Math.cos(end)*safe;arc[i]=i*ds-safe*(end-start)}
 const result=new Float64Array(nodes*2);let cursor=0;const end=angle(1)
 for(let i=0;i<nodes;i++){const distance=i/(nodes-1)*width;if(distance>=arc[integration]){const tail=distance-arc[integration];result[i*2]=x[integration]+tail*Math.cos(end);result[i*2+1]=z[integration]+tail*Math.sin(end);continue}while(cursor<integration-1&&arc[cursor+1]<distance)cursor++;const t=(distance-arc[cursor])/Math.max(1e-12,arc[cursor+1]-arc[cursor]);result[i*2]=x[cursor]+(x[cursor+1]-x[cursor])*t;result[i*2+1]=z[cursor]+(z[cursor+1]-z[cursor])*t}
 return result
}
export function layeredStackProfile(width:number,stiffness:number,drop:number,open:number,thickness:number){
 const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x)}
 const amount=smooth(clamp(drop)*smooth(open)),sweep=stackSweep(stiffness)
 const angle=(u:number)=>-sweep*amount*stackBend(u,PRESS_STACK_PROFILE.stackCurlFrontPower)
 return [-thickness/2,0,thickness/2].map(offset=>offsetStackProfile(width,angle,offset))
}
