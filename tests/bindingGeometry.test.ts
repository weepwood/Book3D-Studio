import {describe,it,expect} from 'vitest'
import {bindingSection,createBindingGeometry,type BindingPose} from '../src/core/bindingGeometry'
const pose=(angle:number,rounded=true):BindingPose=>({hingeX:-.75,rearZ:-.14,frontZ:.14*(1-2*Math.min(1,Math.max(0,(-angle*180/Math.PI-85)/95))),angle,board:.02,inset:.025,rounded})
describe('独立内外书脊与封面接缝',()=>{
 it('闭合到展开过程中两端始终连接到封面内外表面',()=>{
  for(const degrees of [0,15,90,135,180])for(const rounded of [true,false])for(const inner of [true,false]){
   const p=pose(-degrees*Math.PI/180,rounded),lip=Math.min(p.inset*.65,p.board*1.2)*Math.min(1,degrees/180*4),face=(inner?-1:1)*p.board/2,a=bindingSection(p,0,inner),b=bindingSection(p,1,inner)
   expect(a.x).toBeCloseTo(p.hingeX+lip);expect(a.z).toBeCloseTo(p.rearZ-face)
   expect(b.x).toBeCloseTo(p.hingeX+lip*Math.cos(p.angle)+face*Math.sin(p.angle))
   expect(b.z).toBeCloseTo(p.frontZ-lip*Math.sin(p.angle)+face*Math.cos(p.angle))
  }
 })
 it('展开后装订条连接左右封面而非缩成同一个点',()=>{const p=pose(-Math.PI),a=bindingSection(p,0),b=bindingSection(p,1);expect(a.x-b.x).toBeGreaterThan(.02);expect(a.z).toBeCloseTo(b.z);const inner=bindingSection(p,.5,true),outer=bindingSection(p,.5);expect(inner.z-outer.z).toBeCloseTo(p.board)})
 it('圆脊与方脊都生成有限几何及完整 UV',()=>{for(const rounded of [true,false])for(const inner of [true,false]){const g=createBindingGeometry(2,inner);for(const a of [0,-Math.PI/2,-Math.PI]){g.pose(pose(a,rounded));for(const attr of ['position','normal','uv'])expect(Array.from(g.g.getAttribute(attr).array).every(Number.isFinite)).toBe(true);expect(g.g.boundingSphere!.radius).toBeGreaterThan(.9)}g.g.dispose()}})
})

 it('闭合书脊外表面不侵入纸芯，内外表面中心有真实间距',()=>{for(const rounded of [true,false]){const p=pose(0,rounded);for(let i=0;i<=100;i++)expect(bindingSection(p,i/100).x).toBeLessThanOrEqual(p.hingeX+1e-10);expect(bindingSection(p,.5,true).x-bindingSection(p,.5).x).toBeGreaterThan(p.board*.8)}})
