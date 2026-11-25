import {it,expect} from 'vitest'
import {RenderBudget} from '../src/core/renderBudget'
it('requires sustained rendering pressure and restores idle quality',()=>{
 const b=new RenderBudget()
 b.observe(100,100,true);b.observe(3,16,true);expect(b.level).toBe(0)
 for(let i=0;i<3;i++)b.observe(30,40,true)
 expect(b.level).toBe(1);expect(b.scale).toBe(.75);expect(b.shadowSize(2048)).toBe(1024)
 for(let i=0;i<12;i++)b.observe(30,40,true)
 expect(b.level).toBe(2);expect(b.shadowSize(2048)).toBe(512)
 b.observe(3,16,false);expect(b.level).toBe(0);expect(b.shadowSize(2048)).toBe(2048)
})
it('recovers sustained fast motion gradually, never enlarges mobile shadow map',()=>{
 const b=new RenderBudget()
 for(let i=0;i<3;i++)b.observe(30,40,true)
 expect(b.shadowSize(512)).toBe(512)
 for(let i=0;i<45;i++)b.observe(2,16,true)
 expect(b.level).toBe(0)
})
it('only explicit known fixed profiles may lower rendering quality',async()=>{
 const {renderProfileLevel}=await import('../src/core/renderBudget')
 expect(renderProfileLevel('balanced')).toBe(1);expect(renderProfileLevel('economy')).toBe(2)
 for(const x of [null,'full','invalid','constructor','__proto__'])expect(renderProfileLevel(x)).toBe(0)
})
