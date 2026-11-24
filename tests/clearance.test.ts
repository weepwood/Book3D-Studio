import {it,expect} from 'vitest'
import {safeHingeZ,overlappingSlabFloor} from '../src/core/clearance'
import {bookDimensions,openingPose} from '../src/core/geometry'
import {easeTurn,clamp01} from '../src/core/pages'
it('薄厚书、全部开合角度与不同书芯分配的保守截面不相交',()=>{
 for(const [width,height,depth,board,inset] of [[90,120,8,3,4],[150,220,32,2.5,2.5],[250,320,80,.8,1],[90,320,80,3,4]]){
 const d=bookDimensions(width,height,depth,board,inset),base=-d.coverZ+d.t/2
 for(const ratio of [0,.05,.5,.95,1])for(const coupling of [0,1])for(let deg=0;deg<=180;deg+=2){
 const pose=openingPose(deg,1,coupling),flatten=easeTurn(clamp01((deg-85)/95)),a=pose.hinge*(.65+.35*flatten)+pose.page*(1-flatten)*.15,nominal=d.coverZ*(1-2*flatten),left=d.pageDepth*ratio,right=d.pageDepth-left,lo=d.gutterInset,hi=lo+d.pageWidth
 const z=safeHingeZ(nominal,base,right,left,d.w,d.pageWidth,lo,d.t,pose.hinge,a)
 expect(Number.isFinite(z)).toBe(true);expect(z).toBeGreaterThanOrEqual(nominal);const floor=overlappingSlabFloor(pose.hinge,0,d.w,-d.t/2,d.t/2,lo,hi);expect(z+floor).toBeGreaterThanOrEqual(base+right-1e-9)
 if(left>0)expect(z+overlappingSlabFloor(a,lo,hi,-d.t/2-left,-d.t/2,lo,hi)).toBeGreaterThanOrEqual(base+right-1e-9)
 if(deg===0||deg===180)expect(z).toBeCloseTo(nominal)
 }
 }
})
