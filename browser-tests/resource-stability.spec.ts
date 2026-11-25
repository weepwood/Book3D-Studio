import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('2000页真实循环阅读的渲染器对象数量与缓存预算',async({page},info)=>{
 test.setTimeout(180000)
 const hardware=process.env.BOOK3D_HARDWARE_GPU==='1',cycles=hardware?4:1
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text())})
 await page.goto('/?perf=1');const host=page.locator('.canvas-host')
 await expect(host.locator('canvas')).toBeVisible({timeout:15000})
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'stress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,thicknessMode:'automatic',paperPhysics:'material',paperThickness:.1,pageCount:2000,pageIndex:50,pageDuration:.3}))})
 await page.getByRole('button',{name:'打开书籍',exact:true}).click();await expect(host).toHaveAttribute('data-page-ready','true',{timeout:25000})
 await page.locator('.left').getByRole('button',{name:/内页/}).click()
 const jump=page.getByRole('spinbutton',{name:'目标跨页 数值'}),cdp=await page.context().newCDPSession(page)
 await cdp.send('Performance.enable')
 const checkpoints=[]
 for(let cycle=0;cycle<cycles;cycle++){
  for(const index of [51,240,241,500,501,499,100,50]){
   await jump.fill(String(index));await jump.press('Enter');await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:20000});await expect(host).toHaveAttribute('data-page-turn','idle')
   const cache=JSON.parse((await host.getAttribute('data-texture-cache'))!)
   expect(cache.size).toBeLessThanOrEqual(cache.capacity);expect(cache.estimatedBytes).toBeLessThanOrEqual(cache.budgetBytes)
  }
  // Give bounded idle texture work a chance to finish; sample retained heap
  // after explicit GC only at the repeatable cycle boundary.
  await page.waitForTimeout(250)
  await cdp.send('HeapProfiler.collectGarbage')
  const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
  const resources=JSON.parse((await host.getAttribute('data-render-resources'))!)
  const geometry=JSON.parse((await host.getAttribute('data-geometry-metrics'))!)
  const cache=JSON.parse((await host.getAttribute('data-texture-cache'))!)
  expect(geometry.chainCacheSize).toBeLessThanOrEqual(128)
  expect(Object.values(resources).every(Number.isFinite)).toBe(true)
  checkpoints.push({cycle:cycle+1,resources,geometry,cache,heapBytes:metrics.JSHeapUsedSize})
 }
 // Compare identical settled workload endpoints, not early allocation growth.
 if(checkpoints.length>1){const first=checkpoints[0].resources;for(const c of checkpoints.slice(1)){expect(c.resources.geometries).toBeLessThanOrEqual(first.geometries+2);expect(c.resources.textures).toBeLessThanOrEqual(first.textures+4);expect(c.resources.programs).toBeLessThanOrEqual(first.programs+2)}}
 expect(errors).toEqual([])
 await writeFile(info.outputPath('resource-stability.json'),JSON.stringify({cycles,navigations:cycles*8,checkpoints,perf:JSON.parse((await host.getAttribute('data-perf'))!),renderer:await host.getAttribute('data-perf-renderer')},null,2))
 await page.screenshot({path:info.outputPath('resource-stability.png')})
})
