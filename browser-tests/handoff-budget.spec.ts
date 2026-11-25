import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('正常模式关闭昂贵候选拾取诊断，前后翻页保留端点并记录交接误差',async({page},info)=>{
 await page.goto('/?perf=1&handoff=1')
 const host=page.locator('.canvas-host')
 await expect(host.locator('canvas')).toBeVisible()
 await page.getByRole('button',{name:'打开书籍',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:20000})
 const next=page.locator('.viewport-bottom').getByRole('button',{name:'下一页',exact:true}),prev=page.locator('.viewport-bottom').getByRole('button',{name:'上一页',exact:true})
 for(const [button,index] of [[next,1],[next,2],[prev,1],[prev,0]] as const){
  await button.click();await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:20000});await expect(host).toHaveAttribute('data-page-turn','idle')
 }
 expect(await host.getAttribute('data-group-probe-passes')).toBeNull()
 const result=JSON.parse((await host.getAttribute('data-handoff'))!)
 expect(result.samples).toBe(4);expect(Number.isFinite(result.maxMm)).toBe(true);expect(result.maxMm).toBeLessThan(.01)
 const cache=JSON.parse((await host.getAttribute('data-texture-cache'))!)
 expect(cache.estimatedBytes).toBeLessThanOrEqual(cache.budgetBytes)
 await writeFile(info.outputPath('handoff-budget.json'),JSON.stringify({handoff:result,cache,perf:JSON.parse((await host.getAttribute('data-perf'))!)},null,2))
})
