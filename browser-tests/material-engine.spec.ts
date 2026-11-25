import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('材料预设、2000页双向翻动和缓存预算持续稳定',async({page},info)=>{
 test.setTimeout(120000)
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const hardware=process.env.BOOK3D_HARDWARE_GPU==='1'
 await page.goto('/?perf=1&curve=1'+(hardware?'&prewarm=1':''));const host=page.locator('.canvas-host')
 await expect(host.locator('canvas')).toBeVisible({timeout:15000})
 if(hardware)await expect(host).toHaveAttribute('data-shader-warm','submitted',{timeout:15000})
 const shaderMs=hardware?Number(await host.getAttribute('data-shader-warm-ms')):null
 const file=page.locator('input[type=file][accept=".json,application/json"]')
 await file.setInputFiles({name:'material.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,thicknessMode:'automatic',paperPhysics:'material',paperThickness:.1,pageCount:2000,pageIndex:50,pageDuration:.3}))})
 await expect(page.getByTestId('paper-material')).toBeVisible()
 await page.getByRole('button',{name:'薄型书纸',exact:true}).click()
 await expect(page.getByTestId('physical-thickness')).toContainText('65.00 mm')
 await page.getByRole('button',{name:'打开书籍',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:25000})
 await page.locator('.left').getByRole('button',{name:/内页/}).click()
 const jump=page.getByRole('spinbutton',{name:'目标跨页 数值'})
 const samples=[]
 for(const index of hardware?[51,52,53,60,240,241,240,100,99,500,501,499,800,801,799,50]:[51,240,241,50]){
  await jump.fill(String(index));await jump.press('Enter')
  await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:15000})
  await expect(host).toHaveAttribute('data-page-turn','idle')
  const cache=JSON.parse((await host.getAttribute('data-texture-cache'))!)
  expect(cache.size).toBeLessThanOrEqual(cache.capacity);expect(cache.estimatedBytes).toBeLessThanOrEqual(cache.budgetBytes)
  samples.push({index,cache,geometry:JSON.parse((await host.getAttribute('data-geometry-metrics'))!)})
 }
 await page.screenshot({path:info.outputPath('material-2000-pages.png')})
 const curve=JSON.parse((await host.getAttribute('data-curve-quality'))!);expect(curve.samples).toBeGreaterThan(0);expect(Object.values(curve).every(Number.isFinite)).toBe(true);expect(curve.maxRootError).toBeLessThan(1e-7);expect(curve.maxRelativeLengthError).toBeLessThan(.005)
 await writeFile(info.outputPath('material-engine.json'),JSON.stringify({shaderMs,samples,curve,perf:JSON.parse((await host.getAttribute('data-perf'))!),renderer:await host.getAttribute('data-perf-renderer')},null,2))
 expect(errors).toEqual([])
})
