import {describe,it,expect} from 'vitest'
import {clampReadingView,initialReadingView,panLimits,rubber,springReading,zoomAround,touchPageAllowed,snapReadingView,pinchReading,fitReadingBounds} from '../src/core/readingCamera'
const b={width:800,height:600,left:-350,right:350,top:-220,bottom:220}
describe('阅读相机',()=>{
 it('投影适配保持完整书籍、居中且支持窄视口',()=>{for(const w of [390,800,1280]){const raw={width:w,height:650,left:-180,right:250,top:-100,bottom:150,pageWidth:215},v=fitReadingBounds(raw);expect(v.zoom).toBeGreaterThan(0);expect(v.bounds.left+v.bounds.right).toBeCloseTo(0);expect(v.bounds.top+v.bounds.bottom).toBeCloseTo(0);expect(v.bounds.right-v.bounds.left).toBeLessThanOrEqual(w*.96);expect(v.bounds.bottom-v.bounds.top).toBeLessThanOrEqual(650*.96);expect(v.bounds.pageWidth).toBeCloseTo(215*v.zoom)}})
 it('双指锚点、页边判定和单页吸附',()=>{const a=initialReadingView(),p=pinchReading(a,2,{x:100,y:50},{x:120,y:50},b);expect(p.zoom).toBe(2);expect(p.x).toBeCloseTo(-80);expect(p.y).toBeCloseTo(-50);expect(touchPageAllowed(b,{zoom:2,x:-300,y:0},1)).toBe(true);expect(touchPageAllowed(b,{zoom:2,x:0,y:0},1)).toBe(false);expect(snapReadingView({zoom:2,x:30,y:0},b).x).toBe(300);expect(snapReadingView({zoom:2,x:30,y:0},b,-1000).x).toBe(-300);expect(pinchReading(a,10,{x:0,y:0},{x:0,y:0},b).zoom).toBeGreaterThan(2)})
 it('缩放及平移边界',()=>{expect(clampReadingView({zoom:10,x:1e4,y:-1e4},b)).toEqual({zoom:2,x:300,y:-140});expect(clampReadingView({zoom:0,x:80,y:80},b)).toEqual({zoom:.5,x:0,y:0});expect(panLimits(b,1)).toEqual({minX:0,maxX:0,minY:0,maxY:0})})
 it('放大保持指针锚点',()=>{const a=initialReadingView(),z=zoomAround(a,2,150,90,b);expect(150*2+z.x).toBeCloseTo(150);expect(90*2+z.y).toBeCloseTo(90)})
 it('弹簧收敛、橡皮筋有限',()=>{const a={zoom:2,x:500,y:200},v={zoom:0,x:0,y:0},target=initialReadingView();let done=false;for(let i=0;i<240&&!done;i++)done=springReading(a,v,target,1/60);expect(done).toBe(true);expect(a).toEqual(target);expect(rubber(1000,-10,10,800)).toBeLessThan(1000)})
})

it('短视口自动避开不对称工具栏占用的真实安全区',()=>{
 const raw={width:720,height:360,left:-200,right:200,top:-130,bottom:130},chrome={top:58,bottom:100},f=fitReadingBounds(raw,12,48,chrome)
 expect(f.bounds.top+raw.height/2).toBeGreaterThanOrEqual(chrome.top)
 expect(f.bounds.bottom+raw.height/2).toBeLessThanOrEqual(raw.height-chrome.bottom)
 expect((f.bounds.top+f.bounds.bottom)/2).toBeCloseTo(-21)
})

it('放大与缩小后的纵向平移边界仍避让工具栏',()=>{const f=fitReadingBounds({width:800,height:500,left:-350,right:350,top:-220,bottom:220},12,48,{top:45,bottom:90}),b=f.bounds;const z=2,p=panLimits(b,z);expect(b.bottom*z+p.minY).toBeCloseTo(250-90);expect(b.top*z+p.maxY).toBeCloseTo(-250+45);const small=clampReadingView({zoom:.5,x:0,y:999},b);expect((b.top+b.bottom)*.5/2+small.y).toBeCloseTo((45-90)/2)})

 it('不对称安全区复位精确归零，消除浮点残差',()=>{for(const h of [360,501,800]){const f=fitReadingBounds({width:721,height:h,left:-189.123,right:195.267,top:-145.123,bottom:122.987},12,48,{top:47.123,bottom:89.456});expect(clampReadingView({zoom:1,x:0,y:0},f.bounds)).toEqual({zoom:1,x:0,y:0})}})
