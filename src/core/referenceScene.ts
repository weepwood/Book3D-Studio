import {clamp} from './pagePhysics'
// Observed in module 50016 (12s2cqzsl56ip.js).
export const PRESS_SCENE={
 coverMs:980,closeMs:1880,openDelayMs:650,pageMs:900,fitFraction:.96,spreadSlack:1.1,zoomMin:.5,zoomMax:2,zoomRubber:.35,panRubber:.28,snapLookahead:.18,readSpringStiffness:140,readSpringDamping:.75,brakeMs:400,brakeLockMs:200,brakeMinAngle:.25,edgeTolerancePx:6,readDragSlopPx:8,paper:{shininess:12.5,reflectivity:.39,specular:[.59,.63,.62],bumpScale:.0505,shadowGrain:.116,bounceScale:.29,bounceIntensity:.39,bounceVariation:1.87,bounceColor:[.6,.52,.69],creaseBand:.14,creaseCore:.045,shadowBlurMul:.6,shadowPasses:2,edgeBand:.006,edgeBright:1.4,edgeDark:.7},
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
export function groupCount(available:number,depthFromTop:number){return Math.max(1,Math.min(available,1+Math.floor(clamp(depthFromTop)*Math.max(0,available-1))))}

// Original chunk release: exponential attraction with a minimum .9 progress/s.
export function chunkRelease(progress:number,goal:number,dt:number){const delta=goal-progress,step=Math.max(Math.abs(delta)*(1-Math.exp(-7*dt)),.9*dt);return Math.abs(delta)<=step?goal:progress+Math.sign(delta)*step}
export function chunkDuration(count:number){return Math.min(1100,Math.max(700,700+45*Math.log2(Math.max(1,count))))}
export function chunkAutoProgress(elapsed:number,count:number){const t=clamp((elapsed-120)/chunkDuration(count));const eased=t*t*(3-2*t);return t>=1?1:t<=0?0:.5-Math.sin(Math.PI/6-Math.PI*eased/3)}

export function isBrakeable(progress:number){const a=clamp(progress)*Math.PI;return a>PRESS_SCENE.brakeMinAngle&&a<Math.PI-PRESS_SCENE.brakeMinAngle}

// Source screenshot stable open: fore-edge at the bottom is visible and the
// spread is trapezoidal. Our original independent XY cover needs more tilt
// than its former -10 degree reading pose; not an original model-space angle.
export const READING_POSE_ADAPTER={pitchOffset:-40,yawOffset:28} as const
