import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import type {ContactReply} from '../src/core/contactWorkerProtocol'
test('Worker 独立完成实际翻页自碰撞检测并在重建时丢弃旧结果',async({page},info)=>{
 await page.goto('/?meshCollision=7');const host=page.locator('.canvas-host'),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await expect(host.locator('canvas')).toBeVisible()
 await host.evaluate(el=>{const reports:unknown[]=[];Object.assign(window,{workerReports:reports});new MutationObserver(()=>{const v=el.getAttribute('data-worker-collision');if(v)reports.push(JSON.parse(v))}).observe(el,{attributes:true,attributeFilter:['data-worker-collision']})})
 await page.locator('.left').getByRole('button',{name:/内页/}).click();await page.getByRole('button',{name:'展开阅读'}).click();await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 await page.locator('.viewport-bottom').getByRole('button',{name:'下一页'}).click();await expect(host).toHaveAttribute('data-page-index','1',{timeout:30000})
 const reports=()=>page.evaluate(()=>(window as unknown as {workerReports:ContactReply[]}).workerReports)
 await expect.poll(async()=>(await reports()).some(r=>'report' in r&&r.report.self.some(s=>s.complete&&s.tested>0)),{timeout:30000}).toBe(true)
 const before=await reports();expect(before.every(r=>'report' in r)).toBe(true);expect(errors).toEqual([])
 await page.locator('.left').getByRole('button',{name:/模型/}).click();const width=page.getByRole('spinbutton',{name:'宽度 数值'});await width.fill('160');await width.press('Enter')
 await expect.poll(()=>host.getAttribute('data-worker-collision')).toBeNull()
 await writeFile(info.outputPath('contact-worker.json'),JSON.stringify(before,null,2))
})
