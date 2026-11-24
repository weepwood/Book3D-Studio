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
