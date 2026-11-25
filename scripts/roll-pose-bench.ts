import {createGpuPage} from '../src/core/pageGpu'
import {boundLayer,turningChain,bindingCompression} from '../src/core/stackGeometry'
import {measureSurface} from '../src/core/surfaceMetrics'
const out=[]
for(const [w,h,d] of [[1.47,2.15,.15],[.86,3.12,.5],[2.45,1.12,.05]]){
 const c=bindingCompression(1,.7,w,d),r=boundLayer(w,d,c),l=boundLayer(w,d,c,-1),gpu=createGpuPage(w,h)
 for(const p of [.02,.1,.25,.4,.6,.75,.9,.98])for(const grip of [-1,0,1])for(const amount of [0,1.5,2.4])for(const boundRoot of [false,true]){
 const chain=turningChain(w,p,.72,r,l)
 gpu.update(p,.72,amount,grip,1,chain,-.08,boundRoot)
 const m=measureSurface(gpu.pickMesh().geometry,w,h)
 out.push({w,h,d,p,grip,amount,boundRoot,...m})
 }
 gpu.dispose()
}
console.log(JSON.stringify(out))
