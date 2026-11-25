import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('实际翻页网格的实体包含和自碰撞诊断',async({page},info)=>{
 await page.goto('/?meshCollision=6');const host=page.locator('.canvas-host');await expect(host.locator('canvas')).toBeVisible();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await host.evaluate(el=>{const reports:unknown[]=[];Object.assign(window,{solidReports:reports});new MutationObserver(()=>{const v=el.getAttribute('data-solid-collision');if(v)reports.push(JSON.parse(v))}).observe(el,{attributes:true,attributeFilter:['data-solid-collision']})});await page.locator('.left').getByRole('button',{name:/内页/}).click();await page.getByRole('button',{name:'展开阅读'}).click();await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000});await page.locator('.viewport-bottom').getByRole('button',{name:'下一页'}).click();await expect(host).toHaveAttribute('data-page-index','1',{timeout:30000});const reports=await page.evaluate(()=>(window as unknown as {solidReports:{self:{tested:number;penetration:number;coplanar:number;complete:boolean}[];containment:{status:string;tested:number;inside:number;uncertain:number;complete:boolean}[]}[]}).solidReports);expect(reports.length).toBeGreaterThan(1);expect(reports.some(r=>r.self.length>0)).toBe(true);expect(reports.flatMap(r=>r.containment).some(r=>r.tested>0)).toBe(true);expect(reports.flatMap(r=>r.self).every(r=>r.tested<=2048)).toBe(true);expect(errors).toEqual([]);await writeFile(info.outputPath('solid-contact.json'),JSON.stringify(reports,null,2))
})

test('固定开合角度下后封面与书芯内部顶点回归',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?meshCollision=6');const host=page.locator('.canvas-host');await expect(host.locator('canvas')).toBeVisible()
 const report=[] as unknown[]
 for(const angle of [35,70,100,130,160]){
  const input=page.getByRole('spinbutton',{name:'封面开合 数值'});await input.fill(String(angle));await input.press('Enter')
  await expect.poll(async()=>JSON.parse((await host.getAttribute('data-solid-collision'))??'{}').opening).toBe(angle)
  const sample=JSON.parse((await host.getAttribute('data-solid-collision'))!);const pair=sample.containment.filter((p:{outer:string;inner:string})=>[p.outer,p.inner].includes('Back cover')&&[p.outer,p.inner].includes('Unread page block'));expect(pair.length).toBe(2);expect(pair.every((p:{inside:number;tested:number})=>p.tested>0&&p.inside===0)).toBe(true);report.push(sample)
 }
 await writeFile(info.outputPath('rear-cover-fixed-poses.json'),JSON.stringify(report,null,2))
})
