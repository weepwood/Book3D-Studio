import {test,expect} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'

test('高DPI预览切换、模型重建、导出与图形上下文恢复保持档位',async({browser},info)=>{
 test.setTimeout(90000)
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2,reducedMotion:'reduce'})
 try{
  const page=await context.newPage(),errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{if(!localStorage.getItem('book3d.config'))localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,paperPhysics:'material',thicknessMode:'automatic'}))})
  await page.goto('http://127.0.0.1:4173/?perf=1&renderProfile=balanced&stockDepthWarm=1')
  const host=page.locator('.canvas-host'),canvas=host.locator('canvas')
  const dims=()=>canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:devicePixelRatio}))
  const verify=async(scale:number)=>{await expect.poll(async()=>{const d=await dims();return d.width===Math.floor(d.cssWidth*Math.min(d.dpr,2)*scale)&&d.height===Math.floor(d.cssHeight*Math.min(d.dpr,2)*scale)}).toBe(true);return dims()}
  await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
  await expect(host).toHaveAttribute('data-reading-warm','submitted',{timeout:30000})
  const initial=await verify(.75)
  await page.locator('.left').getByRole('button',{name:/场景/}).click()
  const select=page.getByRole('combobox',{name:'渲染质量'})
  await select.click();await page.getByRole('option',{name:'经济 · 50%'}).click()
  const economy=await verify(.5)
  await page.setViewportSize({width:1440,height:650});await expect.poll(async()=>(await dims()).cssHeight).not.toBe(economy.cssHeight)
  const resized=await verify(.5)
  await page.getByRole('button',{name:'下一页',exact:true}).click()
  await expect(host).toHaveAttribute('data-page-index','11')
  await page.locator('.left').getByRole('button',{name:/模型/}).click()
  const width=page.getByRole('spinbutton',{name:'宽度 数值'})
  await width.fill('170');await width.press('Enter')
  await expect(host).toHaveAttribute('data-page-ready','true')
  await expect(host).toHaveAttribute('data-reading-warm','submitted',{timeout:30000})
  const rebuilt=await verify(.5)
  const [png]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'保存 PNG'}).click()])
  const file=info.outputPath('hidpi.png');await png.saveAs(file)
  const bytes=await readFile(file),exportSize=[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]
  expect(exportSize).toEqual([rebuilt.cssWidth*2,rebuilt.cssHeight*2])
  await verify(.5)
  const cdp=await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:650,deviceScaleFactor:1.25,mobile:false})
  await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBe(1.25)
  // CDP can change the simulated DPR without firing a native monitor/resize
  // event. A real user command must also revalidate the backing ratio.
  await page.getByRole('button',{name:'下一页',exact:true}).click()
  await expect(host).toHaveAttribute('data-page-index','12')
  const changedDpr=await verify(.5)
  expect(changedDpr.width).not.toBe(rebuilt.width)
  await canvas.evaluate((c:HTMLCanvasElement)=>{const ext=c.getContext('webgl2')?.getExtension('WEBGL_lose_context');if(!ext)throw Error('WEBGL_lose_context unavailable');c.dataset.old='1';ext.loseContext();setTimeout(()=>ext.restoreContext(),1500)})
  await expect(page.getByRole('alert')).toContainText('图形上下文暂时丢失')
  await expect(page.getByRole('alert')).toHaveCount(0,{timeout:30000})
  await expect(host.locator('canvas[data-old]')).toHaveCount(0)
  await expect(canvas).toHaveCount(1)
  await expect(host).toHaveAttribute('data-page-index','12')
  const restored=await verify(.5)
  await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(host).toHaveAttribute('data-page-index','13')
  expect(errors).toEqual([])
  await writeFile(info.outputPath('high-dpi-lifecycle.json'),JSON.stringify({initial,economy,resized,rebuilt,exportSize,changedDpr,restored,index:13,errors},null,2))
 }finally{await context.close()}
})
