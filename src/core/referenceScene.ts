import {clamp} from './pagePhysics'
// Observed in module 50016 (12s2cqzsl56ip.js).
export const PRESS_SCENE={
 coverMs:980,closeMs:1880,openDelayMs:650,pageMs:900,fitFraction:.96,spreadSlack:1.1,zoomMin:.5,zoomMax:2,brakeMs:400,
 browse:{ambientColor:0xffffff,ambientIntensity:.83,keyColor:0xb3aba2,keyIntensity:3.61,key:[-2.4,3.5,9.9],sunColor:0xaea7a7,sunIntensity:2.63,sun:[22.5,33.5,6.8],shadowHalf:62.1,near:.001,far:256.8,bias:-.00253,normalBias:.0165,radius:6},
 read:{ambientColor:8355194,ambientIntensity:1.4,keyColor:0xf9f6f0,keyIntensity:1.41,key:[9.4,4.6,4.3],sunColor:0xf5f7ff,sunIntensity:1.4,sun:[-15,-15,39.7],shadowHalf:51.9,near:.001,far:256.8,bias:-.00118,normalBias:.0401,radius:9.74},
 shadowMap:2048,mobileShadowMap:512,sourceWidth:15.6
} as const
export function coverProgress(from:number,to:number,elapsed:number){
 const duration=to>from?PRESS_SCENE.coverMs:PRESS_SCENE.closeMs
 const t=clamp(elapsed/duration),e=t*t*(3-2*t)
 return {angle:from+(to-from)*e,done:t>=1}
}
export function brakeRetention(elapsed:number){const t=clamp(elapsed/PRESS_SCENE.brakeMs);return {drive:1-t,damping:.035+(.5-.035)*t}}
export function groupCount(available:number,depthFromTop:number){return Math.max(1,Math.min(6,available,1+Math.floor(clamp(depthFromTop)*Math.max(0,available-1))))}
