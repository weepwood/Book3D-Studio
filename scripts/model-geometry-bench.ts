import {createStackGeometry,createChunkGeometry,boundLayer,bindingCompression,turningChain,chunkRowProgress,stackHeightSampler} from '../src/core/stackGeometry'
import {performance} from 'node:perf_hooks'
const w=1.47,h=2,depth=.27,c=bindingCompression(1,.7,w,depth),layers=[0,.25,.5,.75,1].map(f=>boundLayer(w,depth*f,c)),r=layers[4],l=boundLayer(w,depth,c,-1)
const stack=createStackGeometry(w,h,4),chunk=createChunkGeometry(w,h)
function run(name:string,fn:(i:number)=>void){for(let i=0;i<100;i++)fn(i);const a=[];for(let n=0;n<5;n++){const t=performance.now();for(let i=0;i<300;i++)fn(i);a.push((performance.now()-t)/300)}a.sort((x,y)=>x-y);return {name,ms:a}}
const clearance=stackHeightSampler(r,0,-.1,1)
console.log(JSON.stringify([run('stack',i=>stack.pose(layers,depth,1,c,.001)),run('chunk',i=>{const p=.1+(i%80)/100;chunk.pose(turningChain(w,p,.7,r,l),depth,undefined,undefined,0,undefined,-.2,clearance,.001)}),run('gesture-chunk',i=>{const p=.1+(i%35)/100;chunk.pose(turningChain(w,p,.7,r,l),depth,u=>turningChain(w,chunkRowProgress(p,u,1,.5),.7,r,l),undefined,0,undefined,-.2,clearance,.001)})],null,2))
