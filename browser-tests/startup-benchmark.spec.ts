import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

// Fresh contexts isolate project state and HTTP caches, not the browser's
// shared GPU process or driver shader cache. Measure, never gate on wall time.
test('首帧及首次翻页多轮预热对照',async({browser},info)=>{
 const records=[]
 const repetitions=process.env.BOOK3D_HARDWARE_GPU==='1'?3:1
 for(let i=0;i<repetitions;i++)for(const warm of (i%2?[true,false]:[false,true])){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.goto('/?perf=1'+(warm?'&prewarm=1':''))
   const host=page.locator('.canvas-host')
   await expect(host).toHaveAttribute('data-startup',/./,{timeout:20000})
   const startup=JSON.parse((await host.getAttribute('data-startup'))!)
   expect(Object.values(startup).every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)).toBe(true)
   if(warm)await expect(host).toHaveAttribute('data-shader-warm','submitted',{timeout:15000})
   const warmMs=warm?Number(await host.getAttribute('data-shader-warm-ms')):null
   const open=Date.now()
   await page.getByRole('button',{name:'打开书籍',exact:true}).click()
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   const openMs=Date.now()-open
   const flip=Date.now()
   await page.locator('.viewport-bottom').getByRole('button',{name:'下一页'}).click()
   await expect(host).toHaveAttribute('data-page-index','1',{timeout:30000})
   await expect(host).toHaveAttribute('data-page-turn','idle')
   const flipMs=Date.now()-flip
   expect(errors).toEqual([])
   records.push({round:i,warm,startup,warmMs,openMs,flipMs,renderer:await host.getAttribute('data-perf-renderer'),perf:JSON.parse((await host.getAttribute('data-perf'))!)})
  }finally{await context.close()}
 }
 await writeFile(info.outputPath('startup-benchmark.json'),JSON.stringify(records,null,2))
})
