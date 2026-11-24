import {describe,it,expect} from 'vitest'
import {clampReadingView,initialReadingView,panLimits,rubber,springReading,zoomAround,touchPageAllowed,snapReadingView,pinchReading} from '../src/core/readingCamera'
const b={width:800,height:600,left:-350,right:350,top:-220,bottom:220}
describe('阅读相机',()=>{
 it('双指锚点、页边判定和单页吸附',()=>{const a=initialReadingView(),p=pinchReading(a,2,{x:100,y:50},{x:120,y:50},b);expect(p.zoom).toBe(2);expect(p.x).toBeCloseTo(-80);expect(p.y).toBeCloseTo(-50);expect(touchPageAllowed(b,{zoom:2,x:-300,y:0},1)).toBe(true);expect(touchPageAllowed(b,{zoom:2,x:0,y:0},1)).toBe(false);expect(snapReadingView({zoom:2,x:30,y:0},b).x).toBe(300);expect(snapReadingView({zoom:2,x:30,y:0},b,-1000).x).toBe(-300);expect(pinchReading(a,10,{x:0,y:0},{x:0,y:0},b).zoom).toBeGreaterThan(2)})
 it('缩放及平移边界',()=>{expect(clampReadingView({zoom:10,x:1e4,y:-1e4},b)).toEqual({zoom:2,x:300,y:-140});expect(clampReadingView({zoom:0,x:80,y:80},b)).toEqual({zoom:.5,x:0,y:0});expect(panLimits(b,1)).toEqual({minX:0,maxX:0,minY:0,maxY:0})})
 it('放大保持指针锚点',()=>{const a=initialReadingView(),z=zoomAround(a,2,150,90,b);expect(150*2+z.x).toBeCloseTo(150);expect(90*2+z.y).toBeCloseTo(90)})
 it('弹簧收敛、橡皮筋有限',()=>{const a={zoom:2,x:500,y:200},v={zoom:0,x:0,y:0},target=initialReadingView();let done=false;for(let i=0;i<240&&!done;i++)done=springReading(a,v,target,1/60);expect(done).toBe(true);expect(a).toEqual(target);expect(rubber(1000,-10,10,800)).toBeLessThan(1000)})
})
