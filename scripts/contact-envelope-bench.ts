import {createChunkGeometry,turningChain,boundLayer,bindingCompression,chunkEndpointWeight,stackHeightSampler,liftChunkChain} from '../src/core/stackGeometry'
import {measureSurface} from '../src/core/surfaceMetrics'
import {performance} from 'node:perf_hooks'
const cases=[{w:1.47,h:2.15,depth:.15},{w:.86,h:3.12,depth:.2},{w:2.45,h:1.12,depth:.05},{w:.86,h:3.12,depth:.65}]
const records=[]
for(const {w,h,depth} of cases){
 const c=bindingCompression(1,.7,w,depth*2),right=boundLayer(w,depth,c),left=boundLayer(w,depth,c,-1),shape=createChunkGeometry(w,h)
 const sampler=stackHeightSampler(right,0,-.08,1)
 for(const p of [...Array.from({length:39},(_,i)=>(i+1)/40),.0001,.001,.0025,.005,.01,.015,.02,.98,.985,.99,.995,.9975,.999,.9999]){
  const chain=liftChunkChain(turningChain(w,p,.72,right,left),.02,p,true),weight=chunkEndpointWeight(p),layers=[0,.5,1].map(q=>({chain:turningChain(w,p,.72,boundLayer(w,depth*q,c),boundLayer(w,depth*(1-q),c,-1)),x:0,z:(q-.5)*depth}))
  const capture=(elastic:boolean,independent=false,envelope=false)=>{
   const start=performance.now();shape.pose(chain,depth,undefined,layers,weight,undefined,-.08,sampler,.001,true,elastic,independent,envelope);const ms=performance.now()-start
   const metrics=[4,5].map(f=>measureSurface(shape.g,w,h,f)),position=shape.g.getAttribute('position');let minClearance=Infinity
   for(let k=0;k<position.count;k++)minClearance=Math.min(minClearance,position.getZ(k)-Math.max(-.08,sampler(position.getX(k))))
   return {ms,local:Math.max(...metrics.map(m=>m.maxAreaError)),compression:Math.max(...metrics.map(m=>m.maxCompression)),total:Math.max(...metrics.map(m=>Math.abs(m.areaRatio-1))),minClearance}
  }
  const before=capture(false),after=capture(true),layersOnly=capture(false,true),combined=capture(true,true),envelope=capture(false,false,true),envelopeCombined=capture(true,true,true)
  records.push({w,h,depth,p,before,after,layersOnly,combined,envelope,envelopeCombined})
 }
 shape.g.dispose();shape.handoff.dispose()
}
console.log(JSON.stringify(records,null,2))
