import {expect,it} from 'vitest'
import type {BufferAttribute} from 'three'
import {createChunkGeometry,createStackGeometry,surfaceChain,boundLayer,bindingCompression,turningChain} from '../src/core/stackGeometry'
import {sampleChain} from '../src/core/pageChain'
it('厚块地板约束平移整个材料截面，而非压扁纸芯',()=>{
 const shape=createChunkGeometry(2,3),chain=surfaceChain(2,0)
 shape.pose(chain,.2,undefined,undefined,0,undefined,.02)
 const bounds=shape.g.boundingBox!
 expect(bounds.min.z).toBeCloseTo(.02,6);expect(bounds.max.z).toBeCloseTo(.22,6)
 shape.pose(chain,.2,undefined,undefined,0,undefined,.02,()=>.15)
 expect(bounds.min.z).toBeCloseTo(.15,6);expect(bounds.max.z).toBeCloseTo(.35,6)
 shape.g.dispose();shape.handoff.dispose()
})
it('静态书芯列采样与逐顶点 Hermite 基准一致，纸边 UV 仅必要时上传',()=>{
 for(const sign of [1,-1] as const){
 const w=1.47,d=.27,c=bindingCompression(1,.7,w,d),layers=[0,.25,.5,.75,1].map(q=>boundLayer(w,d*q,c)),shape=createStackGeometry(w,2,4)
 const p=shape.g.getAttribute('position'),original=Float32Array.from(p.array),uv=shape.g.getAttribute('uv') as BufferAttribute
 shape.pose(layers,d,sign,c,.001);const revision=uv.version
 for(let i=0;i<p.count;i++){const x=original[i*3],z=original[i*3+2],q=(sign===1?z+.5:.5-z)*4,lo=Math.min(3,Math.floor(q)),f=q-lo,a=sampleChain(layers[lo],x/w+.5),b=sampleChain(layers[lo+1],x/w+.5)
 expect(p.getX(i)).toBeCloseTo(a.x+(b.x-a.x)*f-w/2,6)
 expect(p.getZ(i)).toBeCloseTo(z*d+sign*(a.z+(b.z-a.z)*f-d*c*q/4),6)}
 shape.pose(layers,d,sign,c,.001);expect(uv.version).toBe(revision);shape.pose(layers,d,sign,c,.002);expect(uv.version).toBeGreaterThan(revision);shape.g.dispose()
 }
})
it('厚块缓存曲线采样保留逐顶点坐标，包括极端尺寸及行扭曲',()=>{
 const w=.86,h=3.12,d=.4,c=bindingCompression(1,.7,w,d),r=boundLayer(w,d,c),l=boundLayer(w,d,c,-1)
 const shape=createChunkGeometry(w,h),p=shape.g.getAttribute('position'),original=Float32Array.from(p.array),rows=Array.from({length:13},(_,i)=>turningChain(w,.2+i/100,.7,r,l))
 shape.pose(rows[0],d,u=>rows[Math.round(u*12)])
 for(let i=0;i<p.count;i++){const y=original[i*3+1],row=Math.round((y/h+.5)*12),u=original[i*3]/w+.5,a=sampleChain(rows[Math.max(0,Math.min(12,row))],u),off=original[i*3+2]*d
 expect(p.getX(i)).toBeCloseTo(a.x-a.tz*off,6);expect(p.getZ(i)).toBeCloseTo(a.z+a.tx*off,6)}
 shape.g.dispose();shape.handoff.dispose()
})
