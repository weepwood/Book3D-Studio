import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('静止阴影复用不改变实际像素，翻页与模型编辑重新绘制阴影',async({browser},info)=>{
 test.setTimeout(180000)
 const results=[],images:string[]=[]
 for(const cache of [false,true]){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,paperPhysics:'material',thicknessMode:'automatic',pageDuration:.85})))
   await page.goto('/?perf=1&shadowCache='+(cache?1:0))
   const host=page.locator('.canvas-host'),canvas=host.locator('canvas')
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   await expect(host).toHaveAttribute('data-reading-warm','submitted',{timeout:30000})
   await page.waitForTimeout(400)
   const counters=async()=>JSON.parse((await host.getAttribute('data-shadow-cache'))!)
   const before=await counters()
   const b=(await canvas.boundingBox())!
   // Camera-only zoom must not modify the world-space shadow map.
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2)
   await page.mouse.wheel(0,-180)
   await expect.poll(async()=>Number(await host.getAttribute('data-read-zoom')),{timeout:15000}).toBeGreaterThan(1)
   await page.waitForTimeout(1200)
   const after=await counters(),perf=JSON.parse((await host.getAttribute('data-perf'))!)
   expect(after.passes+after.reuses).toBeGreaterThan(before.passes+before.reuses)
   if(cache)expect(after.reuses).toBeGreaterThan(before.reuses);else expect(after.reuses).toBe(0)
   await page.mouse.move(5,5);await page.waitForTimeout(400)
   // Compare actual settled canvas pixels across the two paths.
   const shot=await canvas.screenshot({path:info.outputPath(cache?'cached.png':'uncached.png')});images.push(shot.toString('base64'))
   const beforeTurn=await counters()
   await page.getByRole('button',{name:'下一页',exact:true}).click()
   await expect(host).toHaveAttribute('data-page-index','11',{timeout:30000});await expect(host).toHaveAttribute('data-page-turn','idle')
   const afterTurn=await counters();expect(afterTurn.passes).toBeGreaterThan(beforeTurn.passes)
   const beforeEdit=await counters()
   const width=page.getByRole('spinbutton',{name:'宽度 数值'});await width.fill('170');await width.press('Enter')
   await expect.poll(async()=>(await counters()).passes,{timeout:15000}).toBeGreaterThan(beforeEdit.passes)
   expect(errors).toEqual([])
   results.push({cache,before,after,afterTurn,beforeTurn,beforeEdit,afterEdit:await counters(),perf})
  }finally{await context.close()}
 }
 const page=await browser.newPage()
 try{
  await page.goto('http://127.0.0.1:4173/')
  const pixels=await page.evaluate(async images=>{
   const read=async(src:string)=>{const image=new Image();image.src='data:image/png;base64,'+src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d')!;g.drawImage(image,0,0);return {width:c.width,height:c.height,data:g.getImageData(0,0,c.width,c.height).data}}
   const a=await read(images[0]),b=await read(images[1]);if(a.width!==b.width||a.height!==b.height)throw Error('canvas dimensions differ')
   let total=0,max=0,changed=0;for(let i=0;i<a.data.length;i++){const delta=Math.abs(a.data[i]-b.data[i]);total+=delta;max=Math.max(max,delta);if(delta)changed++}
   return {width:a.width,height:a.height,mean:total/a.data.length,max,changed}
  },images)
  // Settled camera spring can differ at subpixel scale between renderers.
  // Keep an image-level bound, not a visually arbitrary pass condition.
  expect(pixels.mean).toBeLessThan(.25)
  await writeFile(info.outputPath('shadow-cache.json'),JSON.stringify({results,pixels},null,2))
 }finally{await page.close()}
})
